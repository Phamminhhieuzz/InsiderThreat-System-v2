using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace InsiderThreat.Shared
{
    public class Device
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string? Id { get; set; }

        public string Name { get; set; } = string.Empty; // Friendly Name (e.g., Kingston USB)
        public string DeviceId { get; set; } = string.Empty; // Unique Serial/Hardware ID
        public bool IsAllowed { get; set; } = false; // Whitelist status
        public string Description { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.Now;
    }
}
