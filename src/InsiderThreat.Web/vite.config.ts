import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    minify: 'esbuild', // Sử dụng ESBuild để minify và làm rối mã cơ bản
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // CHỈ tách riêng thư viện AI nặng nhất (tensorflow + face-api, ~2.1MB).
        // Chúng độc lập, KHÔNG phụ thuộc React nên tách an toàn, và nhờ vậy
        // chỉ được tải khi vào trang Face ID (trang này đã lazy-load).
        //
        // KHÔNG tự tách React/antd/vendor thành chunk riêng: khi làm vậy, các
        // thư viện (như antd) gọi React.createContext lúc khởi tạo nhưng React
        // nằm ở chunk khác chưa load kịp -> lỗi "reading 'createContext'",
        // trang trắng tinh. Việc chia nhỏ phần còn lại để cho Rollup tự lo
        // theo cây import của các trang lazy — vừa đủ và an toàn.
        //
        // Gom TẤT CẢ @tensorflow vào cùng chunk với face-api: tách rời các gói
        // @tensorflow/* gây đăng ký trùng kernel -> treo 10 phút (xem dedupe).
        manualChunks(id) {
          if (
            id.includes('node_modules') &&
            (id.includes('@tensorflow') || id.includes('@vladmandic/face-api'))
          ) {
            return 'vendor-face-ai';
          }
        },
      },
    },
  },
  resolve: {
    // CRITICAL: Deduplicate TensorFlow.js packages to prevent multiple instances.
    // @vladmandic/face-api bundles TF.js internally, and usePhoneDetector imports it separately.
    // Without dedup, 2 TF.js instances register duplicate kernels → 10+ minute init hang.
    dedupe: [
      '@tensorflow/tfjs',
      '@tensorflow/tfjs-core',
      '@tensorflow/tfjs-backend-cpu',
      '@tensorflow/tfjs-backend-webgl',
      '@tensorflow/tfjs-converter',
    ],
  },
  optimizeDeps: {
    include: ['@vladmandic/face-api'],
    esbuildOptions: {
      keepNames: true
    }
  }
})
