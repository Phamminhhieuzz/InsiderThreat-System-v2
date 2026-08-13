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
        // Tách các thư viện lớn thành file riêng để:
        //  - Trình duyệt cache lại được (đổi code app không phải tải lại vendor)
        //  - Tải song song nhiều file nhỏ thay vì 1 file khổng lồ
        // LƯU Ý: gom TẤT CẢ tensorflow + face-api vào CÙNG một chunk. Nếu tách
        // rời các gói @tensorflow/* ra nhiều chunk, chúng đăng ký trùng kernel
        // và gây treo 10 phút lúc khởi tạo (xem ghi chú ở phần dedupe bên dưới).
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('@tensorflow') || id.includes('@vladmandic/face-api')) {
            return 'vendor-face-ai';
          }
          if (id.includes('antd') || id.includes('@ant-design') || id.includes('rc-')) {
            return 'vendor-antd';
          }
          if (id.includes('react-router') || id.includes('/react-dom/') || id.includes('/react/')) {
            return 'vendor-react';
          }
          if (id.includes('@microsoft/signalr')) return 'vendor-signalr';
          return 'vendor';
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
