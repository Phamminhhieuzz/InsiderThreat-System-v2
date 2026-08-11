using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using InsiderThreat.Shared;

namespace InsiderThreat.Server.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class AlertsController : ControllerBase
    {
        private readonly IMongoCollection<AlertModel> _alerts;

        public AlertsController(IMongoDatabase database)
        {
            _alerts = database.GetCollection<AlertModel>("Alerts");
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<AlertModel>>> GetAlerts(
            [FromQuery] AlertLevel? level,
            [FromQuery] bool? isResolved)
        {
            var filterBuilder = Builders<AlertModel>.Filter;
            var filter = filterBuilder.Empty;

            if (level.HasValue)
                filter &= filterBuilder.Eq(a => a.Level, level.Value);
            
            if (isResolved.HasValue)
                filter &= filterBuilder.Eq(a => a.IsResolved, isResolved.Value);

            var alerts = await _alerts.Find(filter)
                .SortByDescending(a => a.TriggeredAt)
                .ToListAsync();

            return Ok(alerts);
        }

        [HttpPost]
        public async Task<ActionResult<AlertModel>> CreateAlert([FromBody] AlertModel alert)
        {
            alert.CreatedAt = DateTime.UtcNow;
            if (alert.TriggeredAt == default) alert.TriggeredAt = DateTime.UtcNow;

            // 🛡️ IMMUTABLE LOG CHAIN (Nguyên tắc Bất biến)
            // 1. Lấy bản ghi log mới nhất từ Database
            var lastAlert = await _alerts.Find(_ => true)
                .SortByDescending(a => a.CreatedAt)
                .FirstOrDefaultAsync();

            // 2. Gán mã Hash của bản ghi trước vào bản ghi mới
            alert.PreviousHash = lastAlert?.CurrentHash ?? "GENESIS_BLOCK";

            // 3. Tính toán mã Hash cho bản ghi hiện tại (SHA-256)
            alert.CurrentHash = CalculateAlertHash(alert);
            
            await _alerts.InsertOneAsync(alert);
            return CreatedAtAction(nameof(GetAlerts), new { }, alert);
        }

        private string CalculateAlertHash(AlertModel alert)
        {
            var rawData = $"{alert.PreviousHash}|{alert.TriggeredAt:O}|{alert.Title}|{alert.AffectedUser}|{alert.MachineName}|{alert.Description}";
            using var sha256 = System.Security.Cryptography.SHA256.Create();
            var bytes = sha256.ComputeHash(System.Text.Encoding.UTF8.GetBytes(rawData));
            return Convert.ToBase64String(bytes);
        }

        [HttpPatch("{id}/resolve")]
        public async Task<IActionResult> ResolveAlert(string id, [FromBody] string comment)
        {
            var update = Builders<AlertModel>.Update
                .Set(a => a.IsResolved, true)
                .Set(a => a.ResolutionComment, comment);
            
            var result = await _alerts.UpdateOneAsync(a => a.Id == id, update);
            if (result.MatchedCount == 0) return NotFound();
            return Ok(new { message = "Alert resolved" });
        }
    }
}
