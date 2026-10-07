import { ECONOMY, type ItemId } from '../config/economy';
import { MARKET } from '../config/market';
import type { MarketSystem } from './market';
import type { SimWorld } from './world';
import { dist, moveToward } from './math';

/** Something a shopper dropped in an aisle: slows shoppers walking through and costs them patience. */
export interface Spill { id: number; x: number; z: number; mop: number }

/** A phone order: items the player (or the driver) loads into the van before the timer runs out. */
export interface PhoneOrder { lines: { item: ItemId; qty: number; left: number }[]; t: number; tMax: number; value: number }

/** Where the cleaner waits between jobs (by the cash pile, out of the aisles). */
const CLEANER_HOME = { x: 13.7, z: 18.0 };

/**
 * The supermarket's own goings-on beyond shoppers: spills to mop (a cleaner does it once hired) and phone
 * orders to load into the delivery van (a driver does it at level 2). Shoplifters are shoppers (market.ts).
 * Never during time away, and none of it is saved: a reload starts calm.
 */
export class StoreEvents {
  readonly spills: Spill[] = [];
  order: PhoneOrder | null = null;
  /** The cleaner (market.cleaner): walks to the oldest spill and mops it. */
  readonly cleaner = { x: CLEANER_HOME.x, z: CLEANER_HOME.z, rot: 0, speed: 0, mopping: false };
  private spillT: number = ECONOMY.supermarket.spill.every;
  private orderT: number = ECONOMY.supermarket.orders.first;
  private driverT = 0;
  private nextId = 1;

  constructor(private m: MarketSystem, private w: SimWorld) {}

  /** Spills start once the store has grown a second shelf row. */
  get spillsOn(): boolean { return this.w.upgrades.level('market.shelves') > 0; }

  /** A spill within reach of (x, z), or undefined. */
  spillAt(x: number, z: number, r: number = ECONOMY.supermarket.spill.r): Spill | undefined {
    for (const s of this.spills) if (dist(x, z, s.x, s.z) < r) return s;
    return undefined;
  }

  update(dt: number): void {
    const w = this.w, cfg = ECONOMY.supermarket;
    if (w.away) return;
    // a shopper drops something now and then
    if (this.spillsOn && (this.spillT -= dt) <= 0) {
      this.spillT = cfg.spill.every * w.rng.range(0.6, 1.4);
      const who = this.m.shoppers.filter((c) => c.state === 'shop' && !this.spillAt(c.x, c.z, 1.5));
      if (who.length && this.spills.length < cfg.spill.max) {
        const c = who[w.rng.int(who.length)];
        this.spills.push({ id: this.nextId++, x: c.x, z: c.z, mop: 0 });
        w.events.emit('storeSpill', '', c.x, c.z, 0, 1);
      }
    }
    this.updateCleaner(dt);
    this.updateOrder(dt);
  }

  /** The cleaner walks to the oldest spill, mops it, and goes back to his corner. */
  private updateCleaner(dt: number): void {
    const cl = this.cleaner, cfg = ECONOMY.supermarket.spill;
    cl.mopping = false;
    if (this.w.upgrades.level('market.cleaner') <= 0) return;
    const s = this.spills[0];
    const tx = s ? s.x + 0.45 : CLEANER_HOME.x, tz = s ? s.z : CLEANER_HOME.z;
    if (!moveToward(cl, tx, tz, cfg.cleanerSpeed, dt, 0.1) || !s) return;
    cl.mopping = true;
    s.mop += dt / cfg.cleanerSlow;
    if (s.mop >= cfg.mopTime) this.cleanUp(s, false);
  }

  /** Player standing in a spill mops it; a mopped spill pays a small tip. */
  mop(dt: number): void {
    const p = this.w.player, s = this.spillAt(p.x, p.z, ECONOMY.supermarket.spill.mopR);
    if (!s) return;
    s.mop += dt;
    if (s.mop >= ECONOMY.supermarket.spill.mopTime) this.cleanUp(s, true);
  }

  private cleanUp(s: Spill, byPlayer: boolean): void {
    const w = this.w, i = this.spills.indexOf(s);
    if (i < 0) return;
    this.spills.splice(i, 1);
    const tip = byPlayer ? Math.round(ECONOMY.supermarket.spill.tip * w.priceMult) : 0;
    w.money += tip;
    w.stats.earned += tip;
    w.events.emit('storeSpill', '', s.x, s.z, tip, 0);
  }

  // ---- phone orders + the delivery van ----

  get deliveryOn(): boolean { return this.w.upgrades.level('market.delivery') > 0; }

  /** Items of this product the order still needs that aren't already in the player's hands. */
  orderNeeds(item: ItemId): number {
    const l = this.order?.lines.find((x) => x.item === item);
    if (!l) return 0;
    let held = 0;
    for (const x of this.w.carry.items) if (x === item) held++;
    return Math.max(0, l.left - held);
  }

  private updateOrder(dt: number): void {
    const w = this.w, m = this.m, cfg = ECONOMY.supermarket.orders;
    if (!this.deliveryOn) return;
    const o = this.order;
    if (!o) {
      if ((this.orderT -= dt) > 0) return;
      this.orderT = cfg.every * w.rng.range(0.75, 1.25);
      // 2-4 different products off the open shelves, 1-3 of each
      const open = m.shelves.filter((s) => s.open).map((s) => s.def.item);
      const n = Math.min(open.length, 2 + w.rng.int(3)), lines: PhoneOrder['lines'] = [];
      while (lines.length < n) {
        const it = open[w.rng.int(open.length)];
        if (lines.some((l) => l.item === it)) continue;
        const qty = 1 + w.rng.int(3);
        lines.push({ item: it, qty, left: qty });
      }
      let value = 0;
      for (const l of lines) value += l.qty * m.sellPrice(l.item);
      this.order = { lines, t: cfg.time, tMax: cfg.time, value: Math.round(value * cfg.mult) };
      w.events.emit('storeOrder', '', MARKET.van.x, MARKET.van.z, this.order.value, 1);
      return;
    }
    o.t -= dt;
    // the driver (level 2) brings what the storeroom has, one item at a time
    if (w.upgrades.level('market.delivery') > 1 && (this.driverT -= dt) <= 0) {
      this.driverT = cfg.driverEvery;
      const l = o.lines.find((x) => x.left > 0 && (m.store[x.item] ?? 0) > 0);
      if (l) { m.store[l.item]--; this.load(l.item); }
    }
    if (this.order && o.t <= 0) {
      // too late: the customer cancels; what was loaded goes back to the storeroom
      for (const l of o.lines) m.store[l.item] = (m.store[l.item] ?? 0) + (l.qty - l.left);
      this.order = null;
      w.events.emit('storeOrder', '', MARKET.van.x, MARKET.van.z, 0, 3);
    }
  }

  /** One item into the van; the order pays out when the last one is in. */
  private load(item: ItemId): void {
    const o = this.order, w = this.w;
    const l = o?.lines.find((x) => x.item === item && x.left > 0);
    if (!o || !l) return;
    l.left--;
    w.events.emit('drop', item, MARKET.van.x, MARKET.van.z, 0, w.carry.n);
    if (o.lines.some((x) => x.left > 0)) return;
    w.money += o.value;
    w.stats.earned += o.value;
    this.order = null;
    w.events.emit('storeOrder', '', MARKET.van.x, MARKET.van.z, o.value, 2);
  }

  /** Player at the van: hands over what the order needs, one item per drop interval. Returns true if one went in. */
  loadFromPlayer(): boolean {
    const w = this.w, p = w.player, c = w.carry, o = this.order;
    if (!o || dist(p.x, p.z, MARKET.van.x, MARKET.van.z) >= MARKET.van.r) return false;
    for (const l of o.lines) {
      if (l.left > 0 && c.has(l.item)) { c.take(l.item); this.load(l.item); return true; }
    }
    return false;
  }
}
