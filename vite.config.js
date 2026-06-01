import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
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
  }
})
