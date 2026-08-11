using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace InsiderThreat.Shared
{
    public class AttendanceConfig
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string? Id { get; set; }

        public string ConfigType { get; set; } = "NetworkSettings";
        public string AllowedIPs { get; set; } = string.Empty; // Comma-separated list of IPs or CIDR blocks. Default empty means allowed everywhere for testing, or we can enforce strict default.
        
        public DateTime UpdatedAt { get; set; } = DateTime.Now;
        public string UpdatedBy { get; set; } = string.Empty;
    }
}
