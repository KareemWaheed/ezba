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
- M11 factories (east of the café): bakery (2 eggs + 2 wheat -> cake; 1 wheat since the silo playtest below), dairy (3 milk -> cheese), generic
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
- Phase 2 — supermarket-first game (config/paths.ts): a start screen (shown until a game is picked, and from the
  settings) picks the farm or the supermarket; each has its own save slot (`ezba-save` / `ezba-save-market`, the
  pick in `ezba.mode`), switching saves and reloads. `SimWorld(seed, mode)` carries a `PathDef`: free start levels
  (the store), start money and stock, hidden tracks (farm shop lanes/cashier, rush tiles, the store unlock), cost
  multipliers (store upgrades are early-game prices there) and rewired `requires`; `eggs.unlock` (supermarket path
  only) opens the coop, and the farm then grows backwards from it. There is no farm shop on that path (its counter
  is the farm's storeroom feeding free farm deliveries), so no shop customers, VIPs, rushes or shop events.
  Supplier credit: with almost nothing left in the store, boxes can be ordered into debt (so it can never stall).
  The active/casual bots run the store (shelve, checkout, storeroom, desk orders, keeping money back for boxes);
  `npm run marketpacing` checks the supermarket path's pacing (cashier ~7 min, chickens ~13, cows ~60-70, café
  within 2 h, nobody unhappy once staffed).
- Phase 3 — more goods and price tags: bread, tomatoes and potatoes (wholesale goods; bread could later come from the
  bakery, vegetables from new plots); the store has 3 rows x 5 shelves. Price tags per product at the order desk
  (cheap x0.85 / normal / dear x1.2 / very dear x1.45; config/market.ts PRICE_TAGS): a dearer tag pays more per
  item but shoppers put it on their lists less often (demand weight 1.5 / 1 / 0.65 / 0.4), so pricing trades
  margin for traffic. Tags are saved; the order panel shows the free farm delivery only once the farm makes
  that product.

- Supermarket polish (playtest: couldn't scroll the order panel on a phone; couldn't tell what shoppers buy or
  when they're done; it felt unfinished). Panels scroll with a finger (they used to inherit the joystick's
  `touch-action: none`). Every shopper carries a list chip: their items with ✓ as they're picked, the one
  they're after highlighted (red with "!" while its shelf is empty) and a progress bar; in the checkout line
  it turns into their basket (scanned/total and what it comes to). Inside the store a board replaces the
  goal card: the next thing to do (sim/guide.ts `marketHint`: checkout > stock > fetch > order > coming >
  cash > ok), shoppers in the store and in line, who's serving, cash waiting, empty shelves. The order panel
  highlights products running out and has one button that orders a box of each (farm surplus first).
  `FEATURES.supermarket` (config/features.ts) can still switch the whole store off: tiles and start screen
  hidden, store spend refunded on load.
- Updates: the service worker no longer reloads the game by itself. An open game checks for a new version
  every 20 min and when it comes back to the front; when one is ready a button says so (progress is kept);
  tapping it saves and reloads (ui/updateBanner.ts). Saves keep progress, not prices, so balance changes in
  config apply to existing saves.
- Football (Salah/Messi) physics redo (playtest: ball glitched, goal too small): the goal mouth is 2.6 wide (was
  1.4) with a real net. The ball is solid (never inside the player; a pinned ball stops the player); walking into
  it dribbles it a touch ahead, running into it kicks it (mostly the way the player runs, power from speed, one
  kick per touch); it rolls with drag + constant friction so it settles, bounces off the pitch edges and round
  posts. The ball model spins about its center (it used to swing around its bottom and wobble).
- Economy review (measured: each available upgrade's added income/min for an active player and its payback,
  at minutes 60/150/260/400/540 of an efficient run). Findings: income is capped by buyers, not production
  (by minute 540 ~80k eggs sat unsold on the counter), so late production upgrades never paid back;
  buyer-side upgrades (cashier, lanes, café cleaner, dock worker) paid back in 15-30 min; the café earned
  ~15% for a lot of running and its staff were the priciest in the early stages; the supermarket sold
  cheese/cake for more than the café. Changes: café customers per table 1.2 -> 1.8 (more of the egg/milk
  surplus becomes dishes), kitchen helper (🧑‍🍳) 30k -> 15k, café cashier 160k -> 130k; café cheese 30 -> 40,
  cake 45 -> 60, and the store's cheese 26 / cake 40 / fish 28 at 50% margins under them (rule, checked in
  marketcheck: the café always pays more than the store, even at the dearest tag); wheat 9 -> 14; cheaper
  late chickens (growth 1.55 -> 1.4), coop expansion, milk belt and factory speed; rush reward step 0.25 ->
  0.5; dock size halved; tractor drivers 60k -> 100k (they came two days earlier with the cheaper upgrades and
  made automation earn nearly as much as play). Store upgrade prices stay: sale prices grow ~4x by the time
  it opens, so it pays back fast already (a 40% cut made the farm finish a day early). Result (npm run
  simulate): every pacing target passes; the efficient player finishes at 441 min (was 497), the casual one
  by day 7 (was 154 of 171).
- Shop customers come first: kitchen helpers, factory suppliers, dock workers and store deliveries leave on the
  counter what the shop's line still wants, and leave the pile alone while the line wants more than the
  counter has (SimWorld.counterSpare / shopShort).
- Price tags now change how many shoppers come (the open shelves' average demand scales arrivals): cheap
  fills the store (more profit an hour, more work), dear brings fewer who each pay more.
- Families (12% of shoppers, once the store has a second shelf row): a trolley and a long list (3-5 lines, up
  to 4 each); less patient; checked out by the player in person they tip 30%. Rush hour (15 min after the
  store has a cashier, then every ~9 min, only into a mostly stocked store): shoppers come 3x as often for
  45 s (toast + the store board counts down).
- Display units: chilled goods (milk, cheese, fish, soda) in glass-door fridges, vegetables (tomatoes,
  potatoes) on wooden crate stands, the rest on gondola shelves (MarketProduct.unit).
- The corn pile at the grain stall has no limit (it used to cap at 24 and leave corn in the player's hands);
  a "x120" label shows over a pile taller than its stack.
- Crowd events feature a product the farm has plenty of (>= 40 on counter + pile, else the best stocked).
  Derby: fans in the lane the player serves calm down (count 35% toward the meter) and the guide arrow points
  at the lane with the most fans of the bigger side; measured over 8 runs: following it, 0 clashes; unattended,
  clashes in 6 of 8.
- Price-drop refunds (config/priceHistory.ts, sim/refund.ts): saves carry the upgrade price version they were
  bought at (`pv`). Loading an older save credits, once, per track that got cheaper: what its owned levels
  cost then minus what they cost now (dearer tracks charge nothing; free starting levels skipped; each game's
  own cost multipliers), plus any partial payment beyond the next level's new price. The game saves at once
  and shows a "رجّعنالك فلوس!" card listing each upgrade and the total (after any welcome-back card). To cut a
  price later: change it, add the old values to PRICE_CHANGES, bump PRICE_VERSION.
- Moving progress between devices (no server): ⚙️ -> "📤 انقل تقدّمك" shows a QR and a text code; on the other
  device "📥 عندي كود" takes a pasted code or scans the QR with the camera (BarcodeDetector where the browser
  has it, else jsQR, loaded only then). A card shows what comes and what goes; the old save is kept as
  `<slot>-before-import`. Codes (src/transfer.ts): text "EZBA1." + base64url(deflate-raw(save JSON)), ~1.5 KB
  late game, tolerant of line breaks from chat apps; QR "EZ1:" + base45 so it packs in QR alphanumeric mode
  (version ~27 for a late-game save). The debug panel's older plain codes still read. `npm run transfercheck`;
  checked in a browser across separate contexts, including a fake camera showing the QR.
- Supermarket-first game, the farm as the store's supplier (playtest: eggs piled up on the farm counter, a full
  milk pile sat untouched while the store bought milk wholesale, shelves stood half empty). At that point the
  farm still had no shop of its own in this mode (it supplied the store; see the next entry), but now: every 4 s
  the farm sends a box of what it makes from the counter to the storeroom when it fits (free; a part box tops
  up the last of the room), and once the store has stockers an animal pile that has sat full 20 s goes too (`MarketSystem.pileIdle`; earlier the player fetches by hand).
  Shelf stockers push a trolley: 8 items a trip (was the farm workers' 3). Playtest save over 5 minutes:
  empty shelves 6.8 -> 0.6 of 15, unhappy shoppers 20 -> 1, items sold 300 -> 517.
- Supermarket-first game, more to do in the store (playtest: "the supermarket is very boring"; and the farm
  had no customers of its own). The farm shop now opens with the coop in this mode too: its customers buy at
  the farm counters first and the store gets what's left (shop rushes and shop events stay off). This replaces
  the Phase 2 rule above that the supermarket path has no farm shop. New store
  upgrades (third tile row in the yard south of the store, which becomes walkable once the store is built):
  `market.lanes` a second checkout with its own line (its cashier is `market.cashier` level 2, capped by the
  lanes), `market.selfcheck` a kiosk for baskets of <= 5 items (3x slower than the player); shoppers pick the
  shortest line (an unstaffed lane counts as longer). Spills (once the store has a second shelf row): a shopper
  drops something every ~55 s (max 3), shoppers wade through slowly and lose patience; the player mops one by
  standing in it (small tip), `market.cleaner` does it on his own. Shoplifters (2% of shoppers, same gate):
  once their list is done they run for the door; touching one gets the goods back plus a bounty, the
  `market.guard` stops them near the door, otherwise the goods are lost. Phone orders (`market.delivery`): a
  2-4 product order every ~75 s with a 150 s timer, loaded into the van by hand (the storeroom hands order items
  first) for 1.8x the shelf price; level 2 adds a driver who loads from the storeroom. The guide and the store
  board point at whichever of these needs the player. A newly opened shelf row comes with 8 items a shelf (the
  casual bot stalled ~6 min after buying it while saving to stock every empty shelf). None of the store events
  happen during time away, and none are saved. `npm run marketcheck` covers each.
- Field hands (playtest: no cheap way to automate the corn before a 90k tractor + 100k driver): `field.hand`
  (10k, then 25k; up to 2) right after the corn field opens. On foot with a sickle: one stalk every 1.2 s,
  4 bundles on the back, then to the stall (west of the drivers' spots); corn only (wheat feeds the bakery and
  stays with the player and the tractors); they leave stalks within 3 m of the player alone. Two hands bring
  ~19 bundles a minute, under a third of one tractor driver; they work during time away like the drivers.
  Playtest follow-up ("the hands are so slow it's like they aren't there"): base pace up (a stalk every
  0.8 s, 6 bundles on the back, faster on foot: two hands ~28 bundles a minute, under half a driver), and
  `field.handSkill` (8k x2.2, 4 levels, after the first hand) trains them: per level +50% cutting rate, +15%
  walking speed, +3 bundles carried. Fully trained, two hands bring ~72 a minute, a little more than one
  tractor driver (which costs 190k with its tractor). A stalk every 0.6 s pushed automation under the
  "active earns >= 1.5x" target (1.47x); 0.8 s keeps it (1.55x). Hands on wheat too pushed automation past it
  as well. `npm run fieldcheck` covers them.
- More land (playtest: "the fields need a size upgrade too"): the river bank stops the fields growing north, so
  `field.expand` (250k, then 600k; after the wheat field and the tractor) opens new plots east of the wheat: a
  second corn plot (x 15.5-21.5), then a second wheat plot (22.5-28.5), shown locked until bought; the walkable
  area reaches them. Drivers and the combine work both new plots like the others; hands work the corn only.
  Everything is still handed in at the one grain stall: corn goes onto the corn pile there for the shop counter,
  wheat to a truck that ordered it, the silo, or is sold. At 150k right after the wheat it pushed automation under the "active >= 1.5x" pacing target (1.47x).
- Events felt like they'd stopped (playtest): the countdown to the next one restarted at 10-16 min of play on
  every load and was never saved, so short phone sessions rarely reached one. Now it's saved (`eventT`), the
  gap is 6-9 min, and back after 10+ min away the next event comes within 90 s. `npm run eventcheck` covers it.
- The combine couldn't unload (playtest): the gap between the grain stall and the coop fence (1.6 m) is
  narrower than a vehicle (the tractor needs 1.8, the combine 2.4), so it never got within reach of the front
  drop. A driven vehicle now unloads from any side of the stall (within its radius + 0.6 of the stall box); the
  guide arrow and a toast send a full combine to the back (`FIELDS.stall.vehicleDrop`, field side).
- Corn cable line (playtest: corn piles up at the stall, nothing takes it to the counter but the corn
  workers): `corn.machine` (25k x2.5, 4 levels) is the corn's belt, but in the air (`skyBelt`): a tower by the
  pile, cables over the coop to a tower behind the counter's west end, bundles ride up, across and down onto
  the counter (~4.6 s ride, same rate as a belt). Jams are fixed at the counter-end tower (the line's middle is
  over the coop). `npm run fieldcheck` covers both.
- The wheat silo sat at 0/80 (playtest): with factory.speed the bakery ate up to ~70 wheat a minute, more than
  a whole wheat field grows (~65 at best), and the drivers mostly mowed the corn. Cake is now 2 eggs + 1 wheat,
  and while the bakery's wheat plus the silo is under one input-load (30) the tractor drivers go to the wheat
  first. One driver now keeps a full-speed bakery stocked and the silo starts filling.
- Dock workers only fetched from the shop counters (playtest: a mills truck sat at 0/28 wheat, corn slow):
  they now fetch whatever the waiting truck ordered: the product it still needs most, and for that product the
  first source with stock, in this order: counter surplus, the pile (the corn's by the grain stall), factory
  trays (cake, cheese, grilled fish), wheat (kept at the stall, then the silo), the river's fish pile. Each
  worker keeps its own source. Wheat
  handed in at the stall while a truck still needs some is kept there for it (`field.dockWheat`, sold or put
  in the silo once the truck has enough or leaves); the silo's auger leaves the truck's share, and the tractor
  drivers go to the wheat while it's short.
- Playtest round (the café cashier felt out of reach; progress lost after a phone call; events felt
  all-or-nothing and the footballers too hard):
  - `cafe.waiter` 130k -> 55k (PRICE_VERSION 2: earlier buyers get the difference back). Full automation of
    stages 1-3 now lands on day 3 for an efficient player (pacing target moved from day 4, the user's call).
  - Saves: already every 3 s, on every purchase and on tab hide. The lost café was most likely a second copy
    of the game (an old tab, the installed app plus the browser) saving its older state over the newer one.
    A page now remembers the exact save it last loaded or wrote; once the stored save is
    anything else (another copy saved, an import from another device whatever its date, a wipe), it stops
    saving and offers to reload.
  - Events always pay: 40% of the full reward for taking part, up to +40% for the goals met, and the full
    reward x the stars when every goal is met. Goals show as bonus targets (☆/⭐); rating only drops when a
    guest left unserved.
  - Salah and Messi: one goal is the bonus (was three). Messi's goal is open now; dribbling round every cone
    first makes it a golazo that counts twice.
  - New events with play unlike the others: Mohamed Ramadan throws money from a helicopter (stand where the
    shadow grows to catch a bundle, paid at once); Mr. Bean hides in one of five boxes on the square (hot/cold
    on the banner, found = a reward, then he hides again); Usain Bolt races the player round a lap of gates
    (he runs 86% of the player's top speed and stops to pose halfway). Plus a Hamo Bika mahraganat night on
    the dance pads. Spots are random open ground on the square (`sim/scenarios/plaza.ts`).
- Locked previews (playtest: no way to see what the next stage needs, e.g. the corn field): a new area
  (`*.unlock`) or a big step (wheat, tractor, combine, dairy, grill) that's only missing upgrades whose tiles
  are up right now shows as a faded, locked tile at its spot: icon, name and "محتاج:" with what to buy
  (`UpgradeSystem.teasers()`, drawn in render/tiles.ts). Not payable; it turns into the real tile once the
  needs are bought. Usually one or two at a time.
- Surplus has a use (playtest: 15,000 egg crates on the counter with nothing to do with them). In the yard's
  bottom-left corner (`LAYOUT.surplus`, `sim/surplus.ts`):
  - Wholesale trader: a pickup backs in now and then (every ~150 s, its own jitter so the world's random
    sequence is untouched) when a counter has 150+ spare (beyond the line's needs): it takes 35% of it
    (100-4000 items); a factory tray (only while the café counter is full) qualifies at 8+ and goes whole. He
    pays 40% of the sale price (golden hens' bonus included); the player stands at the
    load spot (the lot loads in 3 s). `trader.deal` (6k): he loads by himself. Never during time away.
  - Incubator (`eggs.incubator`, 3k then 9k): takes 50 spare eggs per tray (x level) every 15 s, leaving 120
    spare for the kitchen, factory and dock, and hatches chicks into a crate (40 max) that sells for 30 each
    (x price growth, ~1.5x the eggs). Every 30 chicks a golden hen (max 3) struts in the coop: eggs sell for
    15% more each. Hatches during time away too (the crate caps it).
  - Records: 2,000 spare eggs / 1,000 milk / 800 corn (x1.5 each time after) can be turned into "the biggest
    omelette / rice pudding / popcorn tray in Egypt" by staying at the record stand for 2 s: pays 2.5x their sale
    value, a giant dish grows on the stand. `npm run surpluscheck` covers all three.
- Fish has buyers (playtest: "fish needs a place to sell, trucks like Bahary or Samakmak, and the café should
  become a restaurant"). The fish stall, the grill and grilled fish on the café menu were already there; now
  seafood companies' refrigerated trucks (أسماك بحري، سمكمك، مطعم سي جل) drive along the river bank when the fish
  pile has 12+ crates (with river workers: any time, and the workers hold the pile for the truck) and take up to
  30 fish at 1.4x the stall price: the player loads at the truck, river workers load it themselves (and only
  while it's being loaded does the pile wait for it rather than go to the stall or the grill). The trader and
  the seafood trucks share one visit state machine (`sim/visit.ts`). Own timing
  jitter (world random sequence untouched); never during time away. Once the grill is built the café's name
  board reads "مطعم وكافيه المزرعة". Covered in `npm run surpluscheck`.
- Time away (playtest: "is there a cap if I leave it 3-4 days? there shouldn't be"): it was 2 h at 30%. Now 8 h
  count, and the overseer `away.cap` (ناظر العزبة, 30k then 120k, after the café, in the HR yard: widened 4.3 m west for the new staff tiles) raises it to 12 h then 24 h. The
  first 2 h earn at full rate (25%: the simulated hour and what's extrapolated up to 2 h), the hours after
  that at 35% of it, so a night away pays but doesn't skip the game
  (30% and half-rate later hours pushed the café / corn field / automation pacing targets early). Only the first
  hour is simulated tick by tick; the rest is extrapolated at the mean of that run's second-half rate (skips the opening burst of
  stock on the counters) and its whole-run rate (so one odd half-hour doesn't set a day's pay) (a phone can't tick a
  whole day on reopen). No cap at all would let a week away skip most of the game. `npm run awaycheck`.
- Mechanic (playtest: "an HR job, a bit pricey, someone who fixes the belts"): `hr.mechanic` (فني صيانة, 150k
  then 375k, up to 2; in the HR yard after maintenance level 2). Blue overalls, hard hat: waits by the office,
  walks (through the yard's gate) to the nearest jam no other mechanic has taken and fixes it in 4 s (the
  player: 2 s); works during time away too. The guide arrow skips jams a mechanic is on. At 60k after maint 1
  automation got too strong early (active/auto 1.49x < 1.5x); at 150k after maint 2 it's 1.60x. `npm run awaycheck`.
- More HR staff (playtest: "add other HR things if you have ideas"):
  - Accountant `hr.accountant` (محاسب, 40k then 120k, after the café): the farm's cash piles (shop, café, grain
    stall, fish stall; not the supermarket's, it has its own checkout) go into the player's money every 30 s
    (12 s at level 2), with a small 🧾 float. Not during time away (that pays its own sum).
  - Customer service `hr.service` (خدمة العملاء, 20k x2.5, 3 levels): shop customers' patience +15% per level.
  - `npm run awaycheck` covers both.
- The surplus yard (playtest: "the incubator, the omelette record and these feel out of place; they need a new
  yard"): the trader, the incubator and the record stand moved out of the main yard into `حوش العزبة`
  (`LAYOUT.surplusYard`, `surplus.yard`, 2k, milestone, after the first egg worker), walled like the HR yard,
  west of the main yard below it, with a gate in the east wall and a gap in the west wall the trader's truck
  drives in through. Shaded and shut until bought; no trader and no records before it. The incubator and the
  trader deal are bought inside it. Old saves that used the corner (incubator, trader deal or a record) get the
  yard. The army truck moved 2.7 m south and four trees moved to make room. Locked yards (HR, surplus) now keep
  their gate shut: once the river or another yard widened the walkable area, a locked yard could be walked into.

