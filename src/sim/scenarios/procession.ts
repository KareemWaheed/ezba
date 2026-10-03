import type { ScenarioDef, ScenarioGoal } from '../../config/scenarios';
import { ECONOMY, type ProductId } from '../../config/economy';
import { LAYOUT } from '../../config/layout';
import { dist } from '../math';
import type { SimWorld } from '../world';
import type { Mechanic } from './mechanic';

/** Someone walking in the procession. Off the path (not started yet / gone) at x = -99. */
export interface Walker { x: number; z: number; rot: number; want: ProductId; served: boolean }

export type ProcessionVariant = 'zaffa' | 'tour';

const SPEED = 0.8;
const GAP = 0.95;
const HAND_R = 1.2;
const STOP_TIME = 6;
const PHOTO_COUNT = 4;
const PHOTO_R = 0.9;
const NEED = 6;

/**
 * A group walking across the farm along a path. Walk up to someone with what they want in hand and
 * they take it (and pay well). zaffa (wedding): never stops. tour (Japanese group): stops at the tour
 * spots, and at the last one the guide calls everyone for a group photo; stand in it.
 */
export class ProcessionMechanic implements Mechanic {
  variant: ProcessionVariant = 'zaffa';
  guests: Walker[] = [];
  /** Distance the head of the group has walked along the path. */
  head = 0;
  /** Tour: index of the next stop and seconds left at the current one. */
  stopIx = 0;
  stopT = 0;
  /** Tour: where to stand for the photo while the guide counts down (null otherwise). */
  photoAt: { x: number; z: number } | null = null;
  photoT = 0;
  photoTaken = false;
  private path = LAYOUT.procession.path;
  private length = 0;
  private payT = 0;

  start(w: SimWorld, def: ScenarioDef): void {
    this.variant = def.variant === 'tour' ? 'tour' : 'zaffa';
    for (let i = 1; i < this.path.length; i++) this.length += dist(this.path[i - 1].x, this.path[i - 1].z, this.path[i].x, this.path[i].z);
    const open = w.stations.filter((s) => s.open && s.farmed).map((s) => s.def.product);
    const n = this.variant === 'tour' ? 7 : 8;
    for (let i = 0; i < n; i++) this.guests.push({ x: -99, z: 0, rot: 0, want: open.length ? open[i % open.length] : 'egg', served: false });
  }

  /** A point `d` along the path (clamped), with the heading there. */
  private at(d: number, out: Walker): boolean {
    if (d < 0 || d > this.length) { out.x = -99; return false; }
    let rest = d;
    for (let i = 1; i < this.path.length; i++) {
      const a = this.path[i - 1], b = this.path[i], seg = dist(a.x, a.z, b.x, b.z);
      if (rest <= seg) {
        const k = rest / seg;
        out.x = a.x + (b.x - a.x) * k; out.z = a.z + (b.z - a.z) * k;
        out.rot = Math.atan2(b.x - a.x, b.z - a.z);
        return true;
      }
      rest -= seg;
    }
    return false;
  }

  /** Path distance of each tour stop. */
  private stopDist(i: number): number {
    const s = LAYOUT.procession.stops[i];
    let d = 0, best = 0, bd = Infinity;
    for (let k = 1; k < this.path.length; k++) {
      const a = this.path[k - 1], b = this.path[k], seg = dist(a.x, a.z, b.x, b.z);
      for (let t = 0; t <= 20; t++) {
        const x = a.x + ((b.x - a.x) * t) / 20, z = a.z + ((b.z - a.z) * t) / 20, e = dist(x, z, s.x, s.z);
        if (e < bd) { bd = e; best = d + (seg * t) / 20; }
      }
      d += seg;
    }
    return best;
  }

  update(w: SimWorld, dt: number): void {
    const stops = LAYOUT.procession.stops;
    // tour: hold at stops; the last one is the photo
    if (this.variant === 'tour' && this.stopT > 0) {
      this.stopT -= dt;
      if (this.photoAt) {
        this.photoT -= dt;
        if (this.photoT <= 0 && !this.photoTaken) {
          this.photoTaken = dist(w.player.x, w.player.z, this.photoAt.x, this.photoAt.z) < PHOTO_R;
          w.events.emit('scenarioCue', '', this.photoAt.x, this.photoAt.z, 0, this.photoTaken ? 3 : 4);
          this.photoAt = null;
        }
      }
    } else if (w.scenario.phase === 'active' || w.scenario.phase === 'settle') {
      this.head += SPEED * dt;
      if (this.variant === 'tour' && this.stopIx < stops.length && this.head >= this.stopDist(this.stopIx)) {
        this.stopT = STOP_TIME;
        if (this.stopIx === stops.length - 1) {
          const s = stops[this.stopIx];
          this.photoAt = { x: s.x, z: s.z + 1.3 };
          this.photoT = PHOTO_COUNT;
          w.events.emit('scenarioCue', '', s.x, s.z, PHOTO_COUNT, 2);
        }
        this.stopIx++;
      }
    }
    this.guests.forEach((g, i) => this.at(this.head - i * GAP, g));
    // hand over: one item per moment to the nearest hungry walker who wants what you carry
    this.payT -= dt;
    if (this.payT > 0 || w.away) return;
    for (const g of this.guests) {
      if (g.served || g.x < -50 || !w.carry.has(g.want) || dist(w.player.x, w.player.z, g.x, g.z) > HAND_R) continue;
      w.carry.take(g.want);
      g.served = true;
      const value = Math.round(ECONOMY.products[g.want].price * w.priceMult * 4 * w.scenario.def.tipMult);
      w.money += value;
      w.stats.earned += value;
      w.scenario.sales += value;
      w.events.emit('scenarioCue', g.want, g.x, g.z, value, 1);
      this.payT = 0.35;
      return;
    }
  }

  /** Still crossing the farm: the event stays on until the last walker has passed. */
  busy(): boolean { return this.guests.length > 0 && this.head - (this.guests.length - 1) * GAP < this.length; }

  goal(_w: SimWorld, g: ScenarioGoal): boolean | undefined {
    if (g === 'trays') return this.guests.filter((x) => x.served).length >= NEED;
    if (g === 'photo') return this.photoTaken;
    return undefined;
  }

  progress(_w: SimWorld, g: ScenarioGoal): number {
    return g === 'trays' ? Math.min(1, this.guests.filter((x) => x.served).length / NEED) : 0;
  }

  bonus(): boolean { return this.guests.every((x) => x.served) && (this.variant !== 'tour' || this.photoTaken); }

  /** The photo spot; else the nearest hungry walker you can feed; else the pile they want. */
  botTarget(w: SimWorld): { x: number; z: number } | null {
    if (this.photoAt) return this.photoAt;
    let best: Walker | null = null, bd = Infinity;
    for (const g of this.guests) {
      if (g.served || g.x < -50 || !w.carry.has(g.want)) continue;
      const d = dist(w.player.x, w.player.z, g.x, g.z);
      if (d < bd) { bd = d; best = g; }
    }
    if (best) return { x: best.x, z: best.z };
    const next = this.guests.find((g) => !g.served && g.x > -50);
    if (!next || w.carry.full()) return null;
    const st = w.stations.find((s) => s.open && s.def.product === next.want && s.pile > 0);
    return st ? st.def.pile : null;
  }

  teardown(): void {
    this.guests = [];
    this.photoAt = null;
  }
}
