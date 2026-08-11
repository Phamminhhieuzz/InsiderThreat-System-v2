using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using MongoDB.Bson;
using MongoDB.Driver;
using MongoDB.Driver.GridFS;
using InsiderThreat.Server.Models;
using InsiderThreat.Shared;
using System.Security.Claims;
using MongoDB.Bson.Serialization.Attributes;
using InsiderThreat.Server.Services;

namespace InsiderThreat.Server.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class GroupsController : ControllerBase
    {
        private readonly IMongoCollection<Group> _groups;
        private readonly IMongoCollection<InsiderThreat.Shared.User> _users;
        private readonly IMongoCollection<ProjectTask> _tasks;
        private readonly IMongoCollection<TaskComment> _taskComments;
        private readonly IMongoCollection<SharedDocument> _documents;
        private readonly IMongoCollection<InsiderThreat.Shared.Notification> _notifications;
        private readonly IHubContext<InsiderThreat.Server.Hubs.NotificationHub> _hubContext;
        private readonly IGridFSBucket _gridFS;
        private readonly ILogger<GroupsController> _logger;
        private readonly IMongoDatabase _database;
        private readonly IMongoCollection<ProjectActivity> _activities;
        private readonly FileEncryptionService _encryptionService;

        public GroupsController(IMongoDatabase database, IGridFSBucket gridFS, ILogger<GroupsController> logger, IHubContext<InsiderThreat.Server.Hubs.NotificationHub> hubContext, FileEncryptionService encryptionService)
        {
            _database = database;
            _groups = database.GetCollection<Group>("Groups");
            _users = database.GetCollection<InsiderThreat.Shared.User>("Users");
            _tasks = database.GetCollection<ProjectTask>("ProjectTasks");
            _taskComments = database.GetCollection<TaskComment>("TaskComments");
            _documents = database.GetCollection<SharedDocument>("SharedDocuments");
            _notifications = database.GetCollection<InsiderThreat.Shared.Notification>("Notifications");
            _gridFS = gridFS;
            _logger = logger;
            _hubContext = hubContext;
            _activities = database.GetCollection<ProjectActivity>("ProjectActivities");
            _encryptionService = encryptionService;
        }

        private async Task CreateAndPushNotification(string targetUserId, string message, string type, string? relatedId = null, string? link = null)
        {
            var actorUserId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var actorName = User.FindFirst(ClaimTypes.Name)?.Value ?? "Ai đó";

            var notification = new InsiderThreat.Shared.Notification
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
            await _hubContext.Clients.Group($"user_{targetUserId}").SendAsync("NewNotification", notification);
        }

        private async Task LogActivity(string groupId, string type, string action, string targetName)
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userId)) return;

            var activity = new ProjectActivity
            {
                GroupId = groupId,
                UserId = userId,
                Type = type,
                Action = action,
                TargetName = targetName,
                CreatedAt = DateTime.UtcNow
            };

            await _activities.InsertOneAsync(activity);
        }

        [HttpGet("{id}/activities")]
        public async Task<IActionResult> GetActivities(string id)
        {
            var users = await _users.Find(_ => true).Project(u => new { u.Id, u.FullName, u.AvatarUrl }).ToListAsync();
            var activities = await _activities.Find(a => a.GroupId == id)
                .SortByDescending(a => a.CreatedAt)
                .Limit(50)
                .ToListAsync();

            var result = activities.Select(a => {
                var u = users.FirstOrDefault(user => user.Id == a.UserId);
                return new {
                    a.Id,
                    a.Type,
                    a.Action,
                    a.TargetName,
                    a.CreatedAt,
                    User = u
                };
            });

            return Ok(result);
        }

        // GET: api/Groups
        [HttpGet]
        public async Task<IActionResult> GetGroups([FromQuery] bool? isProject)
        {
            try
            {
                var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                
                var filterBuilder = Builders<Group>.Filter;
                var isMember = filterBuilder.Or(
                    filterBuilder.Where(g => g.MemberIds.Contains(userId!)),
                    filterBuilder.Where(g => g.AdminIds.Contains(userId!))
                );
                var isPublicGroup = filterBuilder.And(
                    filterBuilder.Where(g => g.Privacy.ToLower() == "public"),
                    filterBuilder.Eq(g => g.IsProject, false)
                );
                
                var filter = filterBuilder.Or(isMember, isPublicGroup);

                if (isProject.HasValue)
                {
                    filter = filterBuilder.And(filter, filterBuilder.Eq(g => g.IsProject, isProject.Value));
                }

                var groups = await _groups
                    .Find(filter)
                    .SortBy(g => g.Name)
                    .ToListAsync();

                return Ok(groups);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error fetching groups", error = ex.Message });
            }
        }

        // GET: api/Groups/{id}
        [HttpGet("{id}")]
        public async Task<IActionResult> GetGroupById(string id)
        {
            try
            {
                var group = await _groups.Find(g => g.Id == id).FirstOrDefaultAsync();
                if (group == null) return NotFound();
                return Ok(group);
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        // POST: api/Groups
        [HttpPost]
        public async Task<IActionResult> CreateGroup([FromBody] CreateGroupRequest request)
        {
            try
            {
                var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userId)) return Unauthorized();

                var memberIds = request.MemberIds ?? new List<string>();
                if (!memberIds.Contains(userId!))
                {
                    memberIds.Add(userId!);
                }

                var group = new Group
                {
                    Name = request.Name,
                    Description = request.Description,
                    Type = request.Type ?? "Project",
                    Privacy = request.Privacy ?? "Public",
                    AdminIds = new List<string> { userId! },
                    MemberIds = memberIds,
                    IsProject = request.IsProject,
                    Status = request.Status ?? "New",
                    ProjectStartDate = request.ProjectStartDate,
                    ProjectEndDate = request.ProjectEndDate,
                    CreatedAt = DateTime.UtcNow
                };

                await _groups.InsertOneAsync(group);
                return CreatedAtAction(nameof(GetGroupById), new { id = group.Id }, group);
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        [HttpPatch("{id}")]
        public async Task<IActionResult> UpdateGroup(string id, [FromBody] UpdateGroupRequest request)
        {
            var updateBuilder = Builders<Group>.Update;
            var updates = new List<UpdateDefinition<Group>>();

            if (request.Name != null) updates.Add(updateBuilder.Set(g => g.Name, request.Name));
            if (request.Description != null) updates.Add(updateBuilder.Set(g => g.Description, request.Description));
            if (request.ProjectStartDate.HasValue) updates.Add(updateBuilder.Set(g => g.ProjectStartDate, request.ProjectStartDate));
            // if we want to support clearing dates, we'd need a different approach, but this is safe for patches
            if (request.ProjectEndDate.HasValue) updates.Add(updateBuilder.Set(g => g.ProjectEndDate, request.ProjectEndDate));
            if (request.Milestones != null) updates.Add(updateBuilder.Set(g => g.Milestones, request.Milestones));
            if (request.IsPriority.HasValue) updates.Add(updateBuilder.Set(g => g.IsPriority, request.IsPriority.Value));
            if (!string.IsNullOrEmpty(request.Status)) updates.Add(updateBuilder.Set(g => g.Status, request.Status));
            if (!string.IsNullOrEmpty(request.Privacy)) updates.Add(updateBuilder.Set(g => g.Privacy, request.Privacy));

            updates.Add(updateBuilder.Set(g => g.UpdatedAt, DateTime.UtcNow));

            var update = updateBuilder.Combine(updates);
            await _groups.UpdateOneAsync(g => g.Id == id, update);

            return Ok(new { message = "Cập nhật thành công" });
        }

        // GET: api/Groups/{id}/members-details
        [HttpGet("{id}/members-details")]
        public async Task<IActionResult> GetGroupMembers(string id)
        {
            var group = await _groups.Find(g => g.Id == id).FirstOrDefaultAsync();
            if (group == null) return NotFound();

            var users = await _users.Find(u => group.MemberIds.Contains(u.Id!)).ToListAsync();
            return Ok(users.Select(u => new { u.Id, u.Username, u.FullName, u.AvatarUrl, IsAdmin = group.AdminIds.Contains(u.Id!) }));
        }

        // ─── TASK MANAGEMENT ──────────────────────────

        [HttpGet("my-tasks")]
        public async Task<IActionResult> GetMyTasks()
        {
            try
            {
                var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userId)) return Unauthorized();

                // Get all groups the user is a member of
                var filterBuilder = Builders<Group>.Filter;
                var groupFilter = filterBuilder.Where(g => g.MemberIds.Contains(userId));
                var userGroups = await _groups.Find(groupFilter).ToListAsync();
                var groupIds = userGroups.Select(g => g.Id).ToList();

                // Fetch tasks assigned to the user in those groups
                var taskFilter = Builders<ProjectTask>.Filter.And(
                    Builders<ProjectTask>.Filter.Eq(t => t.AssignedTo, userId),
                    Builders<ProjectTask>.Filter.In(t => t.GroupId, groupIds)
                );

                var tasks = await _tasks.Find(taskFilter).SortByDescending(t => t.CreatedAt).ToListAsync();

                var statusStats = tasks.GroupBy(t => t.Status)
                    .Select(g => new { status = g.Key, count = g.Count() });

                var now = DateTime.UtcNow;
                var overdueCount = tasks.Count(t => t.Status != "Done" && t.Deadline.HasValue && t.Deadline.Value < now);
                var onTimeCount = tasks.Count(t => t.Status == "Done" && (!t.Deadline.HasValue || t.CompletedAt <= t.Deadline));

                // Map tasks with group names
                var enrichedTasks = tasks.Select(t => new {
                    t.Id,
                    t.GroupId,
                    GroupName = userGroups.FirstOrDefault(g => g.Id == t.GroupId)?.Name,
                    t.Title,
                    t.Description,
                    t.Status,
                    t.Priority,
                    t.Progress,
                    t.StartDate,
                    t.Deadline,
                    t.CompletedAt
                });

                return Ok(new
                {
                    TotalTasks = tasks.Count,
                    StatusStats = statusStats,
                    OverdueCount = overdueCount,
                    OnTimeCount = onTimeCount,
                    Tasks = enrichedTasks,
                    UserGroups = userGroups.Select(g => new { 
                        g.Id, 
                        g.Name, 
                        g.ProjectStartDate, 
                        g.ProjectEndDate, 
                        g.Milestones, 
                        g.IsProject, 
                        g.Status 
                    })
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching my-tasks");
                return StatusCode(500, new { message = "Lỗi hệ thống", error = ex.Message });
            }
        }

        [HttpGet("{id}/tasks")]
        public async Task<IActionResult> GetTasks(string id)
        {
            var tasks = await _tasks.Find(t => t.GroupId == id).SortByDescending(t => t.CreatedAt).ToListAsync();
            return Ok(tasks);
        }

        [HttpPost("{id}/tasks")]
        public async Task<IActionResult> CreateTask(string id, [FromBody] CreateTaskRequest taskReq)
        {
            try
            {
                var group = await _groups.Find(g => g.Id == id).FirstOrDefaultAsync();
                if (group == null) return NotFound(new { message = "Không tìm thấy dự án" });

                var currentUserId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                // Nếu là dự án, chỉ những người trong AdminIds mới được phép giao task
                if (group.IsProject && currentUserId != null && !group.AdminIds.Contains(currentUserId))
                {
                    return StatusCode(403, new { message = "Chỉ trưởng dự án mới có quyền giao task cho thành viên." });
                }

                var task = new ProjectTask
                {
                    GroupId = id,
                    Title = taskReq.Title ?? "Untitled Task",
                    Description = taskReq.Description ?? "",
                    Status = taskReq.Status ?? "Todo",
                    Priority = taskReq.Priority ?? "Normal",
                    AssignedTo = taskReq.AssignedTo,
                    CreatedAt = DateTime.UtcNow
                };

                // Parse dates if provided
                if (taskReq.StartDate.HasValue)
                {
                    task.StartDate = taskReq.StartDate.Value;
                }
                
                if (taskReq.Deadline.HasValue)
                {
                    task.Deadline = taskReq.Deadline.Value;
                }

                await _tasks.InsertOneAsync(task);
                await LogActivity(id, "task", "created task", task.Title);

                // Broadcast real-time update to all project members
                await _hubContext.Clients.Group($"project_{id}").SendAsync("ProjectDataChanged", new { groupId = id, action = "task_created", taskId = task.Id });

                // Notify assignee
                if (!string.IsNullOrEmpty(task.AssignedTo))
                {
                    await CreateAndPushNotification(
                        task.AssignedTo,
                        $"Bạn đã được giao nhiệm vụ mới: {task.Title} trong nhóm {group?.Name}",
                        "TaskAssignment",
                        task.Id,
                        $"/groups/{id}?tab=mytask"
                    );
                }

                return Ok(task);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating task for group {GroupId}", id);
                return StatusCode(500, new { message = "Lỗi hệ thống khi tạo nhiệm vụ", error = ex.Message });
            }
        }

        [HttpPatch("{id}/tasks/{taskId}")]
        public async Task<IActionResult> UpdateTask(string id, string taskId, [FromBody] ProjectTask taskUpdate)
        {
            try
            {
                var currentUserId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                var group = await _groups.Find(g => g.Id == id).FirstOrDefaultAsync();
                if (group == null) return NotFound("Group not found");

                var task = await _tasks.Find(t => t.Id == taskId && t.GroupId == id).FirstOrDefaultAsync();
                if (task == null) return NotFound("Task not found");

                bool isAdmin = currentUserId != null && group.AdminIds.Contains(currentUserId);
                
                // Quy trình Phê duyệt
                if (taskUpdate.Status == "Done" && !isAdmin)
                {
                    taskUpdate.Status = "WaitingApproval";
                }

                var filter = Builders<ProjectTask>.Filter.Eq(t => t.Id, taskId);

                var update = Builders<ProjectTask>.Update
                    .Set(t => t.Title, taskUpdate.Title)
                    .Set(t => t.Description, taskUpdate.Description)
                    .Set(t => t.Status, taskUpdate.Status)
                    .Set(t => t.Priority, taskUpdate.Priority)
                    .Set(t => t.AssignedTo, taskUpdate.AssignedTo)
                    .Set(t => t.Progress, taskUpdate.Progress)
                    .Set(t => t.StartDate, taskUpdate.StartDate)
                    .Set(t => t.Deadline, taskUpdate.Deadline);

                if (taskUpdate.Status == "Done")
                {
                    update = update.Set(t => t.CompletedAt, DateTime.UtcNow)
                                   .Set(t => t.CompletedBy, currentUserId);
                }

                await _tasks.UpdateOneAsync(filter, update);
                await LogActivity(id, "status", $"updated status of '{task.Title}' to", taskUpdate.Status);

                // Broadcast real-time update to all project members
                await _hubContext.Clients.Group($"project_{id}").SendAsync("ProjectDataChanged", new { groupId = id, action = "task_updated", taskId });

                // Notifications for Assignee
                if (!string.IsNullOrEmpty(taskUpdate.AssignedTo))
                {
                    if (currentUserId != taskUpdate.AssignedTo || taskUpdate.Status == "Done" || taskUpdate.Status == "WaitingApproval")
                    {
                        string msg = taskUpdate.Status == "Done" 
                            ? $"Nhiệm vụ '{taskUpdate.Title}' đã được phê duyệt hoàn thành!" 
                            : taskUpdate.Status == "WaitingApproval"
                                ? $"Nhiệm vụ '{taskUpdate.Title}' đang chờ phê duyệt."
                                : $"Nhiệm vụ '{taskUpdate.Title}' của bạn có cập nhật mới.";
                        
                        await CreateAndPushNotification(
                            taskUpdate.AssignedTo,
                            msg,
                            "TaskStatusChange",
                            taskId,
                            $"/groups/{id}?tab=mytask"
                        );
                    }
                }

                // Notify Admins for Approval Request
                if (taskUpdate.Status == "WaitingApproval") 
                {
                    var uActor = await _users.Find(x => x.Id == currentUserId).FirstOrDefaultAsync();
                    foreach (var aId in group.AdminIds) 
                    {
                        if (aId != currentUserId) 
                        {
                            await CreateAndPushNotification(
                                aId,
                                $"Thành viên {uActor?.FullName} yêu cầu phê duyệt nhiệm vụ: {taskUpdate.Title}",
                                "TaskApprovalRequest",
                                taskId,
                                $"/groups/{id}?tab=mytask"
                            );
                        }
                    }
                }

                return Ok(new { message = "Task updated successfully", status = taskUpdate.Status });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating task {TaskId}", taskId);
                return StatusCode(500, "Internal server error");
            }
        }

        [HttpDelete("{id}/tasks/{taskId}")]
        public async Task<IActionResult> DeleteTask(string id, string taskId)
        {
            try
            {
                var filter = Builders<ProjectTask>.Filter.And(
                    Builders<ProjectTask>.Filter.Eq(t => t.Id, taskId),
                    Builders<ProjectTask>.Filter.Eq(t => t.GroupId, id)
                );

                var result = await _tasks.DeleteOneAsync(filter);
                if (result.DeletedCount == 0) return NotFound();

                // Broadcast real-time update to all project members
                await _hubContext.Clients.Group($"project_{id}").SendAsync("ProjectDataChanged", new { groupId = id, action = "task_deleted", taskId });

                return Ok(new { message = "Task deleted successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting task {TaskId}", taskId);
                return StatusCode(500, "Internal server error");
            }
        }

        [HttpGet("{id}/tasks/{taskId}/comments")]
        public async Task<IActionResult> GetTaskComments(string id, string taskId)
        {
            var comments = await _taskComments.Find(c => c.TaskId == taskId).SortByDescending(c => c.CreatedAt).ToListAsync();
            // Fetch user info for each comment
            var userIds = comments.Select(c => c.UserId).Distinct().ToList();
            var users = await _users.Find(u => userIds.Contains(u.Id!)).ToListAsync();

            var result = comments.Select(c => {
                var u = users.FirstOrDefault(user => user.Id == c.UserId);
                return new {
                    c.Id,
                    c.TaskId,
                    c.Content,
                    c.AttachmentUrl,
                    c.AttachmentName,
                    c.AttachmentSize,
                    c.ParentId,
                    c.CreatedAt,
                    User = new {
                        Id = u?.Id,
                        FullName = u?.FullName,
                        AvatarUrl = u?.AvatarUrl
                    }
                };
            }).OrderBy(c => c.CreatedAt);

            return Ok(result);
        }

        [HttpPost("{id}/tasks/{taskId}/comments")]
        public async Task<IActionResult> AddTaskComment(string id, string taskId, [FromBody] CreateTaskCommentReq req)
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var comment = new TaskComment
            {
                TaskId = taskId,
                UserId = userId,
                Content = req.Content,
                AttachmentUrl = req.AttachmentUrl,
                AttachmentName = req.AttachmentName,
                AttachmentSize = req.AttachmentSize,
                ParentId = req.ParentId
            };
            await _taskComments.InsertOneAsync(comment);

            // Fetch task first to use its title in log/notification
            var task = await _tasks.Find(t => t.Id == taskId).FirstOrDefaultAsync();
            await LogActivity(id, "comment", "commented on task:", task?.Title ?? taskId);

            if (task != null && !string.IsNullOrEmpty(task.AssignedTo) && task.AssignedTo != userId)
            {
                var uActor = await _users.Find(x => x.Id == userId).FirstOrDefaultAsync();
                await CreateAndPushNotification(
                    task.AssignedTo,
                    $"{uActor?.FullName} đã bình luận trong nhiệm vụ: {task.Title}",
                    "TaskComment",
                    task.Id,
                    $"/groups/{id}?tab=mytask"
                );
            }

            var u = await _users.Find(x => x.Id == userId).FirstOrDefaultAsync();
            return Ok(new {
                comment.Id,
                comment.TaskId,
                comment.Content,
                comment.AttachmentUrl,
                comment.AttachmentName,
                comment.AttachmentSize,
                comment.CreatedAt,
                User = new {
                    Id = u?.Id,
                    FullName = u?.FullName,
                    AvatarUrl = u?.AvatarUrl
                }
            });
        }

        [HttpPost("{id}/tasks/{taskId}/comments/upload")]
        public async Task<IActionResult> UploadCommentAttachment(string id, string taskId, IFormFile file)
        {
            if (file == null || file.Length == 0) return BadRequest("File is empty");

            try
            {
                var fileId = await _gridFS.UploadFromStreamAsync(file.FileName, file.OpenReadStream());
                var fileUrl = $"/api/DocumentLibrary/download/{fileId}";

                return Ok(new
                {
                    url = fileUrl,
                    name = file.FileName,
                    size = file.Length,
                    fileId = fileId.ToString()
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error uploading comment attachment");
                return StatusCode(500, "Internal server error during upload");
            }
        }

        [HttpGet("{id}/productivity")]
        public async Task<IActionResult> GetProductivityStats(string id)
        {
            var tasks = await _tasks.Find(t => t.GroupId == id).ToListAsync();
            
            if (!tasks.Any()) return Ok(new { total = 0 });

            var statusStats = tasks.GroupBy(t => t.Status)
                .Select(g => new { status = g.Key, count = g.Count() });

            var priorityStats = tasks.GroupBy(t => t.Priority)
                .Select(g => new { priority = g.Key, count = g.Count() });

            var now = DateTime.UtcNow;
            var overdueCount = tasks.Count(t => t.Status != "Done" && t.Deadline.HasValue && t.Deadline.Value < now);
            var onTimeCount = tasks.Count(t => t.Status == "Done" && (!t.Deadline.HasValue || t.CompletedAt <= t.Deadline));

            // Top performers (Done tasks)
            var userIds = tasks.Where(t => t.Status == "Done" && t.CompletedBy != null).Select(t => t.CompletedBy).Distinct().ToList();
            var usersList = await _users.Find(u => userIds.Contains(u.Id!)).ToListAsync();
            var userDict = usersList.ToDictionary(u => u.Id!, u => u.FullName);

            var topPerformers = tasks.Where(t => t.Status == "Done" && t.CompletedBy != null)
                .GroupBy(t => t.CompletedBy)
                .Select(g => new { 
                    name = userDict.ContainsKey(g.Key!) ? userDict[g.Key!] : "Unknown", 
                    count = g.Count() 
                })
                .OrderByDescending(x => x.count)
                .Take(5)
                .ToList();

            return Ok(new
            {
                TotalTasks = tasks.Count,
                StatusStats = statusStats,
                PriorityStats = priorityStats,
                OverdueCount = overdueCount,
                OnTimeCount = onTimeCount,
                TopPerformers = topPerformers
            });
        }

        [HttpGet("{id}/analytics")]
        public async Task<IActionResult> GetDailyAnalytics(string id)
        {
            // Fetch all tasks for the group that are completed
            var completedTasks = await _tasks.Find(t => t.GroupId == id && t.Status == "Done" && t.CompletedAt != null && t.CompletedBy != null).ToListAsync();

            // Group by Date (UTC Midnight)
            var grouping = completedTasks
                .GroupBy(t => t.CompletedAt!.Value.Date)
                .OrderBy(g => g.Key)
                .TakeLast(7) // Lấy 7 ngày gần nhất
                .ToList();

            var userIds = completedTasks.Select(t => t.CompletedBy).Distinct().ToList();
            var usersList = await _users.Find(u => userIds.Contains(u.Id!)).ToListAsync();
            var userDict = usersList.ToDictionary(u => u.Id!, u => u);

            var result = grouping.Select(g => {
                var completedBy = g.GroupBy(t => t.CompletedBy)
                                   .Select(userGroup => {
                                       var uInfo = userDict.ContainsKey(userGroup.Key!) ? userDict[userGroup.Key!] : null;
                                       return new {
                                            id = userGroup.Key,
                                            name = uInfo?.FullName ?? "Unknown",
                                            avatar = uInfo?.AvatarUrl ?? $"https://ui-avatars.com/api/?name={uInfo?.FullName ?? "U"}",
                                            tasks = userGroup.Count()
                                       };
                                   }).ToList();

                return new {
                    date = g.Key.ToString("dd/MM"),
                    totalTasks = g.Count(),
                    completedBy = completedBy
                };
            });

            return Ok(result);
        }

        // ─── FILE MANAGEMENT ──────────────────────────

        [HttpGet("{id}/files")]
        public async Task<IActionResult> GetFiles(string id)
        {
            var filesCollection = _database.GetCollection<ProjectFileRecord>("ProjectFiles");
            var files = await filesCollection.Find(f => f.GroupId == id).SortByDescending(f => f.UploadedAt).ToListAsync();
            return Ok(files);
        }

        [HttpPost("{id}/files")]
        public async Task<IActionResult> AddFile(string id, [FromForm] IFormFile file)
        {
            if (file == null || file.Length == 0) return BadRequest("File is empty");

            try
            {
                var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                var currentUser = await _users.Find(u => u.Id == userId).FirstOrDefaultAsync();
                var uploaderName = currentUser?.FullName ?? User.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown User";

                // 1. Encrypt and Upload to GridFS
                using var sourceStream = file.OpenReadStream();
                using var encryptedStream = new MemoryStream();
                
                await _encryptionService.EncryptStreamAsync(sourceStream, encryptedStream);
                encryptedStream.Position = 0;

                var options = new GridFSUploadOptions
                {
                    Metadata = new BsonDocument
                    {
                        { "originalName", file.FileName },
                        { "contentType", file.ContentType },
                        { "uploadedAt", DateTime.UtcNow },
                        { "isEncrypted", true },
                        { "uploaderId", userId }
                    }
                };

                var fileId = await _gridFS.UploadFromStreamAsync(file.FileName, encryptedStream, options);

                // 2. Save metadata record
                var fileRecord = new ProjectFileRecord
                {
                    GroupId = id,
                    FileId = fileId.ToString(),
                    FileName = file.FileName,
                    ContentType = file.ContentType,
                    Size = file.Length,
                    UploadedAt = DateTime.UtcNow,
                    UploaderId = userId ?? "",
                    UploaderName = uploaderName
                };

                var filesCollection = _database.GetCollection<ProjectFileRecord>("ProjectFiles");
                await filesCollection.InsertOneAsync(fileRecord);
                
                await LogActivity(id, "file", "uploaded file (secured):", file.FileName);

                return Ok(fileRecord);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error uploading project file to group {GroupId}", id);
                return StatusCode(500, new { message = "Lỗi hệ thống khi tải tệp lên", error = ex.Message });
            }
        }

        [HttpPost("{id}/members")]
        public async Task<IActionResult> AddMember(string id, [FromBody] AddMemberRequest request)
        {
            var update = Builders<Group>.Update.AddToSet(g => g.MemberIds, request.UserId);
            await _groups.UpdateOneAsync(g => g.Id == id, update);
            var u = await _users.Find(x => x.Id == request.UserId).FirstOrDefaultAsync();
            await LogActivity(id, "member", "added member:", u?.FullName ?? request.UserId);
            return Ok(new { message = "Added" });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteGroup(string id)
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var group = await _groups.Find(g => g.Id == id).FirstOrDefaultAsync();
            if (group == null) return NotFound();

            // Permission check: Only admins of the group can delete it
            if (!group.AdminIds.Contains(userId))
            {
                return Forbid();
            }

            try
            {
                await _groups.DeleteOneAsync(g => g.Id == id);
                
                // Cleanup: Delete related tasks
                await _tasks.DeleteManyAsync(t => t.GroupId == id);
                
                return Ok(new { message = "Xóa nhóm thành công" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }
    }

    // ─── DTOs ────────────────────────────────────────────────────────────────

    public class CreateTaskRequest
    {
        public string? Title { get; set; }
        public string? Description { get; set; }
        public string? AssignedTo { get; set; }
        public string? Status { get; set; }
        public string? Priority { get; set; }
        public DateTime? StartDate { get; set; }
        public DateTime? Deadline { get; set; }
    }

    public class CreateTaskCommentReq
    {
        public string Content { get; set; } = string.Empty;
        public string? AttachmentUrl { get; set; }
        public string? AttachmentName { get; set; }
        public long? AttachmentSize { get; set; }
        public string? ParentId { get; set; }
    }

    public class CreateGroupRequest
    {
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string? Type { get; set; }
        public string? Privacy { get; set; }
        public List<string>? MemberIds { get; set; }
        public bool IsProject { get; set; }
        public string? Status { get; set; }
        public DateTime? ProjectStartDate { get; set; }
        public DateTime? ProjectEndDate { get; set; }
        public List<ProjectMilestone>? Milestones { get; set; }
    }

    public class UpdateGroupRequest
    {
        public string? Name { get; set; }
        public string? Description { get; set; }
        public string? Status { get; set; }
        public string? Privacy { get; set; }
        public DateTime? ProjectStartDate { get; set; }
        public DateTime? ProjectEndDate { get; set; }
        public List<ProjectMilestone>? Milestones { get; set; }
        public bool? IsPriority { get; set; }
    }

    public class AddMemberRequest
    {
        public string UserId { get; set; } = string.Empty;
    }

    public class ProjectFileRecord
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string? Id { get; set; }
        [BsonRepresentation(BsonType.ObjectId)]
        public string GroupId { get; set; } = string.Empty;
        public string FileId { get; set; } = string.Empty;
        public string FileName { get; set; } = string.Empty;
        public string ContentType { get; set; } = string.Empty;
        public long Size { get; set; }
        public string UploaderId { get; set; } = string.Empty;
        public string UploaderName { get; set; } = string.Empty;
        public DateTime UploadedAt { get; set; }
    }
}
