import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  // Dùng './' để asset paths relative — tương thích BSP deployment
  // Dev server dùng '/' như bình thường
  base: command === 'build' ? './' : '/',
  plugins: [react()],
  define: command === 'build' ? {
    'import.meta.url': '(document.currentScript && document.currentScript.src || window.location.href)'
  } : {},
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
        entryFileNames: 'index.js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    }
  }
}))
