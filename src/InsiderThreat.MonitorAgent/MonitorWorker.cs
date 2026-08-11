using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using InsiderThreat.MonitorAgent.Models;
using InsiderThreat.MonitorAgent.Services;

namespace InsiderThreat.MonitorAgent;

/// <summary>
/// Main orchestration worker that coordinates all monitoring services:
/// - KeyboardHookService: Global keyboard interception
/// - KeywordAnalyzerService: Text analysis and risk scoring
/// - ScreenshotMonitorService: Clipboard/screenshot detection
/// - LocalDatabaseService: Offline data caching
/// - ServerSyncService: Server upload & connectivity management
/// 
/// Runs as a BackgroundService with a Win32 message pump for the keyboard hook.
/// </summary>
public class MonitorWorker : BackgroundService
{
    // Win32 Message Pump
    [DllImport("user32.dll")]
    private static extern bool GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

    [DllImport("user32.dll")]
    private static extern bool TranslateMessage(ref MSG lpMsg);

    [DllImport("user32.dll")]
    private static extern IntPtr DispatchMessage(ref MSG lpMsg);

    [StructLayout(LayoutKind.Sequential)]
    private struct MSG
    {
        public IntPtr hwnd;
        public uint message;
        public IntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public POINT pt;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT
    {
        public int x;
        public int y;
    }

    private readonly ILogger<MonitorWorker> _logger;
    private readonly KeyboardHookService _keyboardHook;
    private readonly KeywordAnalyzerService _keywordAnalyzer;
    private readonly ScreenshotMonitorService _screenshotMonitor;
    private readonly ClipboardMonitor _clipboardMonitor;
    private readonly LocalDatabaseService _localDb;
    private readonly ServerSyncService _serverSync;
    private readonly ProcessMonitorService _processMonitor;
    private readonly IConfiguration _config;

    // Machine identification
    private readonly string _computerName;
    private readonly string _computerUser;
    private readonly string _ipAddress;

    public MonitorWorker(
        ILogger<MonitorWorker> logger,
        KeyboardHookService keyboardHook,
        KeywordAnalyzerService keywordAnalyzer,
        ScreenshotMonitorService screenshotMonitor,
        ClipboardMonitor clipboardMonitor,
        LocalDatabaseService localDb,
        ServerSyncService serverSync,
        ProcessMonitorService processMonitor,
        IConfiguration config)
    {
        _logger = logger;
        _keyboardHook = keyboardHook;
        _keywordAnalyzer = keywordAnalyzer;
        _screenshotMonitor = screenshotMonitor;
        _clipboardMonitor = clipboardMonitor;
        _localDb = localDb;
        _serverSync = serverSync;
        _processMonitor = processMonitor;
        _config = config;

        // Gather machine info once at startup
        _computerName = Environment.MachineName;
        _computerUser = Environment.UserName;
        _ipAddress = GetLocalIpAddress();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("========================================");
        _logger.LogInformation("  InsiderThreat MonitorAgent Starting");
        _logger.LogInformation("  Machine: {Name} | User: {User} | IP: {IP}", _computerName, _computerUser, _ipAddress);
        _logger.LogInformation("  Server: {Server}", _config["AgentConfig:ServerUrl"] ?? "http://localhost:5038");
        _logger.LogInformation("========================================");

        // Wire up event handlers
        _keyboardHook.OnTextBufferFlushed += HandleTextBufferFlushed;
        _keyboardHook.OnScreenshotKeyDetected += HandleScreenshotKeyDetected;
        _screenshotMonitor.OnScreenshotDetected += HandleScreenshotToolDetected;
        _serverSync.OnConnectivityChanged += HandleConnectivityChanged;

        // Start the keyboard hook on a dedicated STA thread (requires message pump)
        var hookThread = new Thread(() =>
        {
            _keyboardHook.Start();

            // Run Win32 message pump to keep the hook alive
            while (!stoppingToken.IsCancellationRequested && GetMessage(out MSG msg, IntPtr.Zero, 0, 0))
            {
                TranslateMessage(ref msg);
                DispatchMessage(ref msg);
            }

            _keyboardHook.Dispose();
        });
        hookThread.SetApartmentState(ApartmentState.STA);
        hookThread.IsBackground = true;
        hookThread.Start();

        _logger.LogInformation("All monitoring modules ACTIVE.");

        // Main loop: periodic tasks
        var syncInterval = int.Parse(_config["AgentConfig:SyncIntervalSeconds"] ?? "30");
        var clipboardCheckInterval = int.Parse(_config["AgentConfig:KeywordCheckIntervalMs"] ?? "500");
        
        var lastSyncTime = DateTime.UtcNow;
        var lastPurgeTime = DateTime.UtcNow;
        var lastProcessScanTime = DateTime.UtcNow;
        var lastWatchdogCheckTime = DateTime.UtcNow;
        var processCheckInterval = int.Parse(_config["AgentConfig:ProcessCheckIntervalSeconds"] ?? "60");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // 0. Circular Watchdog: Đảm bảo dịch vụ bảo vệ luôn chạy
                if ((DateTime.UtcNow - lastWatchdogCheckTime).TotalSeconds >= 10) // Kiểm tra mỗi 10s
                {
                    lastWatchdogCheckTime = DateTime.UtcNow;
                    CheckAndRestartWatchdog();
                }

                // 1. Check clipboard for screenshots periodically
                _screenshotMonitor.CheckClipboardForScreenshot();

                // 1b. Check clipboard for tracked file copies
                _clipboardMonitor.CheckClipboard();

                // 2. Sync logs to server periodically
                if ((DateTime.UtcNow - lastSyncTime).TotalSeconds >= syncInterval)
                {
                    lastSyncTime = DateTime.UtcNow;
                    
                    if (await _serverSync.IsServerReachableAsync())
                    {
                        await _serverSync.SyncUnsyncedLogsAsync();
                    }
                    else
                    {
                        _logger.LogWarning("⚠ Sync skipped — server unreachable. {Count} logs pending.", 
                            _localDb.GetUnsyncedLogs(1).Count > 0 ? "Has" : "No");
                    }
                }

                // 3. Purge old synced logs daily
                if ((DateTime.UtcNow - lastPurgeTime).TotalHours >= 24)
                {
                    lastPurgeTime = DateTime.UtcNow;
                    _serverSync.PurgeOldLogs();
                }

                // 4. Check for suspicious processes (virtual cameras, deepfake tools)
                if ((DateTime.UtcNow - lastProcessScanTime).TotalSeconds >= processCheckInterval)
                {
                    lastProcessScanTime = DateTime.UtcNow;
                    if (_processMonitor.IsBrowserRunning())
                    {
                        _processMonitor.PerformFaceIDGuardScan(_computerUser, _computerName, _ipAddress);
                    }
                }

                await Task.Delay(clipboardCheckInterval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in main monitoring loop");
                await Task.Delay(1000, stoppingToken);
            }
        }

        // Cleanup
        _keyboardHook.ForceFlush();
        _logger.LogInformation("MonitorAgent shutting down...");
    }

    /// <summary>
    /// Called when the keyboard hook flushes its text buffer (user pressed Enter/Tab).
    /// Sends the text to the keyword analyzer for risk assessment.
    /// </summary>
    private void HandleTextBufferFlushed(string text, string windowTitle, string appName)
    {
        if (string.IsNullOrWhiteSpace(text) || text.Length < 3) return;

        var alerts = _keywordAnalyzer.Analyze(text, windowTitle, appName);

        foreach (var alert in alerts)
        {
            var log = new MonitorLog
            {
                EventType = "KeywordDetected",
                Severity = alert.Severity,
                DetectedKeyword = alert.Keyword,
                MessageContext = alert.MatchedText,
                ApplicationName = appName,
                WindowTitle = windowTitle,
                ComputerUser = _computerUser,
                ComputerName = _computerName,
                IpAddress = _ipAddress,
                Timestamp = DateTime.UtcNow,
                RiskAssessment = alert.RiskAssessment
            };

            _localDb.InsertLog(log);
            _logger.LogWarning(
                "🚨 ALERT [{Severity}/10]: Keyword \"{Keyword}\" detected in {App}. Risk: {Assessment}",
                alert.Severity, alert.Keyword, appName, alert.RiskAssessment);

            // Trigger immediate sync for high-severity alerts
            if (alert.Severity >= 7)
            {
                _ = Task.Run(() => _serverSync.TriggerImmediateSyncAsync());
            }
        }
    }

    /// <summary>
    /// Called when the PrintScreen key is pressed.
    /// </summary>
    private void HandleScreenshotKeyDetected()
    {
        var (windowTitle, appName) = KeyboardHookService.GetActiveWindowInfo();

        var log = new MonitorLog
        {
            EventType = "Screenshot",
            Severity = 5,
            DetectedKeyword = "PrintScreen",
            MessageContext = $"Phím PrintScreen được nhấn khi đang sử dụng: {windowTitle}",
            ApplicationName = appName,
            WindowTitle = windowTitle,
            ComputerUser = _computerUser,
            ComputerName = _computerName,
            IpAddress = _ipAddress,
            Timestamp = DateTime.UtcNow,
            RiskAssessment = $"[CẢNH BÁO] Người dùng {_computerUser} chụp màn hình khi đang sử dụng {appName}. Cửa sổ: {windowTitle}"
        };

        _localDb.InsertLog(log);
        _logger.LogWarning("📸 Screenshot alert saved. App: {App}, Window: {Window}", appName, windowTitle);
        // Trigger immediate sync for screenshot events
        _ = Task.Run(() => _serverSync.TriggerImmediateSyncAsync());
    }

    /// <summary>
    /// Called when a screenshot tool (Snipping Tool, etc.) places an image on the clipboard.
    /// </summary>
    private void HandleScreenshotToolDetected(string toolName)
    {
        var (windowTitle, _) = KeyboardHookService.GetActiveWindowInfo();

        var log = new MonitorLog
        {
            EventType = "Screenshot",
            Severity = 5,
            DetectedKeyword = toolName,
            MessageContext = $"Phát hiện chụp màn hình bằng {toolName}",
            ApplicationName = toolName,
            WindowTitle = windowTitle,
            ComputerUser = _computerUser,
            ComputerName = _computerName,
            IpAddress = _ipAddress,
            Timestamp = DateTime.UtcNow,
            RiskAssessment = $"[CẢNH BÁO] Người dùng {_computerUser} sử dụng {toolName} để chụp màn hình."
        };

        _localDb.InsertLog(log);
        // Trigger immediate sync for screenshot tool detection
        _ = Task.Run(() => _serverSync.TriggerImmediateSyncAsync());
    }

    /// <summary>
    /// Called when network connectivity changes.
    /// Logs the disconnect event and attempts immediate sync when restored.
    /// </summary>
    private void HandleConnectivityChanged(bool isOnline)
    {
        if (!isOnline)
        {
            var log = new MonitorLog
            {
                EventType = "NetworkDisconnect",
                Severity = 4,
                DetectedKeyword = null,
                MessageContext = "Mất kết nối mạng. Các log sẽ được lưu cục bộ và đồng bộ khi có mạng lại.",
                ApplicationName = "System",
                WindowTitle = null,
                ComputerUser = _computerUser,
                ComputerName = _computerName,
                IpAddress = _ipAddress,
                Timestamp = DateTime.UtcNow,
                RiskAssessment = $"[CHÚ Ý] Máy {_computerName} ({_computerUser}) bị mất kết nối mạng. Có thể do cố tình rút dây/tắt wifi."
            };

            _localDb.InsertLog(log);
        }
        else
        {
            // Network restored — trigger immediate sync
            _ = Task.Run(async () =>
            {
                await Task.Delay(2000); // Wait 2s for network to stabilize
                await _serverSync.SyncUnsyncedLogsAsync();
            });
        }
    }

    /// <summary>
    /// Circular Watchdog: Kiểm tra và khởi động lại dịch vụ Watchdog nếu bị tắt.
    /// </summary>
    private void CheckAndRestartWatchdog()
    {
        const string wdProcessName = "InsiderThreat.Watchdog";
        var processes = System.Diagnostics.Process.GetProcessesByName(wdProcessName);

        if (processes.Length == 0)
        {
            _logger.LogWarning("🛡️ WATCHDOG ALERT: {ProcessName} is NOT running! Restarting reverse watchdog...", wdProcessName);

            // Tìm theo cấu hình, sau đó thử các vị trí tương đối
            string? wdPath = _config["AgentConfig:WatchdogPath"];

            if (string.IsNullOrEmpty(wdPath) || !File.Exists(wdPath))
            {
                // Tìm trong thư mục cùng cấp với agent
                wdPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "InsiderThreat.Watchdog", "InsiderThreat.Watchdog.exe"));
            }

            if (!File.Exists(wdPath))
            {
                _logger.LogError("❌ Watchdog executable not found. Set AgentConfig:WatchdogPath in appsettings.json");
                return;
            }

            try
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = wdPath,
                    UseShellExecute = false,   // false để hoạt động trong cả Windows Service
                    CreateNoWindow = true,
                    WorkingDirectory = Path.GetDirectoryName(wdPath)
                });
                _logger.LogInformation("✅ Reverse Watchdog restarted successfully.");
            }
            catch (Exception ex)
            {
                _logger.LogError("❌ Failed to start watchdog: {msg}", ex.Message);
            }
        }
    }

    /// <summary>
    /// Get the local IP address of the machine.
    /// </summary>
    private static string GetLocalIpAddress()
    {
        try
        {
            using var socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, 0);
            socket.Connect("8.8.8.8", 65530);
            if (socket.LocalEndPoint is IPEndPoint endPoint)
                return endPoint.Address.ToString();
        }
        catch { /* Fallback */ }

        try
        {
            var host = Dns.GetHostEntry(Dns.GetHostName());
            foreach (var ip in host.AddressList)
            {
                if (ip.AddressFamily == AddressFamily.InterNetwork)
                    return ip.ToString();
            }
        }
        catch { /* Fallback */ }

        return "127.0.0.1";
    }
}
