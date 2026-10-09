import * as THREE from 'three';
import { ECONOMY } from '../config/economy';
import type { SimWorld } from '../sim/world';
import { MAT, PRIM, merge, part } from './geo';
import type { PhysicsFx } from './physicsFx';
import { CharacterView } from './character';

/** Hired drivers wear the farm-staff outfit. */
const DRIVER = { shirt: 0xf28c38, pants: 0x3b4a6b, skin: 0xd9a074, hair: 0x1d1d1d };
const HAND = { shirt: 0x8fae5a, pants: 0x5a4632, skin: 0xb07a50, hair: 0x2a1a10 };

/** Hand sickle (the player's, and the hired field hands'). */
export const SICKLE_GEO = merge([
  part(PRIM.box, 0x8a5a32, 0, -0.12, 0.08, 0.3, 0, 0, 0.06, 0.06, 0.32),
  part(PRIM.box, 0xd9dde3, 0, -0.1, 0.32, 0, 0.5, 0, 0.04, 0.03, 0.3),
  part(PRIM.box, 0xd9dde3, 0.12, -0.1, 0.42, 0, 1.3, 0, 0.04, 0.03, 0.22),
]);

const { box, cyl, cylLo } = PRIM;


interface Model {
  /** Sprung part (bobs and tilts). */
  body: THREE.BufferGeometry;
  /** Wheels (stay on the ground). */
  wheels: THREE.BufferGeometry;
  /** Spinning part at the front (cutter / reel), pivot at its center. */
  spinner: THREE.BufferGeometry;
  spinnerAt: [number, number, number];
  /** Driver's seat (local, on the body). */
  seat: [number, number, number];
}

const wheel = (x: number, z: number, r: number, w: number) => part(cyl, 0x2b2b2b, x, r, z, 0, 0, Math.PI / 2, r, w, r);
const hub = (x: number, z: number, r: number) => part(cylLo, 0xf2c94c, x, r, z, 0, 0, Math.PI / 2, r * 0.45, 0.02 + Math.abs(x) * 0.0, r * 0.45);

/** Tractor body in a given paint (player: green, hired drivers: orange). */
function tractorBody(paint: number, dark: number): THREE.BufferGeometry {
  return merge([
      part(box, paint, 0, 0.75, 0.35, 0, 0, 0, 0.8, 0.6, 1.2),
      part(box, dark, 0, 1.08, 0.5, 0, 0, 0, 0.7, 0.08, 0.9),
      part(box, 0x333333, 0, 1.15, 0.85, 0, 0, 0, 0.12, 0.35, 0.12),
      part(box, paint, 0, 0.7, -0.45, 0, 0, 0, 1.1, 0.35, 0.8),
      part(box, 0x222222, 0, 1.0, -0.45, 0, 0, 0, 0.5, 0.12, 0.45),
      // cutter frame in front
      part(box, 0x777e88, 0, 0.35, 1.25, 0, 0, 0, 2.4, 0.12, 0.2),
  ]);
}

/** Low-poly vehicles, facing +z (the player's forward). */
const MODELS: Record<'tractor' | 'combine' | 'hired', Model> = {
  tractor: {
    body: tractorBody(0x3f9b4a, 0x2f7a39),
    wheels: merge([wheel(-0.62, -0.5, 0.55, 0.3), wheel(0.62, -0.5, 0.55, 0.3), wheel(-0.5, 0.7, 0.32, 0.22), wheel(0.5, 0.7, 0.32, 0.22),
      hub(-0.78, -0.5, 0.55), hub(0.78, -0.5, 0.55)]),
    spinner: merge([
      part(cyl, 0x9aa3ad, 0, 0, 0, 0, 0, Math.PI / 2, 0.12, 2.3, 0.12),
      ...[-0.9, -0.3, 0.3, 0.9].map((x) => part(box, 0xd9dde3, x, 0, 0, 0, 0, 0, 0.05, 0.36, 0.05)),
    ]),
    spinnerAt: [0, 0.3, 1.45],
    seat: [0, 0.7, -0.45],
  },
  combine: {
    body: merge([
      part(box, 0xc8463c, 0, 1.1, -0.2, 0, 0, 0, 1.7, 1.2, 2.6),
      part(box, 0xf2c94c, 0, 1.85, -0.6, 0, 0, 0, 1.5, 0.5, 1.4),
      part(box, 0x9fd3f0, 0, 2.15, 0.75, 0, 0, 0, 1.0, 0.8, 0.8),
      part(box, 0xc8463c, 0, 2.6, 0.75, 0, 0, 0, 1.1, 0.1, 0.9),
      part(cylLo, 0x9a9a9a, 0.95, 2.1, -0.9, 0.5, 0, 0.9, 0.08, 1.2, 0.08),
      // header (cutting table) in front
      part(box, 0xf2c94c, 0, 0.45, 1.65, 0, 0, 0, 3.6, 0.3, 0.6),
      part(box, 0xc8463c, -1.82, 0.65, 1.65, 0, 0, 0, 0.08, 0.6, 0.7),
      part(box, 0xc8463c, 1.82, 0.65, 1.65, 0, 0, 0, 0.08, 0.6, 0.7),
    ]),
    wheels: merge([wheel(-0.9, 0.5, 0.6, 0.35), wheel(0.9, 0.5, 0.6, 0.35), wheel(-0.85, -1.1, 0.4, 0.28), wheel(0.85, -1.1, 0.4, 0.28)]),
    spinner: merge([
      part(cyl, 0xd9a03a, 0, 0, 0, 0, 0, Math.PI / 2, 0.08, 3.5, 0.08),
      ...[0, 1, 2, 3, 4, 5].map((i) => part(box, 0xf2c94c, 0, Math.cos((i * Math.PI) / 3) * 0.3, Math.sin((i * Math.PI) / 3) * 0.3, (i * Math.PI) / 3, 0, 0, 3.4, 0.04, 0.08)),
    ]),
    spinnerAt: [0, 0.95, 1.75],
    seat: [0, 1.75, 0.75],
  },
  hired: null as unknown as Model,
};
MODELS.hired = { ...MODELS.tractor, body: tractorBody(0xf28c38, 0xc96a1f) };

/** One vehicle: root follows the player (or sits parked), body is sprung, spinner turns while cutting. */
class Vehicle {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly spinner: THREE.Mesh;
  /** Combine only: grain level in the tank (scaled 0..1 in y). */
  readonly grain: THREE.Mesh | null = null;

  constructor(scene: THREE.Scene, readonly m: Model, kind: 'tractor' | 'combine' | 'hired') {
    this.root.add(new THREE.Mesh(m.wheels, MAT), this.body);
    this.body.add(new THREE.Mesh(m.body, MAT));
    this.spinner = new THREE.Mesh(m.spinner, MAT);
    this.spinner.position.set(...m.spinnerAt);
    this.body.add(this.spinner);
    if (kind === 'combine') {
      this.grain = new THREE.Mesh(merge([part(box, 0xe2b955, 0, 0.5, 0, 0, 0, 0, 1.3, 1, 1.2)]), MAT);
      this.grain.position.set(0, 2.08, -0.6);
      this.body.add(this.grain);
    }
    this.root.visible = false;
    scene.add(this.root);
  }
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** The owned vehicle (best of tractor/combine): driven in the farmland, parked otherwise. */
export class VehicleView {
  private v: Record<'tractor' | 'combine', Vehicle>;
  private time = 0;
  private bob = 0;
  private hired: { veh: Vehicle; char: CharacterView }[] = [];
  private hands: { char: CharacterView; sickle: THREE.Mesh; load: THREE.Mesh }[] = [];

  constructor(private scene: THREE.Scene, private fx: PhysicsFx) {
    this.v = { tractor: new Vehicle(scene, MODELS.tractor, 'tractor'), combine: new Vehicle(scene, MODELS.combine, 'combine') };
  }

  /** Hired drivers: orange tractors with a seated farmhand; a light shake while driving. */
  private syncHired(sim: SimWorld, dt: number): void {
    const ds = sim.field.drivers;
    while (this.hired.length < ds.length) {
      const veh = new Vehicle(this.scene, MODELS.hired, 'hired');
      const char = new CharacterView(DRIVER);
      char.shadow.visible = false;
      this.scene.add(char.root);
      this.hired.push({ veh, char });
    }
    for (let i = 0; i < ds.length; i++) {
      const d = ds[i], h = this.hired[i];
      h.veh.root.visible = true;
      h.veh.root.position.set(d.x, 0, d.z);
      h.veh.root.rotation.y = d.rot;
      h.veh.body.position.y = d.speed > 0.3 ? Math.sin(this.time * 20 + i * 2) * 0.02 : 0;
      if (d.cutting > 0) h.veh.spinner.rotation.x -= dt * 14;
      h.char.update(d.x, d.z, d.rot, 0, dt, false, true);
      h.veh.body.updateWorldMatrix(true, false);
      h.char.root.position.copy(h.veh.body.localToWorld(_v.set(...h.veh.m.seat)));
    }
  }

  /** Field hands: farmhands with a sickle (swinging while cutting) and a bundle on the back when loaded. */
  private syncHands(sim: SimWorld, dt: number): void {
    const hs = sim.field.hands;
    while (this.hands.length < hs.length) {
      const char = new CharacterView(HAND);
      const sickle = char.attach(SICKLE_GEO, 'hand');
      const load = char.attach(merge([part(PRIM.box, 0xe6c35a, 0, 0.95, -0.22, 0.2, 0, 0, 0.32, 0.36, 0.2)]));
      this.scene.add(char.root);
      this.hands.push({ char, sickle, load });
    }
    for (let i = 0; i < hs.length; i++) {
      const d = hs[i], h = this.hands[i];
      h.char.update(d.x, d.z, d.rot, d.speed, dt, false);
      h.sickle.rotation.x = d.cutting > 0 ? Math.sin(this.time * 18 + i) * 0.9 : 0;
      h.load.visible = d.hopper > 0;
      h.load.scale.y = 0.5 + 0.5 * Math.min(1, d.hopper / sim.field.handStats().hopper);
    }
  }

  sync(sim: SimWorld, dt: number, rand: () => number): void {
    this.time += dt;
    this.syncHired(sim, dt);
    this.syncHands(sim, dt);
    const f = sim.field, kind = f.vehicle, p = sim.player;
    this.v.tractor.root.visible = kind === 'tractor';
    this.v.combine.root.visible = kind === 'combine';
    if (!kind) return;
    const v = this.v[kind];
    const x = f.driving ? p.x : f.parked.x, z = f.driving ? p.z : f.parked.z, rot = f.driving ? p.rot : f.parked.rot;
    v.root.position.set(x, 0, z);
    v.root.rotation.y = rot;
    const moving = f.driving && p.speed > 0.5;
    this.fx.update(dt, x, z, rot, moving, f.cutting > 0, rand);
    if (this.fx.ready) {
      v.body.position.copy(this.fx.offset);
      v.body.quaternion.copy(this.fx.tilt);
    } else {
      // fallback until physics loads: a gentle engine shake
      this.bob = moving ? Math.sin(this.time * 22) * 0.02 : 0;
      v.body.position.set(0, this.bob, 0);
      v.body.quaternion.identity();
    }
    if (f.cutting > 0) v.spinner.rotation.x -= dt * 14;
    if (v.grain) {
      const fill = f.hopperN / ECONOMY.field.combine.hopper;
      v.grain.visible = fill > 0.01;
      v.grain.scale.y = Math.max(0.02, fill);
    }
  }

  /** Seat the (already posed) driver on the current vehicle. */
  seat(driver: THREE.Object3D, kind: 'tractor' | 'combine'): void {
    const v = this.v[kind];
    v.body.updateWorldMatrix(true, false);
    driver.position.copy(v.body.localToWorld(_v.set(...v.m.seat)));
    driver.quaternion.copy(v.body.getWorldQuaternion(_q));
  }
}
