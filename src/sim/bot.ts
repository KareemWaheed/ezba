import { ECONOMY } from '../config/economy';
import { LAYOUT, SOLIDS_VERSION } from '../config/layout';
import { CAFE } from '../config/cafe';
import type { ProductId } from '../config/economy';
import { FIELDS, FIELD_CROPS, type FieldCrop } from '../config/fields';
import { dist, type Box } from './math';
import type { SimWorld } from './world';
import type { TileState } from './upgrades';
import { nearestStalk, unservedLane, vipDelivery } from './guide';
import { Rng } from './rng';

/**
 * Simulated players for the pacing simulator.
 * - 'active': an efficient player running the carry-and-sell loop and buying the cheapest
 *   affordable upgrade as soon as possible.
 * - 'idle': never carries or serves; only collects cash and buys upgrades.
 * The bot only steers the joystick input, so travel times, collisions and pickup rates are real.
 */
/**
 * - 'casual': a relaxed real-life player: reacts slower, stands around a lot (~45%), skips troughs
 *   and golden animals. Used to check the game isn't too slow for normal play.
 */
export type BotProfile = 'active' | 'idle' | 'casual';

type Task = 'tile' | 'stepOff' | 'drop' | 'cash' | 'pick' | 'serve' | 'wait' | 'fix' | 'golden' | 'feed'
  | 'stoveIn' | 'stoveOut' | 'cafeDrop' | 'cafeServe' | 'clean' | 'tableCash' | 'dock' | 'harvest' | 'sellCrop' | 'event';

/** Clearance kept from obstacles when routing around them. */
const CLEAR = ECONOMY.player.radius + 0.25;

/** Does segment a->b pass through box b (grown by r)? Slab test. */
function segHitsBox(ax: number, az: number, bx: number, bz: number, s: Box, r: number): boolean {
  const x0 = s.x0 - r, x1 = s.x1 + r, z0 = s.z0 - r, z1 = s.z1 + r;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, d, lo, hi] of [[ax, dx, x0, x1], [az, dz, z0, z1]] as const) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; continue; }
    let ta = (lo - p) / d, tb = (hi - p) / d;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * Route graph of one world: the large obstacles worth routing around (fences, counter, walls,
 * buildings; trees/hay sit at the edges) and the walkable corners just outside them. Rebuilt when that
 * world's solids change (pens grow, something gets built).
 */
interface RouteGraph { key: string; solids: Box[]; nodes: [number, number][] }
const GRAPHS = new WeakMap<SimWorld, RouteGraph>();

function graph(w: SimWorld): RouteGraph {
  const key = `${SOLIDS_VERSION.v}:${w.solidsVersion}`;
  let g = GRAPHS.get(w);
  if (g && g.key === key) return g;
  const solids = w.solids.filter((b) => Math.max(b.x1 - b.x0, b.z1 - b.z0) > 1.5);
  const inside = (x: number, z: number) => solids.some((s) => x > s.x0 - CLEAR + 0.01 && x < s.x1 + CLEAR - 0.01 && z > s.z0 - CLEAR + 0.01 && z < s.z1 + CLEAR - 0.01);
  const nodes = solids.flatMap((s) => [
    [s.x0 - CLEAR, s.z0 - CLEAR], [s.x1 + CLEAR, s.z0 - CLEAR], [s.x0 - CLEAR, s.z1 + CLEAR], [s.x1 + CLEAR, s.z1 + CLEAR],
  ] as [number, number][]).filter(([x, z]) => !inside(x, z));
  g = { key, solids, nodes };
  GRAPHS.set(w, g);
  return g;
}

function clear(g: RouteGraph, ax: number, az: number, bx: number, bz: number, r: number): boolean {
  for (const s of g.solids) if (segHitsBox(ax, az, bx, bz, s, r)) return false;
  return true;
}

export class Bot {
  task: Task = 'wait';
  private tx = 0;
  private tz = 0;
  private stuckT = 0;
  private nudgeT = 0;
  private lastX = 0;
  private lastZ = 0;
  private pickStation = -1;
  private way = { x: 0, z: 0 };
  private vip = { x: 0, z: 0 };
  /** Current raw-item trip is for the café stove rather than the shop counter. */
  private supplying = false;
  /** Current raw-item trip is for the truck at the loading dock. */
  private toDock = false;
  /** Crop being harvested this trip (null = not harvesting). */
  private harvesting: FieldCrop | null = null;
  private stalk = { x: 0, z: 0 };

  /** `skip`: upgrade tracks this bot never buys (a check that wants a farm without some stage). */
  constructor(private w: SimWorld, readonly profile: BotProfile, private skip?: (id: string) => boolean) {}

  private cheapestAffordable(): TileState | null {
    const up = this.w.upgrades;
    let best: TileState | null = null, bestR = Infinity;
    for (const t of up.tiles) {
      if (this.skip?.(t.def.id)) continue;
      const r = up.remaining(t.def.id);
      if (r <= this.w.money + 1e-6 && r < bestR) { best = t; bestR = r; }
    }
    return best;
  }

  private cheapestRemaining(): number {
    let r = Infinity;
    for (const t of this.w.upgrades.tiles) if (!this.skip?.(t.def.id)) r = Math.min(r, this.w.upgrades.remaining(t.def.id));
    return r;
  }

  private go(task: Task, x: number, z: number): void { this.task = task; this.tx = x; this.tz = z; }

  /** Lane worth standing at: an unstaffed lane with a stocked front customer, else the busiest lane. */
  private serveLane(): number {
    const w = this.w;
    let best = -1, bestScore = 0;
    for (let i = 0; i < w.lanes; i++) {
      const f = w.customers.front(i);
      if (!f || !w.customers.takeable(f)) continue;
      const score = (f.kind !== 'normal' ? 100 : i < w.cashiers ? 1 : 10) + w.customers.waitingPerLane[i];
      if (score > bestScore) { best = i; bestScore = score; }
    }
    return best;
  }

  /** Pick what to do this tick. */
  private decide(): void {
    const w = this.w, p = w.player, c = w.carry, shop = LAYOUT.shop;
    if (this.profile !== 'idle') {
      // player-only jobs first: jammed machines, golden animals, VIPs
      const jam = w.staff.machines.find((b) => b.broken);
      if (jam) { this.go('fix', jam.mx, jam.mz); return; }
      // the running event's own objective (herd, chase, kick...) when it has one for us
      const ev = w.scenario.active && this.profile === 'active' ? w.scenario.mech.botTarget?.(w) : null;
      if (ev) { this.go('event', ev.x, ev.z); return; }
      const g = w.golden.animal;
      if (g && this.profile === 'active') { this.go('golden', g.x, g.z); return; }
      if (vipDelivery(w, this.vip)) { this.go('serve', this.vip.x, this.vip.z); return; }
      for (let i = 0; i < w.lanes; i++) {
        const f = w.customers.front(i);
        if (f && f.kind !== 'normal' && w.customers.takeable(f)) { this.go('serve', shop.lanes[i].x, shop.serveZ); return; }
      }
    }
    const tile = this.cheapestAffordable();
    if (tile) {
      const d = dist(p.x, p.z, tile.def.pos.x, tile.def.pos.z);
      if (!tile.armed && d <= ECONOMY.tiles.armDistance + 0.05) {
        // the next level appeared under us: step off, then come back
        this.go('stepOff', tile.def.pos.x + 1.8, tile.def.pos.z);
        return;
      }
      this.go('tile', tile.def.pos.x, tile.def.pos.z);
      return;
    }
    const cashNeeded = w.money + w.cash.value >= this.cheapestRemaining();
    if (this.profile === 'idle') {
      if (w.cash.value > 0) this.go('cash', shop.cash.x, shop.cash.z);
      else this.go('wait', p.x, p.z);
      return;
    }
    // fields: keep cutting until full (stack or combine hopper) or the plot is bare, then sell it all
    const f = w.field;
    if (this.harvesting && c.items.every((it) => (FIELD_CROPS as string[]).includes(it))) {
      if (!f.full() && nearestStalk(w, this.stalk, this.harvesting)) { this.go('harvest', this.stalk.x, this.stalk.z); return; }
      this.harvesting = null;
    }
    if (f.held > 0) { this.go('sellCrop', FIELDS.stall.drop.x, FIELDS.stall.drop.z); return; }
    if (c.n > 0) {
      const cafe = w.cafe;
      // dishes go to the café counter
      if (c.items.some((it) => it in cafe.counter)) { this.go('cafeDrop', CAFE.counter.serve.x, CAFE.counter.serve.z); return; }
      // once a trip has started, fill up while the pile still has items, then unload
      const ps = w.stations[this.pickStation];
      if (ps && !c.full() && ps.pile > 0 && dist(p.x, p.z, ps.def.pile.x, ps.def.pile.z) < 2) { this.go('pick', ps.def.pile.x, ps.def.pile.z); return; }
      if (this.toDock && c.items.some((it) => w.contracts.stillNeeds(it as ProductId) > -1)) { this.go('dock', LAYOUT.dock.load.x, LAYOUT.dock.load.z); return; }
      this.toDock = false;
      if (this.supplying) {
        const m = cafe.machines.find((x) => c.has(x.raw) && x.conv.wants(x.raw));
        if (m) { this.go('stoveIn', m.input.x, m.input.z); return; }
      }
      this.supplying = false;
      for (const s of w.stations) {
        if (s.open && c.has(s.def.product)) { this.go('drop', s.def.counter.dropX, s.def.counter.dropZ); return; }
      }
    }
    if (w.cash.value > 0 && (cashNeeded || w.cash.bills >= 20)) { this.go('cash', shop.cash.x, shop.cash.z); return; }
    if (w.field.cash.value > 0 && (cashNeeded || w.field.cash.bills >= 30)) { this.go('cash', FIELDS.stall.cash.x, FIELDS.stall.cash.z); return; }
    // keep the troughs full (player-only production boost)
    const fc = ECONOMY.feed;
    const hungry = this.profile === 'active' ? w.stations.find((s) => s.open && s.def.trough && s.boostT < fc.duration * fc.refillBelow) : undefined;
    if (hungry && hungry.def.trough && c.n === 0) { this.go('feed', hungry.def.trough.x, hungry.def.trough.z + 0.5); return; }
    if (this.dockTask()) return;
    if (this.cafeTask()) return;
    if (this.fieldTask()) return;
    // fetch from the fullest pile once it can fill (most of) a trip
    let best = -1, bestN = 0;
    for (const s of w.stations) if (s.open && s.pile > bestN) { best = s.index; bestN = s.pile; }
    const lane = this.serveLane();
    // serve while there's stock for the waiting customer; fetch when stock runs low or the pile is nearly full
    const front = lane >= 0 ? w.customers.front(lane) : null;
    const line = front ? w.customers.takeable(front) : null;
    const stock = line ? w.stations[line.station].counter : 0;
    const pileUrgent = bestN >= ECONOMY.pile.max * 0.75;
    if (lane >= 0 && stock >= 1 && !(pileUrgent && stock < 4)) { this.go('serve', shop.lanes[lane].x, shop.serveZ); return; }
    if (best >= 0 && (bestN >= Math.min(c.cap, 4) || lane < 0)) {
      this.pickStation = best;
      const d = w.stations[best].def;
      this.go('pick', d.pile.x, d.pile.z);
      return;
    }
    if (lane >= 0) { this.go('serve', shop.lanes[lane].x, shop.serveZ); return; }
    if (w.cash.value > 0) { this.go('cash', shop.cash.x, shop.cash.z); return; }
    const s0 = w.stations.find((s) => s.open);
    if (s0) this.go('wait', s0.def.pile.x, s0.def.pile.z + 0.6);
  }

  /**
   * Harvest when the shop doesn't need the player (every waiting lane is staffed) and a plot has
   * enough grown stalks for a full trip; the pricier crop first.
   */
  private fieldTask(): boolean {
    const w = this.w, f = w.field, c = w.carry;
    if (!f.open || c.n > 0 || unservedLane(w) >= 0) return false;
    if (w.stations.some((s) => s.open && s.pile >= ECONOMY.pile.max * 0.75)) return false;
    const cap = f.vehicle === 'combine' ? ECONOMY.field.combine.hopper : c.cap;
    const need = cap * ECONOMY.field.stalksPerBundle;
    for (let i = f.plots.length - 1; i >= 0; i--) {
      const p = f.plots[i];
      if (!p.open || p.grown < need || !nearestStalk(w, this.stalk, p.crop)) continue;
      this.harvesting = p.crop;
      this.go('harvest', this.stalk.x, this.stalk.z);
      return true;
    }
    return false;
  }

  /** Load the waiting truck by hand while there are no dock workers. */
  private dockTask(): boolean {
    const w = this.w, ct = w.contracts, c = w.carry;
    if (!ct.open || ct.truck.state !== 'loading' || w.upgrades.level('dock.worker') > 0 || c.n > 0) return false;
    for (const s of w.stations) {
      if (s.open && s.pile >= 4 && ct.stillNeeds(s.def.product) > 0) {
        this.toDock = true;
        this.pickStation = s.index;
        this.go('pick', s.def.pile.x, s.def.pile.z);
        return true;
      }
    }
    return false;
  }

  /** Café chores the player still has to do by hand (staff take them over as they're hired). */
  private cafeTask(): boolean {
    const w = this.w, cafe = w.cafe, c = w.carry, up = w.upgrades;
    if (!cafe.open || c.n > 0) return false;
    // serve the café line (no café cashier yet) when the front customer can be served
    const front = cafe.customers.find((x) => x.state === 'queue');
    const shopFront = this.serveLane() >= 0 ? w.customers.front(this.serveLane()) : null;
    const cafeUrgent = front && (!shopFront || front.patience / front.patienceMax < shopFront.patience / shopFront.patienceMax);
    if (!cafe.waiter && front && front.lines.some((l) => l.left > 0 && cafe.counter[l.product] > 0) && cafeUrgent) {
      this.go('cafeServe', CAFE.counter.serve.x, CAFE.counter.serve.z);
      return true;
    }
    // dirty tables (no cleaner) and table money
    if (up.level('cafe.cleaner') === 0 || front) {
      for (let i = 0; i < cafe.tableCount; i++) {
        const t = cafe.tables[i];
        if ((t.dirty && !t.occupant && up.level('cafe.cleaner') === 0) || t.cash >= 40) { this.go(t.dirty ? 'clean' : 'tableCash', t.x, t.z - 0.9); return true; }
      }
    }
    if (cafe.cash.value >= 60) { this.go('cash', CAFE.cash.x, CAFE.cash.z); return true; }
    // keep the stove stocked (no kitchen helper yet)
    if (up.level('cafe.helper') === 0) {
      for (const s of w.stations) {
        const m = cafe.machineFor(s.def.product);
        if (s.open && m && s.pile >= 3 && m.conv.input[s.def.product] < 6) {
          this.supplying = true;
          this.pickStation = s.index;
          this.go('pick', s.def.pile.x, s.def.pile.z);
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Next point to walk to: the target if it's in plain view, otherwise the first corner on the
   * shortest path through a small visibility graph built from the corners of the big obstacles.
   */
  private route(px: number, pz: number): { x: number; z: number } {
    const way = this.way, r = ECONOMY.player.radius * 0.95;
    way.x = this.tx; way.z = this.tz;
    const g = graph(this.w), NODES = g.nodes;
    if (clear(g, px, pz, this.tx, this.tz, r)) return way;
    // Dijkstra over [start, ...corners, goal]
    const n = NODES.length + 2, G = n - 1;
    const nx = (i: number) => (i === 0 ? px : i === G ? this.tx : NODES[i - 1][0]);
    const nz = (i: number) => (i === 0 ? pz : i === G ? this.tz : NODES[i - 1][1]);
    // (grow the scratch arrays when more obstacles appear: writes past a typed array's end are dropped)
    if (this.dist.length < n) { this.dist = new Float64Array(n * 2); this.prev = new Int32Array(n * 2); this.done = new Uint8Array(n * 2); }
    const D = this.dist, prev = this.prev, done = this.done;
    for (let i = 0; i < n; i++) { D[i] = Infinity; prev[i] = -1; done[i] = 0; }
    D[0] = 0;
    for (;;) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || D[i] < D[u])) u = i;
      if (u < 0 || D[u] === Infinity || u === G) break;
      done[u] = 1;
      for (let v = 1; v < n; v++) {
        if (done[v]) continue;
        const d = D[u] + dist(nx(u), nz(u), nx(v), nz(v));
        if (d < D[v] && clear(g, nx(u), nz(u), nx(v), nz(v), r)) { D[v] = d; prev[v] = u; }
      }
    }
    if (prev[G] < 0) return way; // no path: walk straight and let the unstick nudge handle it
    let v = G;
    while (prev[v] > 0) v = prev[v];
    way.x = nx(v); way.z = nz(v);
    return way;
  }
  private dist = new Float64Array(64);
  private prev = new Int32Array(64);
  private done = new Uint8Array(64);

  /** Casual play: own RNG so the world's randomness stays the same per profile. */
  private casualRng = new Rng(4242);
  private pauseT = 0;
  private decideT = 0;

  update(dt: number): void {
    const w = this.w, p = w.player;
    if (this.profile === 'casual') {
      // stand around now and then (~30% of the time), and react with a short delay
      if (this.pauseT > 0) { this.pauseT -= dt; w.input.x = w.input.z = 0; return; }
      if (this.casualRng.next() < dt * 0.25) { this.pauseT = this.casualRng.range(2, 5); return; }
      this.decideT -= dt;
      if (this.decideT <= 0) { this.decide(); this.decideT = 1.0; }
    } else this.decide();
    const dT = dist(p.x, p.z, this.tx, this.tz);
    const stop = this.task === 'tile' ? 0.3 : 0.45;
    if (dT < stop) { w.input.x = w.input.z = 0; this.stuckT = 0; return; }
    const to = this.route(p.x, p.z);
    const dx = to.x - p.x, dz = to.z - p.z, d = Math.hypot(dx, dz) || 1;
    let ix = dx / d, iz = dz / d;
    // unstick: if we barely moved for a while, sidestep
    const moved = Math.hypot(p.x - this.lastX, p.z - this.lastZ);
    this.lastX = p.x; this.lastZ = p.z;
    if (moved < 0.5 * dt) this.stuckT += dt; else this.stuckT = 0;
    if (this.stuckT > 0.6) { this.nudgeT = 0.5; this.stuckT = 0; }
    if (this.nudgeT > 0) { this.nudgeT -= dt; const t = ix; ix = -iz; iz = t; }
    w.input.x = ix;
    w.input.z = iz;
  }
}
