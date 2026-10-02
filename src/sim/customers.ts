import { ECONOMY, type ProductId } from '../config/economy';
import { LAYOUT } from '../config/layout';
import { moveToward } from './math';
import type { SimWorld } from './world';
import type { Station } from './station';

export type CustomerState = 'queue' | 'leave';

export interface Customer {
  id: number;
  /** Random look seed; the renderer maps it to clothes/skin/hair. */
  look: number;
  x: number; z: number; rot: number; speed: number;
  state: CustomerState;
  product: ProductId;
  station: number;
  qty: number;
  /** Items still wanted. */
  left: number;
  /** Cooldown before taking the next item. */
  takeT: number;
  /** Set when the customer walked off the map; removed at end of tick. */
  gone: boolean;
}

/** Customer arrivals, the line at the counter, serving and payment. */
export class CustomerSystem {
  readonly list: Customer[] = [];
  private nextId = 1;
  private spawnT = 1;

  constructor(private w: SimWorld) {}

  get waiting(): number {
    let n = 0;
    for (const c of this.list) if (c.state === 'queue') n++;
    return n;
  }

  /** The customer at the front of the line, if they've reached the counter. */
  front(): Customer | null {
    for (const c of this.list) if (c.state === 'queue') return c;
    return null;
  }

  private spawn(): void {
    const w = this.w, rng = w.rng;
    const open = w.stations.filter((s) => s.open);
    if (!open.length) return;
    const st: Station = rng.pick(open);
    const q = ECONOMY.customers.qty[st.def.product];
    const maxQ = Math.max(1, Math.min(q.max, Math.floor(q.base + st.animals.length * q.perProducer)));
    const qty = 1 + rng.int(maxQ);
    const sp = LAYOUT.shop.spawn;
    this.list.push({
      id: this.nextId++, look: rng.int(1 << 30),
      x: rng.range(sp.x0, sp.x1), z: sp.z, rot: Math.PI, speed: 0,
      state: 'queue', product: st.def.product, station: st.index, qty, left: qty, takeT: 0, gone: false,
    });
  }

  update(dt: number, canServe: boolean): void {
    const w = this.w, cfg = ECONOMY.customers, shop = LAYOUT.shop;
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      if (this.waiting < cfg.queueMax) this.spawn();
      this.spawnT = cfg.interval * w.rng.range(1 - cfg.intervalJitter, 1 + cfg.intervalJitter);
    }

    let slot = 0;
    for (const c of this.list) {
      if (c.state === 'queue') {
        const arrived = moveToward(c, shop.queue.x, shop.queue.z + slot * shop.queue.gap, cfg.walkSpeed, dt, 0.08);
        if (arrived) c.rot += (Math.PI - c.rot) * Math.min(1, dt * 12);
        if (slot === 0 && arrived) {
          const st = w.stations[c.station];
          c.takeT -= dt;
          if (canServe && st.counter > 0 && c.takeT <= 0) {
            st.counter--;
            c.left--;
            w.stats.sold++;
            c.takeT = cfg.takeInterval;
            w.events.emit('sell', c.product, c.x, c.z, 0, c.qty - c.left, c.id);
            if (c.left <= 0) {
              c.state = 'leave';
              w.stats.served++;
              const value = c.qty * ECONOMY.products[c.product].price;
              w.cash.value += value;
              w.cash.bills += c.qty;
              w.events.emit('paid', c.product, c.x, c.z, value, c.qty, c.id);
            }
          }
        }
        slot++;
      } else if (moveToward(c, shop.exit.x, shop.exit.z, cfg.walkSpeed * 1.08, dt, 0.3)) c.gone = true;
    }
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].gone) this.list.splice(i, 1);
  }
}
