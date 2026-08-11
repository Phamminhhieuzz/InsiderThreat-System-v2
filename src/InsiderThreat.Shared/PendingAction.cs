using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace InsiderThreat.Shared
{
    public enum ActionType
    {
        DeleteUser,
        UpdateUserRole,
        ClearSecurityLogs,
        ChangeSystemConfig
    }

    public enum ActionStatus
    {
        Pending,
        Approved,
        Rejected,
        Expired
    }

    public class PendingAction : BaseModel
    {
        [BsonElement("requestByUserId")]
        public string RequestedByUserId { get; set; } = string.Empty;

        [BsonElement("requestByUserName")]
        public string RequestedByUserName { get; set; } = string.Empty;

        [BsonElement("actionType")]
        public ActionType Type { get; set; }

        [BsonElement("targetId")]
        public string TargetId { get; set; } = string.Empty; // ID của User hoặc Log cần xử lý

        [BsonElement("reason")]
        public string Reason { get; set; } = string.Empty;

        [BsonElement("payload")]
        public string Payload { get; set; } = string.Empty; // Dữ liệu JSON thay đổi (nếu có)

        [BsonElement("status")]
        public ActionStatus Status { get; set; } = ActionStatus.Pending;

        [BsonElement("approvedByUserId")]
        public string? ApprovedByUserId { get; set; }

        [BsonElement("approvedByUserName")]
        public string? ApprovedByUserName { get; set; }

        [BsonElement("processedAt")]
        public DateTime? ProcessedAt { get; set; }

        [BsonElement("expiresAt")]
        public DateTime ExpiresAt { get; set; } = DateTime.UtcNow.AddHours(24);
    }
}
