using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using InsiderThreat.Shared;
using System.Security.Cryptography;
using System.Text;
using MongoDB.Bson;

namespace InsiderThreat.Server.Controllers;

[Authorize] // Cho phép tất cả user đã đăng nhập
[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    private readonly IMongoCollection<User> _usersCollection;
    private readonly IMongoCollection<PendingAction> _pendingActionsCollection;
    private readonly ILogger<UsersController> _logger;

    public UsersController(IMongoDatabase database, ILogger<UsersController> logger)
    {
        _usersCollection = database.GetCollection<User>("Users");
        _pendingActionsCollection = database.GetCollection<PendingAction>("PendingActions");
        _logger = logger;
    }

    // GET: api/users
    [HttpGet]
    public async Task<ActionResult<List<User>>> GetUsers()
    {
        var users = await _usersCollection.Find(_ => true).ToListAsync();
        // Ẩn hash password trước khi trả về
        users.ForEach(u => u.PasswordHash = "");
        return Ok(users);
    }

    // GET: api/users/hierarchy
    [HttpGet("hierarchy")]
    public async Task<ActionResult<List<User>>> GetHierarchy()
    {
        // Trả về danh sách user cơ bản để build cây sơ đồ tổ chức
        var users = await _usersCollection.Find(_ => true)
            .Project<User>(Builders<User>.Projection
                .Include(u => u.Id)
                .Include(u => u.FullName)
                .Include(u => u.Role)
                .Include(u => u.Department)
                .Include(u => u.Position)
                .Include(u => u.AvatarUrl)
                .Include(u => u.ManagerId))
            .ToListAsync();
        return Ok(users);
    }

    // GET: api/users/{id}
    [HttpGet("{id}")]
    public async Task<ActionResult<User>> GetUser(string id)
    {
        var user = await _usersCollection.Find(u => u.Id == id).FirstOrDefaultAsync();
        if (user == null) return NotFound();
        user.PasswordHash = "";
        return Ok(user);
    }

    // GET: api/users/online
    [HttpGet("online")]
    public ActionResult<IEnumerable<string>> GetOnlineUsers()
    {
        return Ok(Hubs.NotificationHub.GetOnlineUsers());
    }

    // POST: api/users
    [Authorize(Roles = "Admin,Giám đốc,Giam doc,Director")]
    [HttpPost]
    public async Task<ActionResult<User>> CreateUser(User newUser)
    {
        // Check username exists
        var existingUser = await _usersCollection.Find(u => u.Username == newUser.Username).FirstOrDefaultAsync();
        if (existingUser != null)
        {
            return BadRequest(new { Message = "Username đã tồn tại" });
        }

        // Hash password (giả sử client gửi plain text password trong PasswordHash tạm thời, hoặc thêm DTO)
        // Để đơn giản, ta sẽ quy ước: Khi tạo mới, field PasswordHash chứa password chưa hash
        if (!string.IsNullOrEmpty(newUser.PasswordHash))
        {
            newUser.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newUser.PasswordHash);
        }

        newUser.Id = null; // Auto gen ID
        newUser.CreatedAt = DateTime.Now;

        await _usersCollection.InsertOneAsync(newUser);

        newUser.PasswordHash = ""; // Hide for response
        return CreatedAtAction(nameof(GetUser), new { id = newUser.Id }, newUser);
    }

    public class UpdateUserDto
    {
        public string? FullName { get; set; }
        public string? Role { get; set; }
        public string? Department { get; set; }
        public string? Email { get; set; }
        public string? Position { get; set; }
        public string? Bio { get; set; }
        public string? PhoneNumber { get; set; }
        public string? AvatarUrl { get; set; }
        public string? FaceImageUrl { get; set; }
        public string? ManagerId { get; set; }
        public string? PasswordHash { get; set; }
    }

    // PUT: api/users/{id}
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateUser(string id, UpdateUserDto updatedUser)
    {
        _logger.LogInformation($"UpdateUser called for ID: {id}");
        _logger.LogInformation($"Received Data - FullName: {updatedUser.FullName}, Role: {updatedUser.Role}, Email: {updatedUser.Email}, AvatarUrl: {updatedUser.AvatarUrl}");

        var user = await _usersCollection.Find(u => u.Id == id).FirstOrDefaultAsync();
        if (user == null) return NotFound();

        // Update basic info if provided
        if (!string.IsNullOrEmpty(updatedUser.FullName)) user.FullName = updatedUser.FullName;
        if (!string.IsNullOrEmpty(updatedUser.Role)) user.Role = updatedUser.Role;
        if (!string.IsNullOrEmpty(updatedUser.Department)) user.Department = updatedUser.Department;
        if (!string.IsNullOrEmpty(updatedUser.Email)) user.Email = updatedUser.Email;

        // Update new fields
        if (!string.IsNullOrEmpty(updatedUser.Position)) user.Position = updatedUser.Position;
        if (!string.IsNullOrEmpty(updatedUser.Bio)) user.Bio = updatedUser.Bio;
        if (!string.IsNullOrEmpty(updatedUser.PhoneNumber)) user.PhoneNumber = updatedUser.PhoneNumber;

        // Always update avatar if provided
        if (!string.IsNullOrEmpty(updatedUser.AvatarUrl)) user.AvatarUrl = updatedUser.AvatarUrl;

        // Cập nhật ảnh khuôn mặt
        if (!string.IsNullOrEmpty(updatedUser.FaceImageUrl)) user.FaceImageUrl = updatedUser.FaceImageUrl;

        // Cập nhật người quản lý (ManagerId)
        // If ManagerId is explicitly set, update it. If we want to allow clearing manager, we might need a specific check, but for now we follow the existing behavior.
        // Wait, the existing code: user.ManagerId = updatedUser.ManagerId; 
        // With UpdateUserDto, ManagerId is nullable.
        // If they send `managerId: ""` we can clear it. Wait, the frontend sends `{ managerId: managerId || "" }`.
        // So we should update it if it's explicitly part of the request, or we can just always assign it if it's not null.
        if (updatedUser.ManagerId != null) user.ManagerId = updatedUser.ManagerId;

        // user.Username thường không cho đổi để tránh conflict ID hệ thống khác

        // Nếu có gửi password mới thì hash và update
        if (!string.IsNullOrEmpty(updatedUser.PasswordHash))
        {
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(updatedUser.PasswordHash);
            user.RequiresPasswordChange = true;
        }

        await _usersCollection.ReplaceOneAsync(u => u.Id == id, user);
        return NoContent();
    }

    // DELETE: api/users/{id}
    [Authorize(Roles = "Admin,Giám đốc,Giam doc,Director")]
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteUser(string id)
    {
        var targetUser = await _usersCollection.Find(u => u.Id == id).FirstOrDefaultAsync();
        if (targetUser == null) return NotFound();

        var currentUserId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "Unknown";
        var currentUserName = User.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value ?? "Unknown";

        // Không cho tự xóa tài khoản của chính mình, tránh tự khoá mình khỏi hệ thống.
        if (targetUser.Id == currentUserId)
        {
            return BadRequest(new { Message = "Bạn không thể tự xóa tài khoản của chính mình." });
        }

        var result = await _usersCollection.DeleteOneAsync(u => u.Id == id);

        if (result.DeletedCount == 0)
        {
            return BadRequest(new { Message = "Xóa người dùng thất bại. Vui lòng thử lại." });
        }

        // Ghi nhật ký để truy vết trách nhiệm: ai đã xóa ai, vào lúc nào.
        _logger.LogWarning(
            "Người dùng bị xóa: {TargetName} ({TargetUsername}, id={TargetId}) — thực hiện bởi {ActorName} (id={ActorId}) lúc {Timestamp:o}",
            targetUser.FullName, targetUser.Username, id, currentUserName, currentUserId, DateTime.UtcNow);

        // Dọn các yêu cầu phê duyệt cũ còn treo của user này, tránh rác dữ liệu.
        await _pendingActionsCollection.DeleteManyAsync(
            a => a.TargetId == id && a.Type == ActionType.DeleteUser && a.Status == ActionStatus.Pending);

        return Ok(new { Message = $"Đã xóa người dùng {targetUser.FullName} ({targetUser.Username})." });
    }

    // PUT: api/users/{id}/face-embeddings
    [HttpPut("{id}/face-embeddings")]
    public async Task<IActionResult> UpdateFaceEmbeddings(string id, [FromBody] double[] embeddings)
    {
        _logger.LogInformation($"UpdateFaceEmbeddings called for User ID: {id}");
        _logger.LogInformation($"Embeddings length: {embeddings?.Length}");

        var filter = Builders<User>.Filter.Eq(u => u.Id, id);
        var existingUser = await _usersCollection.Find(filter).FirstOrDefaultAsync();

        if (existingUser == null)
        {
            _logger.LogWarning($"User not found with ID: {id}");
            return NotFound(new { Message = $"User not found with ID: {id}" });
        }

        if (existingUser.FaceEmbeddings != null && existingUser.FaceEmbeddings.Length > 0)
        {
            _logger.LogWarning($"User {id} already has face embeddings registered");
            return BadRequest(new { Message = "Khuôn mặt đã được đăng ký. Mỗi tài khoản chỉ được đăng ký 1 khuôn mặt. Liên hệ admin để đặt lại." });
        }

        var update = Builders<User>.Update.Set(u => u.FaceEmbeddings, embeddings);
        await _usersCollection.UpdateOneAsync(filter, update);

        return Ok(new { Message = "Đăng ký khuôn mặt thành công" });
    }

    // PUT: api/users/{id}/face-image
    [HttpPut("{id}/face-image")]
    public async Task<IActionResult> UpdateFaceImage(string id, [FromBody] FaceImageDto dto)
    {
        _logger.LogInformation($"UpdateFaceImage called for User ID: {id}, URL: {dto.Url}");

        var filter = Builders<User>.Filter.Eq(u => u.Id, id);
        var update = Builders<User>.Update.Set(u => u.FaceImageUrl, dto.Url);

        var result = await _usersCollection.UpdateOneAsync(filter, update);

        if (result.MatchedCount == 0)
        {
            return NotFound(new { Message = $"User not found with ID: {id}" });
        }

        return Ok(new { Message = "Face image updated successfully", Url = dto.Url });
    }

    public class FaceImageDto
    {
        public string Url { get; set; } = string.Empty;
    }

    // PUT: api/users/{id}/public-key
    [HttpPut("{id}/public-key")]
    public async Task<IActionResult> UpdatePublicKey(string id, [FromBody] string publicKey)
    {
        var filter = Builders<User>.Filter.Eq(u => u.Id, id);
        var update = Builders<User>.Update.Set(u => u.PublicKey, publicKey);

        var result = await _usersCollection.UpdateOneAsync(filter, update);

        if (result.MatchedCount == 0)
        {
            return NotFound(new { Message = "User not found" });
        }

        return Ok(new { Message = "Public key updated successfully" });
    }

    // GET: api/users/{id}/logs
    [HttpGet("{id}/logs")]
    public async Task<ActionResult<List<LogEntry>>> GetUserLogs(string id)
    {
        // Kiểm tra quyền: Chỉ user đó hoặc Admin mới được xem log cá nhân
        // (Tạm thời bỏ qua check quyền chặt chẽ để test nhanh, hoặc check id trùng current user)
        // var currentUserId = User.FindFirst("id")?.Value;

        var logsCollection = _usersCollection.Database.GetCollection<LogEntry>("Logs");

        // Lấy User để biết Username (vì Log có thể lưu theo UserID hoặc Username/ComputerName??)
        // Trong AuthController log lưu: ActionTaken/Message...
        // Tạm thời Log không có UserId chuẩn, nó có ComputerName/IP.
        // Nhưng AttendanceLog có UserId.
        // LogEntry trong AuthController: LogType, Message, etc.
        // Nếu muốn query Logs liên quan user, ta cần lưu UserId vào LogEntry hoặc query theo text (không hay).

        // SOLUTION: Query AttendanceLogs trước (dễ hơn vì có UserId).
        // Nếu muốn query Security Logs (LogEntry), ta cần update LogEntry model để có UserId.
        // Hiện tại AuthController log face login failed log IP/ComputerName.

        // Tạm thời trả về Attendance Logs (dễ nhất) -> Hoặc LogEntry nếu filter theo Username?
        // Let's assume we want SECURITY logs.
        // AuthController logs "User '{user.Username}' đăng nhập thành công".
        // Ta có thể filter Message contains username. (Hơi basic nhưng work for now).

        var user = await _usersCollection.Find(u => u.Id == id).FirstOrDefaultAsync();
        if (user == null) return NotFound();

        var filter = Builders<LogEntry>.Filter.Regex("Message", new BsonRegularExpression(user.Username, "i"));

        var logs = await logsCollection.Find(filter)
            .SortByDescending(l => l.Timestamp)
            .Limit(50)
            .ToListAsync();

        return Ok(logs);
    }
}
