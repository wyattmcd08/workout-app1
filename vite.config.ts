import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// For GitHub Pages: set base to './' for relative paths so the app works from
// any subpath (e.g. username.github.io/dialed-dawg/). If you push to the
// special user/org repo (username.github.io), change to '/'.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Dialed Dawg',
        short_name: 'Dialed Dawg',
        description: 'All-in-one bodybuilding & fitness operating system',
        theme_color: '#0b0b0d',
        background_color: '#0b0b0d',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
})
