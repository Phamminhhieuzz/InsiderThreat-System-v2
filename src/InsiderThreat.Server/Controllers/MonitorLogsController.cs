using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using MongoDB.Driver;
using InsiderThreat.Server.Models;
using InsiderThreat.Server.Hubs;
using System.IO.Compression;
using System.Text.Json;

namespace InsiderThreat.Server.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/threat-monitor")]
    public class MonitorLogsController : ControllerBase
    {
        private readonly IMongoCollection<MonitorLog> _logs;
        private readonly IMongoCollection<SharedDocument> _documents;
        private readonly IHubContext<SystemHub> _hub;
        private readonly ILogger<MonitorLogsController> _logger;

        public MonitorLogsController(IMongoDatabase database, IHubContext<SystemHub> hub, ILogger<MonitorLogsController> logger)
        {
            _logs = database.GetCollection<MonitorLog>("MonitorLogs");
            _documents = database.GetCollection<SharedDocument>("SharedDocuments");
            _hub = hub;
            _logger = logger;
        }

        [HttpGet("health")]
        [AllowAnonymous]
        public IActionResult Health() => Ok(new { status = "online", time = DateTime.UtcNow });

        [HttpGet]
        public async Task<ActionResult<object>> GetLogs(
            [FromQuery] string? computerName, 
            [FromQuery] string? computerUser,
            [FromQuery] string? logType,
            [FromQuery] int? minSeverity,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 100)
        {
            var filterBuilder = Builders<MonitorLog>.Filter;
            var filter = filterBuilder.Empty;

            if (!string.IsNullOrEmpty(computerName))
                filter &= filterBuilder.Regex(l => l.ComputerName, new MongoDB.Bson.BsonRegularExpression(computerName, "i"));
            
            if (!string.IsNullOrEmpty(computerUser) && computerUser != "Unknown")
                filter &= filterBuilder.Regex(l => l.ComputerUser, new MongoDB.Bson.BsonRegularExpression(computerUser, "i"));

            if (!string.IsNullOrEmpty(logType))
                filter &= filterBuilder.Eq(l => l.LogType, logType);

            if (minSeverity.HasValue)
                filter &= filterBuilder.Gte(l => l.SeverityScore, minSeverity.Value);

            var totalCount = await _logs.CountDocumentsAsync(filter);
            var logs = await _logs.Find(filter)
                .SortByDescending(l => l.Timestamp)
                .Skip((page - 1) * pageSize)
                .Limit(pageSize)
                .ToListAsync();

            return Ok(new 
            { 
                data = logs, 
                totalCount, 
                page, 
                pageSize,
                totalPages = (int)Math.Ceiling((double)totalCount / pageSize)
            });
        }

        [HttpGet("summary")]
        public async Task<ActionResult<MonitorSummary>> GetSummary()
        {
            var today = DateTime.UtcNow.Date;
            var filterToday = Builders<MonitorLog>.Filter.Gte(l => l.Timestamp, today);

            var logsToday = await _logs.Find(filterToday).ToListAsync();

            var summary = new MonitorSummary
            {
                TotalToday = logsToday.Count,
                CriticalToday = logsToday.Count(l => l.SeverityScore >= 7),
                ScreenshotsToday = logsToday.Count(l => l.LogType == "Screenshot"),
                KeywordsToday = logsToday.Count(l => l.LogType == "KeywordDetected"),
                DisconnectsToday = logsToday.Count(l => l.LogType == "NetworkDisconnect")
            };

            return Ok(summary);
        }

        [HttpGet("export-archive")]
        public async Task<IActionResult> ExportArchive(
            [FromQuery] string? computerName, 
            [FromQuery] string? computerUser,
            [FromQuery] bool clearLogs = false)
        {
            try
            {
                var filterBuilder = Builders<MonitorLog>.Filter;
                var filter = filterBuilder.Empty;

                if (!string.IsNullOrEmpty(computerName))
                    filter &= filterBuilder.Eq(l => l.ComputerName, computerName);
                
                if (!string.IsNullOrEmpty(computerUser) && computerUser != "Unknown")
                    filter &= filterBuilder.Eq(l => l.ComputerUser, computerUser);

                var logsToExport = await _logs.Find(filter).SortByDescending(l => l.Timestamp).ToListAsync();
                var json = JsonSerializer.Serialize(logsToExport, new JsonSerializerOptions { WriteIndented = true });

                using var ms = new MemoryStream();
                using (var archive = new ZipArchive(ms, ZipArchiveMode.Create, true))
                {
                    string innerFileName = "all_machines_logs.json";
                    if (!string.IsNullOrEmpty(computerName))
                    {
                        innerFileName = $"logs_{computerName}_{computerUser ?? "unknown"}_{DateTime.Now:yyyyMMdd}.json";
                    }

                    var entry = archive.CreateEntry(innerFileName);
                    using var entryStream = entry.Open();
                    using var writer = new StreamWriter(entryStream);
                    await writer.WriteAsync(json);
                }

                ms.Position = 0;
                
                // Đặt tên file ZIP rõ ràng
                string zipName = "InsiderThreat_All_Logs.zip";
                if (!string.IsNullOrEmpty(computerName))
                {
                    zipName = $"Log_{computerName}_{computerUser ?? "user"}_{DateTime.Now:yyyyMMdd_HHmm}.zip";
                }

                if (clearLogs && logsToExport.Count > 0)
                {
                    await _logs.DeleteManyAsync(filter);
                    _logger.LogInformation($"Cleared {logsToExport.Count} logs for {computerName} after successful export.");
                }

                return File(ms.ToArray(), "application/zip", zipName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error exporting logs archive");
                return StatusCode(500, "Error exporting archive: " + ex.Message);
            }
        }

        [HttpPost("monitor-batch")]
        [AllowAnonymous]
        public async Task<IActionResult> PostBatch([FromBody] List<MonitorLog> logs)
        {
            if (logs == null || logs.Count == 0) return BadRequest("Empty batch");

            try
            {
                // Escalate severity for Restricted documents
                foreach (var log in logs)
                {
                    if (!string.IsNullOrEmpty(log.DetectedKeyword))
                    {
                        // Safely check if the keyword is a valid ObjectId before querying
                        if (MongoDB.Bson.ObjectId.TryParse(log.DetectedKeyword, out _))
                        {
                            var doc = await _documents.Find(d => d.Id == log.DetectedKeyword).FirstOrDefaultAsync();
                            if (doc?.SecurityLevel == "Restricted")
                            {
                                log.SeverityScore = 10;
                                log.MessageContext = "[TUYỆT MẬT] " + log.MessageContext;
                            }
                        }
                    }
                }


                await _logs.InsertManyAsync(logs);
                _logger.LogInformation($"Successfully received batch of {logs.Count} logs from Agent.");

                // Broadcast real-time alerts cho admin với các log nghiêm trọng
                var alertableLogs = logs.Where(l =>
                    l.SeverityScore >= 6 ||
                    l.LogType == "DocumentLeak" ||
                    l.LogType == "FaceIDSpoofAttempt" ||
                    l.LogType == "Screenshot"
                );
                foreach (var log in alertableLogs)
                {
                    await _hub.Clients.All.SendAsync("MonitorAlert", new
                    {
                        logType = log.LogType,
                        severity = log.Severity,
                        severityScore = log.SeverityScore,
                        message = log.Message,
                        computerName = log.ComputerName,
                        computerUser = log.ComputerUser,
                        ipAddress = log.IpAddress,
                        detectedKeyword = log.DetectedKeyword,
                        messageContext = log.MessageContext,
                        applicationName = log.ApplicationName,
                        timestamp = log.Timestamp
                    });
                }

                return Ok(new { count = logs.Count });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inserting batch logs");
                return StatusCode(500, "Error inserting batch: " + ex.Message);
            }
        }
    }
}
