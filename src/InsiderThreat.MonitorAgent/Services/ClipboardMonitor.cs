using System.Runtime.InteropServices;
using DocumentFormat.OpenXml.Packaging;
using iText.Kernel.Pdf;
using InsiderThreat.MonitorAgent.Models;

namespace InsiderThreat.MonitorAgent.Services;

/// <summary>
/// Monitors the Windows Clipboard for file copy operations (Ctrl+C on files).
/// When a user copies a file that contains an InsiderThreat Tracking ID,
/// this service logs the event as a potential data exfiltration attempt.
/// 
/// It also tracks which application the user switches to after copying,
/// detecting patterns like: Copy file -> Switch to Zalo -> Paste.
/// </summary>
public class ClipboardMonitor
{
    private readonly LocalDatabaseService _db;
    private readonly ServerSyncService _serverSync;
    private readonly ILogger<ClipboardMonitor> _logger;
    
    // Tracks the last copied files that had a tracking ID
    private readonly Dictionary<string, string> _pendingClipboardFiles = new(); // path -> trackingId
    private DateTime _lastClipboardCheck = DateTime.MinValue;
    private string _lastActiveApp = string.Empty;

    // Debounce: avoid duplicate alerts within this window
    private readonly HashSet<string> _recentAlerts = new();

    // Machine info
    private readonly string _computerName = Environment.MachineName;
    private readonly string _computerUser = Environment.UserName;

    public ClipboardMonitor(LocalDatabaseService db, ServerSyncService serverSync, ILogger<ClipboardMonitor> logger)
    {
        _db = db;
        _serverSync = serverSync;
        _logger = logger;
    }

    /// <summary>
    /// Called periodically from MonitorWorker's main loop.
    /// Checks if the clipboard contains file paths and scans them for tracking IDs.
    /// </summary>
    public void CheckClipboard()
    {
        try
        {
            // Only check every 2 seconds to reduce CPU usage
            if ((DateTime.UtcNow - _lastClipboardCheck).TotalMilliseconds < 2000)
                return;
            _lastClipboardCheck = DateTime.UtcNow;

            // Must run on STA thread for clipboard access
            var thread = new Thread(CheckClipboardInternal);
            thread.SetApartmentState(ApartmentState.STA);
            thread.Start();
            thread.Join(3000); // Timeout after 3 seconds
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Error in clipboard monitor check");
        }
    }

    private void CheckClipboardInternal()
    {
        try
        {
            if (!System.Windows.Forms.Clipboard.ContainsFileDropList()) 
            {
                // If clipboard no longer has files, check if user pasted into a suspicious app
                if (_pendingClipboardFiles.Count > 0)
                {
                    var currentApp = DetectionHelper.GetForegroundProcessName();
                    if (IsSuspiciousApp(currentApp) && currentApp != _lastActiveApp)
                    {
                        // User switched to a suspicious app after copying tracked files
                        foreach (var kvp in _pendingClipboardFiles)
                        {
                            LogClipboardLeak(kvp.Key, kvp.Value, currentApp, "Paste/Send");
                        }
                        _pendingClipboardFiles.Clear();
                    }
                }
                return;
            }

            var files = System.Windows.Forms.Clipboard.GetFileDropList();
            if (files == null || files.Count == 0) return;

            // Track which app is currently active
            var activeApp = DetectionHelper.GetForegroundProcessName();
            _lastActiveApp = activeApp;

            foreach (string? filePath in files)
            {
                if (string.IsNullOrEmpty(filePath)) continue;

                var ext = Path.GetExtension(filePath).ToLowerInvariant();
                if (ext != ".docx" && ext != ".pdf") continue;

                // Debounce check
                string alertKey = $"clip_{filePath}_{DateTime.UtcNow:yyyyMMddHHmm}";
                if (_recentAlerts.Contains(alertKey)) continue;

                string? trackingId = ExtractTrackingId(filePath, ext);
                if (string.IsNullOrEmpty(trackingId)) continue;

                _logger.LogWarning("📋 CLIPBOARD: Tracked file copied! {File} (ID: {ID})", 
                    Path.GetFileName(filePath), trackingId);

                // Store for paste detection
                _pendingClipboardFiles[filePath] = trackingId;

                // Log the copy itself
                _recentAlerts.Add(alertKey);
                _ = Task.Delay(60000).ContinueWith(_ => _recentAlerts.Remove(alertKey));

                var log = new MonitorLog
                {
                    EventType = "ClipboardCopy",
                    Severity = 7,
                    DetectedKeyword = trackingId,
                    MessageContext = $"[CẢNH BÁO] Người dùng đã COPY file mật vào Clipboard. " +
                                     $"File: '{Path.GetFileName(filePath)}'. " +
                                     $"\n- Ứng dụng/Website: {DetectionHelper.GetFriendlyTargetName(activeApp, DetectionHelper.GetForegroundWindowTitle())}" +
                                     $"\n- Tracking ID: {trackingId}" +
                                     $"\n- Đường dẫn: {filePath}",
                    ApplicationName = DetectionHelper.GetFriendlyTargetName(activeApp, DetectionHelper.GetForegroundWindowTitle()),
                    WindowTitle = DetectionHelper.GetForegroundWindowTitle(),
                    ComputerUser = _computerUser,
                    ComputerName = _computerName,
                    IpAddress = DetectionHelper.GetLocalIPAddress(),
                    Timestamp = DateTime.UtcNow,
                    RiskAssessment = $"Người dùng {_computerUser} sao chép file mật vào clipboard."
                };

                _db.InsertLog(log);
                // Trigger immediate sync for clipboard copy of tracked file
                _ = Task.Run(() => _serverSync.TriggerImmediateSyncAsync());

                // If already in a suspicious app, log immediately
                if (IsSuspiciousApp(activeApp))
                {
                    LogClipboardLeak(filePath, trackingId, activeApp, "Copy trong ứng dụng");
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Error checking clipboard contents");
        }
    }

    private void LogClipboardLeak(string filePath, string trackingId, string appName, string action)
    {
        string leakKey = $"leak_{filePath}_{appName}";
        if (_recentAlerts.Contains(leakKey)) return;

        _recentAlerts.Add(leakKey);
        _ = Task.Delay(10000).ContinueWith(_ => _recentAlerts.Remove(leakKey)); // Reduced to 10s for more frequent logging as requested

        var friendlyTarget = DetectionHelper.GetFriendlyTargetName(appName, DetectionHelper.GetForegroundWindowTitle());
        var log = new MonitorLog
        {
            EventType = "DocumentLeak",
            Severity = 9,
            DetectedKeyword = trackingId,
            MessageContext = $"[CẢNH BÁO RÒ RỈ CLIPBOARD] File mật đã được dán/gửi qua {friendlyTarget}! " +
                             $"File: '{Path.GetFileName(filePath)}'. Hành động: {action}. " +
                             $"\n- Tracking ID: {trackingId}",
            ApplicationName = friendlyTarget,
            WindowTitle = DetectionHelper.GetForegroundWindowTitle(),
            ComputerUser = _computerUser,
            ComputerName = _computerName,
            IpAddress = DetectionHelper.GetLocalIPAddress(),
            Timestamp = DateTime.UtcNow,
            RiskAssessment = "Rò rỉ tài liệu qua clipboard - Cấp độ nghiêm trọng"
        };

        _logger.LogWarning("🚨 CLIPBOARD LEAK: {App} received tracked file {File}", appName, Path.GetFileName(filePath));
        _db.InsertLog(log);
        // Trigger immediate sync for clipboard leak
        _ = Task.Run(() => _serverSync.TriggerImmediateSyncAsync());
    }

    private static bool IsSuspiciousApp(string processName)
    {
        var lower = processName.ToLowerInvariant();
        return lower.Contains("zalo") ||
               lower.Contains("telegram") ||
               lower.Contains("viber") ||
               lower.Contains("skype") ||
               lower.Contains("messenger") ||
               lower.Contains("discord") ||
               lower.Contains("outlook") ||
               lower.Contains("thunderbird") ||
               lower.Contains("chrome") ||
               lower.Contains("msedge") ||
               lower.Contains("firefox");
    }

    private string? ExtractTrackingId(string filePath, string extension)
    {
        try
        {
            using var fileStream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);

            if (extension == ".docx")
            {
                using var document = WordprocessingDocument.Open(fileStream, false);
                var customPropsPart = document.CustomFilePropertiesPart;
                if (customPropsPart?.Properties != null)
                {
                    var prop = customPropsPart.Properties
                        .Elements<DocumentFormat.OpenXml.CustomProperties.CustomDocumentProperty>()
                        .FirstOrDefault(p => p.Name?.Value == "InsiderThreat:ID");
                    return prop?.VTLPWSTR?.Text;
                }
            }
            else if (extension == ".pdf")
            {
                using var reader = new PdfReader(fileStream);
                using var pdfDoc = new PdfDocument(reader);
                var info = pdfDoc.GetDocumentInfo();
                if (info != null)
                {
                    return info.GetMoreInfo("InsiderThreat:ID");
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Could not read tracking ID from {File}", filePath);
        }

        return null;
    }
    }
