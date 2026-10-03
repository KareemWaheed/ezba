import type { ScenarioDef, ScenarioGoal } from '../../config/scenarios';
import { ECONOMY } from '../../config/economy';
import { LAYOUT } from '../../config/layout';
import { dist, moveToward } from '../math';
import type { SimWorld } from '../world';
import type { Mechanic } from './mechanic';

export type CheckKind = 'trough' | 'machine' | 'table' | 'pile';

/** One stop on the inspector's route. `passed` is null until the inspector has looked at it. */
export interface Checkpoint { kind: CheckKind; ref: number; x: number; z: number; passed: boolean | null }

const WALK = 1.5;
const LOOK_TIME = 2;
const MAX_STOPS = 5;

/**
 * Health inspector: walks a route of checkpoints (troughs fed, machines running, tables clean, piles
 * not overflowing) and judges each one on arrival. The player has to get ahead of them and fix things.
 */
export class InspectorMechanic implements Mechanic {
  route: Checkpoint[] = [];
  /** Index of the checkpoint the inspector is heading to / looking at. */
  at = 0;
  x = 0; z = 0; rot = 0; speed = 0;
  /** Seconds left looking at the current checkpoint (0 = walking). */
  lookT = 0;

  start(w: SimWorld, _def: ScenarioDef): void {
    const e = LAYOUT.vipStage.entry;
    this.x = e.x; this.z = e.z;
    const stops: Checkpoint[] = [];
    // troughs always need the player
    for (const s of w.stations) {
      if (!s.open || !s.farmed || !s.def.trough) continue;
      s.boostT = 0;
      stops.push({ kind: 'trough', ref: s.index, x: s.def.trough.x, z: s.def.trough.z, passed: null });
    }
    // one machine jams right as the inspector walks in
    const running = w.staff.machines.filter((m) => m.running);
    if (running.length) {
      const m = running[w.rng.int(running.length)];
      m.broken = true;
      m.fixT = 0;
      w.events.emit('break', '', m.mx, m.mz, 0, 0, w.staff.machines.indexOf(m));
      stops.push({ kind: 'machine', ref: w.staff.machines.indexOf(m), x: m.mx, z: m.mz, passed: null });
    }
    // a messy café table
    if (w.cafe.open && w.cafe.tableCount > 0) {
      const i = w.rng.int(w.cafe.tableCount), t = w.cafe.tables[i];
      if (!t.occupant) t.dirty = true;
      stops.push({ kind: 'table', ref: i, x: t.x, z: t.z, passed: null });
    }
    // the fullest pile
    const piles = w.stations.filter((s) => s.open && s.farmed).sort((a, b) => b.pile - a.pile);
    if (piles.length) stops.push({ kind: 'pile', ref: piles[0].index, x: piles[0].def.pile.x, z: piles[0].def.pile.z, passed: null });
    // visit them nearest-first from the gate
    let cx = this.x, cz = this.z;
    while (stops.length && this.route.length < MAX_STOPS) {
      let bi = 0, bd = Infinity;
      stops.forEach((s, i) => { const d = dist(cx, cz, s.x, s.z); if (d < bd) { bd = d; bi = i; } });
      const s = stops.splice(bi, 1)[0];
      this.route.push(s);
      cx = s.x; cz = s.z;
    }
  }

  /** Is this checkpoint fine right now? */
  fine(w: SimWorld, c: Checkpoint): boolean {
    switch (c.kind) {
      case 'trough': return w.stations[c.ref].boostT > 0;
      case 'machine': return !w.staff.machines[c.ref].broken;
      case 'table': return !w.cafe.tables[c.ref].dirty;
      case 'pile': return w.stations[c.ref].pile < ECONOMY.pile.max * 0.8;
    }
  }

  update(w: SimWorld, dt: number): void {
    this.speed = 0;
    const c = this.route[this.at];
    if (!c) return;
    if (this.lookT > 0) {
      this.lookT -= dt;
      if (this.lookT <= 0) {
        c.passed = this.fine(w, c);
        w.events.emit('scenarioCue', '', c.x, c.z, 0, c.passed ? 1 : 2, this.at);
        this.at++;
      }
      return;
    }
    // stop a little in front of the spot
    if (moveToward(this, c.x, c.z + 1.0, WALK, dt, 0.3)) this.lookT = LOOK_TIME;
  }

  goal(w: SimWorld, g: ScenarioGoal): boolean | undefined {
    if (g !== 'checkpoints') return undefined;
    // not yet visited: judged by how things stand right now
    return this.route.length > 0 && this.route.every((c) => c.passed ?? this.fine(w, c));
  }

  progress(_w: SimWorld, g: ScenarioGoal): number {
    if (g !== 'checkpoints' || !this.route.length) return 0;
    return this.route.filter((c) => c.passed === true).length / this.route.length;
  }

  /** Perfect: the inspector made it round the whole route and liked everything. */
  bonus(): boolean { return this.at >= this.route.length && this.route.every((c) => c.passed === true); }

  /** The next checkpoint ahead of the inspector that still needs work. */
  botTarget(w: SimWorld): { x: number; z: number } | null {
    for (let i = this.at; i < this.route.length; i++) {
      const c = this.route[i];
      // a full pile only gets better by picking up, which needs free hands
      if (c.kind === 'pile' && w.carry.full()) continue;
      if (c.passed === null && !this.fine(w, c)) return { x: c.x, z: c.z };
    }
    return null;
  }

  teardown(): void {
    this.route = [];
  }
}
