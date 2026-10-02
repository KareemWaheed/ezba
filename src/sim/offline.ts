import { ECONOMY } from '../config/economy';
import type { SimWorld } from './world';

export interface AwayResult {
  /** Money credited to the player (raw * efficiency). */
  earned: number;
  /** What automation produced in the simulated time, before the efficiency factor. */
  raw: number;
  /** Simulated seconds (after the cap). */
  seconds: number;
}

/**
 * Time away: run the same sim forward with the player absent (no carrying, no serving, no tiles),
 * at a coarse step. Staff and machines keep working exactly as in real play; the player is
 * credited ECONOMY.offline.efficiency of what they earned (the cash it produced is taken back
 * out of the world and paid as one sum).
 */
export function simulateAway(w: SimWorld, seconds: number, step = 0.5): AwayResult {
  const capped = Math.min(seconds, ECONOMY.offline.capSeconds);
  const money0 = w.money, cash0 = w.cash.value, bills0 = w.cash.bills;
  const ix = w.input.x, iz = w.input.z;
  w.away = true;
  w.input.x = w.input.z = 0;
  let t = capped;
  while (t > 1e-6) {
    const s = Math.min(step, t);
    w.tick(s);
    t -= s;
  }
  w.away = false;
  w.input.x = ix;
  w.input.z = iz;
  const raw = Math.max(0, w.money - money0 + w.cash.value - cash0);
  // restore pre-away cash, then credit the reduced amount directly
  w.money = money0;
  w.cash.value = cash0;
  w.cash.bills = bills0;
  const earned = Math.floor(raw * ECONOMY.offline.efficiency);
  w.money += earned;
  w.stats.earned += earned;
  return { earned, raw, seconds: capped };
}
