using System.Net;
using System.Net.Mail;
using System.Text;
using System.Text.Json;

namespace InsiderThreat.Server.Services;

public interface IEmailService
{
    Task SendOtpEmailAsync(string toEmail, string otpCode);
    Task SendPinOtpEmailAsync(string toEmail, string otpCode);
}

public class EmailService : IEmailService
{
    // Render (gói Free) chặn mọi kết nối SMTP ra ngoài, nên trên môi trường đó
    // phải gửi mail qua API HTTPS (cổng 443). Brevo được chọn vì gói miễn phí
    // cho phép gửi tới BẤT KỲ người nhận nào (300 mail/ngày) — đúng yêu cầu
    // "user nào quên mật khẩu cũng nhận được OTP". SMTP vẫn được giữ làm đường
    // dự phòng khi hệ thống chạy ở nơi không chặn cổng 587.
    private static readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(15) };

    private readonly string _brevoApiKey;
    private readonly string _mailjetApiKey;
    private readonly string _mailjetSecretKey;
    private readonly string _smtpHost;
    private readonly int _smtpPort;
    private readonly string _fromEmail;
    private readonly string _fromName;
    private readonly string _fromPassword;
    private readonly ILogger<EmailService> _logger;

    public EmailService(IConfiguration config, ILogger<EmailService> logger)
    {
        _logger = logger;

        _brevoApiKey = FirstUsable(Environment.GetEnvironmentVariable("BREVO_API_KEY"), config["Email:BrevoApiKey"]) ?? "";
        _mailjetApiKey = FirstUsable(Environment.GetEnvironmentVariable("MAILJET_API_KEY"), config["Email:MailjetApiKey"]) ?? "";
        _mailjetSecretKey = FirstUsable(Environment.GetEnvironmentVariable("MAILJET_SECRET_KEY"), config["Email:MailjetSecretKey"]) ?? "";

        _smtpHost = FirstUsable(Environment.GetEnvironmentVariable("SMTP_HOST"), config["Email:SmtpHost"]) ?? "smtp.gmail.com";
        _smtpPort = int.TryParse(FirstUsable(Environment.GetEnvironmentVariable("SMTP_PORT"), config["Email:SmtpPort"]), out var port) ? port : 587;
        _fromEmail = FirstUsable(Environment.GetEnvironmentVariable("SMTP_FROM_EMAIL"), config["Email:FromEmail"]) ?? "";
        _fromName = FirstUsable(Environment.GetEnvironmentVariable("SMTP_FROM_NAME"), config["Email:FromName"]) ?? "InsiderThreat System";
        // Google hiển thị App Password thành 4 cụm cách nhau ("abcd efgh ijkl mnop").
        // Nếu giữ nguyên dấu cách, Gmail sẽ từ chối xác thực, nên bỏ hết khoảng trắng.
        _fromPassword = (FirstUsable(Environment.GetEnvironmentVariable("SMTP_PASSWORD"), config["Email:Password"]) ?? "")
            .Replace(" ", "").Trim();

        if (!string.IsNullOrWhiteSpace(_brevoApiKey))
        {
            _logger.LogInformation("Cấu hình mail: gửi qua Brevo API, người gửi {From}", _fromEmail);
        }
        else if (!string.IsNullOrWhiteSpace(_mailjetApiKey) && !string.IsNullOrWhiteSpace(_mailjetSecretKey))
        {
            _logger.LogInformation("Cấu hình mail: gửi qua Mailjet API, người gửi {From}", _fromEmail);
        }
        else if (!string.IsNullOrWhiteSpace(_fromEmail) && !string.IsNullOrWhiteSpace(_fromPassword))
        {
            _logger.LogInformation(
                "Cấu hình mail: gửi qua SMTP {Host}:{Port}, người gửi {From}. Lưu ý: một số nền tảng (Render Free) chặn SMTP — nếu gửi bị treo, hãy đặt MAILJET_API_KEY + MAILJET_SECRET_KEY (hoặc BREVO_API_KEY) để chuyển sang gửi qua API.",
                _smtpHost, _smtpPort, _fromEmail);
        }
        else
        {
            _logger.LogError(
                "Chưa cấu hình gửi mail: cần MAILJET_API_KEY + MAILJET_SECRET_KEY (khuyên dùng), hoặc BREVO_API_KEY, hoặc cặp SMTP_FROM_EMAIL + SMTP_PASSWORD. Chức năng gửi OTP sẽ không hoạt động.");
        }
    }

    public Task SendOtpEmailAsync(string toEmail, string otpCode)
    {
        var subject = "🔐 InsiderThreat System - OTP Verification";
        var body = $@"
            <html>
            <body style='font-family: Arial, sans-serif;'>
                <div style='max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;'>
                    <div style='background-color: white; padding: 30px; border-radius: 8px;'>
                        <h2 style='color: #1890ff; margin-bottom: 20px;'>🔐 Mã OTP Xác Thực</h2>
                        <p style='font-size: 16px; color: #333;'>Bạn đã yêu cầu reset mật khẩu. Sử dụng mã OTP sau:</p>
                        <div style='background-color: #f0f2f5; padding: 20px; border-radius: 4px; text-align: center; margin: 20px 0;'>
                            <h1 style='color: #1890ff; font-size: 36px; letter-spacing: 8px; margin: 0;'>{otpCode}</h1>
                        </div>
                        <p style='font-size: 14px; color: #666;'>Mã có hiệu lực trong <strong>5 phút</strong>.</p>
                        <hr style='border: none; border-top: 1px solid #e8e8e8; margin: 20px 0;' />
                        <p style='font-size: 12px; color: #999;'>Nếu bạn không yêu cầu reset mật khẩu, vui lòng bỏ qua email này.</p>
                    </div>
                </div>
            </body>
            </html>
        ";
        return SendAsync(toEmail, subject, body, "OTP");
    }

    public Task SendPinOtpEmailAsync(string toEmail, string otpCode)
    {
        var subject = "🔑 InsiderThreat System - Xác nhận đặt mã PIN";
        var body = $@"
            <html>
            <body style='font-family: Arial, sans-serif;'>
                <div style='max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;'>
                    <div style='background-color: white; padding: 30px; border-radius: 8px;'>
                        <h2 style='color: #10b981; margin-bottom: 20px;'>🔑 Xác Nhận Mã PIN Bảo Mật</h2>
                        <p style='font-size: 16px; color: #333;'>Bạn đang thiết lập mã PIN bảo mật cho tài khoản. Sử dụng mã OTP sau để xác nhận:</p>
                        <div style='background-color: #ecfdf5; padding: 20px; border-radius: 4px; text-align: center; margin: 20px 0; border: 2px solid #10b981;'>
                            <h1 style='color: #10b981; font-size: 36px; letter-spacing: 8px; margin: 0;'>{otpCode}</h1>
                        </div>
                        <p style='font-size: 14px; color: #666;'>Mã có hiệu lực trong <strong>5 phút</strong>.</p>
                        <p style='font-size: 14px; color: #ef4444;'>⚠️ Không chia sẻ mã này với bất kỳ ai.</p>
                        <hr style='border: none; border-top: 1px solid #e8e8e8; margin: 20px 0;' />
                        <p style='font-size: 12px; color: #999;'>Nếu bạn không yêu cầu thiết lập PIN, vui lòng bỏ qua email này.</p>
                    </div>
                </div>
            </body>
            </html>
        ";
        return SendAsync(toEmail, subject, body, "PIN OTP");
    }

    private async Task SendAsync(string toEmail, string subject, string htmlBody, string kind)
    {
        try
        {
            if (!string.IsNullOrWhiteSpace(_brevoApiKey))
            {
                await SendViaBrevoAsync(toEmail, subject, htmlBody);
            }
            else if (!string.IsNullOrWhiteSpace(_mailjetApiKey) && !string.IsNullOrWhiteSpace(_mailjetSecretKey))
            {
                await SendViaMailjetAsync(toEmail, subject, htmlBody);
            }
            else
            {
                await SendViaSmtpAsync(toEmail, subject, htmlBody);
            }
            _logger.LogInformation("{Kind} email sent successfully to {To}", kind, toEmail);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send {Kind} email to {To}", kind, toEmail);
            throw;
        }
    }

    private async Task SendViaBrevoAsync(string toEmail, string subject, string htmlBody)
    {
        // Tài liệu API: https://developers.brevo.com/reference/sendtransacemail
        var payload = JsonSerializer.Serialize(new
        {
            sender = new { name = _fromName, email = _fromEmail },
            to = new[] { new { email = toEmail } },
            subject,
            htmlContent = htmlBody
        });

        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.brevo.com/v3/smtp/email");
        request.Headers.Add("api-key", _brevoApiKey);
        request.Content = new StringContent(payload, Encoding.UTF8, "application/json");

        using var response = await _http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            var detail = await response.Content.ReadAsStringAsync();
            throw new InvalidOperationException(
                $"Brevo API từ chối ({(int)response.StatusCode}): {detail}. Kiểm tra BREVO_API_KEY và địa chỉ người gửi đã được xác thực trong tài khoản Brevo.");
        }
    }

    private async Task SendViaMailjetAsync(string toEmail, string subject, string htmlBody)
    {
        // Tài liệu API: https://dev.mailjet.com/email/guides/send-api-v31/
        var payload = JsonSerializer.Serialize(new
        {
            Messages = new[]
            {
                new
                {
                    From = new { Email = _fromEmail, Name = _fromName },
                    To = new[] { new { Email = toEmail } },
                    Subject = subject,
                    HTMLPart = htmlBody
                }
            }
        });

        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.mailjet.com/v3.1/send");
        var credentials = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{_mailjetApiKey}:{_mailjetSecretKey}"));
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", credentials);
        request.Content = new StringContent(payload, Encoding.UTF8, "application/json");

        using var response = await _http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            var detail = await response.Content.ReadAsStringAsync();
            throw new InvalidOperationException(
                $"Mailjet API từ chối ({(int)response.StatusCode}): {detail}. Kiểm tra MAILJET_API_KEY / MAILJET_SECRET_KEY và địa chỉ người gửi đã được xác thực trong tài khoản Mailjet.");
        }
    }

    private async Task SendViaSmtpAsync(string toEmail, string subject, string htmlBody)
    {
        using var message = new MailMessage(_fromEmail, toEmail, subject, htmlBody) { IsBodyHtml = true };
        using var smtpClient = new SmtpClient(_smtpHost, _smtpPort)
        {
            Credentials = new NetworkCredential(_fromEmail, _fromPassword),
            EnableSsl = true
        };
        await SendWithTimeoutAsync(smtpClient, message);
    }

    /// Gửi mail có giới hạn thời gian thật sự.
    /// Thuộc tính SmtpClient.Timeout chỉ áp dụng cho bản đồng bộ Send(), còn
    /// SendMailAsync bỏ qua nó — nên nếu máy chủ mail không trả lời, lệnh gửi
    /// treo vô hạn và người dùng chỉ thấy trang quay mãi rồi lỗi chung chung.
    private static async Task SendWithTimeoutAsync(SmtpClient client, MailMessage message, int timeoutMs = 15000)
    {
        using var cts = new CancellationTokenSource(timeoutMs);
        try
        {
            await client.SendMailAsync(message, cts.Token);
        }
        catch (OperationCanceledException) when (cts.IsCancellationRequested)
        {
            throw new TimeoutException(
                $"Máy chủ mail không phản hồi sau {timeoutMs / 1000} giây (có thể bị chặn cổng SMTP hoặc bị nhà cung cấp mail chặn).");
        }
    }

    /// Trả về giá trị dùng được đầu tiên, bỏ qua chuỗi rỗng và các chỗ giữ chỗ dạng "[TEN_BIEN]".
    private static string? FirstUsable(params string?[] values)
    {
        foreach (var value in values)
        {
            if (string.IsNullOrWhiteSpace(value)) continue;
            if (value.StartsWith('[') && value.EndsWith(']')) continue;
            return value;
        }
        return null;
    }
}
