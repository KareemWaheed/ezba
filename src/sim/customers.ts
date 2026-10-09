import { ECONOMY, type ProductId } from '../config/economy';
import { pickType } from '../config/album';
import { LAYOUT } from '../config/layout';
import { moveToward } from './math';
import type { SimWorld } from './world';
import type { Station } from './station';
import type { CrowdStyle } from '../config/scenarios';

/** queue = waiting in a lane; leave = paid and walking off; angry = gave up and walking off. */
export type CustomerState = 'queue' | 'leave' | 'angry';
/** guest = a scenario's special guest (president, Salah...): player-only service like a VIP. */
export type CustomerKind = 'normal' | 'vip' | 'guest';
export type Mood = 'happy' | 'bored' | 'angry';

/** One product in an order. */
export interface OrderLine { product: ProductId; station: number; qty: number; left: number }

export interface Customer {
  id: number;
  kind: CustomerKind;
  /** Random look seed; the renderer maps it to clothes/skin/hair. */
  look: number;
  x: number; z: number; rot: number; speed: number;
  state: CustomerState;
  /** What they want: one line per product (mixed orders have two). */
  lines: OrderLine[];
  /** Checkout lane this customer lines up in. */
  lane: number;
  /** Total items ordered / still wanted across all lines. */
  qty: number;
  left: number;
  /** Seconds of patience left / at the start. */
  patience: number;
  patienceMax: number;
  /** Items handed over while the player was at the lane (decides who gets credit). */
  playerItems: number;
  /** Arrived during a rush. */
  rush: boolean;
  /** Part of a scenario event (crowd or guest). */
  scenario: boolean;
  /** Crowd look for the renderer ('' = random clothes). */
  style: CrowdStyle | '';
  /** Customer type (album entry; 'vip' for VIPs) — also picks their clothes. */
  type: string;
  /** Arrived while the player was away (doesn't count toward the rating). */
  away: boolean;
  /** Cooldown before taking the next item. */
  takeT: number;
  /** >0 right after taking an item: patience doesn't drain while being served. */
  servedT: number;
  /** VIP: seconds spent at the front of the lane (the cashier takes over after vip.cashierAfter). */
  frontT: number;
  /** Set when the customer walked off the map; removed at end of tick. */
  gone: boolean;
}

export function moodOf(c: { state: string; patience: number; patienceMax: number }): Mood {
  if (c.state === 'angry') return 'angry';
  const f = c.patience / c.patienceMax, p = ECONOMY.patience;
  return f > p.happy ? 'happy' : f > p.bored ? 'bored' : 'angry';
}

/** Customer arrivals, per-lane lines at the counter, patience, serving and payment. */
export class CustomerSystem {
  readonly list: Customer[] = [];
  private nextId = 1;
  private spawnT = 1;
  /** Customers waiting per lane (rebuilt each tick). */
  readonly waitingPerLane: number[] = LAYOUT.shop.lanes.map(() => 0);
  private slots: number[] = LAYOUT.shop.lanes.map(() => 0);
  /** Debug: make the next arrival a VIP and bring it now. */
  forceVip = false;
  /** Seconds until another VIP may arrive. */
  vipT = 0;

  constructor(private w: SimWorld) {}

  /** Front customer of a lane (whether or not they've reached the counter yet). */
  front(lane: number): Customer | null {
    for (const c of this.list) if (c.state === 'queue' && c.lane === lane) return c;
    return null;
  }

  /** Shortest open lane, or -1 if every lane is full. */
  private pickLane(): number {
    const lanes = this.w.lanes, max = ECONOMY.customers.queueMax;
    let best = -1, bestN = Infinity;
    for (let i = 0; i < lanes; i++) {
      const n = this.waitingPerLane[i];
      if (n < max && n < bestN) { best = i; bestN = n; }
    }
    return best;
  }

  private line(st: Station, scale: number): OrderLine {
    const q = ECONOMY.customers.qty[st.def.product];
    const maxQ = Math.max(1, Math.min(q.max, Math.floor((q.base + st.animals.length * q.perProducer) * scale)));
    const qty = 1 + this.w.rng.int(maxQ);
    return { product: st.def.product, station: st.index, qty, left: qty };
  }

  private spawn(lane: number): void {
    const w = this.w, rng = w.rng, cfg = ECONOMY.customers;
    // products with animals always; field products (corn) only while some are on the counter
    const open = w.stations.filter((s) => s.open && (s.farmed || s.counter > 0));
    if (!open.length) return;
    // shop rushes only (café rushes are handled by the café)
    const rush = w.rush.active && w.rush.kind.target !== 'cafe';
    const sc = w.scenario, inScenario = sc.active;
    const crowd = inScenario && rng.chance(sc.def.crowdShare);
    // one VIP at a time, with a breather between them
    const vipWaiting = this.list.some((c) => c.kind === 'vip' && c.state === 'queue');
    const vip = this.forceVip || (!w.away && !rush && !inScenario && !vipWaiting && this.vipT <= 0
      && w.upgrades.bought >= ECONOMY.vip.minUpgrades && rng.chance(ECONOMY.vip.chance));
    this.forceVip = false;
    if (vip) this.vipT = ECONOMY.vip.gap;
    const featProduct = rush ? w.rush.featured : crowd ? sc.featured : null;
    const featured = featProduct ? open.find((s) => s.def.product === featProduct) : undefined;
    let lines: OrderLine[];
    if (featured && (crowd || rng.chance(ECONOMY.rush.skew))) lines = [this.line(featured, crowd ? sc.def.qtyMult : 1)];
    else if (open.length >= 2 && rng.chance(cfg.mixedChance)) {
      // mixed order: two different products, each a bit smaller
      const a = rng.int(open.length);
      const b = (a + 1 + rng.int(open.length - 1)) % open.length;
      lines = [this.line(open[a], cfg.mixedScale), this.line(open[b], cfg.mixedScale)];
    } else lines = [this.line(rng.pick(open), 1)];
    if (vip) for (const l of lines) { l.qty = Math.ceil(l.qty * ECONOMY.vip.qtyMult); l.left = l.qty; }
    let qty = 0;
    for (const l of lines) qty += l.qty;
    const pc = ECONOMY.patience;
    const grace = pc.early * Math.max(0, 1 - w.upgrades.bought / pc.earlyUpgrades);
    const service = 1 + w.upgrades.level('hr.service') * ECONOMY.upgrades['hr.service'].step;
    const patience = (pc.normal + grace) * service * (vip ? ECONOMY.vip.patienceMult : 1) * (inScenario ? sc.def.patienceMult : 1);
    const sp = LAYOUT.shop.spawn;
    const look = rng.int(1 << 30);
    // some events seat their crowd in particular lanes (derby: each side has its own stand)
    if (crowd) lane = sc.mech.laneFor?.(look, this.waitingPerLane, w.lanes) ?? lane;
    this.list.push({
      id: this.nextId++, kind: vip ? 'vip' : 'normal', look, type: vip ? 'vip' : pickType(w, look),
      x: rng.range(sp.x0, sp.x1), z: sp.z, rot: Math.PI, speed: 0,
      state: 'queue', lines, lane, qty, left: qty, patience, patienceMax: patience, playerItems: 0,
      rush, scenario: inScenario, style: crowd ? (sc.mech.crowdStyle?.(look) ?? sc.def.crowd ?? '') : '', away: w.away, takeT: 0, servedT: 0, frontT: 0, gone: false,
    });
    if (rush) w.rush.spawned++;
    if (vip) w.events.emit('vip', '', 0, 0, 0, lane, this.nextId - 1);
  }

  /** First order line that still needs items and has stock on the counter, or null. */
  takeable(c: Customer): OrderLine | null {
    for (const l of c.lines) if (l.left > 0 && this.w.stations[l.station].counter > 0) return l;
    return null;
  }

  /**
   * Whether this customer can be served at their lane right now. VIPs want the player, but after
   * vip.cashierAfter seconds at the front they let the lane's cashier serve them (scenario guests never do).
   */
  servable(c: Customer): boolean {
    if (c.kind === 'normal') return this.w.laneServed(c.lane);
    if (this.w.playerAtLane(c.lane)) return true;
    return c.kind === 'vip' && c.frontT >= ECONOMY.vip.cashierAfter && this.w.laneServed(c.lane);
  }

  /** Mean seconds between arrivals for the current farm size, lanes, rating and rush. */
  get interval(): number {
    const c = ECONOMY.customers, w = this.w;
    let base = c.perMinute;
    for (const s of w.stations) {
      if (!s.open) continue;
      const made = s.def.producer ? (s.animals.length * 60) / ECONOMY.producers[s.def.producer].interval : 0;
      const q = c.qty[s.def.product];
      const maxQ = Math.max(1, Math.min(q.max, Math.floor(q.base + s.animals.length * q.perProducer)));
      base += (made * c.demandRatio) / ((1 + maxQ) / 2);
    }
    const perMin = base * (1 + (w.lanes - 1) * c.perLane) * w.service.arrivalMult * w.rush.arrivalMult * w.scenario.arrivalMult;
    return 60 / perMin;
  }

  private giveUp(c: Customer): void {
    c.state = 'angry';
    // anything already taken goes back on the counter
    for (const l of c.lines) { this.w.stations[l.station].counter += l.qty - l.left; l.left = l.qty; }
    c.left = c.qty;
    if (c.rush) this.w.rush.angry++;
    if (c.scenario && this.w.scenario.phase !== 'idle') this.w.scenario.angry++;
    this.w.service.angry(c);
    this.w.events.emit('angry', '', c.x, c.z, 0, 0, c.id);
  }

  private finish(c: Customer): void {
    const w = this.w;
    c.state = 'leave';
    w.stats.served++;
    if (c.kind === 'vip') w.stats.vips++;
    let value = 0;
    // (golden hens from the incubator make eggs sell for more)
    for (const l of c.lines) value += l.qty * ECONOMY.products[l.product].price * w.priceMult * w.surplus.productMult(l.product);
    value = Math.round(value);
    // the VIP bonus is for the items served in person (whatever a cashier took over sells at the normal price)
    if (c.kind === 'vip') value = Math.round(value * (1 + (ECONOMY.vip.payMult - 1) * Math.min(1, c.playerItems / c.qty)));
    const sc = w.scenario, inEvent = c.scenario && sc.phase !== 'idle';
    if (c.rush) w.rush.sales += value;
    if (inEvent) {
      sc.sales += value;
      // likes: fast services by the player during the event
      if (c.playerItems * 2 >= c.qty && c.patience / c.patienceMax >= ECONOMY.tips.fastAbove) sc.likes++;
    }
    let tip = w.service.complete(c, value);
    if (inEvent) tip = Math.round(tip * sc.def.tipMult * (sc.mech.tipMult?.() ?? 1));
    w.cash.value += value + tip;
    w.cash.bills += c.qty + (tip > 0 ? 2 : 0);
    w.events.emit('paid', c.lines[0].product, c.x, c.z, value, c.qty, c.id);
  }

  update(dt: number): void {
    const w = this.w, cfg = ECONOMY.customers, shop = LAYOUT.shop;
    const wl = this.waitingPerLane;
    wl.fill(0);
    for (const c of this.list) if (c.state === 'queue') wl[c.lane]++;

    this.spawnT -= dt;
    this.vipT -= dt;
    if (this.forceVip) this.spawnT = 0;
    // (the supermarket path's farm shop opens with the coop: until then nobody comes to the farm)
    if (this.spawnT <= 0 && w.mode === 'market' && !w.stations.some((s) => s.open)) this.spawnT = 5;
    if (this.spawnT <= 0) {
      const lane = this.pickLane();
      if (lane >= 0) { this.spawn(lane); wl[lane]++; }
      this.spawnT = this.interval * w.rng.range(1 - cfg.intervalJitter, 1 + cfg.intervalJitter);
    }

    // walk the list in order; each customer's slot is how many of its lane are ahead of it
    const slots = this.slots;
    slots.fill(0);
    for (const c of this.list) {
      if (c.state === 'queue') {
        const slot = slots[c.lane]++;
        const lx = shop.lanes[c.lane].x;
        const arrived = moveToward(c, lx, shop.queueZ + slot * shop.queueGap, cfg.walkSpeed, dt, 0.08);
        if (arrived) c.rot += (Math.PI - c.rot) * Math.min(1, dt * 12);
        c.servedT -= dt;
        if (slot === 0 && arrived) {
          c.frontT += dt;
          c.takeT -= dt;
          const line = c.takeT <= 0 && this.servable(c) ? this.takeable(c) : null;
          if (line) {
            w.stations[line.station].counter--;
            line.left--;
            c.left--;
            w.stats.sold++;
            if (w.playerAtLane(c.lane)) c.playerItems++;
            c.takeT = w.laneInterval(c.lane);
            c.servedT = 0.8;
            w.events.emit('sell', line.product, c.x, c.z, 0, c.qty - c.left, c.id);
            if (w.scenario.active) w.scenario.mech.onSell?.(w, line.product, w.playerAtLane(c.lane));
            if (c.left <= 0) { this.finish(c); continue; }
          }
        }
        if (c.servedT <= 0) {
          c.patience -= dt;
          if (c.patience <= 0) this.giveUp(c);
        }
      } else if (moveToward(c, shop.exit.x, shop.exit.z, cfg.walkSpeed * (c.state === 'angry' ? 1.3 : 1.08), dt, 0.3)) c.gone = true;
    }
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].gone) this.list.splice(i, 1);
  }
}
