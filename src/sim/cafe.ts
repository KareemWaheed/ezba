import { DISH_IDS, ECONOMY, type DishId, type ItemId, type ProductId } from '../config/economy';
import { CAFE } from '../config/cafe';
import { STOVE_RECIPES } from '../config/recipes';
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
  x: number; z: number; rot: number; speed: number;
  state: CafeState;
  lines: DishLine[];
  qty: number;
  left: number;
  patience: number;
  patienceMax: number;
  playerItems: number;
  away: boolean;
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

/** Kitchen helper job: eggs/milk from the piles into the stove. */
class SupplyJob implements WorkerJob {
  readonly key = 'cafe.supply';
  private target: number[] = [];
  private fromCounter: boolean[] = [];
  constructor(private cafe: CafeSystem) {}
  loadAt(w: SimWorld, slot: number, out: { x: number; z: number }): void {
    // pick the open station whose product the stove is lowest on
    let best = -1, bestN = Infinity;
    for (const s of w.stations) {
      if (!s.open || !this.cafe.stove.wants(s.def.product)) continue;
      const n = this.cafe.stove.input[s.def.product] - s.pile * 0.01;
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
      if (!s || !this.cafe.stove.wants(s.def.product)) continue;
      if (this.fromCounter[slot]) {
        if (s.counter > ECONOMY.cafe.counterReserve) { s.counter--; return s.def.product; }
      } else if (s.pile > 0) { s.pile--; return s.def.product; }
    }
    return null;
  }
  unloadAt(_w: SimWorld, slot: number, out: { x: number; z: number }): void {
    out.x = CAFE.stove.input.x - 0.5 + slot * 0.5;
    out.z = CAFE.stove.input.z + 0.4;
  }
  give(_w: SimWorld, item: ItemId): boolean {
    return this.cafe.stove.accept(item as ProductId);
  }
}

/** Zone radii in the café. */
const R = { stoveIn: 1.2, stoveOut: 1.2, serve: 1.6, table: 1.15, cash: 1.3 } as const;

/**
 * Farm café: stove turns eggs/milk into dishes, café customers order at the café counter, carry
 * food to a free clean table, eat, and leave money plus a dirty table behind.
 */
export class CafeSystem {
  open = false;
  readonly stove: Converter;
  readonly counter = {} as Record<DishId, number>;
  readonly tables: Table[] = [];
  readonly cash = { value: 0, bills: 0 };
  readonly customers: CafeCustomer[] = [];
  readonly cleaners: Cleaner[] = [];
  readonly belt: Belt;
  private nextId = 1;
  private spawnT = 3;
  private dropT = 0;
  private pickT = 0;
  private supply: SupplyJob;

  constructor(private w: SimWorld) {
    const s = CAFE.stove;
    this.stove = new Converter(STOVE_RECIPES, ECONOMY.cafe.stoveInputMax, ECONOMY.cafe.stoveOutputMax, (s.box.x0 + s.box.x1) / 2, s.box.z1 + 0.7);
    for (const d of DISH_IDS) this.counter[d] = 0;
    for (const [x, z] of CAFE.tables) this.tables.push({ x, z, occupant: 0, dirty: false, cash: 0, bills: 0, cleanT: 0, claimed: false });
    this.belt = new Belt({
      ax: s.output.x + 0.5, az: s.output.z + 0.3, bx: CAFE.counter.box.x1 + 0.4, bz: CAFE.counter.box.z0 - 0.1,
      take: () => this.stove.takeAny(),
      deliver: (item) => { this.counter[item as DishId]++; },
    }, 100, 1.2);
    this.supply = new SupplyJob(this);
    w.staff.addBelt(this.belt);
    w.staff.machines.push(this.stove);
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
    this.stove.enabled = this.open;
    this.stove.speedMult = 1 + up.level('cafe.stove') * ECONOMY.upgrades['cafe.stove'].step;
    this.belt.level = up.level('cafe.belt');
    w.staff.ensureWorkers(this.supply, this.open ? up.level('cafe.helper') : 0, 15, 4);
    while (this.cleaners.length < up.level('cafe.cleaner')) this.cleaners.push(new Cleaner(this.cleaners.length));
  }

  playerAtCounter(): boolean {
    const p = this.w.player, s = CAFE.counter.serve;
    return !this.w.away && dist(p.x, p.z, s.x, s.z) < R.serve;
  }

  /** Dishes on offer (recipes whose raw product is on the farm). */
  private menu(): DishId[] {
    return this.stove.active(this.w).map((r) => r.output);
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
    this.customers.push({
      id: this.nextId++, look: rng.int(1 << 30), x: CAFE.spawn.x + rng.range(-1, 1), z: CAFE.spawn.z, rot: Math.PI, speed: 0,
      state: 'queue', lines, qty: total, left: total, patience: pc, patienceMax: pc, playerItems: 0, away: w.away,
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

  /** Player walk-in zones: stove in/out, café counter, tables, café cash. */
  interact(dt: number): void {
    if (!this.open) return;
    const w = this.w, p = w.player, c = w.carry, cfg = ECONOMY.player, s = CAFE.stove;
    this.dropT -= dt;
    this.pickT -= dt;
    // raw items into the stove
    if (this.dropT <= 0 && dist(p.x, p.z, s.input.x, s.input.z) < R.stoveIn) {
      for (let i = c.n - 1; i >= 0; i--) {
        const it = c.items[i] as ProductId;
        if (this.stove.wants(it)) {
          c.items.splice(i, 1);
          this.stove.accept(it);
          this.dropT = cfg.dropInterval;
          w.events.emit('drop', it, s.input.x, s.input.z, 0, c.n);
          break;
        }
      }
    }
    // dishes out of the stove
    if (this.pickT <= 0 && !c.full() && dist(p.x, p.z, s.output.x, s.output.z) < R.stoveOut) {
      const d = this.stove.takeAny();
      if (d) { c.push(d); this.pickT = cfg.pickInterval; w.events.emit('pick', d, s.output.x, s.output.z, 0, c.n); }
    }
    // dishes onto the café counter
    const sv = CAFE.counter.serve;
    if (this.dropT <= 0 && dist(p.x, p.z, sv.x, sv.z) < R.serve) {
      for (let i = c.n - 1; i >= 0; i--) {
        const it = c.items[i];
        if (it in this.counter) {
          c.items.splice(i, 1);
          this.counter[it as DishId]++;
          this.dropT = cfg.dropInterval;
          w.events.emit('drop', it, CAFE.counter.slots[it as DishId].x, CAFE.counter.slotZ, 0, c.n);
          break;
        }
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
            if (c.table >= 0 && c.takeT <= 0) {
              const line = c.lines.find((l) => l.left > 0 && this.counter[l.product] > 0);
              if (line) {
                this.counter[line.product]--;
                line.left--;
                c.left--;
                if (playerHere) c.playerItems++;
                c.takeT = ECONOMY.customers.takeInterval * (playerHere ? 1 : ECONOMY.cafe.waiterSlow);
                c.servedT = 0.8;
                w.events.emit('cafeTake', line.product, c.x, c.z, 0, c.qty - c.left, c.id);
                if (c.left <= 0) { c.state = 'toTable'; w.stats.cafeServed++; }
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
            let value = 0;
            for (const l of c.lines) value += l.qty * ECONOMY.dishes[l.product].price;
            value = Math.round(value * this.priceMult);
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
          else moveToward(cl, 13.4 + cl.slot, 8.8, cfg.cleanerSpeed, dt, 0.2);
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
    this.stove.update(dt, this.w);
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
