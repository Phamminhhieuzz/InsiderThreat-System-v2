using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using System;

namespace InsiderThreat.Server.Models
{
    public class Report
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string? Id { get; set; }

        [BsonElement("postId")]
        [BsonRepresentation(BsonType.ObjectId)]
        public string PostId { get; set; } = string.Empty;

        [BsonElement("reporterId")]
        [BsonRepresentation(BsonType.ObjectId)]
        public string ReporterId { get; set; } = string.Empty;

        [BsonElement("reason")]
        public string Reason { get; set; } = string.Empty;

        [BsonElement("status")]
        public string Status { get; set; } = "Pending"; // Pending, Reviewed, Resolved

        [BsonElement("createdAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
