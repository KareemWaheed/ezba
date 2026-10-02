import { LAYOUT } from '../config/layout';
import type { SimWorld } from './world';

/**
 * "Next useful action" for the guide arrow. Writes the target into `out` and returns true,
 * or returns false when there's nothing worth pointing at.
 * Pure: also usable by the simulated player.
 */
export function guideTarget(w: SimWorld, out: { x: number; z: number }): boolean {
  const c = w.carry, shop = LAYOUT.shop;
  const front = w.customers.front();
  // cash waiting and nothing urgent in hand
  if (w.cash.value > 0 && c.n === 0) { out.x = shop.cash.x; out.z = shop.cash.z; return true; }
  // someone is waiting at a stocked counter but nobody is serving
  if (!w.cashier && front && w.stations[front.station].counter > 0 && !w.canServe && c.n === 0) {
    out.x = shop.servePoint.x; out.z = shop.servePoint.z; return true;
  }
  // carrying: go drop it (full, or nothing left to grab)
  if (c.n > 0) {
    for (const s of w.stations) {
      if (!s.open || !c.has(s.def.product)) continue;
      const nearPile = s.pile > 0 && !c.full();
      if (!nearPile) { out.x = s.def.counter.dropX; out.z = s.def.counter.dropZ; return true; }
    }
  }
  // empty-handed (or still room): go pick up from the fullest pile
  let best = -1, bestN = 0;
  for (const s of w.stations) if (s.open && s.pile > bestN) { best = s.index; bestN = s.pile; }
  if (best >= 0 && !c.full()) { const d = w.stations[best].def; out.x = d.pile.x; out.z = d.pile.z; return true; }
  if (c.n > 0) {
    for (const s of w.stations) if (s.open && c.has(s.def.product)) { out.x = s.def.counter.dropX; out.z = s.def.counter.dropZ; return true; }
  }
  if (w.cash.value > 0) { out.x = shop.cash.x; out.z = shop.cash.z; return true; }
  return false;
}
