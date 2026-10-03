# Events Redesign + Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make special events feel distinct and exciting, then add depth around them: fewer/bigger events (#7), regular customers with personality (#5), a living day/night farm (#4), farm decoration (#2) and non-cash rewards/trophies (#1).

**Architecture:** Each scenario gets a `mechanic` that selects a small pure-sim module under `src/sim/scenarios/` (start / update / goals / teardown). `ScenarioSystem` owns the phases and delegates. Config stays data-only. Render and UI read sim state; cinematic effects (entrance camera, slow-mo) live only in render/UI and never touch sim `dt`. Later phases add new sim systems (`regulars`, `decor`, `trophies`) in the same style as `AlbumSystem`.

**Tech Stack:** TypeScript, three.js, Vite, tsx headless checks (no unit-test framework; checks are `tools/*.ts` scripts like `cafeflow`).

**Spec:** this plan + the conversation recommendations (events table, list items 7, 5, 4, 2, 1). Existing design notes: `docs/DESIGN.md`.

**Detail level:** Phase 1 is fully specified. Phases 2–6 specify files, interfaces, data shapes and check assertions; **each later phase gets a short re-check against the code before it starts** (Phase 1 rewrites files those phases touch), then its exact code is written in that phase's first task.

## Global Constraints

- `src/sim/` stays pure: no three.js, no DOM, no `Math.random`, no `Date`. Randomness only via `w.rng` (or a seeded `Rng`). Real-clock input only via `w.clock`.
- Never scale sim `dt` for visual effects (slow-mo, cutscenes). Visual-only.
- All player-facing text in Egyptian Arabic. Real people as friendly cartoon lookalikes, never mocking.
- Save format: keep `SAVE_VERSION = 1`; new fields are optional in `SaveData` with defaults in `restore()` (existing pattern). Scenario runtime state is never saved.
- Every phase ends green on: `npm run build` (typecheck + layoutcheck + vite), `npm run simulate:check`, `npm run cafeflow`, `npm run eventcheck` (added in Task 1.1).
- Layout changes: `npm run layoutcheck` and inspect **portrait** phone screenshots carefully before reporting.
- Update `docs/DESIGN.md` at the end of each phase. Commit per task. Push only when the user asks; the user playtests on phone after each phase.
- Phone performance: new particles/lights must respect the existing quality setting and keep 60 FPS on the user's phone.

## Review Focus

1. **Tab hidden / time away mid-event** — `w.away` resets the phase; every mechanic's temporary state (escaped animals, darkness, ball, procession, comment feed) must also be torn down. Test: eventcheck "away mid-event" case per mechanic.
2. **Save/reload mid-event** — nothing temporary leaks into the save (no stuck power cut, no lost animals, the thief's stolen cash is not lost). Test: eventcheck serializes mid-event, restores into a fresh world, asserts mechanic state is clean, station animal counts unchanged, and money + cash ≥ pre-event (chase).
3. **Event needs a locked area** (café closed, field locked, no machines) — gate with `when(w)`; never pick an impossible event. Test: eventcheck on a fresh farm asserts `pick()` never returns an event whose `when` fails.
4. **Portrait phone HUD** — comment feed, star result card, inspector checklist must not cover the joystick or the guide arrow. Test: screenshot step in Tasks 1.2, 1.7.
5. **FPS with darkness + extra particles** — storm flashlight and confetti together. Test: debug-panel FPS reading on the phone during storm, noted in the phase report.

---

# Phase 1 — Special events redesign

## File structure

- Create `src/sim/scenarios/mechanic.ts` — `Mechanic` interface + registry.
- Create one sim file per mechanic: `src/sim/scenarios/{motorcade,football,stage,storm,inspector,procession,comments,bulk,derby,filming,chase,cookoff,iftar,khamaseen}.ts`.
- Modify `src/config/looks.ts` — new guest looks: `adelemam`, `thief`, `police`, `sherbini`; new crowd looks: `fanWhite` (Zamalek), `film` (crew).
- Modify `src/config/scenarios.ts` — `variant?: string` field on `ScenarioDef`.
- Modify `src/config/scenarios.ts` — add `mechanic`, `when`, `twist`, `stars` fields; new goals.
- Modify `src/sim/scenario.ts` — delegate to mechanic; single `checkGoals()`; stars; twist.
- Modify `src/ui/scenarioHud.ts` — read goals from sim (delete `goalOk`), star result card, mechanic widgets.
- Split `src/render/scenarioView.ts` (447 lines): keep shared bits (flags, guest, crowd, particles) there; create `src/render/scenarios/{football,stage,storm,inspector,procession,comments}.ts`.
- Create `src/render/cinematic.ts` — entrance camera pan + visual slow-mo.
- Modify `src/render/cameraRig.ts` — optional focus override.
- Modify `src/ui/debug.ts` — one button per event id.
- Create `tools/eventcheck.ts`; add `"eventcheck": "tsx tools/eventcheck.ts"` to `package.json`.
- Modify `src/sim/bot.ts` — the active bot attempts each mechanic's main objective (keeps `simulate:check` meaningful).

Mechanic per event:

**Every event changes; no two play the same.** Events that share a mechanic get a `variant` with its own extra rule, so even siblings feel different.

| Event | mechanic / variant | Core verb | Goals |
|---|---|---|---|
| president (Sisi) | `motorcade` / `escort` | Carry the order along a guarded carpet lane against a timer | `serveGuest`, `inTime` |
| macron | `motorcade` / `photo` | Same delivery, plus a photo-op: when the photographer counts down 3‑2‑1, stand on the marker next to Macron | `serveGuest`, `inTime`, `photo` |
| trump | `motorcade` / `reorder` | Same delivery, but he changes his order twice mid-event (twist) | `serveGuest`, `inTime` |
| salah | `football` / `penalty` | Penalty kicks: push the ball past a moving goalkeeper (Salah cheers each goal) | `serveGuest`, `goals` |
| messi | `football` / `dribble` | Dribble the ball through 4 cones, then score | `serveGuest`, `goals` |
| amrdiab | `stage` | Beat clock; player-served items on the beat build a combo | `serveGuest`, `beatCombo` |
| storm | `storm` | Dark + flashlight; animals escape, walk into them to herd back | `herd`, `noAngry` |
| inspector | `inspector` | Inspector walks a route of checkpoints; each must be clean/fixed before they arrive | `checkpoints` |
| wedding | `procession` / `zaffa` | Procession crosses the farm; deliver trays to guests before they pass out of range | `trays` |
| japan | `procession` / `tour` | Group stops at 3 tour spots; serve everyone at each stop, then stand in the group photo | `trays`, `photo` |
| influencer | `comments` | Live comment feed requests specific products; fulfil requests for big like jumps | `serveGuest`, `likes` |
| army | `bulk` | One huge order announced at the warning; stockpile and deliver to the truck | `bulkOrder` |

**New events (6):**

| Event | mechanic | Core verb | Goals |
|---|---|---|---|
| ⚽ Ahly vs Zamalek derby (الأهلي والزمالك) | `derby` | Red and white fans arrive in two lanes; a balance meter tips toward whichever side waits longer — keep it centred or the fans start chanting at each other (patience drops for both) | `balance`, `noAngry` |
| 🎬 Film shoot with "الزعيم" (Adel Emam lookalike) | `filming` | Red light / green light: when the director shouts "أكشن!" freeze (don't move) until "كات!"; move and serve during cuts. Moving during a take = retake | `takes`, `serveGuest` |
| 🦹 Thief at the farm (حرامي) | `chase` | A thief grabs money from the cash pile and runs; chase and tag him (he dodges, cuts through pens); the police officer blocks one exit | `catch` |
| 👨‍🍳 Cook-off with Chef Sherbini lookalike (الشيف الشربيني) | `cookoff` | Recipe cards appear one at a time (e.g. 2 eggs → pan, 1 milk → coffee); bring the right raw items to the café machines in order before each card's timer | `recipes` |
| 🌙 Iftar table (مائدة الرحمن) — Ramadan only | `iftar` | A long table with 12 places; fill every plate before the Maghrib countdown ends; after the call, everyone eats and tips | `plates` |
| 🌪️ Khamaseen sandstorm (خماسين) | `khamaseen` | Wind blows across the farm: piles lose items unless you cover them (stand on a pile 1.5 s to tarp it); visibility drops to a sandy haze | `covered`, `noAngry` |

### Task 1.1: Mechanic framework, single goal check, eventcheck harness

**Files:**
- Create: `src/sim/scenarios/mechanic.ts`, `tools/eventcheck.ts`
- Modify: `src/config/scenarios.ts`, `src/sim/scenario.ts`, `src/ui/scenarioHud.ts`, `package.json`

**Interfaces:**
- Produces:
  ```ts
  // src/sim/scenarios/mechanic.ts
  import type { SimWorld } from '../world';
  import type { ScenarioDef, ScenarioGoal } from '../../config/scenarios';
  export interface Mechanic {
    /** Called when the event goes active. */
    start(w: SimWorld, def: ScenarioDef): void;
    update(w: SimWorld, dt: number): void;
    /** Goal state for goals this mechanic owns; return undefined for goals it doesn't own. */
    goal(w: SimWorld, g: ScenarioGoal): boolean | undefined;
    /** 0..1 progress for the HUD bar of an owned goal (optional). */
    progress?(w: SimWorld, g: ScenarioGoal): number;
    /** Drop all temporary state (event end, time away, reload). Must be idempotent. */
    teardown(w: SimWorld): void;
  }
  export type MechanicId = 'basic' | 'motorcade' | 'football' | 'stage' | 'storm' | 'inspector' | 'procession' | 'comments' | 'bulk'
    | 'derby' | 'filming' | 'chase' | 'cookoff' | 'iftar' | 'khamaseen';
  export const BASIC: Mechanic = { start() {}, update() {}, goal: () => undefined, teardown() {} };
  ```
  `ScenarioSystem.checkGoals(): { goal: ScenarioGoal; ok: boolean; progress: number }[]` (used by both `finish()` and the HUD), `ScenarioSystem.mech: Mechanic`, `ScenarioSystem.stars: 0|1|2|3`.
  `ScenarioDef` gains `mechanic: MechanicId` (default `'basic'` while migrating), `when?: (w: SimWorld) => boolean`.

- [ ] **Step 1: Write the failing check** — `tools/eventcheck.ts`:
  ```ts
  /**
   * Headless scenario checks: runs each event on a grown farm and asserts goals/teardown.
   *   npm run eventcheck            all cases
   *   npm run eventcheck -- storm   one scenario id
   */
  import { SimWorld } from '../src/sim/world';
  import { SCENARIOS } from '../src/config/scenarios';
  import { serialize, restore, migrate } from '../src/sim/save';
  import { Bot } from '../src/sim/bot';

  const DT = 1 / 30;
  const only = process.argv[2];
  let fails = 0;
  const ok = (cond: boolean, msg: string) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; };

  /** A farm with every area open: run the active bot until it has bought `n` upgrades. */
  export function grownWorld(n = 45, seed = 7): SimWorld {
    const w = new SimWorld(seed), bot = new Bot(w, 'active');
    for (let i = 0; i < 30 * 60 * 400 && w.upgrades.bought < n; i++) { bot.update(DT); w.tick(DT); w.events.drain(() => {}); }
    return w;
  }

  function runUntilIdle(w: SimWorld, drive?: (w: SimWorld) => void, maxSec = 300): void {
    for (let i = 0; i < maxSec / DT && w.scenario.phase !== 'idle'; i++) { drive?.(w); w.tick(DT); w.events.drain(() => {}); }
  }

  const base = grownWorld();
  const snapshot = JSON.stringify(serialize(base, 0));
  const fresh = (): SimWorld => { const w = new SimWorld(7); restore(w, migrate(JSON.parse(snapshot))!); return w; };

  for (const def of SCENARIOS) {
    if (only && def.id !== only) continue;
    // 1. single goal source: HUD and finish() agree
    { const w = fresh(); w.scenario.trigger(def.id); runUntilIdle(w);
      ok(w.scenario.lastGoals.length === def.goals.length, `${def.id}: goals evaluated`); }
    // 2. away mid-event tears everything down
    { const w = fresh(); w.scenario.trigger(def.id);
      for (let i = 0; i < 20 / DT; i++) w.tick(DT);
      w.away = true; w.tick(DT); w.away = false;
      ok(w.scenario.phase === 'idle' && !w.scenario.powerCut, `${def.id}: away tears down`); }
    // 3. save mid-event restores clean
    { const w = fresh(); w.scenario.trigger(def.id);
      for (let i = 0; i < 20 / DT; i++) w.tick(DT);
      const animals = w.stations.map((s) => s.animals.length).join();
      const w2 = new SimWorld(7); restore(w2, migrate(JSON.parse(JSON.stringify(serialize(w, 0))))!);
      ok(w2.scenario.phase === 'idle' && w2.stations.map((s) => s.animals.length).join() === animals, `${def.id}: save mid-event is clean`); }
  }
  // 4. a fresh farm never picks an event whose area is locked
  { const w = new SimWorld(1); w.upgrades.bought = 99;
    for (let i = 0; i < 200; i++) { const d = (w.scenario as unknown as { pick(): { when?: (w: SimWorld) => boolean } | null }).pick(); if (d?.when) ok(d.when(w), 'pick respects when'); } }

  if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
  console.log('\nall event checks passed');
  ```
  Add `"eventcheck": "tsx tools/eventcheck.ts"` to `package.json` scripts.

- [ ] **Step 2: Run** `npm run eventcheck` — Expected: FAIL to compile/run on missing `lastGoals` shape or `when`, or PASS for 1–3 already; note which. (Case 4 typechecks only after Step 3.)

- [ ] **Step 3: Implement**
  - In `config/scenarios.ts`: add `mechanic: MechanicId` and `when?` to `ScenarioDef`; set `mechanic: 'basic'` on all entries for now. Gate: `when: (w) => w.cafe.open` on `inspector` (it checks tables), `when: (w) => w.staff.machines.some((m) => m.running)` on `storm`.
  - In `sim/scenario.ts`: add `mech: Mechanic = BASIC`; registry `MECHANICS: Record<MechanicId, Mechanic>` (only `basic` for now); `pick()` filters with `(!s.when || s.when(w))`; on `scenarioStart` call `this.mech = MECHANICS[def.mechanic]; this.mech.start(w, def)`; in `update` call `this.mech.update(w, dt)` while `active`/`settle`; in `finish()` and in the `w.away` branch call `this.mech.teardown(w)`.
  - Move the goal switch from `finish()` into `checkGoals()`; it first asks `this.mech.goal(w, g)` and falls back to the built-in cases. `finish()` uses `checkGoals()`.
  - In `ui/scenarioHud.ts`: delete `goalOk`; use `sim.scenario.checkGoals()`.

- [ ] **Step 4: Run** `npm run eventcheck && npm run build && npm run simulate:check` — Expected: all PASS, pacing unchanged (behaviour identical so far).

- [ ] **Step 5: Commit** `git commit -am "Scenario mechanics framework, single goal check, eventcheck"`

### Task 1.2: Shared upgrades — entrance cinematic, star grades, mid-event twist

**Files:**
- Create: `src/render/cinematic.ts`
- Modify: `src/render/cameraRig.ts`, `src/main.ts`, `src/sim/scenario.ts`, `src/config/scenarios.ts`, `src/ui/scenarioHud.ts`, `src/ui/style.css`, `src/sim/events.ts`

**Interfaces:**
- Produces:
  - `ScenarioDef.twists?: { at: number; text: string; kind: 'reorder' | 'extend' | 'rush' }[]` — `at` = seconds into active.
  - `ScenarioSystem.stars: 0|1|2|3` computed in `finish()`: 0 = any goal failed; 1 = all goals; 2 = all goals + no angry + finished with ≥ 25% time left on the guest's patience (or no guest); 3 = 2-star + mechanic bonus (`mech.goal(w, 'bonus') === true`). Reward multiplier: `[0, 1, 1.5, 2][stars]`.
  - New event `'scenarioTwist'` (product = '', n = twist kind index).
  - `scenarioEnd`: `n` stays won (1/0); `id` carries `stars`.
  - `CameraRig.focus(x: number, z: number, seconds: number): void` — eases to a point, holds, eases back (real time).
  - `Cinematic.play(kind: 'entrance', x: number, z: number)` — calls `rig.focus`, sets `timeScaleVisual = 0.35` for 1.2 s (animations only, via a multiplier main passes to view `sync` dt, **not** to `sim.tick`), shows letterbox bars.

- [ ] **Step 1: Failing check** — append to `tools/eventcheck.ts`:
  ```ts
  { const w = fresh(); w.scenario.trigger('trump'); let twist = false;
    for (let i = 0; i < 300 / DT && w.scenario.phase !== 'idle'; i++) { w.tick(DT); w.events.drain((e) => { if (e.type === 'scenarioTwist') twist = true; }); }
    ok(twist, 'trump: twist fires');
    ok(w.scenario.stars === 0, 'trump unattended: 0 stars'); }
  ```
- [ ] **Step 2: Run** `npm run eventcheck -- trump` — Expected: FAIL (`scenarioTwist` / `stars` missing).
- [ ] **Step 3: Implement**
  - Sim: `twistIx` index; in `active`, when `def.duration - this.t >= def.twists[twistIx].at` apply and advance: `reorder` → replace the guest's lines with a different open product of equal qty, reset `left`; `extend` → `this.t += 15`; `rush` → `arrivalMult` × 1.5 for the rest (store `this.twistMult`). Emit `scenarioTwist`.
  - Add twists (one per event that has one): trump `{ at: 20, kind: 'reorder', text: 'ترامب غيّر رأيه! طلب جديد 😅' }` and a second reorder at 40 (`twist` becomes `twists: Twist[]`); storm `{ at: 30, kind: 'extend', text: 'العاصفة لسه شغالة! ⛈️' }`; salah/messi `{ at: 30, kind: 'rush', text: 'فانز زيادة جايين! 🏃' }`.
  - Stars + reward multiplier in `finish()`; emit `scenarioEnd` with `id = stars`.
  - Render: `cinematic.ts` triggered from `main.ts` on `scenarioStart` when the def has a guest (focus on `LAYOUT.vipStage.entry`) or on the mechanic's anchor point; letterbox = two fixed DOM bars, CSS transition. Sound: `sfx.sparkle()` + existing music.
  - HUD: result card shows ⭐ x3 (filled/empty) animating in one by one (CSS `@keyframes pop`, 250 ms stagger); twist shows as a toast in the event colour.
- [ ] **Step 4: Run** `npm run eventcheck && npm run build`. Then `npm run host`, open on phone, debug panel → trigger trump: confirm camera pan + bars on entrance, twist toast at ~25 s, star card. **Inspect a portrait screenshot** — bars and card must not cover the joystick.
- [ ] **Step 5: Commit** `git commit -am "Scenario entrance cinematic, star grades, mid-event twists"`

### Task 1.3: Debug buttons per event + bot support

**Files:** Modify `src/ui/debug.ts`, `src/sim/bot.ts`

- [ ] **Step 1:** In debug panel add a second row listing every `SCENARIOS` entry as a button (`data-ev="<id>"`) → `sim.scenario.trigger(id)`. Keep the existing cycle button.
- [ ] **Step 2:** Bot (`profile === 'active'`): before lane work, if `w.scenario.active`, call `this.scenarioObjective()` which returns a target `{ task, x, z } | null` provided by the mechanic: add optional `Mechanic.botTarget?(w): { x: number; z: number } | null`; the bot walks there (task `'wait'` semantic is fine). Casual bot ignores events (that's the realistic case).
- [ ] **Step 3: Run** `npm run simulate:check` — Expected: PASS. Record active/casual `scenariosWon` per session with `--verbose` in the phase report.
- [ ] **Step 4: Commit** `git commit -am "Debug: trigger any event; bot attempts event objectives"`

### Task 1.4: Storm — darkness, flashlight, escaped animals

**Files:** Create `src/sim/scenarios/storm.ts`, `src/render/scenarios/storm.ts`; modify `src/config/scenarios.ts`, `src/render/renderer.ts`, `src/sim/scenario.ts` (register), `src/render/scenarioView.ts` (delegate).

**Interfaces:**
- Produces:
  ```ts
  export interface Stray { station: number; x: number; z: number; rot: number; tx: number; tz: number; home: boolean }
  export class StormMechanic implements Mechanic {
    strays: Stray[] = [];
    /** Escapes this event (for HUD "3/5"). */
    total = 0;
  }
  ```
  New goal `'herd'` (label `'رجّع الحيوانات'`). Bonus (3★): all strays home before the event's halfway point.
  `Renderer.setNight(k: number)` (used again in Phase 4) and a player-attached `SpotLight` "flashlight" created lazily.
- Rules: on start, every 6 s (max 5) pick a random open station via `w.rng`, spawn a stray at its trough, wandering to random yard points (reuse `moveToward`). Player within 1.0 → stray walks itself back home (`home = true`) and disappears at the pen. Strays don't reduce `st.animals` in the sim (visual stand-in; production pauses for that station while it has a stray out: multiply that station's update dt by 0 — add `Station.paused` flag checked in `Station.update`). `teardown` clears strays and all `paused` flags.
- Visual: `setMood(0.25)`, flashlight cone on the player (radius ~5), lightning via existing `lightning()`, rain particles (existing). Strays reuse animal models with a 💨 sprite.

- [ ] **Step 1: Failing check:**
  ```ts
  { const w = fresh(); w.scenario.trigger('storm'); runUntilIdle(w);
    ok(!w.scenario.lastGoals.find((g) => g.goal === 'herd')!.ok, 'storm unattended: herd fails');
    ok(w.stations.every((s) => !s.paused), 'storm: no paused stations after'); }
  { const w = fresh(); w.scenario.trigger('storm');
    runUntilIdle(w, (w) => { const m = w.scenario.mech as import('../src/sim/scenarios/storm').StormMechanic;
      const s = m.strays.find((x) => !x.home); if (s) { w.player.x = s.x; w.player.z = s.z; } });
    ok(w.scenario.lastGoals.find((g) => g.goal === 'herd')!.ok, 'storm herded: herd passes'); }
  ```
- [ ] **Step 2: Run** `npm run eventcheck -- storm` — Expected: FAIL.
- [ ] **Step 3: Implement** the sim mechanic, `Station.paused`, config `mechanic: 'storm', goals: ['herd', 'noAngry']`, render module, `botTarget` = nearest stray.
- [ ] **Step 4: Run** `npm run eventcheck && npm run build && npm run simulate:check`; phone playtest storm via debug button; note FPS from the debug panel.
- [ ] **Step 5: Commit** `git commit -am "Storm event: darkness, flashlight, herd escaped animals"`

### Task 1.5: Inspector — walking checklist

**Files:** Create `src/sim/scenarios/inspector.ts`, `src/render/scenarios/inspector.ts`; modify config, registry, HUD.

**Interfaces:**
- ```ts
  export interface Checkpoint { kind: 'table' | 'machine' | 'pile' | 'cash'; ref: number; x: number; z: number; passed: boolean | null }
  export class InspectorMechanic implements Mechanic { route: Checkpoint[] = []; at = 0; ix = 0; iz = 0; }
  ```
  Goal `'checkpoints'` (label `'كل نقط التفتيش سليمة'`) = every checkpoint `passed === true`. Bonus: none failed **and** inspector tip.
- Rules: route = up to 5 checkpoints chosen by `w.rng` among: dirty-able café tables, running machines, a station pile (must be ≤ 80% full, "tidy"), shop cash pile (must be collected). Inspector walks between them at 1.2 u/s, stops 2 s at each, judges it on arrival. Before the event, the start forces 2 problems: one table dirty, one machine jammed (via existing jam API) so there's always work. Event ends when the route is done.
- HUD: a vertical checklist with icons; the next checkpoint pulses and the guide arrow points at it.

- [ ] **Step 1: Failing check:** unattended → `checkpoints` false; driven (teleport player to each next unfixed checkpoint and call `w.tick` so the existing fix/clean/collect interactions run) → true.
- [ ] **Step 2–5:** run → FAIL; implement; run all checks + phone playtest + portrait screenshot of the checklist; commit `"Inspector event: walking checklist"`.

### Task 1.6: Football (Salah = penalty, Messi = dribble)

**Files:** Create `src/sim/scenarios/football.ts`, `src/render/scenarios/football.ts`; add `LAYOUT.yardGoal` and `LAYOUT.yardCones` (+ layoutcheck: goal and cones must not overlap tiles/solids).

**Interfaces:** `FootballMechanic { ball: { x; z; vx; vz }; scored: number; keeper: { x: number; dir: 1 | -1 }; cones: boolean[] }`; goal `'goals'` (label `'جوّن ٣ أهداف'`, target 3). Bonus: 5 goals. Each goal: `tipMult` for crowd ×(1 + 0.5·scored), confetti, chant SFX, the star celebrates (Salah's prayer-pose look-alike → keep it as arms-up cheer; Messi points to the sky).
- Shared rules: ball starts at the kick spot. Player overlap (r 0.6) sets ball velocity = player velocity × 1.6 + 2 in facing direction; friction 2.5/s; bounce off `SOLIDS` and bounds. Ball inside goal box → `scored++`, ball resets after 1 s. The guest still needs serving (`serveGuest`).
- `penalty` (Salah): a goalkeeper slides along the goal line (1.6 u/s, bounces at the posts). Ball touching the keeper = saved, resets.
- `dribble` (Messi): 4 cones in a zigzag; a goal only counts if the ball passed within 0.8 of every cone since the last reset (`cones[]` all true). Cones light up when passed.
- [ ] Steps: failing check (unattended `goals` false for both; driven: script `w.input` toward ball then toward goal for salah, through cones then goal for messi — assert ≥ 3 each; driven messi straight to goal without cones → `scored === 0`), implement, checks + phone playtest (does pushing feel good with the joystick? tune numbers in config), commit `"Football events: Salah penalties, Messi dribble"`.

### Task 1.7: Comments feed (influencer)

**Files:** Create `src/sim/scenarios/comments.ts`, `src/render/scenarios/comments.ts` (DOM feed in `ui` is fine — put it in `src/ui/commentFeed.ts`).

**Interfaces:** `CommentsMechanic { requests: { product: ProductId; t: number; done: boolean }[] }`. A request = "حد عايز 🥚 ×3!" lasting 15 s; fulfilling = any customer served with that product while the request is open (hook the `'sell'` event path in `customers.ts:232` via `w.scenario.onSell(product)`). Fulfilled → `likes += 3`; normal fast service still `+1`. `likesTarget` raised to 20. Bonus: every request fulfilled.
- UI: scrolling feed at the right edge (Arabic comments from a small pool + ❤️ bursts), max 4 visible, portrait-safe.
- [ ] Steps: failing check (driven: requests fulfilled → `likes` passes), implement, checks + **portrait screenshot**, commit `"Influencer event: live comment requests"`.

### Task 1.8: Stage beat (Amr Diab)

**Files:** Create `src/sim/scenarios/stage.ts`, `src/render/scenarios/stage.ts`; `src/audio.ts` (beat-synced pop loop at the same BPM).

**Interfaces:** `StageMechanic { bpm = 100; beatT: number; combo: number; best: number }`; `onPlayerServeItem()` called where the player (not cashier) hands an item (`customers.ts` serve path when `w.playerAtLane(lane)`). On-beat window ±0.12 s → `combo++`, else `combo = 0`. Goal `'beatCombo'` (label `'كومبو ٨ على الإيقاع'`). Bonus: combo 16. Crowd tips × (1 + combo/8).
- Visual: stage with lights pulsing on the beat, a beat ring under the player's lane that shrinks to the hit moment.
- [ ] Steps: failing check (driven: player at lane, only serve on beat by toggling position → combo ≥ 8), implement, checks + phone playtest (is the window fair on a phone? tune), commit `"Amr Diab event: serve on the beat"`.

### Task 1.9: Motorcade lane (presidents) — escort / photo / reorder

**Files:** Create `src/sim/scenarios/motorcade.ts`; extend shared render (guards line the carpet, photographer + flash for `photo`).

**Interfaces:** goal `'inTime'` (label `'وصّل قبل الوقت'`): guest served within `def.guest.patience × 0.6`. Guards block walking off the carpet strip while the player carries guest items (add a temporary extra-solids list on `SimWorld`: `w.extraSolids: Rect[]`, used by `updatePlayer`; teardown empties it). Bonus: served within 40% of patience.
- `escort` (Sisi): as above; the motorcade honks and guards salute when you arrive.
- `photo` (Macron): after serving, a photographer counts 3‑2‑1 (event `'scenarioCue'`, n = count); goal `'photo'` (label `'اتصوّر مع الضيف'`) passes if the player stands within 0.7 of `LAYOUT.vipStage.photo` at 0. Two attempts.
- `reorder` (Trump): uses the two `reorder` twists from Task 1.2; `inTime` measures from the **last** reorder.
- [ ] Steps: failing check (unattended `inTime` false for all three; bot-driven passes; macron driven without standing on the marker → `photo` false, with → true), implement, checks + playtest, commit `"President events: escort, photo-op, changing order"`.

### Task 1.10: Procession (wedding, Japanese tour)

**Files:** Create `src/sim/scenarios/procession.ts`, `src/render/scenarios/procession.ts`.

**Interfaces:** `ProcessionMechanic { path: {x,z}[]; head: number; guests: { x; z; want: ProductId; served: boolean }[] }`. Group moves along a path (`LAYOUT.processionPath`, validated by layoutcheck) at 0.8 u/s. Player within 1.2 of an unserved guest while carrying their product → hands it (one item each), coins + zaffa SFX. Goal `'trays'` (label `'خدّم ٨ من المعازيم'` / tour variant text from config). Bonus: everyone served.
- `zaffa` (wedding): drummers + dancing bride/groom lead; group never stops.
- `tour` (Japan): group stops 6 s at each of 3 tour stops (`stops` in config); at the last stop the guide calls a group photo — goal `'photo'` (shared with Task 1.9) at the stop's photo marker.
- [ ] Steps: failing check, implement, checks + portrait screenshot (path must be visible in camera framing), commit `"Wedding and tour events: serve the moving procession"`.

### Task 1.11: Bulk order (army)

**Files:** Create `src/sim/scenarios/bulk.ts`; HUD shows the order list during `warn` (warning extended to 45 s for this event so planning is possible).

**Interfaces:** order = 3 products × big qty (scaled by `perSec`), delivered at the army truck (reuse `LAYOUT.dock.load`). Goal `'bulkOrder'` (label `'كمّل طلب الجيش'`). Bonus: complete in first half.
- [ ] Steps: failing check, implement, checks, commit `"Army event: plan and fill a bulk order"`.

### New events (Tasks 1.12–1.17)

Each new event: add the `ScenarioDef` entry (icon, Egyptian Arabic title/hint/intro, colour, tint, music, props, `minUpgrades`, `when`), its looks in `config/looks.ts`, a sim mechanic, a render module, `botTarget`, and eventcheck cases (unattended → main goal fails; driven → passes; away/save cases come free from Task 1.1's loop). The album "ضيوف مميزين" page picks up new guests automatically (it maps `SCENARIOS.filter(s => s.guest)`). Each task: failing check → implement → `npm run eventcheck && npm run build && npm run simulate:check` → phone playtest via the debug button (+ portrait screenshot when it adds HUD) → commit.

### Task 1.12: Ahly vs Zamalek derby

**Files:** `src/sim/scenarios/derby.ts`, `src/render/scenarios/derby.ts`, looks `fanWhite`, HUD balance meter.
**Interfaces:** `DerbyMechanic { red: number; white: number; meter: number /* -1..1 */; clash: number }`. Crowd customers get `side: 'red' | 'white'` (from the look seed parity, no new RNG). Every second, `meter` moves toward the side whose front customers have waited longer (sum of waited time per side, normalised). `|meter| > 0.7` for 3 s → "clash": both sides' patience −20%, chant SFX, `clash++`. Goal `'balance'` (label `'خلّي الجمهورين مبسوطين'`) = `clash === 0`. Bonus: served ≥ 10 of each side. No single guest; config `minUpgrades: 30`, `music: 'chant'`, flags red + white.
**Check:** unattended → `balance` false (clash happens); driven (serve the side the meter leans to) → true.
Commit `"Derby event: keep Ahly and Zamalek fans balanced"`.

### Task 1.13: Film shoot (الزعيم)

**Files:** `src/sim/scenarios/filming.ts`, `src/render/scenarios/filming.ts`, look `adelemam` (grey suit, glasses, friendly) + crowd `film`.
**Interfaces:** `FilmingMechanic { take: boolean; t: number; retakes: number; good: number }`. Cycle: cut 6–9 s (`w.rng`) → "أكشن!" take 4–6 s → "كات!". During a take, player speed > 0.1 → retake (`retakes++`, the director facepalms, take restarts). Customers keep arriving (crowd watches). Goal `'takes'` (label `'٣ مشاهد من غير إعادة'`) = `good >= 3`. Bonus: 0 retakes. Big on-screen clapperboard + red "REC" dot during takes; event `'scenarioCue'` for each shout.
**Check:** driven never stopping → `takes` false; driven stopping during takes (input = 0 when `take`) → true.
Commit `"Film shoot event: freeze on action"`.

### Task 1.14: Thief chase

**Files:** `src/sim/scenarios/chase.ts`, `src/render/scenarios/chase.ts`, looks `thief` (striped shirt, cap, money bag) + `police`.
**Interfaces:** `ChaseMechanic { thief: { x; z; rot; speed; stolen: number }; caught: boolean }`. On start the thief takes 30% of `w.cash.value` (min 100) and runs: flee steering away from the player toward random waypoints (`w.rng`), speed 1.15 × player base, slows to 0.8 × when passing through pens/field (mud). Player within 0.7 → caught: money returned × 1.5, police officer leads him away. Escaped at the end → money lost. Goal `'catch'` (label `'امسك الحرامي'`). Bonus: caught in under 20 s. Never starts if `w.cash.value < 100` (`when`).
**Check:** unattended → `catch` false and cash reduced; driven (chase) → caught, cash restored ×1.5; tab-away mid-chase → stolen money returned (teardown), no loss.
Commit `"Thief event: chase and catch"`.

### Task 1.15: Cook-off (Chef Sherbini lookalike)

**Files:** `src/sim/scenarios/cookoff.ts`, `src/render/scenarios/cookoff.ts`, look `sherbini` (chef hat, apron), HUD recipe card. `when: (w) => w.cafe.open`.
**Interfaces:** `CookoffMechanic { cards: { items: { product: ProductId; qty: number }[]; machine: string; t: number; done: boolean }[]; ix: number }`. 4 cards, 25 s each; card = raw items to drop at a named café machine input (hook where the player feeds a kitchen machine). Done card → chef applauds + bonus tip. Goal `'recipes'` (label `'خلّص ٣ وصفات'`) = ≥ 3 done. Bonus: all 4.
**Check:** unattended → false; driven (teleport + carry + drop) → true.
Commit `"Cook-off event: recipe cards with the chef"`.

### Task 1.16: Iftar table (Ramadan only)

**Files:** `src/sim/scenarios/iftar.ts`, `src/render/scenarios/iftar.ts`, `LAYOUT.iftarTable` (layoutcheck). `when: (w) => w.clock.ramadan`; debug button bypasses `when`.
**Interfaces:** `IftarMechanic { plates: (ProductId | null)[]; t: number; eating: boolean }`. 12 plates, each wants one product (round-robin over open products). Walk along the table carrying items → fills plates you pass (one per 0.3 s). Countdown to Maghrib (60 s); at 0, lanterns light, cannon "boom" SFX (مدفع الإفطار), guests eat 10 s and tip per filled plate. Goal `'plates'` (label `'جهّز كل الأطباق قبل المغرب'`). Bonus: done with ≥ 20 s left.
**Check:** unattended → false; driven → true; with `w.clock.ramadan = false`, `pick()` never returns it (Review Focus 3).
Commit `"Iftar table event for Ramadan"`.

### Task 1.17: Khamaseen sandstorm

**Files:** `src/sim/scenarios/khamaseen.ts`, `src/render/scenarios/khamaseen.ts`, renderer haze (`setHaze(color, k)` — sandy fog near, reused by Phase 4).
**Interfaces:** `KhamaseenMechanic { covered: boolean[]; lost: number }` per station. Every 4 s, each uncovered station pile loses 1 item (blown away — flying sprite). Standing on a pile 1.5 s covers it (tarp model). Goal `'covered'` (label `'غطّي كل الأكوام'`) = all open station piles covered by the end; plus `noAngry`. Bonus: `lost === 0`. Distinct from storm: no power cut, no herding, warm sandy palette.
**Check:** unattended → `covered` false, `lost > 0`; driven (visit each pile) → true; teardown removes tarps.
Commit `"Khamaseen event: cover the piles"`.

### Task 1.18: Phase wrap-up

- [ ] Remove `'basic'` from any remaining scenario (every event has its own mechanic); keep `BASIC` only as fallback.
- [ ] Rebalance weights/`minUpgrades` so new players see variety early: first events at ~22 upgrades are japan, wedding, influencer, khamaseen; presidents last.
- [ ] Run `npm run build && npm run simulate:check && npm run cafeflow && npm run eventcheck`.
- [ ] Update `docs/DESIGN.md` (mechanics table, stars, twists, cinematic is visual-only).
- [ ] Commit `"Phase 1 wrap-up: docs"`. **Stop for the user's phone playtest.**

---

# Phase 2 — #7 Fewer, bigger events (merge rush into scenarios)

**Re-check first:** re-read `rush.ts`, `scenario.ts` after Phase 1.

**Design:**
- Real-clock rushes become **mini events** inside the scenario system: `ScenarioDef.tier: 'mini' | 'big'`. Minis (market Thursday, iftar, school, breakfast café) keep their `when(clock)` and current behaviour (burst + featured product + no-angry bonus), short banner, no cinematic, no stars.
- Pacing: one director chooses the next event: minis every 4–6 min, a big event every 12–18 min of active play, never back-to-back (≥ 90 s gap). Big events get rarer (`SCENARIO_GAP` → { min: 720, max: 1080 }).
- Golden animal: rarer (gap ×2), but reward ×2; daily task `golden` stays at base 1 (must stay finishable — check in eventcheck by simulating 80 min and asserting ≥ 1 golden spawn).

**Everything that depends on `RushSystem` (must be migrated in one task):**
- `w.stats.rushesCleared` + `'rush'` daily task (`config/tasks.ts`) → counts minis cleared.
- `'rushWarn' | 'rushStart' | 'rushEnd'` events → handled by main.ts (sfx alarm, toast) and `tools/simulate.ts` (money.rush). Keep event names for minis so these keep working.
- `w.rush.phase` guard in `scenario.ts` idle → removed (single director).
- Debug `rush` button → triggers a random mini.
- `customers.ts` reads of `w.rush` (featured product, arrival mult) → read from scenario.
- Bot logic referencing rush.

**Tasks:**
- 2.1 Failing eventcheck: 80 simulated active minutes → ≥ 8 minis, 3–7 big events, no two events within 90 s, ≥ 1 golden.
- 2.2 Add `tier` + director; port rush kinds into `SCENARIOS` as minis; delete `RushSystem` and update every dependent above. Run all checks; `simulate:check` must still pass (rush bonus money now arrives via minis — compare `--verbose` totals before/after, within ±10%).
- 2.3 Golden rarity + reward; DESIGN.md; commit; playtest gate.

---

# Phase 3 — #5 Regular customers with personality

**Re-check first:** `customers.ts` spawn path, `pickType`, `customers.ts` render bubbles, album.

**Design:**
- A **regular** is identified from the existing look seed (no new RNG draws — keeps simulate identical): `regularId = look % 37 < 6 ? (look >>> 5) % REGULARS.length : -1`.
- `config/regulars.ts`: ~10 named regulars (e.g. عم سيد الفلاح، الحاجّة فاطمة، كريم الطالب، الأسطى حمادة…), each with a fixed look, favourite product, and line pools: `greet`, `happy`, `waiting`, `angry` (Egyptian Arabic, short).
- `RegularsSystem` (sim): per regular `visits`, `friendship` 0..5 (+1 per happy visit, −1 angry). Saved as `regulars?: Record<string, { visits: number; friendship: number }>`.
- Effects: friendship ≥ 3 → +20% patience; 5 → occasional gift (a free item or a trophy candidate for Phase 6) and their name in gold.
- UI: speech bubbles above head (`greet` on arrival, `waiting` when patience < 40%, `happy`/`angry` on leave) via existing canvas sprite system, max 2 talking at once; album gains a page "زباين دايمين" showing name + hearts.

**Tasks:** 3.1 config + sim system + save fields + eventcheck-style `tools/regularscheck.ts` (same seed → same regular sequence; friendship changes; save round-trip). 3.2 Bubbles render. 3.3 Album page + friendship perks. 3.4 Docs, checks (`simulate:check` unchanged ±2%), commit, playtest.

---

# Phase 4 — #4 Living day/night farm

**Re-check first:** `DESIGN.md` says "golden evening, quieter night" exists, but `renderer.ts` has a fixed sky. Confirm what (if anything) uses `clock.hour` besides rushes before building.

**Design:**
- Visual only, from the **device clock** in render; sim unaffected except existing `w.clock` gates.
- `Renderer.setTimeOfDay(hour: number)` replacing the fixed sky: keyframes (dawn 5–7 pink, day, golden 16–18, dusk, night 20–5 deep blue) for sky colour, fog, hemi/sun colour & intensity, sun direction. Combine with storm mood: final brightness = `timeOfDay × mood + flash` — `applyMood` must run every frame (cheap).
- Night: lamps on posts / shop sign / café string lights (emissive meshes + 2–3 `PointLight`s max, quality-gated), windows glow, fireflies particles.
- Calendar dressing: Ramadan (from `clock.ramadan`) → فوانيس on the shop and café + garland; Eid dates table → balloons/garlands. Data in `config/seasons.ts`.
- Call to prayer at sunset: **open question for the user** — options: (a) a short licensed/recorded clip, (b) no sound, just lights coming on + a calm ambient change. Default: (b).

**Tasks:** 4.1 sky/lighting keyframes + debug "hour" slider (screenshots at 6, 12, 17, 21 — portrait). 4.2 night props + quality gating + FPS note. 4.3 seasonal dressing + debug toggle "رمضان". 4.4 docs, commit, playtest.

---

# Phase 5 — #2 Decorate the farm

**Re-check first:** `config/layout.ts`, `tools/layoutcheck.ts`, upgrade tiles placement.

**Design:**
- **Decor spots**: ~12 fixed spots in `LAYOUT.decorSpots` (around the shop front, café terrace, pond, gate), validated by layoutcheck (no overlap with tiles, work spots, solids, paths).
- **Inventory**: `DecorSystem { owned: Record<DecorId, number>; placed: (DecorId | null)[] }` — a general placeable-item store so Phase 6 trophies are just more `DecorId`s.
- `config/decor.ts`: items with `{ id, name, icon, model: DecorModelId, price?: number, source: 'shop' | 'trophy' | 'gift' }`. Starter shop items (palm tree, flower pots, fountain, lanterns, bench, sign colours) bought with cash.
- Interaction: walking onto an empty spot shows a ✨ ring; a "🎨" side button opens a decorate sheet: pick a spot → pick an item. No free placement (keeps layout safe).
- Small gameplay hook: each placed item +1% arrival rate (cap +10%) so it's not purely cosmetic. Saved as `decor?: { owned; placed }`.
- Farm name: player can name the farm; shown on the gate sign.

**Tasks:** 5.1 sim + config + save + check script (place/remove/round-trip, arrival cap). 5.2 layout spots + layoutcheck rules + **portrait screenshots of every spot**. 5.3 decorate sheet UI + models. 5.4 farm name sign. 5.5 docs, commit, playtest.

---

# Phase 6 — #1 Non-cash rewards (trophies, cosmetics)

**Re-check first:** Phase 5's `DecorSystem`, Phase 1 stars, album, daily tasks.

**Design:**
- **Trophies** = decor items with `source: 'trophy'`, earned not bought:
  - Each big event, first 3★ win → its trophy (صورة مع صلاح، كورة ميسي، لوحة "الرئيس زار المزرعة"، ميكروفون الهضبة، كلاكيت الزعيم، كأس الديربي، فانوس المائدة، صفّارة العسكري، ...). 1–2★ → a smaller version (frame vs. statue).
  - Album pages complete → page trophy. Regular at friendship 5 → their gift item.
- **Trophy shelf** in the shop: shows all trophies (locked silhouettes for missing) → a long-term collection goal.
- **Cosmetics**: player hat/shirt colours and shop sign styles unlocked by milestones (served 1k, 10 events won, 7-day streak). `CosmeticsSystem { unlocked: Set<string>; equipped: { hat; shirt; sign } }`.
- Event result card shows "🏆 جديد!" with the trophy model spinning.
- Rewards stay partly cash so pacing holds; trophies are **in addition**.
- Saved as `trophies?: string[]`, `cosmetics?: { unlocked: string[]; equipped: {...} }`.

**Tasks:** 6.1 trophy data + award hooks (scenario finish, album page, regulars) + check script. 6.2 trophy models + shelf + result card. 6.3 cosmetics system + wardrobe UI. 6.4 docs, full checks, commit, final playtest.

---

# Phase 7 — Risk and consequences: sick animals, spoiled goods, bills and taxes

**User's request (2026-10-03):** animals can die; products can spoil and selling them causes trouble; taxes and similar pressures. The user asked me to think the design through.

## Design principles

1. **You always see it coming.** Every risk has a warning stage (icon over the thing + guide arrow + toast) with enough time to react. Losing something should feel like *your* call, never bad luck.
2. **Active play only.** Nothing gets sick, spoils or gets fined during time away (the same rule as "offline never lowers the rating"). Coming back is always good news.
3. **Every risk has a fix you can buy.** Each new pressure comes with an upgrade that softens it (vet, fridge, accountant), so it doubles as a late-game money sink and a reason to keep upgrading.
4. **Choices, not punishments.** The most fun part is the gamble: sell the stale milk cheap and hope nobody notices, or throw it away?
5. **Unlocks gradually.** Spoilage after the café, animal health after cows, bills from day 3, the tax man after the factories. A new player never meets any of it.

## 7A — Animal health (sick, then the vet, death only if you ignore it)

- Each pen gets a **health bar** (0–100, shown on the barn sign as 💚/💛/❤️‍🩹).
- Health **drops** when: the trough has been empty a long time (feeding finally matters for more than a boost), the pen is over its comfort size (expanding the pen fixes it), or a storm event left strays out at the end.
- Health **rises** slowly while the trough is fed and the pen isn't crowded.
- **Below 50:** the pen produces 25% less and its animals look sick (🤒 bubble, slow walk, grey tint).
- **At 0 for 60 s of active play:** a **"الحيوان تعبان!" emergency**: one animal lies down and a countdown starts (45 s). Bring the vet (a walk-in zone at the HR office) or a 💊 medicine item from the shop. If the timer runs out, the animal dies: the pen loses one animal, there's a small sad moment (a little angel 👼 floats up, not graphic) and a toast. You can rebuy it at the normal tile.
- **Vet upgrade** (HR office tile): health drains slower; level 2 = the vet walks over by themselves when an emergency starts (automation, like the other staff).
- **Sim:** `Station.health`, `Station.sickT`; `HealthSystem` in `src/sim/health.ts`; saved as `stations[id].health` (optional, default 100).

## 7B — Freshness and spoilage (with the stale-goods gamble)

- Items on **piles and counters** get an age. Milk spoils fastest, eggs are slow, cooked café dishes are in between; corn and wheat never spoil. Sim cost stays low: one age counter per slot group, as the oldest item's age (FIFO).
- **Fresh → stale → spoiled:**
  - *Stale* (counter/pile shows a brown tint and 🪰): still sellable.
  - *Spoiled* (🤢): nobody buys it; it just takes up space and lowers the shop rating while it sits on the counter.
- **The gamble:** stale items sell at a 40% discount. Each stale item sold has a chance (from the customer type: grandma 5%, student 15%) that the customer **comes back sick**: an angry "انت بعتلي لبن بايظ!" visit asking for a refund. Pay the refund (×2 price) to keep your rating, or refuse and take a rating hit and a bad review toast. Doctors and VIPs refuse stale goods outright.
- **The bin:** a 🗑️ spot by the shop. Walking a stack of stale/spoiled items there throws them away (small cleanliness bonus: +rating sparkle).
- **Fridge upgrade** (shop line): the counter's spoil timers run ×0.5, then ×0.25. A cold store for the café does the same for dishes.
- **Ties into events:** the inspector event gets a new checkpoint, "no spoiled food on the counter", and a fine if there is.
- **Sim:** `Freshness` helper in `src/sim/fresh.ts`, ages kept per pile/counter; customer `sickReturn` flag; never ages while `w.away`.

## 7C — Bills and the tax man

- **Monthly bills (every real day = one "month"):** electricity (scales with machines/belts owned) and water (scales with animals). Shown in a 🧾 side-button panel with a due date. Paying on time is one tap. Late → electricity cut until paid (belts and machines stop, exactly like the storm's power cut, which already exists in the sim). This is a reminder, never a trap: there are 2 warnings before the cut.
- **The tax man (مأمور الضرايب) as a scenario event:** he walks the farm with a clipboard counting what you own (camera follows him). Taxes = a % of earnings since his last visit. You choose:
  1. **Pay in full:** rating + trust bonus with companies (better truck contracts).
  2. **Ask to pay in installments (تقسيط):** smaller payments over 3 visits, no bonus.
  3. **Hide stock** (mini-game: carry piles behind the barn before he reaches them): if he doesn't catch you, you save money; if he does, you pay a fine ×2. A deliberately cheeky, fun choice.
- **Accountant upgrade (محاسب):** pays bills automatically and gives a 10% tax discount.

## Balance and checks

- `simulate:check` must stay green. Bills/taxes are tuned to remove ~5–8% of active income, and less with the upgrades. The casual bot must not get stuck in a death or power-cut spiral: add a pacing target "casual: no animal deaths and no power cut in 7 days".
- New check script `tools/riskcheck.ts`: no health loss/spoilage/bill during `away`; an empty trough for N minutes → sick → emergency → death only after the timeout; refund flow; fridge halves spoil time; save round-trip of health/ages/bill state.

## Build order inside the phase

1. 7B freshness + bin + fridge (most gameplay value, touches the most code)
2. 7A health + vet + emergency
3. 7C bills, then the tax-man event (reuses the scenario mechanic framework from Phase 1)

## Decisions to confirm with the user (defaults in bold)

- Can animals die at all? **Yes, but only after a sick stage plus a 45 s emergency you can always fix.**
- Stale-goods gamble: **on** (sell at a discount with a refund risk).
- Taxes: **a scenario event with 3 choices** plus small daily bills.

---

## Open questions for the user (answer any time before that phase)

1. Phase 4: call to prayer at sunset — recorded clip, or lights/ambience only (default)?
2. Phase 5: should decor give the small arrival bonus, or be purely cosmetic?
3. Phase 2: OK to make golden animals rarer but worth double?
