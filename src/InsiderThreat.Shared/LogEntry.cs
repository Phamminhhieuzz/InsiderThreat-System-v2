using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace InsiderThreat.Shared
{
    public class LogEntry
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string? Id { get; set; }

        public string LogType { get; set; } = "INFO"; // USB_INSERT, VPN_DETECT, FACE_FAIL
        public string Severity { get; set; } = "Low"; // Critical, Warning, Info
        public string Message { get; set; } = string.Empty;

        public string ComputerName { get; set; } = string.Empty;
        public string IPAddress { get; set; } = string.Empty;

        public string ActionTaken { get; set; } = "None"; // Blocked, Reported
        
        // USB Device specific fields
        public string? DeviceId { get; set; }  // Full DeviceId (USB\VID_XXXX&PID_YYYY\Serial)
        public string? DeviceName { get; set; }  // Device friendly name

        public DateTime Timestamp { get; set; } = DateTime.Now;
    }
}