import type { ScenarioDef, ScenarioGoal } from '../../config/scenarios';
import { dist } from '../math';
import type { SimWorld } from '../world';
import type { Mechanic } from './mechanic';

/** Every this many seconds the wind takes one item off each uncovered pile. */
const GUST = 4;
const COVER_TIME = 1.5;
const COVER_R = 1.3;

/**
 * Khamaseen sandstorm: the wind blows items off the animals' piles. Stand on a pile for a moment to
 * pull a tarp over it. Every pile covered by the end passes; losing nothing is perfect.
 */
export class KhamaseenMechanic implements Mechanic {
  /** Per station index: covered (only farmed, open stations are in play). */
  covered: boolean[] = [];
  /** Per station: seconds the player has stood there (covering). */
  coverT: number[] = [];
  lost = 0;
  private gustT = GUST;
  private ids: number[] = [];

  start(w: SimWorld, _def: ScenarioDef): void {
    this.ids = w.stations.filter((s) => s.open && s.farmed).map((s) => s.index);
    this.covered = w.stations.map(() => false);
    this.coverT = w.stations.map(() => 0);
  }

  update(w: SimWorld, dt: number): void {
    if (w.scenario.phase !== 'active') return;
    const p = w.player;
    for (const i of this.ids) {
      if (this.covered[i]) continue;
      const pile = w.stations[i].def.pile;
      if (!w.away && dist(p.x, p.z, pile.x, pile.z) < COVER_R) {
        this.coverT[i] += dt;
        if (this.coverT[i] >= COVER_TIME) { this.covered[i] = true; w.events.emit('scenarioCue', '', pile.x, pile.z, 0, 1, i); }
      } else this.coverT[i] = 0;
    }
    this.gustT -= dt;
    if (this.gustT > 0) return;
    this.gustT = GUST;
    for (const i of this.ids) {
      const st = w.stations[i];
      if (this.covered[i] || st.pile <= 0) continue;
      st.pile--;
      this.lost++;
      w.events.emit('scenarioCue', st.def.product, st.def.pile.x, st.def.pile.z, 0, 2, i);
    }
  }

  goal(_w: SimWorld, g: ScenarioGoal): boolean | undefined {
    return g === 'covered' ? this.ids.length > 0 && this.ids.every((i) => this.covered[i]) : undefined;
  }

  progress(_w: SimWorld, g: ScenarioGoal): number {
    return g === 'covered' && this.ids.length ? this.ids.filter((i) => this.covered[i]).length / this.ids.length : 0;
  }

  bonus(): boolean { return this.lost === 0; }

  /** The nearest uncovered pile. */
  botTarget(w: SimWorld): { x: number; z: number } | null {
    let best: { x: number; z: number } | null = null, bd = Infinity;
    for (const i of this.ids) {
      if (this.covered[i]) continue;
      const pile = w.stations[i].def.pile, d = dist(w.player.x, w.player.z, pile.x, pile.z);
      if (d < bd) { bd = d; best = pile; }
    }
    return best;
  }

  teardown(): void {
    this.ids = [];
  }
}
