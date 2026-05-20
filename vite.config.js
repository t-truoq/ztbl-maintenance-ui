import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/sap': {
        target: 'https://s40lp1.ucc.cit.tum.de',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            const credentials = Buffer.from('DEV-251:13062004').toString('base64')
            proxyReq.setHeader('Authorization', `Basic ${credentials}`)
          })
        }
      }
    }
  }
})