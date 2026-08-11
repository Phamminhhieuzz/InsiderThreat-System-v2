using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;

namespace InsiderThreat.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    private readonly IMongoDatabase _database;
    private readonly ILogger<HealthController> _logger;

    public HealthController(IMongoDatabase database, ILogger<HealthController> logger)
    {
        _database = database;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> Check()
    {
        string dbStatus = "unknown";
        string dbMessage = "";

        try
        {
            // Kiểm tra kết nối MongoDB
            await _database.RunCommandAsync<MongoDB.Bson.BsonDocument>(
                new MongoDB.Bson.BsonDocument("ping", 1)
            );
            dbStatus = "connected";
            dbMessage = "MongoDB đang hoạt động";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "MongoDB connection failed in health check");
            dbStatus = "disconnected";
            dbMessage = $"MongoDB chưa kết nối: {ex.Message}";
        }

        // Luôn trả về 200 OK ngay cả khi DB chưa kết nối
        return Ok(new
        {
            Status = "ok",
            Message = "Hệ thống sẵn sàng",
            Database = dbStatus,
            DatabaseMessage = dbMessage,
            Timestamp = DateTime.Now
        });
    }
}
