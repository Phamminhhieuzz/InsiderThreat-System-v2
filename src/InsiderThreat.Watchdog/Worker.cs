using System.Diagnostics;
using System.Net.Http.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace InsiderThreat.Watchdog;

public class Worker : BackgroundService
{
    private readonly ILogger<Worker> _logger;
    private readonly IConfiguration _configuration;
    private readonly string _processName;
    private readonly string _agentPath;
    private readonly string _serverUrl;
    private readonly HttpClient _httpClient;

    private bool _isRestarting = false;
    private int _heartbeatTick = 0;
    private const int HeartbeatEveryTicks = 6; // 6 * 5s = 30s

    public Worker(ILogger<Worker> logger, IConfiguration configuration)
    {
        _logger = logger;
        _configuration = configuration;

        _processName = _configuration["WatchdogConfig:ProcessName"] ?? "InsiderThreat.MonitorAgent";
        _agentPath = @"C:\secu\src\InsiderThreat.MonitorAgent\bin\Debug\net8.0-windows\InsiderThreat.MonitorAgent.exe";
        _serverUrl = _configuration["WatchdogConfig:ServerUrl"] ?? "http://localhost:5038";

        _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Watchdog Service started at: {time}", DateTimeOffset.Now);
        _logger.LogInformation("Watching process: {name}", _processName);
        _logger.LogInformation("Agent path: {path}", _agentPath);

        // Gửi heartbeat ngay khi khởi động
        _ = SendHeartbeatAsync();

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (!_isRestarting)
                    CheckAndRestartAgent();

                // Gửi heartbeat mỗi 30 giây (6 tick * 5s)
                _heartbeatTick++;
                if (_heartbeatTick >= HeartbeatEveryTicks)
                {
                    _heartbeatTick = 0;
                    _ = SendHeartbeatAsync();
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in Watchdog loop");
            }

            await Task.Delay(5000, stoppingToken);
        }
    }

    private void CheckAndRestartAgent()
    {
        var processes = Process.GetProcessesByName(_processName);

        if (processes.Length == 0)
        {
            _logger.LogWarning("⚠️ WARNING: {ProcessName} is NOT running! Restarting...", _processName);

            if (!File.Exists(_agentPath))
            {
                _logger.LogError("❌ ERROR: Agent executable not found at {AgentPath}", _agentPath);
                return;
            }

            try
            {
                _isRestarting = true;

                Process.Start(new ProcessStartInfo
                {
                    FileName = _agentPath,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WorkingDirectory = Path.GetDirectoryName(_agentPath)
                });

                _logger.LogInformation("✅ {ProcessName} restarted successfully.", _processName);

                // Gửi restart event về server (SignalR broadcast + log)
                _ = SendRestartEventAsync("MonitorAgent bị tắt bất thường. Watchdog đã tự động khởi động lại.");

                // Chờ agent khởi động xong
                Thread.Sleep(15000);
            }
            finally
            {
                _isRestarting = false;
            }
        }
    }

    /// <summary>Gửi heartbeat định kỳ - cho admin biết Watchdog đang hoạt động</summary>
    private async Task SendHeartbeatAsync()
    {
        try
        {
            var payload = new
            {
                computerName = Environment.MachineName,
                ipAddress = GetLocalIPAddress()
            };
            await _httpClient.PostAsJsonAsync($"{_serverUrl}/api/watchdog/heartbeat", payload);
            _logger.LogDebug("💓 Heartbeat sent");
        }
        catch (Exception ex)
        {
            _logger.LogDebug("Heartbeat failed: {msg}", ex.Message);
        }
    }

    /// <summary>Gửi thông báo restart MonitorAgent về server</summary>
    private async Task SendRestartEventAsync(string message)
    {
        var ip = GetLocalIPAddress();

        // 1. Gửi restart event riêng (SignalR broadcast WatchdogAlert)
        try
        {
            var restartPayload = new
            {
                computerName = Environment.MachineName,
                ipAddress = ip,
                message
            };
            await _httpClient.PostAsJsonAsync($"{_serverUrl}/api/watchdog/restart-event", restartPayload);
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Could not send restart event: {msg}", ex.Message);
        }

        // 2. Ghi log lưu vào MongoDB
        try
        {
            var log = new
            {
                LogType = "System",
                Severity = "Critical",
                Message = message,
                ActionTaken = "AutoRestart",
                ComputerName = Environment.MachineName,
                IPAddress = ip,
                Timestamp = DateTime.Now
            };
            var response = await _httpClient.PostAsJsonAsync($"{_serverUrl}/api/logs", log);
            if (!response.IsSuccessStatusCode)
                _logger.LogWarning("Server returned {status} when logging restart", response.StatusCode);
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Could not log restart to server: {msg}", ex.Message);
        }
    }

    private static string GetLocalIPAddress()
    {
        try
        {
            var host = System.Net.Dns.GetHostEntry(System.Net.Dns.GetHostName());
            var ip = host.AddressList
                .FirstOrDefault(a => a.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork);
            return ip?.ToString() ?? "127.0.0.1";
        }
        catch
        {
            return "127.0.0.1";
        }
    }
}
