using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using System;
using System.Collections.Generic;

namespace InsiderThreat.Server.Models
{
    public class Post
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string? Id { get; set; }

        [BsonElement("authorId")]
        [BsonRepresentation(BsonType.ObjectId)]
        public string AuthorId { get; set; } = string.Empty;

        [BsonElement("authorName")]
        public string AuthorName { get; set; } = string.Empty;

        [BsonElement("authorRole")]
        public string AuthorRole { get; set; } = string.Empty;

        [BsonElement("authorAvatarUrl")]
        public string? AuthorAvatarUrl { get; set; }

        [BsonElement("content")]
        public string Content { get; set; } = string.Empty;

        [BsonElement("mediaFiles")]
        public List<MediaFile> MediaFiles { get; set; } = new List<MediaFile>();

        [BsonElement("privacy")]
        public string Privacy { get; set; } = "Public"; // Public, Friends, OnlyMe

        [BsonElement("likedBy")]
        public List<string> LikedBy { get; set; } = new List<string>();

        [BsonElement("savedBy")]
        public List<string> SavedBy { get; set; } = new List<string>();

        [BsonElement("reactions")]
        public Dictionary<string, List<string>> Reactions { get; set; } = new Dictionary<string, List<string>>();

        [BsonElement("category")]
        public string Category { get; set; } = "General"; // Announcement, HR, Project, Training, Event, Security

        [BsonElement("type")]
        public string Type { get; set; } = "Text"; // Text, Image, Video, File, Link

        [BsonElement("linkInfo")]
        public LinkMetadata? LinkInfo { get; set; }

        [BsonElement("commentCount")]
        public int CommentCount { get; set; } = 0;

        [BsonElement("shareCount")]
        public int ShareCount { get; set; } = 0;

        [BsonElement("createdAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [BsonElement("updatedAt")]
        public DateTime? UpdatedAt { get; set; }

        [BsonElement("isPinned")]
        public bool IsPinned { get; set; } = false;

        [BsonElement("allowedRoles")]
        public List<string> AllowedRoles { get; set; } = new List<string>(); // Empty = All

        [BsonElement("allowedDepartments")]
        public List<string> AllowedDepartments { get; set; } = new List<string>(); // Empty = All

        [BsonElement("isHidden")]
        public bool IsHidden { get; set; } = false; // For moderation or soft delete

        [BsonElement("isUrgent")]
        public bool IsUrgent { get; set; } = false; // Emergency/Critical posts

        [BsonElement("urgentReason")]
        public string? UrgentReason { get; set; } // Optional reason for urgency

        // Poll Support
        [BsonElement("pollOptions")]
        public List<PollOption>? PollOptions { get; set; }

        [BsonElement("multipleChoice")]
        public bool MultipleChoice { get; set; } = false;

        [BsonElement("pollEndsAt")]
        public DateTime? PollEndsAt { get; set; }
    }

    public class PollOption
    {
        [BsonElement("text")]
        public string Text { get; set; } = string.Empty;

        [BsonElement("voterIds")]
        public List<string> VoterIds { get; set; } = new List<string>();
    }

    public class MediaFile
    {
        [BsonElement("type")]
        public string Type { get; set; } = string.Empty; // image, video, file

        [BsonElement("url")]
        public string Url { get; set; } = string.Empty;

        [BsonElement("thumbnailUrl")]
        public string? ThumbnailUrl { get; set; }

        [BsonElement("fileName")]
        public string? FileName { get; set; }

        [BsonElement("fileSize")]
        public long? FileSize { get; set; }
    }

    public class LinkMetadata
    {
        [BsonElement("url")]
        public string Url { get; set; } = string.Empty;

        [BsonElement("title")]
        public string? Title { get; set; }

        [BsonElement("description")]
        public string? Description { get; set; }

        [BsonElement("imageUrl")]
        public string? ImageUrl { get; set; }
    }
}
