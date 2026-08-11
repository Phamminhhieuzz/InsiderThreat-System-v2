namespace InsiderThreat.Shared
{
    public class DeviceModel : BaseModel
    {
        public string MachineName { get; set; } = string.Empty;
        public string IPAddress { get; set; } = string.Empty;
        public string OSVersion { get; set; } = string.Empty;
        public string MacAddress { get; set; } = string.Empty;
        public string RegisteredUser { get; set; } = string.Empty; // User currently logged into the machine
        public bool IsActive { get; set; } = true;
        public DateTime LastSeen { get; set; } = DateTime.UtcNow;
    }
}
