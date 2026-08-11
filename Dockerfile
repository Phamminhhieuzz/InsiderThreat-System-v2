# Giai đoạn 1: Build Image
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /app

# Copy toàn bộ mã nguồn vào Container
COPY . ./

# Chuyển hướng vào thư mục Backend để xử lý
WORKDIR /app/src/InsiderThreat.Server

# Khôi phục thư viện và Build bản Release
RUN dotnet restore
RUN dotnet publish -c Release -o /out

# Giai đoạn 2: Runtime Image (Chỉ chứa môi trường chạy để tối ưu dung lượng)
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app

# Copy file đã build từ Giai đoạn 1 sang
COPY --from=build /out .

# Cổng mặc định khi chạy local/docker-compose (Render sẽ override qua biến PORT khi chạy)
EXPOSE 5038
ENV PORT=5038

# Trong container, file cấu hình không bao giờ đổi lúc chạy nên việc theo dõi bằng
# inotify là thừa. Máy chủ có thể đã chạm giới hạn inotify khiến CreateBuilder()
# ném IOException và tiến trình chết trước cả dòng code đầu tiên. Dùng polling
# để loại bỏ hoàn toàn phụ thuộc vào inotify.
ENV DOTNET_USE_POLLING_FILE_WATCHER=true

# Lệnh khởi chạy hệ thống
ENTRYPOINT ["dotnet", "InsiderThreat.Server.dll"]