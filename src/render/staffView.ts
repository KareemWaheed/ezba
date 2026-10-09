import * as THREE from 'three';
import { ECONOMY } from '../config/economy';
import { LAYOUT } from '../config/layout';
import type { SimWorld } from '../sim/world';
import type { Belt } from '../sim/staff';
import { BELT_Y, SORTER_Y, type PathPoint } from '../config/stations';
import { CanvasSprite, FONT, rr } from './canvas';
import { CharacterView } from './character';
import { hatGeo } from './accessories';
import { CarrierView, easeOutBack } from './stacks';
import { MAT, PRIM, merge, part } from './geo';
import type { Flyers } from './flyers';

const WORKER = { shirt: 0xf28c38, pants: 0x3b4a6b, skin: 0xd9a074, hair: 0x1d1d1d };
const FEEDER = { shirt: 0x5e8f3a, pants: 0x6b4a2b, skin: 0xd9a074, hair: 0x1d1d1d };
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

const _sky = new THREE.Vector3();

/** A ground belt from a to b (y = belt top), as a mesh. */
function groundBelt(ax: number, az: number, bx: number, bz: number): THREE.Mesh {
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
  const parts = [part(PRIM.box, 0x4a4f57, 0, 0.08, 0, 0, 0, 0, 0.8, 0.12, L + 0.8)];
  for (let s = -L / 2; s < L / 2 + 0.3; s += 0.45) parts.push(part(PRIM.box, 0x777e88, 0, 0.15, s, 0, 0, 0, 0.82, 0.03, 0.12));
  // side rails in the farm's yellow: the main belts read as one line
  for (const e of [-0.42, 0.42]) parts.push(part(PRIM.box, 0xc9a227, e, 0.17, 0, 0, 0, 0, 0.06, 0.08, L + 0.8));
  const m = new THREE.Mesh(merge(parts), MAT);
  m.position.set((ax + bx) / 2, 0, (az + bz) / 2);
  m.rotation.y = Math.atan2(dx, dz);
  return m;
}

/** A cable-line mast from the ground up to h, with its pulley arm across `yaw`. */
function mast(x: number, z: number, h: number, yaw: number): THREE.Mesh {
  const m = new THREE.Mesh(merge([
    part(PRIM.box, 0xc9a227, 0, 0.12, 0, 0, 0, 0, 0.7, 0.24, 0.7),
    part(PRIM.box, 0xd94f45, 0, h / 2, 0, 0, 0, 0, 0.18, h, 0.18),
    part(PRIM.box, 0xd94f45, 0, h + 0.12, 0, 0, 0, 0, 0.9, 0.12, 0.16),
    part(PRIM.cyl, 0x2e3238, -0.3, h + 0.12, 0, 0, 0, Math.PI / 2, 0.16, 0.2, 0.16),
    part(PRIM.cyl, 0x2e3238, 0.3, h + 0.12, 0, 0, 0, Math.PI / 2, 0.16, 0.2, 0.16),
  ]), MAT);
  m.position.set(x, 0, z);
  m.rotation.y = yaw + Math.PI / 2;
  return m;
}

/**
 * The sorter (الفرّازة) at a counter end: a gantry on four thin legs over the walkway (people pass under it), the
 * machine up top with its hopper, and a chute down onto the counter's slots.
 */
function sorter(b: { x0: number; x1: number; z0: number; z1: number }, toward: number): THREE.Group {
  const g = new THREE.Group(), cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, w = b.x1 - b.x0, d = b.z1 - b.z0;
  const y = SORTER_Y, legs = [[b.x0 + 0.1, b.z0 + 0.1], [b.x1 - 0.1, b.z0 + 0.1], [b.x0 + 0.1, b.z1 - 0.1], [b.x1 - 0.1, b.z1 - 0.1]];
  g.add(new THREE.Mesh(merge([
    ...legs.map(([x, z]) => part(PRIM.box, 0x2f7a3c, x, (y - 0.3) / 2, z, 0, 0, 0, 0.1, y - 0.3, 0.1)),
    part(PRIM.box, 0x3f9d4f, cx, y, cz, 0, 0, 0, w, 0.6, d),
    part(PRIM.box, 0x2f7a3c, cx, y + 0.32, cz, 0, 0, 0, w + 0.06, 0.06, d + 0.06),
    // hopper on top, the chute down toward the counter, two lights
    part(PRIM.cone, 0xc9a227, cx, y + 0.75, cz, Math.PI, 0, 0, 0.55, 0.7, 0.55),
    part(PRIM.box, 0x777e88, cx + toward * (w / 2 + 0.35), y - 0.55, cz, 0, 0, toward * 0.9, 0.9, 0.06, 0.7),
    part(PRIM.sph, 0xff4d4d, cx - 0.4, y, b.z1 + 0.01, 0, 0, 0, 0.08, 0.08, 0.08),
    part(PRIM.sph, 0x4dff7a, cx + 0.4, y, b.z1 + 0.01, 0, 0, 0, 0.08, 0.08, 0.08),
  ]), MAT));
  const sign = new CanvasSprite(260, 80, 1.6);
  sign.draw((c, cw, ch) => {
    c.font = `800 40px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'rtl';
    c.fillStyle = 'rgba(47,122,60,0.92)'; rr(c, 6, 6, cw - 12, ch - 12, 20); c.fill();
    c.fillStyle = '#fff'; c.fillText('🔀 الفرّازة', cw / 2, ch / 2 + 2);
  });
  sign.sprite.position.set(cx, y + 1.5, cz);
  g.add(sign.sprite);
  return g;
}

/**
 * The main belts (LAYOUT.trunk): every station belt's path, drawn piece by piece; a piece several products share
 * (the main belt, the way down to the sorter) is drawn once. Ground pieces are belts, upright ones masts, high ones
 * cables; the sorter is drawn when the first belt reaching it is.
 */
class TrunkView {
  private drawn = new Set<string>();
  /** Per belt: its path and the distance along it at each point (for placing items). */
  readonly paths = new Map<number, { p: readonly PathPoint[]; s: number[] }>();

  constructor(private scene: THREE.Scene, private pop: (o: THREE.Object3D, animate: boolean) => void) {}

  private once(key: string, make: () => THREE.Object3D, animate: boolean): void {
    if (this.drawn.has(key)) return;
    this.drawn.add(key);
    const o = make();
    this.scene.add(o);
    this.pop(o, animate);
  }

  add(belt: Belt, animate: boolean): void {
    const p = belt.route.path!, s = [0];
    for (let i = 1; i < p.length; i++) s.push(s[i - 1] + Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y, p[i].z - p[i - 1].z));
    this.paths.set(belt.id, { p, s });
    const r = (v: number) => v.toFixed(2);
    // (first piece: off the pile or up the field mast; last: from the sorter onto the slot; both drawn by what's there)
    for (let i = 1; i < p.length - 1; i++) {
      const a = p[i - 1], b = p[i], key = `${r(a.x)},${r(a.y)},${r(a.z)}>${r(b.x)},${r(b.y)},${r(b.z)}`;
      const flat = Math.abs(a.y - BELT_Y) < 0.01 && Math.abs(b.y - BELT_Y) < 0.01;
      const upright = Math.hypot(b.x - a.x, b.z - a.z) < 0.01;
      if (flat) this.once(key, () => groundBelt(a.x, a.z, b.x, b.z), animate);
      else if (upright) this.once(`mast ${r(a.x)},${r(a.z)}`, () => mast(a.x, a.z, Math.max(a.y, b.y) + 0.35, Math.atan2(p[Math.min(i + 1, p.length - 1)].x - b.x, p[Math.min(i + 1, p.length - 1)].z - b.z)), animate);
      else if (a.y > 2 && b.y > 2) {
        this.once(key, () => {
          const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), y = a.y + 0.47;
          const m = new THREE.Mesh(merge([
            part(PRIM.box, 0x2e3238, -0.3, y, 0, 0, 0, 0, 0.04, 0.04, L),
            part(PRIM.box, 0x2e3238, 0.3, y, 0, 0, 0, 0, 0.04, 0.04, L),
          ]), MAT);
          m.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
          m.rotation.y = Math.atan2(dx, dz);
          return m;
        }, animate);
        // the field end's mast
        this.once(`mast ${r(a.x)},${r(a.z)}`, () => mast(a.x, a.z, a.y + 0.35, Math.atan2(b.x - a.x, b.z - a.z)), animate);
      }
    }
    const west = belt.route.bx < 0, T = LAYOUT.trunk;
    this.once(west ? 'westSorter' : 'eastSorter', () => sorter(west ? T.westSorter : T.eastSorter, west ? 1 : -1), animate);
  }

  /** Where an item rides at k (0..1) of its belt's path. */
  at(id: number, k: number, out: THREE.Vector3): THREE.Vector3 {
    const { p, s } = this.paths.get(id)!, d = k * s[s.length - 1];
    let i = 1;
    while (i < s.length - 1 && s[i] < d) i++;
    const u = s[i] > s[i - 1] ? Math.min(1, (d - s[i - 1]) / (s[i] - s[i - 1])) : 1;
    const a = p[i - 1], b = p[i];
    return out.set(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u);
  }
}

/** Workers, the cashier and belts. */
export class StaffView {
  private workers: { char: CharacterView; stack: CarrierView }[] = [];
  private cashiers: CharacterView[] = [];
  private mechanics: CharacterView[] = [];
  private feeders: CharacterView[] = [];
  private lanes: THREE.Object3D[] = [];
  private belts = new Map<number, BeltView>();
  private trunk: TrunkView;
  private pops: Popper[] = [];

  constructor(private scene: THREE.Scene) {
    this.trunk = new TrunkView(scene, (o, a) => this.pop(o, a));
  }

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
    // (workers sent home once their product's belt is built)
    this.workers.forEach((v, i) => { v.char.root.visible = i < staff.workers.length; });

    // mechanics: blue overalls and a yellow hard hat
    while (this.mechanics.length < staff.mechanics.length) {
      const c = new CharacterView(MECHANIC);
      c.attach(merge(hatGeo({ kind: 'hardhat', color: 0xf2c230 })));
      this.scene.add(c.root);
      this.pop(c.body, animate);
      this.mechanics.push(c);
    }
    staff.mechanics.forEach((m, i) => this.mechanics[i].update(m.x, m.z, m.rot, m.speed, dt, false));

    // feeders: green shirt, straw hat, a sack of feed on the back
    while (this.feeders.length < staff.feeders.length) {
      const c = new CharacterView(FEEDER);
      c.attach(merge([...hatGeo({ kind: 'straw', color: 0xe6c35a }), part(PRIM.box, 0xc9a66b, 0, 1.0, -0.3, 0.15, 0, 0, 0.36, 0.42, 0.22)]));
      this.scene.add(c.root);
      this.pop(c.body, animate);
      this.feeders.push(c);
    }
    staff.feeders.forEach((f, i) => this.feeders[i].update(f.x, f.z, f.rot, f.speed, dt, false));

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
      if (belt.route.path) {
        if (!this.trunk.paths.has(belt.id)) this.trunk.add(belt, animate);
        for (const it of belt.items) {
          if (!it.active) continue;
          this.trunk.at(belt.id, it.t, _sky);
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
