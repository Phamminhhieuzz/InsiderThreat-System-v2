namespace InsiderThreat.MonitorAgent.Models;

/// <summary>
/// Represents a single monitoring event detected by the agent.
/// This is the core data model that gets stored locally (SQLite) and synced to the server.
/// </summary>
public class MonitorLog
{
    public long Id { get; set; }
    
    /// <summary>Type of event: "Screenshot", "KeywordDetected", "NetworkDisconnect"</summary>
    public string EventType { get; set; } = string.Empty;
    
    /// <summary>Risk severity level from 1 (low) to 10 (critical)</summary>
    public int Severity { get; set; }

    /// <summary>The sensitive keyword(s) that triggered the alert</summary>
    public string? DetectedKeyword { get; set; }

    /// <summary>The full text/message context containing the keyword</summary>
    public string? MessageContext { get; set; }

    /// <summary>Name of the application where the event was detected (e.g., Zalo, Chrome, Telegram)</summary>
    public string? ApplicationName { get; set; }

    /// <summary>Title of the active window at the time of detection</summary>
    public string? WindowTitle { get; set; }

    /// <summary>Windows username of the logged-in user</summary>
    public string ComputerUser { get; set; } = string.Empty;

    /// <summary>Machine/hostname</summary>
    public string ComputerName { get; set; } = string.Empty;

    /// <summary>IP address of the machine</summary>
    public string IpAddress { get; set; } = string.Empty;

    /// <summary>Timestamp of the event (UTC)</summary>
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    /// <summary>Whether this log has been successfully synced to the server</summary>
    public bool IsSynced { get; set; } = false;

    /// <summary>AI-generated risk assessment description</summary>
    public string? RiskAssessment { get; set; }
}
