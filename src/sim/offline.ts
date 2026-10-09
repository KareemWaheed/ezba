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

/** Longest time away that earns money (8 h; the overseer, `away.cap`, raises it). */
export function awayCap(w: SimWorld): number {
  const O = ECONOMY.offline, lv = Math.min(w.upgrades.level('away.cap'), O.capLevels.length);
  return lv > 0 ? O.capLevels[lv - 1] : O.capSeconds;
}

/**
 * Time away: run the same sim forward with the player absent (no carrying, no serving, no tiles),
 * at a coarse step. Staff and machines keep working exactly as in real play; the player is
 * credited ECONOMY.offline.efficiency of what they earned (the cash it produced is taken back
 * out of the world and paid as one sum). Only the first `simSeconds` are simulated (a phone can't
 * tick a whole day on reopen): the rest is extrapolated at the earning rate of that run's second half.
 * Time beyond `fullSeconds` earns `lateFactor` of the rate.
 */
export function simulateAway(w: SimWorld, seconds: number, step = 0.5): AwayResult {
  const O = ECONOMY.offline;
  const capped = Math.min(seconds, awayCap(w)), simT = Math.min(capped, O.simSeconds);
  const money0 = w.money, cash0 = w.cash.value, bills0 = w.cash.bills;
  // café money (tables, café cash pile, cleaners' hands) counts the same way
  const cafe0 = w.cafe.uncollected;
  const tables0 = w.cafe.tables.map((t) => [t.cash, t.bills]);
  const cafeCash0 = [w.cafe.cash.value, w.cafe.cash.bills];
  const cleaners0 = w.cafe.cleaners.map((c) => [c.carryCash, c.carryBills]);
  // grain stall money from hired drivers too
  const field0 = [w.field.cash.value, w.field.cash.bills];
  const river0 = [w.river.cash.value, w.river.cash.bills];
  const market0 = [w.market.cash.value, w.market.cash.bills];
  const ix = w.input.x, iz = w.input.z;
  w.away = true;
  w.input.x = w.input.z = 0;
  const gained = () => w.money - money0 + w.cash.value - cash0 + w.cafe.uncollected - cafe0 + w.field.cash.value - field0[0] + w.river.cash.value - river0[0] + w.market.cash.value - market0[0];
  let t = simT, mid = 0, midSet = false;
  while (t > 1e-6) {
    const s = Math.min(step, t);
    w.tick(s);
    t -= s;
    if (!midSet && t <= simT / 2) { mid = gained(); midSet = true; }
  }
  w.away = false;
  w.input.x = ix;
  w.input.z = iz;
  const simRaw = Math.max(0, gained());
  // the rate for the rest: the mean of the second half's rate (the first minutes can be a burst of stock
  // already on the counters) and the whole run's (so one odd half-hour doesn't set a whole day's pay)
  const rate = simT > 0 ? (Math.max(0, simRaw - mid) / (simT / 2) + simRaw / simT) / 2 : 0;
  const raw = simRaw + rate * (capped - simT);
  w.market.cash.value = market0[0];
  w.market.cash.bills = market0[1];
  w.river.cash.value = river0[0];
  w.river.cash.bills = river0[1];
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
  // full rate up to `fullSeconds` (the simulated part included), `lateFactor` of it after
  const fullRaw = simRaw + rate * Math.max(0, Math.min(capped, O.fullSeconds) - simT);
  const lateRaw = rate * Math.max(0, capped - Math.max(simT, O.fullSeconds));
  const earned = Math.floor((fullRaw + lateRaw * O.lateFactor) * O.efficiency);
  w.money += earned;
  w.stats.earned += earned;
  return { earned, raw, seconds: capped };
}
