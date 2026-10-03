import type { ScenarioDef, ScenarioGoal } from '../../config/scenarios';
import { ECONOMY, type ProductId } from '../../config/economy';
import { LAYOUT } from '../../config/layout';
import { dist } from '../math';
import type { SimWorld } from '../world';
import type { Mechanic } from './mechanic';

export interface Plate { x: number; z: number; want: ProductId; filled: boolean }

const PLACE_R = 0.8;
const FILL_EVERY = 0.25;
/** Eating time after the cannon. */
const EAT = 10;

/**
 * Iftar table (Ramadan only): a long table in the event square with a place per guest, each wanting
 * one thing. Walk along it with the right items to fill the plates before the Maghrib cannon (the end
 * of the event's timer). After the cannon everyone eats and tips for each filled plate.
 */
export class IftarMechanic implements Mechanic {
  plates: Plate[] = [];
  /** Cannon fired; plates filled at that moment. */
  maghrib = false;
  filledAtMaghrib = 0;
  private eatT = 0;
  private fillT = 0;

  start(w: SimWorld, _def: ScenarioDef): void {
    const t = LAYOUT.iftarTable, open = w.stations.filter((s) => s.open && s.farmed).map((s) => s.def.product);
    if (!open.length) return;
    let i = 0;
    for (const z of [t.z - 0.75, t.z + 0.75]) for (let k = 0; k < t.places; k++) {
      this.plates.push({ x: t.x0 + k * t.gap, z, want: open[i++ % open.length], filled: false });
    }
  }

  update(w: SimWorld, dt: number): void {
    const sc = w.scenario;
    if (!this.maghrib) {
      if (sc.phase === 'active' && sc.t <= 0) {
        this.maghrib = true;
        this.filledAtMaghrib = this.plates.filter((p) => p.filled).length;
        this.eatT = EAT;
        const tip = Math.round(this.filledAtMaghrib * ECONOMY.products.egg.price * w.priceMult * 3);
        w.money += tip;
        w.stats.earned += tip;
        sc.sales += tip;
        w.events.emit('scenarioCue', '', 0, 0, tip, 2);
        return;
      }
      this.fillT -= dt;
      if (this.fillT > 0 || w.away) return;
      for (const p of this.plates) {
        if (p.filled || !w.carry.has(p.want) || dist(w.player.x, w.player.z, p.x, p.z) > PLACE_R + 0.5) continue;
        w.carry.take(p.want);
        p.filled = true;
        this.fillT = FILL_EVERY;
        w.events.emit('drop', p.want, p.x, p.z, 0, w.carry.n);
        break;
      }
      return;
    }
    this.eatT -= dt;
  }

  /** Stay on while everyone eats after the cannon. */
  busy(): boolean { return !this.maghrib || this.eatT > 0; }

  goal(_w: SimWorld, g: ScenarioGoal): boolean | undefined {
    if (g !== 'plates') return undefined;
    const n = this.maghrib ? this.filledAtMaghrib : this.plates.filter((p) => p.filled).length;
    return this.plates.length > 0 && n === this.plates.length;
  }

  progress(_w: SimWorld, g: ScenarioGoal): number {
    return g === 'plates' && this.plates.length ? this.plates.filter((p) => p.filled).length / this.plates.length : 0;
  }

  /** The nearest empty plate you can fill; else the pile for the next one. */
  botTarget(w: SimWorld): { x: number; z: number } | null {
    if (this.maghrib) return null;
    let best: Plate | null = null, bd = Infinity;
    for (const p of this.plates) {
      if (p.filled || !w.carry.has(p.want)) continue;
      const d = dist(w.player.x, w.player.z, p.x, p.z);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) return { x: best.x, z: best.z };
    const next = this.plates.find((p) => !p.filled);
    if (!next || w.carry.full()) return null;
    const st = w.stations.find((s) => s.open && s.def.product === next.want && s.pile > 0);
    return st ? st.def.pile : null;
  }

  teardown(): void {
    this.plates = [];
  }
}
