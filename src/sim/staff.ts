import { ECONOMY, type ItemId } from '../config/economy';
import { LAYOUT } from '../config/layout';
import { beltEnds, type StationDef } from '../config/stations';
import { Carrier } from './carrier';
import { dist, moveToward, turnToward } from './math';
import type { Station } from './station';
import type { Breakable } from './converter';
import type { SimWorld } from './world';

type WorkerState = 'toLoad' | 'load' | 'toUnload' | 'unload';

/** What a worker shuttles: where to load, what to take, where to unload, what to do with it. */
export interface WorkerJob {
  /** Identifies the job (e.g. station id) for reconciling worker counts. */
  readonly key: string;
  /** Called when heading out to load; writes the loading spot. */
  loadAt(w: SimWorld, slot: number, out: { x: number; z: number }): void;
  /** Take one item at the loading spot, or null if there's nothing to take. */
  take(w: SimWorld, slot: number): ItemId | null;
  unloadAt(w: SimWorld, slot: number, out: { x: number; z: number }): void;
  /** Hand one item over; false if the target can't take it right now. */
  give(w: SimWorld, item: ItemId): boolean;
  /** Chooses among several sources: after waiting empty-handed a while, the worker picks again. */
  readonly repick?: boolean;
  /** How many more the target can take right now (workers never load more than this). */
  room?(w: SimWorld, slot: number): number;
  /** Put an item back where it came from (target stayed full / went away). */
  putBack?(w: SimWorld, item: ItemId, slot: number): void;
}

/** Station job: pile -> counter slot (unloads on the inner side; belts use the outer side). */
export class StationJob implements WorkerJob {
  readonly key: string;
  private inner: number;
  constructor(readonly station: Station) {
    this.key = station.def.id;
    this.inner = -Math.sign(station.def.counter.x) || 1;
  }
  loadAt(_w: SimWorld, slot: number, out: { x: number; z: number }): void {
    const d = this.station.def;
    out.x = d.pile.x + this.inner * slot * 0.45;
    out.z = d.pile.z + 1.0;
  }
  take(): ItemId | null {
    if (this.station.pile <= 0) return null;
    this.station.pile--;
    return this.station.def.product;
  }
  unloadAt(_w: SimWorld, slot: number, out: { x: number; z: number }): void {
    const d = this.station.def;
    out.x = d.counter.dropX + this.inner * (0.6 + slot * 0.45);
    out.z = d.counter.dropZ - 0.1;
  }
  give(): boolean {
    this.station.counter++;
    return true;
  }
}

/** The pens fill the strip between the yard (south) and the farmland (north); the gap between them is the way through. */
const GAP_X = 1.5, NORTH_Z = -9.95, SOUTH_Z = -1.9;

/**
 * Next point toward (tx, tz) for walkers that don't collide (staff): crossing between the yard and the
 * farmland goes through the gap between the pens instead of through them. Writes into `out`.
 */
export function farmRoute(x: number, z: number, tx: number, tz: number, out: { x: number; z: number }): { x: number; z: number } {
  out.x = tx;
  out.z = tz;
  const north = z < NORTH_Z, tNorth = tz < NORTH_Z;
  if (north === tNorth) return out;
  out.x = GAP_X;
  // not lined up with the gap yet: go to its mouth on this side; in it: walk through to the far side
  if (Math.abs(x - GAP_X) > 0.9) out.z = north ? NORTH_Z - 0.4 : SOUTH_Z + 0.4;
  else out.z = tNorth ? NORTH_Z - 0.6 : SOUTH_Z + 0.6;
  return out;
}

/** A hired hand running a WorkerJob. Worse than the player (smaller stack, slower transfers). */
export class Worker {
  x: number; z: number; rot = 0; speed = 0;
  state: WorkerState = 'toLoad';
  readonly carry: Carrier;
  private t = 0;
  private wait = 0;
  /** Seconds the target has refused items while unloading. */
  private stuck = 0;
  private spot = { x: 0, z: 0 };
  private way = { x: 0, z: 0 };

  /** Walk toward the spot (through the gap if needed); true once actually there. */
  private walk(s: { x: number; z: number }, speed: number, dt: number): boolean {
    const r = farmRoute(this.x, this.z, s.x, s.z, this.way);
    const there = moveToward(this, r.x, r.z, speed, dt, 0.15);
    return there && r.x === s.x && r.z === s.z;
  }

  constructor(readonly job: WorkerJob, readonly slot: number, x: number, z: number) {
    this.x = x;
    this.z = z;
    this.carry = new Carrier(ECONOMY.staff.worker.capacity);
  }

  update(w: SimWorld, dt: number, speedMult: number): void {
    const cfg = ECONOMY.staff.worker;
    const near = !w.away && dist(w.player.x, w.player.z, this.x, this.z) < ECONOMY.staff.boostRadius;
    const boost = near ? 1 + ECONOMY.staff.boost : 1;
    const speed = cfg.speed * speedMult * boost;
    const interval = cfg.transferInterval / boost;
    const s = this.spot;
    this.t -= dt;
    this.speed = 0;
    switch (this.state) {
      case 'toLoad':
        this.job.loadAt(w, this.slot, s);
        if (this.walk(s, speed, dt)) { this.state = 'load'; this.wait = 0; }
        break;
      case 'load': {
        this.wait += dt;
        this.rot = turnToward(this.rot, 0, -1, 12, dt);
        // never load more than the target can take (no standing around with a full stack)
        const room = this.job.room ? this.job.room(w, this.slot) : Infinity;
        if (this.t <= 0 && !this.carry.full() && this.carry.n < room) {
          const it = this.job.take(w, this.slot);
          if (it) { this.carry.push(it); this.t = interval; }
        }
        if (this.carry.full() || (this.carry.n > 0 && (this.carry.n >= room || this.wait > cfg.maxWait))) { this.state = 'toUnload'; this.stuck = 0; }
        // nothing to take here for a while (empty, or left for the shop's line): pick the source again
        else if (this.job.repick && this.carry.n === 0 && this.wait > cfg.maxWait * 2) this.state = 'toLoad';
        break;
      }
      case 'toUnload':
        this.job.unloadAt(w, this.slot, s);
        if (this.walk(s, speed, dt)) this.state = 'unload';
        break;
      case 'unload':
        this.rot = turnToward(this.rot, 0, 1, 12, dt);
        if (this.t <= 0 && this.carry.n > 0) {
          const it = this.carry.items[this.carry.n - 1];
          if (this.job.give(w, it)) { this.carry.items.pop(); this.t = interval; this.stuck = 0; }
          else this.stuck += dt;
        }
        // target stayed full (or the truck left): put the rest back and go again
        if (this.stuck > 3 && this.job.putBack) {
          for (const it of this.carry.items) this.job.putBack(w, it, this.slot);
          this.carry.items.length = 0;
          this.stuck = 0;
        }
        if (this.carry.n === 0) this.state = 'toLoad';
        break;
    }
  }
}

/** Seconds of running until a machine's next jam: exponential, stretched by maintenance. */
export function nextBreak(w: SimWorld): number {
  const mean = ECONOMY.breakdowns.mean * (1 + w.upgrades.level('maint') * ECONOMY.upgrades.maint.step);
  return -Math.log(1 - w.rng.next()) * mean;
}

/** One item riding a belt. */
export interface BeltItem { active: boolean; t: number; item: ItemId }

/** What a belt moves: a source to take from and a target to deliver to. */
export interface BeltRoute {
  take(): ItemId | null;
  deliver(item: ItemId): void;
  readonly ax: number; readonly az: number;
  readonly bx: number; readonly bz: number;
  /** Travel time (default ECONOMY.machines.belt.travel), where jams are fixed (default the middle), cable line. */
  readonly travel?: number;
  readonly fix?: { x: number; z: number };
  readonly sky?: StationDef['skyBelt'];
}

/** Station belt route: pile -> counter slot, along the outer side. */
export function stationRoute(st: Station): BeltRoute {
  const take = () => (st.pile > 0 ? (st.pile--, st.def.product) : null), deliver = () => { st.counter++; };
  const sky = st.def.skyBelt;
  if (sky) {
    // a long line: about 5 m/s along the cable, plus the lift at each end
    const L = Math.hypot(sky.tower.x - sky.a.x, sky.tower.z - sky.a.z);
    return { ax: sky.a.x, az: sky.a.z, bx: st.def.counter.x, bz: st.def.counter.z, travel: 1.5 + L / 5, fix: sky.fix, sky, take, deliver };
  }
  const e = beltEnds(st.def, LAYOUT.counter.z0);
  return {
    ax: e.ax, az: e.az, bx: e.bx, bz: e.bz,
    take: () => (st.pile > 0 ? (st.pile--, st.def.product) : null),
    deliver: () => { st.counter++; },
  };
}

/** Conveyor belt. Level 1 builds it; each level speeds it up. Can jam. */
export class Belt implements Breakable {
  level = 0;
  private timer = 0.5;
  readonly items: BeltItem[] = [];
  broken = false;
  breakT = -1;
  fixT = 0;
  readonly mx: number;
  readonly mz: number;

  constructor(readonly route: BeltRoute, readonly id: number, private baseInterval: number = ECONOMY.machines.belt.interval) {
    this.mx = route.fix ? route.fix.x : (route.ax + route.bx) / 2;
    this.mz = route.fix ? route.fix.z : (route.az + route.bz) / 2;
  }

  get running(): boolean { return this.level > 0; }

  get interval(): number {
    return this.baseInterval / Math.pow(ECONOMY.machines.belt.speedUp, Math.max(0, this.level - 1));
  }

  update(dt: number): void {
    if (this.level <= 0 || this.broken) return;
    const travel = this.route.travel ?? ECONOMY.machines.belt.travel;
    this.timer -= dt;
    if (this.timer <= 0) {
      const item = this.route.take();
      if (item) {
        let it = this.items.find((i) => !i.active);
        if (!it) { it = { active: false, t: 0, item }; this.items.push(it); }
        it.active = true;
        it.t = 0;
        it.item = item;
        this.timer = this.interval;
      } else this.timer = 0;
    }
    for (const it of this.items) {
      if (!it.active) continue;
      it.t += dt / travel;
      if (it.t >= 1) { it.active = false; this.route.deliver(it.item); }
    }
  }

  /** Items in transit (saved as already delivered). */
  get inTransit(): number { let n = 0; for (const i of this.items) if (i.active) n++; return n; }
}

/** Like farmRoute, but in and out of the walled HR yard through its gate (east wall). */
function yardRoute(x: number, z: number, tx: number, tz: number, out: { x: number; z: number }): { x: number; z: number } {
  const y = LAYOUT.hrYard, b = y.box, gz = (y.gate.z0 + y.gate.z1) / 2;
  const inside = (px: number, pz: number) => px > b.x0 && px < b.x1 && pz > b.z0 && pz < b.z1;
  const a = inside(x, z), t = inside(tx, tz);
  if (a === t) return farmRoute(x, z, tx, tz, out);
  // line up with the gate on this side, then step through it
  const inX = b.x1 - 0.6, outX = b.x1 + 0.8, lined = Math.abs(z - gz) < 0.3;
  if (a) { out.x = lined && x > inX - 0.3 ? outX : inX; out.z = gz; return out; }
  // (once lined up at the gate, keep stepping in: going back to the line-up spot halfway in would loop forever)
  if (!lined || x > outX + 0.3) return farmRoute(x, z, outX, gz, out);
  out.x = inX; out.z = gz;
  return out;
}

/** A hired mechanic: waits by the HR office, walks to the nearest jam nobody else has taken and fixes it. */
export interface Mechanic { x: number; z: number; rot: number; speed: number; target: Breakable | null; fixT: number }

/** The hired feeder: waits by the HR office, walks to a trough running low and refills it. */
export interface Feeder { x: number; z: number; rot: number; speed: number; target: number; t: number }

/** Station workers and belts, reconciled from upgrade levels, plus every machine that can jam. */
export class StaffSystem {
  readonly workers: Worker[] = [];
  /** One belt per station (index = station index); extra belts (café) are appended by their systems. */
  readonly belts: Belt[] = [];
  /** Everything the jam/fix logic looks at. */
  readonly machines: Breakable[] = [];
  readonly mechanics: Mechanic[] = [];
  readonly feeders: Feeder[] = [];
  /** Accountant: seconds until the next round of the cash piles. */
  private accountT = 0;
  private way = { x: 0, z: 0 };

  constructor(private w: SimWorld) {
    for (const s of w.stations) this.addBelt(new Belt(stationRoute(s), s.index));
  }

  addBelt(b: Belt): void { this.belts.push(b); this.machines.push(b); }

  /** Ensure `want` workers run jobs with this key. */
  ensureWorkers(job: WorkerJob, want: number, x: number, z: number): void {
    let have = 0;
    for (const wk of this.workers) if (wk.job.key === job.key) have++;
    while (have < want) this.workers.push(new Worker(job, have++, x + have * 0.5, z));
  }

  /** Match staff/machines to upgrade levels. Called from UpgradeSystem.apply(). */
  sync(): void {
    const w = this.w, up = w.upgrades;
    for (const s of w.stations) {
      if (!s.open) continue;
      const wt = s.def.workerTrack;
      if (wt) this.ensureWorkers(new StationJob(s), up.level(wt) * ECONOMY.upgrades[wt].step, s.def.pile.x + 1.2, s.def.pile.z + 1.4);
      const mt = s.def.machineTrack;
      if (mt) this.belts[s.index].level = up.level(mt);
    }
    while (this.mechanics.length < up.level('hr.mechanic') * ECONOMY.upgrades['hr.mechanic'].step) {
      const h = LAYOUT.hrYard.mechanics;
      this.mechanics.push({ x: h.x + this.mechanics.length * 0.8, z: h.z, rot: 0, speed: 0, target: null, fixT: 0 });
    }
    while (this.feeders.length < up.level('hr.feeder')) {
      const h = LAYOUT.hrYard.mechanics;
      this.feeders.push({ x: h.x - 1.2, z: h.z, rot: 0, speed: 0, target: -1, t: 0 });
    }
    const cap = ECONOMY.staff.worker.capacity + up.level('hr.capacity') * ECONOMY.upgrades['hr.capacity'].step;
    // kitchen helpers and shelf stockers (with a trolley) carry more than farm workers; HR capacity adds on top
    const base = (key: string) => key === 'cafe.supply' ? ECONOMY.cafe.helperCapacity : key.startsWith('market.stock') ? ECONOMY.supermarket.stockerCapacity : ECONOMY.staff.worker.capacity;
    for (const x of this.workers) x.carry.cap = cap - ECONOMY.staff.worker.capacity + base(x.job.key);
  }

  /** Feeders (hr.feeder): a trough under the refill mark gets walked to and refilled (no player stats). */
  private updateFeeders(dt: number, speedMult: number): void {
    const w = this.w, F = ECONOMY.feed, home = LAYOUT.hrYard.mechanics;
    const low = (i: number) => { const s = w.stations[i]; return !!s && s.open && !!s.def.trough && s.boostT < F.duration * F.refillBelow; };
    this.feeders.forEach((f) => {
      f.speed = 0;
      if (f.target >= 0 && !low(f.target)) { f.target = -1; f.t = 0; }
      if (f.target < 0) {
        // the trough closest to empty
        let best = -1, bestT = Infinity;
        w.stations.forEach((s, i) => { if (low(i) && s.boostT < bestT && !this.feeders.some((o) => o !== f && o.target === i)) { best = i; bestT = s.boostT; } });
        f.target = best;
      }
      const tr = f.target >= 0 ? w.stations[f.target].def.trough! : null;
      const tx = tr ? tr.x : home.x - 1.2, tz = tr ? tr.z + 0.7 : home.z;
      const r = yardRoute(f.x, f.z, tx, tz, this.way);
      const px = f.x, pz = f.z;
      const there = moveToward(f, r.x, r.z, F.feederSpeed * speedMult, dt, 0.2) && r.x === tx && r.z === tz;
      if (f.x !== px || f.z !== pz) f.speed = F.feederSpeed * speedMult;
      if (!tr || !there) return;
      f.rot = turnToward(f.rot, tr.x - f.x, tr.z - f.z, 12, dt);
      if ((f.t += dt) < F.feederTime) return;
      const s = w.stations[f.target];
      s.boostT = F.duration;
      s.refillT = 0;
      f.target = -1;
      f.t = 0;
      if (!w.away) w.events.emit('feed', s.def.product, tr.x, tr.z, 0, 1, s.index);
    });
  }

  /** Accountant (hr.accountant): every so often the cash piles go straight into the player's money. */
  private updateAccountant(dt: number): void {
    const w = this.w, lv = w.upgrades.level('hr.accountant');
    // (not while away: time away pays its own sum)
    if (lv <= 0 || w.away) return;
    if ((this.accountT -= dt) > 0) return;
    this.accountT = ECONOMY.upgrades['hr.accountant'].step * (lv >= 2 ? 0.4 : 1);
    let v = 0;
    // (the farm's piles; the supermarket has its own checkout staff)
    for (const c of [w.cash, w.cafe.cash, w.field.cash, w.river.cash, w.butcher.cash]) { v += c.value; c.value = 0; c.bills = 0; }
    if (v <= 0) return;
    w.money += v;
    w.stats.earned += v;
    w.events.emit('accountant', '', LAYOUT.shop.cash.x, LAYOUT.shop.cash.z, v);
  }

  /** A mechanic is on its way to (or fixing) this jam. */
  taken(b: Breakable): boolean { return this.mechanics.some((m) => m.target === b); }

  private updateMechanics(dt: number, speedMult: number): void {
    const w = this.w, B = ECONOMY.breakdowns, home = LAYOUT.hrYard.mechanics;
    this.mechanics.forEach((m, i) => {
      m.speed = 0;
      if (m.target && !m.target.broken) { m.target = null; m.fixT = 0; }
      if (!m.target) {
        // the nearest jam nobody has taken
        let best: Breakable | null = null, bestD = Infinity;
        for (const b of this.machines) {
          if (!b.running || !b.broken || this.taken(b)) continue;
          const d = dist(m.x, m.z, b.mx, b.mz);
          if (d < bestD) { best = b; bestD = d; }
        }
        m.target = best;
      }
      const t = m.target;
      const tx = t ? t.mx : home.x + i * 0.8, tz = t ? t.mz + 0.6 : home.z;
      const r = yardRoute(m.x, m.z, tx, tz, this.way);
      const prevX = m.x, prevZ = m.z;
      const there = moveToward(m, r.x, r.z, B.mechanicSpeed * speedMult, dt, 0.2) && r.x === tx && r.z === tz;
      if (m.x !== prevX || m.z !== prevZ) m.speed = B.mechanicSpeed * speedMult;
      if (!t || !there) return;
      m.rot = turnToward(m.rot, t.mx - m.x, t.mz - m.z, 12, dt);
      m.fixT += dt;
      if (m.fixT < B.mechanicFixTime) return;
      t.broken = false;
      t.fixT = 0;
      t.breakT = nextBreak(w);
      m.target = null;
      m.fixT = 0;
      if (!w.away) w.events.emit('fixed', '', t.mx, t.mz, 0, 1, this.machines.indexOf(t));
    });
  }

  /** Cashier service slowdown vs. the player (1 = player speed). */
  get cashierSlow(): number {
    return ECONOMY.staff.cashier.slowFactor / (1 + this.w.upgrades.level('hr.cashier') * ECONOMY.upgrades['hr.cashier'].step);
  }

  update(dt: number): void {
    const w = this.w, speedMult = 1 + w.upgrades.level('hr.speed') * ECONOMY.upgrades['hr.speed'].step;
    for (const x of this.workers) x.update(w, dt, speedMult);
    if (!w.scenario.powerCut) for (const b of this.belts) b.update(dt);
    this.updateMechanics(dt, speedMult);
    this.updateFeeders(dt, speedMult);
    this.updateAccountant(dt);
    // schedule and trigger jams for every running machine
    for (const m of this.machines) {
      if (!m.running || m.broken) continue;
      if (m.breakT < 0) m.breakT = Math.max(ECONOMY.breakdowns.mean * 0.5, nextBreak(w));
      m.breakT -= dt;
      if (m.breakT <= 0) {
        m.broken = true;
        m.fixT = 0;
        w.events.emit('break', '', m.mx, m.mz, 0, 0, this.machines.indexOf(m));
      }
    }
  }
}
