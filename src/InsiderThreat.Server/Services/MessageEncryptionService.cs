using System.Security.Cryptography;
using System.Text;

namespace InsiderThreat.Server.Services;

/// <summary>
/// Server-side AES-256-CBC encryption for message content.
/// Key is read from appsettings.json → Encryption:Key (32-byte Base64 or plain string).
/// </summary>
public interface IMessageEncryptionService
{
    string Encrypt(string plainText);
    string Decrypt(string cipherText);
}

public class MessageEncryptionService : IMessageEncryptionService
{
    private readonly byte[] _key;

    public MessageEncryptionService(IConfiguration config)
    {
        var keyStr = config["Encryption:Key"] ?? "InsiderThreat_AES_Key_32BytesLong!";
        // Derive a stable 32-byte key regardless of input length
        _key = SHA256.HashData(Encoding.UTF8.GetBytes(keyStr));
    }

    public string Encrypt(string plainText)
    {
        if (string.IsNullOrEmpty(plainText)) return plainText;
        using var aes = Aes.Create();
        aes.Key = _key;
        aes.GenerateIV();

        using var encryptor = aes.CreateEncryptor();
        var data = Encoding.UTF8.GetBytes(plainText);
        var encrypted = encryptor.TransformFinalBlock(data, 0, data.Length);

        // Prepend IV to ciphertext, encode as Base64
        var combined = new byte[aes.IV.Length + encrypted.Length];
        aes.IV.CopyTo(combined, 0);
        encrypted.CopyTo(combined, aes.IV.Length);
        return Convert.ToBase64String(combined);
    }

    public string Decrypt(string cipherText)
    {
        if (string.IsNullOrEmpty(cipherText)) return cipherText;
        try
        {
            var combined = Convert.FromBase64String(cipherText);
            using var aes = Aes.Create();
            aes.Key = _key;

            var iv = combined[..16];
            var encrypted = combined[16..];
            aes.IV = iv;

            using var decryptor = aes.CreateDecryptor();
            var decrypted = decryptor.TransformFinalBlock(encrypted, 0, encrypted.Length);
            return Encoding.UTF8.GetString(decrypted);
        }
        catch
        {
            // Not encrypted (legacy plain text) — return as-is
            return cipherText;
        }
    }
}
