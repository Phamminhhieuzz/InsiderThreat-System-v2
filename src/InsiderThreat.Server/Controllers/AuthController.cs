using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using InsiderThreat.Shared;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authorization;
using InsiderThreat.Server.Services;

namespace InsiderThreat.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IMongoDatabase _database;
    private readonly IMongoCollection<LogEntry> _logsCollection;
    private readonly IMongoCollection<OtpToken> _otpTokens;
    private readonly IConfiguration _configuration;
    private readonly ILogger<AuthController> _logger;
    private readonly IEmailService _emailService;

    public AuthController(IMongoDatabase database, IConfiguration configuration, ILogger<AuthController> logger, IEmailService emailService)
    {
        _database = database;
        _logsCollection = database.GetCollection<LogEntry>("Logs");
        _otpTokens = database.GetCollection<OtpToken>("OtpTokens");
        _configuration = configuration;
        _logger = logger;
        _emailService = emailService;
    }

    // =============================================
    // DTO cho Request/Response
    // =============================================
    public class LoginRequest
    {
        public string Username { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public class LoginResponse
    {
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public string? Token { get; set; }
        public UserInfo? User { get; set; }
    }

    public class UserInfo
    {
        public string Id { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string Role { get; set; } = string.Empty;
        public string? AvatarUrl { get; set; }
    }

    // =============================================
    // POST /api/auth/login
    // =============================================
    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest request)
    {
        try
        {
            // 1. Tìm user trong database
            var usersCollection = _database.GetCollection<User>("Users");
            var user = await usersCollection
                .Find(u => u.Username == request.Username)
                .FirstOrDefaultAsync();

            // Nếu không tìm thấy user admin trong DB, tạo một object tạm thời để xử lý login fix cứng
            if (user == null && request.Username.ToLower() == "admin")
            {
                user = new User
                {
                    Id = "000000000000000000000001", // Fake ObjectId format
                    Username = "admin",
                    FullName = "Administrator",
                    Role = "Admin",
                    PasswordHash = "" 
                };
            }

            if (user == null)
            {
                return Unauthorized(new LoginResponse
                {
                    Success = false,
                    Message = "Tên đăng nhập không tồn tại"
                });
            }

            // 2. Kiểm tra mật khẩu (Fix cứng admin123 cho user admin)
            bool isPasswordCorrect = false;
            if (user.Username.ToLower() == "admin" && request.Password == "admin123")
            {
                isPasswordCorrect = true;
            }
            else
            {
                isPasswordCorrect = BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash);
            }

            if (!isPasswordCorrect)
            {
                return Unauthorized(new LoginResponse
                {
                    Success = false,
                    Message = "Mật khẩu không đúng"
                });
            }

            // 2.2. Kiểm tra xem có bắt buộc đổi mật khẩu không
            if (user.RequiresPasswordChange)
            {
                return Ok(new LoginResponse
                {
                    Success = false,
                    Message = "CHANGE_PASSWORD_REQUIRED",
                    User = new UserInfo
                    {
                        Id = user.Id ?? "",
                        Username = user.Username,
                        FullName = user.FullName,
                        Role = user.Role
                    }
                });
            }

            // 2.5. Safety-net: Nếu username là "admin" thì luôn đảm bảo role = "Admin"
            if (user.Username.ToLower() == "admin" && user.Role != "Admin")
            {
                _logger.LogWarning($"Admin user has incorrect role '{user.Role}' in DB. Auto-correcting to 'Admin'.");
                user.Role = "Admin";
                // Tự động sửa lại trong DB
                try
                {
                    var update = Builders<User>.Update.Set(u => u.Role, "Admin");
                    await usersCollection.UpdateOneAsync(u => u.Id == user.Id, update);
                    _logger.LogInformation("Admin role auto-corrected in database.");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to auto-correct admin role in DB");
                }
            }

            // 3. Tạo JWT Token
            string token = GenerateJwtToken(user);

            _logger.LogInformation($"User '{user.Username}' đăng nhập thành công");

            // Normalize role for response (same logic as GenerateJwtToken)
            string responseRole = (user.Role ?? "User").Trim();
            responseRole = responseRole.ToLower() switch
            {
                "admin" => "Admin",
                "giám đốc" => "Giám đốc",
                "giam doc" => "Giám đốc",
                "director" => "Giám đốc",
                "quản lý" => "Quản lý",
                "nhân viên" => "Nhân viên",
                _ => responseRole
            };

            return Ok(new LoginResponse
            {
                Success = true,
                Message = "Đăng nhập thành công",
                Token = token,
                User = new UserInfo
                {
                    Id = user.Id ?? "",
                    Username = user.Username,
                    FullName = user.FullName,
                    Role = responseRole,
                    AvatarUrl = user.AvatarUrl
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi khi đăng nhập");
            return StatusCode(500, new LoginResponse
            {
                Success = false,
                Message = "Lỗi hệ thống: " + ex.Message
            });
        }
    }

    public class FaceLoginRequest
    {
        public double[] Descriptor { get; set; } = null!;
        public long Timestamp { get; set; } // Unix timestamp (ms)
        public string? MachineId { get; set; } // HWID from Agent
        public string? LivenessToken { get; set; } // Token from frontend challenge
    }

    [HttpPost("face-login")]
    public async Task<ActionResult<LoginResponse>> FaceLogin([FromBody] FaceLoginRequest request)
    {
        try
        {
            if (request == null || request.Descriptor == null || request.Descriptor.Length == 0)
            {
                return BadRequest(new LoginResponse { Success = false, Message = "Dữ liệu khuôn mặt không hợp lệ." });
            }

            // 1. Kiểm tra "độ tươi" của gói tin (Chống Replay Attack)
            var nowTs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var timeDiff = Math.Abs(nowTs - request.Timestamp);
            if (timeDiff > 120000) // Nới lỏng lên 120 giây đề phòng lệch múi giờ
            {
                _logger.LogWarning($"Face Login REJECTED: Replay attack suspected. Time diff: {timeDiff}ms");
                return BadRequest(new LoginResponse { Success = false, Message = "Phiên đăng nhập đã hết hạn. Vui lòng thử lại." });
            }

            // 2. So sánh khuôn mặt
            var usersCollection = _database.GetCollection<User>("Users");
            var users = await usersCollection
                .Find(u => u.FaceEmbeddings != null && u.FaceEmbeddings.Length > 0)
                .ToListAsync();

            User? matchedUser = null;
            double minDistance = double.MaxValue;
            double threshold = 0.5; // Ngưỡng nhận diện chặt chẽ (càng thấp càng khó)

            foreach (var user in users)
            {
                var distance = EuclideanDistance(request.Descriptor, user.FaceEmbeddings!);
                if (distance < threshold && distance < minDistance)
                {
                    minDistance = distance;
                    matchedUser = user;
                }
            }

            if (matchedUser == null)
            {
                // Ghi nhật ký lỗi nhận diện
                await LogAuthFailure($"Face Login failed: No matching face found for current session (MinDist: {minDistance})");
                return Unauthorized(new LoginResponse { Success = false, Message = "Không nhận diện được khuôn mặt hoặc chưa đăng ký Face ID" });
            }

            // 3. Hardware Binding (Chỉ áp dụng cho người dùng đã đăng ký máy tính)
            if (!string.IsNullOrEmpty(matchedUser.RegisteredMachineId) && !string.IsNullOrEmpty(request.MachineId) && request.MachineId != "unknown_web_client")
            {
                if (matchedUser.RegisteredMachineId != request.MachineId)
                {
                    _logger.LogCritical($"SECURITY ALERT: User {matchedUser.Username} attempted face login from unauthorized machine {request.MachineId}");
                    await LogAuthFailure($"Hardware Mismatch: Expected {matchedUser.RegisteredMachineId}, got {request.MachineId}");
                    return Unauthorized(new LoginResponse { Success = false, Message = "Truy cập bị từ chối: Tài khoản của bạn chỉ được phép đăng nhập trên máy tính đã đăng ký." });
                }
            }

            // Ghi nhật ký điểm danh (Cần dùng IMongoDatabase trực tiếp nếu collection chưa được khai báo ở constructor)
            var attendanceLog = new AttendanceLog
            {
                UserId = matchedUser.Id!,
                UserName = matchedUser.FullName,
                CheckInTime = DateTime.Now,
                Method = "FaceID"
            };
            await _database.GetCollection<AttendanceLog>("AttendanceLogs").InsertOneAsync(attendanceLog);

            // Tạo Token
            string token = GenerateJwtToken(matchedUser);

            return Ok(new LoginResponse
            {
                Success = true,
                Message = "Đăng nhập Face ID thành công",
                Token = token,
                User = new UserInfo
                {
                    Id = matchedUser.Id ?? "",
                    Username = matchedUser.Username,
                    FullName = matchedUser.FullName,
                    Role = matchedUser.Role,
                    AvatarUrl = matchedUser.AvatarUrl
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi Face Login");
            return StatusCode(500, new LoginResponse { Success = false, Message = "Lỗi hệ thống trong khi xác thực khuôn mặt: " + ex.Message });
        }
    }

    private async Task LogAuthFailure(string reason)
    {
        var log = new LogEntry
        {
            LogType = "Auth",
            Severity = "Warning",
            Message = reason,
            ComputerName = "WebClient",
            IPAddress = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "Unknown",
            ActionTaken = "Access Denied",
            Timestamp = DateTime.Now
        };
        await _logsCollection.InsertOneAsync(log);
    }

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

    // =============================================
    // POST /api/auth/register (Tạm thời để tạo user test)
    // =============================================
    public class RegisterRequest
    {
        public string Username { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string Role { get; set; } = "User";
    }

    // =============================================
    // POST /api/auth/change-password
    // =============================================
    public class ChangePasswordRequest
    {
        public string OldPassword { get; set; } = string.Empty;
        public string NewPassword { get; set; } = string.Empty;
    }

    [HttpPost("change-password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var usersCollection = _database.GetCollection<User>("Users");
        var user = await usersCollection.Find(u => u.Id == userId).FirstOrDefaultAsync();
        if (user == null) return NotFound();

        // Check old password
        if (!BCrypt.Net.BCrypt.Verify(request.OldPassword, user.PasswordHash))
        {
            return BadRequest(new { Success = false, Message = "Mật khẩu cũ không đúng" });
        }

        // Hash new password
        var newHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        
        var update = Builders<User>.Update.Set(u => u.PasswordHash, newHash);
        await usersCollection.UpdateOneAsync(u => u.Id == userId, update);

        return Ok(new { Success = true, Message = "Đổi mật khẩu thành công" });
    }

    public class ChangeFirstPasswordRequest
    {
        public string Username { get; set; } = string.Empty;
        public string OldPassword { get; set; } = string.Empty;
        public string NewPassword { get; set; } = string.Empty;
    }

    [HttpPost("change-first-password")]
    public async Task<IActionResult> ChangeFirstPassword([FromBody] ChangeFirstPasswordRequest request)
    {
        var usersCollection = _database.GetCollection<User>("Users");
        var user = await usersCollection.Find(u => u.Username == request.Username).FirstOrDefaultAsync();

        if (user == null) return NotFound(new { message = "Người dùng không tồn tại" });

        // Kiểm tra mật khẩu cũ
        if (!BCrypt.Net.BCrypt.Verify(request.OldPassword, user.PasswordHash))
        {
            return BadRequest(new { message = "Mật khẩu cũ không chính xác" });
        }

        // 🛡️ KIỂM TRA ĐỘ MẠNH MẬT KHẨU (REGEX)
        // Yêu cầu: Chữ cái đầu viết hoa, ít nhất 1 số, 1 ký tự đặc biệt, dài ít nhất 8 ký tự
        var passwordRegex = new System.Text.RegularExpressions.Regex(@"^[A-Z](?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{7,}$");
        
        if (!passwordRegex.IsMatch(request.NewPassword))
        {
            return BadRequest(new { 
                message = "Mật khẩu không đạt chuẩn bảo mật: Chữ cái đầu phải viết hoa, bao gồm ít nhất một chữ số, một ký tự đặc biệt và dài tối thiểu 8 ký tự." 
            });
        }

        // Cập nhật mật khẩu mới và tắt cờ RequiresPasswordChange
        var newHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        var update = Builders<User>.Update
            .Set(u => u.PasswordHash, newHash)
            .Set(u => u.RequiresPasswordChange, false);

        await usersCollection.UpdateOneAsync(u => u.Id == user.Id, update);

        return Ok(new { success = true, message = "Đổi mật khẩu thành công! Bây giờ bạn có thể đăng nhập." });
    }

    // =============================================
    // Security PIN OTP Endpoints
    // =============================================

    public class RequestPinOtpRequest
    {
        public string Pin { get; set; } = string.Empty; // The desired 6-digit PIN
    }

    /// <summary>
    /// POST /api/auth/request-pin-otp
    /// Gửi OTP tới email của user hiện tại để xác nhận việc đặt mã PIN.
    /// </summary>
    [HttpPost("request-pin-otp")]
    [Authorize]
    public async Task<IActionResult> RequestPinOtp([FromBody] RequestPinOtpRequest request)
    {
        if (string.IsNullOrEmpty(request.Pin) || request.Pin.Length != 6 || !request.Pin.All(char.IsDigit))
            return BadRequest(new { success = false, message = "Mã PIN phải là 6 chữ số" });

        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var usersCollection = _database.GetCollection<User>("Users");
        var user = await usersCollection.Find(u => u.Id == userId).FirstOrDefaultAsync();
        if (user == null) return NotFound();

        if (string.IsNullOrEmpty(user.Email))
            return BadRequest(new { success = false, message = "Tài khoản chưa có email. Vui lòng cập nhật email trong hồ sơ trước." });

        // Generate 6-digit OTP and store it tied to a special "Purpose" to distinguish from password reset
        var otpCode = new Random().Next(100000, 999999).ToString();

        // Store OTP with email = userId:pin so we can retrieve both when confirming
        var payload = $"{userId}|{request.Pin}";
        var otpToken = new OtpToken
        {
            Email = payload,
            Code = otpCode,
            ExpiresAt = DateTime.UtcNow.AddMinutes(5)
        };
        await _otpTokens.InsertOneAsync(otpToken);

        try
        {
            await _emailService.SendPinOtpEmailAsync(user.Email, otpCode);
            _logger.LogInformation($"PIN OTP sent to {user.Email} for user {userId}");
            return Ok(new { success = true, message = $"OTP đã được gửi tới {user.Email}" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Failed to send PIN OTP to {user.Email}");
            return StatusCode(500, new { success = false, message = "Không thể gửi email. Vui lòng thử lại sau." });
        }
    }

    public class ConfirmPinRequest
    {
        public string Otp { get; set; } = string.Empty;
        /// <summary>Base64-encoded JWK private key to backup on server.</summary>
        public string? PrivateKey { get; set; }
    }

    /// <summary>
    /// POST /api/auth/confirm-pin
    /// Xác minh OTP, sau đó hash và lưu mã PIN vào CSDL.
    /// </summary>
    [HttpPost("confirm-pin")]
    [Authorize]
    public async Task<IActionResult> ConfirmPin([FromBody] ConfirmPinRequest request)
    {
        if (string.IsNullOrEmpty(request.Otp))
            return BadRequest(new { success = false, message = "Mã OTP là bắt buộc" });

        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        // Find a valid OTP whose email starts with userId
        var now = DateTime.UtcNow;
        var otpToken = await _otpTokens.Find(o =>
            o.Email.StartsWith(userId + "|") &&
            o.Code == request.Otp &&
            !o.Used &&
            o.ExpiresAt > now
        ).FirstOrDefaultAsync();

        if (otpToken == null)
            return BadRequest(new { success = false, message = "OTP không hợp lệ hoặc đã hết hạn" });

        // Extract the PIN from the stored payload
        var parts = otpToken.Email.Split('|');
        if (parts.Length != 2)
            return BadRequest(new { success = false, message = "OTP không hợp lệ" });

        var pin = parts[1];

        // Mark OTP as used
        var otpUpdate = Builders<OtpToken>.Update.Set(o => o.Used, true);
        await _otpTokens.UpdateOneAsync(o => o.Id == otpToken.Id, otpUpdate);

        // Hash PIN and save to user record, also backup private key if provided
        var pinHash = BCrypt.Net.BCrypt.HashPassword(pin);
        var usersCollection = _database.GetCollection<User>("Users");
        var userUpdate = Builders<User>.Update.Set(u => u.ChatAccessCodeHash, pinHash);
        if (!string.IsNullOrEmpty(request.PrivateKey))
        {
            userUpdate = userUpdate.Set(u => u.PrivateKey, request.PrivateKey);
            _logger.LogInformation($"Private key backed up for user {userId}");
        }
        await usersCollection.UpdateOneAsync(u => u.Id == userId, userUpdate);

        _logger.LogInformation($"Security PIN set successfully for user {userId}");
        return Ok(new { success = true, message = "Mã PIN bảo mật đã được lưu thành công!" });
    }

    /// <summary>
    /// GET /api/auth/my-private-key
    /// Trả về private key đã backup cho user hiện tại (dùng để khôi phục khi mất key local).
    /// </summary>
    [HttpGet("my-private-key")]
    [Authorize]
    public async Task<IActionResult> GetMyPrivateKey()
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var usersCollection = _database.GetCollection<User>("Users");
        var user = await usersCollection.Find(u => u.Id == userId).FirstOrDefaultAsync();
        if (user == null) return NotFound();

        if (string.IsNullOrEmpty(user.PrivateKey))
            return Ok(new { success = false, privateKey = (string?)null, message = "Chưa có key backup" });

        return Ok(new { success = true, privateKey = user.PrivateKey });
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        try
        {
            var usersCollection = _database.GetCollection<User>("Users");

            // Kiểm tra user đã tồn tại chưa
            var existingUser = await usersCollection
                .Find(u => u.Username == request.Username)
                .FirstOrDefaultAsync();

            if (existingUser != null)
            {
                return BadRequest(new { Success = false, Message = "Username đã tồn tại" });
            }

            // Tạo user mới
            var newUser = new User
            {
                Username = request.Username,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
                FullName = request.FullName,
                Role = request.Role,
                CreatedAt = DateTime.Now
            };

            await usersCollection.InsertOneAsync(newUser);

            return Ok(new { Success = true, Message = "Tạo tài khoản thành công" });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { Success = false, Message = ex.Message });
        }
    }

    // =============================================
    // Helper Methods
    // =============================================
    private string GenerateJwtToken(User user)
    {
        var jwtSettings = _configuration.GetSection("Jwt");
        var key = Encoding.UTF8.GetBytes(jwtSettings["Key"]!);

        // Normalize role safely (preserve Vietnamese accented characters, only fix casing for known roles)
        string role = (user.Role ?? "User").Trim();
        string normalizedRole = role.ToLower() switch
        {
            "admin" => "Admin",
            "giám đốc" => "Giám đốc",
            "giam doc" => "Giám đốc",
            "director" => "Giám đốc",
            "quản lý" => "Quản lý",
            "nhân viên" => "Nhân viên",
            _ => role // Keep original if unknown
        };

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id ?? ""),
            new Claim(ClaimTypes.Name, user.Username),
            new Claim(ClaimTypes.Role, normalizedRole),
            new Claim("FullName", user.FullName)
        };

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = DateTime.UtcNow.AddMinutes(double.Parse(jwtSettings["ExpireMinutes"]!)),
            Issuer = jwtSettings["Issuer"],
            Audience = jwtSettings["Audience"],
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(key),
                SecurityAlgorithms.HmacSha256Signature
            )
        };

        var tokenHandler = new JwtSecurityTokenHandler();
        tokenHandler.OutboundClaimTypeMap.Clear();
        var token = tokenHandler.CreateToken(tokenDescriptor);
        return tokenHandler.WriteToken(token);
    }
}
