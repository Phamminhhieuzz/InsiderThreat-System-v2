namespace InsiderThreat.Server.Models
{
    using MongoDB.Bson;
    using MongoDB.Bson.Serialization.Attributes;
    using System.Text.Json.Serialization;

    public class ProjectActivity
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        [JsonPropertyName("id")]
        public string? Id { get; set; }

        [BsonElement("groupId")]
        [BsonRepresentation(BsonType.ObjectId)]
        public string GroupId { get; set; } = string.Empty;

        [BsonElement("userId")]
        public string UserId { get; set; } = string.Empty;

        [BsonElement("type")]
        public string Type { get; set; } = string.Empty; // task, status, file, member

        [BsonElement("action")]
        public string Action { get; set; } = string.Empty;

        [BsonElement("targetName")]
        public string TargetName { get; set; } = string.Empty;

        [BsonElement("createdAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
