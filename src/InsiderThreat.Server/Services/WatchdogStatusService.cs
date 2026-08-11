using System.Collections.Concurrent;

namespace InsiderThreat.Server.Services;

/// <summary>
/// In-memory store for Watchdog heartbeat status per machine.
/// Singleton — shared across all requests.
/// </summary>
public class WatchdogStatusService
{
    private readonly ConcurrentDictionary<string, WatchdogMachineStatus> _statuses = new();

    public void UpdateHeartbeat(string computerName, string ipAddress)
    {
        _statuses.AddOrUpdate(
            computerName,
            _ => new WatchdogMachineStatus
            {
                ComputerName = computerName,
                IpAddress = ipAddress,
                LastHeartbeat = DateTime.UtcNow,
                RestartCount = 0
            },
            (_, existing) =>
            {
                existing.IpAddress = ipAddress;
                existing.LastHeartbeat = DateTime.UtcNow;
                return existing;
            });
    }

    public void RecordRestart(string computerName, string ipAddress)
    {
        _statuses.AddOrUpdate(
            computerName,
            _ => new WatchdogMachineStatus
            {
                ComputerName = computerName,
                IpAddress = ipAddress,
                LastHeartbeat = DateTime.UtcNow,
                RestartCount = 1,
                LastRestartTime = DateTime.UtcNow
            },
            (_, existing) =>
            {
                existing.IpAddress = ipAddress;
                existing.LastHeartbeat = DateTime.UtcNow;
                existing.RestartCount++;
                existing.LastRestartTime = DateTime.UtcNow;
                return existing;
            });
    }

    public IEnumerable<WatchdogMachineStatus> GetAll() => _statuses.Values;

    public WatchdogMachineStatus? Get(string computerName) =>
        _statuses.TryGetValue(computerName, out var status) ? status : null;
}

public class WatchdogMachineStatus
{
    public string ComputerName { get; set; } = string.Empty;
    public string IpAddress { get; set; } = string.Empty;
    public DateTime LastHeartbeat { get; set; }
    public int RestartCount { get; set; }
    public DateTime? LastRestartTime { get; set; }

    /// <summary>Online nếu heartbeat trong vòng 90 giây</summary>
    public bool IsOnline => (DateTime.UtcNow - LastHeartbeat).TotalSeconds < 90;

    public string StatusText => IsOnline ? "Online" : "Offline";
}
