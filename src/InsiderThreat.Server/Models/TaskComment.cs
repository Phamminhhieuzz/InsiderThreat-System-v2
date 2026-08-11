namespace InsiderThreat.Server.Models
{
    using MongoDB.Bson;
    using MongoDB.Bson.Serialization.Attributes;
    using System.Text.Json.Serialization;

    public class TaskComment
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        [JsonPropertyName("id")]
        public string? Id { get; set; }

        [BsonElement("taskId")]
        public string TaskId { get; set; } = string.Empty;

        [BsonElement("userId")]
        public string UserId { get; set; } = string.Empty;

        [BsonElement("parentId")]
        public string? ParentId { get; set; }

        [BsonElement("content")]
        public string Content { get; set; } = string.Empty;

        [BsonElement("attachmentUrl")]
        public string? AttachmentUrl { get; set; }

        [BsonElement("attachmentName")]
        public string? AttachmentName { get; set; }

        [BsonElement("attachmentSize")]
        public long? AttachmentSize { get; set; }

        [BsonElement("createdAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [BsonElement("updatedAt")]
        public DateTime? UpdatedAt { get; set; }
    }
}
