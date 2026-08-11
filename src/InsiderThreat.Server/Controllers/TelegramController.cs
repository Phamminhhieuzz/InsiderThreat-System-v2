using System.Security.Claims;
using System.Text.Json;
using InsiderThreat.Server.Services;
using InsiderThreat.Shared;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;

namespace InsiderThreat.Server.Controllers;

/// Mã liên kết dùng một lần, nối tài khoản trong hệ thống với cuộc trò chuyện Telegram.
public class TelegramLinkCode
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    public string Code { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
}

[ApiController]
[Route("api/telegram")]
public class TelegramController : ControllerBase
{
    private readonly IMongoCollection<User> _users;
    private readonly IMongoCollection<TelegramLinkCode> _linkCodes;
    private readonly ITelegramService _telegram;
    private readonly ILogger<TelegramController> _logger;

    public TelegramController(
        IMongoDatabase database,
        ITelegramService telegram,
        ILogger<TelegramController> logger)
    {
        _users = database.GetCollection<User>("Users");
        _linkCodes = database.GetCollection<TelegramLinkCode>("TelegramLinkCodes");
        _telegram = telegram;
        _logger = logger;
    }

    /// Tạo đường dẫn để người dùng đang đăng nhập liên kết Telegram của mình.
    [Authorize]
    [HttpPost("link-code")]
    public async Task<IActionResult> CreateLinkCode()
    {
        if (!_telegram.IsConfigured || string.IsNullOrWhiteSpace(_telegram.BotUsername))
            return StatusCode(503, new { message = "Máy chủ chưa cấu hình Telegram Bot." });

        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized(new { message = "Không xác định được tài khoản." });

        // Mã ngẫu nhiên, đủ dài để không đoán được trong thời gian còn hiệu lực.
        var code = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(8)).ToLowerInvariant();

        // Xoá mã cũ chưa dùng của chính người này để tránh tồn đọng.
        await _linkCodes.DeleteManyAsync(c => c.UserId == userId);

        await _linkCodes.InsertOneAsync(new TelegramLinkCode
        {
            Code = code,
            UserId = userId,
            ExpiresAt = DateTime.UtcNow.AddMinutes(15)
        });

        return Ok(new
        {
            url = $"https://t.me/{_telegram.BotUsername}?start={code}",
            expiresInMinutes = 15
        });
    }

    /// Trạng thái liên kết của tài khoản đang đăng nhập.
    [Authorize]
    [HttpGet("status")]
    public async Task<IActionResult> GetStatus()
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var user = await _users.Find(u => u.Id == userId).FirstOrDefaultAsync();
        return Ok(new
        {
            linked = !string.IsNullOrWhiteSpace(user?.TelegramChatId),
            botConfigured = _telegram.IsConfigured
        });
    }

    /// Huỷ liên kết.
    [Authorize]
    [HttpDelete("link")]
    public async Task<IActionResult> Unlink()
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        await _users.UpdateOneAsync(
            u => u.Id == userId,
            Builders<User>.Update.Set(u => u.TelegramChatId, null));
        return Ok(new { message = "Đã huỷ liên kết Telegram." });
    }

    /// Điểm nhận cập nhật từ Telegram. Telegram gọi vào đây mỗi khi người dùng
    /// nhắn cho bot; chỉ quan tâm lệnh "/start &lt;mã liên kết&gt;".
    [AllowAnonymous]
    [HttpPost("webhook")]
    public async Task<IActionResult> Webhook([FromBody] JsonElement update)
    {
        // Nếu có đặt secret, Telegram sẽ gửi kèm header này. Từ chối request giả mạo.
        var expectedSecret = Environment.GetEnvironmentVariable("TELEGRAM_WEBHOOK_SECRET");
        if (!string.IsNullOrWhiteSpace(expectedSecret))
        {
            var received = Request.Headers["X-Telegram-Bot-Api-Secret-Token"].FirstOrDefault();
            if (received != expectedSecret) return Unauthorized();
        }

        try
        {
            if (!update.TryGetProperty("message", out var message)) return Ok();
            if (!message.TryGetProperty("text", out var textNode)) return Ok();
            if (!message.TryGetProperty("chat", out var chat)) return Ok();

            var chatId = chat.GetProperty("id").ToString();
            var text = textNode.GetString() ?? "";

            if (!text.StartsWith("/start", StringComparison.OrdinalIgnoreCase))
            {
                await _telegram.SendMessageAsync(chatId,
                    "Bot này dùng để nhận mã OTP của hệ thống InsiderThreat. Hãy mở trang cá nhân trên web và bấm <b>Liên kết Telegram</b>.");
                return Ok();
            }

            var parts = text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 2)
            {
                await _telegram.SendMessageAsync(chatId,
                    "Thiếu mã liên kết. Hãy vào trang cá nhân trên web, bấm <b>Liên kết Telegram</b> rồi mở đường dẫn hiện ra.");
                return Ok();
            }

            var code = parts[1].Trim().ToLowerInvariant();
            var link = await _linkCodes.Find(c => c.Code == code).FirstOrDefaultAsync();

            if (link == null || link.ExpiresAt < DateTime.UtcNow)
            {
                await _telegram.SendMessageAsync(chatId, "Mã liên kết không đúng hoặc đã hết hạn. Hãy tạo mã mới trên web.");
                return Ok();
            }

            await _users.UpdateOneAsync(
                u => u.Id == link.UserId,
                Builders<User>.Update.Set(u => u.TelegramChatId, chatId));

            await _linkCodes.DeleteOneAsync(c => c.Id == link.Id);

            var user = await _users.Find(u => u.Id == link.UserId).FirstOrDefaultAsync();
            await _telegram.SendMessageAsync(chatId,
                $"✅ Đã liên kết với tài khoản <b>{user?.Username}</b>.\n\nTừ giờ mã OTP khi quên mật khẩu sẽ được gửi vào đây.");

            _logger.LogInformation("Telegram linked for user {UserId}", link.UserId);
        }
        catch (Exception ex)
        {
            // Luôn trả 200 để Telegram không gửi lại liên tục.
            _logger.LogError(ex, "Lỗi xử lý webhook Telegram");
        }

        return Ok();
    }
}
