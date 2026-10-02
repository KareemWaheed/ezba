import { ECONOMY, type ProductId } from '../config/economy';
import { LAYOUT } from '../config/layout';
import { moveToward } from './math';
import type { SimWorld } from './world';
import type { Station } from './station';

export type CustomerState = 'queue' | 'leave';

/** One product in an order. */
export interface OrderLine { product: ProductId; station: number; qty: number; left: number }

export interface Customer {
  id: number;
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
  /** Cooldown before taking the next item. */
  takeT: number;
  /** Set when the customer walked off the map; removed at end of tick. */
  gone: boolean;
}

/** Customer arrivals, per-lane lines at the counter, serving and payment. */
export class CustomerSystem {
  readonly list: Customer[] = [];
  private nextId = 1;
  private spawnT = 1;
  /** Customers waiting per lane (rebuilt each tick). */
  readonly waitingPerLane = [0, 0, 0];
  private slots = [0, 0, 0];

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
    const open = w.stations.filter((s) => s.open);
    if (!open.length) return;
    let lines: OrderLine[];
    if (open.length >= 2 && rng.chance(cfg.mixedChance)) {
      // mixed order: two different products, each a bit smaller
      const a = rng.int(open.length);
      const b = (a + 1 + rng.int(open.length - 1)) % open.length;
      lines = [this.line(open[a], cfg.mixedScale), this.line(open[b], cfg.mixedScale)];
    } else lines = [this.line(rng.pick(open), 1)];
    let qty = 0;
    for (const l of lines) qty += l.qty;
    const sp = LAYOUT.shop.spawn;
    this.list.push({
      id: this.nextId++, look: rng.int(1 << 30),
      x: rng.range(sp.x0, sp.x1), z: sp.z, rot: Math.PI, speed: 0,
      state: 'queue', lines, lane, qty, left: qty, takeT: 0, gone: false,
    });
  }

  /** First order line that still needs items and has stock on the counter, or null. */
  takeable(c: Customer): OrderLine | null {
    for (const l of c.lines) if (l.left > 0 && this.w.stations[l.station].counter > 0) return l;
    return null;
  }

  /** Mean seconds between arrivals for the current number of lanes. */
  get interval(): number {
    const c = ECONOMY.customers;
    return c.interval / (1 + (this.w.lanes - 1) * c.perLane);
  }

  update(dt: number): void {
    const w = this.w, cfg = ECONOMY.customers, shop = LAYOUT.shop;
    const wl = this.waitingPerLane;
    wl[0] = wl[1] = wl[2] = 0;
    for (const c of this.list) if (c.state === 'queue') wl[c.lane]++;

    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      const lane = this.pickLane();
      if (lane >= 0) { this.spawn(lane); wl[lane]++; }
      this.spawnT = this.interval * w.rng.range(1 - cfg.intervalJitter, 1 + cfg.intervalJitter);
    }

    // walk the list in order; each customer's slot is how many of its lane are ahead of it
    const slots = this.slots;
    slots[0] = slots[1] = slots[2] = 0;
    for (const c of this.list) {
      if (c.state === 'queue') {
        const slot = slots[c.lane]++;
        const lx = shop.lanes[c.lane].x;
        const arrived = moveToward(c, lx, shop.queueZ + slot * shop.queueGap, cfg.walkSpeed, dt, 0.08);
        if (arrived) c.rot += (Math.PI - c.rot) * Math.min(1, dt * 12);
        if (slot === 0 && arrived) {
          c.takeT -= dt;
          const line = c.takeT <= 0 && w.laneServed(c.lane) ? this.takeable(c) : null;
          if (line) {
            w.stations[line.station].counter--;
            line.left--;
            c.left--;
            w.stats.sold++;
            c.takeT = w.laneInterval(c.lane);
            w.events.emit('sell', line.product, c.x, c.z, 0, c.qty - c.left, c.id);
            if (c.left <= 0) {
              c.state = 'leave';
              w.stats.served++;
              let value = 0;
              for (const l of c.lines) value += l.qty * ECONOMY.products[l.product].price;
              w.cash.value += value;
              w.cash.bills += c.qty;
              w.events.emit('paid', c.lines[0].product, c.x, c.z, value, c.qty, c.id);
            }
          }
        }
      } else if (moveToward(c, shop.exit.x, shop.exit.z, cfg.walkSpeed * 1.08, dt, 0.3)) c.gone = true;
    }
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].gone) this.list.splice(i, 1);
  }
}
