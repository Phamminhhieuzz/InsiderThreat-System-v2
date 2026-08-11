using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;

namespace InsiderThreat.Server.Hubs;

public class ChatHub : Hub
{
    // Lưu trữ tạm thời danh sách phòng và tin nhắn (Trong thực tế nên dùng Database)
    private static readonly ConcurrentDictionary<string, RoomInfo> _rooms = new();
    private static readonly ConcurrentDictionary<string, List<ChatMessage>> _roomMessages = new();

    public async Task CreateRoom(string roomName, string accessCode, string description)
    {
        var roomId = Guid.NewGuid().ToString();
        var room = new RoomInfo
        {
            Id = roomId,
            Name = roomName,
            AccessCode = accessCode,
            Description = description,
            IsPrivate = !string.IsNullOrEmpty(accessCode),
            CreatedAt = DateTime.UtcNow
        };

        if (_rooms.TryAdd(roomId, room))
        {
            // Thông báo cho tất cả client biết có phòng mới
            await Clients.All.SendAsync("RoomCreated", room);
        }
    }

    public async Task JoinRoom(string roomId, string accessCode)
    {
        if (_rooms.TryGetValue(roomId, out var room))
        {
            if (room.IsPrivate && room.AccessCode != accessCode)
            {
                throw new HubException("Mã truy cập không đúng!");
            }

            await Groups.AddToGroupAsync(Context.ConnectionId, roomId);
            
            // Gửi lịch sử tin nhắn cũ (nếu có)
            if (_roomMessages.TryGetValue(roomId, out var messages))
            {
                await Clients.Caller.SendAsync("LoadHistory", messages);
            }

            await Clients.Caller.SendAsync("JoinedSuccess", roomId);
        }
        else
        {
            throw new HubException("Phòng không tồn tại!");
        }
    }

    public async Task SendMessage(string roomId, string message)
    {
        var user = Context.User?.Identity?.Name ?? "Anonymous"; // Cần Auth SignalR
        
        var chatMsg = new ChatMessage
        {
            User = user,
            Content = message,
            Timestamp = DateTime.UtcNow
        };

        // Lưu vào history
        _roomMessages.AddOrUpdate(roomId, 
            new List<ChatMessage> { chatMsg }, 
            (key, list) => { list.Add(chatMsg); return list; });

        await Clients.Group(roomId).SendAsync("ReceiveMessage", chatMsg);
    }

    public async Task GetRooms()
    {
        // Trả về danh sách phòng (ẩn access code)
        var safeRooms = _rooms.Values.Select(r => new { 
            r.Id, r.Name, r.Description, r.IsPrivate, r.CreatedAt 
        });
        await Clients.Caller.SendAsync("LoadRooms", safeRooms);
    }
}

public class RoomInfo
{
    public string Id { get; set; }
    public string Name { get; set; }
    public string AccessCode { get; set; } // Server giữ bí mật
    public string Description { get; set; }
    public bool IsPrivate { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class ChatMessage
{
    public string User { get; set; }
    public string Content { get; set; }
    public DateTime Timestamp { get; set; }
}
