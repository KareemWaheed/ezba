import * as THREE from 'three';
import { FLAGS, GUEST_LOOKS, CROWD_LOOKS, type FlagDef, type FlagId, type GuestLook } from '../config/looks';
import type { ScenarioDef, ScenarioProp } from '../config/scenarios';
import { LAYOUT } from '../config/layout';
import type { SimWorld } from '../sim/world';
import type { Renderer } from './renderer';
import { MAT, PRIM, merge, part } from './geo';
import { CharacterView } from './character';
import { bodyAccessories, handProp } from './accessories';
import { CustomerView } from './customers';
import { CanvasSprite, EMOJI, FONT, rr } from './canvas';
import { ITEM_GEO } from './models';
import type { ItemId } from '../config/economy';

const { box, cyl, sph } = PRIM;

/** Where flags go up around the farm when an event has a flag. */
const FLAG_SPOTS: readonly [number, number][] = [
  [-6.6, 5.2], [-6.6, 9.0], [6.2, 7.0], [9.2, 9.6], [-4.4, 13.0], [4.0, 13.0],
  [-1.2, -1.7], [7.6, -1.7], [11.6, 5.8], [11.6, 10.4], [-8.2, 0.8], [2.2, 9.8],
];

/** Draw a flag (stripes + canton/emblem) to a canvas texture. Cached per flag id. */
const FLAG_TEX = new Map<FlagId, THREE.CanvasTexture>();
function flagTexture(id: FlagId): THREE.CanvasTexture {
  let t = FLAG_TEX.get(id);
  if (t) return t;
  const f: FlagDef = FLAGS[id];
  const cv = document.createElement('canvas');
  cv.width = 192; cv.height = 128;
  const c = cv.getContext('2d')!;
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  const n = f.stripes.length;
  f.stripes.forEach((col, i) => {
    c.fillStyle = hex(col);
    if (f.vertical) c.fillRect((i * 192) / n, 0, 192 / n + 1, 128);
    else c.fillRect(0, (i * 128) / n, 192, 128 / n + 1);
  });
  if (f.canton !== undefined) {
    c.fillStyle = hex(f.canton);
    c.fillRect(0, 0, 84, 70);
    c.fillStyle = '#ffffff';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 5; x++) { c.beginPath(); c.arc(10 + x * 16 + (y % 2) * 6, 10 + y * 16, 3, 0, Math.PI * 2); c.fill(); }
  }
  if (f.emblem) {
    c.fillStyle = hex(f.emblem.color);
    c.beginPath();
    if (f.emblem.shape === 'eagle') { c.moveTo(96, 46); c.lineTo(112, 70); c.lineTo(96, 84); c.lineTo(80, 70); c.closePath(); }
    else c.arc(96, 64, 22, 0, Math.PI * 2);
    c.fill();
    if (f.emblem.shape === 'crescent') { c.fillStyle = hex(f.stripes[0]); c.beginPath(); c.arc(104, 64, 18, 0, Math.PI * 2); c.fill(); }
  }
  t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  FLAG_TEX.set(id, t);
  return t;
}

const POLE_GEO = merge([part(cyl, 0xdddddd, 0, 1.4, 0, 0, 0, 0, 0.04, 2.8, 0.04), part(sph, 0xd9b44a, 0, 2.82, 0, 0, 0, 0, 0.07, 0.07, 0.07)]);
const CLOTH_GEO = new THREE.PlaneGeometry(1.0, 0.66).translate(0.5, 0, 0);

const CAR_GEO = merge([
  part(box, 0x15171c, 0, 0.55, 0, 0, 0, 0, 1.5, 0.7, 3.0),
  part(box, 0x15171c, 0, 1.05, -0.2, 0, 0, 0, 1.35, 0.5, 1.9),
  part(box, 0x2b3a4e, 0, 1.06, -0.2, 0, 0, 0, 1.38, 0.38, 1.7),
  ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => part(cyl, 0x0a0a0a, a * 0.72, 0.3, b * 1.0, 0, 0, Math.PI / 2, 0.3, 0.2, 0.3)),
  part(box, 0xffffff, -0.5, 0.6, 1.51, 0, 0, 0, 0.25, 0.12, 0.02),
  part(box, 0xffffff, 0.5, 0.6, 1.51, 0, 0, 0, 0.25, 0.12, 0.02),
]);
const TRUCK_GEO = merge([
  part(box, 0x4b5a35, 0, 0.9, 1.2, 0, 0, 0, 1.9, 1.3, 1.4),
  part(box, 0x556b2f, 0, 1.0, -0.9, 0, 0, 0, 2.0, 1.4, 2.8),
  part(box, 0x3b4a2a, 0, 1.75, -0.9, 0, 0, 0, 2.05, 0.15, 2.85),
  part(box, 0x2b3a4e, 0, 1.25, 1.91, 0, 0, 0, 1.6, 0.5, 0.02),
  ...[[-1, 1.2], [1, 1.2], [-1, -0.4], [1, -0.4], [-1, -1.6], [1, -1.6]].map(([a, z]) => part(cyl, 0x0a0a0a, a * 0.95, 0.38, z, 0, 0, Math.PI / 2, 0.38, 0.25, 0.38)),
]);
const DRUM_GEO = merge([part(cyl, 0xd9b44a, 0, 0.0, 0.28, Math.PI / 2, 0, 0, 0.22, 0.25, 0.22), part(cyl, 0xf3efe3, 0, 0.0, 0.41, Math.PI / 2, 0, 0, 0.2, 0.02, 0.2)]);
const RING_GEO = merge([part(cyl, 0x222222, 0, 0.9, 0, 0, 0, 0, 0.04, 1.8, 0.04), part(box, 0x222222, 0, 0.02, 0, 0, 0, 0, 0.6, 0.04, 0.6)]);
const CLIPBOARD = merge([part(box, 0x8a5a32, 0, -0.5, 0.12, -0.6, 0, 0, 0.22, 0.3, 0.02), part(box, 0xffffff, 0, -0.49, 0.13, -0.6, 0, 0, 0.18, 0.24, 0.01)]);
const PARTICLES = 160;

interface Follower { char: CharacterView; x: number; z: number; rot: number }

/** Everything a scenario adds to the world while it runs. Built when it starts, torn down at the end. */
export class ScenarioView {
  private group = new THREE.Group();
  private flags: THREE.Mesh[] = [];
  private followers: Follower[] = [];
  private guards: CharacterView[] = [];
  private fans: CharacterView[] = [];
  private flashes: CanvasSprite[] = [];
  private guestView: CustomerView | null = null;
  private food: THREE.Mesh | null = null;
  /** Mutable adapter so the guest can reuse the customer bubble (no per-frame allocation). */
  private bubbleData = { kind: 'guest' as const, look: 0, state: 'queue', patience: 1, patienceMax: 1, lines: [] as { product: ItemId; left: number }[] };
  private cars: THREE.Group[] = [];
  private band: CharacterView[] = [];
  private inspector: CharacterView | null = null;
  private particles: THREE.InstancedMesh;
  private pPos = new Float32Array(PARTICLES * 3);
  private pVel = new Float32Array(PARTICLES);
  private activeId = '';
  private time = 0;
  private lightningT = 4;
  private _m = new THREE.Matrix4();
  private _q = new THREE.Quaternion();
  private _e = new THREE.Euler();
  private _p = new THREE.Vector3();
  private _s = new THREE.Vector3();
  private particleKind: 'none' | 'confetti' | 'rain' = 'none';

  constructor(private scene: THREE.Scene, private view: Renderer) {
    scene.add(this.group);
    this.particles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ vertexColors: false }), PARTICLES);
    this.particles.frustumCulled = false;
    this.particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particles.visible = false;
    for (let i = 0; i < PARTICLES; i++) this.particles.setColorAt(i, new THREE.Color(0xffffff));
    scene.add(this.particles);
  }

  private has(d: ScenarioDef, p: ScenarioProp): boolean { return d.props.includes(p); }

  private clear(): void {
    for (const o of [...this.group.children]) this.group.remove(o);
    for (const f of this.followers) this.scene.remove(f.char.root);
    for (const c of [...this.guards, ...this.fans]) this.scene.remove(c.root);
    if (this.guestView) { this.scene.remove(this.guestView.char.root); this.guestView.bubble.dispose(); this.guestView.face.dispose(); this.guestView.carrier.dispose(); }
    this.guestView = null;
    this.food = null;
    this.flags = [];
    this.followers = [];
    this.guards = [];
    this.fans = [];
    this.flashes = [];
    this.cars = [];
    this.band = [];
    this.inspector = null;
    this.particles.visible = false;
    this.particleKind = 'none';
    this.view.setMood(1);
  }

  private addFlag(id: FlagId, x: number, z: number): void {
    const pole = new THREE.Mesh(POLE_GEO, MAT);
    pole.position.set(x, 0, z);
    const cloth = new THREE.Mesh(CLOTH_GEO, new THREE.MeshBasicMaterial({ map: flagTexture(id), side: THREE.DoubleSide }));
    cloth.position.set(0.04, 2.4, 0);
    pole.add(cloth);
    this.group.add(pole);
    this.flags.push(cloth);
  }

  private character(look: { shirt: number; pants: number; skin: number; hair: number; hat?: GuestLook['hat'] }, extras?: Partial<GuestLook>): CharacterView {
    const c = new CharacterView({ shirt: look.shirt, pants: look.pants, skin: look.skin, hair: look.hair });
    const acc = bodyAccessories(extras ?? (look.hat ? { hat: look.hat } : {}));
    if (acc) c.attach(acc);
    if (extras) { const h = handProp(extras); if (h) c.attach(h, 'hand'); }
    this.scene.add(c.root);
    return c;
  }

  /** Build the props for a scenario that just started (warning phase). */
  private build(d: ScenarioDef): void {
    this.clear();
    const st = LAYOUT.vipStage;
    if (d.flag && this.has(d, 'flags')) for (const [x, z] of FLAG_SPOTS) this.addFlag(d.flag, x, z);
    if (d.guest) this.buildStage(d);
    if (this.has(d, 'carpet') || d.guest) {
      // carpet from the motorcade to the front of the VIP stage
      const ax = st.entry.x, az = st.entry.z, bx = st.drop.x - 0.9, bz = st.drop.z + 0.2;
      const len = Math.hypot(bx - ax, bz - az);
      const carpet = new THREE.Mesh(merge([
        part(box, 0xb3122a, 0, 0.03, 0, 0, 0, 0, 1.3, 0.02, len),
        part(box, 0xd9b44a, -0.68, 0.035, 0, 0, 0, 0, 0.08, 0.02, len),
        part(box, 0xd9b44a, 0.68, 0.035, 0, 0, 0, 0, 0.08, 0.02, len),
      ]), MAT);
      carpet.position.set((ax + bx) / 2, 0, (az + bz) / 2);
      carpet.rotation.y = Math.atan2(bx - ax, bz - az);
      this.group.add(carpet);
      if (d.flag && this.has(d, 'carpet')) for (let k = 1; k < 4; k++) {
        const t = k / 4, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        this.addFlag(d.flag, x - 1.3, z);
        this.addFlag(d.flag, x + 1.1, z);
      }
    }
    const guest = d.guest ? GUEST_LOOKS[d.guest.look] : null;
    if (guest && this.has(d, 'guards')) {
      const ent = guest.entourage ?? guest;
      for (let k = 0; k < 4; k++) {
        const c = this.character(ent);
        // guards stand at the stage corners facing the crowd
        const gx = st.x + (k % 2 ? 1 : -1) * (st.w / 2 + 0.3), gz = st.z + (k < 2 ? -0.6 : 0.9);
        c.update(gx, gz, 0, 0, 0, false);
        this.guards.push(c);
      }
    }
    if (this.has(d, 'motorcade')) {
      for (let k = 0; k < 3; k++) {
        const car = new THREE.Group();
        car.add(new THREE.Mesh(CAR_GEO, MAT));
        if (d.flag) {
          const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.26).translate(0.2, 0, 0), new THREE.MeshBasicMaterial({ map: flagTexture(d.flag), side: THREE.DoubleSide }));
          cloth.position.set(0.6, 1.0, 1.35);
          car.add(cloth);
        }
        car.rotation.y = Math.PI / 2;
        car.position.set(-34 - k * 4, 0, st.entry.z + 0.4);
        car.userData.park = st.entry.x + 1.2 - k * 3.6;
        this.group.add(car);
        this.cars.push(car);
      }
    }
    if (this.has(d, 'truck')) {
      const t = new THREE.Mesh(TRUCK_GEO, MAT);
      t.position.set(st.entry.x - 1.5, 0, st.entry.z + 0.6);
      t.rotation.y = Math.PI / 2;
      this.group.add(t);
    }
    if (this.has(d, 'band')) {
      const look = CROWD_LOOKS.wedding;
      for (let k = 0; k < 3; k++) {
        const c = this.character({ shirt: look.shirts[k], pants: look.pants[0], skin: 0xd9a074, hair: 0x1d1d1d });
        c.attach(DRUM_GEO);
        c.update(-9.8, 7.0 + k * 1.2, Math.PI / 2, 0, 0, false);
        this.band.push(c);
      }
    }
    if (this.has(d, 'ringLight')) {
      const r = new THREE.Group();
      r.add(new THREE.Mesh(RING_GEO, MAT));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.06, 6, 20), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }));
      ring.position.y = 1.9;
      r.add(ring);
      r.position.set(st.x + st.w / 2 + 0.9, 0, st.z + 0.4);
      this.group.add(r);
    }
    if (this.has(d, 'clipboard')) {
      this.inspector = this.character({ shirt: 0xffffff, pants: 0x2e2e2e, skin: 0xf1c7a0, hair: 0x5a5a5a }, { hat: { kind: 'cap', color: 0x2fb59a } });
      this.inspector.attach(CLIPBOARD, 'hand');
    }
    if (this.has(d, 'confetti')) this.particleKind = 'confetti';
    if (this.has(d, 'rain')) this.particleKind = 'rain';
    this.seedParticles(0, 0);
  }

  private seedParticles(cx: number, cz: number): void {
    if (this.particleKind === 'none') return;
    const rain = this.particleKind === 'rain';
    const colors = [0xe8554e, 0xf2b33d, 0x5cc858, 0x4a90d9, 0xd96aa7, 0xffffff];
    const col = new THREE.Color();
    for (let i = 0; i < PARTICLES; i++) {
      this.pPos[i * 3] = cx + (Math.random() - 0.5) * 22;
      this.pPos[i * 3 + 1] = Math.random() * 12;
      this.pPos[i * 3 + 2] = cz + (Math.random() - 0.5) * 22;
      this.pVel[i] = rain ? 14 + Math.random() * 6 : 1.2 + Math.random() * 1.5;
      this.particles.setColorAt(i, col.setHex(rain ? 0xa9c7e8 : colors[i % colors.length]));
    }
    this.particles.instanceColor!.needsUpdate = true;
    this.particles.visible = true;
  }

  /** VIP stage: platform with steps, backdrop sign, table + chair, rope barriers, filming crowd. */
  private buildStage(d: ScenarioDef): void {
    const st = LAYOUT.vipStage, hd = st.d / 2;
    const stage = new THREE.Mesh(merge([
      part(box, 0x8a5a32, 0, 0.18, 0, 0, 0, 0, st.w, 0.36, st.d),
      part(box, 0xb3122a, 0, 0.37, 0, 0, 0, 0, st.w - 0.15, 0.02, st.d - 0.15),
      part(box, 0x8a5a32, -0.9, 0.09, hd + 0.25, 0, 0, 0, 1.0, 0.18, 0.5),
      part(box, 0x2b2b2b, 0, 1.6, -hd + 0.05, 0, 0, 0, st.w, 2.4, 0.1),
      part(cyl, 0xfff4d6, 0, 1.1, 0.0, 0, 0, 0, 0.5, 0.05, 0.5),
      part(cyl, 0x5a3a22, 0, 0.74, 0.0, 0, 0, 0, 0.06, 0.7, 0.06),
      part(box, 0xd9b44a, 0, 0.8, -0.65, 0, 0, 0, 0.5, 0.06, 0.45),
      part(box, 0xd9b44a, 0, 1.15, -0.86, 0, 0, 0, 0.5, 0.7, 0.06),
      ...[-1.6, -0.5, 0.6, 1.7].map((x) => part(cyl, 0xd9b44a, x, 0.45, hd + 1.6, 0, 0, 0, 0.05, 0.9, 0.05)),
      part(box, 0xb3122a, 0.05, 0.78, hd + 1.6, 0, 0, 0, 3.3, 0.05, 0.04),
    ]), MAT);
    stage.position.set(st.x, 0, st.z);
    this.group.add(stage);
    const sign = new CanvasSprite(320, 120, 3.0, false);
    sign.draw((c, w, h) => {
      c.fillStyle = d.color;
      rr(c, 6, 6, w - 12, h - 12, 22);
      c.fill();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '54px ' + EMOJI;
      c.fillText(d.icon, 50, h / 2 + 2);
      c.fillStyle = '#ffffff';
      c.font = '800 40px ' + FONT;
      c.fillText(d.guest ? d.guest.name : '', w / 2 + 30, h / 2 + 4);
    });
    sign.sprite.position.set(st.x, 2.5, st.z - hd + 0.2);
    this.group.add(sign.sprite);
    const crowd = d.crowd ? CROWD_LOOKS[d.crowd] : CROWD_LOOKS.press;
    for (let k = 0; k < 9; k++) {
      const row = k < 5 ? 0 : 1, i = row ? k - 5 : k;
      const fx = st.x - 2 + i * (row ? 1.2 : 1.0) + row * 0.4, fz = st.z + hd + 2.3 + row * 0.9;
      const c = this.character({ shirt: crowd.shirts[k % crowd.shirts.length], pants: crowd.pants[k % crowd.pants.length], skin: [0xf1c7a0, 0xd9a074, 0xa86d45][k % 3], hair: [0x3b2414, 0x1d1d1d, 0x8b4513][k % 3] }, { holds: 'phone' });
      c.update(fx, fz, Math.PI + (fx - st.x) * -0.15, 0, 0, false);
      this.fans.push(c);
      const flash = new CanvasSprite(64, 64, 0.7, false);
      flash.draw((cx) => {
        const gr = cx.createRadialGradient(32, 32, 2, 32, 32, 30);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        cx.fillStyle = gr;
        cx.fillRect(0, 0, 64, 64);
      });
      flash.sprite.position.set(fx, 1.75, fz - 0.35);
      flash.sprite.visible = false;
      this.group.add(flash.sprite);
      this.flashes.push(flash);
    }
  }

  /** The guest walking the carpet, waving on stage, ordering, eating; followers trail them. */
  private syncGuest(sim: SimWorld, dt: number): void {
    const g = sim.scenario.guest, d = sim.scenario.def;
    if (!g || !d.guest) return;
    const look: GuestLook = GUEST_LOOKS[d.guest.look];
    if (!this.guestView) {
      const v = new CustomerView({ kind: 'guest', look: 0 }, { shirt: look.shirt, pants: look.pants, skin: look.skin, hair: look.hair });
      const acc = bodyAccessories(look);
      if (acc) v.char.attach(acc);
      const hand = handProp(look);
      if (hand) v.char.attach(hand, 'hand');
      v.setName(d.guest.name);
      this.scene.add(v.char.root);
      this.guestView = v;
      this.food = new THREE.Mesh(ITEM_GEO.omelette, MAT);
      this.food.position.set(LAYOUT.vipStage.x, 1.14, LAYOUT.vipStage.z + 0.05);
      this.food.visible = false;
      this.group.add(this.food);
    }
    const v = this.guestView;
    v.char.root.visible = g.state !== 'gone';
    const bd = this.bubbleData;
    bd.state = g.upset ? 'angry' : 'queue';
    bd.patience = g.patience;
    bd.patienceMax = g.patienceMax;
    bd.lines.length = g.lines.length;
    for (let i = 0; i < g.lines.length; i++) {
      if (!bd.lines[i]) bd.lines[i] = { product: g.lines[i].product, left: 0 };
      bd.lines[i].product = g.lines[i].product;
      bd.lines[i].left = g.lines[i].left;
    }
    v.bubble.sprite.visible = g.state === 'order' || g.upset;
    v.face.sprite.visible = false;
    if (v.bubble.sprite.visible) v.draw(bd);
    const sitting = g.state === 'enjoy';
    v.char.update(g.x, g.z, g.rot, g.speed, dt, false, sitting);
    if (g.state === 'pose' || (g.state === 'leave' && !g.upset)) v.char.wave(this.time);
    if (this.food) this.food.visible = sitting;
    const ent = look.entourage ?? look;
    while (this.followers.length < d.guest.entourage) {
      const c = this.character(ent);
      this.followers.push({ char: c, x: g.x - 1, z: g.z + 0.6, rot: g.rot });
    }
    const onStage = g.state === 'pose' || g.state === 'order' || g.state === 'enjoy';
    for (let i = 0; i < this.followers.length; i++) {
      const f = this.followers[i];
      const side = i % 2 ? 1 : -1, back = 0.9 + Math.floor(i / 2) * 0.9;
      // on stage they stand at the sides; otherwise they walk behind
      const tx = onStage ? LAYOUT.vipStage.x + side * (1.0 + Math.floor(i / 2) * 0.5) : g.x + side * 0.85;
      const tz = onStage ? LAYOUT.vipStage.z - 0.4 : g.z + back;
      const dx = tx - f.x, dz = tz - f.z, dd = Math.hypot(dx, dz);
      const step = Math.min(dd, 2.4 * dt);
      if (dd > 0.05) { f.x += (dx / dd) * step; f.z += (dz / dd) * step; f.rot = Math.atan2(dx, dz); }
      f.char.update(f.x, f.z, dd > 0.1 ? f.rot : 0, dd > 0.1 ? 2.4 : 0, dt, false);
      f.char.root.visible = g.state !== 'gone';
    }
  }

  /** Fans film the stage; camera flashes pop now and then. */
  private syncFans(dt: number): void {
    for (let i = 0; i < this.fans.length; i++) {
      const c = this.fans[i];
      c.update(c.root.position.x, c.root.position.z, c.root.rotation.y, 0, dt, false);
      c.film();
      const f = this.flashes[i];
      if (f) f.sprite.visible = Math.sin(this.time * (5 + i) + i * 2.1) > 0.93;
    }
    for (const gd of this.guards) gd.update(gd.root.position.x, gd.root.position.z, 0, 0, dt, false);
  }

  sync(sim: SimWorld, dt: number): void {
    const sc = sim.scenario, d = sc.def;
    this.time += dt;
    const running = sc.phase !== 'idle';
    if (running && this.activeId !== d.id) { this.activeId = d.id; this.build(d); }
    if (!running && this.activeId) { this.activeId = ''; this.clear(); return; }
    if (!running) return;

    // waving flags
    for (let i = 0; i < this.flags.length; i++) this.flags[i].rotation.y = Math.sin(this.time * 3 + i) * 0.35;

    // motorcade drives in during the warning, parks, leaves at settle
    const total = d.warning;
    this.cars.forEach((car, k) => {
      const park = car.userData.park as number;
      if (sc.phase === 'warn') {
        const prog = Math.min(1, 1 - sc.t / total + 0.15);
        car.position.x = -34 - k * 4 + (park + 34 + k * 4) * prog;
      } else if (sc.phase === 'settle' && (!sc.guest || sc.guest.state === 'gone')) car.position.x -= dt * 7;
      else car.position.x = park;
    });

    this.syncGuest(sim, dt);
    this.syncFans(dt);

    // band bobs, inspector paces
    this.band.forEach((b, k) => { b.body.position.y = Math.abs(Math.sin(this.time * 7 + k)) * 0.15; });
    if (this.inspector) {
      const a = this.time * 0.35, x = 4 + Math.cos(a) * 7, z = 3 + Math.sin(a) * 4;
      this.inspector.update(x, z, Math.atan2(-Math.sin(a), Math.cos(a)), 1.8, dt, false);
    }

    // storm: darkness + lightning
    if (d.props.includes('rain')) {
      this.view.setMood(0.42);
      this.lightningT -= dt;
      if (this.lightningT <= 0) { this.view.lightning(); this.lightningT = 3 + Math.random() * 5; }
    }

    // particles fall around the player
    if (this.particleKind !== 'none') {
      const p = sim.player, rain = this.particleKind === 'rain';
      for (let i = 0; i < PARTICLES; i++) {
        let y = this.pPos[i * 3 + 1] - this.pVel[i] * dt;
        if (y < 0) {
          y = 10 + Math.random() * 3;
          this.pPos[i * 3] = p.x + (Math.random() - 0.5) * 22;
          this.pPos[i * 3 + 2] = p.z + (Math.random() - 0.5) * 22;
        }
        this.pPos[i * 3 + 1] = y;
        if (rain) this._e.set(0.15, 0, 0);
        else this._e.set(this.time * 3 + i, this.time * 2 + i * 0.7, 0);
        this._q.setFromEuler(this._e);
        this._s.set(rain ? 0.03 : 0.16, rain ? 0.5 : 0.1, rain ? 0.03 : 0.02);
        this._m.compose(this._p.set(this.pPos[i * 3], y, this.pPos[i * 3 + 2]), this._q, this._s);
        this.particles.setMatrixAt(i, this._m);
      }
      this.particles.instanceMatrix.needsUpdate = true;
    }
  }
}
