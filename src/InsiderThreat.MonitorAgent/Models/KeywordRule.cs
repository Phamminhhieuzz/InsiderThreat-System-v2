namespace InsiderThreat.MonitorAgent.Models;

/// <summary>
/// Defines a sensitive keyword rule with its associated risk weight.
/// These rules are used by the KeywordMonitorService to score detected text.
/// </summary>
public class KeywordRule
{
    /// <summary>The keyword or phrase to detect (case-insensitive)</summary>
    public string Keyword { get; set; } = string.Empty;

    /// <summary>Category: "salary", "resignation", "security", "project_data"</summary>
    public string Category { get; set; } = string.Empty;

    /// <summary>Base severity score (1-10) when this keyword alone is found</summary>
    public int BaseSeverity { get; set; } = 3;

    /// <summary>Additional context patterns that amplify the severity</summary>
    public string[]? AmplifyPatterns { get; set; }

    /// <summary>How much to add to severity when an amplify pattern is also found</summary>
    public int AmplifyBonus { get; set; } = 2;
}
