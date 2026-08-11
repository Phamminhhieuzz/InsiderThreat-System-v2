using Microsoft.AspNetCore.SignalR;

namespace InsiderThreat.Server.Hubs;

public class SystemHub : Hub
{
    private readonly ILogger<SystemHub> _logger;

    public SystemHub(ILogger<SystemHub> logger)
    {
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        _logger.LogInformation($"Client connected: {Context.ConnectionId}");
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _logger.LogInformation($"Client disconnected: {Context.ConnectionId}");
        await base.OnDisconnectedAsync(exception);
    }

    // Method để Admin gửi lệnh chặn USB xuống Agent
    public async Task BlockDevice(string deviceId)
    {
        _logger.LogInformation($"Admin yêu cầu chặn thiết bị: {deviceId}");
        
        // Gửi lệnh tới tất cả Agent đang kết nối
        await Clients.All.SendAsync("DeviceBlockCommand", deviceId);
    }
}
