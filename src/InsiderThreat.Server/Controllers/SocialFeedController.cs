using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using MongoDB.Driver;
using InsiderThreat.Server.Models;
using InsiderThreat.Server.Hubs;
using System.Security.Claims;

namespace InsiderThreat.Server.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class SocialFeedController : ControllerBase
    {
        private readonly IMongoCollection<Post> _posts;
        private readonly IMongoCollection<Comment> _comments;
        private readonly IMongoCollection<InsiderThreat.Shared.User> _users;
        private readonly IMongoCollection<Report> _reports;
        private readonly IMongoDatabase _database;
        private readonly NotificationsController _notificationsController;
        private readonly IHubContext<NotificationHub> _hubContext;

        public SocialFeedController(IMongoDatabase database, IHubContext<NotificationHub> hubContext)
        {
            _database = database;
            _posts = database.GetCollection<Post>("Posts");
            _comments = database.GetCollection<Comment>("Comments");
            _users = database.GetCollection<InsiderThreat.Shared.User>("Users");
            _reports = database.GetCollection<Report>("Reports");
            _hubContext = hubContext;
            _notificationsController = new NotificationsController(database, hubContext);
        }

        private string? GetUserRole()
        {
            return User.FindFirst(ClaimTypes.Role)?.Value;
        }

        // GET: api/SocialFeed/posts?page=1&limit=10
        [HttpGet("posts")]
        public async Task<IActionResult> GetPosts([FromQuery] int page = 1, [FromQuery] int limit = 10)
        {
            try
            {
                var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                var userRole = GetUserRole();
                var currentUser = await _users.Find(u => u.Id == userId).FirstOrDefaultAsync();
                var userDept = currentUser?.Department;

                // Build filter
                var filterBuilder = Builders<Post>.Filter;
                var filter = filterBuilder.Empty;

                // 1. Hide hidden posts unless Admin
                if (userRole != "Admin")
                {
                    filter &= filterBuilder.Eq(p => p.IsHidden, false);
                }

                // 2. Filter by Role & Department
                if (userRole != "Admin") // Admin sees all
                {
                    // Logic: (AllowedRoles is empty OR contains my role) AND (AllowedDepartments is empty OR contains my dept)

                    var roleFilter = filterBuilder.Or(
                        filterBuilder.Size("allowedRoles", 0),
                        filterBuilder.AnyEq("allowedRoles", userRole)
                    );

                    var deptFilter = filterBuilder.Or(
                        filterBuilder.Size("allowedDepartments", 0),
                        filterBuilder.AnyEq("allowedDepartments", userDept)
                    );

                    filter &= roleFilter & deptFilter;
                }

                var skip = (page - 1) * limit;

                var posts = await _posts
                    .Find(filter)
                    .SortByDescending(p => p.CreatedAt)
                    .Skip(skip)
                    .Limit(limit)
                    .ToListAsync();

                var totalCount = await _posts.CountDocumentsAsync(filter);

                return Ok(new
                {
                    posts,
                    pagination = new
                    {
                        page,
                        limit,
                        totalCount,
                        totalPages = (int)Math.Ceiling((double)totalCount / limit)
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error fetching posts", error = ex.Message });
            }
        }

        // GET: api/SocialFeed/users/{userId}/posts
        [HttpGet("users/{userId}/posts")]
        public async Task<IActionResult> GetUserPosts(string userId)
        {
            try
            {
                var posts = await _posts
                    .Find(p => p.AuthorId == userId)
                    .SortByDescending(p => p.CreatedAt)
                    .ToListAsync();

                return Ok(posts);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error fetching user posts", error = ex.Message });
            }
        }

        // POST: api/SocialFeed/posts
        [HttpPost("posts")]
        public async Task<IActionResult> CreatePost([FromBody] CreatePostRequest request)
        {
            try
            {
                var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                var userName = User.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown User";
                var userRole = User.FindFirst(ClaimTypes.Role)?.Value ?? "User";

                if (string.IsNullOrEmpty(userId))
                {
                    return Unauthorized(new { message = "User not authenticated" });
                }

                // Fetch full user details to get AvatarUrl
                var currentUser = await _users.Find(u => u.Id == userId).FirstOrDefaultAsync();
                var userAvatar = currentUser?.AvatarUrl;

                var post = new Post
                {
                    AuthorId = userId,
                    AuthorName = userName,
                    AuthorRole = userRole,
                    AuthorAvatarUrl = userAvatar,
                    Content = request.Content,
                    Privacy = request.Privacy ?? "Public",
                    MediaFiles = request.MediaFiles ?? new List<MediaFile>(),
                    Category = request.Category ?? "General",
                    Type = request.Type ?? "Text",
                    CreatedAt = DateTime.UtcNow,
                    AllowedRoles = request.AllowedRoles ?? new List<string>(),
                    AllowedDepartments = request.AllowedDepartments ?? new List<string>(),
                    IsUrgent = request.IsUrgent,
                    UrgentReason = request.UrgentReason
                };

                // Initialize poll if options provided
                if (request.PollOptions != null && request.PollOptions.Count > 0)
                {
                    post.PollOptions = request.PollOptions.Select(opt => new PollOption { Text = opt }).ToList();
                    post.MultipleChoice = request.MultipleChoice;
                    if (request.PollDurationDays.HasValue)
                    {
                        post.PollEndsAt = DateTime.UtcNow.AddDays(request.PollDurationDays.Value);
                    }
                    post.Type = "Poll";
                }

                await _posts.InsertOneAsync(post);

                // Broadcast NewPost realtime tới tất cả user
                await _hubContext.Clients.All.SendAsync("NewNotification", new
                {
                    id = post.Id,
                    type = "NewPost",
                    message = request.IsUrgent
                        ? $"🚨 [{userName}] đăng thông báo khẩn: {post.Content.Substring(0, Math.Min(60, post.Content.Length))}..."
                        : $"📝 [{userName}] vừa đăng bài mới",
                    actorName = userName,
                    link = $"/feed#{post.Id}",
                    isRead = false,
                    createdAt = post.CreatedAt
                });

                return CreatedAtAction(nameof(GetPostById), new { id = post.Id }, post);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error creating post", error = ex.Message });
            }
        }

        // GET: api/SocialFeed/posts/{id}
        [HttpGet("posts/{id}")]
        public async Task<IActionResult> GetPostById(string id)
        {
            try
            {
                var post = await _posts.Find(p => p.Id == id).FirstOrDefaultAsync();

                if (post == null)
                {
                    return NotFound(new { message = "Post not found" });
                }

                return Ok(post);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error fetching post", error = ex.Message });
            }
        }

        // PUT: api/SocialFeed/posts/{id}
        [HttpPut("posts/{id}")]
        public async Task<IActionResult> UpdatePost(string id, [FromBody] UpdatePostRequest request)
        {
            try
            {
                var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                var post = await _posts.Find(p => p.Id == id).FirstOrDefaultAsync();

                if (post == null)
                {
                    return NotFound(new { message = "Post not found" });
                }

                if (post.AuthorId != userId)
                {
                    return Forbid("You can only edit your own posts");
                }

                var update = Builders<Post>.Update
                    .Set(p => p.Content, request.Content)
                    .Set(p => p.UpdatedAt, DateTime.UtcNow);

                await _posts.UpdateOneAsync(p => p.Id == id, update);

                return Ok(new { message = "Post updated successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error updating post", error = ex.Message });
            }
        }

        // DELETE: api/SocialFeed/posts/{id}
        [HttpDelete("posts/{id}")]
        public async Task<IActionResult> DeletePost(string id)
        {
            try
            {
                var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                var userRole = User.FindFirst(ClaimTypes.Role)?.Value;
                var post = await _posts.Find(p => p.Id == id).FirstOrDefaultAsync();

                if (post == null)
                {
                    return NotFound(new { message = "Post not found" });
                }

                // Only author or admin can delete
                if (post.AuthorId != userId && userRole != "Admin")
                {
                    return Forbid("You don't have permission to delete this post");
                }

                await _posts.DeleteOneAsync(p => p.Id == id);
                // Also delete all comments on this post
                await _comments.DeleteManyAsync(c => c.PostId == id);

                return Ok(new { message = "Post deleted successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error deleting post", error = ex.Message });
            }
        }

        // POST: api/SocialFeed/posts/{id}/like
        [HttpPost("posts/{id}/like")]
        public async Task<IActionResult> LikePost(string id)
        {
            try
            {
                var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                var post = await _posts.Find(p => p.Id == id).FirstOrDefaultAsync();

                if (post == null)
                {
                    return NotFound(new { message = "Post not found" });
                }

                // Toggle like
                if (post.LikedBy.Contains(userId!))
                {
                    post.LikedBy.Remove(userId!);
                }
                else
                {
                    post.LikedBy.Add(userId!);
                }

                var update = Builders<Post>.Update.Set(p => p.LikedBy, post.LikedBy);
                await _posts.UpdateOneAsync(p => p.Id == id, update);

                return Ok(new { liked = post.LikedBy.Contains(userId!), likeCount = post.LikedBy.Count });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error liking post", error = ex.Message });
            }
        }

        // POST: api/SocialFeed/posts/{id}/save
        [HttpPost("posts/{id}/save")]
        public async Task<IActionResult> SavePost(string id)
        {
            try
            {
                var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                var post = await _posts.Find(p => p.Id == id).FirstOrDefaultAsync();

                if (post == null)
                {
                    return NotFound(new { message = "Post not found" });
                }

                // Initialize if null (schema evolution)
                if (post.SavedBy == null) post.SavedBy = new List<string>();

                // Toggle save
                if (post.SavedBy.Contains(userId!))
                {
                    post.SavedBy.Remove(userId!);
                }
                else
                {
                    post.SavedBy.Add(userId!);
                }

                var update = Builders<Post>.Update.Set(p => p.SavedBy, post.SavedBy);
                await _posts.UpdateOneAsync(p => p.Id == id, update);

                return Ok(new { saved = post.SavedBy.Contains(userId!) });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error saving post", error = ex.Message });
            }
        }

        // POST: api/SocialFeed/posts/{id}/pin
        [HttpPost("posts/{id}/pin")]
        public async Task<IActionResult> PinPost(string id)
        {
            try
            {
                var userRole = User.FindFirst(ClaimTypes.Role)?.Value;

                if (userRole != "Admin")
                {
                    return Forbid("Only Admins can pin posts");
                }

                var post = await _posts.Find(p => p.Id == id).FirstOrDefaultAsync();
                if (post == null) return NotFound(new { message = "Post not found" });

                var update = Builders<Post>.Update.Set(p => p.IsPinned, !post.IsPinned);
                await _posts.UpdateOneAsync(p => p.Id == id, update);

                return Ok(new { pinned = !post.IsPinned });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error pinning post", error = ex.Message });
            }
        }

        // POST: api/SocialFeed/posts/{id}/react
        [HttpPost("posts/{id}/react")]
        public async Task<IActionResult> ReactToPost(string id, [FromBody] ReactRequest request)
        {
            try
            {
                var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                var userName = User.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown User";
                var post = await _posts.Find(p => p.Id == id).FirstOrDefaultAsync();

                if (post == null) return NotFound(new { message = "Post not found" });

                // Initialize dictionary if null
                if (post.Reactions == null) post.Reactions = new Dictionary<string, List<string>>();

                // Remove user from all other reactions first (one reaction per user)
                foreach (var key in post.Reactions.Keys)
                {
                    if (post.Reactions[key].Contains(userId!))
                    {
                        post.Reactions[key].Remove(userId!);
                    }
                }

                // Also remove from legacy LikedBy if present to ensure single reaction source of truth
                if (post.LikedBy != null && post.LikedBy.Contains(userId!))
                {
                    post.LikedBy.Remove(userId!);
                }

                // Track if this is a new reaction (not just changing reaction type)
                bool isNewReaction = !post.Reactions.Values.Any(list => list.Contains(userId!));

                // Add to new reaction if type provided
                if (!string.IsNullOrEmpty(request.Type))
                {
                    if (!post.Reactions.ContainsKey(request.Type))
                    {
                        post.Reactions[request.Type] = new List<string>();
                    }
                    post.Reactions[request.Type].Add(userId!);
                }

                // Cleanup empty keys
                var keysToRemove = post.Reactions.Where(kvp => kvp.Value.Count == 0).Select(kvp => kvp.Key).ToList();
                foreach (var key in keysToRemove) post.Reactions.Remove(key);

                var update = Builders<Post>.Update.Set(p => p.Reactions, post.Reactions);
                await _posts.UpdateOneAsync(p => p.Id == id, update);

                // Create notification for post author (if not reacting to own post and it's a new reaction)
                if (isNewReaction && post.AuthorId != userId && !string.IsNullOrEmpty(request.Type))
                {
                    var reactionEmoji = request.Type switch
                    {
                        "like" => "👍",
                        "love" => "❤️",
                        "laugh" => "😂",
                        "wow" => "😮",
                        "sad" => "😢",
                        "angry" => "😡",
                        _ => "👍"
                    };

                    await _notificationsController.CreateSocialNotification(
                        type: "Like",
                        targetUserId: post.AuthorId,
                        message: $"{userName} reacted {reactionEmoji} to your post",
                        actorUserId: userId,
                        actorName: userName,
                        link: $"/feed#{id}",  // Use hash instead of query param to avoid red border
                        relatedId: id
                    );
                }

                return Ok(new { success = true, reactions = post.Reactions });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error reacting to post", error = ex.Message });
            }
        }
        // POST: api/SocialFeed/posts/{id}/report
        [HttpPost("posts/{id}/report")]
        public async Task<IActionResult> ReportPost(string id, [FromBody] ReportRequest request)
        {
            try
            {
                var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                var post = await _posts.Find(p => p.Id == id).FirstOrDefaultAsync();

                if (post == null) return NotFound(new { message = "Post not found" });

                var report = new Report
                {
                    PostId = id,
                    ReporterId = userId!,
                    Reason = request.Reason,
                    Status = "Pending",
                    CreatedAt = DateTime.UtcNow
                };

                await _reports.InsertOneAsync(report);
                return Ok(new { message = "Post reported successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error reporting post", error = ex.Message });
            }
        }

        // POST: api/SocialFeed/posts/{id}/vote
        [HttpPost("posts/{id}/vote")]
        public async Task<IActionResult> VotePoll(string id, [FromBody] int optionIndex)
        {
            try
            {
                var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                var post = await _posts.Find(p => p.Id == id).FirstOrDefaultAsync();

                if (post == null || post.PollOptions == null) 
                    return NotFound(new { message = "Poll not found" });

                if (post.PollEndsAt.HasValue && post.PollEndsAt.Value < DateTime.UtcNow)
                    return BadRequest(new { message = "Bình chọn đã kết thúc" });

                if (optionIndex < 0 || optionIndex >= post.PollOptions.Count)
                    return BadRequest(new { message = "Lựa chọn không hợp lệ" });

                // Check if user already voted (unless multipleChoice is allowed? user stated 'Poll' usually 1 vote)
                // If not multipleChoice, remove user from all other options first
                if (!post.MultipleChoice)
                {
                    foreach (var opt in post.PollOptions)
                    {
                        opt.VoterIds.Remove(userId!);
                    }
                }

                // Toggle vote for the selected option
                if (post.PollOptions[optionIndex].VoterIds.Contains(userId!))
                {
                    post.PollOptions[optionIndex].VoterIds.Remove(userId!);
                }
                else
                {
                    post.PollOptions[optionIndex].VoterIds.Add(userId!);
                }

                var update = Builders<Post>.Update.Set(p => p.PollOptions, post.PollOptions);
                await _posts.UpdateOneAsync(p => p.Id == id, update);

                return Ok(new { success = true, pollOptions = post.PollOptions });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error voting in poll", error = ex.Message });
            }
        }

        // POST: api/SocialFeed/posts/{id}/hide
        [HttpPost("posts/{id}/hide")]
        [Authorize(Roles = "Admin,Giám đốc,Giam doc,Director")]
        public async Task<IActionResult> HidePost(string id)
        {
            try
            {
                var update = Builders<Post>.Update.Set(p => p.IsHidden, true);
                var result = await _posts.UpdateOneAsync(p => p.Id == id, update);

                if (result.ModifiedCount == 0) return NotFound(new { message = "Post not found" });

                return Ok(new { message = "Post hidden successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error hiding post", error = ex.Message });
            }
        }

        // GET: api/SocialFeed/reports
        [HttpGet("reports")]
        [Authorize(Roles = "Admin,Giám đốc,Giam doc,Director")]
        public async Task<IActionResult> GetReports()
        {
            try
            {
                var reports = await _reports.Find(_ => true).SortByDescending(r => r.CreatedAt).ToListAsync();
                return Ok(reports);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error fetching reports", error = ex.Message });
            }
        }

        // GET: api/SocialFeed/posts/{id}/comments
        [HttpGet("posts/{id}/comments")]
        public async Task<IActionResult> GetComments(string id)
        {
            try
            {
                var comments = await _comments
                    .Find(c => c.PostId == id)
                    .SortBy(c => c.CreatedAt)
                    .ToListAsync();

                return Ok(comments);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error fetching comments", error = ex.Message });
            }
        }

        // POST: api/SocialFeed/posts/{id}/comments
        [HttpPost("posts/{id}/comments")]
        public async Task<IActionResult> AddComment(string id, [FromBody] CreateCommentRequest request)
        {
            try
            {
                var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                var userName = User.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown User";

                if (string.IsNullOrEmpty(userId))
                {
                    return Unauthorized(new { message = "User not authenticated" });
                }

                // Fetch full user details to get AvatarUrl
                var currentUser = await _users.Find(u => u.Id == userId).FirstOrDefaultAsync();
                var userAvatar = currentUser?.AvatarUrl;

                // Fetch post to get author info
                var post = await _posts.Find(p => p.Id == id).FirstOrDefaultAsync();
                if (post == null) return NotFound(new { message = "Post not found" });

                var comment = new Comment
                {
                    PostId = id,
                    AuthorId = userId,
                    AuthorName = userName,
                    AuthorAvatarUrl = userAvatar,
                    Content = request.Content,
                    ParentCommentId = request.ParentCommentId,
                    CreatedAt = DateTime.UtcNow
                };

                await _comments.InsertOneAsync(comment);

                // Update comment count on post
                var update = Builders<Post>.Update.Inc(p => p.CommentCount, 1);
                await _posts.UpdateOneAsync(p => p.Id == id, update);

                // Create notification for post author (if not commenting on own post)
                if (post.AuthorId != userId)
                {
                    await _notificationsController.CreateSocialNotification(
                        type: "Comment",
                        targetUserId: post.AuthorId,
                        message: $"{userName} commented on your post",
                        actorUserId: userId,
                        actorName: userName,
                        link: $"/feed#{id}",  // Use hash to scroll without red border
                        relatedId: id
                    );
                }

                return CreatedAtAction(nameof(GetComments), new { id }, comment);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error adding comment", error = ex.Message });
            }
        }

        // POST: api/SocialFeed/comments/{commentId}/react
        [HttpPost("comments/{commentId}/react")]
        public async Task<IActionResult> ReactToComment(string commentId, [FromBody] ReactRequest request)
        {
            try
            {
                var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userId)) return Unauthorized();

                var comment = await _comments.Find(c => c.Id == commentId).FirstOrDefaultAsync();
                if (comment == null) return NotFound(new { message = "Comment not found" });

                // Initialize if null
                if (comment.Reactions == null) comment.Reactions = new Dictionary<string, List<string>>();

                // Remove user from all existing reactions (one reaction per user)
                foreach (var key in comment.Reactions.Keys.ToList())
                {
                    comment.Reactions[key].Remove(userId);
                }

                // Add to new type if provided
                if (!string.IsNullOrEmpty(request.Type))
                {
                    if (!comment.Reactions.ContainsKey(request.Type))
                        comment.Reactions[request.Type] = new List<string>();
                    comment.Reactions[request.Type].Add(userId);
                }

                // Cleanup empty keys
                var toRemove = comment.Reactions.Where(kvp => kvp.Value.Count == 0).Select(kvp => kvp.Key).ToList();
                foreach (var k in toRemove) comment.Reactions.Remove(k);

                var update = Builders<Comment>.Update.Set(c => c.Reactions, comment.Reactions);
                await _comments.UpdateOneAsync(c => c.Id == commentId, update);

                return Ok(new { success = true, reactions = comment.Reactions });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error reacting to comment", error = ex.Message });
            }
        }

        // GET: api/SocialFeed/search/posts?q={query}&category={category}&department={department}&dateFrom={date}&dateTo={date}
        [HttpGet("search/posts")]
        public async Task<ActionResult<SearchPostsResponse>> SearchPosts(
            [FromQuery] string? q,
            [FromQuery] string? category,
            [FromQuery] string? department,
            [FromQuery] DateTime? dateFrom,
            [FromQuery] DateTime? dateTo)
        {
            try
            {
                var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                var userRole = GetUserRole();
                var currentUser = await _users.Find(u => u.Id == userId).FirstOrDefaultAsync();
                var userDepartment = currentUser?.Department;

                // Start with all non-hidden posts
                var filter = Builders<Post>.Filter.Ne(p => p.IsHidden, true);

                // Apply role and department filtering
                // Show posts if: no restrictions OR user matches allowed roles OR user matches allowed departments
                var permissionFilters = new List<FilterDefinition<Post>>
                {
                    // Posts with no role restrictions
                    Builders<Post>.Filter.Or(
                        Builders<Post>.Filter.Eq(p => p.AllowedRoles, new List<string>()),
                        Builders<Post>.Filter.Size(p => p.AllowedRoles, 0)
                    ),
                    // Posts with no department restrictions
                    Builders<Post>.Filter.Or(
                        Builders<Post>.Filter.Eq(p => p.AllowedDepartments, new List<string>()),
                        Builders<Post>.Filter.Size(p => p.AllowedDepartments, 0)
                    )
                };

                // Add user's specific role if they have one
                if (!string.IsNullOrEmpty(userRole))
                {
                    permissionFilters.Add(Builders<Post>.Filter.AnyEq(p => p.AllowedRoles, userRole));
                }

                // Add user's specific department if they have one
                if (!string.IsNullOrEmpty(userDepartment))
                {
                    permissionFilters.Add(Builders<Post>.Filter.AnyEq(p => p.AllowedDepartments, userDepartment));
                }

                filter = Builders<Post>.Filter.And(
                    filter,
                    Builders<Post>.Filter.Or(permissionFilters)
                );

                // Apply search query (content or author name)
                if (!string.IsNullOrWhiteSpace(q))
                {
                    var searchFilter = Builders<Post>.Filter.Or(
                        Builders<Post>.Filter.Regex(p => p.Content, new MongoDB.Bson.BsonRegularExpression(q, "i")),
                        Builders<Post>.Filter.Regex(p => p.AuthorName, new MongoDB.Bson.BsonRegularExpression(q, "i"))
                    );
                    filter = Builders<Post>.Filter.And(filter, searchFilter);
                }

                // Apply category filter
                if (!string.IsNullOrWhiteSpace(category) && category != "All")
                {
                    filter = Builders<Post>.Filter.And(
                        filter,
                        Builders<Post>.Filter.Eq(p => p.Category, category)
                    );
                }

                // Apply department filter
                if (!string.IsNullOrWhiteSpace(department))
                {
                    filter = Builders<Post>.Filter.And(
                        filter,
                        Builders<Post>.Filter.AnyEq(p => p.AllowedDepartments, department)
                    );
                }

                // Apply date range filter
                if (dateFrom.HasValue)
                {
                    filter = Builders<Post>.Filter.And(
                        filter,
                        Builders<Post>.Filter.Gte(p => p.CreatedAt, dateFrom.Value)
                    );
                }

                if (dateTo.HasValue)
                {
                    filter = Builders<Post>.Filter.And(
                        filter,
                        Builders<Post>.Filter.Lte(p => p.CreatedAt, dateTo.Value.AddDays(1)) // Include entire day
                    );
                }

                // Execute query with limit
                var posts = await _posts.Find(filter)
                    .SortByDescending(p => p.CreatedAt)
                    .Limit(50)
                    .ToListAsync();

                return Ok(new SearchPostsResponse
                {
                    Posts = posts,
                    Total = posts.Count,
                    Query = q
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error searching posts", error = ex.Message });
            }
        }

        // GET: api/SocialFeed/users
        [HttpGet("users")]
        public async Task<IActionResult> GetUsers()
        {
            try
            {
                var usersCollection = _database.GetCollection<InsiderThreat.Shared.User>("Users");
                var users = await usersCollection.Find(_ => true).ToListAsync();

                // Hide password hashes
                users.ForEach(u => u.PasswordHash = "");

                return Ok(users);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error fetching users", error = ex.Message });
            }
        }
    }

    // Request DTOs
    public class CreatePostRequest
    {
        public string Content { get; set; } = string.Empty;
        public string? Privacy { get; set; }
        public List<MediaFile>? MediaFiles { get; set; }
        public string? Category { get; set; }
        public string Type { get; set; } = "Text";
        public List<string>? AllowedRoles { get; set; }
        public List<string>? AllowedDepartments { get; set; }
        public bool IsUrgent { get; set; } = false;
        public string? UrgentReason { get; set; }
        
        // Poll fields
        public List<string>? PollOptions { get; set; }
        public bool MultipleChoice { get; set; }
        public int? PollDurationDays { get; set; }
    }

    public class UpdatePostRequest
    {
        public string Content { get; set; } = string.Empty;
    }

    public class CreateCommentRequest
    {
        public string Content { get; set; } = string.Empty;
        public string? ParentCommentId { get; set; }
    }

    public class ReactRequest
    {
        public string Type { get; set; } = string.Empty; // like, love, haha, wow, sad, angry
    }

    public class ReportRequest
    {
        public string Reason { get; set; } = string.Empty;
    }

    public class SearchPostsResponse
    {
        public List<Post> Posts { get; set; } = new();
        public int Total { get; set; }
        public string? Query { get; set; }
    }
}
