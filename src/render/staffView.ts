import * as THREE from 'three';
import { ECONOMY } from '../config/economy';
import { LAYOUT } from '../config/layout';
import type { SimWorld } from '../sim/world';
import type { Belt } from '../sim/staff';
import { CharacterView } from './character';
import { hatGeo } from './accessories';
import { CarrierView, easeOutBack } from './stacks';
import { MAT, PRIM, merge, part } from './geo';
import type { Flyers } from './flyers';

const WORKER = { shirt: 0xf28c38, pants: 0x3b4a6b, skin: 0xd9a074, hair: 0x1d1d1d };
const MECHANIC = { shirt: 0x2f5fa8, pants: 0x2f5fa8, skin: 0xc68a5a, hair: 0x1d1d1d };
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
    const r = belt.route;
    this.a.set(r.ax, 0.2, r.az);
    this.b.set(r.bx, 0.2, r.bz);
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

/**
 * Cable line (the corn's belt): a tower by the pile, cables over the coop to a tower behind the counter's end;
 * bundles ride up, along the cable, and down onto the counter.
 */
const SKY_H = 3.7;
class SkyBeltView {
  readonly mesh: THREE.Group;
  private A = new THREE.Vector3();
  private B = new THREE.Vector3();
  private end = new THREE.Vector3();

  constructor(scene: THREE.Scene, belt: Belt) {
    const r = belt.route, sky = r.sky!;
    this.A.set(sky.a.x, SKY_H, sky.a.z);
    this.B.set(sky.tower.x, SKY_H, sky.tower.z);
    this.end.set(r.bx, 1.15, r.bz);
    this.mesh = new THREE.Group();
    const dx = this.B.x - this.A.x, dz = this.B.z - this.A.z, L = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
    // towers: a mast, a cross arm with the pulleys, a little sign of the product on top
    for (const t of [this.A, this.B]) {
      const tower = new THREE.Mesh(merge([
        part(PRIM.box, 0xc9a227, 0, 0.12, 0, 0, 0, 0, 0.7, 0.24, 0.7),
        part(PRIM.box, 0xd94f45, 0, SKY_H / 2, 0, 0, 0, 0, 0.18, SKY_H, 0.18),
        part(PRIM.box, 0xd94f45, 0, SKY_H + 0.12, 0, 0, 0, 0, 0.9, 0.12, 0.16),
        part(PRIM.cyl, 0x2e3238, -0.3, SKY_H + 0.12, 0, 0, 0, Math.PI / 2, 0.16, 0.2, 0.16),
        part(PRIM.cyl, 0x2e3238, 0.3, SKY_H + 0.12, 0, 0, 0, Math.PI / 2, 0.16, 0.2, 0.16),
      ]), MAT);
      tower.position.set(t.x, 0, t.z);
      tower.rotation.y = yaw + Math.PI / 2;
      this.mesh.add(tower);
    }
    // two cables (out and back)
    const cables = new THREE.Mesh(merge([
      part(PRIM.box, 0x2e3238, -0.3, SKY_H + 0.12, 0, 0, 0, 0, 0.04, 0.04, L),
      part(PRIM.box, 0x2e3238, 0.3, SKY_H + 0.12, 0, 0, 0, 0, 0.04, 0.04, L),
    ]), MAT);
    cables.position.set((this.A.x + this.B.x) / 2, 0, (this.A.z + this.B.z) / 2);
    cables.rotation.y = yaw;
    this.mesh.add(cables);
    scene.add(this.mesh);
  }

  /** Where a bundle rides at k (0..1): up the first tower, along the cable, down onto the counter. */
  at(k: number, out: THREE.Vector3): THREE.Vector3 {
    if (k < 0.1) return out.set(this.A.x, 0.5 + (SKY_H - 0.85) * (k / 0.1), this.A.z);
    if (k > 0.9) return out.copy(this.B).setY(SKY_H - 0.35).lerp(this.end, (k - 0.9) / 0.1);
    const u = (k - 0.1) / 0.8;
    return out.copy(this.A).lerp(this.B, u).setY(SKY_H - 0.35 - 0.25 * Math.sin(Math.PI * u));
  }
}
const _sky = new THREE.Vector3();

/** Workers, the cashier and belts. */
export class StaffView {
  private workers: { char: CharacterView; stack: CarrierView }[] = [];
  private cashiers: CharacterView[] = [];
  private mechanics: CharacterView[] = [];
  private lanes: THREE.Object3D[] = [];
  private belts = new Map<number, BeltView>();
  private skies = new Map<number, SkyBeltView>();
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

    // mechanics: blue overalls and a yellow hard hat
    while (this.mechanics.length < staff.mechanics.length) {
      const c = new CharacterView(MECHANIC);
      c.attach(merge(hatGeo({ kind: 'hardhat', color: 0xf2c230 })));
      this.scene.add(c.root);
      this.pop(c.body, animate);
      this.mechanics.push(c);
    }
    staff.mechanics.forEach((m, i) => this.mechanics[i].update(m.x, m.z, m.rot, m.speed, dt, false));

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
      if (belt.route.sky) {
        let s = this.skies.get(belt.id);
        if (!s) { s = new SkyBeltView(this.scene, belt); this.skies.set(belt.id, s); this.pop(s.mesh, animate); }
        for (const it of belt.items) {
          if (!it.active) continue;
          s.at(it.t, _sky);
          flyers.put(it.item, _sky.x, _sky.y, _sky.z, 0, 0.8);
        }
        continue;
      }
      let v = this.belts.get(belt.id);
      if (!v) {
        v = new BeltView(this.scene, belt);
        this.belts.set(belt.id, v);
        this.pop(v.mesh, animate);
      }
      for (const it of belt.items) {
        if (!it.active) continue;
        const k = it.t, lift = k > 0.85 ? ((k - 0.85) / 0.15) * 0.8 : 0;
        flyers.put(it.item, v.a.x + (v.b.x - v.a.x) * k, v.a.y + lift, v.a.z + (v.b.z - v.a.z) * k, 0, 0.8);
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
