using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using MongoDB.Driver;
using InsiderThreat.Shared;
using InsiderThreat.Server.Hubs;

namespace InsiderThreat.Server.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class DevicesController : ControllerBase
    {
        private readonly IMongoCollection<Device> _devices;
        private readonly IHubContext<SystemHub> _hubContext;
        private readonly ILogger<DevicesController> _logger;

        public DevicesController(IMongoDatabase database, IHubContext<SystemHub> hubContext, ILogger<DevicesController> logger)
        {
            _devices = database.GetCollection<Device>("Devices");
            _hubContext = hubContext;
            _logger = logger;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<Device>>> GetDevices()
        {
            var devices = await _devices.Find(_ => true).ToListAsync();
            return Ok(devices);
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<Device>> GetDevice(string id)
        {
            var device = await _devices.Find(d => d.Id == id).FirstOrDefaultAsync();
            if (device == null) return NotFound();
            return Ok(device);
        }

        /// <summary>
        /// Endpoint cho ClientAgent kiểm tra whitelist (không cần JWT).
        /// Agent gọi: GET /api/devices/check?deviceId=USB\VID_XXXX&PID_YYYY
        /// Trả về 200 nếu được phép, 404 nếu bị chặn.
        /// </summary>
        [AllowAnonymous]
        [HttpGet("check")]
        public async Task<IActionResult> CheckDevice([FromQuery] string deviceId)
        {
            if (string.IsNullOrEmpty(deviceId))
                return BadRequest(new { message = "deviceId is required" });

            var decodedId = Uri.UnescapeDataString(deviceId);
            _logger.LogInformation("Checking whitelist for device: {DeviceId}", decodedId);

            var device = await _devices.Find(d => 
                d.DeviceId == decodedId && d.IsAllowed == true
            ).FirstOrDefaultAsync();

            if (device != null)
            {
                _logger.LogInformation("Device {DeviceId} is ALLOWED", decodedId);
                return Ok(new { allowed = true, deviceName = device.Name });
            }

            _logger.LogWarning("Device {DeviceId} is NOT in whitelist", decodedId);
            return NotFound(new { allowed = false });
        }

        [HttpPost]
        public async Task<ActionResult<Device>> RegisterDevice([FromBody] Device device)
        {
            device.CreatedAt = DateTime.Now;
            await _devices.InsertOneAsync(device);

            _logger.LogInformation("Device approved: {DeviceName} ({DeviceId})", device.Name, device.DeviceId);

            // Broadcast cho tất cả Admin biết thiết bị đã được phê duyệt
            await _hubContext.Clients.All.SendAsync("DeviceApproved", new
            {
                deviceId = device.DeviceId,
                deviceName = device.Name,
                timestamp = device.CreatedAt
            });

            return CreatedAtAction(nameof(GetDevice), new { id = device.Id }, device);
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteDevice(string id)
        {
            var result = await _devices.DeleteOneAsync(d => d.Id == id);
            if (result.DeletedCount == 0) return NotFound();
            return Ok(new { message = "Device removed from whitelist" });
        }
    }
}
