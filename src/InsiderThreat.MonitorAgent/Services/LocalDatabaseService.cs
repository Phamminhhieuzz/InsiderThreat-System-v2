using Microsoft.Data.Sqlite;
using InsiderThreat.MonitorAgent.Models;
using System.Security.Cryptography;
using System.Text;

namespace InsiderThreat.MonitorAgent.Services;

/// <summary>
/// SQLite-based local storage for monitoring logs with AES Encryption.
/// This ensures data is preserved even when the machine is offline and protected from local tampering.
/// </summary>
public class LocalDatabaseService : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly ILogger<LocalDatabaseService> _logger;
    private readonly string _encryptionKey = "InsiderThreat_Local_Encryption_Key_2024!"; // Nên dùng SecureStorage thực tế

    public LocalDatabaseService(IConfiguration config, ILogger<LocalDatabaseService> logger)
    {
        _logger = logger;
        var dbPath = config["AgentConfig:DatabasePath"] ?? "monitor_cache.db";
        
        // Store in the same directory as the executable
        var fullPath = Path.Combine(AppContext.BaseDirectory, dbPath);
        _connection = new SqliteConnection($"Data Source={fullPath}");
        _connection.Open();
        
        InitializeDatabase();
        _logger.LogInformation("LocalDatabase initialized at: {Path}", fullPath);
    }

    private void InitializeDatabase()
    {
        using var cmd = _connection.CreateCommand();
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS MonitorLogs (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                EventType TEXT NOT NULL,
                Severity INTEGER NOT NULL,
                DetectedKeyword TEXT,
                MessageContext TEXT,
                ApplicationName TEXT,
                WindowTitle TEXT,
                ComputerUser TEXT NOT NULL,
                ComputerName TEXT NOT NULL,
                IpAddress TEXT NOT NULL,
                Timestamp TEXT NOT NULL,
                IsSynced INTEGER DEFAULT 0,
                RiskAssessment TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_synced ON MonitorLogs(IsSynced);
            CREATE INDEX IF NOT EXISTS idx_timestamp ON MonitorLogs(Timestamp);
        ";
        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Insert a new monitoring log into the local database.
    /// </summary>
    public long InsertLog(MonitorLog log)
    {
        try
        {
            using var cmd = _connection.CreateCommand();
            cmd.CommandText = @"
                INSERT INTO MonitorLogs 
                (EventType, Severity, DetectedKeyword, MessageContext, ApplicationName, WindowTitle, ComputerUser, ComputerName, IpAddress, Timestamp, IsSynced, RiskAssessment)
                VALUES 
                (@EventType, @Severity, @DetectedKeyword, @MessageContext, @ApplicationName, @WindowTitle, @ComputerUser, @ComputerName, @IpAddress, @Timestamp, 0, @RiskAssessment);
                SELECT last_insert_rowid();
            ";
            cmd.Parameters.AddWithValue("@EventType", log.EventType);
            cmd.Parameters.AddWithValue("@Severity", log.Severity);
            
            // Mã hóa dữ liệu nhạy cảm
            cmd.Parameters.AddWithValue("@DetectedKeyword", Encrypt(log.DetectedKeyword?.ToString()));
            cmd.Parameters.AddWithValue("@MessageContext", Encrypt(log.MessageContext?.ToString()));
            
            cmd.Parameters.AddWithValue("@ApplicationName", (object?)log.ApplicationName ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@WindowTitle", (object?)log.WindowTitle ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@ComputerUser", log.ComputerUser);
            cmd.Parameters.AddWithValue("@ComputerName", log.ComputerName);
            cmd.Parameters.AddWithValue("@IpAddress", log.IpAddress);
            cmd.Parameters.AddWithValue("@Timestamp", log.Timestamp.ToString("o"));
            cmd.Parameters.AddWithValue("@RiskAssessment", Encrypt(log.RiskAssessment?.ToString()));

            var result = cmd.ExecuteScalar();
            var id = Convert.ToInt64(result);
            _logger.LogDebug("Inserted MonitorLog ID {Id}, Type: {Type}, Severity: {Sev}", id, log.EventType, log.Severity);
            return id;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to insert MonitorLog");
            return -1;
        }
    }

    /// <summary>
    /// Get all logs that haven't been synced to the server yet.
    /// </summary>
    public List<MonitorLog> GetUnsyncedLogs(int limit = 50)
    {
        var logs = new List<MonitorLog>();
        try
        {
            using var cmd = _connection.CreateCommand();
            cmd.CommandText = "SELECT * FROM MonitorLogs WHERE IsSynced = 0 ORDER BY Timestamp ASC LIMIT @Limit";
            cmd.Parameters.AddWithValue("@Limit", limit);
            
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                logs.Add(new MonitorLog
                {
                    Id = reader.GetInt64(0),
                    EventType = reader.GetString(1),
                    Severity = reader.GetInt32(2),
                    DetectedKeyword = Decrypt(reader.IsDBNull(3) ? null : reader.GetString(3)),
                    MessageContext = Decrypt(reader.IsDBNull(4) ? null : reader.GetString(4)),
                    ApplicationName = reader.IsDBNull(5) ? null : reader.GetString(5),
                    WindowTitle = reader.IsDBNull(6) ? null : reader.GetString(6),
                    ComputerUser = reader.GetString(7),
                    ComputerName = reader.GetString(8),
                    IpAddress = reader.GetString(9),
                    Timestamp = DateTime.Parse(reader.GetString(10)),
                    IsSynced = reader.GetInt32(11) == 1,
                    RiskAssessment = Decrypt(reader.IsDBNull(12) ? null : reader.GetString(12))
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get unsynced logs");
        }
        return logs;
    }

    /// <summary>
    /// Mark specific logs as synced after successful upload to server.
    /// </summary>
    public void MarkAsSynced(IEnumerable<long> ids)
    {
        try
        {
            using var transaction = _connection.BeginTransaction();
            foreach (var id in ids)
            {
                using var cmd = _connection.CreateCommand();
                cmd.CommandText = "UPDATE MonitorLogs SET IsSynced = 1 WHERE Id = @Id";
                cmd.Parameters.AddWithValue("@Id", id);
                cmd.ExecuteNonQuery();
            }
            transaction.Commit();
            _logger.LogInformation("Marked {Count} logs as synced", ids.Count());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to mark logs as synced");
        }
    }

    // ==========================================
    // AES ENCRYPTION HELPERS
    // ==========================================
    private object Encrypt(string? plainText)
    {
        if (string.IsNullOrEmpty(plainText)) return DBNull.Value;
        
        try 
        {
            byte[] iv = new byte[16]; // Sử dụng IV cố định cho đơn giản trong ví dụ này
            byte[] array;

            using (Aes aes = Aes.Create())
            {
                // Key phải là 32 bytes (256 bits)
                aes.Key = Encoding.UTF8.GetBytes(_encryptionKey.PadRight(32).Substring(0, 32));
                aes.IV = iv;

                ICryptoTransform encryptor = aes.CreateEncryptor(aes.Key, aes.IV);

                using (MemoryStream memoryStream = new MemoryStream())
                {
                    using (CryptoStream cryptoStream = new CryptoStream(memoryStream, encryptor, CryptoStreamMode.Write))
                    {
                        using (StreamWriter streamWriter = new StreamWriter(cryptoStream))
                        {
                            streamWriter.Write(plainText);
                        }
                        array = memoryStream.ToArray();
                    }
                }
            }
            return Convert.ToBase64String(array);
        }
        catch { return plainText; }
    }

    private string? Decrypt(string? cipherText)
    {
        if (string.IsNullOrEmpty(cipherText)) return null;
        
        try
        {
            byte[] iv = new byte[16];
            byte[] buffer = Convert.FromBase64String(cipherText);

            using (Aes aes = Aes.Create())
            {
                aes.Key = Encoding.UTF8.GetBytes(_encryptionKey.PadRight(32).Substring(0, 32));
                aes.IV = iv;
                ICryptoTransform decryptor = aes.CreateDecryptor(aes.Key, aes.IV);

                using (MemoryStream memoryStream = new MemoryStream(buffer))
                {
                    using (CryptoStream cryptoStream = new CryptoStream(memoryStream, decryptor, CryptoStreamMode.Read))
                    {
                        using (StreamReader streamReader = new StreamReader(cryptoStream))
                        {
                            return streamReader.ReadToEnd();
                        }
                    }
                }
            }
        }
        catch { return cipherText; }
    }

    /// <summary>
    /// Purge old synced logs to prevent database bloat (keep last 7 days).
    /// </summary>
    public void PurgeOldSyncedLogs(int daysToKeep = 7)
    {
        try
        {
            using var cmd = _connection.CreateCommand();
            cmd.CommandText = "DELETE FROM MonitorLogs WHERE IsSynced = 1 AND Timestamp < @CutoffDate";
            cmd.Parameters.AddWithValue("@CutoffDate", DateTime.UtcNow.AddDays(-daysToKeep).ToString("o"));
            var deleted = cmd.ExecuteNonQuery();
            if (deleted > 0)
                _logger.LogInformation("Purged {Count} old synced logs", deleted);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to purge old logs");
        }
    }

    public void Dispose()
    {
        _connection?.Close();
        _connection?.Dispose();
    }
}
