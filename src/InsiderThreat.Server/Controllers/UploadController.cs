using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Bson;
using MongoDB.Driver;
using MongoDB.Driver.GridFS;
using InsiderThreat.Server.Services;

namespace InsiderThreat.Server.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class UploadController : ControllerBase
    {
        private readonly IGridFSBucket _gridFS;
        private readonly ILogger<UploadController> _logger;
        private readonly FileEncryptionService _encryptionService;

        public UploadController(IGridFSBucket gridFS, ILogger<UploadController> logger, FileEncryptionService encryptionService)
        {
            _gridFS = gridFS;
            _logger = logger;
            _encryptionService = encryptionService;
        }

        // POST: api/upload
        [HttpPost]
        [DisableRequestSizeLimit] // Cho phép upload file cực lớn
        public async Task<IActionResult> UploadFile(IFormFile file)
        {
            if (file == null || file.Length == 0)
            {
                return BadRequest("No file uploaded");
            }

            try
            {
                _logger.LogInformation($"Uploading file: {file.FileName}, Size: {file.Length} bytes");

                // Đọc file và upload vào GridFS
                using var stream = file.OpenReadStream();
                var options = new GridFSUploadOptions
                {
                    Metadata = new BsonDocument
                    {
                        { "originalName", file.FileName },
                        { "contentType", file.ContentType },
                        { "uploadedAt", DateTime.UtcNow }
                    }
                };

                var fileId = await _gridFS.UploadFromStreamAsync(file.FileName, stream, options);
                
                // Trả về URL để truy cập file sau này
                // Ví dụ: /api/upload/{id}
                var fileUrl = $"/api/upload/{fileId}";

                return Ok(new
                {
                    fileId = fileId.ToString(),
                    url = fileUrl,
                    fileName = file.FileName,
                    contentType = file.ContentType,
                    size = file.Length
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error uploading file");
                return StatusCode(500, new { message = "Upload failed", error = ex.Message });
            }
        }

        // GET: api/upload/{id}
        [HttpGet("{id}")]
        [AllowAnonymous] // Cho phép xem ảnh/video mà không cần token (hoặc có thể thêm Authorize nếu cần mật)
        public async Task<IActionResult> GetFile(string id)
        {
            try
            {
                if (!ObjectId.TryParse(id, out var objectId))
                {
                    return BadRequest("Invalid ID format");
                }

                var stream = await _gridFS.OpenDownloadStreamAsync(objectId);
                var contentType = stream.FileInfo.Metadata.Contains("contentType") 
                    ? stream.FileInfo.Metadata["contentType"].AsString 
                    : "application/octet-stream";

                bool isEncrypted = stream.FileInfo.Metadata != null && stream.FileInfo.Metadata.Contains("isEncrypted") && stream.FileInfo.Metadata["isEncrypted"].AsBoolean;

                if (isEncrypted)
                {
                    var decryptedStream = new MemoryStream();
                    await _encryptionService.DecryptStreamAsync(stream, decryptedStream);
                    decryptedStream.Position = 0;
                    return File(decryptedStream, contentType, stream.FileInfo.Filename);
                }

                return File(stream, contentType, stream.FileInfo.Filename);
            }
            catch (GridFSFileNotFoundException)
            {
                return NotFound();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error serving file {id}");
                return StatusCode(500, ex.Message);
            }
        }

        // GET: api/upload/download/{fileId}?originalName=filename.ext
        // Trả về file để download (với content-disposition attachment)
        [HttpGet("download/{fileId}")]
        [AllowAnonymous]
        public async Task<IActionResult> DownloadFile(string fileId, [FromQuery] string? originalName, [FromQuery] string? downloaderName)
        {
            try
            {
                if (!ObjectId.TryParse(fileId, out var objectId))
                    return BadRequest(new { message = "Invalid file ID" });

                var filter = Builders<GridFSFileInfo>.Filter.Eq("_id", objectId);
                var cursor = await _gridFS.FindAsync(filter);
                var fileInfo = await cursor.FirstOrDefaultAsync();

                if (fileInfo == null)
                    return NotFound(new { message = "File not found" });

                var contentType = fileInfo.Metadata?.GetValue("contentType", new BsonString("application/octet-stream")).AsString
                                  ?? "application/octet-stream";

                var downloadName = originalName
                                   ?? fileInfo.Metadata?.GetValue("originalName", new BsonString(fileInfo.Filename)).AsString
                                   ?? fileInfo.Filename;

                _logger.LogInformation($"Download file {fileId} as '{downloadName}' by '{downloaderName ?? "unknown"}'");

                var downloadStream = await _gridFS.OpenDownloadStreamAsync(objectId);
                bool isEncrypted = fileInfo.Metadata != null && fileInfo.Metadata.Contains("isEncrypted") && fileInfo.Metadata["isEncrypted"].AsBoolean;

                if (isEncrypted)
                {
                    var decryptedStream = new MemoryStream();
                    await _encryptionService.DecryptStreamAsync(downloadStream, decryptedStream);
                    decryptedStream.Position = 0;
                    return File(decryptedStream, contentType, fileDownloadName: downloadName);
                }

                return File(downloadStream, contentType, fileDownloadName: downloadName);
            }
            catch (GridFSFileNotFoundException)
            {
                return NotFound(new { message = "File not found" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error downloading file {fileId}");
                return StatusCode(500, new { message = "Internal server error", error = ex.Message });
            }
        }
    }
}

