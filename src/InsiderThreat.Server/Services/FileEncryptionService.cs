using System.Security.Cryptography;
using System.Text;

namespace InsiderThreat.Server.Services;

/// <summary>
/// Military-grade file encryption service using AES-256-GCM.
/// Provides Authenticated Encryption to ensure both secrecy and data integrity.
/// </summary>
public class FileEncryptionService
{
    private readonly byte[] _key;
    private const int NonceSize = 12; // Standard for GCM
    private const int TagSize = 16;   // Standard for GCM

    public FileEncryptionService(IConfiguration config)
    {
        var secret = config["Encryption:FileSecret"] ?? "InsiderThreat_Military_Key_32Chars!";
        _key = Encoding.UTF8.GetBytes(secret.PadRight(32).Substring(0, 32));
    }

    /// <summary>
    /// Encrypts a stream using AES-256-GCM.
    /// Format: [Nonce (12b)] + [Tag (16b)] + [Ciphertext]
    /// </summary>
    public async Task EncryptStreamAsync(Stream inputStream, Stream outputStream)
    {
        byte[] nonce = new byte[NonceSize];
        RandomNumberGenerator.Fill(nonce);

        using var aes = new AesGcm(_key, TagSize);
        
        // Read entire input into memory (GCM requires full buffer for auth tag)
        using var ms = new MemoryStream();
        await inputStream.CopyToAsync(ms);
        byte[] plaintext = ms.ToArray();
        byte[] ciphertext = new byte[plaintext.Length];
        byte[] tag = new byte[TagSize];

        aes.Encrypt(nonce, plaintext, ciphertext, tag);

        // Write to output: Nonce + Tag + Ciphertext
        await outputStream.WriteAsync(nonce, 0, NonceSize);
        await outputStream.WriteAsync(tag, 0, TagSize);
        await outputStream.WriteAsync(ciphertext, 0, ciphertext.Length);
    }

    /// <summary>
    /// Decrypts a stream using AES-256-GCM.
    /// </summary>
    public async Task DecryptStreamAsync(Stream encryptedStream, Stream outputStream)
    {
        byte[] nonce = new byte[NonceSize];
        byte[] tag = new byte[TagSize];

        await encryptedStream.ReadExactlyAsync(nonce, 0, NonceSize);
        await encryptedStream.ReadExactlyAsync(tag, 0, TagSize);

        using var ms = new MemoryStream();
        await encryptedStream.CopyToAsync(ms);
        byte[] ciphertext = ms.ToArray();
        
        if (ciphertext.Length == 0)
        {
            // Empty file
            return;
        }

        byte[] plaintext = new byte[ciphertext.Length];

        using var aes = new AesGcm(_key, TagSize);
        aes.Decrypt(nonce, ciphertext, tag, plaintext);

        await outputStream.WriteAsync(plaintext, 0, plaintext.Length);
    }
}
