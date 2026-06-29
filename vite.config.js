import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: { skipWaiting: true, clientsClaim: true },
      manifest: {
        name: 'EchoBridge',
        short_name: 'EchoBridge',
        description: 'Your voice, your way. AI communication companion for autistic adults.',
        theme_color: '#1a0a2e',
        background_color: '#1a0a2e',
        display: 'standalone',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      }
    })
  ]
})
