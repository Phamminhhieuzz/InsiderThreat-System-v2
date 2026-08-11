using Microsoft.AspNetCore.Mvc;
using MongoDB.Bson;
using MongoDB.Driver;
using InsiderThreat.Shared;
using InsiderThreat.Server.Services;

namespace InsiderThreat.Server.Controllers;

public class ForgotPasswordRequest
{
    public string Email { get; set; } = string.Empty;
}

public class VerifyOtpRequest
{
    public string Email { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
}

public class ResetPasswordRequest
{
    public string OtpTokenId { get; set; } = string.Empty;
    public string NewPassword { get; set; } = string.Empty;
}

[Route("api/auth")]
[ApiController]
public class PasswordResetController : ControllerBase
{
    private readonly IMongoCollection<User> _users;
    private readonly IMongoCollection<OtpToken> _otpTokens;
    private readonly IEmailService _emailService;
    private readonly ITelegramService _telegramService;
    private readonly ILogger<PasswordResetController> _logger;

    public PasswordResetController(
        IMongoDatabase database,
        IEmailService emailService,
        ITelegramService telegramService,
        ILogger<PasswordResetController> logger)
    {
        _users = database.GetCollection<User>("Users");
        _otpTokens = database.GetCollection<OtpToken>("OtpTokens");
        _emailService = emailService;
        _telegramService = telegramService;
        _logger = logger;
    }

    // POST /api/auth/forgot-password
    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
            return BadRequest(new { message = "Email là bắt buộc" });

        // So khớp email không phân biệt hoa/thường và bỏ khoảng trắng thừa: người
        // dùng có thể gõ hoa/thường khác lúc đăng ký, hoặc dán nhầm dấu cách khi
        // copy-paste — địa chỉ email về bản chất vẫn là cùng một tài khoản.
        var normalizedEmail = request.Email.Trim();
        var user = await _users
            .Find(Builders<User>.Filter.Regex(u => u.Email,
                new BsonRegularExpression($"^{System.Text.RegularExpressions.Regex.Escape(normalizedEmail)}$", "i")))
            .FirstOrDefaultAsync();
        if (user == null)
        {
            _logger.LogWarning($"Forgot password attempt for non-existent email: {request.Email}");
            return NotFound(new { message = "Email này không nằm trong csdl đang có" });
        }

        // Generate 6-digit OTP
        var otpCode = new Random().Next(100000, 999999).ToString();

        var otpToken = new OtpToken
        {
            // Lưu email chuẩn trong database (user.Email), không lưu nguyên văn
            // người dùng gõ — nếu không, bước xác thực OTP phía dưới lại so khớp
            // chính xác và có thể dính đúng lỗi hoa/thường vừa sửa ở trên.
            Email = user.Email,
            Code = otpCode,
            ExpiresAt = DateTime.UtcNow.AddMinutes(5)
        };

        await _otpTokens.InsertOneAsync(otpToken);

        // Ưu tiên Telegram: hạ tầng miễn phí thường chặn SMTP và các dịch vụ gửi
        // mail hay treo tài khoản mới, nên đường Telegram đáng tin cậy hơn.
        if (_telegramService.IsConfigured && !string.IsNullOrWhiteSpace(user.TelegramChatId))
        {
            try
            {
                await _telegramService.SendMessageAsync(user.TelegramChatId,
                    $"🔐 <b>Mã OTP đặt lại mật khẩu</b>\n\n<code>{otpCode}</code>\n\nMã có hiệu lực trong 5 phút.\nNếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua tin nhắn này.");

                _logger.LogInformation("OTP sent via Telegram for {Email}", request.Email);
                return Ok(new { message = "OTP đã được gửi vào Telegram của bạn", channel = "telegram" });
            }
            catch (Exception ex)
            {
                // Telegram hỏng thì vẫn thử email bên dưới thay vì dừng hẳn.
                _logger.LogError(ex, "Không gửi được OTP qua Telegram cho {Email}, thử lại bằng email", request.Email);
            }
        }

        try
        {
            await _emailService.SendOtpEmailAsync(request.Email, otpCode);
            _logger.LogInformation($"OTP generated for {request.Email}");
            return Ok(new { message = "OTP đã được gửi đến email của bạn", channel = "email" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Failed to send OTP email to {request.Email}");

            // Nêu rõ nguyên nhân thay vì một câu chung chung: người quản trị cần biết
            // phải sửa ở đâu, mà lỗi cấu hình mail thì không lộ thông tin gì nhạy cảm.
            var detail = _telegramService.IsConfigured
                ? "Tài khoản này chưa liên kết Telegram. Hãy đăng nhập, vào trang cá nhân và bấm Liên kết Telegram để nhận mã OTP."
                : DescribeMailFailure(ex);
            return StatusCode(500, new { message = $"Không gửi được mã OTP. {detail}" });
        }
    }

    /// Dịch lỗi SMTP sang câu chỉ rõ việc cần làm.
    private static string DescribeMailFailure(Exception ex)
    {
        // Nguyên nhân thật thường nằm ở exception lồng bên trong.
        var text = $"{ex.Message} {ex.InnerException?.Message}".ToLowerInvariant();

        if (text.Contains("5.7.0") || text.Contains("5.7.8")
            || text.Contains("authentication required") || text.Contains("not accepted"))
        {
            return "Gmail từ chối đăng nhập: biến SMTP_PASSWORD phải là App Password 16 ký tự do Google cấp (không dùng mật khẩu Gmail thường), và SMTP_FROM_EMAIL phải đúng tài khoản đã tạo App Password đó.";
        }

        if (ex is TimeoutException
            || text.Contains("timed out") || text.Contains("timeout")
            || text.Contains("không phản hồi")
            || text.Contains("no such host") || text.Contains("connection refused")
            || text.Contains("unreachable"))
        {
            return "Máy chủ mail không phản hồi. Kết nối SMTP nhiều khả năng bị chặn — nên chuyển sang dịch vụ gửi mail qua API (Resend, Brevo) thay vì Gmail SMTP.";
        }

        if (text.Contains("must issue a starttls") || text.Contains("secure connection"))
        {
            return "Máy chủ mail yêu cầu kết nối bảo mật. Kiểm tra lại SMTP_PORT (Gmail dùng 587).";
        }

        return "Kiểm tra lại cấu hình SMTP trên máy chủ.";
    }

    // POST /api/auth/verify-otp
    [HttpPost("verify-otp")]
    public async Task<IActionResult> VerifyOtp([FromBody] VerifyOtpRequest request)
    {
        if (string.IsNullOrEmpty(request.Email) || string.IsNullOrEmpty(request.Code))
            return BadRequest(new { message = "Email và OTP là bắt buộc" });

        // So khớp email không phân biệt hoa/thường: forgot-password lưu email CHUẨN
        // (từ user.Email trong database), còn ở đây là email người dùng GÕ TAY —
        // nếu so khớp chính xác, hai giá trị khác hoa/thường sẽ luôn fail.
        var normalizedEmail = request.Email.Trim();
        var emailFilter = Builders<OtpToken>.Filter.Regex(o => o.Email,
            new BsonRegularExpression($"^{System.Text.RegularExpressions.Regex.Escape(normalizedEmail)}$", "i"));

        var otpToken = await _otpTokens.Find(
            emailFilter &
            Builders<OtpToken>.Filter.Eq(o => o.Code, request.Code) &
            Builders<OtpToken>.Filter.Eq(o => o.Used, false) &
            Builders<OtpToken>.Filter.Gt(o => o.ExpiresAt, DateTime.UtcNow)
        ).FirstOrDefaultAsync();

        if (otpToken == null)
        {
            _logger.LogWarning($"Invalid OTP attempt for email: {request.Email}");
            return BadRequest(new { message = "OTP không hợp lệ hoặc đã hết hạn" });
        }

        // Mark as used
        var update = Builders<OtpToken>.Update.Set(o => o.Used, true);
        await _otpTokens.UpdateOneAsync(o => o.Id == otpToken.Id, update);

        _logger.LogInformation($"OTP verified successfully for {request.Email}");
        return Ok(new { message = "OTP hợp lệ", token = otpToken.Id });
    }

    // POST /api/auth/reset-password
    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request)
    {
        if (string.IsNullOrEmpty(request.OtpTokenId) || string.IsNullOrEmpty(request.NewPassword))
            return BadRequest(new { message = "Token và mật khẩu mới là bắt buộc" });

        if (request.NewPassword.Length < 6)
            return BadRequest(new { message = "Mật khẩu phải có ít nhất 6 ký tự" });

        var otpToken = await _otpTokens.Find(o => o.Id == request.OtpTokenId && o.Used).FirstOrDefaultAsync();
        if (otpToken == null)
        {
            _logger.LogWarning($"Invalid token for password reset: {request.OtpTokenId}");
            return BadRequest(new { message = "Token không hợp lệ" });
        }

        // Check if token is still valid (within 10 minutes of creation)
        if (otpToken.CreatedAt.AddMinutes(10) < DateTime.UtcNow)
        {
            return BadRequest(new { message = "Token đã hết hạn. Vui lòng yêu cầu OTP mới." });
        }

        var user = await _users.Find(u => u.Email == otpToken.Email).FirstOrDefaultAsync();
        if (user == null)
            return NotFound(new { message = "Người dùng không tồn tại" });

        // Hash new password
        var passwordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        var update = Builders<User>.Update.Set(u => u.PasswordHash, passwordHash);
        await _users.UpdateOneAsync(u => u.Id == user.Id, update);

        _logger.LogInformation($"Password reset successfully for user: {user.Username}");
        return Ok(new { message = "Mật khẩu đã được reset thành công" });
    }
}
