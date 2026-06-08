import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  // Dùng './' để asset paths relative — tương thích BSP deployment
  // Dev server dùng '/' như bình thường
  base: command === 'build' ? './' : '/',
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/sap': {
        target: 'https://s40lp1.ucc.cit.tum.de',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    outDir: 'dist',
    // Tắt source map cho production (bảo mật)
    sourcemap: false,
    rollupOptions: {
      output: {
        // Tên file ổn định (không hash trên entrypoint) cho BSP compatibility
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  }
}))
