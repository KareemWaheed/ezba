import { LAYOUT, SOLIDS } from '../config/layout';
import { Rng } from './rng';
import { createPlayer, updatePlayer, type PlayerState } from './player';

/** All gameplay state. Pure data + tick(); the renderer and the simulator both drive this. */
export class SimWorld {
  time = 0;
  readonly rng: Rng;
  readonly player: PlayerState;
  /** Current stick input, magnitude 0..1. Set by the UI or the simulated player. */
  readonly input = { x: 0, z: 0 };

  constructor(seed = 1) {
    this.rng = new Rng(seed);
    this.player = createPlayer(LAYOUT.spawn.x, LAYOUT.spawn.z);
  }

  /** Advance the simulation. Callers keep dt <= MAX_STEP. */
  tick(dt: number): void {
    this.time += dt;
    updatePlayer(this.player, this.input.x, this.input.z, dt, SOLIDS, LAYOUT.bounds);
  }

  /** Advance by any amount of time in safe sub-steps. */
  advance(dt: number): void {
    while (dt > 1e-6) {
      const s = Math.min(dt, MAX_STEP);
      this.tick(s);
      dt -= s;
    }
  }
}

export const MAX_STEP = 1 / 30;
