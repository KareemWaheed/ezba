import * as THREE from 'three';
import { ECONOMY } from '../config/economy';
import { FIELDS } from '../config/fields';
import type { SimWorld } from '../sim/world';
import type { Plot } from '../sim/field';
import type { SimEvent } from '../sim/events';
import { Rng } from '../sim/rng';
import { MAT, PRIM, merge, part } from './geo';
import { CanvasSprite, FONT, groundMarker } from './canvas';
import { InstancedStack, gridSlots } from './stacks';
import { STALK_GEO } from './models';
import { ground, lockOverlay } from './worldView';

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
/** Height of a cut stalk's stub (fraction of full height). */
const STUB = 0.12;
const GOLD = new THREE.Color(1.6, 1.25, 0.35);
const WHITE = new THREE.Color(1, 1, 1);

/** One plot: soil, an instanced stalk per grid cell, and its lock overlay. */
class PlotView {
  readonly mesh: THREE.InstancedMesh;
  readonly lock: THREE.Group;
  /** Per stalk: yaw, size jitter, last drawn height and gold flag (to rewrite only what changed). */
  private yaw: Float32Array;
  private size: Float32Array;
  private shownH: Float32Array;
  private shownGold: Uint8Array;

  constructor(scene: THREE.Scene, private plot: Plot) {
    const b = plot.def.box, n = plot.size;
    const soil = [ground(b, 0x8a5a32, 0.02)];
    for (let z = b.z0 + ECONOMY.field.spacing / 2; z < b.z1; z += ECONOMY.field.spacing) {
      soil.push(part(PRIM.box, 0x6e4526, (b.x0 + b.x1) / 2, 0.025, z, 0, 0, 0, b.x1 - b.x0 - 0.2, 0.01, 0.16));
    }
    const s = new THREE.Mesh(merge(soil), MAT);
    s.matrixAutoUpdate = false;
    scene.add(s);
    this.mesh = new THREE.InstancedMesh(STALK_GEO[plot.crop], MAT, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.yaw = new Float32Array(n);
    this.size = new Float32Array(n);
    this.shownH = new Float32Array(n).fill(-1);
    this.shownGold = new Uint8Array(n);
    const rng = new Rng(31 + plot.index);
    for (let i = 0; i < n; i++) {
      this.yaw[i] = rng.range(0, Math.PI * 2);
      this.size[i] = rng.range(0.85, 1.15);
      this.mesh.setColorAt(i, WHITE);
    }
    scene.add(this.mesh);
    this.lock = lockOverlay(scene, b);
  }

  /** `T` = current full regrow time (with fertilizer). */
  sync(T: number): void {
    const p = this.plot, n = p.size;
    this.lock.visible = !p.open;
    let dirty = false, colors = false;
    for (let i = 0; i < n; i++) {
      // grown = full height; regrowing stalks grow back from the stub
      const r = p.regrow[i];
      const h = r <= 0 ? 1 : STUB + (1 - STUB) * Math.max(0, 1 - r / T) * 0.6;
      if (Math.abs(h - this.shownH[i]) > 0.03) {
        this.shownH[i] = h;
        const sz = this.size[i];
        _p.set(p.x(i), 0, p.z(i));
        _q.setFromAxisAngle(UP, this.yaw[i]);
        this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s.set(sz, h * sz, sz)));
        dirty = true;
      }
      const g = r <= 0 ? p.golden[i] : 0;
      if (g !== this.shownGold[i]) {
        this.shownGold[i] = g;
        this.mesh.setColorAt(i, g ? GOLD : WHITE);
        colors = true;
      }
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
    if (colors && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** Pooled chaff bits that burst out of cut stalks and settle on the soil. */
class Chaff {
  private static readonly CAP = 180;
  readonly mesh: THREE.InstancedMesh;
  private pos = new Float32Array(Chaff.CAP * 3);
  private vel = new Float32Array(Chaff.CAP * 3);
  private life = new Float32Array(Chaff.CAP);
  private spin = new Float32Array(Chaff.CAP);
  private next = 0;
  private rng = new Rng(5);

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(merge([part(PRIM.box, 0xffffff, 0, 0, 0, 0, 0, 0, 0.14, 0.03, 0.06)]), MAT, Chaff.CAP);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < Chaff.CAP; i++) {
      this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
      this.mesh.setColorAt(i, WHITE);
    }
    scene.add(this.mesh);
  }

  burst(x: number, z: number, color: number, count: number): void {
    const r = this.rng;
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % Chaff.CAP;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = 0.5; this.pos[i * 3 + 2] = z;
      const a = r.range(0, Math.PI * 2), sp = r.range(0.8, 2.2);
      this.vel[i * 3] = Math.cos(a) * sp; this.vel[i * 3 + 1] = r.range(2, 4); this.vel[i * 3 + 2] = Math.sin(a) * sp;
      this.life[i] = r.range(0.7, 1.1);
      this.spin[i] = r.range(-12, 12);
      this.mesh.setColorAt(i, _c.setHex(color).multiplyScalar(r.range(0.8, 1.15)));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    let any = false;
    for (let i = 0; i < Chaff.CAP; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      const j = i * 3;
      this.vel[j + 1] -= 9.8 * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < 0.04) { this.pos[j + 1] = 0.04; this.vel[j] *= 0.6; this.vel[j + 2] *= 0.6; this.vel[j + 1] *= -0.3; }
      const sc = this.life[i] > 0 ? Math.min(1, this.life[i] * 3) : 0;
      _p.set(this.pos[j], this.pos[j + 1], this.pos[j + 2]);
      _q.setFromEuler(_e.set(this.life[i] * this.spin[i], this.life[i] * this.spin[i] * 0.7, 0));
      this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s.set(sc, sc, sc)));
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Stage 4: crop plots, the grain stall (drop spot + cash pile) and cutting particles. */
export class FieldView {
  private plots: PlotView[];
  private chaff: Chaff;
  private cash: InstancedStack;
  private stall = new THREE.Group();

  constructor(scene: THREE.Scene, sim: SimWorld) {
    this.plots = sim.field.plots.map((p) => new PlotView(scene, p));
    this.chaff = new Chaff(scene);
    const st = FIELDS.stall, b = st.box, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, w = b.x1 - b.x0, d = b.z1 - b.z0;
    // wooden market stall with a striped awning, crates of corn and wheat on the table
    const g = [
      part(PRIM.box, 0x9a6233, cx, 0.45, cz, 0, 0, 0, w, 0.9, d),
      part(PRIM.box, 0xc68a4b, cx, 0.93, cz, 0, 0, 0, w + 0.1, 0.06, d + 0.1),
      part(PRIM.box, 0x7a4b2a, b.x0 + 0.08, 1.4, b.z0 + 0.08, 0, 0, 0, 0.08, 2.8, 0.08),
      part(PRIM.box, 0x7a4b2a, b.x1 - 0.08, 1.4, b.z0 + 0.08, 0, 0, 0, 0.08, 2.8, 0.08),
      part(PRIM.box, 0xf6cf3a, cx - 0.45, 1.05, cz, 0, 0, 0, 0.7, 0.18, 0.5),
      part(PRIM.box, 0xe2b955, cx + 0.45, 1.05, cz, 0, 0, 0, 0.7, 0.18, 0.5),
    ];
    for (let i = 0; i < 5; i++) {
      g.push(part(PRIM.box, i % 2 ? 0xffffff : 0x3f9b4a, b.x0 + (i + 0.5) * (w / 5), 2.75, cz + 0.1, 0.35, 0, 0, w / 5, 0.06, d + 0.6));
    }
    const m = new THREE.Mesh(merge(g), MAT);
    this.stall.add(m);
    const drop = groundMarker('🌽', 1.5, 'rgba(255,214,140,0.35)', '#e8a23a');
    drop.position.set(st.drop.x, 0, st.drop.z);
    const cm = groundMarker('', 1.4, 'rgba(94,198,208,0.35)', '#5ec6d0');
    cm.position.set(st.cash.x, 0, st.cash.z);
    const sign = new CanvasSprite(320, 80, 2.2);
    sign.draw((c, cw, ch) => {
      c.font = `800 44px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.direction = 'rtl';
      c.fillStyle = 'rgba(63,155,74,0.92)';
      c.beginPath(); c.roundRect(6, 6, cw - 12, ch - 12, 22); c.fill();
      c.fillStyle = '#fff';
      c.fillText('🌾 كشك الغلة', cw / 2, ch / 2 + 2);
    });
    sign.sprite.position.set(cx, 3.6, b.z0);
    this.cash = new InstancedStack('bill', 40, gridSlots('bill', 2, 3, 0.34), st.cash.x, 0.03, st.cash.z, 0.08, 11);
    this.stall.add(drop, cm, sign.sprite, this.cash.group);
    this.stall.visible = false;
    scene.add(this.stall);
  }

  sync(sim: SimWorld, dt: number): void {
    sim.field.plots.forEach((p, i) => this.plots[i].sync(sim.field.regrowTime(p)));
    this.stall.visible = sim.field.open;
    this.cash.set(sim.field.cash.bills);
    this.cash.update(dt);
    this.chaff.update(dt);
  }

  onEvent(e: SimEvent): void {
    if (e.type === 'cut') this.chaff.burst(e.x, e.z, e.product === 'wheat' ? 0xe2b955 : 0x6fb83f, 2);
    if (e.type === 'goldenStalk') this.chaff.burst(e.x, e.z, 0xffd34a, 14);
  }
}
