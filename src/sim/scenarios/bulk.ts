import type { ScenarioDef, ScenarioGoal } from '../../config/scenarios';
import { ECONOMY, type ProductId } from '../../config/economy';
import { LAYOUT } from '../../config/layout';
import { dist } from '../math';
import type { SimWorld } from '../world';
import type { Mechanic } from './mechanic';

export interface BulkLine { product: ProductId; qty: number; left: number }

const DROP_R = 1.3;
const HAND_EVERY = 0.15;
/** Pays this many times the normal price. */
const PAY = 3;

/**
 * Army convoy: a big order is announced with the warning (time to stock up), then the truck parks
 * at the event square and the player hands it all over. Pays three times the price.
 */
export class BulkMechanic implements Mechanic {
  order: BulkLine[] = [];
  private handT = 0;
  private time = 0;
  private half = 0;
  /** Finished before half the event had passed. */
  quick = false;

  /** Set the order as soon as the warning starts. */
  warn(w: SimWorld): void {
    const open = w.stations.filter((s) => s.open && s.farmed).map((s) => s.def.product).slice(0, 3);
    const scale = 1 + w.upgrades.bought / 40;
    this.order = open.map((product) => { const q = Math.round(10 * scale); return { product, qty: q, left: q }; });
  }

  start(_w: SimWorld, def: ScenarioDef): void {
    this.half = def.duration / 2;
  }

  get done(): boolean { return this.order.length > 0 && this.order.every((l) => l.left <= 0); }

  update(w: SimWorld, dt: number): void {
    this.time += dt;
    if (w.scenario.phase !== 'active' || this.done || w.away) return;
    this.handT -= dt;
    const d = LAYOUT.army.drop;
    if (this.handT > 0 || dist(w.player.x, w.player.z, d.x, d.z) > DROP_R) return;
    const l = this.order.find((x) => x.left > 0 && w.carry.has(x.product));
    if (!l) return;
    w.carry.take(l.product);
    l.left--;
    this.handT = HAND_EVERY;
    const value = Math.round(ECONOMY.products[l.product].price * w.priceMult * PAY);
    w.money += value;
    w.stats.earned += value;
    w.scenario.sales += value;
    w.events.emit('drop', l.product, d.x, d.z, 0, w.carry.n);
    if (this.done) {
      this.quick = this.time <= this.half;
      w.events.emit('scenarioCue', '', d.x, d.z, 0, 1);
    }
  }

  goal(_w: SimWorld, g: ScenarioGoal): boolean | undefined {
    return g === 'bulkOrder' ? this.done : undefined;
  }

  progress(_w: SimWorld, g: ScenarioGoal): number {
    if (g !== 'bulkOrder') return 0;
    let q = 0, left = 0;
    for (const l of this.order) { q += l.qty; left += l.left; }
    return q ? 1 - left / q : 0;
  }

  bonus(): boolean { return this.quick; }

  /** The order with what's left of each line, e.g. "egg:12 milk:4" (the HUD maps ids to icons). */
  hudText(): string { return this.order.map((l) => `${l.product}:${l.left}`).join(' '); }

  /** With order items in hand: the truck. Otherwise the pile of what's still missing. */
  botTarget(w: SimWorld): { x: number; z: number } | null {
    if (w.scenario.phase !== 'active' || this.done) return null;
    const need = this.order.filter((l) => l.left > 0);
    if (need.some((l) => w.carry.has(l.product)) && (w.carry.full() || !need.some((l) => w.stations.some((s) => s.def.product === l.product && s.pile > 0)))) return LAYOUT.army.drop;
    for (const l of need) {
      const st = w.stations.find((s) => s.open && s.def.product === l.product && s.pile > 0);
      if (st && !w.carry.full()) return st.def.pile;
    }
    return need.some((l) => w.carry.has(l.product)) ? LAYOUT.army.drop : null;
  }

  teardown(): void {
    this.order = [];
  }
}
