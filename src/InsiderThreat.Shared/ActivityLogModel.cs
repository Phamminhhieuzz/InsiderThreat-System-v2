namespace InsiderThreat.Shared
{
    public enum ActivityType
    {
        AppOpen,
        AppClose,
        Keystroke,
        FileAccess,
        NetworkAccess,
        Screenshot,
        UsbDevice
    }

    public class ActivityLogModel : BaseModel
    {
        public string MachineName { get; set; } = string.Empty;
        public string UserAccount { get; set; } = string.Empty;
        public ActivityType Type { get; set; }
        public string ActivityDetail { get; set; } = string.Empty; // e.g., "notepad.exe", "typed: secret message"
        public string Severity { get; set; } = "Info"; // Info, Warning, Critical
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }
}
