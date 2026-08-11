using System.IO;
using System.Management;
using System.Collections.Concurrent;
using System.Diagnostics;
using DocumentFormat.OpenXml.Packaging;
using iText.Kernel.Pdf;
using InsiderThreat.MonitorAgent.Models;

namespace InsiderThreat.MonitorAgent.Services;

public class FileTrackerService : BackgroundService
{
    private readonly LocalDatabaseService _db;
    private readonly ServerSyncService _serverSync;
    private readonly ILogger<FileTrackerService> _logger;
    private readonly List<FileSystemWatcher> _watchers = new();
    private ManagementEventWatcher? _usbWatcher;
    private readonly HashSet<string> _recentlyAlertedFiles = new();

    public class TrackedFileInfo 
    {
        public DateTime TrackedSince { get; set; }
        public string TrackingId { get; set; } = string.Empty;
    }
    
    // Key: FilePath, Value: TrackedFileInfo
    private readonly ConcurrentDictionary<string, TrackedFileInfo> _trackedFiles = new();

    public FileTrackerService(LocalDatabaseService db, ServerSyncService serverSync, ILogger<FileTrackerService> logger)
    {
        _db = db;
        _serverSync = serverSync;
        _logger = logger;
    }

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Starting FileTrackerService to monitor watermarked documents...");

        // Start monitoring user directories
        var userPath = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var dirsToWatch = new[] { 
            Path.Combine(userPath, "Downloads"),
            Path.Combine(userPath, "Desktop"),
            Path.Combine(userPath, "Documents"),
            Path.Combine(userPath, "OneDrive", "Desktop"),
            Path.Combine(userPath, "OneDrive", "Documents")
        };

        foreach (var dir in dirsToWatch)
        {
            if (Directory.Exists(dir))
            {
                StartWatcher(dir);
            }
        }

        // Monitor existing USB drives
        foreach (var drive in DriveInfo.GetDrives().Where(d => d.DriveType == DriveType.Removable && d.IsReady))
        {
            StartWatcher(drive.RootDirectory.FullName);
        }

        // Start WMI USB Plugging Monitor
        StartUsbMonitor();

        // Start active process handle tracking for Drag-and-Drop detection
        _ = Task.Run(async () =>
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                await TrackOpenHandlesAsync();
                await Task.Delay(2000, stoppingToken); // Poll every 2 seconds
            }
        }, stoppingToken);

        return Task.CompletedTask;
    }

    private void StartWatcher(string path)
    {
        try
        {
            var watcher = new FileSystemWatcher(path)
            {
                NotifyFilter = NotifyFilters.FileName | NotifyFilters.CreationTime | NotifyFilters.LastWrite,
                IncludeSubdirectories = true,
                EnableRaisingEvents = true
            };

            watcher.Created += OnFileEvent;
            watcher.Renamed += OnFileEvent;
            watcher.Changed += OnFileEvent;

            _watchers.Add(watcher);
            _logger.LogInformation("Tracking files in {Path}", path);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to start FileSystemWatcher for {Path}", path);
        }
    }

    private void StartUsbMonitor()
    {
        try
        {
            var query = new WqlEventQuery("SELECT * FROM __InstanceCreationEvent WITHIN 2 WHERE TargetInstance ISA 'Win32_LogicalDisk'");
            _usbWatcher = new ManagementEventWatcher(query);
            _usbWatcher.EventArrived += (s, e) =>
            {
                var instance = (ManagementBaseObject)e.NewEvent["TargetInstance"];
                var deviceId = instance["DeviceID"]?.ToString();
                var driveType = Convert.ToInt32(instance["DriveType"]);

                // DriveType 2 = Removable Disk
                if (driveType == 2 && !string.IsNullOrEmpty(deviceId))
                {
                    _logger.LogInformation("USB Drive plugged in: {DeviceID}. Starting watcher...", deviceId);
                    StartWatcher(deviceId + "\\");
                }
            };
            _usbWatcher.Start();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start USB Monitor. WMI query issue or missing permissions.");
        }
    }

    private void OnFileEvent(object sender, FileSystemEventArgs e)
    {
        var ext = Path.GetExtension(e.FullPath).ToLowerInvariant();
        if (ext == ".docx" || ext == ".pdf")
        {
            // Debounce to prevent multiple alerts for the same file action
            if (_recentlyAlertedFiles.Contains(e.FullPath)) return;

            _ = Task.Run(async () => {
                // Retry up to 3 times with exponential backoff for locked files
                for (int attempt = 1; attempt <= 3; attempt++)
                {
                    await Task.Delay(1500 * attempt); // 1.5s, 3s, 4.5s
                    try
                    {
                        CheckWatermark(e.FullPath, ext, e.ChangeType.ToString());
                        break; // Success, exit retry loop
                    }
                    catch (IOException) when (attempt < 3)
                    {
                        _logger.LogDebug("File {Path} is locked, retry {Attempt}/3...", e.FullPath, attempt);
                    }
                }
            });
        }
    }

    private void CheckWatermark(string path, string extension, string actionType)
    {
        if (!File.Exists(path)) return;

        string? trackingId = null;
        try
        {
            // Always read-only with full FileShare to avoid locking issues while file is used by other apps
            using var fileStream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);

            if (extension == ".docx")
            {
                using var document = WordprocessingDocument.Open(fileStream, false);
                var customPropsPart = document.CustomFilePropertiesPart;
                if (customPropsPart?.Properties != null)
                {
                    var prop = customPropsPart.Properties.Elements<DocumentFormat.OpenXml.CustomProperties.CustomDocumentProperty>()
                        .FirstOrDefault(p => p.Name?.Value == "InsiderThreat:ID");
                    trackingId = prop?.VTLPWSTR?.Text;
                }
            }
            else if (extension == ".pdf")
            {
                using var reader = new PdfReader(fileStream);
                using var pdfDoc = new PdfDocument(reader);
                var info = pdfDoc.GetDocumentInfo();
                trackingId = info.GetMoreInfo("InsiderThreat:ID");
            }

            if (string.IsNullOrEmpty(trackingId))
            {
                _logger.LogDebug("Checked {Path}, but no InsiderThreat watermark found.", path);
                return;
            }

            if (!string.IsNullOrEmpty(trackingId))
            {
                // Identify the "Source/Target" based on path
                string detectionSource = "Hệ thống File";
                string appName = "System File Explorer";
                var driveRoot = Path.GetPathRoot(path);
                
                if (!string.IsNullOrEmpty(driveRoot))
                {
                    var driveInfo = new DriveInfo(driveRoot);
                    if (driveInfo.DriveType == DriveType.Removable)
                    {
                        detectionSource = "USB / Thiết bị Di động";
                        appName = $"USB Drive ({driveRoot})";
                    }
                }

                _logger.LogWarning("DETECTED [{Source}]: {Path}. Tracking ID: {ID}", detectionSource, path, trackingId);
                
                // Track for 30 minutes for Handle Scanning (Drag and Drop detection)
                _trackedFiles[path] = new TrackedFileInfo { TrackedSince = DateTime.UtcNow, TrackingId = trackingId };

                // Add to recent cache
                _recentlyAlertedFiles.Add(path);
                _ = Task.Delay(10000).ContinueWith(_ => _recentlyAlertedFiles.Remove(path)); // Reduced to 10s for more frequent logging as requested

                // Check for known app folders
                var pathLower = path.ToLowerInvariant();
                if (pathLower.Contains("zalo received files") || pathLower.Contains("zalo"))
                {
                    detectionSource = "Ứng dụng Chat";
                    appName = "Zalo";
                }
                else if (pathLower.Contains("telegram"))
                {
                    detectionSource = "Ứng dụng Chat";
                    appName = "Telegram";
                }
                else if (pathLower.Contains("chrome") || pathLower.Contains("download"))
                {
                    detectionSource = "Trình duyệt / Tải về";
                    appName = "Chrome/Browser";
                }

                var log = new MonitorLog
                {
                    EventType = "DocumentLeak",
                    Severity = 9,
                    DetectedKeyword = trackingId,
                    MessageContext = $"[CẢNH BÁO RÒ RỈ] Phát hiện tài liệu mật tại {detectionSource}. " +
                                     $"File: '{Path.GetFileName(path)}'. Hành động: {actionType}. " +
                                     $"\n- Ứng dụng/Vị trí: {DetectionHelper.GetFriendlyTargetName(appName, DetectionHelper.GetForegroundWindowTitle())}" +
                                     $"\n- Nguồn gốc định danh (Watermark): {trackingId}",
                    ApplicationName = DetectionHelper.GetFriendlyTargetName(appName, DetectionHelper.GetForegroundWindowTitle()),
                    ComputerUser = Environment.UserName,
                    ComputerName = Environment.MachineName,
                    IpAddress = DetectionHelper.GetLocalIPAddress(),
                    Timestamp = DateTime.UtcNow,
                    RiskAssessment = "Rò rỉ tài liệu cấp độ nghiêm trọng"
                };

                _db.InsertLog(log);
                // Trigger immediate sync for document leak
                _ = Task.Run(() => _serverSync.TriggerImmediateSyncAsync());
            }
        }
        catch (Exception)
        {
            // Ignore lock or permission exceptions
        }
    }


    private async Task TrackOpenHandlesAsync()
    {
        await Task.Yield(); // Suppress CS1998
        var now = DateTime.UtcNow;
        var toRemove = new List<string>();

        foreach (var kvp in _trackedFiles)
        {
            if (now - kvp.Value.TrackedSince > TimeSpan.FromMinutes(30)) 
            {
                toRemove.Add(kvp.Key);
                continue;
            }

            try
            {
                if (!File.Exists(kvp.Key))
                {
                    toRemove.Add(kvp.Key);
                    continue;
                }

                var processes = FileProcessTracker.GetLockingProcesses(kvp.Key);
                foreach (var p in processes)
                {
                    string pName = p.ProcessName.ToLowerInvariant();
                    string appName = "";

                    if (pName.Contains("zalo"))
                    {
                        appName = "Zalo";
                    }
                    else if (pName.Contains("telegram"))
                    {
                        appName = "Telegram";
                    }
                    else if (pName.Contains("msedge") || pName.Contains("chrome"))
                    {
                        // Browser uploaded
                        appName = p.ProcessName;
                    }

                    if (!string.IsNullOrEmpty(appName))
                    {
                        string leakKey = $"{kvp.Key}_{appName}";
                        if (_recentlyAlertedFiles.Contains(leakKey)) continue;

                        _recentlyAlertedFiles.Add(leakKey);
                        _ = Task.Delay(10000).ContinueWith(_ => _recentlyAlertedFiles.Remove(leakKey)); // Reduced to 10s for more frequent logging as requested

                        var log = new MonitorLog
                        {
                            EventType = "DocumentLeak",
                            Severity = 9,
                            DetectedKeyword = kvp.Value.TrackingId,
                            MessageContext = $"[CẢNH BÁO RÒ RỈ DRAG-AND-DROP] Tài liệu mật đang bị mở/đọc bởi {DetectionHelper.GetFriendlyTargetName(p.ProcessName, p.MainWindowTitle)} qua hành vi kéo thả! " +
                                             $"File: '{Path.GetFileName(kvp.Key)}'. " +
                                             $"\n- Nguồn gốc định danh (Watermark): {kvp.Value.TrackingId}",
                            ApplicationName = DetectionHelper.GetFriendlyTargetName(p.ProcessName, p.MainWindowTitle),
                            ComputerUser = Environment.UserName,
                            ComputerName = Environment.MachineName,
                            IpAddress = DetectionHelper.GetLocalIPAddress(),
                            Timestamp = DateTime.UtcNow,
                            RiskAssessment = "Rò rỉ tài liệu kéo thả vào ứng dụng trái phép"
                        };

                        _logger.LogWarning("🚨 DRAG & DROP LEAK: {App} opened {File}", appName, kvp.Key);
                        _db.InsertLog(log);
                        // Trigger immediate sync for drag-drop leak
                        _ = Task.Run(() => _serverSync.TriggerImmediateSyncAsync());
                    }
                }
            }
            catch { }
        }

        foreach (var key in toRemove) _trackedFiles.TryRemove(key, out _);
    }

    public override void Dispose()
    {
        foreach (var watcher in _watchers) watcher.Dispose();
        _usbWatcher?.Dispose();
        base.Dispose();
    }
}
