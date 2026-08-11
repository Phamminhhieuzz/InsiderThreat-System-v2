namespace InsiderThreat.Server.Models
{
    public class MonitorSummary
    {
        public int TotalToday { get; set; }
        public int CriticalToday { get; set; }
        public int ScreenshotsToday { get; set; }
        public int KeywordsToday { get; set; }
        public int DisconnectsToday { get; set; }
    }
}
