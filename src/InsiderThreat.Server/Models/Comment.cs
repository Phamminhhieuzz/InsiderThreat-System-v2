using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using System;

namespace InsiderThreat.Server.Models
{
    public class Comment
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string? Id { get; set; }

        [BsonElement("postId")]
        [BsonRepresentation(BsonType.ObjectId)]
        public string PostId { get; set; } = string.Empty;

        [BsonElement("authorId")]
        [BsonRepresentation(BsonType.ObjectId)]
        public string AuthorId { get; set; } = string.Empty;

        [BsonElement("authorName")]
        public string AuthorName { get; set; } = string.Empty;

        [BsonElement("authorAvatarUrl")]
        public string? AuthorAvatarUrl { get; set; }

        [BsonElement("content")]
        public string Content { get; set; } = string.Empty;

        [BsonElement("parentCommentId")]
        [BsonRepresentation(BsonType.ObjectId)]
        public string? ParentCommentId { get; set; } // For nested replies

        [BsonElement("likedBy")]
        public List<string> LikedBy { get; set; } = new List<string>();

        [BsonElement("reactions")]
        public Dictionary<string, List<string>> Reactions { get; set; } = new Dictionary<string, List<string>>();

        [BsonElement("createdAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [BsonElement("updatedAt")]
        public DateTime? UpdatedAt { get; set; }
    }
}
