using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace InsiderThreat.Server.Models;

public class Message
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    public string SenderId { get; set; } = string.Empty;
    public string ReceiverId { get; set; } = string.Empty;
    
    // Identifies the public group this message belongs to
    [BsonRepresentation(BsonType.ObjectId)]
    public string? GroupId { get; set; }

    // Encrypted Content for Receiver (Base64 string)
    public string Content { get; set; } = string.Empty;

    // Encrypted Content for Sender (Base64 string) - so they can read their history
    public string? SenderContent { get; set; }

    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    public bool IsRead { get; set; } = false;

    // Attachments
    public string? AttachmentUrl { get; set; }
    public string? AttachmentType { get; set; } // "image", "file"
    public string? AttachmentName { get; set; }

    // Soft-delete: list of userIds who deleted this message for themselves
    public List<string>? DeletedFor { get; set; }

    // Edit tracking
    public bool IsEdited { get; set; } = false;
}
