using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using System.Text.Json.Serialization;

namespace InsiderThreat.Shared
{
    public class User
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)] // Tự động chuyển ObjectId sang string
        [JsonPropertyName("id")]
        public string? Id { get; set; }

        [BsonElement("Username")]
        public string Username { get; set; } = string.Empty;

        [BsonElement("PasswordHash")]
        public string PasswordHash { get; set; } = string.Empty;

        [BsonElement("FullName")]
        public string FullName { get; set; } = string.Empty;

        [BsonElement("Role")]
        public string Role { get; set; } = "User"; // Admin, Manager, User

        // Email for security features
        [BsonElement("Email")]
        public string Email { get; set; } = string.Empty;

        [BsonElement("EmailVerified")]
        public bool EmailVerified { get; set; } = false;

        [BsonElement("Department")]
        public string Department { get; set; } = string.Empty;

        [BsonElement("Position")]
        public string Position { get; set; } = string.Empty;

        [BsonElement("PhoneNumber")]
        public string PhoneNumber { get; set; } = string.Empty;

        [BsonElement("Bio")]
        public string Bio { get; set; } = string.Empty;

        [BsonElement("AvatarUrl")]
        public string? AvatarUrl { get; set; }

        // Mảng chứa vector khuôn mặt (512 chiều hoặc 128 chiều tùy thuật toán)
        [BsonElement("FaceEmbeddings")]
        public double[]? FaceEmbeddings { get; set; }

        // URL ảnh khuôn mặt đăng ký (chụp từ camera)
        [BsonElement("FaceImageUrl")]
        public string? FaceImageUrl { get; set; }

        // E2EE Public Key (Base64 encoded JWK or PEM)
        [BsonElement("PublicKey")]
        public string? PublicKey { get; set; }

        [BsonElement("PrivateKey")]
        public string? PrivateKey { get; set; } // Stored for multi-device sync (protected by PIN)

        [BsonElement("ChatAccessCodeHash")]
        public string? ChatAccessCodeHash { get; set; } // Hashed 6-digit code

        // Ràng buộc đăng nhập với thiết bị phần cứng cụ thể
        [BsonElement("RegisteredMachineId")]
        public string? RegisteredMachineId { get; set; }

        // Bắt buộc đổi mật khẩu trong lần đăng nhập đầu tiên
        [BsonElement("RequiresPasswordChange")]
        public bool RequiresPasswordChange { get; set; } = true;

        [BsonElement("ManagerId")]
        public string? ManagerId { get; set; }
        
        // Annual Leave balance
        [BsonElement("AnnualLeaveBalance")]
        public int AnnualLeaveBalance { get; set; } = 12;

        // Định danh cuộc trò chuyện Telegram, dùng để gửi mã OTP.
        // Bot Telegram chỉ nhắn được cho người đã bấm Start với nó, nên giá trị này
        // chỉ có sau khi người dùng tự liên kết tài khoản một lần.
        [BsonElement("TelegramChatId")]
        public string? TelegramChatId { get; set; }

        [BsonElement("CreatedAt")]
        public DateTime CreatedAt { get; set; } = DateTime.Now;
    }
}