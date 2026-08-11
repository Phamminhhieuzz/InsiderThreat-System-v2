using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using InsiderThreat.Server.Hubs;
using InsiderThreat.Server.Services;

namespace InsiderThreat.Server.Controllers;

[ApiController]
[Route("api/watchdog")]
public class WatchdogController : ControllerBase
{
    private readonly WatchdogStatusService _statusService;
    private readonly IHubContext<SystemHub> _hub;
    private readonly ILogger<WatchdogController> _logger;

    public WatchdogController(
        WatchdogStatusService statusService,
        IHubContext<SystemHub> hub,
        ILogger<WatchdogController> logger)
    {
        _statusService = statusService;
        _hub = hub;
        _logger = logger;
    }

    /// <summary>
    /// Watchdog gọi mỗi 30s để báo đang hoạt động.
    /// POST /api/watchdog/heartbeat
    /// </summary>
    [HttpPost("heartbeat")]
    public async Task<IActionResult> Heartbeat([FromBody] WatchdogHeartbeatDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.ComputerName))
            return BadRequest("ComputerName is required");

        _statusService.UpdateHeartbeat(dto.ComputerName, dto.IpAddress ?? "Unknown");
        _logger.LogDebug("💓 Watchdog heartbeat from {Machine} ({IP})", dto.ComputerName, dto.IpAddress);

        // Broadcast cập nhật real-time tới admin
        await _hub.Clients.All.SendAsync("WatchdogHeartbeat", new
        {
            computerName = dto.ComputerName,
            ipAddress = dto.IpAddress,
            timestamp = DateTime.UtcNow,
            isOnline = true
        });

        return Ok(new { received = true });
    }

    /// <summary>
    /// Watchdog gọi khi phát hiện MonitorAgent bị tắt và đã restart lại.
    /// POST /api/watchdog/restart-event
    /// </summary>
    [HttpPost("restart-event")]
    public async Task<IActionResult> RestartEvent([FromBody] WatchdogRestartDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.ComputerName))
            return BadRequest("ComputerName is required");

        _statusService.RecordRestart(dto.ComputerName, dto.IpAddress ?? "Unknown");
        _logger.LogWarning("🔄 Watchdog restarted MonitorAgent on {Machine} ({IP})", dto.ComputerName, dto.IpAddress);

        // Broadcast cảnh báo real-time tới admin
        await _hub.Clients.All.SendAsync("WatchdogAlert", new
        {
            computerName = dto.ComputerName,
            ipAddress = dto.IpAddress,
            message = dto.Message ?? "MonitorAgent bị tắt bất thường và đã được khởi động lại",
            timestamp = DateTime.UtcNow,
            restartCount = _statusService.Get(dto.ComputerName)?.RestartCount ?? 1
        });

        return Ok(new { received = true });
    }

    /// <summary>
    /// Web dashboard gọi để lấy trạng thái tất cả Watchdog.
    /// GET /api/watchdog/status
    /// </summary>
    [HttpGet("status")]
    public IActionResult GetStatus()
    {
        var statuses = _statusService.GetAll()
            .OrderByDescending(s => s.LastHeartbeat)
            .Select(s => new
            {
                s.ComputerName,
                s.IpAddress,
                s.IsOnline,
                s.StatusText,
                s.RestartCount,
                lastHeartbeat = s.LastHeartbeat,
                lastRestartTime = s.LastRestartTime,
                secondsSinceHeartbeat = (int)(DateTime.UtcNow - s.LastHeartbeat).TotalSeconds
            });

        return Ok(statuses);
    }
}

public class WatchdogHeartbeatDto
{
    public string ComputerName { get; set; } = string.Empty;
    public string? IpAddress { get; set; }
}

public class WatchdogRestartDto
{
    public string ComputerName { get; set; } = string.Empty;
    public string? IpAddress { get; set; }
    public string? Message { get; set; }
}
