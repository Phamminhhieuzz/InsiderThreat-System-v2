using System.Diagnostics;
using System.Runtime.InteropServices;
using InsiderThreat.MonitorAgent.Models;

namespace InsiderThreat.MonitorAgent.Services;

/// <summary>
/// Monitors running processes for suspicious applications that could be used
/// to spoof webcam-based Face ID authentication.
/// 
/// Detects:
/// - Virtual camera software (OBS, ManyCam, SplitCam, etc.)
/// - Video manipulation tools (Deepfake generators, video injectors)
/// - Known spoofing utilities
/// </summary>
public class ProcessMonitorService
{
    private readonly ILogger<ProcessMonitorService> _logger;
    private readonly LocalDatabaseService _localDb;

    // Blacklist of suspicious process names (lowercase)
    private static readonly HashSet<string> SuspiciousProcesses = new(StringComparer.OrdinalIgnoreCase)
    {
        // Virtual cameras
        "obs64", "obs32", "obs",
        "manycam",
        "splitcam",
        "xsplit",
        "camtwist",
        "snapcamera",
        "e2esoft",
        "droidcam",
        "iriun",
        "epoccam",
        "avatarify",
        "chromacam",
        "mmhmm",
        "prism",
        // Deepfake / AI face tools
        "deepfacelab",
        "faceswap",
        "reface",
        // Screen capture / injection
        "virtualcam",
        "fakecam",
    };

    // Browser process names to detect when FaceID page is open
    private static readonly HashSet<string> BrowserProcesses = new(StringComparer.OrdinalIgnoreCase)
    {
        "chrome", "msedge", "firefox", "brave", "opera", "vivaldi",
        "chromium", "electron", "tauri",
    };

    public ProcessMonitorService(ILogger<ProcessMonitorService> logger, LocalDatabaseService localDb)
    {
        _logger = logger;
        _localDb = localDb;
    }

    /// <summary>
    /// Check for suspicious processes that could be used for FaceID spoofing.
    /// Returns a list of detected suspicious process names.
    /// </summary>
    public List<SuspiciousProcessInfo> CheckForSuspiciousProcesses()
    {
        var found = new List<SuspiciousProcessInfo>();

        try
        {
            var processes = Process.GetProcesses();

            foreach (var proc in processes)
            {
                try
                {
                    var name = proc.ProcessName;

                    if (SuspiciousProcesses.Contains(name))
                    {
                        found.Add(new SuspiciousProcessInfo
                        {
                            ProcessName = name,
                            ProcessId = proc.Id,
                            WindowTitle = GetMainWindowTitle(proc),
                            FilePath = GetProcessPath(proc),
                        });

                        _logger.LogWarning(
                            "🚨 SUSPICIOUS PROCESS DETECTED: {Name} (PID: {PID})",
                            name, proc.Id);
                    }
                }
                catch (Exception)
                {
                    // Some processes may deny access — ignore
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error checking processes");
        }

        return found;
    }

    /// <summary>
    /// Full scan: check for suspicious processes and log if found.
    /// Called when a browser with camera access is detected.
    /// </summary>
    public void PerformFaceIDGuardScan(string computerUser, string computerName, string ipAddress)
    {
        var suspicious = CheckForSuspiciousProcesses();

        if (suspicious.Count == 0) return;

        var processNames = string.Join(", ", suspicious.Select(s => $"{s.ProcessName} (PID:{s.ProcessId})"));

        var log = new MonitorLog
        {
            EventType = "FaceIDSpoofAttempt",
            Severity = 9, // High severity
            DetectedKeyword = string.Join(", ", suspicious.Select(s => s.ProcessName)),
            MessageContext = $"Phát hiện {suspicious.Count} phần mềm nghi ngờ giả mạo webcam đang chạy: {processNames}",
            ApplicationName = "ProcessMonitor",
            WindowTitle = suspicious.FirstOrDefault()?.WindowTitle,
            ComputerUser = computerUser,
            ComputerName = computerName,
            IpAddress = ipAddress,
            Timestamp = DateTime.UtcNow,
            RiskAssessment = $"[CRITICAL] Người dùng {computerUser} có thể đang sử dụng phần mềm webcam ảo ({processNames}) để giả mạo Face ID. Hành vi này cần được điều tra ngay lập tức."
        };

        _localDb.InsertLog(log);
        _logger.LogCritical(
            "🚨🚨🚨 FACE ID SPOOF ALERT: User={User}, Processes={Processes}",
            computerUser, processNames);
    }

    /// <summary>
    /// Check if any browser is currently accessing the camera
    /// (indicated by the browser having camera permission — heuristic check)
    /// </summary>
    public bool IsBrowserRunning()
    {
        try
        {
            return Process.GetProcesses()
                .Any(p => BrowserProcesses.Contains(p.ProcessName));
        }
        catch
        {
            return false;
        }
    }

    private static string GetMainWindowTitle(Process proc)
    {
        try { return proc.MainWindowTitle; }
        catch { return string.Empty; }
    }

    private static string GetProcessPath(Process proc)
    {
        try { return proc.MainModule?.FileName ?? string.Empty; }
        catch { return string.Empty; }
    }
}

/// <summary>
/// Information about a detected suspicious process
/// </summary>
public class SuspiciousProcessInfo
{
    public string ProcessName { get; set; } = string.Empty;
    public int ProcessId { get; set; }
    public string WindowTitle { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;
}
