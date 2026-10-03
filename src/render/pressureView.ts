import * as THREE from 'three';
import { ECONOMY } from '../config/economy';
import type { SimWorld } from '../sim/world';
import { MAT, PRIM, merge, part } from './geo';
import { CanvasSprite, EMOJI, FONT } from './canvas';
import { ANIMAL_GEO } from './models';

const SMOKE_MAX = 24;

/** Recolor a merged geometry's vertex colors toward gold (for golden animals). */
function goldify(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.clone();
  const col = g.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < col.count; i++) {
    const l = (col.getX(i) + col.getY(i) + col.getZ(i)) / 3;
    col.setXYZ(i, Math.min(1, 0.55 + l * 0.5), Math.min(1, 0.42 + l * 0.42), 0.08 + l * 0.12);
  }
  return g;
}

const TROUGH_GEO = merge([
  part(PRIM.box, 0x8a5a32, 0, 0.22, 0, 0, 0, 0, 1.3, 0.12, 0.5),
  part(PRIM.box, 0x9a6233, 0, 0.36, 0.22, 0, 0, 0, 1.3, 0.3, 0.06),
  part(PRIM.box, 0x9a6233, 0, 0.36, -0.22, 0, 0, 0, 1.3, 0.3, 0.06),
  part(PRIM.box, 0x9a6233, 0.62, 0.36, 0, 0, 0, 0, 0.06, 0.3, 0.5),
  part(PRIM.box, 0x9a6233, -0.62, 0.36, 0, 0, 0, 0, 0.06, 0.3, 0.5),
  part(PRIM.box, 0x6b4426, -0.5, 0.08, 0, 0, 0, 0, 0.1, 0.16, 0.4),
  part(PRIM.box, 0x6b4426, 0.5, 0.08, 0, 0, 0, 0, 0.1, 0.16, 0.4),
]);
const FEED_GEO = merge([part(PRIM.box, 0xe8c25a, 0, 0, 0, 0, 0, 0, 1.18, 0.12, 0.38)]);

/** Small round progress ring sprite (refill / repair). */
class RingSprite {
  readonly s = new CanvasSprite(96, 96, 0.8);
  private shown = -1;
  set(frac: number, icon: string): void {
    const k = Math.round(frac * 20);
    if (k === this.shown) return;
    this.shown = k;
    this.s.draw((c) => {
      c.lineWidth = 10;
      c.strokeStyle = 'rgba(0,0,0,0.25)';
      c.beginPath(); c.arc(48, 48, 36, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = '#5cc858';
      c.beginPath(); c.arc(48, 48, 36, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); c.stroke();
      c.font = `34px ${EMOJI}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(icon, 48, 50);
    });
  }
}

class TroughView {
  readonly root = new THREE.Group();
  private feed: THREE.Mesh;
  private label = new CanvasSprite(128, 64, 0.9);
  private ring = new RingSprite();
  private boosted = false;

  constructor(scene: THREE.Scene, x: number, z: number) {
    this.root.position.set(x, 0, z);
    this.root.add(new THREE.Mesh(TROUGH_GEO, MAT));
    this.feed = new THREE.Mesh(FEED_GEO, MAT);
    this.feed.position.y = 0.3;
    this.root.add(this.feed);
    this.label.sprite.position.set(0, 1.3, 0);
    this.label.draw((c, w, h) => {
      c.font = `800 44px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineWidth = 8;
      c.strokeStyle = 'rgba(28,38,18,0.85)';
      c.strokeText('x2 ⚡', w / 2, h / 2);
      c.fillStyle = '#ffe066';
      c.fillText('x2 ⚡', w / 2, h / 2);
    });
    this.ring.s.sprite.position.set(0, 1.4, 0);
    this.root.add(this.label.sprite, this.ring.s.sprite);
    scene.add(this.root);
  }

  sync(open: boolean, boostFrac: number, refillFrac: number, hungry: boolean, time: number): void {
    this.root.visible = open;
    if (!open) return;
    // feed level drops as the boost runs out
    this.feed.scale.set(1, 1, 1);
    this.feed.position.y = 0.2 + 0.2 * boostFrac;
    this.feed.visible = boostFrac > 0.02;
    this.boosted = boostFrac > 0;
    this.label.sprite.visible = this.boosted && refillFrac <= 0;
    this.label.sprite.position.y = 1.3 + Math.sin(time * 3) * 0.06;
    this.ring.s.sprite.visible = refillFrac > 0 || hungry;
    if (this.ring.s.sprite.visible) this.ring.set(refillFrac, '🌾');
    this.ring.s.sprite.position.y = 1.4 + (hungry && refillFrac <= 0 ? Math.abs(Math.sin(time * 4)) * 0.25 : 0);
  }
}

/** Troughs, jammed-machine smoke and warnings, and the golden animal. */
export class PressureView {
  private troughs: TroughView[];
  private warn: { sign: CanvasSprite; ring: RingSprite }[] = [];
  private smoke: THREE.InstancedMesh;
  private smokeT = new Float32Array(SMOKE_MAX).fill(1);
  private smokeP: { x: number; z: number }[] = [];
  private smokeNext = 0;
  private emitT = 0;
  private golden: Record<string, THREE.Group> = {};
  private time = 0;
  private _m = new THREE.Matrix4();
  private _q = new THREE.Quaternion();
  private _p = new THREE.Vector3();
  private _s = new THREE.Vector3();

  constructor(scene: THREE.Scene, sim: SimWorld) {
    this.troughs = sim.stations.map((s) => new TroughView(scene, s.def.trough?.x ?? 0, s.def.trough?.z ?? -100));
    for (const b of sim.staff.machines) {
      const sign = new CanvasSprite(96, 96, 0.9);
      sign.draw((c) => { c.font = `70px ${EMOJI}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('⚠️', 48, 52); });
      sign.sprite.position.set(b.mx, 1.8, b.mz);
      const ring = new RingSprite();
      ring.s.sprite.position.set(b.mx, 1.2, b.mz);
      scene.add(sign.sprite, ring.s.sprite);
      this.warn.push({ sign, ring });
    }
    this.smoke = new THREE.InstancedMesh(merge([part(PRIM.sphLo, 0x6f6f6f, 0, 0, 0)]), MAT, SMOKE_MAX);
    this.smoke.frustumCulled = false;
    this.smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.smoke.count = SMOKE_MAX;
    for (let i = 0; i < SMOKE_MAX; i++) { this.smokeP.push({ x: 0, z: 0 }); this.smoke.setMatrixAt(i, this._m.makeScale(0, 0, 0)); }
    scene.add(this.smoke);
    for (const kind of ['chicken', 'cow'] as const) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(goldify(ANIMAL_GEO[kind]), MAT));
      const glow = new CanvasSprite(128, 128, 1.8, false);
      glow.draw((c) => {
        const gr = c.createRadialGradient(64, 64, 4, 64, 64, 62);
        gr.addColorStop(0, 'rgba(255,230,120,0.9)');
        gr.addColorStop(1, 'rgba(255,230,120,0)');
        c.fillStyle = gr;
        c.fillRect(0, 0, 128, 128);
      });
      glow.sprite.position.y = 0.5;
      const star = new CanvasSprite(96, 96, 0.7);
      star.draw((c) => { c.font = `64px ${EMOJI}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('✨', 48, 52); });
      star.sprite.position.y = kind === 'cow' ? 2.3 : 1.3;
      g.add(glow.sprite, star.sprite);
      g.visible = false;
      if (kind === 'cow') g.scale.setScalar(0.8);
      scene.add(g);
      this.golden[kind] = g;
    }
  }

  private puff(x: number, z: number): void {
    const i = this.smokeNext;
    this.smokeNext = (i + 1) % SMOKE_MAX;
    this.smokeT[i] = 0;
    this.smokeP[i].x = x + (Math.random() - 0.5) * 0.4;
    this.smokeP[i].z = z + (Math.random() - 0.5) * 0.4;
  }

  sync(sim: SimWorld, dt: number): void {
    this.time += dt;
    const fc = ECONOMY.feed;
    sim.stations.forEach((s, i) => {
      const hungry = s.open && s.boostT < fc.duration * fc.refillBelow;
      this.troughs[i].sync(s.open, s.boostT / fc.duration, s.refillT / fc.refillTime, hungry, this.time);
    });

    this.emitT -= dt;
    const emit = this.emitT <= 0;
    if (emit) this.emitT = 0.12;
    sim.staff.machines.forEach((b, i) => {
      const w = this.warn[i];
      w.sign.sprite.visible = b.broken;
      w.ring.s.sprite.visible = b.broken && b.fixT > 0;
      if (b.broken) {
        w.sign.sprite.position.y = 1.8 + Math.abs(Math.sin(this.time * 5)) * 0.25;
        if (b.fixT > 0) w.ring.set(b.fixT / ECONOMY.breakdowns.fixTime, '🔧');
        if (emit) this.puff(b.mx, b.mz);
      }
    });
    for (let i = 0; i < SMOKE_MAX; i++) {
      if (this.smokeT[i] >= 1) { this.smoke.setMatrixAt(i, this._m.makeScale(0, 0, 0)); continue; }
      const t = (this.smokeT[i] = Math.min(1, this.smokeT[i] + dt / 1.6));
      const sc = (0.15 + t * 0.4) * (1 - t * t);
      this._m.compose(this._p.set(this.smokeP[i].x, 0.6 + t * 1.8, this.smokeP[i].z), this._q, this._s.setScalar(sc));
      this.smoke.setMatrixAt(i, this._m);
    }
    this.smoke.instanceMatrix.needsUpdate = true;

    const a = sim.golden.animal;
    for (const k in this.golden) this.golden[k].visible = false;
    if (a) {
      const g = this.golden[sim.stations[a.station].def.producer ?? 'chicken'];
      g.visible = true;
      // blink in the last 5 seconds
      g.visible = a.t > 5 || Math.sin(this.time * 18) > -0.3;
      g.position.set(a.x, Math.abs(Math.sin(this.time * 9)) * 0.25, a.z);
      g.rotation.y = a.rot;
    }
  }
}
