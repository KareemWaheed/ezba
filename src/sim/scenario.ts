import { SCENARIOS, SCENARIO_GAP, type ScenarioDef, type ScenarioGoal } from '../config/scenarios';
import { ECONOMY, type ProductId } from '../config/economy';
import { LAYOUT } from '../config/layout';
import { dist, moveToward, turnToward } from './math';
import type { SimWorld } from './world';
import { BASIC, type Mechanic, type MechanicId } from './scenarios/mechanic';
import { StormMechanic } from './scenarios/storm';
import { InspectorMechanic } from './scenarios/inspector';
import { FootballMechanic } from './scenarios/football';
import { CommentsMechanic } from './scenarios/comments';

/** Mechanic per id; ids without their own module yet fall back to BASIC. */
const MECHANICS: Partial<Record<MechanicId, () => Mechanic>> = {
  storm: () => new StormMechanic(),
  inspector: () => new InspectorMechanic(),
  football: () => new FootballMechanic(),
  comments: () => new CommentsMechanic(),
};

export interface GoalState { goal: ScenarioGoal; ok: boolean; progress: number }

export type ScenarioPhase = 'idle' | 'warn' | 'active' | 'settle';

/**
 * The special guest's visit, separate from the normal lines: walks the carpet from the motorcade to
 * the VIP stage, poses for photos, orders, waits for the player to deliver in person, eats on
 * stage while the crowd films, then leaves.
 */
export type GuestState = 'arrive' | 'pose' | 'order' | 'enjoy' | 'leave' | 'gone';

export interface GuestLine { product: ProductId; qty: number; left: number }

export interface Guest {
  x: number; z: number; rot: number; speed: number;
  state: GuestState;
  /** Seconds left in the current timed state (pose / enjoy). */
  t: number;
  lines: GuestLine[];
  qty: number;
  left: number;
  patience: number;
  patienceMax: number;
  /** Left without being served. */
  upset: boolean;
}

/** Reward multiplier per star grade. */
export const STAR_MULT = [0, 1, 1.5, 2] as const;

/** Guest timings (s). */
const POSE_TIME = 5;
const ENJOY_TIME = 10;
const WALK_SPEED = 1.7;

/**
 * Scenario events (special visits): idle -> warn (banner countdown, motorcade arrives) -> active
 * (themed crowd, rule changes, the guest's stage visit) -> settle (wait for the event's customers
 * and the guest) -> goals checked, reward. Never overlaps a rush; active play only.
 */
export class ScenarioSystem {
  phase: ScenarioPhase = 'idle';
  t: number;
  def: ScenarioDef = SCENARIOS[0];
  featured: ProductId | null = null;
  /** The special guest during an event with one (null otherwise). */
  guest: Guest | null = null;
  /** Event bookkeeping. */
  angry = 0;
  sales = 0;
  likes = 0;
  guestServed = false;
  /** Results of the last evaluation (for the end banner). */
  lastGoals: GoalState[] = [];
  /** The running event's own rules (BASIC when it has none). */
  mech: Mechanic = BASIC;
  /** Grade of the last finished event: 0 = failed, 1 = all goals, 2 = clean, 3 = perfect. */
  stars = 0;
  /** Debug panel: every goal counts as passed for the running event. */
  debugWin = false;
  /** Next twist to fire and the crowd multiplier from 'rush' twists. */
  private twistIx = 0;
  private twistMult = 1;
  /** Guest patience left (0..1) when they were served. */
  private servedPatience = 0;
  /** Post-event arrival boost (e.g. the video went viral). */
  boostT = 0;
  boostMult = 1;
  private settleT = 0;
  private dropT = 0;
  /** Debug: next trigger cycles through scenarios in order. */
  private debugIndex = 0;

  constructor(private w: SimWorld) {
    this.t = this.gap();
  }

  private gap(): number { return this.w.rng.range(SCENARIO_GAP.min, SCENARIO_GAP.max); }

  get active(): boolean { return this.phase === 'active'; }

  /** Shop arrival multiplier (event crowd, or the post-event boost). */
  get arrivalMult(): number {
    if (this.active) return this.def.arrivalMult * this.twistMult;
    return this.boostT > 0 ? this.boostMult : 1;
  }

  /** Belts and the stove stop during a power cut. */
  get powerCut(): boolean { return this.active && !!this.def.powerCut; }

  /** The guest is waiting for the player to bring their order to the stage. */
  get guestWaiting(): boolean { return this.guest?.state === 'order'; }

  /** How many more of this product the waiting guest needs beyond what the player already carries. */
  stillNeeds(p: ProductId): number {
    const g = this.guest;
    // no guest waiting: everything carried counts as surplus
    if (!g || g.state !== 'order') return -1;
    let need = 0;
    for (const l of g.lines) if (l.product === p) need += l.left;
    let carried = 0;
    for (const it of this.w.carry.items) if (it === p) carried++;
    return need - carried;
  }

  /** Start the next scenario now (debug panel), cycling through all of them. */
  trigger(id?: string): void {
    if (this.phase !== 'idle') return;
    const def = id ? SCENARIOS.find((s) => s.id === id) : SCENARIOS[this.debugIndex++ % SCENARIOS.length];
    if (def) this.start(def);
  }

  private pick(): ScenarioDef | null {
    const w = this.w, ok = SCENARIOS.filter((s) => w.upgrades.bought >= s.minUpgrades && (!s.when || s.when(w)));
    if (!ok.length) return null;
    let total = 0;
    for (const s of ok) total += s.weight;
    let r = w.rng.next() * total;
    for (const s of ok) { r -= s.weight; if (r <= 0) return s; }
    return ok[0];
  }

  private start(def: ScenarioDef): void {
    const w = this.w, open = w.stations.filter((s) => s.open && s.farmed);
    this.def = def;
    this.featured = def.featured === undefined || def.featured === null ? (open.length ? w.rng.pick(open).def.product : null) : def.featured;
    this.phase = 'warn';
    this.t = def.warning;
    this.angry = this.sales = this.likes = 0;
    this.guest = null;
    this.guestServed = false;
    this.twistIx = 0;
    this.twistMult = 1;
    this.servedPatience = 0;
    w.events.emit('scenarioWarn', this.featured ?? '', 0, 0, 0, Math.ceil(this.t));
  }

  /** The guest steps out of the motorcade with their order. */
  private spawnGuest(): void {
    const w = this.w, g = this.def.guest!, e = LAYOUT.vipStage.entry;
    const open = w.stations.filter((s) => s.open && s.farmed);
    const lines: GuestLine[] = [];
    for (const s of open) {
      const q = ECONOMY.customers.qty[s.def.product];
      const want = Math.max(2, Math.round((q.base + 2) * g.qtyMult * (s.def.product === this.featured ? 1 : 0.6)));
      lines.push({ product: s.def.product, qty: want, left: want });
    }
    let qty = 0;
    for (const l of lines) qty += l.qty;
    this.guest = { x: e.x, z: e.z, rot: 0, speed: 0, state: 'arrive', t: 0, lines, qty, left: qty, patience: g.patience, patienceMax: g.patience, upset: false };
  }

  /** Player hands items to the waiting guest at the stage (called from world.interact). */
  deliver(dt: number): void {
    const g = this.guest, w = this.w;
    this.dropT -= dt;
    if (!g || g.state !== 'order' || this.dropT > 0) return;
    const d = LAYOUT.vipStage.drop;
    if (dist(w.player.x, w.player.z, d.x, d.z) > 1.5) return;
    for (const l of g.lines) {
      if (l.left <= 0 || !w.carry.has(l.product)) continue;
      w.carry.take(l.product);
      l.left--;
      g.left--;
      this.dropT = ECONOMY.player.dropInterval * 1.5;
      w.events.emit('drop', l.product, d.x, d.z, 0, w.carry.n);
      if (g.left <= 0) {
        g.state = 'enjoy';
        g.t = ENJOY_TIME;
        this.guestServed = true;
        this.servedPatience = g.patience / g.patienceMax;
        let value = 0;
        for (const x of g.lines) value += x.qty * ECONOMY.products[x.product].price * w.priceMult;
        value = Math.round(value * (this.def.guest?.payMult ?? 1));
        this.sales += value;
        w.cash.value += value;
        w.cash.bills += 12;
        w.events.emit('paid', l.product, g.x, g.z, value, g.qty, -1);
      }
      return;
    }
  }

  private updateGuest(dt: number): void {
    const g = this.guest;
    if (!g) return;
    const s = LAYOUT.vipStage;
    g.speed = 0;
    switch (g.state) {
      case 'arrive':
        // along the carpet to the front of the stage, then up to the seat
        // waypoint 0: end of the carpet; 1: the seat on stage (g.t holds the waypoint index)
        if (g.t === 0) { if (moveToward(g, s.drop.x - 0.9, s.drop.z + 0.2, WALK_SPEED, dt, 0.2)) g.t = 1; }
        else if (moveToward(g, s.seat.x, s.seat.z, WALK_SPEED, dt, 0.1)) { g.state = 'pose'; g.t = POSE_TIME; }
        break;
      case 'pose':
        g.rot = turnToward(g.rot, 0, 1, 6, dt);
        g.t -= dt;
        if (g.t <= 0) { g.state = 'order'; this.w.events.emit('vip', '', g.x, g.z, 0, 0, -1); }
        break;
      case 'order':
        g.rot = turnToward(g.rot, 0, 1, 6, dt);
        g.patience -= dt;
        if (g.patience <= 0) { g.state = 'leave'; g.upset = true; this.angry++; this.w.events.emit('angry', '', g.x, g.z, 0, 0, -1); }
        break;
      case 'enjoy':
        g.rot = turnToward(g.rot, 0, 1, 6, dt);
        g.t -= dt;
        if (g.t <= 0) g.state = 'leave';
        break;
      case 'leave':
        if (moveToward(g, s.entry.x, s.entry.z, WALK_SPEED * 1.2, dt, 0.3)) g.state = 'gone';
        break;
      case 'gone':
        break;
    }
  }

  /** Live state of every goal of the current event (the HUD and the final check both use this). */
  checkGoals(): GoalState[] {
    const w = this.w, d = this.def, m = this.mech;
    return d.goals.map((goal) => {
      const own = m.goal(w, goal);
      let ok: boolean;
      let progress: number | undefined = m.progress?.(w, goal);
      if (this.debugWin) ok = true;
      else if (own !== undefined) ok = own;
      else switch (goal) {
        case 'noAngry': ok = this.angry === 0; break;
        case 'serveGuest': ok = this.guestServed; break;
        case 'noJams': ok = !w.staff.machines.some((x) => x.running && x.broken); break;
        case 'cleanTables': { ok = true; for (let i = 0; i < w.cafe.tableCount; i++) if (w.cafe.tables[i].dirty) ok = false; break; }
        case 'likes': { const t = d.likesTarget ?? 0; ok = this.likes >= t; progress ??= t ? Math.min(1, this.likes / t) : 1; break; }
        default: ok = false;
      }
      return { goal, ok, progress: progress ?? (ok ? 1 : 0) };
    });
  }

  /** 1 = every goal; 2 = also nobody angry and the guest served with time to spare; 3 = also the mechanic's bonus. */
  private grade(won: boolean): number {
    if (!won) return 0;
    if (this.debugWin) return 3;
    const clean = this.angry === 0 && (!this.def.guest || this.servedPatience >= 0.25);
    if (!clean) return 1;
    return this.mech.bonus && !this.mech.bonus(this.w) ? 2 : 3;
  }

  /** Fire the next twist when its time comes. */
  private updateTwists(): void {
    const tw = this.def.twists;
    if (!tw || this.twistIx >= tw.length || this.def.duration - this.t < tw[this.twistIx].at) return;
    const x = tw[this.twistIx], w = this.w;
    if (x.kind === 'extend') this.t += 15;
    else if (x.kind === 'rush') this.twistMult *= 1.5;
    else this.reorder();
    w.events.emit('scenarioTwist', '', 0, 0, 0, this.twistIx);
    this.twistIx++;
  }

  /** The guest changes their mind: every unfinished line switches to another open product, same amount. */
  private reorder(): void {
    const g = this.guest, w = this.w;
    if (!g || (g.state !== 'order' && g.state !== 'arrive' && g.state !== 'pose')) return;
    const open = w.stations.filter((s) => s.open && s.farmed).map((s) => s.def.product);
    if (open.length < 2) return;
    for (const l of g.lines) {
      if (l.left <= 0) continue;
      const others = open.filter((p) => p !== l.product);
      l.product = others[w.rng.int(others.length)];
    }
    // merge lines that now ask for the same product
    const merged: GuestLine[] = [];
    for (const l of g.lines) {
      const m = merged.find((x) => x.product === l.product);
      if (m) { m.qty += l.qty; m.left += l.left; } else merged.push({ ...l });
    }
    g.lines = merged;
    // a fresh order gets fresh patience
    g.patience = Math.max(g.patience, g.patienceMax * 0.6);
  }

  private endMechanic(): void {
    this.mech.teardown(this.w);
    this.mech = BASIC;
  }

  private finish(): void {
    const w = this.w, d = this.def;
    this.lastGoals = this.checkGoals();
    const won = this.lastGoals.every((g) => g.ok);
    this.stars = this.grade(won);
    const r = w.service;
    let reward = 0;
    if (won) {
      reward = Math.round((d.rewardSeconds * w.perSec + this.sales * d.rewardShare) * STAR_MULT[this.stars]);
      if (d.guest) w.album.see(`g:${d.id}`);
      w.cash.value += reward;
      w.cash.bills += 16;
      r.rating = Math.min(5, r.rating + d.ratingWin);
      w.stats.scenariosWon++;
      if (d.boostAfter) { this.boostT = d.boostAfter.seconds; this.boostMult = d.boostAfter.mult; }
    } else r.rating = Math.max(1, r.rating + d.ratingLose);
    w.events.emit('scenarioEnd', '', 0, 0, reward, won ? 1 : 0, this.stars);
    this.debugWin = false;
    this.endMechanic();
    this.phase = 'idle';
    this.guest = null;
    this.t = this.gap();
  }

  update(dt: number): void {
    const w = this.w;
    if (w.away) {
      if (this.phase !== 'idle') {
        this.endMechanic();
        this.phase = 'idle';
        this.guest = null;
        this.t = this.gap();
        for (const c of w.customers.list) c.scenario = false;
      }
      return;
    }
    if (this.boostT > 0) this.boostT = Math.max(0, this.boostT - dt);
    this.t -= dt;
    this.updateGuest(dt);
    if (this.phase === 'active' || this.phase === 'settle') this.mech.update(w, dt);
    switch (this.phase) {
      case 'idle':
        if (this.t > 0) break;
        // never on top of a rush; wait until it's over
        if (w.rush.phase !== 'idle') { this.t = 20; break; }
        { const def = this.pick(); if (def) this.start(def); else this.t = 60; }
        break;
      case 'warn':
        if (this.t <= 0) {
          this.phase = 'active';
          this.t = this.def.duration;
          if (this.def.guest) this.spawnGuest();
          this.mech = MECHANICS[this.def.mechanic ?? 'basic']?.() ?? BASIC;
          this.mech.start(w, this.def);
          w.events.emit('scenarioStart', this.featured ?? '');
        }
        break;
      case 'active':
        this.updateTwists();
        // the event lasts at least until the guest has left the stage
        if (this.t <= 0 && (!this.guest || this.guest.state === 'leave' || this.guest.state === 'gone')) { this.phase = 'settle'; this.settleT = 25; }
        break;
      case 'settle':
        this.settleT -= dt;
        if (this.settleT > 0 && (w.customers.list.some((c) => c.scenario && c.state === 'queue') || (this.guest && this.guest.state !== 'gone'))) break;
        this.finish();
        break;
    }
  }
}
