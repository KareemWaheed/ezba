import type { ScenarioDef, ScenarioGoal } from '../../config/scenarios';
import { ECONOMY } from '../../config/economy';
import { LAYOUT } from '../../config/layout';
import { dist } from '../math';
import type { SimWorld } from '../world';
import type { Mechanic } from './mechanic';
import { plazaSpot } from './plaza';

/** A bundle of money on its way down: thrown from the helicopter at (fx, fz), lands at (x, z) when t reaches 0. */
export interface MoneyDrop { x: number; z: number; fx: number; fz: number; t: number; tMax: number }

/** Seconds between bundles, the fall time, and how close the player must be when one lands. */
const EVERY = 1.2;
const FALL = 2.6;
const CATCH_R = 1.2;
/** Bonus goal, and the third star. */
const GOAL = 8;
const PERFECT = 16;
/** A bundle is worth this many seconds of the farm's production (at least MIN). */
const WORTH = 3;
const MIN = 15;

/**
 * "Number one" throws money from a helicopter over the event square: bundles fall where their shadow
 * grows; be standing there when one lands to catch it (paid at once). A new kind of event: no customers,
 * just running for the drops.
 */
export class MoneyRainMechanic implements Mechanic {
  drops: MoneyDrop[] = [];
  caught = 0;
  missed = 0;
  /** The helicopter's spot over the square (drives the view; drops fall from below it). */
  heli = { x: 0, z: 20, a: 0 };
  private nextT = 1;

  start(_w: SimWorld, _def: ScenarioDef): void {
    const p = LAYOUT.plaza;
    this.heli.x = (p.x0 + p.x1) / 2;
    this.heli.z = (p.z0 + p.z1) / 2;
  }

  value(w: SimWorld): number { return Math.max(MIN, Math.round(w.perSec * WORTH)); }

  update(w: SimWorld, dt: number): void {
    const p = LAYOUT.plaza, h = this.heli;
    h.a += dt * 0.5;
    h.x = (p.x0 + p.x1) / 2 + Math.cos(h.a) * 5;
    h.z = (p.z0 + p.z1) / 2 + Math.sin(h.a) * 4;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t -= dt;
      if (d.t > 0) continue;
      this.drops.splice(i, 1);
      if (!w.away && dist(w.player.x, w.player.z, d.x, d.z) < CATCH_R) {
        this.caught++;
        const v = this.value(w);
        w.money += v;
        w.stats.earned += v;
        w.scenario.sales += v;
        w.events.emit('scenarioCue', '', d.x, d.z, v, 1, this.caught);
      } else {
        this.missed++;
        w.events.emit('scenarioCue', '', d.x, d.z, 0, 2);
      }
    }
    if (w.scenario.phase !== 'active') return;
    if ((this.nextT -= dt) > 0) return;
    this.nextT = EVERY;
    // somewhere open on the square, not right on top of the last few
    const s = plazaSpot(w, this.drops, 2);
    this.drops.push({ x: s.x, z: s.z, fx: h.x, fz: h.z, t: FALL, tMax: FALL });
  }

  goal(_w: SimWorld, g: ScenarioGoal): boolean | undefined {
    return g === 'cashCatch' ? this.caught >= GOAL : undefined;
  }

  progress(_w: SimWorld, g: ScenarioGoal): number { return g === 'cashCatch' ? Math.min(1, this.caught / GOAL) : 0; }

  bonus(): boolean { return this.caught >= PERFECT; }

  hudNote(): string { return `💵 مسكت ${this.caught}`; }

  /** The drop the player can still reach soonest. */
  botTarget(w: SimWorld): { x: number; z: number } | null {
    const p = w.player, sp = ECONOMY.player.speed * p.speedMult;
    let best: MoneyDrop | null = null;
    for (const d of this.drops) {
      if (dist(p.x, p.z, d.x, d.z) - CATCH_R > sp * d.t) continue;
      if (!best || d.t < best.t) best = d;
    }
    return best ? { x: best.x, z: best.z } : null;
  }

  teardown(): void {
    this.drops = [];
  }
}
