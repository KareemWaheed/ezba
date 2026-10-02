import { LAYOUT } from '../config/layout';
import { UPGRADES, type UpgradeDef } from '../config/upgrades';
import type { SimWorld } from './world';

/** After this many upgrades the arrow only points at affordable upgrades. */
const EARLY_UPGRADES = 4;

/**
 * Guide arrow target: the cheapest affordable upgrade, else (early game) the next loop step.
 * Writes the target into `out` and returns true, or false when there's nothing worth pointing at.
 * Pure: also usable by the simulated player.
 */
export function guideTarget(w: SimWorld, out: { x: number; z: number }): boolean {
  // things only the player can do come first: VIPs, jammed machines, golden animals
  for (let i = 0; i < w.lanes; i++) {
    const f = w.customers.front(i);
    if (f && f.kind === 'vip') { out.x = LAYOUT.shop.lanes[i].x; out.z = LAYOUT.shop.serveZ; return true; }
  }
  for (const b of w.staff.belts) if (b.broken) { out.x = b.mx; out.z = b.mz; return true; }
  const g = w.golden.animal;
  if (g) { out.x = g.x; out.z = g.z; return true; }
  // the cheapest upgrade the player can afford right now
  const up = w.upgrades;
  let best: UpgradeDef | null = null, bestR = Infinity;
  for (const t of up.tiles) {
    const r = up.remaining(t.def.id);
    if (r <= w.money && r < bestR) { best = t.def; bestR = r; }
  }
  if (best) { out.x = best.pos.x; out.z = best.pos.z; return true; }
  if (up.bought >= EARLY_UPGRADES) return false;
  return nextAction(w, out);
}

/** Early-game hint: the next step of the carry-and-sell loop. */
export function nextAction(w: SimWorld, out: { x: number; z: number }): boolean {
  const c = w.carry, shop = LAYOUT.shop;
  // cash waiting and nothing urgent in hand
  if (w.cash.value > 0 && c.n === 0) { out.x = shop.cash.x; out.z = shop.cash.z; return true; }
  // someone is waiting at a stocked counter but nobody is serving their lane
  const lane = unservedLane(w);
  if (lane >= 0 && c.n === 0) { out.x = shop.lanes[lane].x; out.z = shop.serveZ; return true; }
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

export interface Goal { def: UpgradeDef; cost: number; remaining: number }

/**
 * The 'next goal' for the HUD card: the cheapest big unlock not bought yet (a milestone at level 0),
 * otherwise the cheapest tile the player can't afford yet. Null when nothing qualifies.
 */
export function nextGoal(w: SimWorld): Goal | null {
  const up = w.upgrades;
  let pick: UpgradeDef | null = null, pickC = Infinity;
  for (const d of UPGRADES) {
    if (!d.milestone || up.level(d.id) > 0 || !up.available(d)) continue;
    const r = up.remaining(d.id);
    if (r < pickC) { pick = d; pickC = r; }
  }
  if (!pick) {
    let bestC = Infinity;
    for (const t of up.tiles) {
      const r = up.remaining(t.def.id);
      if (r > w.money && r < bestC) { pick = t.def; bestC = r; }
    }
  }
  if (!pick) return null;
  return { def: pick, cost: up.cost(pick.id), remaining: up.remaining(pick.id) };
}

/** A lane whose front customer could buy (stock on the counter) but nobody is serving it; -1 if none. */
export function unservedLane(w: SimWorld): number {
  for (let i = 0; i < w.lanes; i++) {
    const f = w.customers.front(i);
    if (f && w.customers.takeable(f) && !w.laneServed(i)) return i;
  }
  return -1;
}
