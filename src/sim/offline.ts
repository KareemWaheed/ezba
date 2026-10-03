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
  // café money (tables, café cash pile, cleaners' hands) counts the same way
  const cafe0 = w.cafe.uncollected;
  const tables0 = w.cafe.tables.map((t) => [t.cash, t.bills]);
  const cafeCash0 = [w.cafe.cash.value, w.cafe.cash.bills];
  const cleaners0 = w.cafe.cleaners.map((c) => [c.carryCash, c.carryBills]);
  // grain stall money from hired drivers too
  const field0 = [w.field.cash.value, w.field.cash.bills];
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
  const raw = Math.max(0, w.money - money0 + w.cash.value - cash0 + w.cafe.uncollected - cafe0 + w.field.cash.value - field0[0]);
  w.field.cash.value = field0[0];
  w.field.cash.bills = field0[1];
  w.cafe.tables.forEach((t, i) => { t.cash = tables0[i][0]; t.bills = tables0[i][1]; });
  w.cafe.cash.value = cafeCash0[0];
  w.cafe.cash.bills = cafeCash0[1];
  w.cafe.cleaners.forEach((c, i) => { c.carryCash = cleaners0[i]?.[0] ?? 0; c.carryBills = cleaners0[i]?.[1] ?? 0; });
  // restore pre-away cash, then credit the reduced amount directly
  w.money = money0;
  w.cash.value = cash0;
  w.cash.bills = bills0;
  const earned = Math.floor(raw * ECONOMY.offline.efficiency);
  w.money += earned;
  w.stats.earned += earned;
  return { earned, raw, seconds: capped };
}
