namespace InsiderThreat.Shared
{
    public enum AlertLevel
    {
        Low,
        Medium,
        High,
        Critical
    }

    public class AlertModel : BaseModel
    {
        public string MachineName { get; set; } = string.Empty;
        public string AffectedUser { get; set; } = string.Empty;
        public AlertLevel Level { get; set; } = AlertLevel.Low;
        public string Title { get; set; } = string.Empty; // e.g., "Suspicious File Transfer"
        public string Description { get; set; } = string.Empty;
        public string RuleName { get; set; } = string.Empty; // Rule that triggered the alert
        public bool IsResolved { get; set; } = false;
        public string? ResolutionComment { get; set; }
        public DateTime TriggeredAt { get; set; } = DateTime.UtcNow;

        // 🛡️ SECURITY CHAIN (Chuỗi bảo mật bất biến)
        public string? PreviousHash { get; set; }
        public string? CurrentHash { get; set; }
    }
}
