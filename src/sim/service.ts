import { ECONOMY } from '../config/economy';
import type { SimWorld } from './world';

/** What the service system needs to know about a finished or angry customer (shop or café). */
export interface ServedCustomer {
  x: number; z: number; id: number;
  patience: number; patienceMax: number;
  playerItems: number; qty: number;
  away: boolean;
  /** Album entry (customer type or 'vip'). */
  type: string;
}

/**
 * How service goes: farm rating, tips and the fast-service combo.
 * Tips and combos only come from customers the player served (staff never earn them).
 */
export class ServiceSystem {
  /** 1..5 stars. */
  rating: number = ECONOMY.rating.start;
  /** Fast player services in a row. */
  combo = 0;
  private comboT = 0;

  constructor(private w: SimWorld) {}

  /** Arrival-rate multiplier from the rating (gentle: 0.85x at 1 star, 1.25x at 5). */
  get arrivalMult(): number {
    const r = ECONOMY.rating;
    return r.arrivalBase + r.arrivalPerStar * this.rating;
  }

  private rate(score: number): void {
    const r = ECONOMY.rating;
    this.rating += (1 + 4 * score - this.rating) * r.weight;
    this.rating = Math.max(1, Math.min(5, this.rating));
  }

  /** Customer paid `value`. Returns the tip (0 if staff served or service was slow). */
  complete(c: ServedCustomer, value: number): number {
    const cfg = ECONOMY.tips, r = ECONOMY.rating;
    if (!c.away) this.w.album.see(c.type);
    const fast = c.patience / c.patienceMax >= cfg.fastAbove;
    const byPlayer = c.playerItems * 2 >= c.qty;
    if (!c.away) this.rate(fast ? r.scoreFast : r.scoreNormal);
    if (!byPlayer) return 0;
    if (!fast) { this.combo = 0; return 0; }
    this.combo++;
    this.comboT = cfg.comboTimeout;
    this.w.stats.fast++;
    const comboBonus = value * cfg.comboStep * Math.min(this.combo - 1, cfg.comboMax);
    const tip = Math.round(value * cfg.rate * (this.rating / 3) + comboBonus);
    this.w.events.emit('tip', '', c.x, c.z, tip, this.combo, c.id);
    return tip;
  }

  /** Customer gave up. */
  angry(c: Pick<ServedCustomer, 'away'>): void {
    if (!c.away) this.rate(ECONOMY.rating.scoreAngry);
    this.combo = 0;
    this.w.stats.angry++;
  }

  update(dt: number): void {
    if (this.combo > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }
  }
}
