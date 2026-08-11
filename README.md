# InsiderThreat System

Hệ thống mạng xã hội nội bộ kết hợp giám sát và ngăn chặn rò rỉ dữ liệu (chụp màn hình, thiết bị ghi hình, USB) cho doanh nghiệp, gồm Web API (.NET 8), giao diện web (React/Vite), và các agent nền chạy trên máy nhân viên (Windows).

**Đang chạy tại:**
- 🌐 Web: https://insiderthreat-web.onrender.com
- 🔌 API: https://insiderthreat-system.onrender.com

---

## Kiến trúc

```
                    ┌─────────────────────────┐
                    │  MongoDB Atlas (cloud)   │
                    └───────────▲──────────────┘
                                │
┌───────────────────┐   ┌──────┴───────────────┐   ┌──────────────────┐
│  InsiderThreat.Web  │──▶│  InsiderThreat.Server │──▶│  Telegram Bot API │
│  (React + Vite)     │   │  (ASP.NET Core 8)     │   │  (gửi mã OTP)      │
│  Render Static Site │   │  Render Web Service    │   └──────────────────┘
└───────────────────┘   └──────┬───────────────┘
                                │ (tùy chọn, dự phòng)
                    ┌───────────▼──────────────┐
                    │  SMTP / Brevo / Mailjet   │
                    └───────────────────────────┘
```

| Thư mục | Vai trò |
|---|---|
| `src/InsiderThreat.Server` | Web API — auth, mạng xã hội nội bộ, chat E2EE, quản lý tài liệu, logs bảo mật |
| `src/InsiderThreat.Web` | Giao diện web (React + Vite + TypeScript), đóng gói thêm bản desktop bằng Tauri |
| `src/InsiderThreat.Shared` | Model dùng chung giữa các project .NET |
| `src/InsiderThreat.ClientAgent` | Dịch vụ nền chạy trên máy nhân viên (Windows) — chặn/giám sát thiết bị USB |
| `src/InsiderThreat.MonitorAgent` | Dịch vụ nền giám sát hoạt động máy trạm |
| `src/InsiderThreat.Watchdog` | Dịch vụ giám sát, đảm bảo các agent trên luôn hoạt động |
| `src/InsiderThreat.AdminApp` | Ứng dụng WinForms hỗ trợ quản trị cục bộ |

---

## Tính năng chính

- **Đăng nhập & bảo mật:** JWT, đăng nhập bằng khuôn mặt (face-api.js), quên mật khẩu qua **OTP gửi vào Telegram** (dự phòng bằng email nếu chưa liên kết Telegram)
- **Mạng xã hội nội bộ:** đăng bài, nhóm/dự án, chấm công, chat mã hoá đầu-cuối
- **Bảo vệ tài liệu:** xem tài liệu qua lớp bảo vệ AI — camera tự nhận diện điện thoại/thiết bị ghi hình để tự động làm mờ tài liệu, phát hiện hành vi chụp màn hình (Print Screen, mất tiêu điểm cửa sổ), watermark động (IP + thời gian + người xem)
- **Giám sát nội bộ:** theo dõi thiết bị USB, log truy cập tài liệu, nhật ký hoạt động

---

## CI/CD

Mỗi lần push lên `main`, GitHub Actions (`.github/workflows/ci-cd.yml`) chạy tuần tự:

```
Build backend (.NET) ─┐
Build frontend (Vite) ─┼─► Secret scan (Gitleaks) ─► CodeQL (C# + JS/TS) ─► Deploy lên Render
```

Chỉ khi **tất cả** bước trên pass, job cuối mới gọi Render Deploy Hook để triển khai — code lỗi hoặc dính secret sẽ không bao giờ lên production. Render **không còn Auto-Deploy độc lập**; việc deploy hoàn toàn do pipeline này quyết định.

---

## Chạy trên máy (môi trường phát triển)

### Yêu cầu
- **Node.js** 20.x trở lên
- **.NET 8 SDK**
- **MongoDB** (chạy cục bộ, hoặc dùng connection string MongoDB Atlas)

### 1. Clone repository
```bash
git clone https://github.com/Phamminhhieuzz/InsiderThreat-System.git
cd InsiderThreat-System
```

### 2. Chạy Backend
```bash
cd src/InsiderThreat.Server
dotnet restore
dotnet run
```
Mặc định chạy tại `http://localhost:5038`.

Cấu hình qua biến môi trường (khuyên dùng, thay vì sửa trực tiếp `appsettings.json`):

| Biến | Bắt buộc | Mô tả |
|---|---|---|
| `MONGODB_CONNECTION_STRING` | ✅ | Chuỗi kết nối MongoDB |
| `JWT_SECRET_KEY` | ✅ | Khoá ký JWT, tối thiểu 32 ký tự ngẫu nhiên |
| `CORS_ALLOWED_ORIGINS` | Khi có domain frontend riêng | Danh sách origin được phép gọi API, cách nhau bằng dấu phẩy |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | Để dùng OTP qua Telegram | Token/username bot lấy từ @BotFather |
| `SMTP_FROM_EMAIL`, `SMTP_PASSWORD` hoặc `BREVO_API_KEY` / `MAILJET_API_KEY`+`MAILJET_SECRET_KEY` | Dự phòng khi chưa liên kết Telegram | Đường gửi OTP qua email |

### 3. Chạy Frontend
Mở terminal khác:
```bash
cd src/InsiderThreat.Web
npm install
npm run dev
```
Truy cập `http://localhost:5173`.

Tài khoản mặc định (được seed tự động khi database rỗng): `admin / admin123` — **đổi ngay sau lần đăng nhập đầu tiên.**

---

## Đóng gói bản Desktop (Tauri)

Dự án dùng kiến trúc **Sidecar**: nhúng Backend API và Client Agent chạy ngầm cùng giao diện Frontend để tạo file cài đặt Desktop hoàn chỉnh.

### Bước 1 — Build các project .NET thành file thực thi độc lập
```powershell
cd src/InsiderThreat.Server
dotnet publish -c Release -p:PublishSingleFile=true -p:PublishReadyToRun=true --self-contained true -r win-x64 -o ../InsiderThreat.Web/src-tauri/bin/

cd ../InsiderThreat.ClientAgent
dotnet publish -c Release -p:PublishSingleFile=true -p:PublishReadyToRun=true --self-contained true -r win-x64 -o ../InsiderThreat.Web/src-tauri/bin/
```
Đổi tên 2 file `.exe` sinh ra thành `InsiderThreat.Server-x86_64-pc-windows-msvc.exe` và `InsiderThreat.ClientAgent-x86_64-pc-windows-msvc.exe` trong thư mục `bin`.

### Bước 2 — Build Tauri App
Cần cài sẵn C++ Build Tools và Rust.
```bash
cd src/InsiderThreat.Web
npm run tauri build
```
File cài đặt xuất hiện tại `src/InsiderThreat.Web/src-tauri/target/release/bundle/nsis/`.

Bộ gỡ cài đặt (NSIS Uninstaller) yêu cầu mật khẩu Admin, tự khôi phục quyền truy cập USB/lưu trữ và dọn sạch tiến trình, file, log trước khi gỡ.

---

## Deploy production (Render)

Backend và frontend chạy trên 2 service Render riêng, build bằng `Dockerfile` ở gốc repo (backend) và Static Site (frontend). Xem chi tiết luồng CI/CD ở [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml).
