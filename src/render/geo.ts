import * as THREE from 'three';

/**
 * Build-time helpers for low-poly, flat vertex-colored models.
 * Models are assembled from primitive "parts" and merged into one BufferGeometry each,
 * so a whole fence line or character torso is one draw call with one shared material.
 */

export const PRIM = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sph: new THREE.SphereGeometry(1, 10, 7),
  sphLo: new THREE.SphereGeometry(1, 7, 5),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  cylLo: new THREE.CylinderGeometry(1, 1, 1, 7),
  cone: new THREE.ConeGeometry(1, 1, 10),
};

/** The one material every merged model uses. */
export const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

/** A transformed, colored copy of a primitive. Build time only (allocates). */
export function part(
  geo: THREE.BufferGeometry, color: number,
  x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1,
): THREE.BufferGeometry {
  let g = geo.clone();
  _q.setFromEuler(_e.set(rx, ry, rz));
  g.applyMatrix4(_m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)));
  if (g.index) g = g.toNonIndexed();
  _c.setHex(color);
  const n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Merge parts (position/normal/color only) into one geometry. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let total = 0;
  for (const g of parts) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    col.set(g.attributes.color.array as Float32Array, o * 3);
    o += g.attributes.position.count;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

/** Four corners, handy for legs and table feet. */
export const Q4 = [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const;

/** Soft round contact shadow. */
const BLOB_GEO = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2);
const BLOB_MAT = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false });
export function blob(r: number): THREE.Mesh {
  const m = new THREE.Mesh(BLOB_GEO, BLOB_MAT);
  m.position.y = 0.02;
  m.scale.setScalar(r);
  return m;
}
