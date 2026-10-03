import { DISH_IDS, ECONOMY, type DishId, type ItemId, type ProductId } from '../config/economy';
import { pickType } from '../config/album';
import { CAFE } from '../config/cafe';
import { KITCHEN_RECIPES } from '../config/recipes';
import { Converter } from './converter';
import { Belt, type WorkerJob } from './staff';
import { dist, moveToward, turnToward } from './math';
import type { SimWorld } from './world';

export interface Table {
  readonly x: number;
  readonly z: number;
  /** Café customer id sitting here or on the way (0 = free). */
  occupant: number;
  dirty: boolean;
  /** Money left on the table (collected by the player, or carried to the café cash pile by a cleaner). */
  cash: number;
  bills: number;
  /** Seconds the player has spent cleaning it. */
  cleanT: number;
  /** A cleaner is on the way. */
  claimed: boolean;
}

export interface DishLine { product: DishId; qty: number; left: number }

export type CafeState = 'queue' | 'toTable' | 'eat' | 'leave' | 'angry';

export interface CafeCustomer {
  id: number;
  look: number;
  /** Customer type (album entry) — also picks their clothes. */
  type: string;
  x: number; z: number; rot: number; speed: number;
  state: CafeState;
  lines: DishLine[];
  qty: number;
  left: number;
  patience: number;
  patienceMax: number;
  playerItems: number;
  away: boolean;
  /** Arrived during a café rush. */
  rush: boolean;
  table: number;
  takeT: number;
  servedT: number;
  eatT: number;
  gone: boolean;
}

type CleanerState = 'idle' | 'toTable' | 'clean' | 'toCash';

export class Cleaner {
  x: number; z: number; rot = 0; speed = 0;
  state: CleanerState = 'idle';
  table = -1;
  t = 0;
  carryCash = 0;
  carryBills = 0;
  constructor(readonly slot: number) {
    this.x = 13.4 + slot;
    this.z = 8.8;
  }
}

/** One kitchen machine: its converter, the drop spot for its raw item, and the conveyor to the counter. */
export interface KitchenMachine {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly raw: ProductId;
  readonly input: { x: number; z: number };
  readonly conv: Converter;
  readonly belt: Belt;
}

/** Kitchen helper job: eggs/milk from the piles (or shop-counter surplus) into the right machine. */
class SupplyJob implements WorkerJob {
  readonly key = 'cafe.supply';
  private target: number[] = [];
  private fromCounter: boolean[] = [];
  constructor(private cafe: CafeSystem) {}
  loadAt(w: SimWorld, slot: number, out: { x: number; z: number }): void {
    // the machine whose dish is shortest on the café counter (plus what it already has waiting)
    let best = -1, bestN = Infinity;
    for (const s of w.stations) {
      const m = this.cafe.machineFor(s.def.product);
      if (!s.open || !m || !m.conv.wants(s.def.product)) continue;
      let onCounter = 0;
      for (const r of m.conv.recipes) onCounter += this.cafe.counter[r.output] ?? 0;
      const n = onCounter + m.conv.input[s.def.product] * 1.5;
      if (n < bestN) { best = s.index; bestN = n; }
    }
    if (best < 0) best = this.target[slot] ?? w.stations.findIndex((s) => s.open);
    this.target[slot] = best;
    const st = w.stations[best], d = st.def;
    // empty pile (belts/workers took it): use the shop counter's surplus instead
    this.fromCounter[slot] = st.pile < 2 && st.counter > ECONOMY.cafe.counterReserve;
    if (this.fromCounter[slot]) { out.x = d.counter.dropX + 0.4 * slot; out.z = d.counter.dropZ - 0.4; return; }
    out.x = d.pile.x + 1.0 + slot * 0.4;
    out.z = d.pile.z + 1.1;
  }
  take(w: SimWorld): ItemId | null {
    for (let slot = 0; slot < this.target.length; slot++) {
      const s = w.stations[this.target[slot]];
      const m = s && this.cafe.machineFor(s.def.product);
      if (!s || !m || !m.conv.wants(s.def.product)) continue;
      if (this.fromCounter[slot]) {
        if (s.counter > ECONOMY.cafe.counterReserve) { s.counter--; return s.def.product; }
      } else if (s.pile > 0) { s.pile--; return s.def.product; }
    }
    return null;
  }
  unloadAt(w: SimWorld, slot: number, out: { x: number; z: number }): void {
    const s = w.stations[this.target[slot] ?? 0];
    const m = (s && this.cafe.machineFor(s.def.product)) ?? this.cafe.machines[0];
    out.x = m.input.x - 0.4 + slot * 0.4;
    out.z = m.input.z + 0.5;
  }
  give(_w: SimWorld, item: ItemId): boolean {
    const m = this.cafe.machineFor(item as ProductId);
    return !!m && m.conv.accept(item as ProductId);
  }
  room(w: SimWorld, slot: number): number {
    const s = w.stations[this.target[slot]];
    const m = s && this.cafe.machineFor(s.def.product);
    return m ? m.conv.inputMax - m.conv.input[s.def.product] : 0;
  }
  putBack(w: SimWorld, item: ItemId): void {
    const s = w.stations.find((x) => x.def.product === item);
    if (s) s.counter++;
  }
}

/** Zone radii in the café. */
const R = { machineIn: 1.2, serve: 1.6, table: 1.15, cash: 1.3 } as const;

/**
 * Farm café: kitchen machines (egg stove, coffee machine) turn eggs/milk into dishes that slide to
 * the café counter on their own; café customers order there, take food to a free clean table, eat,
 * and leave money plus a dirty table behind.
 */
export class CafeSystem {
  open = false;
  readonly machines: KitchenMachine[] = [];
  readonly counter = {} as Record<DishId, number>;
  readonly tables: Table[] = [];
  readonly cash = { value: 0, bills: 0 };
  readonly customers: CafeCustomer[] = [];
  readonly cleaners: Cleaner[] = [];
  private nextId = 1;
  private spawnT = 3;
  private dropT = 0;
  private supply: SupplyJob;

  constructor(private w: SimWorld) {
    for (const d of DISH_IDS) this.counter[d] = 0;
    for (const [x, z] of CAFE.tables) this.tables.push({ x, z, occupant: 0, dirty: false, cash: 0, bills: 0, cleanT: 0, claimed: false });
    const cb = CAFE.counter.box;
    CAFE.kitchen.forEach((k, i) => {
      const conv = new Converter(KITCHEN_RECIPES[k.id], ECONOMY.cafe.stoveInputMax, ECONOMY.cafe.stoveOutputMax, (k.box.x0 + k.box.x1) / 2, k.box.z1 + 0.7);
      // each machine's dishes slide to the café counter on a short conveyor (no carrying needed)
      const belt = new Belt({
        ax: k.beltX, az: k.box.z1 + 0.1, bx: k.beltX, bz: cb.z0 - 0.1,
        take: () => (this.counter[conv.recipes[0].output] >= ECONOMY.cafe.counterMax ? null : conv.takeAny()),
        deliver: (item) => { this.counter[item as DishId]++; },
      }, 100 + i, 0.8);
      w.staff.addBelt(belt);
      w.staff.machines.push(conv);
      this.machines.push({ id: k.id, name: k.name, icon: k.icon, raw: k.raw, input: k.input, conv, belt });
    });
    this.supply = new SupplyJob(this);
  }

  /** The kitchen machine that takes this raw item. */
  machineFor(p: ProductId): KitchenMachine | undefined {
    return this.machines.find((m) => m.raw === p);
  }

  /** Number of tables in use (by upgrade level). */
  get tableCount(): number {
    return this.open ? Math.min(this.tables.length, 2 + this.w.upgrades.level('cafe.tables')) : 0;
  }

  get waiter(): boolean { return this.w.upgrades.level('cafe.waiter') > 0; }

  /** Café price multiplier from nicer tables. */
  get priceMult(): number { return 1 + this.w.upgrades.level('cafe.nice') * ECONOMY.cafe.niceStep; }

  /** Reconcile from upgrade levels (called from UpgradeSystem.apply). */
  sync(): void {
    const w = this.w, up = w.upgrades;
    this.open = up.level('cafe.unlock') > 0;
    const speed = 1 + up.level('cafe.stove') * ECONOMY.upgrades['cafe.stove'].step;
    for (const m of this.machines) {
      m.conv.enabled = this.open;
      m.conv.speedMult = speed;
      m.belt.level = this.open ? 1 + up.level('cafe.stove') : 0;
    }
    // the café opens with one kitchen helper (piles are often drained by belts by then); the track adds more
    w.staff.ensureWorkers(this.supply, this.open ? 1 + up.level('cafe.helper') : 0, CAFE.helperHome.x, CAFE.helperHome.z);
    while (this.cleaners.length < up.level('cafe.cleaner')) this.cleaners.push(new Cleaner(this.cleaners.length));
  }

  playerAtCounter(): boolean {
    const p = this.w.player, s = CAFE.counter.serve;
    return !this.w.away && dist(p.x, p.z, s.x, s.z) < R.serve;
  }

  /** Dishes on offer (recipes whose raw product is on the farm). */
  private menu(): DishId[] {
    const out: DishId[] = [];
    for (const m of this.machines) for (const r of m.conv.active(this.w)) out.push(r.output);
    // factory dishes: only while some are on the counter (a stalled chain never angers anyone)
    for (const m of this.w.factory.machines) if (this.counter[m.def.makes] > 0) out.push(m.def.makes);
    return out;
  }

  get interval(): number {
    const w = this.w, n = this.tableCount;
    const rushMult = w.rush.active && w.rush.kind.target === 'cafe' ? ECONOMY.rush.arrivalMult : 1;
    return 60 / Math.max(0.01, ECONOMY.cafe.perTable * n * w.service.arrivalMult * rushMult);
  }

  private spawn(): void {
    const w = this.w, rng = w.rng, cfg = ECONOMY.cafe;
    const menu = this.menu();
    if (!menu.length) return;
    const total = 1 + rng.int(cfg.maxDishes);
    const lines: DishLine[] = [];
    for (let i = 0; i < total; i++) {
      const d = rng.pick(menu);
      const l = lines.find((x) => x.product === d);
      if (l) { l.qty++; l.left++; } else lines.push({ product: d, qty: 1, left: 1 });
    }
    const pc = cfg.patience * (1 + w.upgrades.level('cafe.nice') * 0.2);
    const rush = w.rush.active && w.rush.kind.target === 'cafe';
    if (rush) w.rush.spawned++;
    const look = rng.int(1 << 30);
    this.customers.push({
      id: this.nextId++, look, type: pickType(this.w, look), x: CAFE.spawn.x + rng.range(-1, 1), z: CAFE.spawn.z, rot: Math.PI, speed: 0,
      state: 'queue', lines, qty: total, left: total, patience: pc, patienceMax: pc, playerItems: 0, away: w.away, rush,
      table: -1, takeT: 0, servedT: 0, eatT: 0, gone: false,
    });
  }

  private freeTable(): number {
    for (let i = 0; i < this.tableCount; i++) {
      const t = this.tables[i];
      if (!t.occupant && !t.dirty) return i;
    }
    return -1;
  }

  /** Player walk-in zones: machine inputs, tables, café cash (serving = standing at the counter). */
  interact(dt: number): void {
    if (!this.open) return;
    const w = this.w, p = w.player, c = w.carry, cfg = ECONOMY.player;
    this.dropT -= dt;
    // factory dishes the player carried over go onto the café counter at the serve spot
    if (this.dropT <= 0 && this.playerAtCounter()) {
      for (const m of w.factory.machines) {
        const d = m.def.makes;
        if (!c.has(d) || this.counter[d] >= ECONOMY.cafe.counterMax) continue;
        c.take(d);
        this.counter[d]++;
        this.dropT = cfg.dropInterval;
        w.events.emit('drop', d, CAFE.counter.serve.x, CAFE.counter.serve.z, 0, c.n);
        break;
      }
    }
    // raw items into whichever machine the player stands at (each takes its own raw item)
    if (this.dropT <= 0) {
      for (const m of this.machines) {
        const forced = w.scenario.active && !!w.scenario.mech.feedAnyway?.(m.id);
        if (dist(p.x, p.z, m.input.x, m.input.z) >= R.machineIn || !c.has(m.raw) || !(m.conv.wants(m.raw) || forced)) continue;
        c.take(m.raw);
        // a full tray during the cook-off: the chef takes it straight to his pan
        m.conv.accept(m.raw);
        if (w.scenario.active) w.scenario.mech.onPlayerFeed?.(w, m.id);
        this.dropT = cfg.dropInterval;
        w.events.emit('drop', m.raw, m.input.x, m.input.z, 0, c.n);
        break;
      }
    }
    // tables: grab the money, clean if dirty
    for (let i = 0; i < this.tableCount; i++) {
      const t = this.tables[i];
      if (dist(p.x, p.z, t.x, t.z) >= R.table) { t.cleanT = 0; continue; }
      if (t.cash > 0) {
        const v = t.cash;
        w.money += v;
        w.stats.earned += v;
        w.events.emit('collect', '', t.x, t.z, v, t.bills);
        t.cash = 0;
        t.bills = 0;
      }
      if (t.dirty && !t.occupant) {
        t.cleanT += dt;
        if (t.cleanT >= ECONOMY.cafe.cleanTime) this.clean(i);
      }
    }
    const cp = CAFE.cash;
    if (this.cash.value > 0 && dist(p.x, p.z, cp.x, cp.z) < R.cash) {
      const v = this.cash.value;
      w.money += v;
      w.stats.earned += v;
      w.events.emit('collect', '', cp.x, cp.z, v, this.cash.bills);
      this.cash.value = 0;
      this.cash.bills = 0;
    }
  }

  /** What a café customer pays for their order (counts toward a café rush's sales). */
  private bill(c: CafeCustomer): number {
    let value = 0;
    for (const l of c.lines) value += l.qty * ECONOMY.dishes[l.product].price * this.w.priceMult;
    value = Math.round(value * this.priceMult);
    if (c.rush) this.w.rush.sales += value;
    return value;
  }

  private clean(i: number): void {
    const t = this.tables[i];
    t.dirty = false;
    t.cleanT = 0;
    t.claimed = false;
    this.w.stats.tables++;
    this.w.events.emit('cleaned', '', t.x, t.z, 0, 0, i);
  }

  private updateCustomers(dt: number): void {
    const w = this.w, q = CAFE.counter.queue, walk = ECONOMY.customers.walkSpeed;
    this.spawnT -= dt;
    let waiting = 0;
    for (const c of this.customers) if (c.state === 'queue') waiting++;
    if (this.spawnT <= 0) {
      if (waiting < 5 && this.tableCount > 0) this.spawn();
      this.spawnT = this.interval * w.rng.range(0.7, 1.3);
    }
    const playerHere = this.playerAtCounter();
    const served = playerHere || this.waiter;
    let slot = 0;
    for (const c of this.customers) {
      switch (c.state) {
        case 'queue': {
          const s = slot++;
          const arrived = moveToward(c, q.x, q.z + s * q.gap, walk, dt, 0.08);
          if (arrived) c.rot = turnToward(c.rot, 0, -1, 12, dt);
          c.servedT -= dt;
          if (s === 0 && arrived && served) {
            if (c.table < 0) {
              const t = this.freeTable();
              if (t >= 0) { c.table = t; this.tables[t].occupant = c.id; }
            }
            c.takeT -= dt;
            // no clean table: still served, they take it to go (pays at the café cash, no tip)
            if (c.takeT <= 0) {
              const line = c.lines.find((l) => l.left > 0 && this.counter[l.product] > 0);
              if (line) {
                this.counter[line.product]--;
                line.left--;
                c.left--;
                if (playerHere) c.playerItems++;
                c.takeT = ECONOMY.customers.takeInterval * (playerHere ? 1 : ECONOMY.cafe.waiterSlow);
                c.servedT = 0.8;
                w.events.emit('cafeTake', line.product, c.x, c.z, 0, c.qty - c.left, c.id);
                if (c.left <= 0) {
                  w.stats.cafeServed++;
                  if (c.table >= 0) c.state = 'toTable';
                  else {
                    const value = this.bill(c);
                    w.service.complete(c, value);
                    this.cash.value += value;
                    this.cash.bills += Math.min(6, c.qty);
                    c.state = 'leave';
                  }
                }
              }
            }
          }
          if (c.state === 'queue' && c.servedT <= 0) {
            c.patience -= dt;
            if (c.patience <= 0) {
              c.state = 'angry';
              // return what they took, free the table
              for (const l of c.lines) { this.counter[l.product] += l.qty - l.left; l.left = l.qty; }
              if (c.table >= 0) { this.tables[c.table].occupant = 0; c.table = -1; }
              if (c.rush) w.rush.angry++;
              w.service.angry(c);
              w.events.emit('angry', '', c.x, c.z, 0, 0, c.id);
            }
          }
          break;
        }
        case 'toTable': {
          const t = this.tables[c.table];
          if (moveToward(c, t.x, t.z + 0.75, walk, dt, 0.1)) { c.state = 'eat'; c.eatT = ECONOMY.cafe.eatTime; }
          break;
        }
        case 'eat': {
          c.rot = turnToward(c.rot, 0, -1, 12, dt);
          c.eatT -= dt;
          if (c.eatT <= 0) {
            const t = this.tables[c.table];
            const value = this.bill(c);
            // tips/combo/rating go through the shared service system
            const tip = w.service.complete(c, value);
            t.cash += value + tip;
            t.bills += Math.min(6, c.qty + (tip > 0 ? 1 : 0));
            t.dirty = true;
            t.occupant = 0;
            c.state = 'leave';
            w.events.emit('cafePaid', '', t.x, t.z, value + tip, 0, c.table);
          }
          break;
        }
        case 'leave':
        case 'angry':
          if (moveToward(c, CAFE.exit.x, CAFE.exit.z, walk * 1.1, dt, 0.3)) c.gone = true;
          break;
      }
    }
    for (let i = this.customers.length - 1; i >= 0; i--) if (this.customers[i].gone) this.customers.splice(i, 1);
  }

  private updateCleaners(dt: number): void {
    const cfg = ECONOMY.cafe, cp = CAFE.cash;
    for (const cl of this.cleaners) {
      cl.speed = 0;
      switch (cl.state) {
        case 'idle': {
          const i = this.tables.findIndex((t, k) => k < this.tableCount && t.dirty && !t.occupant && !t.claimed);
          if (i >= 0) { cl.table = i; this.tables[i].claimed = true; cl.state = 'toTable'; }
          else moveToward(cl, CAFE.cleanerIdle.x, CAFE.cleanerIdle.z - cl.slot * 0.7, cfg.cleanerSpeed, dt, 0.2);
          break;
        }
        case 'toTable': {
          const t = this.tables[cl.table];
          if (!t.dirty) { t.claimed = false; cl.state = 'idle'; break; }
          if (moveToward(cl, t.x - 0.8, t.z, cfg.cleanerSpeed, dt, 0.15)) { cl.state = 'clean'; cl.t = cfg.cleanTime * cfg.cleanerSlow; }
          break;
        }
        case 'clean': {
          const t = this.tables[cl.table];
          cl.rot = turnToward(cl.rot, 1, 0, 12, dt);
          cl.t -= dt;
          if (!t.dirty) { cl.state = 'idle'; break; }
          if (cl.t <= 0) {
            cl.carryCash += t.cash;
            cl.carryBills += t.bills;
            t.cash = 0;
            t.bills = 0;
            this.clean(cl.table);
            cl.state = cl.carryCash > 0 ? 'toCash' : 'idle';
          }
          break;
        }
        case 'toCash':
          if (moveToward(cl, cp.x + 0.8, cp.z + 0.6, cfg.cleanerSpeed, dt, 0.2)) {
            this.cash.value += cl.carryCash;
            this.cash.bills += cl.carryBills;
            cl.carryCash = 0;
            cl.carryBills = 0;
            cl.state = 'idle';
          }
          break;
      }
    }
  }

  update(dt: number): void {
    if (!this.open) return;
    if (!this.w.scenario.powerCut) for (const m of this.machines) m.conv.update(dt, this.w);
    this.updateCustomers(dt);
    this.updateCleaners(dt);
  }

  /** Money sitting in the café (tables + cash pile + cleaners' hands). */
  get uncollected(): number {
    let v = this.cash.value;
    for (const t of this.tables) v += t.cash;
    for (const c of this.cleaners) v += c.carryCash;
    return v;
  }
}
