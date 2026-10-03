import { ECONOMY } from '../config/economy';
import { angleDiff, resolveCircle, type Box } from './math';

export interface PlayerState {
  x: number; z: number;
  vx: number; vz: number;
  /** Facing angle around Y (0 = +z). */
  rot: number;
  /** Actual ground speed last tick (after collisions); drives the walk cycle. */
  speed: number;
  /** Speed multiplier from upgrades. */
  speedMult: number;
  /** Extra multiplier while driving a vehicle (1 on foot). */
  driveMult: number;
  /** Collision radius (bigger while driving a vehicle). */
  radius: number;
}

export function createPlayer(x: number, z: number): PlayerState {
  return { x, z, vx: 0, vz: 0, rot: Math.PI, speed: 0, speedMult: 1, driveMult: 1, radius: ECONOMY.player.radius };
}

/** Input is a stick vector with magnitude 0..1 (x = right, z = down-screen). */
export function updatePlayer(p: PlayerState, ix: number, iz: number, dt: number, solids: readonly Box[], bounds: Box): void {
  const cfg = ECONOMY.player;
  const m = Math.hypot(ix, iz), maxS = cfg.speed * p.speedMult * p.driveMult;
  let tx = 0, tz = 0;
  const moving = m > cfg.deadZone;
  if (moving) {
    const k = (Math.min(1, m) * maxS) / m;
    tx = ix * k; tz = iz * k;
    p.rot += angleDiff(p.rot, Math.atan2(ix, iz)) * Math.min(1, dt * cfg.turnRate);
  }
  const acc = 1 - Math.exp(-dt * (moving ? cfg.accel : cfg.decel));
  p.vx += (tx - p.vx) * acc;
  p.vz += (tz - p.vz) * acc;
  const ox = p.x, oz = p.z;
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  resolveCircle(p, p.radius, solids, bounds);
  p.speed = dt > 0 ? Math.hypot(p.x - ox, p.z - oz) / dt : 0;
}
