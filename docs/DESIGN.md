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
- Checkout lanes (supermarket style): up to 3 lanes along the counter, each with its own line. Customers
  join the shortest line; each extra lane raises the arrival rate. One cashier per open lane; the player
  serves whichever lane(s) they stand at, faster than a cashier.
- Tiles only take money while the player is (nearly) standing still, so running across one doesn't drain it.
- Offline earnings = automation's real output for the time away (capped at 2 h) x `offline.efficiency`.
- Demand follows production: customers want ~85% of what the animals make (base rate). Feeding
  troughs (player-only, 2x production) create surplus for future contracts.
- New-farm grace: extra patience that fades over the first 12 upgrades.
- Only the front customer of each lane shows the full order bubble; others show a mood/patience face.
- VIPs: crown + gold bubble, toast on arrival, guide arrow points at their lane; only the player serves them.
- Café (stage 3): stove = generic recipe Converter (bakery/dairy reuse it); kitchen helpers take raw items
  from piles or from the shop counter's surplus (keeping a reserve), so the shop counter acts as the farm's
  storeroom. Café money is left on tables; cleaners carry it to the café cash pile. Breakfast rush hits the café.
- Scenario events (config/scenarios.ts, looks in config/looks.ts, all data): president visits (Egypt, France,
  USA), Salah, Messi, Amr Diab, army convoy, wedding zaffa, health inspector, storm/power cut, influencer live,
  Japanese tourists. Each has a banner color, screen tint, intro card, music loop, props, crowd look, goals and a
  production-scaled reward. Never overlaps a rush.
- Special guests never join the normal lines: they arrive by motorcade, walk a carpet to the VIP stage, pose
  while fans/press film, order, and the player delivers in person (from piles, or from the counter stock while
  the guest waits), then they eat on stage and leave.
