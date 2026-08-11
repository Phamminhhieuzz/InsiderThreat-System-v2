using System.Runtime.InteropServices;

namespace InsiderThreat.MonitorAgent.Services;

/// <summary>
/// Monitors clipboard changes for screenshot content.
/// Detects when an image is placed on the clipboard (PrintScreen, Snipping Tool, etc.).
/// Also monitors for Snipping Tool/Snip & Sketch process launches.
/// </summary>
public class ScreenshotMonitorService
{
    // Win32 clipboard APIs
    [DllImport("user32.dll")]
    private static extern bool IsClipboardFormatAvailable(uint format);

    [DllImport("user32.dll")]
    private static extern bool OpenClipboard(IntPtr hWndNewOwner);

    [DllImport("user32.dll")]
    private static extern bool CloseClipboard();

    private const uint CF_BITMAP = 2;
    private const uint CF_DIB = 8;

    private readonly ILogger<ScreenshotMonitorService> _logger;
    private bool _lastClipboardHadImage = false;

    public event Action<string>? OnScreenshotDetected; // Passes the tool name

    public ScreenshotMonitorService(ILogger<ScreenshotMonitorService> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Check if the clipboard currently contains an image (bitmap).
    /// Should be called periodically to detect new screenshots.
    /// </summary>
    public void CheckClipboardForScreenshot()
    {
        try
        {
            bool hasImage = IsClipboardFormatAvailable(CF_BITMAP) || IsClipboardFormatAvailable(CF_DIB);

            if (hasImage && !_lastClipboardHadImage)
            {
                // New image detected in clipboard - likely a screenshot
                _logger.LogWarning("📸 Screenshot detected in clipboard!");
                
                // Try to detect which tool was used
                string tool = DetectScreenshotTool();
                OnScreenshotDetected?.Invoke(tool);
            }

            _lastClipboardHadImage = hasImage;
        }
        catch (Exception ex)
        {
            _logger.LogDebug("Clipboard check error: {Error}", ex.Message);
        }
    }

    /// <summary>
    /// Detect which screenshot tool is currently running.
    /// </summary>
    private string DetectScreenshotTool()
    {
        var screenshotProcesses = new Dictionary<string, string>
        {
            { "SnippingTool", "Snipping Tool" },
            { "ScreenClippingHost", "Snip & Sketch" },
            { "ScreenSketch", "Snip & Sketch" },
            { "Greenshot", "Greenshot" },
            { "LightShot", "LightShot" },
            { "ShareX", "ShareX" },
            { "Lightscreen", "Lightscreen" },
            { "snippingtool", "Snipping Tool" }
        };

        try
        {
            var processes = System.Diagnostics.Process.GetProcesses();
            foreach (var proc in processes)
            {
                if (screenshotProcesses.TryGetValue(proc.ProcessName, out string? toolName))
                {
                    return toolName;
                }
            }
        }
        catch { /* Ignore process enumeration errors */ }

        return "PrintScreen / Unknown Tool";
    }

    /// <summary>
    /// Check for suspicious screenshot-related process launches.
    /// </summary>
    public bool IsScreenshotToolRunning()
    {
        try
        {
            var suspiciousProcesses = new[] { "SnippingTool", "ScreenClippingHost", "ScreenSketch", "Greenshot", "ShareX" };
            var runningProcesses = System.Diagnostics.Process.GetProcesses()
                .Select(p => p.ProcessName)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            return suspiciousProcesses.Any(sp => runningProcesses.Contains(sp));
        }
        catch
        {
            return false;
        }
    }
}
