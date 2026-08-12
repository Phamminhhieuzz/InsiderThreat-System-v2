using MongoDB.Driver;
using MongoDB.Bson;
using InsiderThreat.Shared;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using Microsoft.AspNetCore.Http.Features;

var builder = WebApplication.CreateBuilder(args);

// ─── CẤU HÌNH WEB HOST & KESTREL (Nâng giới hạn 500MB) ──────────────────────
// Render (và hầu hết PaaS) gán cổng động qua biến môi trường PORT.
// Nếu không có PORT (chạy local/docker-compose), fallback về 5038.
var port = Environment.GetEnvironmentVariable("PORT") ?? "5038";
builder.WebHost.UseUrls($"http://*:{port}");
builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 524288000; // 500MB
});

// ─── 1. CẤU HÌNH MONGODB & GRIDFS ──────────────────────────────────────────
var mongoSettings = builder.Configuration.GetSection("InsiderThreatDatabase");

builder.Services.AddSingleton<IMongoClient>(s =>
{
    var connStr = Environment.GetEnvironmentVariable("MONGODB_CONNECTION_STRING")
                  ?? mongoSettings.GetValue<string>("ConnectionString");

    if (string.IsNullOrWhiteSpace(connStr))
    {
        if (builder.Environment.IsProduction())
        {
            throw new InvalidOperationException(
                "Thiếu cấu hình MongoDB. Hãy set biến môi trường MONGODB_CONNECTION_STRING (ví dụ MongoDB Atlas connection string) trên Render.");
        }

        // Fallback chỉ dùng khi chạy Development ở máy local
        connStr = "mongodb://admin:admin123@192.168.203.142:27017/?authSource=admin";
    }

    return new MongoClient(connStr);
});

builder.Services.AddScoped<IMongoDatabase>(s =>
{
    var dbName = mongoSettings.GetValue<string>("DatabaseName") ?? "InsiderThreatDB";
    return s.GetRequiredService<IMongoClient>().GetDatabase(dbName);
});

builder.Services.AddScoped<MongoDB.Driver.GridFS.IGridFSBucket>(s =>
{
    var db = s.GetRequiredService<IMongoDatabase>();
    return new MongoDB.Driver.GridFS.GridFSBucket(db);
});

// ─── 2. CẤU HÌNH FORM OPTIONS (Hỗ trợ File lớn) ─────────────────────────────
builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = 524288000; // 500MB
    options.ValueLengthLimit = 524288000;
    options.MemoryBufferThreshold = 524288000;
});

// ─── 3. CẤU HÌNH CORS ──────────────────────────────────────────────────────
// Các origin cố định (môi trường dev ở máy local, Tauri, hạ tầng cũ trong LAN).
var defaultOrigins = new[]
{
    "http://localhost:5173", "http://localhost:5174", "http://localhost:3000",
    "http://127.0.0.1:5173", "http://127.0.0.1:5174", "http://127.0.0.1:3000",
    "http://tauri.localhost", "https://tauri.localhost", "tauri://localhost",
    "http://150.95.104.244", "https://150.95.104.244",
    "http://192.168.203.1", "https://192.168.203.1", "http://192.168.203.1:5173",
    "http://192.168.203.142", "https://192.168.203.142", "http://192.168.203.142:5173",
    "https://tuyen-thda.io.vn", "https://www.tuyen-thda.io.vn",
    // Frontend chạy trên Render (địa chỉ cố định, không đổi theo lần deploy)
    "https://insiderthreat-web.onrender.com"
};

// Các origin production (tên miền frontend) khai báo qua biến môi trường
// CORS_ALLOWED_ORIGINS, ngăn cách bằng dấu phẩy. Nhờ vậy đổi tên miền
// không cần sửa code và deploy lại.
var extraOrigins = (Environment.GetEnvironmentVariable("CORS_ALLOWED_ORIGINS") ?? string.Empty)
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

var allowedOrigins = defaultOrigins.Concat(extraOrigins).Distinct().ToArray();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowWebApp", policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// ─── 4. CẤU HÌNH JWT AUTHENTICATION ────────────────────────────────────────
var jwtSettings = builder.Configuration.GetSection("Jwt");
// ASP.NET Core map biến môi trường theo quy ước "Jwt__Key" (2 dấu gạch dưới),
// không phải "JWT_SECRET_KEY" — nên đọc thẳng bằng tên đó để khớp với biến đã
// đặt trên Render. Không còn khoá viết cứng: production bắt buộc phải có khoá
// thật, tránh lặp lại lỗi ký token bằng khoá mặc định công khai trong code.
var rawKey = Environment.GetEnvironmentVariable("JWT_SECRET_KEY") ?? jwtSettings["Key"];
if (string.IsNullOrWhiteSpace(rawKey))
{
    if (builder.Environment.IsProduction())
    {
        throw new InvalidOperationException(
            "Thiếu cấu hình JWT. Hãy set biến môi trường JWT_SECRET_KEY (tối thiểu 32 ký tự ngẫu nhiên) trên Render.");
    }
    // Fallback chỉ dùng khi chạy Development ở máy local.
    rawKey = "dev-only-insecure-key-do-not-use-in-production-32chars";
}
var key = Encoding.UTF8.GetBytes(rawKey);

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtSettings["Issuer"],
        ValidAudience = jwtSettings["Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(key),
        RoleClaimType = System.Security.Claims.ClaimTypes.Role,
        NameClaimType = System.Security.Claims.ClaimTypes.Name
    };

    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            var path = context.HttpContext.Request.Path;
            if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
            {
                context.Token = accessToken;
            }
            return Task.CompletedTask;
        }
    };
});

builder.Services.AddAuthorization();

// ─── 5. ĐĂNG KÝ SERVICES ───────────────────────────────────────────────────
builder.Services.AddScoped<InsiderThreat.Server.Services.IEmailService, InsiderThreat.Server.Services.EmailService>();
builder.Services.AddSingleton<InsiderThreat.Server.Services.ITelegramService, InsiderThreat.Server.Services.TelegramService>();
builder.Services.AddSingleton<InsiderThreat.Server.Services.IMessageEncryptionService, InsiderThreat.Server.Services.MessageEncryptionService>();
builder.Services.AddScoped<InsiderThreat.Server.Services.IWatermarkService, InsiderThreat.Server.Services.WatermarkService>();
builder.Services.AddSingleton<InsiderThreat.Server.Services.FileEncryptionService>();
builder.Services.AddSingleton<InsiderThreat.Server.Services.WatchdogStatusService>();

builder.Services.AddSignalR();
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// ─── 6. SEED ADMIN DATA ─────────────────────────────────────────────────────
// Không để lỗi kết nối DB làm sập tiến trình lúc khởi động: nếu Mongo tạm thời
// không truy cập được, service vẫn phải lên để healthcheck của Render đi qua.
try
{
    using (var scope = app.Services.CreateScope())
    {
        var db = scope.ServiceProvider.GetRequiredService<IMongoDatabase>();
        var usersCollection = db.GetCollection<User>("Users");
        var existingAdmin = await usersCollection.Find(u => u.Username == "admin").FirstOrDefaultAsync();
        if (existingAdmin == null)
        {
            var admin = new User
            {
                Username = "admin",
                PasswordHash = BCrypt.Net.BCrypt.HashPassword("admin123"),
                FullName = "Administrator",
                Role = "Admin",
                Email = "admin@insiderthreat.local",
                RequiresPasswordChange = false,
                CreatedAt = DateTime.Now
            };
            await usersCollection.InsertOneAsync(admin);
        }
    }
}
catch (Exception ex)
{
    app.Logger.LogError(ex, "Bỏ qua seed admin: không kết nối được MongoDB lúc khởi động.");
}

// ─── 7. PIPELINE ────────────────────────────────────────────────────────────
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowWebApp");
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

// Test API
app.MapGet("/test-db", (IMongoDatabase db) =>
{
    var users = db.GetCollection<BsonDocument>("Users").Find(_ => true).Limit(5).ToList();
    var groups = db.GetCollection<BsonDocument>("Groups").Find(_ => true).Limit(5).ToList();
    return Results.Ok(new { 
        Message = "✅ Database Connected", 
        UserCount = users.Count, 
        GroupCount = groups.Count 
    });
});

// Hubs
app.MapHub<InsiderThreat.Server.Hubs.SystemHub>("/hubs/system");
app.MapHub<InsiderThreat.Server.Hubs.ChatHub>("/hubs/chat");
app.MapHub<InsiderThreat.Server.Hubs.NotificationHub>("/hubs/notifications");
app.MapHub<InsiderThreat.Server.Hubs.VideoHub>("/hubs/video");

app.MapControllers();
app.Run();
