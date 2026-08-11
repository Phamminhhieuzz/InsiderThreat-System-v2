using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using InsiderThreat.Shared;

namespace InsiderThreat.Server.Controllers;

[Authorize(Roles = "Admin,Giám đốc,Giam doc,Director")]
[ApiController]
[Route("api/[controller]")]
public class SecurityApprovalsController : ControllerBase
{
    private readonly IMongoCollection<PendingAction> _pendingActionsCollection;
    private readonly IMongoCollection<User> _usersCollection;
    private readonly ILogger<SecurityApprovalsController> _logger;

    public SecurityApprovalsController(IMongoDatabase database, ILogger<SecurityApprovalsController> logger)
    {
        _pendingActionsCollection = database.GetCollection<PendingAction>("PendingActions");
        _usersCollection = database.GetCollection<User>("Users");
        _logger = logger;
    }

    // GET: api/securityapprovals/pending
    [HttpGet("pending")]
    public async Task<ActionResult<List<PendingAction>>> GetPendingActions()
    {
        var actions = await _pendingActionsCollection
            .Find(a => a.Status == ActionStatus.Pending && a.ExpiresAt > DateTime.UtcNow)
            .ToListAsync();
        return Ok(actions);
    }

    // POST: api/securityapprovals/{id}/approve
    [HttpPost("{id}/approve")]
    public async Task<IActionResult> ApproveAction(string id)
    {
        var action = await _pendingActionsCollection.Find(a => a.Id == id).FirstOrDefaultAsync();
        if (action == null || action.Status != ActionStatus.Pending) return NotFound();

        var currentUserId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var currentUserName = User.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value;

        // 🛡️ CHỐNG TỰ PHÊ DUYỆT (Self-Approval Check)
        if (action.RequestedByUserId == currentUserId)
        {
            return BadRequest(new { Message = "Bạn không thể tự phê duyệt yêu cầu của chính mình. Cần một quản trị viên khác." });
        }

        // Thực thi hành động dựa trên Type
        bool success = false;
        try
        {
            switch (action.Type)
            {
                case ActionType.DeleteUser:
                    var result = await _usersCollection.DeleteOneAsync(u => u.Id == action.TargetId);
                    success = result.DeletedCount > 0;
                    break;
                // Có thể thêm các case khác như UpdateRole, ClearLogs...
            }

            if (success)
            {
                // Cập nhật trạng thái yêu cầu
                var update = Builders<PendingAction>.Update
                    .Set(a => a.Status, ActionStatus.Approved)
                    .Set(a => a.ApprovedByUserId, currentUserId)
                    .Set(a => a.ApprovedByUserName, currentUserName)
                    .Set(a => a.ProcessedAt, DateTime.UtcNow);

                await _pendingActionsCollection.UpdateOneAsync(a => a.Id == id, update);
                return Ok(new { Message = "Hành động đã được phê duyệt và thực thi thành công." });
            }
            else
            {
                return BadRequest(new { Message = "Thực thi hành động thất bại. Mục tiêu có thể không còn tồn tại." });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi khi thực thi hành động phê duyệt");
            return StatusCode(500, new { Message = "Lỗi hệ thống: " + ex.Message });
        }
    }

    // POST: api/securityapprovals/{id}/reject
    [HttpPost("{id}/reject")]
    public async Task<IActionResult> RejectAction(string id)
    {
        var currentUserId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var currentUserName = User.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value;

        var update = Builders<PendingAction>.Update
            .Set(a => a.Status, ActionStatus.Rejected)
            .Set(a => a.ApprovedByUserId, currentUserId)
            .Set(a => a.ApprovedByUserName, currentUserName)
            .Set(a => a.ProcessedAt, DateTime.UtcNow);

        var result = await _pendingActionsCollection.UpdateOneAsync(a => a.Id == id && a.Status == ActionStatus.Pending, update);
        
        if (result.ModifiedCount == 0) return NotFound();
        return Ok(new { Message = "Yêu cầu đã bị từ chối." });
    }
}
