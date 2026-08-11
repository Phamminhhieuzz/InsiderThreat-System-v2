using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using MongoDB.Driver.GridFS;
using InsiderThreat.Server.Models;
using InsiderThreat.Shared;
using Microsoft.AspNetCore.Authorization;
using MongoDB.Bson;
using System.Linq;
using InsiderThreat.Server.Services;
using System.Collections.Generic;

namespace InsiderThreat.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Route("api/documents")]
    [Authorize]
    public class DocumentLibraryController : ControllerBase
    {
        private readonly IMongoCollection<SharedDocument> _documents;
        private readonly IMongoCollection<User> _users;
        private readonly IGridFSBucket _gridFS;
        private readonly ILogger<DocumentLibraryController> _logger;
        private readonly FileEncryptionService _encryptionService;
        private readonly IWatermarkService _watermarkService;

        public DocumentLibraryController(
            IMongoDatabase database, 
            IGridFSBucket gridFS, 
            ILogger<DocumentLibraryController> logger,
            FileEncryptionService encryptionService,
            IWatermarkService watermarkService)
        {
            _documents = database.GetCollection<SharedDocument>("SharedDocuments");
            _users = database.GetCollection<User>("Users");
            _gridFS = gridFS;
            _logger = logger;
            _encryptionService = encryptionService;
            _watermarkService = watermarkService;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<SharedDocument>>> GetDocuments()
        {
            var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            var userRole = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value ?? "Nhân viên";
            var userRoleLevel = GetRoleLevel(userRole);

            _logger.LogInformation($"Fetching documents for user {userId} with role {userRole} (Level {userRoleLevel})");

            var allDocs = await _documents.Find(_ => true)
                .SortByDescending(d => d.UploadDate)
                .ToListAsync();

            var filteredDocs = allDocs.Where(d => 
            {
                // 1. Admins see everything
                if (userRole == "Admin") return true;

                // 2. Uploader sees their own doc
                if (d.UploaderId == userId) return true;

                // 3. Specifically allowed users see it
                if (d.AllowedUserIds != null && d.AllowedUserIds.Contains(userId)) return true;

                // 4. Role-based hierarchy: Document's minimum role level must be <= User's role level
                var docMinRoleLevel = GetRoleLevel(d.MinimumRole);
                return docMinRoleLevel <= userRoleLevel;
            }).ToList();

            _logger.LogInformation($"Filtered {allDocs.Count} down to {filteredDocs.Count} for user {userId}");
            return Ok(filteredDocs);
        }

        [HttpPost]
        [Authorize(Roles = "Admin,Giám đốc,Giam doc,Director")]
        public async Task<ActionResult<SharedDocument>> UploadDocument(
            [FromForm] IFormFile file, 
            [FromForm] string? description, 
            [FromForm] string? minimumRole,
            [FromForm] string? allowedUserIdsJson,
            [FromForm] string? allowedDownloadUserIdsJson,
            [FromForm] bool requireCamera = true,
            [FromForm] bool requireWatermark = true,
            [FromForm] bool enableAgentMonitoring = true,
            [FromForm] bool disableMobileDownload = false,
            [FromForm] string? department = "General",
            [FromForm] string? securityLevel = "Internal")
        {
            if (file == null || file.Length == 0)
                return BadRequest("No file uploaded");

            var allowedExtensions = new[] { ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt", ".zip", ".rar", ".pptx", ".ppt", ".csv", ".7z" };
            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!allowedExtensions.Contains(extension))
                return BadRequest("Invalid file type. Supported: PDF, Word, Excel, PowerPoint, TXT, CSV, ZIP/RAR/7Z.");

            try
            {
                var allowedUserIds = new List<string>();
                var allowedDownloadUserIds = new List<string>();

                if (!string.IsNullOrEmpty(allowedUserIdsJson))
                {
                    try {
                        allowedUserIds = System.Text.Json.JsonSerializer.Deserialize<List<string>>(allowedUserIdsJson) ?? new List<string>();
                    } catch (Exception ex) {
                        _logger.LogWarning(ex, "Failed to deserialize allowedUserIdsJson");
                    }
                }

                if (!string.IsNullOrEmpty(allowedDownloadUserIdsJson))
                {
                    try {
                        allowedDownloadUserIds = System.Text.Json.JsonSerializer.Deserialize<List<string>>(allowedDownloadUserIdsJson) ?? new List<string>();
                    } catch (Exception ex) {
                        _logger.LogWarning(ex, "Failed to deserialize allowedDownloadUserIdsJson");
                    }
                }

                _logger.LogInformation($"Uploading document: {file.FileName} ({file.Length} bytes) with MinRole: {minimumRole}, AllowedUsers: {allowedUserIds.Count}, AllowedDownloaders: {allowedDownloadUserIds.Count}");
                
                // 1. Encrypt and Upload to GridFS
                var options = new GridFSUploadOptions
                {
                    Metadata = new BsonDocument
                    {
                        { "originalName", file.FileName },
                        { "contentType", file.ContentType },
                        { "uploadedAt", DateTime.UtcNow },
                        { "isEncrypted", true }
                    }
                };

                using var sourceStream = file.OpenReadStream();
                using var encryptedStream = new MemoryStream();
                
                // Perform military-grade encryption
                await _encryptionService.EncryptStreamAsync(sourceStream, encryptedStream);
                encryptedStream.Position = 0;

                var fileId = await _gridFS.UploadFromStreamAsync(file.FileName, encryptedStream, options);

                _logger.LogInformation($"Uploaded ENCRYPTED file to GridFS with ID: {fileId}");

                // 2. Save metadata
                var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "unknown";
                
                // Fetch full user details to get the most accurate FullName
                var currentUser = await _users.Find(u => u.Id == userId).FirstOrDefaultAsync();
                var userName = currentUser?.FullName ?? User.FindFirst("FullName")?.Value ?? User.Identity?.Name ?? "Unknown User";

                var sharedDoc = new SharedDocument
                {
                    FileId = fileId.ToString(),
                    FileName = file.FileName,
                    ContentType = file.ContentType,
                    UploaderId = userId,
                    UploaderName = userName,
                    Size = file.Length,
                    Description = description,
                    MinimumRole = minimumRole ?? "Nhân viên",
                    AllowedUserIds = allowedUserIds,
                    AllowedDownloadUserIds = allowedDownloadUserIds,
                    RequireCamera = requireCamera,
                    RequireWatermark = requireWatermark,
                    EnableAgentMonitoring = enableAgentMonitoring,
                    DisableMobileDownload = disableMobileDownload,
                    Department = department ?? "General",
                    SecurityLevel = securityLevel ?? "Internal"
                };

                await _documents.InsertOneAsync(sharedDoc);
                _logger.LogInformation($"Metadata saved for document: {sharedDoc.Id}");
                return Ok(sharedDoc);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error uploading document: {file.FileName}");
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "Admin,Giám đốc,Giam doc,Director")]
        public async Task<IActionResult> DeleteDocument(string id)
        {
            _logger.LogInformation($"Attempting to delete document with ID: {id}");
            var doc = await _documents.Find(d => d.Id == id).FirstOrDefaultAsync();
            if (doc == null)
            {
                _logger.LogWarning($"Document not found with ID: {id}");
                return NotFound();
            }

            // Check permission: Only owner or admin/Giám đốc
            var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            var userRole = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
            
            _logger.LogInformation($"User {userId} (Role: {userRole}) attempting to delete doc {id} (Owner: {doc.UploaderId})");

            if (doc.UploaderId != userId && userRole != "Admin" && userRole != "Giám đốc") 
            {
                _logger.LogWarning($"User {userId} unauthorized to delete document {id}");
                return Forbid();
            }

            try
            {
                // 1. Delete from GridFS
                _logger.LogInformation($"Deleting file from GridFS with FileId: {doc.FileId}");
                if (ObjectId.TryParse(doc.FileId, out var fileId))
                {
                    await _gridFS.DeleteAsync(fileId);
                    _logger.LogInformation($"Successfully deleted file from GridFS: {fileId}");
                }
                else
                {
                    _logger.LogWarning($"Could not parse FileId to ObjectId: {doc.FileId}");
                }

                // 2. Delete metadata
                var result = await _documents.DeleteOneAsync(d => d.Id == id);
                _logger.LogInformation($"Delete metadata result: {result.DeletedCount} documents deleted");

                return Ok(new { message = "Document deleted successfully", deletedCount = result.DeletedCount });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error deleting document: {id}");
                return StatusCode(500, $"Error deleting document: {ex.Message}");
            }
        }

        [HttpPut("{id}/permissions")]
        [Authorize(Roles = "Admin,Giám đốc,Giam doc,Director")]
        public async Task<IActionResult> UpdatePermissions(string id, [FromBody] UpdatePermissionsRequest request)
        {
            var doc = await _documents.Find(d => d.Id == id).FirstOrDefaultAsync();
            if (doc == null)
                return NotFound();

            // Check permission: Only owner or admin/Giám đốc
            var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            var userRole = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;

            if (doc.UploaderId != userId && userRole != "Admin" && userRole != "Giám đốc")
                return Forbid();

            _logger.LogInformation($"Updating permissions for doc {id}. Dept: {request.Department}, Level: {request.SecurityLevel}");

            var update = Builders<SharedDocument>.Update
                .Set(d => d.MinimumRole, request.MinimumRole ?? doc.MinimumRole)
                .Set(d => d.AllowedUserIds, request.AllowedUserIds ?? doc.AllowedUserIds)
                .Set(d => d.AllowedDownloadUserIds, request.AllowedDownloadUserIds ?? doc.AllowedDownloadUserIds)
                .Set(d => d.RequireCamera, request.RequireCamera)
                .Set(d => d.RequireWatermark, request.RequireWatermark)
                .Set(d => d.EnableAgentMonitoring, request.EnableAgentMonitoring)
                .Set(d => d.DisableMobileDownload, request.DisableMobileDownload);

            if (!string.IsNullOrEmpty(request.Department))
                update = update.Set(d => d.Department, request.Department);
            
            if (!string.IsNullOrEmpty(request.SecurityLevel))
                update = update.Set(d => d.SecurityLevel, request.SecurityLevel);

            var result = await _documents.UpdateOneAsync(d => d.Id == id, update);

            if (result.ModifiedCount == 0 && result.MatchedCount == 0)
                return NotFound();

            return Ok(new { message = "Bộ lọc và quyền xem đã được cập nhật" });
        }

        [HttpGet("{id}/file")]
        public async Task<IActionResult> GetFile(string id)
        {
            var doc = await _documents.Find(d => d.Id == id).FirstOrDefaultAsync();
            if (doc == null) return NotFound();

            // 🛡️ Kiểm tra quyền xem file
            var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            var userRole = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value ?? "Nhân viên";
            
            bool canView = userRole == "Admin" || doc.UploaderId == userId || (doc.AllowedUserIds != null && doc.AllowedUserIds.Contains(userId!));
            if (!canView)
            {
                var userRoleLevel = GetRoleLevel(userRole);
                var docMinRoleLevel = GetRoleLevel(doc.MinimumRole);
                if (docMinRoleLevel > userRoleLevel) return Forbid();
            }

            try
            {
                if (!ObjectId.TryParse(doc.FileId, out var fileId)) return BadRequest("Invalid file reference");

                using var encryptedStream = await _gridFS.OpenDownloadStreamAsync(fileId);
                var outputStream = new MemoryStream();

                var fileInfo = await _gridFS.Find(Builders<GridFSFileInfo>.Filter.Eq("_id", fileId)).FirstOrDefaultAsync();
                bool isEncrypted = fileInfo?.Metadata != null && fileInfo.Metadata.Contains("isEncrypted") && fileInfo.Metadata["isEncrypted"].AsBoolean;

                if (isEncrypted)
                {
                    // 🔓 GIẢI MÃ TRONG BỘ NHỚ (Military-grade decryption)
                    await _encryptionService.DecryptStreamAsync(encryptedStream, outputStream);
                }
                else
                {
                    await encryptedStream.CopyToAsync(outputStream);
                }
                
                outputStream.Position = 0;

                // 🛡️ Apply watermark if agent monitoring is enabled
                var extension = Path.GetExtension(doc.FileName).ToLowerInvariant();
                if (doc.EnableAgentMonitoring && (extension == ".docx" || extension == ".pdf"))
                {
                    var trackingId = doc.Id ?? Guid.NewGuid().ToString();
                    _logger.LogInformation("Applying watermark to {FileName} with tracking ID: {TrackingId}", doc.FileName, trackingId);
                    var watermarkedStream = _watermarkService.ApplyWatermark(outputStream, extension, trackingId);
                    return File(watermarkedStream, doc.ContentType, doc.FileName);
                }

                return File(outputStream, doc.ContentType, doc.FileName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error serving file: {doc.FileName}");
                return StatusCode(500, "Lỗi khi giải mã tài liệu bảo mật");
            }
        }

        private int GetRoleLevel(string role)
        {
            return role switch
            {
                "Giám đốc" => 3,
                "Admin" => 3,
                "Quản lý" => 2,
                "Nhân viên" => 1,
                _ => 1
            };
        }

        [HttpGet("download/{id}")]
        public async Task<IActionResult> DownloadFileByGridFSId(string id)
        {
            if (!ObjectId.TryParse(id, out var fileObjectId))
                return BadRequest("Invalid file ID format");

            try
            {
                using var encryptedStream = await _gridFS.OpenDownloadStreamAsync(fileObjectId);
                var outputStream = new MemoryStream();

                var fileInfo = await _gridFS.Find(Builders<GridFSFileInfo>.Filter.Eq("_id", fileObjectId)).FirstOrDefaultAsync();
                if (fileInfo == null) return NotFound();

                bool isEncrypted = fileInfo.Metadata != null && fileInfo.Metadata.Contains("isEncrypted") && fileInfo.Metadata["isEncrypted"].AsBoolean;

                if (isEncrypted)
                {
                    await _encryptionService.DecryptStreamAsync(encryptedStream, outputStream);
                }
                else
                {
                    await encryptedStream.CopyToAsync(outputStream);
                }

                outputStream.Position = 0;

                // 🛡️ Apply watermark for agent monitoring
                var ext = Path.GetExtension(fileInfo.Filename).ToLowerInvariant();
                if (ext == ".docx" || ext == ".pdf")
                {
                    var trackingId = id;
                    _logger.LogInformation("Applying watermark to {FileName} with tracking ID: {TrackingId}", fileInfo.Filename, trackingId);
                    var watermarkedStream = _watermarkService.ApplyWatermark(outputStream, ext, trackingId);
                    var contentType = fileInfo.Metadata != null && fileInfo.Metadata.Contains("contentType") ? fileInfo.Metadata["contentType"].AsString : "application/octet-stream";
                    return File(watermarkedStream, contentType, fileInfo.Filename);
                }

                return File(outputStream, fileInfo.Metadata != null && fileInfo.Metadata.Contains("contentType") ? fileInfo.Metadata["contentType"].AsString : "application/octet-stream", fileInfo.Filename);
            }
            catch (GridFSFileNotFoundException)
            {
                return NotFound();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error downloading file {id} from GridFS");
                return StatusCode(500, "Internal server error during file retrieval");
            }
        }
    }

    public class UpdatePermissionsRequest
    {
        public string? MinimumRole { get; set; }
        public List<string>? AllowedUserIds { get; set; }
        public List<string>? AllowedDownloadUserIds { get; set; }
        public bool RequireCamera { get; set; } = true;
        public bool RequireWatermark { get; set; } = true;
        public bool EnableAgentMonitoring { get; set; } = true;
        public bool DisableMobileDownload { get; set; } = false;
        public string? Department { get; set; }
        public string? SecurityLevel { get; set; }
    }
}
