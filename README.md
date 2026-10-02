# عزبتي (Ezba)

A mobile idle-arcade farming game (carry-and-stack genre) built as a PWA with Vite, TypeScript and three.js.
Design decisions are in [docs/DESIGN.md](docs/DESIGN.md). Balance numbers are in `src/config/economy.ts`.

## Run locally
```sh
npm install
npm run dev          # http://localhost:5173  (WASD / arrows on desktop)
```

## Test on your phone over LAN
```sh
npm run host         # prints a Network URL like http://192.168.1.20:5173
```
Open that URL on the phone (same Wi-Fi). If it doesn't load, allow Node through the Windows firewall
for private networks. Plain http is fine for gameplay; installing the PWA and offline play need HTTPS,
so test those on the GitHub Pages URL.

## Deploy
Every push to `main` builds and publishes to GitHub Pages via `.github/workflows/deploy.yml`:
https://kareemwaheed.github.io/ezba/

## Scripts
- `npm run build`: type-check and production build into `dist/`
- `npm run preview`: serve the production build on the LAN
- `npm run simulate`: headless pacing simulator (from M4)

## Code layout
- `src/sim/`: pure game logic, deterministic, no three.js/DOM (shared by the game, the simulator and offline catch-up)
- `src/render/`: three.js views that mirror sim state
- `src/ui/`: HUD, joystick, modals
- `src/config/`: economy numbers and layout/stage data
