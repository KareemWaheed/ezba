export interface Box { x0: number; x1: number; z0: number; z1: number }
export interface Vec2 { x: number; z: number }

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

/** Shortest signed angle from a to b, in (-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  const d = b - a;
  return Math.atan2(Math.sin(d), Math.cos(d));
}

/** Push a circle out of every box, then clamp it inside the world bounds. Mutates p. */
export function resolveCircle(p: Vec2, r: number, solids: readonly Box[], bounds: Box): void {
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    const cx = clamp(p.x, s.x0, s.x1), cz = clamp(p.z, s.z0, s.z1);
    const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
    if (d >= r) continue;
    if (d > 1e-4) { p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r; continue; }
    // centre is inside the box: exit through the nearest face
    const l = p.x - s.x0, rr = s.x1 - p.x, t = p.z - s.z0, b = s.z1 - p.z;
    const m = Math.min(l, rr, t, b);
    if (m === l) p.x = s.x0 - r; else if (m === rr) p.x = s.x1 + r; else if (m === t) p.z = s.z0 - r; else p.z = s.z1 + r;
  }
  p.x = clamp(p.x, bounds.x0, bounds.x1);
  p.z = clamp(p.z, bounds.z0, bounds.z1);
}
