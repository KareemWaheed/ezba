import type { ScenarioDef, ScenarioGoal } from '../../config/scenarios';
import { dist } from '../math';
import type { SimWorld } from '../world';
import type { Mechanic } from './mechanic';
import { plazaSpot } from './plaza';

export interface HideBox { x: number; z: number; rot: number; open: boolean }

const BOXES = 5;
/** Touching a box opens it. */
const OPEN_R = 1.0;
/** He stays out this long after being found, then hides again (the boxes move). */
const POP = 2.6;
/** Bonus goal and the third star. */
const GOAL = 2;
const PERFECT = 3;
/** Each time he's found: this many seconds of the farm's production (at least MIN). */
const WORTH = 20;
const MIN = 80;

/**
 * Hide and seek: cardboard boxes on the event square and the prankster is in one of them. Open a box by
 * touching it; the banner says hot or cold. Found: he jumps out laughing (a reward), then hides again
 * somewhere new.
 */
export class HideSeekMechanic implements Mechanic {
  boxes: HideBox[] = [];
  /** Box he's in. */
  inBox = 0;
  found = 0;
  wrong = 0;
  /** Seconds he stays out after being found (0 = hiding). */
  popT = 0;
  /** Where he popped out. */
  pop = { x: 0, z: 0 };

  start(w: SimWorld, _def: ScenarioDef): void {
    this.hide(w);
  }

  /** New boxes around the square, away from the player; he picks one. */
  private hide(w: SimWorld): void {
    this.boxes = [];
    const avoid: { x: number; z: number }[] = [{ x: w.player.x, z: w.player.z }];
    for (let i = 0; i < BOXES; i++) {
      const s = plazaSpot(w, avoid, 3);
      avoid.push(s);
      this.boxes.push({ x: s.x, z: s.z, rot: w.rng.range(-0.5, 0.5), open: false });
    }
    this.inBox = w.rng.int(BOXES);
  }

  update(w: SimWorld, dt: number): void {
    if (w.scenario.phase !== 'active' || w.away) return;
    if (this.popT > 0) {
      this.popT -= dt;
      if (this.popT <= 0) this.hide(w);
      return;
    }
    const p = w.player;
    this.boxes.forEach((b, i) => {
      if (b.open || this.popT > 0 || dist(p.x, p.z, b.x, b.z) > OPEN_R) return;
      b.open = true;
      if (i === this.inBox) {
        this.found++;
        this.popT = POP;
        this.pop = { x: b.x, z: b.z };
        const v = Math.max(MIN, Math.round(w.perSec * WORTH));
        w.money += v;
        w.stats.earned += v;
        w.scenario.sales += v;
        w.events.emit('scenarioCue', '', b.x, b.z, v, 1, this.found);
      } else {
        this.wrong++;
        w.events.emit('scenarioCue', '', b.x, b.z, 0, 2, i);
      }
    });
  }

  /** How close the player is to his box, as the banner says it. */
  hudNote(w: SimWorld): string {
    if (this.popT > 0) return '😂 لقيته!';
    const b = this.boxes[this.inBox];
    if (!b) return '';
    const d = dist(w.player.x, w.player.z, b.x, b.z);
    return d < 3 ? '🔥🔥 سخن نار!' : d < 6 ? '🔥 سخن' : d < 10 ? '🌤️ دافي' : '❄️ ساقع';
  }

  goal(_w: SimWorld, g: ScenarioGoal): boolean | undefined {
    return g === 'found' ? this.found >= GOAL : undefined;
  }

  progress(_w: SimWorld, g: ScenarioGoal): number { return g === 'found' ? Math.min(1, this.found / GOAL) : 0; }

  bonus(): boolean { return this.found >= PERFECT; }

  /** The nearest box still closed. */
  botTarget(w: SimWorld): { x: number; z: number } | null {
    if (this.popT > 0) return null;
    let best: HideBox | null = null, bd = Infinity;
    for (const b of this.boxes) {
      if (b.open) continue;
      const d = dist(w.player.x, w.player.z, b.x, b.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best ? { x: best.x, z: best.z } : null;
  }

  teardown(): void {
    this.boxes = [];
    this.popT = 0;
  }
}
