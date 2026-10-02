import * as THREE from 'three';
import { HR_WALLS, LAYOUT } from '../config/layout';
import { EMOJI } from './canvas';
import type { Box } from '../sim/math';
import { Rng } from '../sim/rng';
import { MAT, PRIM, Q4, merge, part } from './geo';

const { box, cyl, cone } = PRIM;

function ground(r: Box, color: number, y: number): THREE.BufferGeometry {
  return part(box, color, (r.x0 + r.x1) / 2, y - 0.01, (r.z0 + r.z1) / 2, 0, 0, 0, r.x1 - r.x0, 0.02, r.z1 - r.z0);
}

function fence(r: Box, out: THREE.BufferGeometry[]): void {
  const post = 0x9a6233, rail = 0xb87a45;
  for (let x = r.x0; x <= r.x1 + 0.01; x += 1) {
    out.push(part(box, post, x, 0.45, r.z0, 0, 0, 0, 0.14, 0.9, 0.14), part(box, post, x, 0.45, r.z1, 0, 0, 0, 0.14, 0.9, 0.14));
  }
  for (let z = r.z0 + 1; z < r.z1 - 0.01; z += 1) {
    out.push(part(box, post, r.x0, 0.45, z, 0, 0, 0, 0.14, 0.9, 0.14), part(box, post, r.x1, 0.45, z, 0, 0, 0, 0.14, 0.9, 0.14));
  }
  const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  for (const y of [0.35, 0.7]) {
    out.push(
      part(box, rail, cx, y, r.z0, 0, 0, 0, w, 0.1, 0.07), part(box, rail, cx, y, r.z1, 0, 0, 0, w, 0.1, 0.07),
      part(box, rail, r.x0, y, cz, 0, 0, 0, 0.07, 0.1, d), part(box, rail, r.x1, y, cz, 0, 0, 0, 0.07, 0.1, d),
    );
  }
}

function barn(x: number, z: number, out: THREE.BufferGeometry[]): void {
  out.push(
    part(box, 0xc8463c, x, 1.0, z, 0, 0, 0, 3.2, 2.0, 1.8),
    part(cyl, 0x7a3b2a, x, 2.0, z, 0, 0, Math.PI / 2, 1.12, 3.4, 1.12),
    part(box, 0xf3efe3, x, 0.8, z + 0.91, 0, 0, 0, 1.0, 1.4, 0.04),
  );
}

/** Static scenery merged into a single mesh. Returns the lock overlays of not-yet-unlocked areas. */
export function buildWorld(scene: THREE.Scene): Record<LockId, THREE.Group> {
  const g: THREE.BufferGeometry[] = [];
  const L = LAYOUT;
  g.push(part(box, 0x8fd14f, 0, -0.05, 0, 0, 0, 0, 160, 0.1, 160));
  g.push(ground(L.yard, 0xe9b06a, 0.005));
  g.push(ground(L.coop, 0xe6d07c, 0.012));
  g.push(ground(L.pen, 0x7cc044, 0.012));
  fence(L.coop, g);
  fence(L.pen, g);
  barn((L.coop.x0 + L.coop.x1) / 2, L.coop.z0 - 1.2, g);
  barn((L.pen.x0 + L.pen.x1) / 2, L.pen.z0 - 1.2, g);

  const rng = new Rng(7);
  for (const [x, z] of L.trees) {
    const s = rng.range(0.9, 1.3);
    g.push(
      part(cyl, 0x8a5a32, x, 0.6 * s, z, 0, 0, 0, 0.2 * s, 1.2 * s, 0.2 * s),
      part(cone, 0x4f9e3a, x, 1.9 * s, z, 0, 0, 0, 1.1 * s, 1.6 * s, 1.1 * s),
      part(cone, 0x5fb546, x, 2.7 * s, z, 0, 0, 0, 0.8 * s, 1.2 * s, 0.8 * s),
    );
  }
  for (const [x, z] of L.hay) g.push(part(cyl, 0xf0c75a, x, 0.5, z, 0, 0, Math.PI / 2, 0.5, 1.2, 0.5));

  // sell counter
  const c = L.counter, cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2, cw = c.x1 - c.x0;
  g.push(
    part(box, 0xd94f45, cx, 0.85, cz, 0, 0, 0, cw, 0.14, 1.0),
    part(box, 0xb83c33, cx, 0.48, cz + 0.46, 0, 0, 0, cw, 0.62, 0.08),
    ...Q4.map(([a, b]) => part(box, 0x7a3b2a, cx + a * (cw / 2 - 0.2), 0.4, cz + b * 0.38, 0, 0, 0, 0.14, 0.8, 0.14)),
  );

  // HR yard: paved ground, low brick walls with a gap for the gate, office building
  const y = L.hrYard, yb = y.box;
  g.push(ground(yb, 0xd8c8a0, 0.013));
  for (const s of HR_WALLS) {
    g.push(part(box, 0xb5653f, (s.x0 + s.x1) / 2, 0.5, (s.z0 + s.z1) / 2, 0, 0, 0, s.x1 - s.x0, 1.0, s.z1 - s.z0));
    g.push(part(box, 0xe0d4b8, (s.x0 + s.x1) / 2, 1.04, (s.z0 + s.z1) / 2, 0, 0, 0, s.x1 - s.x0 + 0.06, 0.08, s.z1 - s.z0 + 0.06));
  }
  for (const z of [y.gate.z0, y.gate.z1]) g.push(part(box, 0x8e4a2c, yb.x1 - 0.15, 0.7, z, 0, 0, 0, 0.4, 1.4, 0.4));
  const h = y.building, hx = (h.x0 + h.x1) / 2, hz = (h.z0 + h.z1) / 2, hw = h.x1 - h.x0, hd = h.z1 - h.z0;
  g.push(
    part(box, 0xf3e3c3, hx, 1.0, hz, 0, 0, 0, hw, 2.0, hd),
    part(box, 0x3d6fb6, hx, 2.15, hz, 0, 0, 0, hw + 0.3, 0.3, hd + 0.3),
    part(box, 0x2f5893, hx, 2.45, hz, 0, 0, 0, hw - 0.8, 0.3, hd - 0.4),
    part(box, 0x8a5a32, hx, 0.75, h.z1 + 0.01, 0, 0, 0, 0.9, 1.5, 0.04),
    part(box, 0x9fd3f0, hx - 1.5, 1.2, h.z1 + 0.01, 0, 0, 0, 0.8, 0.6, 0.04),
    part(box, 0x9fd3f0, hx + 1.5, 1.2, h.z1 + 0.01, 0, 0, 0, 0.8, 0.6, 0.04),
  );

  const mesh = new THREE.Mesh(merge(g), MAT);
  mesh.matrixAutoUpdate = false;
  scene.add(mesh);

  // locked areas: shaded overlay + padlock (+ a closed gate for the HR yard)
  const gate = new THREE.Mesh(merge([part(box, 0x9a6233, yb.x1 - 0.15, 0.55, (y.gate.z0 + y.gate.z1) / 2, 0, 0, 0, 0.12, 0.9, y.gate.z1 - y.gate.z0 - 0.4)]), MAT);
  return {
    pen: lockOverlay(scene, L.pen),
    hrYard: lockOverlay(scene, yb, gate),
  };
}

export type LockId = 'pen' | 'hrYard';

const LOCK_MAT = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });

function lockOverlay(scene: THREE.Scene, r: Box, extra?: THREE.Object3D): THREE.Group {
  const grp = new THREE.Group();
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0).rotateX(-Math.PI / 2), LOCK_MAT);
  shade.position.set((r.x0 + r.x1) / 2, 0.03, (r.z0 + r.z1) / 2);
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d')!;
  c.font = `96px ${EMOJI}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('🔒', 64, 70);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  const pad = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  pad.scale.set(1.8, 1.8, 1);
  pad.position.set((r.x0 + r.x1) / 2, 1.6, (r.z0 + r.z1) / 2);
  grp.add(shade, pad);
  if (extra) grp.add(extra);
  scene.add(grp);
  return grp;
}
