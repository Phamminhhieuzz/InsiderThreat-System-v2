using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;

namespace InsiderThreat.Server.Hubs;

[Authorize]
public class NotificationHub : Hub
{
    private readonly ILogger<NotificationHub> _logger;
    private static readonly HashSet<string> _onlineUsers = new HashSet<string>();

    public NotificationHub(ILogger<NotificationHub> logger)
    {
        _logger = logger;
    }

    public static IEnumerable<string> GetOnlineUsers() => _onlineUsers;

    public override async Task OnConnectedAsync()
    {
        var userId = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!string.IsNullOrEmpty(userId))
        {
            // Mỗi user join 1 group riêng theo userId để nhận thông báo cá nhân
            await Groups.AddToGroupAsync(Context.ConnectionId, $"user_{userId}");
            
            bool isNewLogin = false;
            lock (_onlineUsers)
            {
                isNewLogin = _onlineUsers.Add(userId);
            }

            if (isNewLogin)
            {
                // Notify others that this user is online
                await Clients.Others.SendAsync("UserOnline", userId);
            }

            _logger.LogInformation($"User {userId} connected to NotificationHub");
        }
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!string.IsNullOrEmpty(userId))
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"user_{userId}");

            bool isLoggedOut = false;
            lock (_onlineUsers)
            {
                isLoggedOut = _onlineUsers.Remove(userId);
            }

            if (isLoggedOut)
            {
                // Notify others that this user is offline
                await Clients.Others.SendAsync("UserOffline", userId);
            }
        }
        await base.OnDisconnectedAsync(exception);
    }

    // --- Group Chat Methods ---
    public async Task JoinChatGroup(string groupId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"group_{groupId}");
        _logger.LogInformation($"Client {Context.ConnectionId} joined chat group {groupId}");
    }

    public async Task LeaveChatGroup(string groupId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"group_{groupId}");
        _logger.LogInformation($"Client {Context.ConnectionId} left chat group {groupId}");
    }

    // --- Project Sync Methods ---
    public async Task JoinProjectGroup(string projectId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"project_{projectId}");
        _logger.LogInformation($"Client {Context.ConnectionId} joined project group {projectId}");
    }

    public async Task LeaveProjectGroup(string projectId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"project_{projectId}");
        _logger.LogInformation($"Client {Context.ConnectionId} left project group {projectId}");
    }
}
