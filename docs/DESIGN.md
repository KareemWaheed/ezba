# Ezba (عزبتي) — design notes

The full spec is the original brief (stages 1–7, pressure systems, pacing targets).
This file records the decisions made on top of it.

## Architecture
- `src/sim/` is pure TypeScript: no three.js, no DOM, no `Math.random`. It holds all gameplay state and
  advances with `tick(dt)`. Item flights, belt travel and cash drops are sim timers; the renderer only animates them.
- `src/render/` reads sim state and draws it. `src/ui/` is DOM (HUD, joystick, modals, debug panel).
- The browser, `npm run simulate` and offline catch-up all run the same sim code.
- All tuning numbers live in `src/config/economy.ts`. Stage layouts and upgrade tracks are data in `src/config/stages/`.

## Approved additions (beyond the brief)
- Save safety: `navigator.storage.persist()` + export/import save code in the debug panel.
- One tile per upgrade track (levels advance in place); staff tiles live in the HR office.
- Staff are good but worse than the player: slower cashier, no tips/combos for staff, smaller worker capacity,
  staff get a boost while the player stands nearby.
- Rating only counts customers who arrived while the app was open; offline never lowers it.
- Customer arrivals are rate-driven (rating + events), never driven by stock on the counter.
- Feeding troughs: player refill = 2x production for a few minutes; workers refill at normal rate.
- HUD "next goal" card (next big unlock + progress bar) alongside the guide arrow.
- Pitch ladder on stacking pickups; arpeggio on selling a full stack.
- Real-clock time of day (morning café rush, golden evening, quieter night).
- Egyptian events: سوق الخميس (market day); iftar rush during Ramadan.
- Later stage ideas: عصير قصب stand (cane field + press), فرن عيش بلدي, bees/honey or mango orchard.
- Simulator writes an HTML income chart (active vs automation-only) and supports `--check` to fail on pacing regressions.
- Input record/replay in the debug panel (sim is deterministic).
- Screen wake lock while playing; haptic ticks on Android.
