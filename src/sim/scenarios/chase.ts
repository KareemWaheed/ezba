import type { ScenarioDef, ScenarioGoal } from '../../config/scenarios';
import { ECONOMY } from '../../config/economy';
import { LAYOUT } from '../../config/layout';
import { dist, moveToward } from '../math';
import type { SimWorld } from '../world';
import type { Mechanic } from './mechanic';

/** Open ground the thief runs between (south of the counter: the yard and the event square). */
const WAYPOINTS: readonly { x: number; z: number }[] = [
  { x: -7, z: 6.5 }, { x: 0.5, z: 7.5 }, { x: 9, z: 6.5 }, { x: -6, z: 12.5 }, { x: 3, z: 13 }, { x: 10, z: 9 },
  { x: -7, z: 17 }, { x: 0, z: 16.5 }, { x: 6.5, z: 16.5 }, { x: -6, z: 25.5 }, { x: 1, z: 25.5 }, { x: 7, z: 24 },
];
const CATCH = 0.75;
/** Slightly faster than a player without speed upgrades. */
const SPEED_MULT = 1.08;
const STEAL = 0.3;
/** Caught: the money comes back plus this share as a thank-you. */
const BONUS = 0.5;
const QUICK = 20;

/**
 * A thief grabs money from the shop's cash pile and runs around the yard and the square. Catch him
 * (walk into him) and the police take him away; the money comes back with a bonus. The stolen money
 * is only taken off if he gets away at the end, so leaving the game mid-chase never loses anything.
 */
export class ChaseMechanic implements Mechanic {
  thief = { x: 0, z: 0, rot: 0, speed: 0 };
  stolen = 0;
  caught = false;
  /** Money actually lost (he got away). */
  lost = 0;
  private tx = 0; private tz = 0;
  private time = 0;
  private caughtAt = 0;

  start(w: SimWorld, _def: ScenarioDef): void {
    const c = LAYOUT.shop.cash;
    this.thief.x = c.x; this.thief.z = c.z + 0.6;
    this.stolen = Math.max(100, Math.round(w.cash.value * STEAL));
    this.pick(w);
  }

  /** Next spot: the waypoint farthest from the player among a few random ones. */
  private pick(w: SimWorld): void {
    let best = WAYPOINTS[0], bd = -1;
    for (let k = 0; k < 4; k++) {
      const p = WAYPOINTS[w.rng.int(WAYPOINTS.length)];
      const d = dist(p.x, p.z, w.player.x, w.player.z) - dist(p.x, p.z, this.thief.x, this.thief.z) * 0.3;
      if (d > bd) { bd = d; best = p; }
    }
    this.tx = best.x; this.tz = best.z;
  }

  update(w: SimWorld, dt: number): void {
    if (this.caught || w.scenario.phase !== 'active') return;
    this.time += dt;
    const speed = ECONOMY.player.speed * SPEED_MULT;
    if (moveToward(this.thief, this.tx, this.tz, speed, dt, 0.3)) this.pick(w);
    // the player is closing in from the front: turn away
    if (dist(w.player.x, w.player.z, this.tx, this.tz) < dist(this.thief.x, this.thief.z, this.tx, this.tz)) this.pick(w);
    if (dist(w.player.x, w.player.z, this.thief.x, this.thief.z) < CATCH && !w.away) {
      this.caught = true;
      this.caughtAt = this.time;
      const bonus = Math.round(this.stolen * BONUS);
      w.money += bonus;
      w.stats.earned += bonus;
      w.events.emit('scenarioCue', '', this.thief.x, this.thief.z, bonus, 1);
    }
  }

  goal(_w: SimWorld, g: ScenarioGoal): boolean | undefined {
    return g === 'catch' ? this.caught : undefined;
  }

  bonus(): boolean { return this.caught && this.caughtAt <= QUICK; }

  botTarget(): { x: number; z: number } | null { return this.caught ? null : { x: this.thief.x, z: this.thief.z }; }

  /** Event over: if he got away, the money goes with him (from the cash pile first). */
  teardown(w: SimWorld): void {
    if (this.caught || w.away || w.scenario.phase === 'warn' || this.stolen <= 0) { this.stolen = 0; return; }
    const fromCash = Math.min(w.cash.value, this.stolen);
    w.cash.value -= fromCash;
    const fromMoney = Math.min(w.money, this.stolen - fromCash);
    w.money -= fromMoney;
    this.lost = fromCash + fromMoney;
    this.stolen = 0;
  }
}
