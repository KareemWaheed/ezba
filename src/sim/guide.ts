import { LAYOUT } from '../config/layout';
import { CAFE } from '../config/cafe';
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
  // the scenario guest waiting at the VIP stage: bring their order in person
  if (vipDelivery(w, out)) return true;
  // things only the player can do come first: VIPs, jammed machines, golden animals
  for (let i = 0; i < w.lanes; i++) {
    const f = w.customers.front(i);
    if (f && f.kind !== 'normal') { out.x = LAYOUT.shop.lanes[i].x; out.z = LAYOUT.shop.serveZ; return true; }
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
  if (cafeAction(w, out)) return true;
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

/** Teaches the café loop until the first few café customers are served. */
const CAFE_TUTORIAL = 8;

function cafeAction(w: SimWorld, out: { x: number; z: number }): boolean {
  const cafe = w.cafe, c = w.carry;
  if (!cafe.open || w.stats.cafeServed >= CAFE_TUTORIAL) return false;
  const serve = CAFE.counter.serve;
  const go = (x: number, z: number) => { out.x = x; out.z = z; return true; };
  // 1) carrying dishes: put them on the café counter
  if (c.items.some((it) => it in cafe.counter)) return go(serve.x, serve.z);
  // 2) the first customer can be served right now: stand at the counter
  const front = cafe.customers.find((x) => x.state === 'queue');
  let freeTable = false;
  for (let i = 0; i < cafe.tableCount; i++) if (!cafe.tables[i].occupant && !cafe.tables[i].dirty) freeTable = true;
  if (front && !cafe.waiter && (front.table >= 0 || freeTable) && front.lines.some((l) => l.left > 0 && cafe.counter[l.product] > 0)) return go(serve.x, serve.z);
  // 3) no clean table left: clean one
  if (!freeTable) {
    for (let i = 0; i < cafe.tableCount; i++) {
      const t = cafe.tables[i];
      if (t.dirty && !t.occupant) return go(t.x, t.z);
    }
  }
  // 4) cooked dishes the counter is short of
  if (!c.full()) for (const r of cafe.stove.active(w)) if (cafe.stove.output[r.output] > 0 && cafe.counter[r.output] < 4) return go(CAFE.stove.output.x, CAFE.stove.output.z);
  // 5) stove running low on what's missing: bring eggs/milk (carrying some already -> straight to the stove)
  for (const r of cafe.stove.active(w)) {
    const raw = r.needs;
    if (cafe.stove.input[raw] >= 4 || cafe.counter[r.output] >= 4) continue;
    if (c.items.includes(raw)) return go(CAFE.stove.input.x, CAFE.stove.input.z);
    const st = w.stations.find((x) => x.def.product === raw && x.open && x.pile > 0);
    if (st && !c.full()) return go(st.def.pile.x, st.def.pile.z);
  }
  // 6) money or mess left on tables
  for (let i = 0; i < cafe.tableCount; i++) {
    const t = cafe.tables[i];
    if (t.dirty || t.cash > 0) return go(t.x, t.z);
  }
  return false;
}

/** Guest waiting on the VIP stage: go to the stage with their items, or fetch them from a pile. */
export function vipDelivery(w: SimWorld, out: { x: number; z: number }): boolean {
  const g = w.scenario.guest;
  if (!g || g.state !== 'order') return false;
  const c = w.carry;
  const need = g.lines.filter((l) => l.left > 0);
  if (need.some((l) => c.has(l.product)) && (c.full() || need.every((l) => c.items.filter((x) => x === l.product).length >= l.left))) {
    out.x = LAYOUT.vipStage.drop.x; out.z = LAYOUT.vipStage.drop.z; return true;
  }
  for (const l of need) {
    if (c.full() || w.scenario.stillNeeds(l.product) <= 0) continue;
    const st = w.stations.find((s) => s.open && s.def.product === l.product && s.pile >= 2);
    if (st) { out.x = st.def.pile.x; out.z = st.def.pile.z; return true; }
    // piles drained by belts: take it from the shop counter (works while the guest waits)
    const ct = w.stations.find((s) => s.open && s.def.product === l.product && s.counter > 0 && !c.has(l.product));
    if (ct) { out.x = ct.def.counter.dropX; out.z = ct.def.counter.dropZ; return true; }
  }
  if (need.some((l) => c.has(l.product))) { out.x = LAYOUT.vipStage.drop.x; out.z = LAYOUT.vipStage.drop.z; return true; }
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
