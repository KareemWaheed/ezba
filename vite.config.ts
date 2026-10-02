import { defineConfig } from 'vite';

// GitHub Pages serves the site from /ezba/. Local dev and LAN testing use /.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/ezba/' : '/',
  server: { host: false, port: 5173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
});
