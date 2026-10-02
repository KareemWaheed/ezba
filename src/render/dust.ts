import * as THREE from 'three';
import { MAT, PRIM, merge, part } from './geo';

const MAX = 32;
const LIFE = 1 / 2.6;

/** Footstep dust puffs: one InstancedMesh ring buffer, no per-puff allocations. */
export class DustFx {
  readonly mesh: THREE.InstancedMesh;
  private t = new Float32Array(MAX).fill(1);
  private px = new Float32Array(MAX);
  private pz = new Float32Array(MAX);
  private next = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor() {
    const geo = merge([part(PRIM.sphLo, 0xf3dcb4, 0, 0, 0, 0, 0, 0, 1, 0.7, 1)]);
    this.mesh = new THREE.InstancedMesh(geo, MAT, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.s.set(0, 0, 0);
    for (let i = 0; i < MAX; i++) this.mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
  }

  /** Puff behind a character facing `rot`. `jitter` in [-1, 1] spreads puffs sideways. */
  emit(x: number, z: number, rot: number, jitter: number): void {
    const i = this.next; this.next = (this.next + 1) % MAX;
    this.t[i] = 0;
    this.px[i] = x - Math.sin(rot) * 0.25 + jitter * 0.12;
    this.pz[i] = z - Math.cos(rot) * 0.25;
  }

  update(dt: number): void {
    let dirty = false;
    for (let i = 0; i < MAX; i++) {
      if (this.t[i] >= 1) continue;
      const t = (this.t[i] = Math.min(1, this.t[i] + dt / LIFE));
      const sc = t >= 1 ? 0 : 0.16 + t * 0.12 - t * t * 0.26;
      this.mesh.setMatrixAt(i, this.m.compose(this.p.set(this.px[i], 0.08 + t * 0.2, this.pz[i]), this.q, this.s.setScalar(Math.max(0, sc))));
      dirty = true;
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
