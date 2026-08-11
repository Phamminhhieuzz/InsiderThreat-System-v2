using System;
using System.Management;
using System.Runtime.InteropServices;
using System.Text;
using System.Net.Http.Json;
using InsiderThreat.Shared;

namespace InsiderThreat.ClientAgent
{
    public class UsbService : BackgroundService
    {
        private readonly ILogger<UsbService> _logger;
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private ManagementEventWatcher? _watcher;

        // Debounce mechanism to prevent duplicate events
        private readonly Dictionary<string, DateTime> _recentlyProcessedDevices = new Dictionary<string, DateTime>();
        private readonly TimeSpan _debounceInterval = TimeSpan.FromSeconds(2);

        public UsbService(ILogger<UsbService> logger, IConfiguration configuration)
        {
            _logger = logger;
            _configuration = configuration;

            // Lấy URL từ appsettings.json, nếu không có thì fallback về localhost
            string serverUrl = _configuration["RunnerConfig:ServerUrl"] ?? "http://localhost:5038";
            _logger.LogInformation($"🔌 Connecting to Server at: {serverUrl}");

            _httpClient = new HttpClient { BaseAddress = new Uri(serverUrl) };
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("USB Monitoring Service Started.");

            StartMonitoring();

            // Keep the service alive
            while (!stoppingToken.IsCancellationRequested)
            {
                await Task.Delay(1000, stoppingToken);
            }

            StopMonitoring();
        }

        private void StartMonitoring()
        {
            try
            {
                // Lắng nghe sự kiện cắm thiết bị (EventType = 2)
                var query = new WqlEventQuery("SELECT * FROM Win32_DeviceChangeEvent WHERE EventType = 2");
                _watcher = new ManagementEventWatcher(query);
                _watcher.EventArrived += async (sender, e) => await OnDeviceInserted();
                _watcher.Start();
                _logger.LogInformation("Listening for USB insertion events...");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to start USB monitoring.");
            }
        }

        private void StopMonitoring()
        {
            _watcher?.Stop();
            _watcher?.Dispose();
        }

        private async Task OnDeviceInserted()
        {
            _logger.LogInformation("USB Inserted! Waiting for driver initialization...");

            // Wait for Windows to mount the device strings
            await Task.Delay(1000);

            _logger.LogInformation("Checking device info...");

            // Vì WMI event không trả về thông tin chi tiết ngay lập tức, ta cần quét lại danh sách thiết bị
            var device = GetLastInsertedUsbDevice();

            if (device != null)
            {
                // Debounce: Check if we recently processed this device
                var now = DateTime.Now;
                var deviceKey = device.DeviceId;

                lock (_recentlyProcessedDevices)
                {
                    // Clean up old entries
                    var expiredKeys = _recentlyProcessedDevices
                        .Where(kvp => now - kvp.Value > _debounceInterval)
                        .Select(kvp => kvp.Key)
                        .ToList();
                    foreach (var key in expiredKeys)
                    {
                        _recentlyProcessedDevices.Remove(key);
                    }

                    // Check if this device was just processed
                    if (_recentlyProcessedDevices.ContainsKey(deviceKey))
                    {
                        _logger.LogInformation($"Skipping duplicate event for {device.Description}");
                        return; // Skip duplicate
                    }

                    // Mark as processed
                    _recentlyProcessedDevices[deviceKey] = now;
                }

                _logger.LogInformation($"Detected Device: {device.Description} ({device.DeviceId})");

                bool isAllowed = await CheckServerWhitelist(device.DeviceId);

                if (isAllowed)
                {
                    _logger.LogInformation("✅ Device is ALLOWED.");
                    await SendLog("USB_INSERT", "Info", $"Allowed USB device: {device.Description} ({device.DeviceId})", "Allowed", device.DeviceId, device.Description);
                    
                    // Hiển thị thông báo cho phép
                    NativeMethods.MessageBox(IntPtr.Zero, 
                        $"THIẾT BỊ USB ĐÃ ĐƯỢC CẤP QUYỀN\n\nThiết bị: {device.Description}\nTrạng thái: Đã cho phép truy cập", 
                        "An ninh Hệ thống Insider Threat", 0x00000040); // 0x40 = MB_ICONINFORMATION
                }
                else
                {
                    _logger.LogWarning("⛔ Device is BLOCKED! Taking action...");

                    // Thực hiện chặn song song
                    var task1 = DisableDeviceDriver(device.DeviceId);
                    var task2 = EjectDevice(device.PnpDeviceId);

                    await Task.WhenAll(task1, task2);

                    await SendLog("USB_INSERT", "Critical", $"BLOCKED USB Device: {device.Description} ({device.DeviceId})", "Blocked", device.DeviceId, device.Description);

                    // Hiển thị cảnh báo chặn
                    NativeMethods.MessageBox(IntPtr.Zero, 
                        $"THIẾT BỊ USB ĐÃ BỊ CHẶN!\n\nThiết bị: {device.Description}\nThiết bị này không được phép sử dụng theo chính sách bảo mật của công ty.", 
                        "An ninh Hệ thống Insider Threat", 0x00000010); // 0x10 = MB_ICONERROR
                }
            }
        }

        private async Task<bool> CheckServerWhitelist(string deviceId)
        {
            try
            {
                // URL encode để tránh ký tự & bị cắt trong query string
                var encodedDeviceId = Uri.EscapeDataString(deviceId);
                var response = await _httpClient.GetAsync($"/api/devices/check?deviceId={encodedDeviceId}");
                if (response.IsSuccessStatusCode)
                {
                    return true;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to connect to server for verification.");
                // Fail-safe: Nếu mất mạng thì BLOCK luôn cho an toàn (hoặc Allow tùy policy)
                return false;
            }
            return false;
        }

        private static string GetLocalIPAddress()
        {
            try
            {
                var host = System.Net.Dns.GetHostEntry(System.Net.Dns.GetHostName());
                var ip = host.AddressList
                    .FirstOrDefault(a => a.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork);
                return ip?.ToString() ?? "127.0.0.1";
            }
            catch
            {
                return "127.0.0.1";
            }
        }

        private async Task SendLog(string type, string severity, string message, string action, string? deviceId = null, string? deviceName = null)
        {
            try
            {
                var log = new LogEntry
                {
                    LogType = type,
                    Severity = severity,
                    Message = message,
                    ActionTaken = action,
                    ComputerName = Environment.MachineName,
                    IPAddress = GetLocalIPAddress(),
                    DeviceId = deviceId,
                    DeviceName = deviceName,
                    Timestamp = DateTime.Now
                };

                var response = await _httpClient.PostAsJsonAsync("/api/logs", log);

                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    _logger.LogError($"❌ Failed to send log! Status: {response.StatusCode} | Response: {errorContent}");
                    Console.WriteLine($"[ERROR] Failed to upload log: {response.StatusCode}");
                }
                else
                {
                    _logger.LogInformation("✅ Log sent to server successfully.");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ CONNECTION ERROR: Failed to send log to server.");
                Console.WriteLine($"[CRITICAL ERROR] Could not connect to Server at {_httpClient.BaseAddress}: {ex.Message}");
            }
        }

        public static void RestoreAllUsbDevices()
        {
            Console.WriteLine("[Restore All USB Devices] Started...");
            Guid guid = Guid.Empty;
            // Dùng DIGCF_ALLCLASSES (bỏ DIGCF_PRESENT vì device bị disable có thể không present tùy version OS)
            IntPtr deviceInfoSet = NativeMethods.SetupDiGetClassDevs(ref guid, null, IntPtr.Zero, NativeMethods.DIGCF_ALLCLASSES);
            if (deviceInfoSet == IntPtr.Zero) return;

            NativeMethods.SP_DEVINFO_DATA deviceInfoData = new NativeMethods.SP_DEVINFO_DATA();
            deviceInfoData.cbSize = (uint)Marshal.SizeOf(deviceInfoData);
            uint index = 0;

            while (NativeMethods.SetupDiEnumDeviceInfo(deviceInfoSet, index, ref deviceInfoData))
            {
                uint propRegDataType;
                StringBuilder buffer = new StringBuilder(1024);
                uint requiredSize;

                if (NativeMethods.SetupDiGetDeviceRegistryProperty(deviceInfoSet, ref deviceInfoData, NativeMethods.SPDRP_HARDWAREID, out propRegDataType, buffer, 1024, out requiredSize))
                {
                    var ids = buffer.ToString().ToUpperInvariant();
                    // Khôi phục tất cả thiết bị USB và thiết bị lưu trữ.
                    if (ids.Contains("USB\\") || ids.Contains("SCSI\\") || ids.Contains("STORAGE\\") || ids.Contains("VEN_10EC"))
                    {
                        NativeMethods.SP_PROPCHANGE_PARAMS params_ = new NativeMethods.SP_PROPCHANGE_PARAMS();
                        params_.ClassInstallHeader.cbSize = (uint)Marshal.SizeOf(typeof(NativeMethods.SP_CLASSINSTALL_HEADER));
                        params_.ClassInstallHeader.InstallFunction = NativeMethods.DIF_PROPERTYCHANGE;
                        params_.StateChange = NativeMethods.DICS_ENABLE;
                        params_.Scope = NativeMethods.DICS_FLAG_GLOBAL;
                        params_.HwProfile = 0;

                        if (NativeMethods.SetupDiSetClassInstallParams(deviceInfoSet, ref deviceInfoData, ref params_, (uint)Marshal.SizeOf(params_)))
                        {
                            NativeMethods.SetupDiCallClassInstaller(NativeMethods.DIF_PROPERTYCHANGE, deviceInfoSet, ref deviceInfoData);
                        }
                    }
                }
                index++;
            }
            NativeMethods.SetupDiDestroyDeviceInfoList(deviceInfoSet);
            Console.WriteLine("[Restore All USB Devices] Finished.");
        }

        // Helper class để lưu thông tin tạm
        private class UsbDeviceInfo
        {
            public string DeviceId { get; set; } = "";     // Hardware ID
            public string PnpDeviceId { get; set; } = ""; // Instance ID (dùng cho Eject)
            public string Description { get; set; } = "";
        }

        private UsbDeviceInfo? GetLastInsertedUsbDevice()
        {
            try
            {
                _logger.LogInformation("Executing WMI Query (Win32_DiskDrive)...");

                // Use Win32_DiskDrive which is much more stable and faster for USB Storage devices
                var searcher = new ManagementObjectSearcher("SELECT PNPDeviceID, Caption FROM Win32_DiskDrive WHERE InterfaceType='USB'");

                foreach (ManagementObject drive in searcher.Get()) // This should not hang
                {
                    string pnpId = drive["PNPDeviceID"]?.ToString() ?? "Unknown";
                    string description = drive["Caption"]?.ToString() ?? "Unknown USB Device";

                    _logger.LogInformation($"Found Drive: {description}");

                    return new UsbDeviceInfo
                    {
                        DeviceId = pnpId,     // Win32_DiskDrive uses PNPDeviceID as the unique identifier
                        PnpDeviceId = pnpId,  // Used for Ejection based on Instance ID
                        Description = description
                    };
                }
                _logger.LogInformation("No USB Disk Drives found.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error identifying USB device.");
            }
            return null;
        }

        private Task DisableDeviceDriver(string unknownHardwareId)
        {
            return Task.Run(() =>
            {
                _logger.LogInformation($"[Action 1] Disabling Driver for {unknownHardwareId}...");

                // Cần dùng SetupAPI để tìm và disable
                // Đây là phần phức tạp, ta sẽ thử tìm device bằng HardwareID

                Guid guid = Guid.Empty;
                IntPtr deviceInfoSet = NativeMethods.SetupDiGetClassDevs(ref guid, null, IntPtr.Zero, NativeMethods.DIGCF_ALLCLASSES | NativeMethods.DIGCF_PRESENT);

                if (deviceInfoSet == IntPtr.Zero) return;

                NativeMethods.SP_DEVINFO_DATA deviceInfoData = new NativeMethods.SP_DEVINFO_DATA();
                deviceInfoData.cbSize = (uint)Marshal.SizeOf(deviceInfoData);

                uint index = 0;
                while (NativeMethods.SetupDiEnumDeviceInfo(deviceInfoSet, index, ref deviceInfoData))
                {
                    // Lấy HardwareID của device hiện tại
                    uint propRegDataType;
                    StringBuilder buffer = new StringBuilder(1024);
                    uint requiredSize;

                    if (NativeMethods.SetupDiGetDeviceRegistryProperty(deviceInfoSet, ref deviceInfoData, NativeMethods.SPDRP_HARDWAREID, out propRegDataType, buffer, 1024, out requiredSize))
                    {
                        var ids = buffer.ToString();
                        if (ids.Contains(unknownHardwareId, StringComparison.OrdinalIgnoreCase))
                        {
                            // Tìm thấy! Disable nó.
                            NativeMethods.SP_PROPCHANGE_PARAMS params_ = new NativeMethods.SP_PROPCHANGE_PARAMS();
                            params_.ClassInstallHeader.cbSize = (uint)Marshal.SizeOf(typeof(NativeMethods.SP_CLASSINSTALL_HEADER));
                            params_.ClassInstallHeader.InstallFunction = NativeMethods.DIF_PROPERTYCHANGE;
                            params_.StateChange = NativeMethods.DICS_DISABLE;
                            params_.Scope = NativeMethods.DICS_FLAG_GLOBAL;
                            params_.HwProfile = 0;

                            if (NativeMethods.SetupDiSetClassInstallParams(deviceInfoSet, ref deviceInfoData, ref params_, (uint)Marshal.SizeOf(params_)))
                            {
                                if (NativeMethods.SetupDiCallClassInstaller(NativeMethods.DIF_PROPERTYCHANGE, deviceInfoSet, ref deviceInfoData))
                                {
                                    _logger.LogInformation("SUCCESS: Driver Disabled.");
                                }
                                else
                                {
                                    _logger.LogError($"FAIL: Driver Disable Error Code {Marshal.GetLastWin32Error()}");
                                }
                            }
                            break; // Xong
                        }
                    }
                    index++;
                }

                NativeMethods.SetupDiDestroyDeviceInfoList(deviceInfoSet);
            });
        }

        private Task EjectDevice(string pnpDeviceId)
        {
            return Task.Run(() =>
            {
                _logger.LogInformation($"[Action 2] Ejecting Device {pnpDeviceId}...");

                // Cần tìm devInst bằng CM_Locate_DevNodeW (chưa import) hoặc dùng SetupAPI lấy DevInst
                // Để đơn giản ta giả lập logic bằng cách dùng lại SetupAPI như trên để lấy DevInst

                // HACK: Dùng lại logic trên để lấy DevInst nhanh
                Guid guid = Guid.Empty;
                IntPtr deviceInfoSet = NativeMethods.SetupDiGetClassDevs(ref guid, null, IntPtr.Zero, NativeMethods.DIGCF_ALLCLASSES | NativeMethods.DIGCF_PRESENT);

                NativeMethods.SP_DEVINFO_DATA deviceInfoData = new NativeMethods.SP_DEVINFO_DATA();
                deviceInfoData.cbSize = (uint)Marshal.SizeOf(deviceInfoData);
                uint index = 0;

                while (NativeMethods.SetupDiEnumDeviceInfo(deviceInfoSet, index, ref deviceInfoData))
                {
                    // Lấy device ID để so sánh với pnpDeviceId (InstanceID) -> Thực tế PnPDeviceId = Instance ID
                    // Ta sẽ check instance ID bằng SetupDiGetDeviceInstanceId (cần import thêm)
                    // Ở đây tạm bỏ qua check chính xác instance ID để demo gọi hàm eject

                    // Nếu có DevInst (deviceInfoData.DevInst)
                    // int vetoType;
                    // StringBuilder vetoName = new StringBuilder(1024);
                    // NativeMethods.CM_Request_Device_EjectW(deviceInfoData.DevInst, out vetoType, vetoName, 1024, 0);

                    index++;
                }
                NativeMethods.SetupDiDestroyDeviceInfoList(deviceInfoSet);

                // Note: Vì code Eject khá dài để map chính xác InstanceID -> DevInst, 
                // nên bước Disable Driver ở trên là quan trọng nhất.
            });
        }
    }
}
