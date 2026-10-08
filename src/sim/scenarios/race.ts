import type { ScenarioDef, ScenarioGoal } from '../../config/scenarios';
import { ECONOMY } from '../../config/economy';
import { dist, moveToward } from '../math';
import type { SimWorld } from '../world';
import type { Mechanic } from './mechanic';

/** The course: a lap of the event square, start and finish at the first gate. */
export const RACE_GATES: readonly { x: number; z: number }[] = [
  { x: -6.5, z: 15.6 }, { x: 0.0, z: 15.4 }, { x: 6.8, z: 15.8 }, { x: 6.8, z: 21.5 }, { x: 6.0, z: 26.2 },
  { x: 0.0, z: 26.4 }, { x: -6.5, z: 26.2 }, { x: -7.6, z: 20.8 }, { x: -6.5, z: 15.6 },
];
/** Passing within this of a gate counts. */
const GATE_R = 1.3;
/** The champion runs this much of the player's top speed, and stops halfway to pose for the cameras. */
const PACE = 0.86;
const POSE_AT = 4;
const POSE_TIME = 1.8;
/** Winning by this many seconds earns the third star. */
const CLEAR = 3;

/**
 * A race against the fastest man alive: a lap of gates round the event square. He runs a fixed line at a
 * little under the player's top speed (and can't resist a pose halfway); pass every gate in order and get
 * back to the start before him.
 */
export class RaceMechanic implements Mechanic {
  runner = { x: RACE_GATES[0].x, z: RACE_GATES[0].z, rot: 0, speed: 0 };
  /** Next gate for the runner and for the player (index into RACE_GATES; length = finished). */
  runnerGate = 1;
  playerGate = 1;
  /** Race clock and finishing times (0 = not yet). */
  time = 0;
  runnerTime = 0;
  playerTime = 0;
  /** Seconds left in the runner's pose. */
  poseT = 0;
  private posed = false;

  start(w: SimWorld, _def: ScenarioDef): void {
    this.runner.x = RACE_GATES[0].x; this.runner.z = RACE_GATES[0].z;
    // the player starts from wherever they are: the first gate counts as passed if they're at the start
    this.playerGate = dist(w.player.x, w.player.z, RACE_GATES[0].x, RACE_GATES[0].z) < GATE_R * 2 ? 1 : 0;
  }

  update(w: SimWorld, dt: number): void {
    if (w.scenario.phase !== 'active' || w.away) return;
    this.time += dt;
    // the runner
    const r = this.runner;
    r.speed = 0;
    if (this.runnerTime === 0) {
      if (this.poseT > 0) this.poseT -= dt;
      else {
        const g = RACE_GATES[this.runnerGate], sp = ECONOMY.player.speed * w.player.speedMult * PACE;
        if (moveToward(r, g.x, g.z, sp, dt, 0.15)) {
          this.runnerGate++;
          if (this.runnerGate === POSE_AT && !this.posed) { this.posed = true; this.poseT = POSE_TIME; w.events.emit('scenarioCue', '', r.x, r.z, 0, 4); }
          if (this.runnerGate >= RACE_GATES.length) {
            this.runnerTime = this.time;
            w.events.emit('scenarioCue', '', r.x, r.z, 0, 3);
          }
        }
      }
    }
    // the player's gates, in order
    if (this.playerTime === 0 && this.playerGate < RACE_GATES.length) {
      const g = RACE_GATES[this.playerGate];
      if (dist(w.player.x, w.player.z, g.x, g.z) < GATE_R) {
        this.playerGate++;
        if (this.playerGate >= RACE_GATES.length) {
          this.playerTime = this.time;
          w.events.emit('scenarioCue', '', g.x, g.z, this.won ? 1 : 0, 2);
        } else w.events.emit('scenarioCue', '', g.x, g.z, this.playerGate, 1);
      }
    }
  }

  /** The player crossed the line first. */
  get won(): boolean { return this.playerTime > 0 && (this.runnerTime === 0 || this.playerTime < this.runnerTime); }

  goal(_w: SimWorld, g: ScenarioGoal): boolean | undefined {
    return g === 'race' ? this.won : undefined;
  }

  /** Course gates passed (the start line doesn't count; the same count as the banner). */
  progress(_w: SimWorld, g: ScenarioGoal): number { return g === 'race' ? Math.min(1, Math.max(0, this.playerGate - 1) / (RACE_GATES.length - 1)) : 0; }

  bonus(): boolean { return this.won && (this.runnerTime === 0 || this.runnerTime - this.playerTime >= CLEAR); }

  hudNote(): string {
    const n = RACE_GATES.length - 1;
    const me = Math.min(n, Math.max(0, this.playerGate - 1)), him = Math.min(n, this.runnerGate - 1);
    return `🏁 إنت ${me}/${n} · ⚡ بولت ${him}/${n}`;
  }

  /** Keep the event going until one of them is home (the system caps the overtime). */
  busy(): boolean { return this.runnerTime === 0 && this.playerTime === 0; }

  botTarget(): { x: number; z: number } | null {
    return this.playerGate < RACE_GATES.length && this.playerTime === 0 ? RACE_GATES[this.playerGate] : null;
  }

  teardown(): void {
    this.runnerGate = 1;
    this.playerGate = 1;
    this.time = this.runnerTime = this.playerTime = 0;
    this.posed = false;
    this.poseT = 0;
  }
}
