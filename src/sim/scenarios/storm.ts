import type { ScenarioDef, ScenarioGoal } from '../../config/scenarios';
import { LAYOUT } from '../../config/layout';
import { clamp, dist, moveToward } from '../math';
import type { SimWorld } from '../world';
import type { Mechanic } from './mechanic';

/** An animal that ran out of its pen in the storm. */
export interface Stray {
  station: number;
  x: number; z: number; rot: number; speed: number;
  tx: number; tz: number;
  /** Walking back after the player reached it. */
  home: boolean;
  /** Back in the pen (kept a moment for the render to fade it out). */
  done: boolean;
}

const MAX_STRAYS = 5;
const SPAWN_EVERY = 6;
const RUN_SPEED = 1.5;
const HOME_SPEED = 2.4;
const REACH = 1.0;

/**
 * Storm: the power is out, it's dark and animals panic out of their pens. Walk up to a stray and it
 * trots back home. A pen with a stray out stops producing until it's back.
 */
export class StormMechanic implements Mechanic {
  strays: Stray[] = [];
  /** Animals that ran out this event. */
  total = 0;
  private spawnT = 1.5;
  private time = 0;
  private duration = 0;
  /** Every stray was home before half the event had passed. */
  private quick = true;

  start(_w: SimWorld, def: ScenarioDef): void {
    this.duration = def.duration;
  }

  private farmed(w: SimWorld): number[] {
    return w.stations.filter((s) => s.open && s.farmed && s.def.trough).map((s) => s.index);
  }

  private spawn(w: SimWorld): void {
    const ids = this.farmed(w);
    if (!ids.length) return;
    const st = w.stations[ids[w.rng.int(ids.length)]], t = st.def.trough!;
    const s: Stray = { station: st.index, x: t.x, z: t.z + 0.6, rot: 0, speed: 0, tx: t.x, tz: t.z + 2, home: false, done: false };
    this.retarget(w, s);
    this.strays.push(s);
    this.total++;
    st.paused = true;
    w.events.emit('scenarioCue', st.def.product, s.x, s.z, 0, 1, st.index);
  }

  /** Run to a random spot in the yard, roughly in front of its pen. */
  private retarget(w: SimWorld, s: Stray): void {
    const t = w.stations[s.station].def.trough!, y = LAYOUT.yard, b = w.bounds;
    s.tx = clamp(w.rng.range(t.x - 5, t.x + 5), Math.max(y.x0, b.x0) + 0.6, Math.min(y.x1, b.x1) - 0.6);
    s.tz = clamp(w.rng.range(t.z + 1.5, t.z + 6), Math.max(y.z0, b.z0) + 0.6, Math.min(y.z1, b.z1) - 0.6);
  }

  update(w: SimWorld, dt: number): void {
    this.time += dt;
    if (w.scenario.phase === 'active' && this.total < MAX_STRAYS) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) { this.spawnT = SPAWN_EVERY; this.spawn(w); }
    }
    for (const s of this.strays) {
      if (s.done) continue;
      if (s.home) {
        const t = w.stations[s.station].def.trough!;
        if (moveToward(s, t.x, t.z, HOME_SPEED, dt, 0.2)) {
          s.done = true;
          if (!this.strays.some((x) => x.station === s.station && !x.done)) w.stations[s.station].paused = false;
          w.events.emit('scenarioCue', w.stations[s.station].def.product, s.x, s.z, 0, 2, s.station);
        }
        continue;
      }
      if (moveToward(s, s.tx, s.tz, RUN_SPEED, dt, 0.2)) this.retarget(w, s);
      if (dist(w.player.x, w.player.z, s.x, s.z) < REACH) s.home = true;
    }
    if (this.time > this.duration / 2 && this.strays.some((s) => !s.home)) this.quick = false;
  }

  goal(_w: SimWorld, g: ScenarioGoal): boolean | undefined {
    if (g !== 'herd') return undefined;
    return this.total > 0 && this.strays.every((s) => s.home);
  }

  progress(_w: SimWorld, g: ScenarioGoal): number {
    if (g !== 'herd' || !this.total) return 0;
    return this.strays.filter((s) => s.home).length / Math.max(this.total, MAX_STRAYS);
  }

  bonus(): boolean { return this.quick; }

  botTarget(w: SimWorld): { x: number; z: number } | null {
    let best: Stray | null = null, bd = Infinity;
    for (const s of this.strays) {
      if (s.home) continue;
      const d = dist(w.player.x, w.player.z, s.x, s.z);
      if (d < bd) { bd = d; best = s; }
    }
    return best ? { x: best.x, z: best.z } : null;
  }

  teardown(w: SimWorld): void {
    for (const st of w.stations) st.paused = false;
    this.strays = [];
  }
}
