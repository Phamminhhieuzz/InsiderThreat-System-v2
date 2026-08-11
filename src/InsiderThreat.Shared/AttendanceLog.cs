using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace InsiderThreat.Shared
{
    public class AttendanceLog
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string? Id { get; set; }

        public string UserId { get; set; } = string.Empty;
        public string UserName { get; set; } = string.Empty;
        public DateTime CheckInTime { get; set; } = DateTime.Now;
        public string Method { get; set; } = "FaceID"; // "FaceID", "Password"

        // Security audit fields
        public double MatchConfidence { get; set; } // Euclidean distance (lower = better match)
        public string IpAddress { get; set; } = string.Empty;
        public bool LivenessVerified { get; set; } // true if passed liveness challenge
    }
}
