import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    minify: 'esbuild', // Sử dụng ESBuild để minify và làm rối mã cơ bản
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
