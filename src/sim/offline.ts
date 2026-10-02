import { ECONOMY } from '../config/economy';
import type { SimWorld } from './world';

/**
 * Time away: run the same sim forward with the player absent (no carrying, no serving, no tiles),
 * at a coarse step. Whatever staff and machines earn in that time is what the player gets,
 * so offline earnings always match real automated play. Returns the money earned.
 */
export function simulateAway(w: SimWorld, seconds: number, step = 0.5): number {
  const capped = Math.min(seconds, ECONOMY.offline.capSeconds);
  const before = w.money + w.cash.value;
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
  return Math.max(0, w.money + w.cash.value - before);
}
