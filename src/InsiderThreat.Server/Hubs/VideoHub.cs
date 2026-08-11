using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;
using System.Security.Claims;

namespace InsiderThreat.Server.Hubs;

[Authorize]
public class VideoHub : Hub
{
    private static readonly ConcurrentDictionary<string, VideoRoom> _rooms = new();
    private static readonly ConcurrentDictionary<string, string> _connectionToRoom = new(); // connectionId -> roomCode

    public async Task<string> CreateRoom(bool requireApproval = false)
    {
        var userId = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "";
        var displayName = Context.User?.FindFirst("FullName")?.Value ?? Context.User?.Identity?.Name ?? "Guest";

        string roomCode = GenerateRoomCode();
        
        var room = new VideoRoom
        {
            RoomCode = roomCode,
            CreatedAt = DateTime.UtcNow,
            HostConnectionId = Context.ConnectionId,
            HostUserId = userId,
            RequireApproval = requireApproval
        };

        if (!_rooms.TryAdd(roomCode, room))
        {
            roomCode = GenerateRoomCode();
            room.RoomCode = roomCode;
            _rooms.TryAdd(roomCode, room);
        }

        var participant = new VideoParticipant
        {
            ConnectionId = Context.ConnectionId,
            UserId = userId,
            DisplayName = displayName
        };

        room.Participants.TryAdd(Context.ConnectionId, participant);
        _connectionToRoom.TryAdd(Context.ConnectionId, roomCode);
        await Groups.AddToGroupAsync(Context.ConnectionId, roomCode);

        return roomCode;
    }

    // Yêu cầu vào phòng (vào phòng chờ, đợi host duyệt)
    public async Task RequestJoinRoom(string roomCode)
    {
        roomCode = roomCode.Trim().ToUpper();

        if (!_rooms.TryGetValue(roomCode, out var room))
            throw new HubException("Phòng không tồn tại!");

        if (room.Participants.Count >= 20)
            throw new HubException("Phòng đã đầy (tối đa 20 người)!");

        var userId = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "";
        var displayName = Context.User?.FindFirst("FullName")?.Value ?? Context.User?.Identity?.Name ?? "Guest";

        var participant = new VideoParticipant
        {
            ConnectionId = Context.ConnectionId,
            UserId = userId,
            DisplayName = displayName
        };

        // Nếu là host (reconnect hoặc refresh), cập nhật connection ID và cho vào thẳng
        if (room.HostUserId == userId)
        {
            room.HostConnectionId = Context.ConnectionId;
            room.Participants.TryAdd(Context.ConnectionId, participant);
            _connectionToRoom.TryAdd(Context.ConnectionId, roomCode);
            await Groups.AddToGroupAsync(Context.ConnectionId, roomCode);
            
            // Gửi danh sách thành viên hiện tại cho host
            await Clients.Caller.SendAsync("JoinApproved", room.Participants.Values.Where(p => p.ConnectionId != Context.ConnectionId).ToList());
            
            // Gửi danh sách đang chờ cho host
            foreach (var waiting in room.WaitingParticipants.Values)
            {
                await Clients.Caller.SendAsync("ParticipantWaiting", waiting);
            }
            return;
        }

        // Nếu đã ở trong phòng rồi
        if (room.Participants.ContainsKey(Context.ConnectionId))
        {
            await Clients.Caller.SendAsync("JoinApproved", room.Participants.Values.Where(p => p.ConnectionId != Context.ConnectionId).ToList());
            return;
        }

        // Nếu phòng không yêu cầu duyệt, cho vào thẳng
        if (!room.RequireApproval)
        {
            var existingParticipants = room.Participants.Values.ToList();
            room.Participants.TryAdd(Context.ConnectionId, participant);
            _connectionToRoom.TryAdd(Context.ConnectionId, roomCode);
            await Groups.AddToGroupAsync(Context.ConnectionId, roomCode);
            await Clients.OthersInGroup(roomCode).SendAsync("UserJoined", participant);
            await Clients.Caller.SendAsync("JoinApproved", existingParticipants);
            return;
        }

        // Thêm vào hàng chờ
        room.WaitingParticipants.TryAdd(Context.ConnectionId, participant);

        // Thông báo cho host (dùng HostConnectionId mới nhất)
        await Clients.Client(room.HostConnectionId).SendAsync("ParticipantWaiting", participant);

        // Thông báo cho người yêu cầu rằng đang chờ duyệt
        await Clients.Caller.SendAsync("WaitingForApproval");
    }

    // Host duyệt cho vào
    public async Task ApproveParticipant(string waitingConnectionId)
    {
        if (!_connectionToRoom.TryGetValue(Context.ConnectionId, out var roomCode)) return;
        if (!_rooms.TryGetValue(roomCode, out var room)) return;
        if (room.HostConnectionId != Context.ConnectionId)
            throw new HubException("Chỉ chủ phòng mới có quyền duyệt.");

        if (!room.WaitingParticipants.TryRemove(waitingConnectionId, out var participant)) return;

        var existingParticipants = room.Participants.Values.ToList();

        room.Participants.TryAdd(waitingConnectionId, participant);
        _connectionToRoom.TryAdd(waitingConnectionId, roomCode);
        await Groups.AddToGroupAsync(waitingConnectionId, roomCode);

        // Thông báo người được duyệt (gửi danh sách thành viên hiện tại)
        await Clients.Client(waitingConnectionId).SendAsync("JoinApproved", existingParticipants);

        // Thông báo những người khác trong phòng
        await Clients.OthersInGroup(roomCode).SendAsync("UserJoined", participant);
    }

    // Host từ chối
    public async Task RejectParticipant(string waitingConnectionId)
    {
        if (!_connectionToRoom.TryGetValue(Context.ConnectionId, out var roomCode)) return;
        if (!_rooms.TryGetValue(roomCode, out var room)) return;
        if (room.HostConnectionId != Context.ConnectionId)
            throw new HubException("Chỉ chủ phòng mới có quyền từ chối.");

        room.WaitingParticipants.TryRemove(waitingConnectionId, out _);
        await Clients.Client(waitingConnectionId).SendAsync("JoinRejected");
    }

    public async Task LeaveRoom()
    {
        await RemoveFromRoom(Context.ConnectionId);
    }

    public async Task SendOffer(string targetConnectionId, string sdp)
    {
        var displayName = Context.User?.FindFirst("FullName")?.Value ?? Context.User?.Identity?.Name ?? "Guest";
        await Clients.Client(targetConnectionId).SendAsync("ReceiveOffer", Context.ConnectionId, sdp, displayName);
    }

    public async Task SendAnswer(string targetConnectionId, string sdp)
    {
        await Clients.Client(targetConnectionId).SendAsync("ReceiveAnswer", Context.ConnectionId, sdp);
    }

    public async Task SendIceCandidate(string targetConnectionId, string candidate)
    {
        await Clients.Client(targetConnectionId).SendAsync("ReceiveIceCandidate", Context.ConnectionId, candidate);
    }

    // ===== TRANSCRIPT =====
    public async Task SendTranscript(string text, string displayName, string timestamp)
    {
        if (_connectionToRoom.TryGetValue(Context.ConnectionId, out var roomCode))
            await Clients.Group(roomCode).SendAsync("ReceiveTranscript", Context.ConnectionId, displayName, text, timestamp);
    }

    public async Task StartTranscript()
    {
        if (!_connectionToRoom.TryGetValue(Context.ConnectionId, out var roomCode)) return;
        if (!_rooms.TryGetValue(roomCode, out var room)) return;
        if (room.HostConnectionId != Context.ConnectionId)
            throw new HubException("Chỉ chủ phòng mới có quyền bắt đầu ghi âm.");

        room.IsTranscriptActive = true;
        await Clients.Group(roomCode).SendAsync("TranscriptStarted", Context.ConnectionId);
    }

    public async Task StopTranscript()
    {
        if (!_connectionToRoom.TryGetValue(Context.ConnectionId, out var roomCode)) return;
        if (!_rooms.TryGetValue(roomCode, out var room)) return;
        if (room.HostConnectionId != Context.ConnectionId)
            throw new HubException("Chỉ chủ phòng mới có quyền dừng ghi âm.");

        room.IsTranscriptActive = false;
        await Clients.Group(roomCode).SendAsync("TranscriptStopped");
    }

    // ===== CHAT =====
    public async Task SendChatMessage(string text)
    {
        if (!_connectionToRoom.TryGetValue(Context.ConnectionId, out var roomCode)) return;
        if (!_rooms.TryGetValue(roomCode, out var room)) return;
        if (!room.Participants.ContainsKey(Context.ConnectionId)) return;

        var displayName = Context.User?.FindFirst("FullName")?.Value ?? Context.User?.Identity?.Name ?? "Guest";
        var timestamp = DateTime.Now.ToString("HH:mm");
        await Clients.Group(roomCode).SendAsync("ReceiveChatMessage", Context.ConnectionId, displayName, text, timestamp);
    }

    // ===== RAISE HAND =====
    public async Task RaiseHand()
    {
        if (!_connectionToRoom.TryGetValue(Context.ConnectionId, out var roomCode)) return;
        var displayName = Context.User?.FindFirst("FullName")?.Value ?? Context.User?.Identity?.Name ?? "Guest";
        await Clients.Group(roomCode).SendAsync("ParticipantRaisedHand", Context.ConnectionId, displayName);
    }

    public async Task LowerHand()
    {
        if (!_connectionToRoom.TryGetValue(Context.ConnectionId, out var roomCode)) return;
        await Clients.Group(roomCode).SendAsync("ParticipantLoweredHand", Context.ConnectionId);
    }

    // ===== MIC CONTROL (host only) =====
    public async Task MuteParticipant(string targetConnectionId)
    {
        if (!_connectionToRoom.TryGetValue(Context.ConnectionId, out var roomCode)) return;
        if (!_rooms.TryGetValue(roomCode, out var room)) return;
        if (room.HostConnectionId != Context.ConnectionId)
            throw new HubException("Chỉ chủ phòng mới có quyền tắt mic.");

        await Clients.Client(targetConnectionId).SendAsync("ForceMuted");
        await Clients.Group(roomCode).SendAsync("ParticipantMuted", targetConnectionId);
    }

    public async Task MuteAll()
    {
        if (!_connectionToRoom.TryGetValue(Context.ConnectionId, out var roomCode)) return;
        if (!_rooms.TryGetValue(roomCode, out var room)) return;
        if (room.HostConnectionId != Context.ConnectionId)
            throw new HubException("Chỉ chủ phòng mới có quyền tắt mic.");

        await Clients.OthersInGroup(roomCode).SendAsync("ForceMuted");
        await Clients.Group(roomCode).SendAsync("AllMuted");
    }

    public async Task UnmuteAll()
    {
        if (!_connectionToRoom.TryGetValue(Context.ConnectionId, out var roomCode)) return;
        if (!_rooms.TryGetValue(roomCode, out var room)) return;
        if (room.HostConnectionId != Context.ConnectionId)
            throw new HubException("Chỉ chủ phòng mới có quyền bật mic.");

        await Clients.OthersInGroup(roomCode).SendAsync("ForceUnmuted");
        await Clients.Group(roomCode).SendAsync("AllUnmuted");
    }

    // ===== SCREEN SHARING =====
    public async Task SetScreenSharing(bool isSharing)
    {
        if (!_connectionToRoom.TryGetValue(Context.ConnectionId, out var roomCode)) return;
        await Clients.OthersInGroup(roomCode).SendAsync("ParticipantScreenSharingChanged", Context.ConnectionId, isSharing);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        // Remove from waiting list if disconnected while waiting
        foreach (var room in _rooms.Values)
            room.WaitingParticipants.TryRemove(Context.ConnectionId, out _);

        await RemoveFromRoom(Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }

    private async Task RemoveFromRoom(string connectionId)
    {
        if (_connectionToRoom.TryRemove(connectionId, out var roomCode))
        {
            if (_rooms.TryGetValue(roomCode, out var room))
            {
                room.Participants.TryRemove(connectionId, out _);
                await Groups.RemoveFromGroupAsync(connectionId, roomCode);
                await Clients.Group(roomCode).SendAsync("UserLeft", connectionId);

                if (room.Participants.IsEmpty)
                    _rooms.TryRemove(roomCode, out _);
            }
        }
    }

    private static string GenerateRoomCode()
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var random = new Random();
        return new string(Enumerable.Range(0, 6).Select(_ => chars[random.Next(chars.Length)]).ToArray());
    }
}

public class VideoRoom
{
    public string RoomCode { get; set; } = string.Empty;
    public ConcurrentDictionary<string, VideoParticipant> Participants { get; set; } = new();
    public ConcurrentDictionary<string, VideoParticipant> WaitingParticipants { get; set; } = new();
    public DateTime CreatedAt { get; set; }
    public string HostConnectionId { get; set; } = string.Empty;
    public string HostUserId { get; set; } = string.Empty;
    public bool IsTranscriptActive { get; set; } = false;
    public bool RequireApproval { get; set; } = false;
}

public class VideoParticipant
{
    public string ConnectionId { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
}
