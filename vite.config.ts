import { defineConfig } from 'vite';

// GitHub Pages serves the site from /ezba/. Local dev and LAN testing use /.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/ezba/' : '/',
  server: { host: false, port: 5173 },
  // the lazy Rapier chunk (stage 4 cosmetic physics, wasm inlined) is ~2 MB on its own
  build: { target: 'es2022', chunkSizeWarningLimit: 2100 },
});
