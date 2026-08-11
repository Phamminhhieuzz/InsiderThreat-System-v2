using System.Runtime.InteropServices;

namespace InsiderThreat.AdminApp
{
    public static class NativeMethods
    {
        /// <summary>
        /// Xác định cách hiển thị cửa sổ trong các bản chụp màn hình (screenshots) hoặc quay video.
        /// </summary>
        [DllImport("user32.dll")]
        public static extern bool SetWindowDisplayAffinity(IntPtr hWnd, uint dwAffinity);

        // Hằng số bảo mật:
        // WDA_NONE = 0x00: Không có bảo vệ.
        // WDA_MONITOR = 0x01: Cửa sổ hiện màu đen trong bản chụp/quay màn hình.
        // WDA_EXCLUDEFROMCAPTURE = 0x11: Cửa sổ hoàn toàn biến mất khỏi bản chụp (Dành cho Win 10 bản 2004 trở lên).
        public const uint WDA_MONITOR = 0x00000001;
        public const uint WDA_EXCLUDEFROMCAPTURE = 0x00000011;
    }
}
