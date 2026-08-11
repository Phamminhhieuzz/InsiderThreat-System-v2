using System.Text;
using System.Text.Json;

namespace InsiderThreat.Server.Services;

public interface ITelegramService
{
    bool IsConfigured { get; }
    string BotUsername { get; }
    Task SendMessageAsync(string chatId, string text);
}

/// Gửi tin nhắn qua Telegram Bot API.
///
/// Dùng làm đường gửi OTP thay cho email vì hạ tầng miễn phí thường chặn SMTP,
/// còn các dịch vụ gửi mail thì treo tài khoản mới. Telegram gọi qua HTTPS nên
/// không bị chặn, và không giới hạn số lượng tin cho mục đích này.
public class TelegramService : ITelegramService
{
    private static readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(15) };

    private readonly string _botToken;
    private readonly ILogger<TelegramService> _logger;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_botToken);
    public string BotUsername { get; }

    public TelegramService(IConfiguration config, ILogger<TelegramService> logger)
    {
        _logger = logger;
        _botToken = Environment.GetEnvironmentVariable("TELEGRAM_BOT_TOKEN")
                    ?? config["Telegram:BotToken"] ?? "";
        BotUsername = (Environment.GetEnvironmentVariable("TELEGRAM_BOT_USERNAME")
                       ?? config["Telegram:BotUsername"] ?? "").TrimStart('@');

        if (!IsConfigured)
        {
            _logger.LogWarning(
                "Chưa cấu hình Telegram: đặt TELEGRAM_BOT_TOKEN và TELEGRAM_BOT_USERNAME để gửi OTP qua Telegram.");
        }
    }

    public async Task SendMessageAsync(string chatId, string text)
    {
        if (!IsConfigured)
            throw new InvalidOperationException("Chưa cấu hình TELEGRAM_BOT_TOKEN trên máy chủ.");

        var payload = JsonSerializer.Serialize(new
        {
            chat_id = chatId,
            text,
            parse_mode = "HTML"
        });

        using var content = new StringContent(payload, Encoding.UTF8, "application/json");
        using var response = await _http.PostAsync(
            $"https://api.telegram.org/bot{_botToken}/sendMessage", content);

        if (!response.IsSuccessStatusCode)
        {
            var detail = await response.Content.ReadAsStringAsync();
            // Lỗi hay gặp nhất là "chat not found": người dùng chưa bấm Start với bot,
            // hoặc đã chặn bot. Nêu rõ để người dùng biết phải liên kết lại.
            throw new InvalidOperationException(
                $"Telegram từ chối ({(int)response.StatusCode}): {detail}");
        }
    }
}
