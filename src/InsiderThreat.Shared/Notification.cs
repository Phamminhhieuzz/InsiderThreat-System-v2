using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace InsiderThreat.Shared;

public enum NotificationType
{
    Global,
    Like,
    Comment,
    Mention,
    Report
}

public class Notification
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    public string Type { get; set; } = string.Empty; // "Global", "Like", "Comment", "Mention", "Report"
    public string Message { get; set; } = string.Empty;
    public string? TargetUserId { get; set; } // Null for global, specific user ID for personal
    public string? ActorUserId { get; set; } // Who triggered the notification
    public string? ActorName { get; set; } // Actor's display name
    public string? Link { get; set; } // URL to navigate to when clicked
    public string? RelatedId { get; set; } // Post ID, Comment ID, etc.
    public bool IsRead { get; set; } = false; // NEW: Track read status
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    
    // For tracking reads on Global notifications, we might need a separate collection or array of UserIds who read it.
    // For Personal, simple bool.
    // Let's keep it simple: "Global" notifications show to everyone.
    // "Personal" notifications are for specific actions.
}
