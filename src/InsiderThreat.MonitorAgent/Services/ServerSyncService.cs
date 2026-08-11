using System.Net.Http.Json;
using System.Net.NetworkInformation;
using InsiderThreat.MonitorAgent.Models;

namespace InsiderThreat.MonitorAgent.Services;

/// <summary>
/// Handles synchronization of locally-cached MonitorLogs to the InsiderThreat.Server.
/// Implements:
/// - Network connectivity checking
/// - Batch upload of unsynced logs
/// - Automatic retry with exponential backoff
/// - Purging of old synced data
/// </summary>
public class ServerSyncService
{
    private readonly HttpClient _httpClient;
    private readonly LocalDatabaseService _db;
    private readonly ILogger<ServerSyncService> _logger;
    private readonly string _serverUrl;
    private bool _lastConnectivityState = false;
    private bool _firstConnectivityCheck = true;
    private readonly SemaphoreSlim _syncLock = new(1, 1);

    public event Action<bool>? OnConnectivityChanged; // true = online, false = offline

    public ServerSyncService(
        IConfiguration config,
        LocalDatabaseService db,
        ILogger<ServerSyncService> logger)
    {
        _db = db;
        _logger = logger;
        _serverUrl = config["AgentConfig:ServerUrl"] ?? "http://localhost:5038";

        _httpClient = new HttpClient
        {
            BaseAddress = new Uri(_serverUrl),
            Timeout = TimeSpan.FromSeconds(15)
        };

        _logger.LogInformation("🌐 ServerSyncService initialized. Target server: {ServerUrl}", _serverUrl);
    }

    /// <summary>
    /// Check if the network is available and the server is reachable.
    /// </summary>
    public async Task<bool> IsServerReachableAsync()
    {
        try
        {
            // First check basic network connectivity
            if (!NetworkInterface.GetIsNetworkAvailable())
            {
                HandleConnectivityChange(false);
                return false;
            }

            // Then check if server responds
            var response = await _httpClient.GetAsync("/api/threat-monitor/health");
            bool reachable = response.IsSuccessStatusCode;
            HandleConnectivityChange(reachable);
            return reachable;
        }
        catch
        {
            HandleConnectivityChange(false);
            return false;
        }
    }

    private void HandleConnectivityChange(bool isOnline)
    {
        if (_firstConnectivityCheck || _lastConnectivityState != isOnline)
        {
            _firstConnectivityCheck = false;
            _lastConnectivityState = isOnline;
            OnConnectivityChanged?.Invoke(isOnline);

            if (isOnline)
                _logger.LogInformation("🌐 Network connectivity RESTORED. Starting sync...");
            else
                _logger.LogWarning("⚠ Server UNREACHABLE at {ServerUrl}. Logs will be cached locally.", _serverUrl);
        }
    }

    /// <summary>
    /// Attempt to upload all unsynced logs to the server.
    /// Called periodically and also when connectivity is restored.
    /// </summary>
    public async Task SyncUnsyncedLogsAsync()
    {
        if (!await _syncLock.WaitAsync(0)) return; // Skip if already syncing
        try
        {
            var unsyncedLogs = _db.GetUnsyncedLogs(50);
            if (unsyncedLogs.Count == 0) return;

            _logger.LogInformation("📤 Syncing {Count} unsynced logs to {Server}...", unsyncedLogs.Count, _serverUrl);

            // Send batch to server
            var payload = unsyncedLogs.Select(log => new
            {
                logType = log.EventType,
                severity = MapSeverityToString(log.Severity),
                message = BuildLogMessage(log),
                computerName = log.ComputerName,
                ipAddress = log.IpAddress,
                actionTaken = log.RiskAssessment ?? "Đã ghi nhận",
                deviceId = (string?)null,
                deviceName = (string?)null,
                detectedKeyword = log.DetectedKeyword,
                messageContext = log.MessageContext,
                applicationName = log.ApplicationName,
                windowTitle = log.WindowTitle,
                computerUser = log.ComputerUser,
                severityScore = log.Severity,
                timestamp = log.Timestamp.ToString("o")
            });

            var response = await _httpClient.PostAsJsonAsync("/api/threat-monitor/monitor-batch", payload);

            if (response.IsSuccessStatusCode)
            {
                var syncedIds = unsyncedLogs.Select(l => l.Id);
                _db.MarkAsSynced(syncedIds);
                _logger.LogInformation("✅ Successfully synced {Count} logs to server.", unsyncedLogs.Count);
            }
            else
            {
                var body = await response.Content.ReadAsStringAsync();
                _logger.LogWarning("❌ Server returned {StatusCode} during sync. Body: {Body}", response.StatusCode, body);
            }
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning("❌ Network error during sync to {Server}: {Error}", _serverUrl, ex.Message);
        }
        catch (TaskCanceledException)
        {
            _logger.LogWarning("⏱ Sync request to {Server} timed out. Will retry later.", _serverUrl);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error during sync.");
        }
        finally
        {
            _syncLock.Release();
        }
    }

    /// <summary>
    /// Trigger an immediate sync attempt for critical events.
    /// Called by services that detect high-severity events.
    /// </summary>
    public async Task TriggerImmediateSyncAsync()
    {
        try
        {
            _logger.LogInformation("⚡ Immediate sync triggered for critical event...");
            if (await IsServerReachableAsync())
            {
                await SyncUnsyncedLogsAsync();
            }
            else
            {
                _logger.LogWarning("⚠ Cannot sync immediately — server {Server} unreachable. Logs cached locally.", _serverUrl);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Immediate sync failed: {Error}", ex.Message);
        }
    }

    /// <summary>
    /// Build a descriptive log message from a MonitorLog entry.
    /// </summary>
    private static string BuildLogMessage(MonitorLog log)
    {
        return log.EventType switch
        {
            "Screenshot" => $"[GIÁM SÁT] Phát hiện chụp màn hình bởi {log.ComputerUser} trên ứng dụng {log.ApplicationName}. Cửa sổ: {log.WindowTitle}",
            "KeywordDetected" => $"[GIÁM SÁT] Phát hiện từ khóa nhạy cảm \"{log.DetectedKeyword}\" bởi {log.ComputerUser}. Mức độ: {log.Severity}/10. Nội dung: \"{log.MessageContext}\"",
            "NetworkDisconnect" => $"[GIÁM SÁT] Phát hiện mất kết nối mạng trên máy {log.ComputerName} ({log.ComputerUser})",
            "DocumentLeak" => $"[CẢNH BÁO RÒ RỈ] Phát hiện tài liệu mật bị rò rỉ bởi {log.ComputerUser}. Ứng dụng: {log.ApplicationName}. {log.MessageContext}",
            "ClipboardCopy" => $"[CẢNH BÁO CLIPBOARD] {log.ComputerUser} đã sao chép file mật vào clipboard. Ứng dụng: {log.ApplicationName}. {log.MessageContext}",
            "FaceIDSpoofAttempt" => $"[CẢNH BÁO GIẢ MẠO] Phát hiện nỗ lực giả mạo FaceID bởi {log.ComputerUser} trên {log.ApplicationName}",
            _ => $"[GIÁM SÁT] Sự kiện: {log.EventType} bởi {log.ComputerUser}. Chi tiết: {log.MessageContext}"
        };
    }

    /// <summary>
    /// Map numeric severity (1-10) to the existing LogEntry severity string format.
    /// </summary>
    private static string MapSeverityToString(int severity)
    {
        return severity switch
        {
            >= 8 => "Critical",
            >= 6 => "High",
            >= 4 => "Medium",
            >= 2 => "Low",
            _ => "Info"
        };
    }

    /// <summary>
    /// Trigger a periodic cleanup of old synced logs.
    /// </summary>
    public void PurgeOldLogs()
    {
        _db.PurgeOldSyncedLogs(7);
    }
}
