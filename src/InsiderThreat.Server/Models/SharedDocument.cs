using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace InsiderThreat.Server.Models
{
    public class SharedDocument
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string? Id { get; set; }

        [BsonRepresentation(BsonType.ObjectId)]
        public string FileId { get; set; } = null!; // GridFS File ID

        public string FileName { get; set; } = null!;
        public string ContentType { get; set; } = null!;
        public string UploaderName { get; set; } = null!;
        public string UploaderId { get; set; } = null!;
        public long Size { get; set; }
        public DateTime UploadDate { get; set; } = DateTime.UtcNow;
        public string? Description { get; set; }
        public string MinimumRole { get; set; } = "Nhân viên"; // Default role
        public List<string> AllowedUserIds { get; set; } = new(); // Specific users granted access
        public List<string> AllowedDownloadUserIds { get; set; } = new(); // Users allowed to download
        public bool RequireCamera { get; set; } = true;
        public bool RequireWatermark { get; set; } = true;
        public bool EnableAgentMonitoring { get; set; } = true;
        public bool DisableMobileDownload { get; set; } = false;

        // Categorization & Classification
        public string Department { get; set; } = "General"; // Engineering, Product, Security, Business, HR, etc.
        public string SecurityLevel { get; set; } = "Internal"; // Public, Internal, Confidential, Restricted
    }
}
