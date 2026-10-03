import type { ScenarioDef } from '../../config/scenarios';
import type { ProductId } from '../../config/economy';
import { LAYOUT } from '../../config/layout';
import type { SimWorld } from '../world';
import type { Mechanic } from './mechanic';

/** A viewer asking for something on the live stream. */
export interface Request {
  product: ProductId;
  qty: number;
  /** Items of it the player has sold since the request came in. */
  got: number;
  /** Seconds left before the viewers lose interest. */
  t: number;
  done: boolean;
  /** Which comment line to show (index into the UI's pool). */
  line: number;
}

const EVERY = 9;
const LASTS = 18;
const QTY = 5;
const LIKES_PER_REQUEST = 3;

/**
 * Influencer live: requests pop up in the comments ("show us the eggs! x3"). Selling that product
 * yourself (at a lane) while the request is open fills it for a big burst of likes.
 */
export class CommentsMechanic implements Mechanic {
  requests: Request[] = [];
  private nextT = 2;
  private lines = 0;

  start(_w: SimWorld, _def: ScenarioDef): void {}

  update(w: SimWorld, dt: number): void {
    for (const r of this.requests) if (!r.done && r.t > 0) r.t -= dt;
    if (w.scenario.phase !== 'active') return;
    this.nextT -= dt;
    if (this.nextT > 0) return;
    this.nextT = EVERY;
    const open = w.stations.filter((s) => s.open && s.farmed).map((s) => s.def.product);
    if (!open.length) return;
    const product = open[w.rng.int(open.length)];
    this.requests.push({ product, qty: QTY, got: 0, t: LASTS, done: false, line: this.lines++ });
    w.events.emit('scenarioCue', product, 0, 0, 0, 1, this.requests.length - 1);
  }

  /** An item was sold at a lane. */
  onSell(w: SimWorld, product: ProductId, byPlayer: boolean): void {
    if (!byPlayer) return;
    for (let i = 0; i < this.requests.length; i++) {
      const r = this.requests[i];
      if (r.done || r.t <= 0 || r.product !== product) continue;
      r.got++;
      if (r.got >= r.qty) {
        r.done = true;
        w.scenario.likes += LIKES_PER_REQUEST;
        w.events.emit('scenarioCue', product, 0, 0, LIKES_PER_REQUEST, 2, i);
      }
      return;
    }
  }

  goal(): boolean | undefined { return undefined; }

  /** Every request that came in got filled. */
  bonus(): boolean { return this.requests.length > 0 && this.requests.every((r) => r.done); }

  /** The lane whose front customer wants an open request's product. */
  botTarget(w: SimWorld): { x: number; z: number } | null {
    const want = this.requests.filter((r) => !r.done && r.t > 0).map((r) => r.product);
    if (!want.length) return null;
    for (let i = 0; i < w.lanes; i++) {
      const f = w.customers.front(i);
      if (f && f.lines.some((l) => l.left > 0 && want.includes(l.product))) return { x: LAYOUT.shop.lanes[i].x, z: LAYOUT.shop.serveZ };
    }
    return null;
  }

  teardown(): void {
    this.requests = [];
  }
}
