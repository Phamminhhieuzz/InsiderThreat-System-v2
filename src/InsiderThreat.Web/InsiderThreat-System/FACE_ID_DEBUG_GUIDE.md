# 🔧 Hướng Dẫn Debug - Face ID Khởi Động Chậm

## 📋 Vấn đề được xác định

Quá trình khởi tạo Face ID mất **30 phút** và không có thông báo lỗi là dấu hiệu của **một trong những vấn đề này**:

### 1️⃣ **Model Files Không Load (404 Error)**
- ❌ Đường dẫn `/models/` không tìm thấy files
- ❌ Server không phục vụ model files đúng
- ❌ Browser cache bị lock file cũ

### 2️⃣ **TensorFlow.js Khởi Tạo Hàng Giờ**
- ❌ Cài hai instance TensorFlow.js (xung đột kernel)
- ❌ WebGL backend không hoạt động, fallback CPU quá chậm
- ❌ Out of memory (VRAM/RAM hết)

### 3️⃣ **Network/Proxy Issues**
- ❌ Connection chậm đến server
- ❌ Proxy/VPN chặn large files
- ❌ CORS headers không đúng

---

## 🔍 **Cách Debug (Bước 1: Mở Browser Console)**

Khi bạn mở modal đăng ký Face ID, **mở DevTools** (F12) → **Console tab** và xem logs:

### ✅ **Logs bình thường (thành công):**
```
[FaceAPI] ⏳ Loading essential models from: /models
[FaceAPI] Initializing TensorFlow backend (WebGL)...
[FaceAPI] ✅ TensorFlow backend ready
[FaceAPI] Loading TinyFaceDetector model...
[FaceAPI] Loading FaceLandmark68Net model...
[FaceAPI] ✅ TinyFaceDetector loaded
[FaceAPI] ✅ FaceLandmark68Net loaded
[FaceAPI] ✅ Essential models loaded in 3500ms
[FaceRegistration] Models loaded successfully
```

### ❌ **Logs lỗi (cần fix):**

**Case 1: Timeout (model không tải)**
```
[FaceAPI] ⏳ Loading essential models from: /models
[FaceAPI] Model loading timeout after 30000ms. Check network or /models path.
```
→ **Giải pháp**: Kiểm tra `/models` folder có tồn tại và được serve từ server

**Case 2: WebGL failed**
```
[FaceAPI] WebGL backend failed, falling back to CPU: Error
[FaceAPI] Loading TinyFaceDetector model...
(mất 5-10 phút vì CPU chậm hơn 100x)
```
→ **Giải pháp**: Kiểm tra GPU support, update driver

**Case 3: 404 errors**
```
GET /models/tiny_face_detector_model.bin 404 (Not Found)
```
→ **Giải pháp**: Đảm bảo `/public/models/` được copy vào dist folder

---

## 🛠️ **Các Bước Sửa Lỗi**

### **Bước 1: Kiểm tra Model Files tồn tại trên Server**

```bash
# Trên server, kiểm tra:
ls -la /path/to/dist/models/

# Phải có tối thiểu những files này:
# ✅ tiny_face_detector_model.bin
# ✅ tiny_face_detector_model-weights_manifest.json
# ✅ face_landmark_68_model-shard1
# ✅ face_landmark_68_model-weights_manifest.json
```

### **Bước 2: Cấu hình Web Server để Cache Models**

**Nginx:**
```nginx
location /models/ {
    # Cache model files lâu dài
    expires 30d;
    add_header Cache-Control "public, immutable";
    # Đảm bảo correct MIME types
    types {
        application/octet-stream  bin;
    }
}
```

**Apache:**
```apache
<Directory /var/www/html/models>
    <IfModule mod_headers.c>
        Header set Cache-Control "public, max-age=2592000, immutable"
    </IfModule>
</Directory>
```

**Express.js:**
```javascript
app.use('/models', express.static('dist/models', {
    maxAge: '30d', // Cache 30 ngày
    etag: false    // Tránh revalidation
}));
```

### **Bước 3: Thêm CORS headers nếu models từ CDN**

```javascript
// Nếu models hosted trên CDN khác:
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});
```

### **Bước 4: Clear Browser Cache & Restart**

```bash
# Trong DevTools:
# - Mở Application tab → Clear site data
# - Hoặc: Ctrl+Shift+Delete → Clear browsing data
```

### **Bước 5: Kiểm tra GPU/WebGL Support**

Tạo file test (test-webgl.html):
```html
<script>
const canvas = document.createElement('canvas');
const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
console.log('WebGL supported:', !!gl);
console.log('Renderer:', gl?.getParameter(gl.RENDERER));
</script>
```

---

## 📊 **Performance Targets**

| Bước | Thời gian bình thường | Quá chậm là |
|------|---------------------|----------|
| TensorFlow init | 100-500ms | > 5s |
| Load TinyFaceDetector | 500-1000ms | > 5s |
| Load FaceLandmark68 | 500-1000ms | > 5s |
| **Total (Essential)** | **1.5-3s** | **> 15s** |
| Recognition model (background) | 3-5s | > 30s |

---

## 🚀 **Optimization Checklist**

- [ ] ✅ Models được copy vào dist folder
- [ ] ✅ Web server cấu hình cache headers
- [ ] ✅ WebGL supported (check DevTools Console)
- [ ] ✅ Network không bị throttle (F12 → Network tab)
- [ ] ✅ Browser console không có 404 errors
- [ ] ✅ Timeout setting phù hợp (30s cho essential, 60s cho recognition)

---

## 📞 **Contact & Support**

Nếu vẫn bị lâu sau khi sửa:
1. Copy toàn bộ **Console logs** (F12 → Console → Select all → Copy)
2. Kiểm tra **Network tab** xem tốc độ download
3. Báo lại kèm:
   - Browser version
   - GPU model
   - Network speed (Mbps)
   - Server logs

---

## 🔗 **Liên quan files**

- `src/services/faceApi.ts` - Model loading logic (đã có timeout)
- `src/components/FaceRegistrationModal.tsx` - Modal component (đã có error handling)
- `public/models/` - Model files location
- `vite.config.ts` - TensorFlow deduplication config

