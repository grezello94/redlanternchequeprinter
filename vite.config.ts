import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Red Lantern Cheque Printer',
        short_name: 'RedLantern',
        description: 'Professional Cheque Printing for Red Lantern Restaurant',
        theme_color: '#ff5e6c', // Your brand accent color
        icons: [
          { src: 'app-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'app-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ]
})
