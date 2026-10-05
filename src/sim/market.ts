import { ECONOMY, type ItemId } from '../config/economy';
import { MARKET, MARKET_PRODUCT, SHELVES, type ShelfDef } from '../config/market';
import { pickType } from '../config/album';
import type { WorkerJob } from './staff';
import type { SimWorld } from './world';
import { dist, moveToward, turnToward } from './math';

export interface Shelf {
  readonly def: ShelfDef;
  readonly index: number;
  open: boolean;
  stock: number;
}

export interface ShopLine { product: ItemId; shelf: number; qty: number; left: number }

export type ShopperState = 'shop' | 'toQueue' | 'queue' | 'leave' | 'angry';

export interface Shopper {
  id: number;
  look: number;
  type: string;
  x: number; z: number; rot: number; speed: number;
  state: ShopperState;
  lines: ShopLine[];
  /** Line being shopped. */
  li: number;
  /** Items in the basket (paid at the checkout), and how many are scanned so far. */
  got: ItemId[];
  scanned: number;
  /** Seconds waited at an empty shelf / until the next item comes off the shelf or is scanned. */
  waitT: number;
  takeT: number;
  patience: number;
  patienceMax: number;
  gone: boolean;
}

/** A wholesale order on its way (arrives after `t` seconds). */
export interface Delivery { item: ItemId; n: number; t: number; /** From the player's own farm (free). */ farm?: boolean }

/**
 * Take one farm-made item from the farm's surplus for a farm delivery: the shop counter beyond its reserve
 * (eggs, milk, corn), the factory trays (cheese, cake) or the fish pile. False when there's none spare.
 */
function farmTake(w: SimWorld, item: ItemId): boolean {
  const st = w.stations.find((s) => s.def.product === item);
  if (st) {
    if (!st.open || st.counter <= ECONOMY.cafe.counterReserve) return false;
    st.counter--;
    return true;
  }
  const m = w.factory.machines.find((x) => x.def.makes === item);
  if (m) {
    if (!m.open || m.conv.output[m.def.makes] <= 0) return false;
    m.conv.output[m.def.makes]--;
    return true;
  }
  if (item === 'fish' && w.river.open && w.river.pile > 0) { w.river.pile--; return true; }
  return false;
}

/** Walkways between shelf units (and past the row ends) that shoppers use to change aisles. */
const GAPS_X = (() => {
  const xs = [...new Set(SHELVES.map((s) => s.box.x0))].sort((a, b) => a - b);
  const x1s = [...new Set(SHELVES.map((s) => s.box.x1))].sort((a, b) => a - b);
  const out = [xs[0] - 0.5];
  for (let i = 0; i < x1s.length - 1; i++) out.push((x1s[i] + xs[i + 1]) / 2);
  out.push(x1s[x1s.length - 1] + 0.5);
  return out;
})();

/** Whether walking straight from (x, z) to (tx, tz) would pass through a shelf unit. */
function crossesShelf(x: number, z: number, tx: number, tz: number): boolean {
  for (const s of SHELVES) {
    const b = s.box;
    if (Math.min(z, tz) > b.z1 || Math.max(z, tz) < b.z0) continue;
    // x where the path crosses the shelf's middle line
    const cz = (b.z0 + b.z1) / 2, k = tz === z ? 0 : (cz - z) / (tz - z), cx = x + (tx - x) * Math.max(0, Math.min(1, k));
    if (cx > b.x0 - 0.2 && cx < b.x1 + 0.2) return true;
  }
  return false;
}

/** Next point toward (tx, tz) for a shopper: change aisles through the nearest gap between shelves. */
function aisleRoute(x: number, z: number, tx: number, tz: number, out: { x: number; z: number }): { x: number; z: number } {
  out.x = tx; out.z = tz;
  if (!crossesShelf(x, z, tx, tz)) return out;
  let gx = GAPS_X[0];
  for (const g of GAPS_X) if (Math.abs(g - (x + tx) / 2) < Math.abs(gx - (x + tx) / 2)) gx = g;
  // line up with the gap in this aisle, then walk through it to the target's aisle
  if (Math.abs(x - gx) > 0.2) { out.x = gx; out.z = z; } else { out.x = gx; out.z = tz; }
  return out;
}

/** One shelf stocker (one job per stocker): one product per trip, from the storeroom to its shelf. */
class StockerJob implements WorkerJob {
  readonly key: string;
  /** Shelf index of the current trip (-1 = none yet), and items loaded for it so far. */
  shelf = -1;
  private loaded = 0;
  constructor(private m: MarketSystem, readonly n: number) { this.key = `market.stock${n}`; }

  /** The open shelf that's emptiest, with storeroom stock to fill it (no two stockers on one shelf). */
  private pick(): void {
    let best = -1, bestN = Infinity;
    for (const s of this.m.shelves) {
      if (!s.open || s.stock >= ECONOMY.supermarket.shelfMax || this.m.store[s.def.item] <= 0) continue;
      if (this.m.stockers.some((j) => j !== this && j.shelf === s.index)) continue;
      if (s.stock < bestN) { best = s.index; bestN = s.stock; }
    }
    this.shelf = best;
  }

  loadAt(_w: SimWorld, _slot: number, out: { x: number; z: number }): void {
    this.loaded = 0;
    this.pick();
    out.x = MARKET.store.x + 0.2 - this.n * 0.5;
    out.z = MARKET.store.z + 0.5;
  }

  /**
   * The current target, re-picked when stale (chosen while the storeroom was empty, or filled since);
   * once this trip has loaded something it sticks to that shelf (one product per trip).
   */
  private target(): Shelf | undefined {
    const s = this.m.shelves[this.shelf];
    if (this.loaded > 0 || (s && s.open && s.stock < ECONOMY.supermarket.shelfMax && this.m.store[s.def.item] > 0)) return s;
    this.pick();
    return this.m.shelves[this.shelf];
  }

  take(): ItemId | null {
    const s = this.target();
    if (s && this.m.store[s.def.item] > 0) { this.m.store[s.def.item]--; this.loaded++; return s.def.item; }
    return null;
  }

  unloadAt(_w: SimWorld, _slot: number, out: { x: number; z: number }): void {
    const s = this.m.shelves[Math.max(0, this.shelf)];
    out.x = s.def.front.x - 0.4 + this.n * 0.5;
    out.z = s.def.front.z;
  }

  give(_w: SimWorld, item: ItemId): boolean {
    const s = this.m.shelfFor(item);
    if (!s || !s.open || s.stock >= ECONOMY.supermarket.shelfMax) return false;
    s.stock++;
    return true;
  }

  room(): number {
    const s = this.target();
    return s ? ECONOMY.supermarket.shelfMax - s.stock : 0;
  }

  putBack(_w: SimWorld, item: ItemId): void {
    this.m.store[item] = Math.min(ECONOMY.supermarket.storeMax, (this.m.store[item] ?? 0) + 1);
  }
}

/**
 * Stage 7 supermarket: shelves the player (or stockers) fill from the storeroom, wholesale orders at the
 * desk that land in the storeroom, farm products brought straight to their shelves, shoppers with a list
 * who walk the aisles and pay at the checkout (the player or a cashier scans their basket).
 */
export class MarketSystem {
  open = false;
  readonly shelves: Shelf[];
  /** Storeroom stock per product. */
  readonly store = {} as Record<ItemId, number>;
  readonly incoming: Delivery[] = [];
  readonly cash = { value: 0, bills: 0 };
  readonly shoppers: Shopper[] = [];
  /** Player standing on the order desk (the UI opens the order panel). */
  atDesk = false;
  /** Shoppers who left unhappy (empty-handed or tired of waiting), lifetime. */
  angry = 0;
  private nextId = 1;
  private spawnT = 3;
  private pickT = 0;
  private dropT = 0;
  private autoT = 0;
  private way = { x: 0, z: 0 };
  /** One job per possible stocker (they coordinate so no two fill the same shelf). */
  readonly stockers: StockerJob[] = [];

  constructor(private w: SimWorld) {
    this.shelves = SHELVES.map((def, index) => ({ def, index, open: false, stock: 0 }));
    for (const p of MARKET.products) this.store[p.item] = 0;
    for (let i = 0; i < ECONOMY.upgrades['market.stocker'].max; i++) this.stockers.push(new StockerJob(this, i));
  }

  shelfFor(item: ItemId): Shelf | undefined { return this.shelves.find((s) => s.def.item === item); }

  get cashier(): boolean { return this.w.upgrades.level('market.cashier') > 0; }

  /** Shelf price / wholesale cost per item right now (x the farm's price growth). */
  sellPrice(item: ItemId): number { return MARKET_PRODUCT.get(item)!.sell * this.w.priceMult; }
  boxCost(item: ItemId): number { return Math.round(MARKET_PRODUCT.get(item)!.cost * ECONOMY.supermarket.box * this.w.priceMult); }

  /** Items of this product in the storeroom plus on the way. */
  stocked(item: ItemId): number {
    let n = this.store[item] ?? 0;
    for (const d of this.incoming) if (d.item === item) n += d.n;
    return n;
  }

  /** Whether one more box of this product fits in the storeroom (counting deliveries on the way). */
  canOrder(item: ItemId): boolean {
    const s = this.shelfFor(item);
    return !!s && s.open && this.stocked(item) + ECONOMY.supermarket.box <= ECONOMY.supermarket.storeMax;
  }

  /** Farm-made product with spare stock on the farm right now (for a free farm delivery). */
  farmSpare(item: ItemId): number {
    const w = this.w;
    if (!MARKET_PRODUCT.get(item)?.farm) return 0;
    const st = w.stations.find((s) => s.def.product === item);
    if (st) return st.open ? Math.max(0, st.counter - ECONOMY.cafe.counterReserve) : 0;
    const m = w.factory.machines.find((x) => x.def.makes === item);
    if (m) return m.open ? m.conv.output[m.def.makes] : 0;
    return item === 'fish' && w.river.open ? w.river.pile : 0;
  }

  /** Bring up to a box of a farm product from the farm's surplus (free; arrives like an order). */
  orderFromFarm(item: ItemId): boolean {
    if (!this.open || !this.canOrder(item)) return false;
    let n = 0;
    while (n < ECONOMY.supermarket.box && farmTake(this.w, item)) n++;
    if (n <= 0) return false;
    this.incoming.push({ item, n, t: ECONOMY.supermarket.deliveryTime, farm: true });
    return true;
  }

  /** Order one wholesale box (paid now, arrives after deliveryTime). */
  order(item: ItemId): boolean {
    const cost = this.boxCost(item);
    if (!this.open || !this.canOrder(item) || this.w.money < cost) return false;
    this.w.money -= cost;
    this.incoming.push({ item, n: ECONOMY.supermarket.box, t: ECONOMY.supermarket.deliveryTime });
    return true;
  }

  sync(): void {
    const w = this.w, up = w.upgrades;
    this.open = up.level('market.unlock') > 0;
    const rows = this.open ? 1 + up.level('market.shelves') : 0;
    for (const s of this.shelves) s.open = s.def.row < rows;
    const st = MARKET.store;
    const n = this.open ? up.level('market.stocker') : 0;
    for (let i = 0; i < n; i++) w.staff.ensureWorkers(this.stockers[i], 1, st.x - 0.5 - i * 0.6, st.z + 1);
  }

  get interval(): number {
    const up = this.w.upgrades, cfg = ECONOMY.supermarket;
    const rows = 1 + up.level('market.shelves');
    const ads = 1 + up.level('market.ads') * ECONOMY.upgrades['market.ads'].step;
    return cfg.customerEvery / (ads * (0.6 + 0.4 * rows));
  }

  update(dt: number): void {
    if (!this.open) return;
    const w = this.w, cfg = ECONOMY.supermarket;
    // deliveries land in the storeroom
    for (let i = this.incoming.length - 1; i >= 0; i--) {
      const d = this.incoming[i];
      d.t -= dt;
      if (d.t > 0) continue;
      this.store[d.item] = Math.min(cfg.storeMax, (this.store[d.item] ?? 0) + d.n);
      this.incoming.splice(i, 1);
      if (!w.away) w.events.emit('delivery', d.item, MARKET.store.x, MARKET.store.z, 0, d.n);
    }
    // auto-reorder: one box at a time for whatever runs low (only what sells: open shelves); farm products
    // come from the farm's surplus for free when it has some, otherwise they're bought like the rest
    this.autoT -= dt;
    if (this.autoT <= 0 && w.upgrades.level('market.auto') > 0) {
      this.autoT = 1;
      for (const s of this.shelves) {
        const it = s.def.item;
        if (!s.open || this.stocked(it) >= cfg.autoBelow) continue;
        if (this.orderFromFarm(it) || this.order(it)) break;
      }
    }
    this.updateShoppers(dt);
  }

  private spawn(): void {
    const w = this.w, rng = w.rng, cfg = ECONOMY.supermarket;
    const open = this.shelves.filter((s) => s.open);
    if (!open.length) return;
    const n = 1 + rng.int(Math.min(cfg.maxLines, open.length));
    const lines: ShopLine[] = [];
    for (let k = 0; k < n; k++) {
      const s = rng.pick(open);
      if (lines.some((l) => l.shelf === s.index)) continue;
      const qty = 1 + rng.int(cfg.maxQty);
      lines.push({ product: s.def.item, shelf: s.index, qty, left: qty });
    }
    // walk the aisles front to back so the path doesn't zigzag
    lines.sort((a, b) => this.shelves[b.shelf].def.front.z - this.shelves[a.shelf].def.front.z || this.shelves[a.shelf].def.front.x - this.shelves[b.shelf].def.front.x);
    const sp = MARKET.spawn, look = rng.int(1 << 30);
    this.shoppers.push({
      id: this.nextId++, look, type: pickType(w, look), x: sp.x + rng.range(-1, 1), z: sp.z, rot: Math.PI, speed: 0,
      state: 'shop', lines, li: 0, got: [], scanned: 0, waitT: 0, takeT: 0,
      patience: cfg.patience, patienceMax: cfg.patience, gone: false,
    });
  }

  /** Player at the checkout's serve spot. */
  playerAtCheckout(): boolean {
    const p = this.w.player, s = MARKET.checkout.serve;
    return !this.w.away && dist(p.x, p.z, s.x, s.z) < MARKET.checkout.serveR;
  }

  private updateShoppers(dt: number): void {
    const w = this.w, cfg = ECONOMY.supermarket, walk = ECONOMY.customers.walkSpeed;
    this.spawnT -= dt;
    let inside = 0;
    for (const c of this.shoppers) if (c.state !== 'leave' && c.state !== 'angry') inside++;
    if (this.spawnT <= 0) {
      if (inside < cfg.maxInside) this.spawn();
      this.spawnT = this.interval * w.rng.range(0.7, 1.3);
    }
    const q = MARKET.checkout.queue, via = MARKET.checkout.via;
    const player = this.playerAtCheckout(), served = player || this.cashier;
    let slot = 0;
    for (const c of this.shoppers) {
      switch (c.state) {
        case 'shop': {
          const l = c.lines[c.li];
          if (!l) {
            c.state = c.got.length ? 'toQueue' : 'angry';
            if (!c.got.length) { this.angry++; if (!w.away) w.events.emit('angry', '', c.x, c.z, 0, 0, c.id); }
            break;
          }
          const sh = this.shelves[l.shelf], f = sh.def.front;
          // stand along the shelf front (spread by id so a crowd doesn't stack up)
          const tx = f.x + ((c.id % 3) - 1) * 0.45, tz = f.z + 0.1, r = aisleRoute(c.x, c.z, tx, tz, this.way);
          if (!moveToward(c, r.x, r.z, walk, dt, 0.1) || r.x !== tx || r.z !== tz) break;
          c.rot = turnToward(c.rot, 0, -1, 12, dt);
          c.takeT -= dt;
          if (sh.stock > 0) {
            c.waitT = 0;
            if (c.takeT <= 0) {
              sh.stock--;
              l.left--;
              c.got.push(l.product);
              c.takeT = cfg.takeInterval;
              if (l.left <= 0) c.li++;
            }
          } else {
            // empty shelf: wait a little, then give up on this item (and lose some patience)
            c.waitT += dt;
            if (c.waitT >= cfg.emptyWait) { c.waitT = 0; c.li++; c.patience -= cfg.emptyPenalty; }
          }
          break;
        }
        case 'toQueue':
          // round the counter's east end first, then join the line
          { const r = aisleRoute(c.x, c.z, via.x, via.z, this.way); if (moveToward(c, r.x, r.z, walk, dt, 0.1) && r.x === via.x && r.z === via.z) c.state = 'queue'; }
          break;
        case 'queue': {
          const s = slot++;
          const arrived = moveToward(c, q.x, q.z + s * q.gap, walk, dt, 0.08);
          if (arrived) c.rot = turnToward(c.rot, 0, -1, 12, dt);
          let scanning = false;
          if (s === 0 && arrived && served) {
            scanning = true;
            c.takeT -= dt;
            if (c.takeT <= 0) {
              c.scanned++;
              c.takeT = cfg.scanInterval * (player ? 1 : w.staff.cashierSlow);
              if (!w.away) w.events.emit('sell', c.got[c.scanned - 1], c.x, c.z, 0, c.scanned, c.id);
              if (c.scanned >= c.got.length) this.pay(c);
            }
          }
          if (c.state === 'queue' && !scanning) {
            c.patience -= dt;
            if (c.patience <= 0) {
              // gives up: what they picked goes back on the shelves
              for (const it of c.got) { const sh = this.shelfFor(it); if (sh) sh.stock = Math.min(cfg.shelfMax, sh.stock + 1); }
              c.got.length = 0;
              c.state = 'angry';
              this.angry++;
              w.stats.angry++;
              if (!w.away) w.events.emit('angry', '', c.x, c.z, 0, 0, c.id);
            }
          }
          break;
        }
        case 'leave':
        case 'angry': {
          const e = MARKET.exit;
          if (moveToward(c, e.x, e.z, walk * 1.1, dt, 0.3)) c.gone = true;
          break;
        }
      }
    }
    for (let i = this.shoppers.length - 1; i >= 0; i--) if (this.shoppers[i].gone) this.shoppers.splice(i, 1);
  }

  private pay(c: Shopper): void {
    const w = this.w;
    let value = 0;
    for (const it of c.got) value += this.sellPrice(it);
    value = Math.round(value);
    this.cash.value += value;
    this.cash.bills = Math.min(40, this.cash.bills + Math.min(6, c.got.length));
    w.stats.marketServed++;
    c.state = 'leave';
    if (!w.away) w.events.emit('paid', c.got[0], c.x, c.z, value, c.got.length, c.id);
  }

  /** Player: pick at the storeroom, stock shelves, run the checkout, collect the cash, stand at the desk. */
  interact(dt: number): void {
    if (!this.open) { this.atDesk = false; return; }
    const w = this.w, p = w.player, c = w.carry, pc = ECONOMY.player, cfg = ECONOMY.supermarket;
    this.pickT -= dt;
    this.dropT -= dt;
    // shelves: drop what this shelf sells
    if (this.dropT <= 0) {
      for (const s of this.shelves) {
        if (!s.open || s.stock >= cfg.shelfMax || !c.has(s.def.item)) continue;
        if (dist(p.x, p.z, s.def.front.x, s.def.front.z) >= MARKET.shelfR) continue;
        c.take(s.def.item);
        s.stock++;
        this.dropT = pc.dropInterval;
        w.events.emit('drop', s.def.item, s.def.front.x, s.def.front.z, 0, c.n);
        break;
      }
    }
    // storeroom: grab what the shelves need most (counting what's already in hand)
    const st = MARKET.store;
    if (this.pickT <= 0 && !c.full() && dist(p.x, p.z, st.x, st.z) < st.r) {
      let best: Shelf | null = null, bestN = Infinity;
      for (const s of this.shelves) {
        const it = s.def.item;
        if (!s.open || this.store[it] <= 0) continue;
        let held = 0;
        for (const x of c.items) if (x === it) held++;
        const n = s.stock + held;
        if (n < cfg.shelfMax && n < bestN) { best = s; bestN = n; }
      }
      if (best) {
        const it = best.def.item;
        this.store[it]--;
        c.push(it);
        this.pickT = pc.pickInterval;
        w.events.emit('pick', it, st.x, st.z, 0, c.n, -1);
      }
    }
    const cp = MARKET.cash;
    if (this.cash.value > 0 && dist(p.x, p.z, cp.x, cp.z) < cp.r) {
      const v = this.cash.value;
      w.money += v;
      w.stats.earned += v;
      w.events.emit('collect', '', cp.x, cp.z, v, this.cash.bills);
      this.cash.value = 0;
      this.cash.bills = 0;
    }
    const d = MARKET.desk;
    this.atDesk = dist(p.x, p.z, d.x, d.z) < d.r;
  }

  /** Money waiting at the checkout cash pile. */
  get uncollected(): number { return this.cash.value; }
}
