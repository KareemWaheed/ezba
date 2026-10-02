import * as THREE from 'three';
import { MAT } from './geo';
import { ITEM_GEO, ITEM_H, type ItemKind } from './models';
import { ITEM_IDS, type ItemId } from '../config/economy';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();

export const easeOutBack = (x: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };

/** Slot layout: writes the local position of item i into out. */
export type SlotFn = (i: number, out: THREE.Vector3) => void;

/** Grid layout: cols x rows per layer, then the next layer on top. */
export function gridSlots(kind: ItemKind, cols: number, rows: number, spacing = 0.66): SlotFn {
  const per = cols * rows, h = ITEM_H[kind];
  return (i, out) => {
    const layer = Math.floor(i / per), s = i % per;
    out.set((s % cols - (cols - 1) / 2) * spacing, layer * h, (Math.floor(s / cols) - (rows - 1) / 2) * spacing);
  };
}

/**
 * A pile / counter / cash stack drawn as ONE InstancedMesh (one draw call regardless of count).
 * New items pop in with an overshoot; matrices are only rewritten while something animates.
 */
export class InstancedStack {
  readonly mesh: THREE.InstancedMesh;
  readonly group = new THREE.Group();
  private n = 0;
  private popT: Float32Array;
  private rot: Float32Array;
  private animating = false;

  constructor(kind: ItemKind, readonly max: number, private slot: SlotFn, x: number, y: number, z: number, rotJitter = 0, seed = 1) {
    this.mesh = new THREE.InstancedMesh(ITEM_GEO[kind], MAT, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.position.set(x, y, z);
    this.group.add(this.mesh);
    this.popT = new Float32Array(max).fill(1);
    this.rot = new Float32Array(max);
    let r = seed;
    for (let i = 0; i < max; i++) { r = (r * 16807) % 2147483647; this.rot[i] = ((r / 2147483647) * 2 - 1) * rotJitter; }
  }

  get count(): number { return this.n; }

  private write(i: number, sc: number): void {
    this.slot(i, _p);
    _q.setFromEuler(_e.set(0, this.rot[i], 0));
    this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s.set(sc, sc, sc)));
  }

  /** Show `count` items (clamped to max). New ones pop in unless pop=false. */
  set(count: number, pop = true): void {
    count = Math.max(0, Math.min(this.max, count));
    if (count === this.n) return;
    for (let i = this.n; i < count; i++) {
      this.popT[i] = pop ? 0 : 1;
      this.write(i, pop ? 0.01 : 1);
      if (pop) this.animating = true;
    }
    this.n = count;
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** World position of slot i (e.g. where a flying item should land). */
  slotWorld(i: number, out: THREE.Vector3): THREE.Vector3 {
    this.slot(Math.min(i, this.max - 1), out);
    return out.add(this.group.position);
  }

  update(dt: number): void {
    if (!this.animating) return;
    let any = false;
    for (let i = 0; i < this.n; i++) {
      if (this.popT[i] >= 1) continue;
      const t = (this.popT[i] = Math.min(1, this.popT[i] + dt * 5));
      this.write(i, t >= 1 ? 1 : Math.max(0.01, easeOutBack(t)));
      any = true;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.animating = any;
  }
}

const PRODUCTS: readonly ItemId[] = ITEM_IDS;

/**
 * The swaying tower carried by a character. One InstancedMesh per product type, parented to the
 * character so it follows for free. The sway is a damped spring driven by movement speed.
 */
export class CarrierView {
  readonly group = new THREE.Group();
  private meshes = new Map<ItemId, THREE.InstancedMesh>();
  private counts = new Map<ItemId, number>();
  private sway = 0;
  private sv = 0;
  private popT = new Float32Array(64).fill(1);
  private prevN = 0;
  height = 0;

  constructor(parent: THREE.Object3D, private cap = 24, scale = 1) {
    this.group.position.set(0, 0.78, 0.62);
    this.group.scale.setScalar(scale);
    parent.add(this.group);
    for (const p of PRODUCTS) {
      const m = new THREE.InstancedMesh(ITEM_GEO[p], MAT, cap);
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
      this.meshes.set(p, m);
      this.counts.set(p, 0);
    }
  }

  /** Ensure room for n items (rebuilds meshes only when capacity grows). */
  private ensure(n: number): void {
    if (n <= this.cap) return;
    this.cap = Math.max(n, this.cap * 2);
    for (const p of PRODUCTS) {
      const old = this.meshes.get(p)!;
      const m = new THREE.InstancedMesh(old.geometry, MAT, this.cap);
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.remove(old);
      old.dispose();
      this.group.add(m);
      this.meshes.set(p, m);
    }
    if (this.popT.length < this.cap) { const t = new Float32Array(this.cap).fill(1); t.set(this.popT); this.popT = t; }
  }

  dispose(): void { for (const m of this.meshes.values()) m.dispose(); }

  /** `items` bottom-first; `motion` 0..1 drives the sway. */
  update(items: readonly ItemId[], motion: number, dt: number): void {
    const n = items.length;
    this.ensure(n);
    if (n > this.prevN) for (let i = this.prevN; i < n; i++) this.popT[i] = 0;
    this.prevN = n;

    const k = 60, damp = Math.pow(0.86, dt * 60);
    this.sv += (motion - this.sway) * k * dt;
    this.sv *= damp;
    this.sway += this.sv * dt;

    for (const p of PRODUCTS) this.counts.set(p, 0);
    let y = 0;
    for (let i = 0; i < n; i++) {
      const p = items[i], m = this.meshes.get(p)!, idx = this.counts.get(p)!;
      this.counts.set(p, idx + 1);
      let sc = 1;
      if (this.popT[i] < 1) { this.popT[i] = Math.min(1, this.popT[i] + dt * 6); sc = Math.max(0.01, easeOutBack(this.popT[i])); }
      _q.setFromEuler(_e.set(-this.sway * i * 0.012, 0, 0));
      m.setMatrixAt(idx, _m.compose(_p.set(0, y, -this.sway * Math.pow(i, 1.4) * 0.035), _q, _s.set(sc, sc, sc)));
      y += ITEM_H[p];
    }
    this.height = y;
    for (const p of PRODUCTS) {
      const m = this.meshes.get(p)!;
      m.count = this.counts.get(p)!;
      m.instanceMatrix.needsUpdate = true;
    }
  }
}
