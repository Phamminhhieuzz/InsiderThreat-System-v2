using InsiderThreat.Shared;
using Newtonsoft.Json;
using System.Net.Http;
using System.Collections.Generic;
using System.Drawing;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Windows.Forms;
using System;
using Microsoft.Extensions.Configuration;
using System.IO;

namespace InsiderThreat.AdminApp
{
    public partial class Form1 : Form
    {
        // ✅ AdminApp chạy trên máy Windows của Admin, kết nối về Server Production
        // URL sẽ được load từ file appsettings.json (ưu tiên)
        private string _apiUrl = "http://localhost:5038/api/logs";

        private readonly HttpClient _client = new HttpClient();

        public Form1()
        {
            InitializeComponent();

            // 🛡️ BẢO MẬT: Chống quay màn hình và truy cập từ xa (UltraView/TeamViewer)
            // Cửa sổ ứng dụng sẽ hiện màu đen trong các bản chụp hoặc quay phim.
            NativeMethods.SetWindowDisplayAffinity(this.Handle, NativeMethods.WDA_MONITOR);

            LoadConfiguration();
            SetupCustomGrid();
        }

        private void LoadConfiguration()
        {
            try
            {
                var builder = new ConfigurationBuilder()
                    .AddJsonFile("appsettings.json", optional: true, reloadOnChange: true);

                IConfiguration config = builder.Build();
                string? url = config["AdminConfig:ServerUrl"];
                if (!string.IsNullOrEmpty(url))
                {
                    _apiUrl = url;
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Lỗi đọc file cấu hình: " + ex.Message);
            }
        }

        private void SetupCustomGrid()
        {
            this.Text = "🛡️ INSIDER THREAT MONITORING CENTER";
            this.Size = new Size(1000, 600);

            // Cấu hình bảng Alerts
            dgvLogs.AutoGenerateColumns = true;
            dgvLogs.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
            dgvLogs.ReadOnly = true;
            dgvLogs.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            dgvLogs.AllowUserToAddRows = false;
            dgvLogs.RowHeadersVisible = false;

            // Cấu hình bảng Blocked Devices
            SetupBlockedDevicesGrid();

            // Cấu hình bảng Whitelist
            SetupWhitelistGrid();

            // Gắn sự kiện cho Timer
            tmrUpdate.Tick += async (s, e) => await RefreshAllData();
            tmrUpdate.Start();
        }

        private void SetupBlockedDevicesGrid()
        {
            dgvBlockedDevices.AutoGenerateColumns = false;
            dgvBlockedDevices.AllowUserToAddRows = false;
            dgvBlockedDevices.ReadOnly = true;
            dgvBlockedDevices.SelectionMode = DataGridViewSelectionMode.FullRowSelect;

            dgvBlockedDevices.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Device Name", DataPropertyName = "DeviceName", Width = 250 });
            dgvBlockedDevices.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "VID/PID", DataPropertyName = "VidPid", Width = 200 });
            dgvBlockedDevices.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Full DeviceId", DataPropertyName = "DeviceId", Width = 200 });
            dgvBlockedDevices.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Time", DataPropertyName = "Timestamp", Width = 150 });

            var btnApprove = new DataGridViewButtonColumn { HeaderText = "Action", Text = "✅ Approve", UseColumnTextForButtonValue = true, Width = 100 };
            dgvBlockedDevices.Columns.Add(btnApprove);
            dgvBlockedDevices.CellClick += DgvBlockedDevices_CellClick;
        }

        private void SetupWhitelistGrid()
        {
            dgvWhitelist.AutoGenerateColumns = false;
            dgvWhitelist.AllowUserToAddRows = false;
            dgvWhitelist.ReadOnly = true;
            dgvWhitelist.SelectionMode = DataGridViewSelectionMode.FullRowSelect;

            dgvWhitelist.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "ID", DataPropertyName = "Id", Visible = false });
            dgvWhitelist.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Name", DataPropertyName = "Name", Width = 200 });
            dgvWhitelist.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "DeviceId", DataPropertyName = "DeviceId", Width = 350 });
            dgvWhitelist.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Added", DataPropertyName = "CreatedAt", Width = 150 });

            var btnRemove = new DataGridViewButtonColumn { HeaderText = "Action", Text = "❌ Remove", UseColumnTextForButtonValue = true, Width = 100 };
            dgvWhitelist.Columns.Add(btnRemove);
            dgvWhitelist.CellClick += DgvWhitelist_CellClick;
        }

        private async Task RefreshAllData()
        {
            await LoadLogs();
            await LoadBlockedDevices();
            await LoadWhitelist();
        }

        private async Task LoadLogs()
        {
            try
            {
                var response = await _client.GetAsync(_apiUrl);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync();
                    var logs = JsonConvert.DeserializeObject<List<LogEntry>>(json);
                    dgvLogs.DataSource = logs;
                    HighlightThreats();
                    this.Text = $"🛡️ MONITORING - Cập nhật lúc: {DateTime.Now.ToString("HH:mm:ss")}";
                }
            }
            catch { this.Text = "⚠️ MẤT KẾT NỐI SERVER!"; }
        }

        private async Task LoadBlockedDevices()
        {
            try
            {
                var baseUrl = _apiUrl.Replace("/api/logs", "");

                // Load logs
                var logsResponse = await _client.GetAsync($"{baseUrl}/api/logs");
                // Load whitelist
                var whitelistResponse = await _client.GetAsync($"{baseUrl}/api/devices");

                if (logsResponse.IsSuccessStatusCode && whitelistResponse.IsSuccessStatusCode)
                {
                    var logsJson = await logsResponse.Content.ReadAsStringAsync();
                    var whitelistJson = await whitelistResponse.Content.ReadAsStringAsync();

                    var allLogs = JsonConvert.DeserializeObject<List<LogEntry>>(logsJson);
                    var whitelist = JsonConvert.DeserializeObject<List<Device>>(whitelistJson) ?? new List<Device>();

                    // Extract VID/PID from whitelist for comparison
                    var whitelistedVidPids = whitelist.Select(d => ExtractVidPidFromDeviceId(d.DeviceId)).ToHashSet();

                    var blocked = allLogs?
                        .Where(l => l.LogType == "USB_INSERT" && l.Severity == "Critical" && !string.IsNullOrEmpty(l.DeviceId))
                        .Select(l => new
                        {
                            DeviceName = l.DeviceName ?? "Unknown Device",
                            DeviceId = l.DeviceId!,
                            Timestamp = l.Timestamp,
                            VidPid = ExtractVidPidFromDeviceId(l.DeviceId!)
                        })
                        .Where(d => !whitelistedVidPids.Contains(d.VidPid)) // Filter out whitelisted
                        .GroupBy(d => d.VidPid) // Deduplicate by VID/PID
                        .Select(g => g.OrderByDescending(x => x.Timestamp).First()) // Get most recent
                        .OrderByDescending(d => d.Timestamp)
                        .Take(10) // Limit to 10 most recent
                        .ToList();

                    dgvBlockedDevices.DataSource = blocked;
                }
            }
            catch { }
        }

        private async Task LoadWhitelist()
        {
            try
            {
                var baseUrl = _apiUrl.Replace("/api/logs", "");
                var response = await _client.GetAsync($"{baseUrl}/api/devices");
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync();
                    var devices = JsonConvert.DeserializeObject<List<Device>>(json);
                    dgvWhitelist.DataSource = devices;
                }
            }
            catch { }
        }

        private string ExtractDeviceName(string message)
        {
            // "BLOCKED USB Device: USB Input (USB\VID...)"
            var parts = message.Split('(');
            return parts.Length > 0 ? parts[0].Replace("BLOCKED USB Device:", "").Trim() : "Unknown";
        }

        private string ExtractDeviceId(string message)
        {
            try
            {
                var start = message.IndexOf('(');
                var end = message.IndexOf(')');
                if (start >= 0 && end > start)
                {
                    var deviceId = message.Substring(start + 1, end - start - 1);
                    return string.IsNullOrWhiteSpace(deviceId) ? "Unknown" : deviceId;
                }
            }
            catch { }
            return "Unknown";
        }

        private string ExtractVidPidFromDeviceId(string deviceId)
        {
            // Extract VID_XXXX&PID_YYYY from full DeviceId
            var match = System.Text.RegularExpressions.Regex.Match(deviceId, @"VID_[0-9A-F]{4}&PID_[0-9A-F]{4}", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            return match.Success ? match.Value : deviceId;
        }

        private async void DgvBlockedDevices_CellClick(object? sender, DataGridViewCellEventArgs e)
        {
            if (e.RowIndex < 0 || e.ColumnIndex != 4) return; // Column 4 is Approve button (0=Name, 1=VidPid, 2=DeviceId, 3=Time, 4=Action)

            var row = dgvBlockedDevices.Rows[e.RowIndex];
            var deviceId = row.Cells[2].Value?.ToString();  // Column 2 = Full DeviceId
            var deviceName = row.Cells[0].Value?.ToString(); // Column 0 = DeviceName

            if (string.IsNullOrEmpty(deviceId)) return;

            var result = MessageBox.Show($"Approve device '{deviceName}'?", "Confirm", MessageBoxButtons.YesNo);
            if (result == DialogResult.Yes)
            {
                await ApproveDevice(deviceName ?? "Unknown", deviceId);
            }
        }

        private async void DgvWhitelist_CellClick(object? sender, DataGridViewCellEventArgs e)
        {
            if (e.RowIndex < 0 || e.ColumnIndex != 4) return; // Column 4 is Remove button

            var row = dgvWhitelist.Rows[e.RowIndex];
            var deviceId = row.Cells[0].Value?.ToString(); // Hidden ID column
            var deviceName = row.Cells[1].Value?.ToString();

            if (string.IsNullOrEmpty(deviceId)) return;

            var result = MessageBox.Show($"Remove '{deviceName}' from whitelist?", "Confirm", MessageBoxButtons.YesNo);
            if (result == DialogResult.Yes)
            {
                await RemoveDevice(deviceId);
            }
        }

        private async Task ApproveDevice(string name, string deviceId)
        {
            try
            {
                var baseUrl = _apiUrl.Replace("/api/logs", "");
                var device = new Device { Name = name, DeviceId = deviceId, IsAllowed = true };
                var json = JsonConvert.SerializeObject(device);
                var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
                var response = await _client.PostAsync($"{baseUrl}/api/devices", content);

                if (response.IsSuccessStatusCode)
                {
                    MessageBox.Show("Device approved!");
                    await RefreshAllData();
                }
                else
                {
                    MessageBox.Show("Failed to approve device.");
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Error: " + ex.Message);
            }
        }

        private async Task RemoveDevice(string id)
        {
            try
            {
                var baseUrl = _apiUrl.Replace("/api/logs", "");
                var response = await _client.DeleteAsync($"{baseUrl}/api/devices/{id}");

                if (response.IsSuccessStatusCode)
                {
                    MessageBox.Show("Device removed from whitelist!");
                    await RefreshAllData();
                }
                else
                {
                    MessageBox.Show("Failed to remove device.");
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Error: " + ex.Message);
            }
        }

        private void HighlightThreats()
        {
            foreach (DataGridViewRow row in dgvLogs.Rows)
            {
                // Lấy đối tượng Log của dòng hiện tại
                var log = row.DataBoundItem as LogEntry;
                if (log == null) continue;

                if (log.LogType == "USB_INSERT" || log.Severity == "Warning")
                {
                    row.DefaultCellStyle.BackColor = Color.OrangeRed;
                    row.DefaultCellStyle.ForeColor = Color.White;
                }
                else if (log.Severity == "Critical")
                {
                    row.DefaultCellStyle.BackColor = Color.DarkRed;
                    row.DefaultCellStyle.ForeColor = Color.Yellow;
                    row.DefaultCellStyle.Font = new Font(dgvLogs.Font, FontStyle.Bold);
                }
            }
        }
    }
}
