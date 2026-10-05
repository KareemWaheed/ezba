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
- Egg belt costs 500 so a casual player gets it at ~28 min (right after the first worker); café cashier raised to 150k to keep full
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
- Fixes from playtest: workers only load what their target can take (WorkerJob.room) and put leftovers back
  after 3 s of refusals (putBack) — no more helpers/dock workers frozen with tall stacks; the café cashier is a
  visible character; corn is a shop product (counter slot at the shop's left end, ordered only while stocked;
  pile by the grain stall where drivers/combine unload; `corn.worker` carries pile -> counter). Staff crossing
  between yard and farmland walk through the gap between the pens (farmRoute). Barn/stall/tile positions
  adjusted (player capacity/speed tiles moved off the longer counter).
- M11 factories (east of the café): bakery (2 eggs + 2 wheat -> cake), dairy (3 milk -> cheese), generic
  Converter machines. Wheat handed in at the grain stall fills the bakery silo (80) first. Supplier brings
  eggs/milk from shop surplus; porter carries cake/cheese to the café counter's front row; the player can do
  both. Café customers order cake/cheese only while some is on display.
- M12 river (north edge past the fields, dock west of the corn): fishing boats (trip timer, crates onto the
  fish pile), fish stall (instant sale), grill (factory machine at the dock: fish -> grilled fish for the café,
  porters carry it), rowboat rental (visitors queue, ride a loop around the pier end, pay; returned boats must be
  tied by the player at the tie spot or by a river worker). Fish stall / grill become solid only once built
  (addSolid). Vehicles only take over east of the dock (FIELDS.driveX0) — the combine's radius made the dock
  unworkable. Per the user, late stages may be overpowered: the "active beats automation" check covers days 1–4.
- M13 delivery orders: truck contracts take any goods (farm products, cake/cheese/grilled fish, wheat, fish) the
  farm can make right now; orders mix up to 3 goods, amounts shrink for pricier goods (40 eggs vs ~9 cakes);
  timed (rush) orders run 3 min and mixed ones pay an extra bonus. New companies: Domty, Tseppas, Sea Gull,
  Misr Mills; Carrefour and the army order factory goods too. Dock workers still load shop products only —
  factory/river goods are the player's job.
- Events redesign (playtest: "dull and repetitive", every event was serve-the-guest + nobody-angry): each scenario
  has a `mechanic` (sim/scenarios/*.ts, a small `Mechanic` interface: warn/start/update/goal/progress/bonus/
  botTarget/teardown plus optional hooks — onSell, onPlayerFeed, canDeliver/deliverVia, crowdStyle, tipMult, busy,
  hudText/hudMeter/hudMode) and its own visuals (render/scenarios/*.ts, built when the event goes live, disposed at
  the end). ScenarioSystem keeps the phases, owns `checkGoals()` (HUD and the final check share it), twists, star
  grades (1 = all goals, 2 = also nobody angry and the guest served with ≥25% patience, 3 = also the mechanic's
  perfect-run bonus; reward ×1/×1.5/×2) and the debug "win" flag. The guide arrow and the active bot both follow
  `mechanic.botTarget`. Entrance: camera pan + letterbox + 1.2 s slow-down that scales how much real time the sim
  advances (like debug speed), never the step. `npm run eventcheck` drives every event headless: unattended fails,
  doing the objective passes, time away and save mid-event lose nothing.
- Event mechanics: presidents = timed delivery (Sisi: through the security gate on the carpet; Macron: stand in the
  official photo; Trump: changes his order twice); Salah = penalties past a moving keeper; Messi = dribble through
  4 cones then score (goals raise fan tips); Amr Diab = dance pads lit on the beat (combo); storm = dark + flashlight,
  herd escaped animals (their pen pauses); inspector = walks a checklist route (troughs fed, jam fixed, table clean,
  pile not overflowing); wedding / Japanese tour = a group walking a route, hand each walker their item (tour stops,
  then a group photo); influencer = comment requests filled by selling yourself; army = bulk order announced in a
  40 s warning, delivered at the truck. New: Ahly–Zamalek derby (fans split red/white by look seed; a meter leans to
  the side with more fans waiting, 4 s over the line = clash), film shoot with "the boss" (freeze on "action!",
  0.6 s reaction grace), thief (chase and tag; stolen money only lost if he escapes when the event ends), cook-off
  (recipe cards: feed the café machine yourself, full trays still accept), Ramadan iftar table (12 plates before
  the Maghrib cannon; only during Ramadan), khamaseen (sandy haze; stand on piles to tarp them before gusts take items).
- Event square (user: "widen the world"): paved square south of the yard (z 14–27.6, walkable bounds extended):
  VIP stage + carpet + fans, football pitch, dance floor, procession route, army truck and iftar table live there so
  events don't crowd the shop. layoutcheck keeps tiles and solids off the pitch and dance pads.
- Stage 7 — supermarket (playtest: factory goods had no outlet, late game lacked a goal). On the grass south of
  the café / factory yard (`market.unlock`, after the factory, so the walkable area already reaches it); open
  front plus a back door from the café side. 12 shelves in 3 rows (`market.shelves` opens rows 2-3): six farm
  products and six wholesale goods (rice, pasta, oil, tea, chips, soda — new `goods` items). Loop: order boxes at
  the 📱 desk (paid now, land in the storeroom after 8 s) or bring farm products for free (straight to their shelf,
  or a free "from the farm" delivery that takes the farm's surplus); pick at the 📦 storeroom (it hands out what
  the shelves need most); stock shelves by standing at their fronts; shoppers walk the aisles with a list (through
  the gaps between shelf units), wait briefly at empty shelves, then pay at the checkout (player or
  `market.cashier`). Staff: `market.stocker` (one job per stocker so they never fill the same shelf),
  `market.auto` reorders low products (farm surplus first). Prices/costs in config/market.ts, x the farm's price
  growth. `npm run marketcheck` covers the loop, a staffed store at steady state (0 unhappy, sales > orders),
  saves and time away. The event checks grow their farm without the store (its shoppers would shift the random
  sequence the event checks are tuned to). Next: start screen with a "supermarket first" path (Phase 2), more
  goods and pricing (Phase 3).
