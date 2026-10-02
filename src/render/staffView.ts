import * as THREE from 'three';
import { ECONOMY } from '../config/economy';
import { LAYOUT } from '../config/layout';
import type { SimWorld } from '../sim/world';
import type { Belt } from '../sim/staff';
import { CharacterView } from './character';
import { CarrierView, easeOutBack } from './stacks';
import { MAT, PRIM, merge, part } from './geo';
import type { Flyers } from './flyers';

const WORKER = { shirt: 0xf28c38, pants: 0x3b4a6b, skin: 0xd9a074, hair: 0x1d1d1d };
const CASHIER = { shirt: 0x3fae5a, pants: 0x2e2e2e, skin: 0xf1c7a0, hair: 0x8b4513 };

interface Popper { obj: THREE.Object3D; t: number }

/** Register on the counter + rope posts along the customer line (local to the lane's x). */
const LANE_GEO = (() => {
  const c = LAYOUT.counter, cz = (c.z0 + c.z1) / 2, q = LAYOUT.shop;
  const parts = [
    part(PRIM.box, 0x5ec6d0, 0, 1.08, cz + 0.05, 0, 0, 0, 0.45, 0.3, 0.35),
    part(PRIM.box, 0x2b2b2b, 0, 1.24, cz - 0.05, -0.4, 0, 0, 0.38, 0.04, 0.2),
  ];
  for (const side of [-0.75, 0.75]) {
    for (let k = 0; k < 3; k++) {
      const z = q.queueZ + 0.2 + k * 1.4;
      parts.push(part(PRIM.cyl, 0xc9a227, side, 0.4, z, 0, 0, 0, 0.05, 0.8, 0.05));
      if (k < 2) parts.push(part(PRIM.box, 0xd94f45, side, 0.72, z + 0.7, 0, 0, 0, 0.04, 0.05, 1.4));
    }
  }
  return merge(parts);
})();

/** Belt geometry + where items ride on it. */
class BeltView {
  readonly a = new THREE.Vector3();
  readonly b = new THREE.Vector3();
  readonly mesh: THREE.Mesh;

  constructor(scene: THREE.Scene, belt: Belt) {
    const d = belt.station.def;
    this.a.set(d.pile.x, 0.2, d.pile.z + 0.9);
    this.b.set(d.counter.x, 0.2, LAYOUT.counter.z0 - 0.15);
    const dx = this.b.x - this.a.x, dz = this.b.z - this.a.z, L = Math.hypot(dx, dz);
    const parts = [part(PRIM.box, 0x4a4f57, 0, 0.08, 0, 0, 0, 0, 0.8, 0.12, L)];
    for (let s = -L / 2 + 0.2; s < L / 2; s += 0.45) parts.push(part(PRIM.box, 0x777e88, 0, 0.15, s, 0, 0, 0, 0.82, 0.03, 0.12));
    for (const e of [-1, 1]) parts.push(part(PRIM.cyl, 0x2e3238, 0, 0.1, (e * L) / 2, 0, 0, Math.PI / 2, 0.12, 0.84, 0.12));
    this.mesh = new THREE.Mesh(merge(parts), MAT);
    this.mesh.position.set((this.a.x + this.b.x) / 2, 0, (this.a.z + this.b.z) / 2);
    this.mesh.rotation.y = Math.atan2(dx, dz);
    scene.add(this.mesh);
  }
}

/** Workers, the cashier and belts. */
export class StaffView {
  private workers: { char: CharacterView; stack: CarrierView }[] = [];
  private cashiers: CharacterView[] = [];
  private lanes: THREE.Object3D[] = [];
  private belts = new Map<number, BeltView>();
  private pops: Popper[] = [];

  constructor(private scene: THREE.Scene) {}

  private pop(obj: THREE.Object3D, animate: boolean): void {
    if (!animate) return;
    obj.scale.setScalar(0.01);
    this.pops.push({ obj, t: 0 });
  }

  sync(sim: SimWorld, dt: number, flyers: Flyers, animate: boolean): void {
    const staff = sim.staff;
    while (this.workers.length < staff.workers.length) {
      const char = new CharacterView(WORKER);
      const stack = new CarrierView(char.root, 16);
      this.scene.add(char.root);
      this.pop(char.body, animate);
      this.workers.push({ char, stack });
    }
    staff.workers.forEach((w, i) => {
      const v = this.workers[i];
      v.char.update(w.x, w.z, w.rot, w.speed, dt, w.carry.n > 0);
      v.stack.update(w.carry.items, Math.min(1, w.speed / ECONOMY.staff.worker.speed), dt);
    });

    // checkout lanes: a register on the counter and a rope line on the ground
    while (this.lanes.length < sim.lanes) {
      const i = this.lanes.length, x = LAYOUT.shop.lanes[i].x;
      const lane = new THREE.Mesh(LANE_GEO, MAT);
      lane.position.set(x, 0, 0);
      this.scene.add(lane);
      this.pop(lane, animate && i > 0);
      this.lanes.push(lane);
    }
    while (this.cashiers.length < sim.cashiers) {
      const c = new CharacterView(CASHIER);
      this.scene.add(c.root);
      this.pop(c.body, animate);
      this.cashiers.push(c);
    }
    this.cashiers.forEach((c, i) => c.update(LAYOUT.shop.lanes[i].x, LAYOUT.shop.serveZ + 0.05, 0, 0, dt, false));

    for (const belt of staff.belts) {
      if (belt.level <= 0) continue;
      let v = this.belts.get(belt.station.index);
      if (!v) {
        v = new BeltView(this.scene, belt);
        this.belts.set(belt.station.index, v);
        this.pop(v.mesh, animate);
      }
      const product = belt.station.def.product;
      for (const it of belt.items) {
        if (!it.active) continue;
        const k = it.t, lift = k > 0.85 ? ((k - 0.85) / 0.15) * 0.8 : 0;
        flyers.put(product, v.a.x + (v.b.x - v.a.x) * k, v.a.y + lift, v.a.z + (v.b.z - v.a.z) * k, 0, 0.8);
      }
    }

    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t = Math.min(1, p.t + dt * 4);
      p.obj.scale.setScalar(p.t >= 1 ? 1 : Math.max(0.01, easeOutBack(p.t)));
      if (p.t >= 1) this.pops.splice(i, 1);
    }
  }
}
