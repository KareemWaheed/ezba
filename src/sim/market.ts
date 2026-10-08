import { ECONOMY, type ItemId } from '../config/economy';
import { MARKET, MARKET_PRODUCT, PRICE_NORMAL, PRICE_TAGS, SHELVES, type ShelfDef } from '../config/market';
import { pickType } from '../config/album';
import { FEATURES } from '../config/features';
import type { WorkerJob } from './staff';
import type { SimWorld } from './world';
import type { Station } from './station';
import { StoreEvents } from './storeEvents';
import { dist, moveToward, turnToward } from './math';

export interface Shelf {
  readonly def: ShelfDef;
  readonly index: number;
  open: boolean;
  stock: number;
}

export interface ShopLine { product: ItemId; shelf: number; qty: number; left: number }

export type ShopperState = 'shop' | 'toQueue' | 'queue' | 'leave' | 'angry' | 'flee';

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
  /** A family with a trolley (big list; tips the player who checks them out in person). */
  family?: boolean;
  /** The player scanned at least one of their items. */
  byPlayer?: boolean;
  /** Checkout line they're heading to / waiting in (0, 1: counters; 2: self-checkout). */
  lane?: number;
  /** A shoplifter: shops like anyone, then runs for the door instead of paying. */
  thief?: boolean;
}

/** Checkout lines: 0 and 1 are counters (a cashier or the player scans), 2 is the self-checkout kiosk. */
const LANES = [
  { queue: MARKET.checkout.queue, via: MARKET.checkout.via, serve: MARKET.checkout.serve as { x: number; z: number } | null, serveR: MARKET.checkout.serveR },
  { queue: MARKET.checkout2.queue, via: MARKET.checkout2.via, serve: MARKET.checkout2.serve as { x: number; z: number } | null, serveR: MARKET.checkout2.serveR },
  { queue: MARKET.kiosk.queue, via: MARKET.kiosk.via, serve: null as { x: number; z: number } | null, serveR: 0 },
] as const;
export const KIOSK = 2;

/** A wholesale order on its way (arrives after `t` seconds). */
export interface Delivery { item: ItemId; n: number; t: number; /** From the player's own farm (free). */ farm?: boolean }

/**
 * Take one farm-made item from the farm's surplus for a farm delivery: the shop counter beyond its reserve
 * (eggs, milk, corn), the factory trays (cheese, cake) or the fish pile. In a supermarket-first game an
 * animal pile that has stayed full a while goes too (nobody is carrying it, and the animals stop while it's
 * full; the farm shop's customers only buy off the counter, which nobody is filling from it); one being
 * collected is left for the player. False when there's none spare.
 */
function farmTake(w: SimWorld, item: ItemId): boolean {
  const st = w.stations.find((s) => s.def.product === item);
  if (st) {
    if (!st.open) return false;
    if (w.market.pileIdle(st)) { st.pile--; return true; }
    if (w.counterSpare(st) <= 0) return false;
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

/** Does the segment (ax, az) -> (bx, bz) pass through box b grown by r? (slab test) */
function segHits(ax: number, az: number, bx: number, bz: number, b: { x0: number; x1: number; z0: number; z1: number }, r: number): boolean {
  let t0 = 0, t1 = 1;
  for (const [p, d, lo, hi] of [[ax, bx - ax, b.x0 - r, b.x1 + r], [az, bz - az, b.z0 - r, b.z1 + r]] as const) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; continue; }
    let ta = (lo - p) / d, tb = (hi - p) / d;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

type CounterBox = { x0: number; x1: number; z0: number; z1: number };

/** North edge of the checkout counters' line (counters and kiosk share it). */
const COUNTERS_Z0 = Math.min(MARKET.checkout.box.z0, MARKET.checkout2.box.z0, MARKET.kiosk.box.z0);

/** Whether walking straight from (x, z) to (tx, tz) would pass through a shelf unit (with a little clearance). */
function crossesShelf(x: number, z: number, tx: number, tz: number): boolean {
  for (const s of SHELVES) if (segHits(x, z, tx, tz, s.box, 0.2)) return true;
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
    // (never clamped: storeMax only limits ordering, so returned items are never lost)
    this.m.store[item] = (this.m.store[item] ?? 0) + 1;
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
  /** Price tag per product (index into PRICE_TAGS; set at the order desk). */
  readonly price = {} as Record<ItemId, number>;
  readonly incoming: Delivery[] = [];
  readonly cash = { value: 0, bills: 0 };
  readonly shoppers: Shopper[] = [];
  /** Player standing on the order desk (the UI opens the order panel). */
  atDesk = false;
  /** Shoppers who left unhappy, lifetime: all of them, and those who found nothing on the shelves. */
  angry = 0;
  angryEmpty = 0;
  private nextId = 1;
  private spawnT = 3;
  /** Rush hour: seconds left (0 = none), and seconds until the next one. */
  rushT = 0;
  private rushNext: number = ECONOMY.supermarket.rush.first;
  private pickT = 0;
  private dropT = 0;
  private autoT = 0;
  private farmT = 0;
  /** Seconds each animal pile has been full (supermarket-first game: an idle full pile goes to the store). */
  private fullFor: number[] = [];

  /**
   * A supermarket-first game's animal pile that has stayed full a while (nobody's collecting it), once the
   * store has stockers to bring it over (before that the player fetches the farm's goods by hand).
   */
  pileIdle(st: Station): boolean {
    return this.w.mode === 'market' && this.w.upgrades.level('market.stocker') > 0
      && (this.fullFor[st.index] ?? 0) >= ECONOMY.supermarket.pileIdle && st.pile > 0;
  }
  private way = { x: 0, z: 0 };
  /** Spills, phone orders and the cleaner (storeEvents.ts). */
  readonly extras: StoreEvents;
  /** One job per possible stocker (they coordinate so no two fill the same shelf). */
  readonly stockers: StockerJob[] = [];

  constructor(private w: SimWorld) {
    this.shelves = SHELVES.map((def, index) => ({ def, index, open: false, stock: 0 }));
    for (const p of MARKET.products) { this.store[p.item] = 0; this.price[p.item] = PRICE_NORMAL; }
    for (let i = 0; i < ECONOMY.upgrades['market.stocker'].max; i++) this.stockers.push(new StockerJob(this, i));
    this.extras = new StoreEvents(this, w);
  }

  shelfFor(item: ItemId): Shelf | undefined { return this.shelves.find((s) => s.def.item === item); }

  get cashier(): boolean { return this.w.upgrades.level('market.cashier') > 0; }

  /** Shelf price / wholesale cost per item right now (x the farm's price growth). */
  sellPrice(item: ItemId): number { return MARKET_PRODUCT.get(item)!.sell * this.w.priceMult * PRICE_TAGS[this.price[item] ?? PRICE_NORMAL].mult; }

  /** Change a product's price tag (cheaper sells more, dearer sells less). */
  setPrice(item: ItemId, tag: number): void {
    if (!MARKET_PRODUCT.has(item)) return;
    this.price[item] = Math.max(0, Math.min(PRICE_TAGS.length - 1, Math.round(tag)));
  }

  /** How much shoppers want a product at its current price tag. */
  demand(item: ItemId): number { return PRICE_TAGS[this.price[item] ?? PRICE_NORMAL].demand; }
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

  /** The farm makes this product right now (its coop/pen, factory machine or river is open). */
  farmMakes(item: ItemId): boolean {
    const w = this.w;
    if (!MARKET_PRODUCT.get(item)?.farm) return false;
    const st = w.stations.find((s) => s.def.product === item);
    if (st) return st.open;
    const m = w.factory.machines.find((x) => x.def.makes === item);
    if (m) return m.open;
    return item === 'fish' && w.river.open;
  }

  /** Farm-made product with spare stock on the farm right now (for a free farm delivery). */
  farmSpare(item: ItemId): number {
    const w = this.w;
    if (!MARKET_PRODUCT.get(item)?.farm) return 0;
    const st = w.stations.find((s) => s.def.product === item);
    if (st) return st.open ? Math.max(0, w.counterSpare(st)) : 0;
    const m = w.factory.machines.find((x) => x.def.makes === item);
    if (m) return m.open ? m.conv.output[m.def.makes] : 0;
    return item === 'fish' && w.river.open ? w.river.pile : 0;
  }

  /** Bring up to a box of a farm product from the farm's surplus (free; arrives like an order). */
  orderFromFarm(item: ItemId): boolean {
    const s = this.shelfFor(item), cfg = ECONOMY.supermarket;
    // (the farm's surplus fills whatever room is left, not only a whole box: it's free, so it never waits)
    const room = Math.min(cfg.box, cfg.storeMax - this.stocked(item));
    if (!this.open || !s || !s.open || room <= 0) return false;
    let n = 0;
    while (n < room && farmTake(this.w, item)) n++;
    if (n <= 0) return false;
    this.incoming.push({ item, n, t: ECONOMY.supermarket.deliveryTime, farm: true });
    return true;
  }

  /** Items in the whole store (shelves, storeroom, on the way). */
  get totalStock(): number {
    let n = 0;
    for (const s of this.shelves) n += s.stock;
    for (const k in this.store) n += this.store[k as ItemId];
    for (const d of this.incoming) n += d.n;
    return n;
  }

  /**
   * The supplier gives credit (money may go below zero, paid back by the next sales) while the store is
   * nearly out of stock, so it can never be stuck with empty shelves and no money for a box.
   */
  onCredit(item: ItemId): boolean {
    const cfg = ECONOMY.supermarket;
    return this.totalStock < cfg.creditBelow && this.w.money - this.boxCost(item) >= -cfg.creditMax * this.w.priceMult;
  }

  /** Order one wholesale box (paid now, arrives after deliveryTime; on credit when the store is nearly empty). */
  order(item: ItemId): boolean {
    const cost = this.boxCost(item);
    if (!this.open || !this.canOrder(item) || (this.w.money < cost && !this.onCredit(item))) return false;
    this.w.money -= cost;
    this.incoming.push({ item, n: ECONOMY.supermarket.box, t: ECONOMY.supermarket.deliveryTime });
    return true;
  }

  /** An open shelf half empty or less (the store board, the guide arrow and the order panel all use this). */
  low(s: Shelf): boolean { return s.open && s.stock <= ECONOMY.supermarket.shelfMax / 2; }

  /** A product running out: its shelf is low and nothing is in the storeroom or on the way. */
  needsBox(item: ItemId): boolean {
    const s = this.shelfFor(item);
    return !!s && this.low(s) && this.stocked(item) === 0 && this.canOrder(item);
  }

  /** A box of this can be had right now: free from the farm's surplus, paid, or on the supplier's credit. */
  canGetBox(item: ItemId): boolean {
    return this.farmSpare(item) > 0 || this.w.money >= this.boxCost(item) || this.onCredit(item);
  }

  /** One box for every product running out (from the farm's surplus when it has some, else wholesale). */
  restockAll(): number {
    let n = 0;
    for (const s of this.shelves) {
      const it = s.def.item;
      if (!this.needsBox(it)) continue;
      if (this.orderFromFarm(it) || this.order(it)) n++;
    }
    return n;
  }

  sync(): void {
    const w = this.w, up = w.upgrades;
    this.open = FEATURES.supermarket && up.level('market.unlock') > 0;
    const rows = this.open ? 1 + up.level('market.shelves') : 0;
    for (const s of this.shelves) {
      const was = s.open;
      s.open = s.def.row < rows;
      // a new shelf row opens stocked (the supplier's opening delivery), so growing the store doesn't stall it
      // (a loaded save sets the stock afterwards)
      if (s.open && !was && s.def.row > 0 && s.stock === 0) s.stock = ECONOMY.supermarket.openingStock;
    }
    const st = MARKET.store;
    const n = this.open ? up.level('market.stocker') : 0;
    for (let i = 0; i < n; i++) w.staff.ensureWorkers(this.stockers[i], 1, st.x - 0.5 - i * 0.6, st.z + 1);
  }

  /**
   * How much the price tags draw people in: the open shelves' average demand. Cheap tags fill the store
   * (more profit an hour, but more shoppers to serve and restock for); dear tags bring fewer shoppers who
   * each pay more (less profit an hour, less work).
   */
  get draw(): number {
    let sum = 0, n = 0;
    for (const s of this.shelves) if (s.open) { sum += this.demand(s.def.item); n++; }
    return n ? sum / n : 1;
  }

  get interval(): number {
    const up = this.w.upgrades, cfg = ECONOMY.supermarket;
    const rows = 1 + up.level('market.shelves');
    const ads = 1 + up.level('market.ads') * ECONOMY.upgrades['market.ads'].step;
    const rush = this.rushT > 0 ? cfg.rush.mult : 1;
    return cfg.customerEvery / (ads * (0.6 + 0.4 * rows) * this.draw * rush);
  }

  update(dt: number): void {
    if (!this.open) return;
    const w = this.w, cfg = ECONOMY.supermarket;
    // deliveries land in the storeroom
    for (let i = this.incoming.length - 1; i >= 0; i--) {
      const d = this.incoming[i];
      d.t -= dt;
      if (d.t > 0) continue;
      this.store[d.item] = (this.store[d.item] ?? 0) + d.n;
      this.incoming.splice(i, 1);
      if (!w.away) w.events.emit('delivery', d.item, MARKET.store.x, MARKET.store.z, 0, d.n);
    }
    // restocking by staff, once a second for whatever runs low on open shelves: stockers fetch farm products
    // from the farm's surplus (a free farm delivery); auto-reorder also buys wholesale (farm surplus first)
    // a supermarket-first game: what the farm makes goes to the storeroom by itself (free), a box at a time
    // whenever there's room for it, so the farm never sits on stock while the store buys the same wholesale
    // how long each animal pile has sat full (once it counts as idle, it stays so until it's emptied)
    if (w.mode === 'market') {
      for (const st of w.stations) {
        const i = st.index;
        if (st.open && st.pileFull) this.fullFor[i] = (this.fullFor[i] ?? 0) + dt;
        else if (!this.pileIdle(st)) this.fullFor[i] = 0;
      }
    }
    this.farmT -= dt;
    if (w.mode === 'market' && this.farmT <= 0) {
      this.farmT = cfg.farmEvery;
      for (const s of this.shelves) {
        const it = s.def.item;
        const st = w.stations.find((x) => x.def.product === it), idle = st && this.pileIdle(st) ? st.pile : 0;
        if (s.open && this.farmSpare(it) + idle >= Math.min(cfg.box, cfg.storeMax - this.stocked(it)) && this.orderFromFarm(it)) break;
      }
    }
    this.autoT -= dt;
    const stockers = w.upgrades.level('market.stocker') > 0, auto = w.upgrades.level('market.auto') > 0;
    if (this.autoT <= 0 && (stockers || auto)) {
      this.autoT = 1;
      for (const s of this.shelves) {
        const it = s.def.item;
        if (!s.open || this.stocked(it) >= cfg.autoBelow) continue;
        if ((stockers || auto) && this.orderFromFarm(it)) break;
        if (auto && this.order(it)) break;
      }
    }
    this.updateShoppers(dt);
    this.extras.update(dt);
  }

  private spawn(): void {
    const w = this.w, rng = w.rng, cfg = ECONOMY.supermarket;
    const open = this.shelves.filter((s) => s.open);
    if (!open.length) return;
    // (families and shoplifters come once the store has grown a second shelf row: a corner shop doesn't draw them)
    const grown = w.upgrades.level('market.shelves') > 0;
    const family = rng.next() < cfg.family.chance && grown;
    const thief = !family && !w.away && grown && rng.next() < cfg.thief.chance && !this.shoppers.some((c) => c.thief && !c.gone);
    // (a family's list is long: at least 3 different products when the store has them)
    const most = Math.min(family ? cfg.family.lines : cfg.maxLines, open.length), least = family ? Math.min(3, most) : 1;
    const n = least + rng.int(most - least + 1);
    const lines: ShopLine[] = [];
    // each list line picks a shelf weighted by how much its price tag draws shoppers (a repeat pick is
    // dropped; a family picks from the shelves not on its list yet, so it always gets its `n` products)
    const pool = open.slice();
    for (let k = 0; k < n && pool.length; k++) {
      let total = 0;
      for (const o of pool) total += this.demand(o.def.item);
      let r = rng.next() * total, s = pool[pool.length - 1];
      for (const o of pool) { r -= this.demand(o.def.item); if (r <= 0) { s = o; break; } }
      if (lines.some((l) => l.shelf === s.index)) continue;
      if (family) pool.splice(pool.indexOf(s), 1);
      const qty = 1 + rng.int(family ? cfg.family.qty : cfg.maxQty);
      lines.push({ product: s.def.item, shelf: s.index, qty, left: qty });
    }
    // walk the aisles front to back so the path doesn't zigzag
    lines.sort((a, b) => this.shelves[b.shelf].def.front.z - this.shelves[a.shelf].def.front.z || this.shelves[a.shelf].def.front.x - this.shelves[b.shelf].def.front.x);
    const sp = MARKET.spawn, look = rng.int(1 << 30);
    this.shoppers.push({
      id: this.nextId++, look, type: pickType(w, look), x: sp.x + rng.range(-1, 1), z: sp.z, rot: Math.PI, speed: 0,
      state: 'shop', lines, li: 0, got: [], scanned: 0, waitT: 0, takeT: 0,
      patience: family ? cfg.family.patience : cfg.patience, patienceMax: family ? cfg.family.patience : cfg.patience, gone: false, family, thief,
    });
  }

  /** Player at the checkout's serve spot. */
  playerAtCheckout(): boolean { return this.playerAtLane(0) || this.playerAtLane(1); }

  /** Player at a checkout counter's serve spot. */
  playerAtLane(i: number): boolean {
    const p = this.w.player, s = LANES[i].serve;
    return !!s && !this.w.away && this.laneOpen(i) && dist(p.x, p.z, s.x, s.z) < LANES[i].serveR;
  }

  /** The checkout counters standing right now (the second one and the kiosk once bought): shoppers walk round them. */
  counters(): CounterBox[] {
    const out: CounterBox[] = [MARKET.checkout.box];
    if (this.laneOpen(1)) out.push(MARKET.checkout2.box);
    if (this.laneOpen(2)) out.push(MARKET.kiosk.box);
    return out;
  }

  /** The first counter always; the second with market.lanes; the kiosk with market.selfcheck. */
  laneOpen(i: number): boolean {
    const up = this.w.upgrades;
    return i === 0 || (i === 1 ? up.level('market.lanes') > 0 : up.level('market.selfcheck') > 0);
  }

  /** A cashier stands at this counter (market.cashier level 1 staffs the first, level 2 the second). */
  laneStaffed(i: number): boolean { return i < KIOSK && this.laneOpen(i) && this.w.upgrades.level('market.cashier') > i; }

  /** A counter whose line is waiting with no cashier (and, unless `evenServed`, the player not there; -1: none). */
  unservedLane(evenServed = false): number {
    for (let i = 0; i < KIOSK; i++) {
      if (this.laneStaffed(i) || (!evenServed && this.playerAtLane(i))) continue;
      if (this.shoppers.some((c) => c.state === 'queue' && (c.lane ?? 0) === i)) return i;
    }
    return -1;
  }

  /** Where the player stands to serve counter `i`. */
  laneServe(i: number): { x: number; z: number } { return LANES[i].serve ?? MARKET.checkout.serve; }

  /** A shoplifter on the run right now. */
  get thief(): Shopper | undefined { return this.shoppers.find((c) => c.state === 'flee'); }

  /** Shoppers waiting in (or walking to) each line. */
  laneLoad(): number[] {
    const n = [0, 0, 0];
    for (const c of this.shoppers) if ((c.state === 'queue' || c.state === 'toQueue') && c.lane !== undefined) n[c.lane]++;
    return n;
  }

  /** The line a shopper picks: the shortest open one (an unstaffed counter counts as longer); small baskets may use the kiosk. */
  private pickLane(c: Shopper): number {
    const load = this.laneLoad(), cfg = ECONOMY.supermarket;
    let best = 0, bestScore = Infinity;
    for (let i = 0; i < LANES.length; i++) {
      if (!this.laneOpen(i) || (i === KIOSK && c.got.length > cfg.selfMax)) continue;
      const score = load[i] + (i < KIOSK && !this.laneStaffed(i) ? 2.5 : 0) + (i === KIOSK ? 0.5 : 0);
      if (score < bestScore) { best = i; bestScore = score; }
    }
    return best;
  }

  /**
   * Rush hour: not while away (nobody's there to see it), only once there's a cashier (a one-person store
   * has enough on its hands), and only into a stocked store (with most shelves bare, e.g. right after a new
   * row opens, it waits a bit).
   */
  private updateRush(dt: number): void {
    const w = this.w, cfg = ECONOMY.supermarket;
    if (this.rushT > 0) {
      this.rushT -= dt;
      if (this.rushT <= 0) { this.rushT = 0; w.events.emit('storeRush', '', MARKET.spawn.x, MARKET.spawn.z, 0, 0); }
      return;
    }
    if (w.away || !this.cashier || (this.rushNext -= dt) > 0) return;
    const open = this.shelves.filter((s) => s.open);
    if (open.filter((s) => s.stock > 0).length < open.length * 0.75) { this.rushNext = 30; return; }
    this.rushNext = cfg.rush.every * w.rng.range(0.75, 1.25);
    this.rushT = cfg.rush.time;
    this.spawnT = Math.min(this.spawnT, 1);
    w.events.emit('storeRush', '', MARKET.spawn.x, MARKET.spawn.z, cfg.rush.time, 1);
  }

  private updateShoppers(dt: number): void {
    const w = this.w, cfg = ECONOMY.supermarket, walk = ECONOMY.customers.walkSpeed;
    this.spawnT -= dt;
    this.updateRush(dt);
    let inside = 0;
    for (const c of this.shoppers) if (c.state !== 'leave' && c.state !== 'angry') inside++;
    if (this.spawnT <= 0) {
      if (inside < cfg.maxInside + (this.rushT > 0 ? cfg.rush.extra : 0)) this.spawn();
      this.spawnT = this.interval * w.rng.range(0.7, 1.3);
    }
    const slots = [0, 0, 0];
    for (const c of this.shoppers) {
      switch (c.state) {
        case 'shop': {
          const l = c.lines[c.li];
          if (!l) {
            if (c.thief && c.got.length) {
              // a shoplifter: straight for the door with the goods
              c.state = 'flee';
              if (!w.away) w.events.emit('storeThief', c.got[0], c.x, c.z, 0, 1, c.id);
              break;
            }
            c.state = c.got.length ? 'toQueue' : 'angry';
            if (c.got.length) c.lane = this.pickLane(c);
            if (!c.got.length) { this.angry++; this.angryEmpty++; if (!w.away) w.events.emit('angry', '', c.x, c.z, 0, 0, c.id); }
            break;
          }
          const sh = this.shelves[l.shelf], f = sh.def.front;
          // stand along the shelf front (spread by id so a crowd doesn't stack up)
          const tx = f.x + ((c.id % 3) - 1) * 0.45, tz = f.z + 0.1, r = aisleRoute(c.x, c.z, tx, tz, this.way);
          // a spill underfoot: slow going, and it gets on their nerves
          const wet = !!this.extras.spillAt(c.x, c.z);
          if (wet) c.patience -= cfg.spill.patience * dt;
          if (!moveToward(c, r.x, r.z, wet ? walk * cfg.spill.slow : walk, dt, 0.1) || r.x !== tx || r.z !== tz) break;
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
        case 'toQueue': {
          // round the counter's east end first, then join the line; when a counter (or the kiosk) is in the
          // way, line up with this lane's gap in front of the counters, then walk through it
          const via = LANES[c.lane ?? 0].via;
          let tx = via.x, tz = via.z;
          if (c.z < COUNTERS_Z0 && this.counters().some((b) => segHits(c.x, c.z, via.x, via.z, b, 0.1))) { tx = via.x; tz = COUNTERS_Z0 - 0.6; }
          const r = aisleRoute(c.x, c.z, tx, tz, this.way);
          if (moveToward(c, r.x, r.z, walk, dt, 0.1) && r.x === via.x && r.z === via.z) c.state = 'queue';
          break;
        }
        case 'queue': {
          const lane = c.lane ?? 0, q = LANES[lane].queue, s = slots[lane]++;
          const arrived = moveToward(c, q.x, q.z + s * q.gap, walk, dt, 0.08);
          if (arrived) c.rot = turnToward(c.rot, 0, -1, 12, dt);
          // who scans: the player at this counter, its cashier, or the shopper at the kiosk (slowly)
          const player = this.playerAtLane(lane), self = lane === KIOSK;
          let scanning = false;
          if (s === 0 && arrived && (player || self || this.laneStaffed(lane))) {
            scanning = true;
            c.takeT -= dt;
            if (c.takeT <= 0) {
              c.scanned++;
              if (player) c.byPlayer = true;
              c.takeT = cfg.scanInterval * (player ? 1 : self ? cfg.selfSlow : w.staff.cashierSlow);
              if (!w.away) w.events.emit('sell', c.got[c.scanned - 1], c.x, c.z, 0, c.scanned, c.id);
              if (c.scanned >= c.got.length) this.pay(c);
            }
          }
          if (c.state === 'queue' && !scanning) {
            c.patience -= dt;
            if (c.patience <= 0) {
              // gives up: what they picked goes back on the shelves
              // (a shelf refilled meanwhile can't take them all: the rest goes to the storeroom)
              for (const it of c.got) {
                const sh = this.shelfFor(it);
                if (sh && sh.stock < cfg.shelfMax) sh.stock++;
                else this.store[it] = (this.store[it] ?? 0) + 1;
              }
              c.got.length = 0;
              c.state = 'angry';
              this.angry++;
              w.stats.angry++;
              if (!w.away) w.events.emit('angry', '', c.x, c.z, 0, 0, c.id);
            }
          }
          break;
        }
        case 'flee': {
          const e = MARKET.exit, p = w.player;
          const caught = (!w.away && dist(p.x, p.z, c.x, c.z) < cfg.thief.catchR) ? 2
            : w.upgrades.level('market.guard') > 0 && dist(c.x, c.z, e.x, e.z) < cfg.thief.guardR ? 4 : 0;
          if (caught) { this.catchThief(c, caught); break; }
          if (moveToward(c, e.x, e.z, walk * cfg.thief.speed, dt, 0.3)) {
            // got away with it
            let lost = 0;
            for (const it of c.got) lost += this.sellPrice(it);
            c.got.length = 0;
            c.gone = true;
            if (!w.away) w.events.emit('storeThief', '', c.x, c.z, Math.round(lost), 3, c.id);
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

  /** A shoplifter stopped (2: by the player, who gets a bounty; 4: by the guard): the goods go back. */
  private catchThief(c: Shopper, by: number): void {
    const w = this.w, cfg = ECONOMY.supermarket;
    let value = 0;
    for (const it of c.got) {
      value += this.sellPrice(it);
      const sh = this.shelfFor(it);
      if (sh && sh.stock < cfg.shelfMax) sh.stock++;
      else this.store[it] = (this.store[it] ?? 0) + 1;
    }
    c.got.length = 0;
    c.state = 'angry';
    const bounty = by === 2 ? Math.round(value * cfg.thief.bounty) : 0;
    w.money += bounty;
    w.stats.earned += bounty;
    if (!w.away) w.events.emit('storeThief', '', c.x, c.z, bounty, by, c.id);
  }

  private pay(c: Shopper): void {
    const w = this.w;
    let value = 0;
    for (const it of c.got) value += this.sellPrice(it);
    // a family checked out by the player in person tips on top
    if (c.family && c.byPlayer) value *= 1 + ECONOMY.supermarket.family.tip;
    value = Math.round(value);
    this.cash.value += value;
    this.cash.bills = Math.min(40, this.cash.bills + Math.min(6, c.got.length));
    w.stats.marketServed++;
    if (!w.away) w.album.see(c.type);
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
        w.stats.marketStocked++;
        this.dropT = pc.dropInterval;
        w.events.emit('drop', s.def.item, s.def.front.x, s.def.front.z, 0, c.n);
        break;
      }
    }
    // spills: standing in one mops it
    this.extras.mop(dt);
    // the delivery van: hand over what the phone order needs
    if (this.dropT <= 0 && this.extras.loadFromPlayer()) this.dropT = pc.dropInterval;
    // storeroom: a phone order's items first, then what the shelves need most (counting what's already in hand)
    const st = MARKET.store;
    if (this.pickT <= 0 && !c.full() && dist(p.x, p.z, st.x, st.z) < st.r) {
      let best: Shelf | null = null, bestN = Infinity;
      const order = this.extras.order?.lines.find((l) => this.extras.orderNeeds(l.item) > 0 && (this.store[l.item] ?? 0) > 0);
      if (order) best = this.shelfFor(order.item) ?? null;
      else for (const s of this.shelves) {
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

  /** Rough profit per second of the open shelves (scales task/album rewards on the supermarket path). */
  get marginPerSec(): number {
    if (!this.open) return 0;
    let sell = 0, n = 0;
    for (const s of this.shelves) {
      if (!s.open) continue;
      const p = MARKET_PRODUCT.get(s.def.item)!, t = PRICE_TAGS[this.price[s.def.item] ?? PRICE_NORMAL];
      sell += (p.sell * t.mult - p.cost) * t.demand;
      n++;
    }
    const avgItems = ((1 + ECONOMY.supermarket.maxLines) / 2) * ((1 + ECONOMY.supermarket.maxQty) / 2);
    return n ? (avgItems * (sell / n) * this.w.priceMult) / this.interval : 0;
  }

  /** Money waiting at the checkout cash pile. */
  get uncollected(): number { return this.cash.value; }
}
