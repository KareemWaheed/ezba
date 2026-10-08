import { ECONOMY, priceOf, type DishId, type ItemId, type ProductId } from '../config/economy';
import { LAYOUT } from '../config/layout';
import type { Station } from './station';
import type { SimWorld } from './world';
import { dist } from './math';
import { jitter, newVisit, stepVisit, type Visit } from './visit';

export type RecordProduct = 'egg' | 'milk' | 'corn';
export const RECORD_PRODUCTS: readonly RecordProduct[] = ['egg', 'milk', 'corn'];

/** The trader's truck this visit: what he came for (the visit itself: sim/visit.ts). */
export interface TraderVisit extends Visit { product: ItemId }

const DRIVE = 3;
const R = 1.2;

/**
 * What a big surplus is good for. Spare stock on the shop counters (beyond what the line wants) and full
 * factory trays nobody takes otherwise just pile up:
 * - the wholesale trader drives in now and then and buys part of the biggest surplus cheaply;
 * - the incubator turns spare eggs into chicks to sell, and now and then a golden hen (eggs sell for more);
 * - records: with a big enough surplus of one product, set a record at the stand for a big payout.
 * The trader only comes during play; the incubator also hatches during time away (its crate fills up).
 */
export class SurplusSystem {
  visit: TraderVisit | null = null;
  private checkT = 30;
  private checks = 0;

  /** Chicks waiting in the crate, chicks being hatched, chicks hatched so far, golden hens. */
  crate = 0;
  hatching = 0;
  hatchT = 0;
  hatched = 0;
  golden = 0;
  private batchT = 0;

  /** Records set per product, and how long the player has stood at the stand. */
  readonly records: Record<RecordProduct, number> = { egg: 0, milk: 0, corn: 0 };
  hold = 0;
  /** The product a record is ready for (null = none), and seconds left of the last record's celebration. */
  ready: RecordProduct | null = null;
  celebT = 0;
  celebProduct: RecordProduct = 'egg';

  constructor(private w: SimWorld) {}

  /** Spare items of a station's product the farm can let go (counter beyond the line's needs). */
  private stationSpare(st: Station | undefined): number {
    return st && st.open ? Math.max(0, this.w.counterSpare(st)) : 0;
  }

  private station(p: ItemId): Station | undefined { return this.w.stations.find((s) => s.def.product === p); }

  /** Spare of anything the trader buys: station counters, and factory trays while the café counter is full. */
  spare(p: ItemId): number {
    const st = this.station(p);
    if (st) return this.stationSpare(st);
    const m = this.w.factory.machines.find((x) => x.def.makes === p);
    return m && m.open && this.w.factory.cafeFull(m.def.makes) ? m.conv.output[m.def.makes] : 0;
  }

  private takeOne(p: ItemId): boolean {
    const st = this.station(p);
    if (st) { if (this.stationSpare(st) <= 0) return false; st.counter--; return true; }
    // (factory trays only while the café counter is still full: otherwise the café gets them)
    const m = this.w.factory.machines.find((x) => x.def.makes === p);
    if (!m || !m.open || !this.w.factory.cafeFull(m.def.makes) || m.conv.output[p as DishId] <= 0) return false;
    m.conv.output[p as DishId]--;
    return true;
  }

  /** Sale price multiplier of a product: golden hens make eggs sell for more. */
  productMult(p: ItemId): number {
    return p === 'egg' ? 1 + this.golden * ECONOMY.surplus.incubator.goldenBonus : 1;
  }

  // ---- the wholesale trader ----

  /** The product with the most spare value worth a trip, and how much of it he wants. */
  private pickLoad(): { product: ItemId; want: number } | null {
    const cfg = ECONOMY.surplus.trader;
    let best: { product: ItemId; want: number } | null = null, bestV = 0;
    const items: ItemId[] = [...this.w.stations.map((s) => s.def.product), ...this.w.factory.machines.map((m) => m.def.makes)];
    for (const p of items) {
      const n = this.spare(p), tray = !this.station(p);
      if (n < (tray ? cfg.trayMin : cfg.min)) continue;
      const want = tray ? n : Math.min(n, cfg.maxLoad, Math.max(cfg.minLoad, Math.round(n * cfg.share)));
      const v = want * priceOf(p) * this.productMult(p);
      if (v > bestV) { best = { product: p, want }; bestV = v; }
    }
    return best;
  }

  /** Price the trader pays for one item right now. */
  traderPrice(p: ItemId): number {
    return priceOf(p) * this.w.priceMult * this.productMult(p) * ECONOMY.surplus.trader.price;
  }

  private updateTrader(dt: number): void {
    const w = this.w, cfg = ECONOMY.surplus.trader, L = LAYOUT.surplus;
    const v = this.visit;
    if (w.away) { this.visit = null; return; }
    if (!v) {
      if ((this.checkT -= dt) > 0) return;
      // (its own jitter: drawing on the world's random sequence would reshuffle every customer after it)
      this.checkT = cfg.every * (0.8 + 0.4 * jitter(++this.checks));
      const load = this.pickLoad();
      if (!load) return;
      this.visit = { ...newVisit(load.want, cfg.stay), product: load.product };
      w.events.emit('trader', load.product, L.load.x, L.load.z, load.want, 1);
      return;
    }
    // loading: the player at the load spot, or the trader himself with a deal; the whole lot in loadTime s
    const ev = stepVisit(v, dt, {
      drive: DRIVE, loadTime: cfg.loadTime, onEmpty: 'end',
      loading: w.upgrades.level('trader.deal') > 0 || dist(w.player.x, w.player.z, L.load.x, L.load.z) < R,
      take: () => this.takeOne(v.product),
      price: () => this.traderPrice(v.product),
      pay: (m) => { w.money += m; w.stats.earned += m; },
    });
    if (ev === 'done') w.events.emit('trader', v.product, L.load.x, L.load.z, v.paid, 2, v.want);
    else if (ev === 'left') w.events.emit('trader', v.product, L.park.x, L.park.z, v.paid, 3);
    else if (ev === 'gone') this.visit = null;
  }

  // ---- the incubator ----

  private updateIncubator(dt: number): void {
    const w = this.w, cfg = ECONOMY.surplus.incubator, lv = w.upgrades.level('eggs.incubator');
    if (lv <= 0) return;
    if (this.hatching > 0) {
      this.hatchT -= dt;
      if (this.hatchT > 0) return;
      this.crate = Math.min(cfg.crateMax, this.crate + this.hatching);
      this.hatched += this.hatching;
      if (!w.away) w.events.emit('incubator', '', LAYOUT.surplus.incubator.crate.x, LAYOUT.surplus.incubator.crate.z, this.hatching, 1);
      this.hatching = 0;
      while (this.golden < cfg.goldenMax && this.hatched >= (this.golden + 1) * cfg.goldenEvery) {
        this.golden++;
        w.events.emit('incubator', 'egg', LAYOUT.surplus.incubator.crate.x, LAYOUT.surplus.incubator.crate.z, 0, 3, this.golden);
      }
      return;
    }
    if ((this.batchT -= dt) > 0) return;
    this.batchT = 2;
    const chicks = cfg.batch * lv, eggs = chicks * cfg.perChick, st = this.station('egg');
    // (only a real surplus: the kitchen, the factory and the dock come first)
    if (!st || this.crate + chicks > cfg.crateMax || this.stationSpare(st) < eggs + cfg.reserve) return;
    st.counter -= eggs;
    this.hatching = chicks;
    this.hatchT = cfg.batchTime;
  }

  /** Price of one chick right now. */
  chickPrice(): number { return ECONOMY.surplus.incubator.chickPrice * this.w.priceMult; }

  // ---- records ----

  /** Spare needed for the next record of this product. */
  need(p: RecordProduct): number {
    const r = ECONOMY.surplus.records;
    return Math.round(r[p].need * Math.pow(r.grow, this.records[p]));
  }

  /** What setting the next record of this product pays. */
  recordPay(p: RecordProduct): number {
    return Math.round(this.need(p) * priceOf(p as ProductId) * this.w.priceMult * this.productMult(p) * ECONOMY.surplus.records.pay);
  }

  private updateRecords(dt: number): void {
    const w = this.w;
    this.celebT = Math.max(0, this.celebT - dt);
    // the product furthest past its record mark
    let pick: RecordProduct | null = null, best = 1;
    for (const p of RECORD_PRODUCTS) {
      const st = this.station(p);
      if (!st || !st.open) continue;
      const r = this.stationSpare(st) / this.need(p);
      if (r >= best) { pick = p; best = r; }
    }
    if (pick && pick !== this.ready && !w.away) w.events.emit('record', pick, LAYOUT.surplus.record.x, LAYOUT.surplus.record.z, this.need(pick), 1);
    this.ready = pick;
  }

  update(dt: number): void {
    this.updateTrader(dt);
    this.updateIncubator(dt);
    this.updateRecords(dt);
  }

  /** Player: sell the chicks at the crate; stay at the record stand to set a record. */
  interact(dt: number): void {
    const w = this.w, p = w.player, L = LAYOUT.surplus;
    if (this.crate > 0 && w.upgrades.level('eggs.incubator') > 0 && dist(p.x, p.z, L.incubator.crate.x, L.incubator.crate.z) < R) {
      const v = Math.round(this.crate * this.chickPrice());
      w.money += v;
      w.stats.earned += v;
      w.events.emit('incubator', '', L.incubator.crate.x, L.incubator.crate.z, v, 2, this.crate);
      this.crate = 0;
    }
    const r = this.ready;
    if (!r || dist(p.x, p.z, L.record.x, L.record.z) >= R) { this.hold = 0; return; }
    this.hold += dt;
    if (this.hold < ECONOMY.surplus.records.hold) return;
    const st = this.station(r)!, n = this.need(r), pay = this.recordPay(r);
    st.counter -= n;
    this.records[r]++;
    w.money += pay;
    w.stats.earned += pay;
    this.hold = 0;
    this.ready = null;
    this.celebT = 4;
    this.celebProduct = r;
    w.events.emit('record', r, L.record.x, L.record.z, pay, 2, this.records[r]);
  }
}
