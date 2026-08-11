using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using System;

namespace InsiderThreat.Server.Models
{
    public class Notification
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string? Id { get; set; }

        [BsonElement("userId")]
        [BsonRepresentation(BsonType.ObjectId)]
        public string UserId { get; set; } = string.Empty;

        [BsonElement("type")]
        public string Type { get; set; } = string.Empty; // like, comment, mention, friend_request, etc.

        [BsonElement("actorId")]
        [BsonRepresentation(BsonType.ObjectId)]
        public string ActorId { get; set; } = string.Empty;

        [BsonElement("actorName")]
        public string ActorName { get; set; } = string.Empty;

        [BsonElement("postId")]
        [BsonRepresentation(BsonType.ObjectId)]
        public string? PostId { get; set; }

        [BsonElement("commentId")]
        [BsonRepresentation(BsonType.ObjectId)]
        public string? CommentId { get; set; }

        [BsonElement("message")]
        public string Message { get; set; } = string.Empty;

        [BsonElement("isRead")]
        public bool IsRead { get; set; } = false;

        [BsonElement("createdAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
