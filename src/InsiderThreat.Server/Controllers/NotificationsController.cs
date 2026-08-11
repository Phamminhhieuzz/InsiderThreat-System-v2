using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using MongoDB.Driver;
using InsiderThreat.Shared;
using InsiderThreat.Server.Hubs;
using System.Security.Claims;

namespace InsiderThreat.Server.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class NotificationsController : ControllerBase
{
    private readonly IMongoCollection<Notification> _notifications;
    private readonly IMongoCollection<User> _users;
    private readonly IHubContext<NotificationHub> _hubContext;

    public NotificationsController(IMongoDatabase database, IHubContext<NotificationHub> hubContext)
    {
        _notifications = database.GetCollection<Notification>("Notifications");
        _users = database.GetCollection<User>("Users");
        _hubContext = hubContext;
    }

    // GET: api/notifications
    // Get notifications relevant to the current user (Global + Personal)
    [HttpGet]
    public async Task<ActionResult<List<Notification>>> GetNotifications()
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        // Filter: Type == "Global" OR TargetUserId == userId
        var filter = Builders<Notification>.Filter.Or(
            Builders<Notification>.Filter.Eq(n => n.Type, "Global"),
            Builders<Notification>.Filter.Eq(n => n.TargetUserId, userId)
        );

        var notifications = await _notifications.Find(filter)
            .SortByDescending(n => n.CreatedAt)
            .Limit(20)
            .ToListAsync();

        return Ok(notifications);
    }

    // POST: api/notifications (Admin only)
    [Authorize(Roles = "Admin,Giám đốc,Giam doc,Director")]
    [HttpPost]
    public async Task<ActionResult<Notification>> CreateNotification([FromBody] Notification notification)
    {
        notification.Id = null;
        notification.CreatedAt = DateTime.Now;
        notification.IsRead = false;

        await _notifications.InsertOneAsync(notification);

        // Push realtime — Global → all, personal → target user
        if (notification.Type == "Global")
            await _hubContext.Clients.All.SendAsync("NewNotification", notification);
        else if (!string.IsNullOrEmpty(notification.TargetUserId))
            await _hubContext.Clients.Group($"user_{notification.TargetUserId}").SendAsync("NewNotification", notification);

        return CreatedAtAction(nameof(GetNotifications), new { id = notification.Id }, notification);
    }

    // PUT: api/notifications/{id}/read
    [HttpPut("{id}/read")]
    public async Task<IActionResult> MarkAsRead(string id)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        var filter = Builders<Notification>.Filter.And(
            Builders<Notification>.Filter.Eq(n => n.Id, id),
            Builders<Notification>.Filter.Or(
                Builders<Notification>.Filter.Eq(n => n.TargetUserId, userId),
                Builders<Notification>.Filter.Eq(n => n.Type, "Global")
            )
        );

        var update = Builders<Notification>.Update.Set(n => n.IsRead, true);
        var result = await _notifications.UpdateOneAsync(filter, update);

        if (result.MatchedCount == 0)
            return NotFound();

        return NoContent();
    }

    // PUT: api/notifications/read-all
    [HttpPut("read-all")]
    public async Task<IActionResult> MarkAllAsRead()
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        var filter = Builders<Notification>.Filter.And(
            Builders<Notification>.Filter.Eq(n => n.IsRead, false),
            Builders<Notification>.Filter.Or(
                Builders<Notification>.Filter.Eq(n => n.TargetUserId, userId),
                Builders<Notification>.Filter.Eq(n => n.Type, "Global")
            )
        );

        var update = Builders<Notification>.Update.Set(n => n.IsRead, true);
        await _notifications.UpdateManyAsync(filter, update);

        return NoContent();
    }

    // DELETE: api/notifications/read
    [HttpDelete("read")]
    public async Task<IActionResult> DeleteReadNotifications()
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        var filter = Builders<Notification>.Filter.And(
            Builders<Notification>.Filter.Eq(n => n.IsRead, true),
            Builders<Notification>.Filter.Or(
                Builders<Notification>.Filter.Eq(n => n.TargetUserId, userId),
                Builders<Notification>.Filter.Eq(n => n.Type, "Global")
            )
        );

        await _notifications.DeleteManyAsync(filter);
        return NoContent();
    }

    // GET: api/notifications/unread-count
    [HttpGet("unread-count")]
    public async Task<ActionResult<int>> GetUnreadCount()
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        var filter = Builders<Notification>.Filter.And(
            Builders<Notification>.Filter.Eq(n => n.IsRead, false),
            Builders<Notification>.Filter.Or(
                Builders<Notification>.Filter.Eq(n => n.TargetUserId, userId),
                Builders<Notification>.Filter.Eq(n => n.Type, "Global")
            )
        );

        var count = await _notifications.CountDocumentsAsync(filter);
        return Ok(new { count });
    }

    // Helper method to create a notification (can be called from other controllers)
    [NonAction]
    public async Task CreateSocialNotification(
        string type,
        string targetUserId,
        string message,
        string? actorUserId = null,
        string? actorName = null,
        string? link = null,
        string? relatedId = null)
    {
        var notification = new Notification
        {
            Type = type,
            TargetUserId = targetUserId,
            ActorUserId = actorUserId,
            ActorName = actorName,
            Message = message,
            Link = link,
            RelatedId = relatedId,
            IsRead = false,
            CreatedAt = DateTime.Now
        };

        await _notifications.InsertOneAsync(notification);

        // Push realtime to target user
        if (!string.IsNullOrEmpty(notification.TargetUserId))
            await _hubContext.Clients.Group($"user_{notification.TargetUserId}").SendAsync("NewNotification", notification);
    }
}
