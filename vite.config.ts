import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const isMobile = process.env.MOBILE === '1'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Service worker conflicts with Capacitor's localhost-scheme asset serving.
    // Skip PWA registration when building the mobile bundle.
    ...(isMobile ? [] : [VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'BoggleSmurf',
        short_name: 'BoggleSmurf',
        description: 'Find every word in a Boggle grid. Fast.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache app shell; dictionary uses runtime caching (it's 3 MB — too large for precache)
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /\/dictionary\.txt$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'dictionary-v1',
              expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /\/common-words\.txt$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'common-words-v1',
              expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    })]),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    coverage: {
      reporter: ['text', 'lcov'],
    },
  },
})
