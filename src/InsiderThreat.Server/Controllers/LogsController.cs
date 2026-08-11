using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using InsiderThreat.Shared;
using Microsoft.AspNetCore.SignalR;
using InsiderThreat.Server.Hubs;

namespace InsiderThreat.Server.Controllers
{
    [Route("api/[controller]")] // Đường dẫn sẽ là: api/logs
    [ApiController]
    public class LogsController : ControllerBase
    {
        private readonly IMongoCollection<LogEntry> _logsCollection;
        private readonly IHubContext<SystemHub> _hubContext;
        private readonly ILogger<LogsController> _logger;

        // Inject Database và SignalR Hub vào Controller
        public LogsController(IMongoDatabase database, IHubContext<SystemHub> hubContext, ILogger<LogsController> logger)
        {
            _logsCollection = database.GetCollection<LogEntry>("Logs");
            _hubContext = hubContext;
            _logger = logger;
        }

        // 1. API Gửi Log từ Client lên (POST api/logs)
        [HttpPost]
        public async Task<IActionResult> CreateLog([FromBody] LogEntry newLog)
        {
            // Gán lại giờ server để đảm bảo chính xác
            newLog.Timestamp = DateTime.Now;
            newLog.Id = null; // Để MongoDB tự sinh ID

            // Địa chỉ IP phải do server tự xác định: giá trị client gửi lên có thể
            // bị bỏ trống hoặc bịa ra, mà log bảo mật thì cần truy được về máy nào.
            if (string.IsNullOrWhiteSpace(newLog.IPAddress) || newLog.IPAddress == "Unknown")
            {
                // Sau reverse proxy (Render, nginx), IP thật nằm ở X-Forwarded-For.
                var forwarded = Request.Headers["X-Forwarded-For"].FirstOrDefault();
                newLog.IPAddress = !string.IsNullOrWhiteSpace(forwarded)
                    ? forwarded.Split(',')[0].Trim()
                    : HttpContext.Connection.RemoteIpAddress?.ToString() ?? "Unknown";
            }

            await _logsCollection.InsertOneAsync(newLog);

            // Nếu là log USB và bị chặn -> Gửi thông báo real-time cho Admin
            if (newLog.LogType == "USB_INSERT" && newLog.ActionTaken == "Blocked")
            {
                _logger.LogInformation($"Broadcasting USB alert: {newLog.DeviceName}");

                await _hubContext.Clients.All.SendAsync("UsbAlert", new
                {
                    deviceId = newLog.DeviceId,
                    deviceName = newLog.DeviceName,
                    computerName = newLog.ComputerName,
                    ipAddress = newLog.IPAddress,
                    timestamp = newLog.Timestamp,
                    message = newLog.Message
                });
            }

            return Ok(new { Message = "Đã ghi nhận Log thành công!", LogId = newLog.Id });
        }

        // 2. API Lấy logs với filter (GET api/logs?type=FileAccess&limit=20)
        [HttpGet]
        public async Task<IActionResult> GetRecentLogs([FromQuery] string? type, [FromQuery] int limit = 20)
        {
            var filterBuilder = Builders<LogEntry>.Filter;
            var filter = filterBuilder.Empty;

            if (!string.IsNullOrEmpty(type))
            {
                filter = filterBuilder.Eq(l => l.LogType, type);
            }

            // Giới hạn max limit là 100 để tránh load quá nhiều
            if (limit > 100) limit = 100;

            var logs = await _logsCollection.Find(filter)
                                            .SortByDescending(l => l.Timestamp)
                                            .Limit(limit)
                                            .ToListAsync();
            return Ok(logs);
        }
    }
}