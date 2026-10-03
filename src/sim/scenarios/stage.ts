import type { ScenarioDef, ScenarioGoal } from '../../config/scenarios';
import { LAYOUT } from '../../config/layout';
import { dist } from '../math';
import type { SimWorld } from '../world';
import type { Mechanic } from './mechanic';

/** Music tempo; a pad stays lit for two beats. */
export const BPM = 100;
export const STEP = (60 / BPM) * 2;
const ON_PAD = 0.65;
const GOAL = 8;
const PERFECT = 16;

/**
 * Concert visit: dance pads in front of the stage light up on the beat. Be on the lit pad when the
 * beat changes to keep the combo going; the crowd tips more the longer it runs.
 */
export class StageMechanic implements Mechanic {
  readonly pads = LAYOUT.dancePads;
  lit = 0;
  /** Seconds into the current step (0..STEP). */
  beatT = 0;
  combo = 0;
  best = 0;

  start(w: SimWorld, _def: ScenarioDef): void {
    this.lit = w.rng.int(this.pads.length);
  }

  update(w: SimWorld, dt: number): void {
    if (w.scenario.phase !== 'active') return;
    this.beatT += dt;
    if (this.beatT < STEP) return;
    this.beatT -= STEP;
    const p = this.pads[this.lit];
    if (dist(w.player.x, w.player.z, p.x, p.z) < ON_PAD) {
      this.combo++;
      this.best = Math.max(this.best, this.combo);
      w.events.emit('scenarioCue', '', p.x, p.z, this.combo, 1, this.lit);
    } else if (this.combo > 0) {
      this.combo = 0;
      w.events.emit('scenarioCue', '', p.x, p.z, 0, 2, this.lit);
    }
    // a different pad next
    this.lit = (this.lit + 1 + w.rng.int(this.pads.length - 1)) % this.pads.length;
  }

  goal(_w: SimWorld, g: ScenarioGoal): boolean | undefined {
    return g === 'beatCombo' ? this.best >= GOAL : undefined;
  }

  progress(_w: SimWorld, g: ScenarioGoal): number { return g === 'beatCombo' ? Math.min(1, this.best / GOAL) : 0; }

  bonus(): boolean { return this.best >= PERFECT; }

  tipMult(): number { return 1 + this.combo / 8; }

  botTarget(): { x: number; z: number } | null { return this.pads[this.lit]; }

  teardown(): void {
    this.combo = 0;
  }
}
