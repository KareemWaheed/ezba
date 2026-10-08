import type { ScenarioDef, ScenarioGoal } from '../../config/scenarios';
import { LAYOUT } from '../../config/layout';
import { dist } from '../math';
import { ECONOMY } from '../../config/economy';
import type { SimWorld } from '../world';
import type { Mechanic } from './mechanic';

const P = LAYOUT.pitch;

/** Pitch geometry, with the goal mouth's center handy for aiming. */
export const FOOTBALL = { ...P, goal: { ...P.goal, z: (P.goal.z0 + P.goal.z1) / 2 } };

const BALL_R = 0.25;
/** Player + ball radius: the ball is pushed out to this distance (never overlaps the player). */
const TOUCH = ECONOMY.player.radius + BALL_R;
/** Rolling slow-down: proportional (air/grass) and constant (so it comes to a clean stop). */
const DRAG = 0.9;
const ROLL = 1.1;
/** Running into the ball faster than this kicks it (slower = it's dribbled along). */
const KICK_SPEED = 2.4;
/** Kick power: base + this much per unit of the player's speed; and the pause before another kick. */
const KICK_BASE = 2.0;
const KICK_GAIN = 1.25;
const KICK_COOLDOWN = 0.3;
/** A kick goes mostly where the player runs (the rest along the contact), so it's easy to aim. */
const KICK_AIM = 0.7;
/** Bounciness off the pitch edges and the goalposts. */
const BOUNCE = 0.55;
const POST_R = 0.07;
const KEEPER_SPEED = 0.95;
const KEEPER_R = 0.32;
const CONE_R = 0.6;
const GOALS = 1;
const PERFECT = 3;

export type FootballVariant = 'penalty' | 'dribble';

/**
 * A footballer's visit: kick a ball into the little goal in the yard. Each goal makes the fans tip
 * more. Salah ('penalty'): a goalkeeper slides along the line. Messi ('dribble'): an open goal; taking the
 * ball round every cone first makes it a golazo that counts twice.
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
  /** Seconds until the player can kick again (one touch = one kick). */
  private kickT = 0;

  start(_w: SimWorld, def: ScenarioDef): void {
    this.variant = def.variant === 'dribble' ? 'dribble' : 'penalty';
  }

  private reset(): void {
    const b = this.ball;
    b.x = P.kick.x; b.z = P.kick.z; b.vx = b.vz = 0;
    this.cones.fill(false);
    this.kickT = 0;
  }

  update(w: SimWorld, dt: number): void {
    this.step(w, dt);
    // a ball pinned on an edge or post (or waiting on the spot) is solid: the player stops at it
    if (!w.away) this.block(w.player);
  }

  private step(w: SimWorld, dt: number): void {
    const b = this.ball, p = w.player;
    if (this.resetT > 0) { this.resetT -= dt; if (this.resetT <= 0) this.reset(); return; }
    if (this.variant === 'penalty') {
      const k = this.keeper;
      k.z += k.dir * KEEPER_SPEED * dt;
      if (k.z > P.goal.z1 - KEEPER_R) { k.z = P.goal.z1 - KEEPER_R; k.dir = -1; }
      if (k.z < P.goal.z0 + KEEPER_R) { k.z = P.goal.z0 + KEEPER_R; k.dir = 1; }
    }
    this.kickT -= dt;
    if (!w.away) this.touch(p);
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    // rolling friction: slows in proportion, plus a constant part so it settles instead of creeping
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 0) {
      const ns = Math.max(0, sp * Math.exp(-DRAG * dt) - ROLL * dt);
      b.vx *= ns / sp; b.vz *= ns / sp;
    }
    if (this.variant === 'dribble') P.cones.forEach((c, i) => { if (!this.cones[i] && dist(b.x, b.z, c.x, c.z) < CONE_R) { this.cones[i] = true; w.events.emit('scenarioCue', '', c.x, c.z, 0, 3, i); } });
    // the pitch's edges (the ball stays on it); the east line has the goal mouth
    if (b.x < P.x0 + BALL_R) { b.x = P.x0 + BALL_R; b.vx = Math.abs(b.vx) * BOUNCE; }
    if (b.z < P.z0 + BALL_R) { b.z = P.z0 + BALL_R; b.vz = Math.abs(b.vz) * BOUNCE; }
    if (b.z > P.z1 - BALL_R) { b.z = P.z1 - BALL_R; b.vz = -Math.abs(b.vz) * BOUNCE; }
    // the posts are round: the ball glances off them
    for (const pz of [P.goal.z0, P.goal.z1]) {
      const dx = b.x - P.goal.x, dz = b.z - pz, d = Math.hypot(dx, dz), r = BALL_R + POST_R;
      if (d >= r || d === 0) continue;
      const nx = dx / d, nz = dz / d, vn = b.vx * nx + b.vz * nz;
      b.x = P.goal.x + nx * r; b.z = pz + nz * r;
      if (vn < 0) { b.vx -= (1 + BOUNCE) * vn * nx; b.vz -= (1 + BOUNCE) * vn * nz; }
    }
    const inMouth = b.z > P.goal.z0 + POST_R && b.z < P.goal.z1 - POST_R;
    if (this.variant === 'penalty' && inMouth && b.x > P.goal.x - 0.45 && Math.abs(b.z - this.keeper.z) < KEEPER_R + BALL_R && b.vx > 0) {
      // saved: the keeper parries it back out
      b.vx = -Math.abs(b.vx) * 0.7;
      b.x = P.goal.x - 0.45;
      w.events.emit('scenarioCue', '', b.x, b.z, 0, 2);
    }
    if (b.x > P.goal.x - BALL_R) {
      if (!inMouth) { b.x = P.goal.x - BALL_R; b.vx = -Math.abs(b.vx) * BOUNCE; return; }
      // over the line (its center past the goal line)
      if (b.x < P.goal.x) return;
      const golazo = this.variant === 'dribble' && this.cones.every(Boolean);
      this.scored += golazo ? 2 : 1;
      w.events.emit('scenarioCue', '', b.x, b.z, this.scored, golazo ? 5 : 1);
      this.resetT = 1;
      b.vx = b.vz = 0;
    }
  }

  /**
   * The player and the ball: the ball is never inside the player (pushed out to the touch distance).
   * Walking into it carries it along (dribbling); running into it kicks it, mostly the way the player
   * runs, once per touch.
   */
  /** Keeps the player out of the ball (moves the player, not the ball). */
  private block(p: SimWorld['player']): void {
    const b = this.ball, dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz);
    if (d >= TOUCH) return;
    const nx = d > 1e-4 ? dx / d : -Math.sin(p.rot), nz = d > 1e-4 ? dz / d : -Math.cos(p.rot);
    p.x = b.x + nx * TOUCH;
    p.z = b.z + nz * TOUCH;
    // the run into the ball stops (so the walk cycle and anything reading the speed see the player held)
    const into = -(p.vx * nx + p.vz * nz);
    if (into > 0) { p.vx += into * nx; p.vz += into * nz; }
    p.speed = Math.min(p.speed, Math.hypot(p.vx, p.vz));
  }

  private touch(p: SimWorld['player']): void {
    const b = this.ball, dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz);
    if (d >= TOUCH) return;
    const ps = Math.hypot(p.vx, p.vz);
    // contact normal (player -> ball); dead center: along the player's run, else their facing
    let nx: number, nz: number;
    if (d > 1e-4) { nx = dx / d; nz = dz / d; } else if (ps > 0.01) { nx = p.vx / ps; nz = p.vz / ps; } else { nx = Math.sin(p.rot); nz = Math.cos(p.rot); }
    const pv = p.vx * nx + p.vz * nz, bv = b.vx * nx + b.vz * nz;
    // the ball is already moving away at least as fast: leave it be (no snapping it back to the player)
    if (pv <= bv) return;
    b.x = p.x + nx * TOUCH;
    b.z = p.z + nz * TOUCH;
    if (this.kickT <= 0 && pv > KICK_SPEED) {
      let kx = (p.vx / ps) * KICK_AIM + nx * (1 - KICK_AIM), kz = (p.vz / ps) * KICK_AIM + nz * (1 - KICK_AIM);
      const kl = Math.hypot(kx, kz) || 1;
      kx /= kl; kz /= kl;
      const s = KICK_BASE + ps * KICK_GAIN;
      b.vx = kx * s; b.vz = kz * s;
      this.kickT = KICK_COOLDOWN;
    } else {
      // dribble: the ball takes the player's push along the contact, a touch ahead of them
      const add = pv * 1.15 - bv;
      b.vx += nx * add; b.vz += nz * add;
    }
  }

  /** Where to send the ball next: the open side of the goal (Messi's goal is open: straight in). */
  nextAim(_w: SimWorld): { x: number; z: number } {
    const g = P.goal;
    const z = this.variant === 'penalty' ? (this.keeper.z > FOOTBALL.goal.z ? g.z0 + 0.45 : g.z1 - 0.45) : FOOTBALL.goal.z;
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
