import { LAYOUT } from '../../config/layout';
import { dist } from '../math';
import type { SimWorld } from '../world';

/** Clear of every solid by this much (a player fits next to it). */
const MARGIN = 0.7;

/** Is (x, z) open ground the player can stand on? */
export function openGround(w: SimWorld, x: number, z: number): boolean {
  for (const b of w.solids) if (x > b.x0 - MARGIN && x < b.x1 + MARGIN && z > b.z0 - MARGIN && z < b.z1 + MARGIN) return false;
  return true;
}

/**
 * A random open spot on the event square, at least `gap` from every spot in `avoid` (best effort: after
 * a few tries the farthest candidate wins).
 */
export function plazaSpot(w: SimWorld, avoid: readonly { x: number; z: number }[] = [], gap = 0): { x: number; z: number } {
  const p = LAYOUT.plaza;
  let best = { x: (p.x0 + p.x1) / 2, z: (p.z0 + p.z1) / 2 }, bestD = -1;
  for (let k = 0; k < 24; k++) {
    const x = w.rng.range(p.x0 + 1, p.x1 - 1), z = w.rng.range(p.z0 + 1, p.z1 - 1);
    if (!openGround(w, x, z)) continue;
    let d = Infinity;
    for (const a of avoid) d = Math.min(d, dist(x, z, a.x, a.z));
    if (d >= gap) return { x, z };
    if (d > bestD) { bestD = d; best = { x, z }; }
  }
  return best;
}
