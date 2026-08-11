using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using InsiderThreat.Shared;
using System.Security.Claims;
using System.Collections.Concurrent;

namespace InsiderThreat.Server.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class AttendanceController : ControllerBase
{
    private readonly IMongoCollection<AttendanceLog> _attendanceCollection;
    private readonly IMongoCollection<AttendanceConfig> _configCollection;
    private readonly IMongoCollection<User> _usersCollection;
    private readonly IMongoCollection<LogEntry> _logsCollection;
    private readonly ILogger<AttendanceController> _logger;

    // Nonce store to prevent replay attacks (in production, use Redis/DB)
    private static readonly ConcurrentDictionary<string, DateTime> _usedNonces = new();

    public AttendanceController(IMongoDatabase database, ILogger<AttendanceController> logger)
    {
        _attendanceCollection = database.GetCollection<AttendanceLog>("AttendanceLogs");
        _configCollection = database.GetCollection<AttendanceConfig>("AttendanceConfig");
        _usersCollection = database.GetCollection<User>("Users");
        _logsCollection = database.GetCollection<LogEntry>("Logs");
        _logger = logger;
    }

    // =============================================
    // DTO for Face Check-in Request
    // =============================================
    public class FaceCheckInRequest
    {
        public double[] Descriptor { get; set; } = Array.Empty<double>();
        public string Nonce { get; set; } = string.Empty; // One-time use token
        public long Timestamp { get; set; } // Unix timestamp ms
        public bool LivenessVerified { get; set; } // Whether liveness challenge was passed
    }

    // =============================================
    // POST: api/attendance/face-checkin (Zero Trust)
    // Frontend sends face embedding → Server verifies against DB
    // =============================================
    [HttpPost("face-checkin")]
    public async Task<IActionResult> FaceCheckIn([FromBody] FaceCheckInRequest request)
    {
        var currentIp = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "Unknown";
        if (currentIp == "::1") currentIp = "127.0.0.1";

        // 1. Validate Nonce (prevent replay attacks)
        if (string.IsNullOrEmpty(request.Nonce))
        {
            return BadRequest(new { Message = "Nonce is required" });
        }

        // Check if nonce was already used
        if (_usedNonces.ContainsKey(request.Nonce))
        {
            _logger.LogWarning("🚨 REPLAY ATTACK DETECTED! Nonce: {Nonce}, IP: {IP}", request.Nonce, currentIp);
            await LogSecurityEvent("ReplayAttack", $"Replay attack detected. Reused nonce: {request.Nonce}", currentIp);
            return BadRequest(new { Message = "Invalid or expired nonce (possible replay attack)" });
        }

        // Check timestamp freshness (must be within 30 seconds)
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (Math.Abs(now - request.Timestamp) > 30_000)
        {
            _logger.LogWarning("🚨 STALE REQUEST! Timestamp diff: {Diff}ms, IP: {IP}", Math.Abs(now - request.Timestamp), currentIp);
            return BadRequest(new { Message = "Request expired (timestamp too old)" });
        }

        // Store nonce as used
        _usedNonces.TryAdd(request.Nonce, DateTime.UtcNow);

        // 2. Validate descriptor
        if (request.Descriptor == null || request.Descriptor.Length < 64)
        {
            return BadRequest(new { Message = "Invalid face descriptor" });
        }

        // 3. Get current user from JWT
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var userName = User.FindFirst(ClaimTypes.Name)?.Value;
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized(new { Message = "User not authenticated" });
        }

        // 4. Get user's stored face embeddings from DB
        var user = await _usersCollection.Find(u => u.Id == userId).FirstOrDefaultAsync();
        if (user == null)
        {
            return NotFound(new { Message = "User not found" });
        }

        if (user.FaceEmbeddings == null || user.FaceEmbeddings.Length == 0)
        {
            return BadRequest(new { Message = "User has not registered Face ID. Please register first." });
        }

        // 5. Server-side face matching using Euclidean Distance
        var distance = EuclideanDistance(request.Descriptor, user.FaceEmbeddings);
        double threshold = 0.5; // Strict threshold

        _logger.LogInformation(
            "Face check-in attempt: User={User}, Distance={Distance:F4}, Threshold={Threshold}, IP={IP}",
            userName, distance, threshold, currentIp);

        if (distance >= threshold)
        {
            // Face does NOT match
            _logger.LogWarning(
                "🚨 FACE MISMATCH! User={User}, Distance={Distance:F4}, IP={IP}",
                userName, distance, currentIp);

            await LogSecurityEvent(
                "FaceCheckInFailed",
                $"Face mismatch for user {userName}. Distance: {distance:F4} (threshold: {threshold}). Possible impersonation attempt.",
                currentIp);

            return Unauthorized(new { Message = "Face does not match. Check-in denied.", Distance = distance });
        }

        // 6. Check if time is abnormally fast (possible script injection)
        // If liveness is not verified, log a warning
        if (!request.LivenessVerified)
        {
            _logger.LogWarning("⚠️ Liveness NOT verified for user {User}. Check-in still allowed but flagged.", userName);
        }

        // 7. Create attendance log with full audit trail
        var attendanceLog = new AttendanceLog
        {
            UserId = userId,
            UserName = user.FullName,
            CheckInTime = DateTime.Now,
            Method = "FaceID",
            MatchConfidence = distance,
            IpAddress = currentIp,
            LivenessVerified = request.LivenessVerified
        };

        await _attendanceCollection.InsertOneAsync(attendanceLog);

        _logger.LogInformation(
            "✅ Face check-in SUCCESS: User={User}, Distance={Distance:F4}, Liveness={Liveness}, IP={IP}",
            userName, distance, request.LivenessVerified, currentIp);

        return Ok(new
        {
            Message = "Check-in successful",
            Time = attendanceLog.CheckInTime,
            MatchConfidence = distance,
            LivenessVerified = request.LivenessVerified
        });
    }

    // POST: api/attendance/checkin (legacy - kept for backward compatibility)
    [HttpPost("checkin")]
    public async Task<IActionResult> CheckIn([FromBody] AttendanceLog log)
    {
        log.Id = null; // Ensure new ID
        log.CheckInTime = DateTime.Now;

        // If UserId is not provided, try to get from claims (logged in user)
        if (string.IsNullOrEmpty(log.UserId))
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var userName = User.FindFirst(ClaimTypes.Name)?.Value;

            if (userId != null)
            {
                log.UserId = userId;
                log.UserName = userName ?? "Unknown";
            }
        }

        log.IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "Unknown";

        await _attendanceCollection.InsertOneAsync(log);

        return Ok(new { Message = "Check-in successful", Time = log.CheckInTime });
    }

    // GET: api/attendance/summary
    [HttpGet("summary")]
    public async Task<IActionResult> GetMonthlySummary([FromQuery] int month, [FromQuery] int year)
    {
        var role = User.FindFirst(ClaimTypes.Role)?.Value;
        if (role != "Admin" && role != "Manager" && role != "Giám đốc" && role != "Giam doc") 
            return Forbid();

        var startDate = new DateTime(year, month, 1);
        var endDate = startDate.AddMonths(1).AddSeconds(-1);

        // Fetch all logs for the month
        var logs = await _attendanceCollection.Find(l => l.CheckInTime >= startDate && l.CheckInTime <= endDate).ToListAsync();

        // Get all users
        var users = await _usersCollection.Find(_ => true).Project(u => new { u.Id, u.FullName, u.Department }).ToListAsync();

        var summary = users.Select(user => {
            var userLogs = logs.Where(l => l.UserId == user.Id).ToList();
            
            // Group by Day
            var logsByDay = userLogs.GroupBy(l => l.CheckInTime.Date)
                .ToDictionary(g => g.Key, g => g.OrderBy(l => l.CheckInTime).First());

            int onTimeDays = 0;
            int lateDays = 0;
            int totalWorkingDays = GetWorkingDays(startDate, endDate);
            
            foreach (var kvp in logsByDay)
            {
                // Check if late (e.g., after 9:15 AM)
                if (kvp.Value.CheckInTime.TimeOfDay > new TimeSpan(9, 15, 0))
                {
                    lateDays++;
                }
                else
                {
                    onTimeDays++;
                }
            }

            int absentDays = totalWorkingDays - (onTimeDays + lateDays);
            if (absentDays < 0) absentDays = 0;

            return new {
                UserId = user.Id,
                UserName = user.FullName,
                Department = user.Department,
                TotalWorkingDays = totalWorkingDays,
                OnTimeDays = onTimeDays,
                LateDays = lateDays,
                AbsentDays = absentDays,
                TotalCheckIns = logsByDay.Count
            };
        }).Where(s => s.TotalCheckIns > 0 || absentDaysCheck(s.TotalWorkingDays)).ToList();

        return Ok(summary);
    }

    private bool absentDaysCheck(int workingDays) => true; // Include all users
    
    private int GetWorkingDays(DateTime startDate, DateTime endDate)
    {
        int count = 0;
        for (DateTime i = startDate; i <= endDate; i = i.AddDays(1))
        {
            if (i.DayOfWeek != DayOfWeek.Saturday && i.DayOfWeek != DayOfWeek.Sunday)
                count++;
        }
        return count;
    }

    // GET: api/attendance/history
    [HttpGet("history")]
    public async Task<ActionResult<List<AttendanceLog>>> GetHistory()
    {
        var role = User.FindFirst(ClaimTypes.Role)?.Value;
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (role == "Admin")
        {
            // Admin sees all, sorted by new
            var logs = await _attendanceCollection.Find(_ => true)
                .SortByDescending(x => x.CheckInTime)
                .ToListAsync();
            return Ok(logs);
        }
        else
        {
            // User sees own
            if (userId == null) return Unauthorized();

            var logs = await _attendanceCollection.Find(x => x.UserId == userId)
                .SortByDescending(x => x.CheckInTime)
                .ToListAsync();
            return Ok(logs);
        }
    }

    // GET: api/attendance/config
    [HttpGet("config")]
    public async Task<IActionResult> GetConfig()
    {
        var role = User.FindFirst(ClaimTypes.Role)?.Value;
        if (role != "Admin") return Forbid();

        var config = await _configCollection.Find(c => c.ConfigType == "NetworkSettings").FirstOrDefaultAsync();
        if (config == null)
        {
            config = new AttendanceConfig { AllowedIPs = "" };
        }
        return Ok(config);
    }

    // POST: api/attendance/config
    [HttpPost("config")]
    public async Task<IActionResult> UpdateConfig([FromBody] AttendanceConfig newConfig)
    {
        var role = User.FindFirst(ClaimTypes.Role)?.Value;
        var userName = User.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown";
        if (role != "Admin") return Forbid();

        var filter = Builders<AttendanceConfig>.Filter.Eq(c => c.ConfigType, "NetworkSettings");
        var existing = await _configCollection.Find(filter).FirstOrDefaultAsync();

        if (existing == null)
        {
            newConfig.ConfigType = "NetworkSettings";
            newConfig.UpdatedAt = DateTime.Now;
            newConfig.UpdatedBy = userName;
            await _configCollection.InsertOneAsync(newConfig);
        }
        else
        {
            var update = Builders<AttendanceConfig>.Update
                .Set(c => c.AllowedIPs, newConfig.AllowedIPs)
                .Set(c => c.UpdatedAt, DateTime.Now)
                .Set(c => c.UpdatedBy, userName);
            await _configCollection.UpdateOneAsync(filter, update);
        }

        return Ok(new { Message = "Configuration updated successfully" });
    }

    // GET: api/attendance/can-checkin
    [HttpGet("can-checkin")]
    public async Task<IActionResult> CanCheckIn()
    {
        var currentIp = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "Unknown";

        // localhost checking (IPv6 ::1 mapped to 127.0.0.1 for local testing ease if needed, though RemoteIpAddress will show ::1 or 127.0.0.1)
        if (currentIp == "::1") currentIp = "127.0.0.1";

        var config = await _configCollection.Find(c => c.ConfigType == "NetworkSettings").FirstOrDefaultAsync();
        
        bool canCheckIn = true; // default true if no config restriction is set
        
        if (config != null && !string.IsNullOrWhiteSpace(config.AllowedIPs))
        {
            var allowedIps = config.AllowedIPs.Split(new[] { ',', ';', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries)
                                                .Select(ip => ip.Trim())
                                                .ToList();

            // Support prefix matching (e.g., "192.168.1." will match "192.168.1.25")
            if (!allowedIps.Any(ip => currentIp.StartsWith(ip)))
            {
                canCheckIn = false;
            }
        }

        return Ok(new { canCheckIn, currentIp, restrictionEnabled = config != null && !string.IsNullOrWhiteSpace(config.AllowedIPs) });
    }

    // GET: api/attendance/active-networks
    [HttpGet("active-networks")]
    public IActionResult GetActiveNetworks()
    {
        var role = User.FindFirst(ClaimTypes.Role)?.Value;
        if (role != "Admin") return Forbid();

        var networks = new List<object>();
        var currentIp = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "127.0.0.1";
        if (currentIp == "::1") currentIp = "127.0.0.1";

        string GetPrefix(string ip) => ip.Contains('.') ? ip.Substring(0, ip.LastIndexOf('.') + 1) : ip;

        networks.Add(new {
            Id = "client-ip",
            Name = "Mạng thiết bị của bạn",
            IpAddress = currentIp,
            Prefix = GetPrefix(currentIp)
        });

        try
        {
            var interfaces = System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces()
                .Where(n => n.OperationalStatus == System.Net.NetworkInformation.OperationalStatus.Up &&
                            n.NetworkInterfaceType != System.Net.NetworkInformation.NetworkInterfaceType.Loopback);

            foreach (var adapter in interfaces)
            {
                var ipProps = adapter.GetIPProperties();
                var ipv4 = ipProps.UnicastAddresses.FirstOrDefault(a => a.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork);
                if (ipv4 != null)
                {
                    networks.Add(new {
                        Id = adapter.Id,
                        Name = $"Mạng máy chủ ({adapter.Name})",
                        IpAddress = ipv4.Address.ToString(),
                        Prefix = GetPrefix(ipv4.Address.ToString())
                    });
                }
            }
        }
        catch (Exception) { }

        // Deduplicate by IP to avoid showing client IP and server IP twice if they are the same
        var uniqueNetworks = networks.GroupBy(n => ((dynamic)n).IpAddress).Select(g => g.First()).ToList();

        return Ok(uniqueNetworks);
    }

    // =============================================
    // Helper Methods
    // =============================================
    private static double EuclideanDistance(double[] a, double[] b)
    {
        if (a.Length != b.Length) return double.MaxValue;
        double sum = 0;
        for (int i = 0; i < a.Length; i++)
        {
            sum += Math.Pow(a[i] - b[i], 2);
        }
        return Math.Sqrt(sum);
    }

    private async Task LogSecurityEvent(string eventType, string message, string ip)
    {
        var log = new LogEntry
        {
            LogType = "Security",
            Severity = "Critical",
            Message = message,
            ComputerName = "WebClient",
            IPAddress = ip,
            ActionTaken = "Access Denied",
            Timestamp = DateTime.Now
        };
        await _logsCollection.InsertOneAsync(log);
    }

    /// <summary>
    /// Background cleanup: remove expired nonces older than 2 minutes
    /// Called periodically or lazily
    /// </summary>
    public static void CleanupExpiredNonces()
    {
        var cutoff = DateTime.UtcNow.AddMinutes(-2);
        var expired = _usedNonces.Where(kvp => kvp.Value < cutoff).Select(kvp => kvp.Key).ToList();
        foreach (var key in expired)
        {
            _usedNonces.TryRemove(key, out _);
        }
    }
}

