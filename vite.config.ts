import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the site from /ezba/. Local dev and LAN testing use /.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/ezba/' : '/',
  server: { host: false, port: 5173 },
  // the lazy Rapier chunk (stage 4 cosmetic physics, wasm inlined) is ~2 MB on its own
  build: { target: 'es2022', chunkSizeWarningLimit: 2100 },
  plugins: [
    // installable, fully offline: every built file is precached; new versions update in the background
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'عزبتي',
        short_name: 'عزبتي',
        description: 'لعبة مزرعة: لم، بيع، وكبّر عزبتك',
        lang: 'ar',
        dir: 'rtl',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        background_color: '#a7dcf2',
        theme_color: '#a7dcf2',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
});
