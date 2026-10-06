import { ECONOMY, type UpgradeId } from '../config/economy';
import { PRICE_CHANGES, PRICE_VERSION } from '../config/priceHistory';
import type { SimWorld } from './world';

export interface RefundLine { id: UpgradeId; amount: number }

/** The price of a track's level as it was at price version `pv` (the oldest change after it that lists it). */
function priceAt(w: SimWorld, id: UpgradeId, level: number, pv: number): number {
  let track: { base: number; growth: number } = ECONOMY.upgrades[id];
  let mult = w.path.costMult[id] ?? 1;
  let gotTrack = false, gotMult = false;
  for (const c of PRICE_CHANGES) {
    if (c.version <= pv) continue;
    if (!gotTrack && c.tracks[id]) { track = c.tracks[id]!; gotTrack = true; }
    const m = c.costMult?.[w.mode]?.[id];
    if (!gotMult && m !== undefined) { mult = m; gotMult = true; }
  }
  return Math.max(1, Math.round(Math.round(track.base * Math.pow(track.growth, level)) * mult));
}

/**
 * Upgrades that got cheaper since the save's price version: give back, per track, what the owned levels
 * cost then minus what they cost now (a track that got dearer costs nothing extra), plus any partial
 * payment beyond the next level's new price. Credits the money and returns the lines (empty if nothing).
 */
export function refundPriceDrops(w: SimWorld, pv: number): RefundLine[] {
  if (pv >= PRICE_VERSION) return [];
  const up = w.upgrades, lines: RefundLine[] = [];
  for (const id of Object.keys(up.levels) as UpgradeId[]) {
    if (!PRICE_CHANGES.some((c) => c.version > pv && (c.tracks[id] || c.costMult?.[w.mode]?.[id] !== undefined))) continue;
    // (levels a path starts with were free)
    const free = w.path.startLevels[id] ?? 0;
    let diff = 0;
    for (let l = free; l < up.levels[id]; l++) diff += priceAt(w, id, l, pv) - priceAt(w, id, l, PRICE_VERSION);
    let amount = Math.max(0, diff);
    // paid into the next level beyond its new price: the rest comes back (the level completes on the next step onto it)
    const next = up.cost(id);
    if (up.paid[id] > next) { amount += up.paid[id] - next; up.paid[id] = next; }
    if (amount > 0) lines.push({ id, amount });
  }
  for (const l of lines) w.money += l.amount;
  return lines;
}
