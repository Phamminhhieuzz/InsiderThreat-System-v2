namespace InsiderThreat.Server.Models
{
    using MongoDB.Bson;
    using MongoDB.Bson.Serialization.Attributes;
    using System.Text.Json.Serialization;

    public class ProjectTask
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        [JsonPropertyName("id")]
        public string? Id { get; set; }

        [BsonElement("groupId")]
        [BsonRepresentation(BsonType.ObjectId)]
        public string? GroupId { get; set; }

        [BsonElement("title")]
        public string Title { get; set; } = string.Empty;

        [BsonElement("description")]
        public string Description { get; set; } = string.Empty;

        [BsonElement("assignedTo")]
        public string? AssignedTo { get; set; } // UserId

        [BsonElement("status")]
        public string Status { get; set; } = "Todo"; // Todo, InProgress, InReview, Done

        [BsonElement("priority")]
        public string Priority { get; set; } = "Normal"; // Urgent, Normal, Low

        [BsonElement("progress")]
        public int Progress { get; set; } = 0;

        [BsonElement("phase")]
        public string? Phase { get; set; } // Phân nhóm cho Roadmaps/Gantt

        [BsonElement("startDate")]
        public DateTime? StartDate { get; set; }

        [BsonElement("deadline")]
        public DateTime? Deadline { get; set; }

        [BsonElement("createdAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [BsonElement("completedAt")]
        public DateTime? CompletedAt { get; set; }

        [BsonElement("completedBy")]
        public string? CompletedBy { get; set; }
    }
}
