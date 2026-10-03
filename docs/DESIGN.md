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
- Café rework after playtest ("can't sell, too many angry customers"): two kitchen machines side by side —
  🍳 egg pan (eggs → omelette) and ☕ coffee machine (milk → coffee) — each with its own drop spot and a short
  conveyor that slides dishes onto the café counter (no carrying dishes, no dish-belt upgrade). Customers no
  longer need a clean table to be served: with none free they take it to go and pay at the café cash (no tip);
  sit-down customers tip and tables raise arrivals. The counter caps at 12 per dish so the kitchen stops eating
  farm stock nobody buys. `npm run cafeflow -- [casual|active]` checks the first 10 café minutes (0 angry).
- Egg belt costs 1000 so a casual player gets it in ~30–40 min; café cashier raised to 150k to keep full
  automation at day 4+.
- Café layout v2 (screenshot review): kitchen line on the back wall — egg spot | egg pan + belt | serve |
  coffee belt + machine | milk spot — both conveyors run straight down onto the counter; café tiles in the
  free left/right columns; dirty tables show their own 🧽 bubble instead of a static sign. `npm run layoutcheck`
  (also part of `npm run build`) fails on overlapping tiles, tiles on work spots, or tiles in solids.
- Stage 4a — crop fields (north of the pens, through the gap between coop and cow pen): corn plot opens
  with `field.unlock`, wheat plot with `field.wheat`. Walking through cuts every grown stalk within the tool
  radius (`field.tool` widens it); 3 stalks = 1 bundle on the stack; stalks regrow (`field.regrow` speeds it);
  rare golden stalks pay a bonus. Bundles sell at the grain stall (instant trader, money piles at the stall).
  Crops are player-only income for now (no offline earnings) — vehicles and hired drivers come in 4b/4c.
  Barns moved inside the pens (the strip behind is the field walkway) and fade see-through while the
  player is behind them.
- Stage 4b — vehicles: `field.tractor` then `field.combine` (chained tile). Owning one puts the player on it
  north of the pens (farmland, z < farmlandZ); it parks west of the stall when they walk back through the
  corridor. Vehicles drive faster (`field.engine`), cut wider and collide with a bigger radius; the combine's
  bundles go into a 60-bundle hopper that empties at the stall at double speed. Rapier (lazy chunk, loaded
  when the field opens) drives only cosmetics: a sprung body simulated in the vehicle's own frame (bumps,
  lean in turns, tilt capped at 8°) and pooled chaff bodies (cap 150, halved when FPS < 40); until it
  loads, a simple shake and hand-written particles stand in.
- Stage 4c — hired drivers (`field.driver`, up to 3): orange NPC tractors mow a plot in back-and-forth rows
  (the one with the most grown stalks, each prefers its own), fill a 24-bundle hopper and unload at the stall.
  They work during time away (stall money counts toward offline earnings at the usual 30%). Balance after
  drivers: corn 5 / wheat 9 per bundle, fertilizer step 0.15 — a fully upgraded field earns about what the
  shop does (~5k/min), drivers add ~4k/min of automation.
- M9: debug panel (triple-tap money: +money, speed x1/x5/x10, time away 10m/1h/2h, rush/jam/VIP/golden/event,
  quality auto/1x/1.5x/2x, FPS, reset); welcome-back popup on reopen and tab return (automation only, 30%,
  2 h cap); PWA (vite-plugin-pwa: manifest, PNG + maskable + apple-touch icons, precache of every built file
  incl. the Rapier chunk, auto update); daily tasks (3 per calendar day from a pool gated by what's unlocked,
  targets grow with the farm, rewards = seconds of production); customer album (8 customer types with their
  own clothes/hats — picked from the look seed so the sim stays deterministic — plus VIPs and the scenario
  guests; finishing a page pays a production-scaled bonus); side buttons 📋 📖 ⚙️ (sound, install help).
