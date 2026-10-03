import type { ScenarioDef, ScenarioGoal } from '../../config/scenarios';
import type { SimWorld } from '../world';
import type { Mechanic } from './mechanic';

/** Moving faster than this during a take ruins it. */
const STILL = 0.15;
/** Reaction time: movement in the first moment of a take doesn't count. */
const REACT = 0.6;
const GOAL = 3;

/**
 * Film shoot with "the boss": the director calls "action!" (freeze where you are) and "cut!" (move,
 * serve). Moving during a take means a retake. Three clean takes wrap the scene.
 */
export class FilmingMechanic implements Mechanic {
  /** Camera rolling. */
  take = false;
  /** Seconds left in the current cut / take. */
  t = 3;
  good = 0;
  retakes = 0;
  /** Seconds since "action!". */
  private takeAge = 0;

  start(_w: SimWorld, _def: ScenarioDef): void {}

  update(w: SimWorld, dt: number): void {
    if (w.scenario.phase !== 'active' || this.good >= GOAL + 2) return;
    this.t -= dt;
    if (this.take) this.takeAge += dt;
    if (this.take && this.takeAge > REACT && w.player.speed > STILL) {
      // the player walked into the shot
      this.retakes++;
      this.take = false;
      this.t = w.rng.range(2.5, 4);
      w.events.emit('scenarioCue', '', 0, 0, this.retakes, 3);
      return;
    }
    if (this.t > 0) return;
    if (this.take) {
      this.good++;
      this.take = false;
      this.t = w.rng.range(5, 8);
      w.events.emit('scenarioCue', '', 0, 0, this.good, 2);
    } else {
      this.take = true;
      this.takeAge = 0;
      this.t = w.rng.range(4, 6);
      w.events.emit('scenarioCue', '', 0, 0, 0, 1);
    }
  }

  hudMode(): string { return this.take ? 'rec' : ''; }

  goal(_w: SimWorld, g: ScenarioGoal): boolean | undefined {
    return g === 'takes' ? this.good >= GOAL : undefined;
  }

  progress(_w: SimWorld, g: ScenarioGoal): number { return g === 'takes' ? Math.min(1, this.good / GOAL) : 0; }

  bonus(): boolean { return this.retakes === 0; }

  /** During a take: stay exactly where you are. */
  botTarget(w: SimWorld): { x: number; z: number } | null {
    return this.take ? { x: w.player.x, z: w.player.z } : null;
  }

  teardown(): void {
    this.take = false;
  }
}
