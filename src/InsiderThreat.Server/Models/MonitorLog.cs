using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using System.Text.Json.Serialization;

namespace InsiderThreat.Server.Models
{
    /// <summary>
    /// Server-side model for monitoring logs received from the MonitorAgent.
    /// Stored in MongoDB "MonitorLogs" collection.
    /// </summary>
    public class MonitorLog
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        [JsonPropertyName("id")]
        public string? Id { get; set; }

        [BsonElement("logType")]
        [JsonPropertyName("logType")]
        public string LogType { get; set; } = string.Empty;

        [BsonElement("severity")]
        [JsonPropertyName("severity")]
        public string Severity { get; set; } = "Info";

        [BsonElement("severityScore")]
        [JsonPropertyName("severityScore")]
        public int SeverityScore { get; set; }

        [BsonElement("message")]
        [JsonPropertyName("message")]
        public string Message { get; set; } = string.Empty;

        [BsonElement("computerName")]
        [JsonPropertyName("computerName")]
        public string ComputerName { get; set; } = string.Empty;

        [BsonElement("ipAddress")]
        [JsonPropertyName("ipAddress")]
        public string IpAddress { get; set; } = string.Empty;

        [BsonElement("actionTaken")]
        [JsonPropertyName("actionTaken")]
        public string ActionTaken { get; set; } = string.Empty;

        [BsonElement("detectedKeyword")]
        [JsonPropertyName("detectedKeyword")]
        public string? DetectedKeyword { get; set; }

        [BsonElement("messageContext")]
        [JsonPropertyName("messageContext")]
        public string? MessageContext { get; set; }

        [BsonElement("applicationName")]
        [JsonPropertyName("applicationName")]
        public string? ApplicationName { get; set; }

        [BsonElement("windowTitle")]
        [JsonPropertyName("windowTitle")]
        public string? WindowTitle { get; set; }

        [BsonElement("computerUser")]
        [JsonPropertyName("computerUser")]
        public string? ComputerUser { get; set; }

        [BsonElement("timestamp")]
        [JsonPropertyName("timestamp")]
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }
}
