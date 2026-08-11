using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using MongoDB.Driver;
using InsiderThreat.Server.Models;
using InsiderThreat.Server.Hubs;
using InsiderThreat.Shared;

namespace InsiderThreat.Server.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class MessagesController : ControllerBase
{
    private readonly IMongoCollection<Message> _messagesCollection;
    private readonly IMongoCollection<InsiderThreat.Shared.User> _users;
    private readonly ILogger<MessagesController> _logger;
    private readonly NotificationsController _notificationsController;
    private readonly IHubContext<NotificationHub> _hubContext;

    public MessagesController(
        IMongoDatabase database,
        ILogger<MessagesController> logger,
        IHubContext<NotificationHub> hubContext)
    {
        _messagesCollection = database.GetCollection<Message>("Messages");
        _users = database.GetCollection<InsiderThreat.Shared.User>("Users");
        _logger = logger;
        _hubContext = hubContext;
        _notificationsController = new NotificationsController(database, hubContext);
    }

    // POST: api/messages
    [HttpPost]
    public async Task<ActionResult<Message>> SendMessage(Message message)
    {
        try
        {
            message.Timestamp = DateTime.UtcNow;
            message.IsRead = false;

            // E2EE: Content and SenderContent are already encrypted by the client.
            // Server stores ciphertext as-is — it cannot read the message.

            await _messagesCollection.InsertOneAsync(message);

            // Fetch sender name
            var sender = await _users.Find(u => u.Id == message.SenderId).FirstOrDefaultAsync();
            var senderName = sender?.FullName ?? sender?.Username ?? "Someone";

            if (!string.IsNullOrEmpty(message.GroupId))
            {
                // Group Chat Broadcast
                await _hubContext.Clients.Group($"group_{message.GroupId}")
                    .SendAsync("ReceiveGroupMessage", message);
                
                return Ok(message);
            }

            // Push notification for 1-on-1
            var previewText = !string.IsNullOrEmpty(message.AttachmentType)
                ? (message.AttachmentType == "image" ? "[Hình ảnh]" : "[Tệp đính kèm]")
                : "Đã gửi một tin nhắn mới";

            await _notificationsController.CreateSocialNotification(
                type: "Message",
                targetUserId: message.ReceiverId,
                message: $"{senderName}: {previewText}",
                actorUserId: message.SenderId,
                actorName: senderName,
                link: $"/chat?userId={message.SenderId}",
                relatedId: message.Id
            );

            // Return the message
            return Ok(message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending message");
            return StatusCode(500, new { Message = "Internal Server Error", Error = ex.Message });
        }
    }

    // GET: api/messages/{otherUserId}
    [HttpGet("{otherUserId}")]
    public async Task<ActionResult<List<Message>>> GetMessages(string otherUserId, [FromQuery] string currentUserId)
    {
        var filter = Builders<Message>.Filter.Or(
            Builders<Message>.Filter.And(
                Builders<Message>.Filter.Eq(m => m.SenderId, currentUserId),
                Builders<Message>.Filter.Eq(m => m.ReceiverId, otherUserId)
            ),
            Builders<Message>.Filter.And(
                Builders<Message>.Filter.Eq(m => m.SenderId, otherUserId),
                Builders<Message>.Filter.Eq(m => m.ReceiverId, currentUserId)
            )
        );

        var sort = Builders<Message>.Sort.Ascending(m => m.Timestamp);
        var messages = await _messagesCollection.Find(filter).Sort(sort).ToListAsync();

        // Filter out messages deleted for this user
        messages = messages.Where(m => m.DeletedFor == null || !m.DeletedFor.Contains(currentUserId)).ToList();

        return Ok(messages);
    }

    // GET: api/messages/group/{groupId}
    [HttpGet("group/{groupId}")]
    public async Task<ActionResult<List<Message>>> GetGroupMessages(string groupId)
    {
        // 🔒 Kiểm tra nếu groupId không phải là ObjectId hợp lệ thì trả về rỗng thay vì lỗi 500
        if (!MongoDB.Bson.ObjectId.TryParse(groupId, out _))
        {
            return Ok(new List<Message>());
        }

        var filter = Builders<Message>.Filter.Eq(m => m.GroupId, groupId);
        var sort = Builders<Message>.Sort.Ascending(m => m.Timestamp);
        var messages = await _messagesCollection.Find(filter).Sort(sort).ToListAsync();

        return Ok(messages);
    }

    // GET: api/messages/conversations
    [HttpGet("conversations")]
    public async Task<ActionResult<IEnumerable<object>>> GetConversations([FromQuery] string userId)
    {
        if (string.IsNullOrEmpty(userId)) return BadRequest("User ID is required");

        var filter = Builders<Message>.Filter.Or(
            Builders<Message>.Filter.Eq(m => m.SenderId, userId),
            Builders<Message>.Filter.Eq(m => m.ReceiverId, userId)
        );

        var messages = await _messagesCollection
            .Find(filter)
            .SortByDescending(m => m.Timestamp)
            .ToListAsync();

        var conversations = new Dictionary<string, object>();
        var userIdsToFetch = new HashSet<string>();

        foreach (var m in messages)
        {
            var otherUserId = m.SenderId == userId ? m.ReceiverId : m.SenderId;
            userIdsToFetch.Add(otherUserId);

            if (!conversations.ContainsKey(otherUserId))
            {
                conversations[otherUserId] = new
                {
                    ContactId = otherUserId,
                    LastMessage = string.IsNullOrEmpty(m.AttachmentType)
                        ? "Đã gửi tin nhắn"
                        : (m.AttachmentType == "image" ? "[Hình ảnh]" : "[Tệp đính kèm]"),
                    LastMessageTime = m.Timestamp,
                    UnreadCount = messages.Count(msg => msg.SenderId == otherUserId && msg.ReceiverId == userId && !msg.IsRead)
                };
            }
        }

        var users = await _users.Find(u => userIdsToFetch.Contains(u.Id)).ToListAsync();

        var result = conversations.Values.Select(c =>
        {
            dynamic conv = c;
            var user = users.FirstOrDefault(u => u.Id == conv.ContactId);
            return new
            {
                id = conv.ContactId,
                username = user?.Username ?? "Unknown",
                fullName = user?.FullName,
                avatar = user?.AvatarUrl,
                publicKey = user?.PublicKey, // E2EE: client needs receiver's public key
                lastMessage = conv.LastMessage,
                lastMessageTime = conv.LastMessageTime,
                unreadCount = conv.UnreadCount
            };
        }).OrderByDescending(c => c.lastMessageTime).ToList();

        return Ok(result);
    }

    // PUT: api/messages/read/{senderId}
    [HttpPut("read/{senderId}")]
    public async Task<IActionResult> MarkMessagesAsRead(string senderId)
    {
        var receiverId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(receiverId)) return Unauthorized();
        if (string.IsNullOrEmpty(senderId)) return BadRequest("Sender ID is required");

        var filter = Builders<Message>.Filter.And(
            Builders<Message>.Filter.Eq(m => m.SenderId, senderId),
            Builders<Message>.Filter.Eq(m => m.ReceiverId, receiverId),
            Builders<Message>.Filter.Eq(m => m.IsRead, false)
        );
        var update = Builders<Message>.Update.Set(m => m.IsRead, true);
        var result = await _messagesCollection.UpdateManyAsync(filter, update);

        if (result.ModifiedCount > 0)
        {
            await _hubContext.Clients.Group($"user_{senderId}")
                   .SendAsync("MessagesRead", receiverId);
        }

        return NoContent();
    }

    // DELETE: api/messages/{id}/for-everyone
    [HttpDelete("{id}/for-everyone")]
    public async Task<IActionResult> DeleteForEveryone(string id)
    {
        var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var msg = await _messagesCollection.Find(m => m.Id == id).FirstOrDefaultAsync();
        if (msg == null) return NotFound();
        if (msg.SenderId != userId) return Forbid();

        await _messagesCollection.DeleteOneAsync(m => m.Id == id);
        return NoContent();
    }

    // DELETE: api/messages/{id}/for-me
    [HttpDelete("{id}/for-me")]
    public async Task<IActionResult> DeleteForMe(string id)
    {
        var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var msg = await _messagesCollection.Find(m => m.Id == id).FirstOrDefaultAsync();
        if (msg == null) return NotFound();

        var update = Builders<Message>.Update.AddToSet(m => m.DeletedFor, userId);
        await _messagesCollection.UpdateOneAsync(m => m.Id == id, update);
        return NoContent();
    }

    // PUT: api/messages/{id}/edit
    // E2EE: Client sends already-encrypted content + senderContent
    [HttpPut("{id}/edit")]
    public async Task<IActionResult> EditMessage(string id, [FromBody] EditMessageRequest request)
    {
        var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var msg = await _messagesCollection.Find(m => m.Id == id).FirstOrDefaultAsync();
        if (msg == null) return NotFound();
        if (msg.SenderId != userId) return Forbid();

        // Store client-encrypted content directly
        var update = Builders<Message>.Update
            .Set(m => m.Content, request.Content)
            .Set(m => m.SenderContent, request.SenderContent)
            .Set(m => m.IsEdited, true);
        await _messagesCollection.UpdateOneAsync(m => m.Id == id, update);
        return Ok(new { success = true });
    }

    public class EditMessageRequest
    {
        public string Content { get; set; } = string.Empty;
        public string? SenderContent { get; set; }
    }

}
