using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using MongoDB.Driver;
using InsiderThreat.Server.Models;
using InsiderThreat.Shared;
using System.Security.Claims;
using InsiderThreat.Server.Hubs;

namespace InsiderThreat.Server.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class LeaveRequestsController : ControllerBase
    {
        private readonly IMongoCollection<LeaveRequest> _leaveRequests;
        private readonly IMongoCollection<InsiderThreat.Shared.User> _users;
        private readonly IMongoCollection<ProjectTask> _tasks;
        private readonly IMongoCollection<InsiderThreat.Shared.Notification> _notifications;
        private readonly IHubContext<NotificationHub> _hubContext;
        private readonly ILogger<LeaveRequestsController> _logger;

        public LeaveRequestsController(IMongoDatabase database, IHubContext<NotificationHub> hubContext, ILogger<LeaveRequestsController> logger)
        {
            _leaveRequests = database.GetCollection<LeaveRequest>("LeaveRequests");
            _users = database.GetCollection<InsiderThreat.Shared.User>("Users");
            _tasks = database.GetCollection<ProjectTask>("ProjectTasks");
            _notifications = database.GetCollection<InsiderThreat.Shared.Notification>("Notifications");
            _hubContext = hubContext;
            _logger = logger;
        }

        // POST: api/LeaveRequests
        [HttpPost]
        public async Task<IActionResult> CreateRequest([FromBody] LeaveRequest request)
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var userName = User.FindFirst(ClaimTypes.Name)?.Value;
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var user = await _users.Find(u => u.Id == userId).FirstOrDefaultAsync();
            if (user == null) return NotFound("User not found");

            // 1. Basic Validation
            if (request.StartDate > request.EndDate)
                return BadRequest("Start date must be before end date");

            var duration = (request.EndDate - request.StartDate).Days + 1;
            if (request.Type == "Annual" && user.AnnualLeaveBalance < duration)
                return BadRequest($"Insufficient leave balance. Remaining: {user.AnnualLeaveBalance} days.");

            // 2. Task Conflict Check (Integration)
            var conflictingTasks = await _tasks.Find(t => 
                t.AssignedTo == userId && 
                t.Status != "Done" && 
                t.Deadline >= request.StartDate && 
                t.Deadline <= request.EndDate
            ).ToListAsync();

            // 3. Prepare Request
            request.Id = null;
            request.UserId = userId;
            request.UserName = user.FullName;
            request.ManagerId = user.ManagerId;
            request.Status = "Pending";
            request.CreatedAt = DateTime.UtcNow;

            _logger.LogInformation($"[LeaveRequest] Created by user {userId} ({user.FullName}). Assigned ManagerId: {(string.IsNullOrEmpty(user.ManagerId) ? "NONE" : user.ManagerId)}");

            await _leaveRequests.InsertOneAsync(request);

            // 4. Notify Manager (or fallback to all Admins if ManagerId not set)
            if (!string.IsNullOrEmpty(user.ManagerId))
            {
                var notification = new InsiderThreat.Shared.Notification
                {
                    Type = "LeaveRequest",
                    TargetUserId = user.ManagerId,
                    ActorUserId = userId,
                    ActorName = user.FullName,
                    Message = $"{user.FullName} đã gửi yêu cầu nghỉ phép ({request.Type}) từ {request.StartDate:dd/MM} đến {request.EndDate:dd/MM}.",
                    RelatedId = request.Id,
                    IsRead = false,
                    CreatedAt = DateTime.Now
                };
                await _notifications.InsertOneAsync(notification);
                await _hubContext.Clients.Group($"user_{user.ManagerId}").SendAsync("NewNotification", notification);
                _logger.LogInformation($"[LeaveRequest] Notification sent to manager {user.ManagerId}");
            }
            else
            {
                // Fallback: No manager assigned — notify all Admins and Directors
                _logger.LogWarning($"[LeaveRequest] User {userId} has no ManagerId. Sending fallback notification to Admins/Directors.");
                var adminUsers = await _users.Find(u =>
                    (u.Role == "Admin" || u.Role == "Giám đốc" || u.Role == "Director") && u.Id != userId
                ).ToListAsync();

                foreach (var admin in adminUsers)
                {
                    var notification = new InsiderThreat.Shared.Notification
                    {
                        Type = "LeaveRequest",
                        TargetUserId = admin.Id,
                        ActorUserId = userId,
                        ActorName = user.FullName,
                        Message = $"[Không có quản lý] {user.FullName} đã gửi yêu cầu nghỉ phép ({request.Type}) từ {request.StartDate:dd/MM} đến {request.EndDate:dd/MM}.",
                        RelatedId = request.Id,
                        IsRead = false,
                        CreatedAt = DateTime.Now
                    };
                    await _notifications.InsertOneAsync(notification);
                    await _hubContext.Clients.Group($"user_{admin.Id}").SendAsync("NewNotification", notification);
                }
            }

            return Ok(new { 
                Message = "Leave request submitted successfully", 
                RequestId = request.Id,
                Conflicts = conflictingTasks.Select(t => new { t.Id, t.Title, t.Deadline })
            });
        }

        // GET: api/LeaveRequests/my
        [HttpGet("my")]
        public async Task<ActionResult<List<LeaveRequest>>> GetMyRequests()
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var requests = await _leaveRequests.Find(r => r.UserId == userId)
                .SortByDescending(r => r.CreatedAt)
                .ToListAsync();
            return Ok(requests);
        }

        // GET: api/LeaveRequests/pending (Manager/Admin Only)
        [HttpGet("pending")]
        public async Task<ActionResult<List<LeaveRequest>>> GetPendingRequests()
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            FilterDefinition<LeaveRequest> filter;
            var currentRole = User.FindFirst(ClaimTypes.Role)?.Value?.ToLower();
            bool isHighAuth = User.IsInRole("Admin") ||
                currentRole == "giám đốc" || currentRole == "director";

            if (isHighAuth)
            {
                // Admins & Directors see ALL pending requests
                filter = Builders<LeaveRequest>.Filter.Eq(r => r.Status, "Pending");
            }
            else
            {
                // Managers see requests where they are the assigned manager
                filter = Builders<LeaveRequest>.Filter.And(
                    Builders<LeaveRequest>.Filter.Eq(r => r.ManagerId, userId),
                    Builders<LeaveRequest>.Filter.Eq(r => r.Status, "Pending")
                );
            }

            var requests = await _leaveRequests.Find(filter)
                .SortByDescending(r => r.CreatedAt)
                .ToListAsync();
            return Ok(requests);
        }

        // POST: api/LeaveRequests/{id}/approve
        [HttpPost("{id}/approve")]
        public async Task<IActionResult> ApproveRequest(string id)
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var request = await _leaveRequests.Find(r => r.Id == id).FirstOrDefaultAsync();
            if (request == null) return NotFound();

            var approverRole = User.FindFirst(ClaimTypes.Role)?.Value?.ToLower();
            bool isHighAuthority = User.IsInRole("Admin") ||
                approverRole == "giám đốc" || approverRole == "director";
            if (request.ManagerId != userId && !isHighAuthority)
                return Forbid("Only the assigned manager, admin, or director can approve this request.");

            // Update Request Status
            var update = Builders<LeaveRequest>.Update
                .Set(r => r.Status, "Approved")
                .Set(r => r.ApprovedBy, userId)
                .Set(r => r.ApprovedAt, DateTime.UtcNow);
            
            await _leaveRequests.UpdateOneAsync(r => r.Id == id, update);

            // Deduct Balance if Annual Leave
            if (request.Type == "Annual")
            {
                var duration = (request.EndDate - request.StartDate).Days + 1;
                await _users.UpdateOneAsync(
                    u => u.Id == request.UserId,
                    Builders<InsiderThreat.Shared.User>.Update.Inc(u => u.AnnualLeaveBalance, -duration)
                );
            }

            // Notify Employee
            var notification = new InsiderThreat.Shared.Notification
            {
                Type = "LeaveApproved",
                TargetUserId = request.UserId,
                ActorUserId = userId,
                ActorName = "Quản lý",
                Message = $"Yêu cầu nghỉ phép của bạn từ {request.StartDate:dd/MM} đã được PHÊ DUYỆT.",
                RelatedId = request.Id,
                IsRead = false,
                CreatedAt = DateTime.Now
            };
            await _notifications.InsertOneAsync(notification);
            await _hubContext.Clients.Group($"user_{request.UserId}").SendAsync("NewNotification", notification);

            return Ok(new { Message = "Request approved successfully" });
        }

        // POST: api/LeaveRequests/{id}/reject
        [HttpPost("{id}/reject")]
        public async Task<IActionResult> RejectRequest(string id, [FromBody] string reason)
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var request = await _leaveRequests.Find(r => r.Id == id).FirstOrDefaultAsync();
            if (request == null) return NotFound();

            var rejecterRole = User.FindFirst(ClaimTypes.Role)?.Value?.ToLower();
            bool isHighAuthorityRejecter = User.IsInRole("Admin") ||
                rejecterRole == "giám đốc" || rejecterRole == "director";
            if (request.ManagerId != userId && !isHighAuthorityRejecter)
                return Forbid();

            var update = Builders<LeaveRequest>.Update
                .Set(r => r.Status, "Rejected")
                .Set(r => r.RejectionReason, reason);
            
            await _leaveRequests.UpdateOneAsync(r => r.Id == id, update);

            // Notify Employee
            var notification = new InsiderThreat.Shared.Notification
            {
                Type = "LeaveRejected",
                TargetUserId = request.UserId,
                ActorUserId = userId,
                ActorName = "Quản lý",
                Message = $"Yêu cầu nghỉ phép của bạn từ {request.StartDate:dd/MM} đã bị TỪ CHỐI. Lý do: {reason}",
                RelatedId = request.Id,
                IsRead = false,
                CreatedAt = DateTime.Now
            };
            await _notifications.InsertOneAsync(notification);
            await _hubContext.Clients.Group($"user_{request.UserId}").SendAsync("NewNotification", notification);

            return Ok(new { Message = "Request rejected successfully" });
        }
    }
}
