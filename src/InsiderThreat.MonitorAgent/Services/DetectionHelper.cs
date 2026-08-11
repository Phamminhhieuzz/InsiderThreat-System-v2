using System;
using System.Collections.Generic;
using System.Linq;

namespace InsiderThreat.MonitorAgent.Services
{
    public static class DetectionHelper
    {
        public static string GetFriendlyTargetName(string processName, string windowTitle)
        {
            if (string.IsNullOrEmpty(processName) || processName == "Unknown")
                return "Hệ thống / Unknown";

            var pLower = processName.ToLowerInvariant();
            var tLower = (windowTitle ?? "").ToLowerInvariant();

            // 1. Explicit UI/Host Frameworks (UWP, Electron, etc.)
            if (pLower.Contains("applicationframehost") || pLower.Contains("wwahost") || pLower.Contains("electron"))
            {
                if (tLower.Contains("zalo")) return "Zalo Desktop";
                if (tLower.Contains("telegram")) return "Telegram Desktop";
                if (tLower.Contains("messenger")) return "Messenger Desktop";
                if (tLower.Contains("skype")) return "Skype Desktop";
                if (tLower.Contains("viber")) return "Viber Desktop";
                if (tLower.Contains("discord")) return "Discord";
            }

            // 2. Chat Apps - Desktop versions (Check process first, then title)
            if (pLower.Contains("zalo") || tLower.Contains("zalo")) return "Zalo Desktop";
            if (pLower.Contains("telegram") || tLower.Contains("telegram")) return "Telegram Desktop";
            if (pLower.Contains("skype") || tLower.Contains("skype")) return "Skype Desktop";
            if (pLower.Contains("viber") || tLower.Contains("viber")) return "Viber Desktop";
            if (pLower.Contains("discord") || tLower.Contains("discord")) return "Discord App";
            if (pLower.Contains("slack") || tLower.Contains("slack")) return "Slack Desktop";
            if (pLower.Contains("messenger") || tLower.Contains("messenger")) return "Messenger Desktop";

            // 3. Browsers - Detailed website detection
            if (pLower.Contains("chrome") || pLower.Contains("msedge") || pLower.Contains("firefox") || pLower.Contains("opera") || pLower.Contains("brave") || pLower.Contains("coccoc"))
            {
                if (tLower.Contains("gmail") || tLower.Contains("mail.google")) return "Gmail";
                if (tLower.Contains("outlook") || tLower.Contains("live.com")) return "Outlook (Web)";
                if (tLower.Contains("drive.google")) return "Google Drive";
                if (tLower.Contains("dropbox")) return "Dropbox (Web)";
                if (tLower.Contains("github")) return "GitHub";
                if (tLower.Contains("chatgpt") || tLower.Contains("openai")) return "ChatGPT";
                
                return $"Trình duyệt ({processName})";
            }

            // 4. Cloud/Storage
            if (pLower.Contains("onedrive")) return "OneDrive";
            if (pLower.Contains("dropbox")) return "Dropbox Desktop";
            if (pLower.Contains("googledrivesync")) return "Google Drive Sync";

            // 5. Email clients
            if (pLower.Contains("outlook")) return "Microsoft Outlook";
            if (pLower.Contains("thunderbird")) return "Thunderbird";

            // 6. File managers / Transfer
            if (pLower.Contains("explorer")) return "Windows Explorer";
            if (pLower.Contains("filezilla")) return "FileZilla (FTP)";
            if (pLower.Contains("totalcmd")) return "Total Commander";

            return processName;
        }

        #region Win32 Helpers

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [System.Runtime.InteropServices.DllImport("user32.dll", SetLastError = true)]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
        private static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);

        public static string GetForegroundProcessName()
        {
            try
            {
                var hwnd = GetForegroundWindow();
                GetWindowThreadProcessId(hwnd, out uint pid);
                var proc = System.Diagnostics.Process.GetProcessById((int)pid);
                return proc.ProcessName;
            }
            catch
            {
                return "Unknown";
            }
        }

        public static string GetForegroundWindowTitle()
        {
            try
            {
                var hwnd = GetForegroundWindow();
                var sb = new System.Text.StringBuilder(256);
                GetWindowText(hwnd, sb, 256);
                return sb.ToString();
            }
            catch
            {
                return "Unknown";
            }
        }

        public static string GetLocalIPAddress()
        {
            try
            {
                var host = System.Net.Dns.GetHostEntry(System.Net.Dns.GetHostName());
                foreach (var ip in host.AddressList)
                {
                    if (ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                        return ip.ToString();
                }
            }
            catch { }
            return "127.0.0.1";
        }

        #endregion
    }
}
