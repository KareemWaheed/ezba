import type { ScenarioDef, ScenarioGoal } from '../../config/scenarios';
import { LAYOUT } from '../../config/layout';
import { dist } from '../math';
import type { SimWorld } from '../world';
import type { Mechanic } from './mechanic';

const P = LAYOUT.pitch;

/** Pitch geometry, with the goal mouth's center handy for aiming. */
export const FOOTBALL = { ...P, goal: { ...P.goal, z: (P.goal.z0 + P.goal.z1) / 2 } };

const BALL_R = 0.2;
/** Player + ball radius: closer than this and the player pushes the ball. */
const TOUCH = 0.55;
const FRICTION = 1.6;
const KEEPER_SPEED = 0.85;
const KEEPER_R = 0.32;
const CONE_R = 0.6;
const GOALS = 3;
const PERFECT = 5;

export type FootballVariant = 'penalty' | 'dribble';

/**
 * A footballer's visit: kick a ball into the little goal in the yard. Each goal makes the fans tip
 * more. Salah ('penalty'): a goalkeeper slides along the line. Messi ('dribble'): the ball has to pass
 * every cone before a goal counts.
 */
export class FootballMechanic implements Mechanic {
  variant: FootballVariant = 'penalty';
  ball: { x: number; z: number; vx: number; vz: number } = { x: P.kick.x, z: P.kick.z, vx: 0, vz: 0 };
  keeper = { z: FOOTBALL.goal.z, dir: 1 as 1 | -1 };
  /** Cones the ball has passed since the last reset. */
  cones: boolean[] = P.cones.map(() => false);
  scored = 0;
  /** Seconds until the ball goes back to the kick spot (after a goal or a save). */
  resetT = 0;

  start(_w: SimWorld, def: ScenarioDef): void {
    this.variant = def.variant === 'dribble' ? 'dribble' : 'penalty';
  }

  private reset(): void {
    const b = this.ball;
    b.x = P.kick.x; b.z = P.kick.z; b.vx = b.vz = 0;
    this.cones.fill(false);
  }

  update(w: SimWorld, dt: number): void {
    const b = this.ball, p = w.player;
    if (this.resetT > 0) { this.resetT -= dt; if (this.resetT <= 0) this.reset(); return; }
    if (this.variant === 'penalty') {
      const k = this.keeper;
      k.z += k.dir * KEEPER_SPEED * dt;
      if (k.z > P.goal.z1 - KEEPER_R) { k.z = P.goal.z1 - KEEPER_R; k.dir = -1; }
      if (k.z < P.goal.z0 + KEEPER_R) { k.z = P.goal.z0 + KEEPER_R; k.dir = 1; }
    }
    // the player pushes the ball away from themselves, harder when running
    const d = dist(p.x, p.z, b.x, b.z);
    if (d < TOUCH && !w.away) {
      const nx = (b.x - p.x) / (d || 1), nz = (b.z - p.z) / (d || 1);
      const s = 2.2 + p.speed * 1.4;
      b.vx = nx * s; b.vz = nz * s;
      b.x = p.x + nx * TOUCH; b.z = p.z + nz * TOUCH;
    }
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    const f = Math.exp(-FRICTION * dt);
    b.vx *= f; b.vz *= f;
    if (this.variant === 'dribble') P.cones.forEach((c, i) => { if (!this.cones[i] && dist(b.x, b.z, c.x, c.z) < CONE_R) { this.cones[i] = true; w.events.emit('scenarioCue', '', c.x, c.z, 0, 3, i); } });
    // walls of the pitch (the ball stays on it); the east line has the goal mouth
    if (b.x < P.x0 + BALL_R) { b.x = P.x0 + BALL_R; b.vx = Math.abs(b.vx) * 0.6; }
    if (b.z < P.z0 + BALL_R) { b.z = P.z0 + BALL_R; b.vz = Math.abs(b.vz) * 0.6; }
    if (b.z > P.z1 - BALL_R) { b.z = P.z1 - BALL_R; b.vz = -Math.abs(b.vz) * 0.6; }
    const inMouth = b.z > P.goal.z0 && b.z < P.goal.z1;
    if (this.variant === 'penalty' && inMouth && b.x > P.goal.x - 0.45 && Math.abs(b.z - this.keeper.z) < KEEPER_R + BALL_R && b.vx > 0) {
      // saved
      b.vx = -Math.abs(b.vx) * 0.7;
      b.x = P.goal.x - 0.45;
      w.events.emit('scenarioCue', '', b.x, b.z, 0, 2);
    }
    if (b.x > P.goal.x - BALL_R) {
      if (!inMouth) { b.x = P.goal.x - BALL_R; b.vx = -Math.abs(b.vx) * 0.6; return; }
      // over the line
      const counts = this.variant === 'penalty' || this.cones.every(Boolean);
      if (counts) this.scored++;
      w.events.emit('scenarioCue', '', b.x, b.z, this.scored, counts ? 1 : 4);
      this.resetT = 1;
      b.vx = b.vz = 0;
    }
  }

  /** Where to send the ball next: the next cone (Messi), else the open side of the goal. */
  nextAim(_w: SimWorld): { x: number; z: number } {
    if (this.variant === 'dribble') {
      const i = this.cones.indexOf(false);
      if (i >= 0) return P.cones[i];
    }
    const g = P.goal;
    const z = this.variant === 'penalty' ? (this.keeper.z > FOOTBALL.goal.z ? g.z0 + 0.25 : g.z1 - 0.25) : FOOTBALL.goal.z;
    return { x: g.x + 0.5, z };
  }

  goal(_w: SimWorld, g: ScenarioGoal): boolean | undefined {
    return g === 'goals' ? this.scored >= GOALS : undefined;
  }

  progress(_w: SimWorld, g: ScenarioGoal): number { return g === 'goals' ? Math.min(1, this.scored / GOALS) : 0; }

  bonus(): boolean { return this.scored >= PERFECT; }

  /** Fans tip more with every goal. */
  tipMult(): number { return 1 + 0.5 * this.scored; }

  /** Behind the ball (lined up with the aim), then through it. */
  botTarget(w: SimWorld): { x: number; z: number } | null {
    if (this.resetT > 0) return null;
    const b = this.ball, a = this.nextAim(w);
    const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz) || 1;
    const bx = b.x - (dx / d) * TOUCH, bz = b.z - (dz / d) * TOUCH;
    if (dist(w.player.x, w.player.z, bx, bz) < 0.4) return { x: b.x + (dx / d) * 0.8, z: b.z + (dz / d) * 0.8 };
    return { x: bx, z: bz };
  }

  teardown(): void {
    this.reset();
  }
}
