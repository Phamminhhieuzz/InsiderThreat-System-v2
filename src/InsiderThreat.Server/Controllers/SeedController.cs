using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using MongoDB.Bson;
using InsiderThreat.Server.Models;
using InsiderThreat.Shared;

namespace InsiderThreat.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SeedController : ControllerBase
{
    private readonly IMongoDatabase _database;
    private readonly ILogger<SeedController> _logger;

    public SeedController(IMongoDatabase database, ILogger<SeedController> logger)
    {
        _database = database;
        _logger = logger;
    }

    [HttpPost("social-from-users")]
    public async Task<IActionResult> SeedSocialDataFromExistingUsers()
    {
        try
        {
            _logger.LogInformation("Starting to seed social network data from existing users...");

            // 1. Get existing users
            var usersCollection = _database.GetCollection<User>("Users");
            var users = await usersCollection.Find(_ => true).ToListAsync();

            if (users.Count == 0)
            {
                return BadRequest(new { message = "No users found in database. Please create user accounts first." });
            }

            _logger.LogInformation($"Found {users.Count} active users");

            // 2. Create Groups based on departments
            var groupsCollection = _database.GetCollection<BsonDocument>("Groups");
            await groupsCollection.DeleteManyAsync(new BsonDocument()); // Clear existing

            var groups = new List<BsonDocument>();
            var departments = users.Where(u => !string.IsNullOrEmpty(u.Department))
                                  .Select(u => u.Department)
                                  .Distinct()
                                  .ToList();

            foreach (var dept in departments)
            {
                var deptUsers = users.Where(u => u.Department == dept).ToList();
                if (deptUsers.Any())
                {
                    groups.Add(new BsonDocument
                    {
                        { "name", $"{dept} Team" },
                        { "description", $"{dept} department team" },
                        { "type", "Department" },
                        { "privacy", "Public" },
                        { "adminIds", new BsonArray { deptUsers.First().Id ?? string.Empty } },
                        { "memberIds", new BsonArray(deptUsers.Select(u => u.Id ?? string.Empty)) },
                        { "createdAt", DateTime.UtcNow }
                    });
                }
            }

            // Add company-wide group
            var admin = users.FirstOrDefault(u => u.Role == "Admin");
            var adminId = admin?.Id ?? users.First().Id ?? string.Empty;
            groups.Add(new BsonDocument
            {
                { "name", "Company All Hands" },
                { "description", "Official company-wide announcements and updates" },
                { "type", "Team" },
                { "privacy", "Public" },
                { "adminIds", new BsonArray { adminId } },
                { "memberIds", new BsonArray(users.Select(u => u.Id ?? string.Empty)) },
                { "createdAt", DateTime.UtcNow }
            });

            if (groups.Count > 0)
            {
                await groupsCollection.InsertManyAsync(groups);
            }

            // 3. Create Posts from real users
            var postsCollection = _database.GetCollection<Post>("Posts");
            await postsCollection.DeleteManyAsync(new BsonDocument()); // Clear existing

            var posts = new List<Post>();
            var now = DateTime.UtcNow;

            // Welcome posts for first 5 users
            var postUsers = users.Take(Math.Min(5, users.Count)).ToList();
            for (int i = 0; i < postUsers.Count; i++)
            {
                var user = postUsers[i];
                var hoursAgo = (i + 1) * 2;

                var content = $"Xin chào mọi người! Tôi là {user.FullName}";
                if (!string.IsNullOrEmpty(user.Department))
                    content += $" từ phòng {user.Department}";
                content += ". Rất vui được làm việc cùng team! 🎉";

                var otherUserIds = users.Where(u => u.Id != user.Id).Select(u => u.Id ?? string.Empty).Take(2).ToList();

                posts.Add(new Post
                {
                    AuthorId = user.Id ?? string.Empty,
                    AuthorName = user.FullName,
                    AuthorRole = user.Role ?? "User",
                    Content = content,
                    Privacy = "Public",
                    MediaFiles = new List<MediaFile>(),
                    LikedBy = otherUserIds,
                    Reactions = new Dictionary<string, List<string>>(),
                    CommentCount = 0,
                    ShareCount = 0,
                    CreatedAt = now.AddHours(-hoursAgo)
                });
            }

            // Admin announcement
            if (admin != null)
            {
                posts.Add(new Post
                {
                    AuthorId = admin.Id ?? string.Empty,
                    AuthorName = admin.FullName,
                    AuthorRole = "Admin",
                    Content = "📢 Chào mừng đến với hệ thống mạng xã hội nội bộ InsiderThreat! Đây là nơi để team giao lưu, chia sẻ thông tin và cập nhật công việc. Hãy thoải mái đăng bài và tương tác nhé! 🚀",
                    Privacy = "Public",
                    MediaFiles = new List<MediaFile>(),
                    LikedBy = users.Where(u => u.Id != admin.Id).Select(u => u.Id ?? string.Empty).ToList(),
                    Reactions = new Dictionary<string, List<string>>(),
                    CommentCount = 0,
                    ShareCount = 0,
                    CreatedAt = now.AddHours(-12)
                });
            }

            // Recent update
            if (users.Count > 1)
            {
                var randomUser = users[new Random().Next(users.Count)];
                posts.Add(new Post
                {
                    AuthorId = randomUser.Id ?? string.Empty,
                    AuthorName = randomUser.FullName,
                    AuthorRole = randomUser.Role ?? "User",
                    Content = "Hôm nay có meeting về project mới lúc 2PM. Mọi người nhớ tham gia nhé! 📅",
                    Privacy = "Public",
                    MediaFiles = new List<MediaFile>(),
                    LikedBy = new List<string> { users.First().Id ?? string.Empty },
                    Reactions = new Dictionary<string, List<string>>(),
                    CommentCount = 0,
                    ShareCount = 0,
                    CreatedAt = now.AddMinutes(-30)
                });
            }

            if (posts.Count > 0)
            {
                await postsCollection.InsertManyAsync(posts);
            }

            //4. Create Comments
            var commentsCollection = _database.GetCollection<Comment>("Comments");
            var recentPosts = await postsCollection.Find(new BsonDocument())
                .SortByDescending(p => p.CreatedAt)
                .Limit(3)
                .ToListAsync();

            var comments = new List<Comment>();
            foreach (var post in recentPosts)
            {
                var commenter = users.FirstOrDefault(u => u.Id != post.AuthorId);
                if (commenter != null)
                {
                    comments.Add(new Comment
                    {
                        PostId = post.Id ?? string.Empty,
                        AuthorId = commenter.Id ?? string.Empty,
                        AuthorName = commenter.FullName,
                        Content = "Cảm ơn đã chia sẻ! 👍",
                        ParentCommentId = null,
                        LikedBy = new List<string>(),
                        CreatedAt = now.AddMinutes(-20)
                    });

                    // Update comment count
                    await postsCollection.UpdateOneAsync(
                        p => p.Id == post.Id,
                        Builders<Post>.Update.Inc(p => p.CommentCount, 1)
                    );
                }
            }

            if (comments.Count > 0)
            {
                await commentsCollection.InsertManyAsync(comments);
            }

            // Get counts
            var userCount = users.Count;
            var groupCount = await groupsCollection.CountDocumentsAsync(new BsonDocument());
            var postCount = await postsCollection.CountDocumentsAsync(new BsonDocument());
            var commentCount = await commentsCollection.CountDocumentsAsync(new BsonDocument());

            _logger.LogInformation("Social network data seeded successfully!");

            return Ok(new
            {
                message = "✅ Social network data seeded successfully!",
                summary = new
                {
                    usersFound = userCount,
                    groupsCreated = groupCount,
                    postsCreated = postCount,
                    commentsCreated = commentCount
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error seeding social network data");
            return StatusCode(500, new { message = "Failed to seed data", error = ex.Message });
        }
    }

    [HttpDelete("clear-social-data")]
    public async Task<IActionResult> ClearSocialData()
    {
        try
        {
            var postsCollection = _database.GetCollection<Post>("Posts");
            var commentsCollection = _database.GetCollection<Comment>("Comments");
            var groupsCollection = _database.GetCollection<BsonDocument>("Groups");

            await postsCollection.DeleteManyAsync(new BsonDocument());
            await commentsCollection.DeleteManyAsync(new BsonDocument());
            await groupsCollection.DeleteManyAsync(new BsonDocument());

            return Ok(new { message = "✅ All social data cleared successfully!" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error clearing social data");
            return StatusCode(500, new { message = "Failed to clear data", error = ex.Message });
        }
    }
}
