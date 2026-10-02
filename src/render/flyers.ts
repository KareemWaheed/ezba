import * as THREE from 'three';
import { MAT } from './geo';
import { ITEM_GEO, type ItemKind } from './models';
import { ITEM_IDS } from '../config/economy';

const CAP = 160;
const KINDS: ItemKind[] = [...ITEM_IDS, 'bill'];

interface Flyer {
  active: boolean;
  kind: ItemKind;
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** If set, the flyer homes in on this (moving) point instead of `to`. */
  follow: THREE.Vector3 | null;
  t: number; dur: number; scale: number; arc: number; spin: number;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();

/**
 * Everything flying through the air, drawn as one InstancedMesh per item kind.
 * Each frame: begin() -> put() sim-driven items -> update() cosmetic flyers -> end().
 */
export class Flyers {
  private meshes = {} as Record<ItemKind, THREE.InstancedMesh>;
  private n = {} as Record<ItemKind, number>;
  private pool: Flyer[] = [];

  constructor(scene: THREE.Scene) {
    for (const k of KINDS) {
      const m = new THREE.InstancedMesh(ITEM_GEO[k], MAT, CAP);
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
      this.meshes[k] = m;
      this.n[k] = 0;
    }
    for (let i = 0; i < CAP; i++) {
      this.pool.push({ active: false, kind: 'bill', from: new THREE.Vector3(), to: new THREE.Vector3(), follow: null, t: 0, dur: 1, scale: 1, arc: 1.2, spin: 0 });
    }
  }

  /** Cosmetic flight (no gameplay effect). Silently dropped if the pool is exhausted. */
  launch(kind: ItemKind, from: THREE.Vector3, to: THREE.Vector3 | null, follow: THREE.Vector3 | null, dur: number, scale = 1, arc = 1.2, delay = 0): void {
    const f = this.pool.find((p) => !p.active);
    if (!f) return;
    f.active = true; f.kind = kind; f.from.copy(from);
    if (to) f.to.copy(to);
    f.follow = follow; f.t = -delay / dur; f.dur = dur; f.scale = scale; f.arc = arc; f.spin = 0;
  }

  begin(): void { for (const k of KINDS) this.n[k] = 0; }

  /** Draw one item this frame. */
  put(kind: ItemKind, x: number, y: number, z: number, rotY: number, scale: number): void {
    const i = this.n[kind];
    if (i >= CAP) return;
    _q.setFromEuler(_e.set(0, rotY, 0));
    this.meshes[kind].setMatrixAt(i, _m.compose(_p.set(x, y, z), _q, _s.set(scale, scale, scale)));
    this.n[kind] = i + 1;
  }

  /** Draw an arc from a to b at progress k (0..1). */
  putArc(kind: ItemKind, ax: number, ay: number, az: number, bx: number, by: number, bz: number, k: number, arc: number, scale: number): void {
    const y = ay + (by - ay) * k + Math.sin(k * Math.PI) * arc;
    this.put(kind, ax + (bx - ax) * k, y, az + (bz - az) * k, k * 8, scale);
  }

  update(dt: number): void {
    for (const f of this.pool) {
      if (!f.active) continue;
      f.t += dt / f.dur;
      const k = Math.max(0, Math.min(1, f.t)), to = f.follow ?? f.to;
      this.putArc(f.kind, f.from.x, f.from.y, f.from.z, to.x, to.y, to.z, k, f.arc, f.scale);
      if (f.t >= 1) f.active = false;
    }
  }

  end(): void {
    for (const k of KINDS) {
      const m = this.meshes[k];
      m.count = this.n[k];
      m.instanceMatrix.needsUpdate = true;
    }
  }
}
