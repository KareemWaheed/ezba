import * as THREE from 'three';
import { ECONOMY } from '../config/economy';
import { LAYOUT } from '../config/layout';
import type { SimWorld } from '../sim/world';
import { MAT, PRIM, merge, part } from './geo';
import { CanvasSprite, EMOJI, FONT, groundMarker, rr } from './canvas';
import { ANIMAL_GEO, ITEM_ICON } from './models';
import { goldify } from './pressureView';

const { box, cyl, sph } = PRIM;
const L = LAYOUT.surplus;

/** The trader's pickup: green cab, open slatted bed. */
const TRUCK_GEO = merge([
  part(box, 0x3f9d4f, 0, 0.95, 1.4, 0, 0, 0, 1.8, 1.3, 1.3),
  part(box, 0x2b3a4e, 0, 1.25, 2.06, 0, 0, 0, 1.5, 0.5, 0.02),
  part(box, 0x8a5a32, 0, 0.6, -0.6, 0, 0, 0, 2.0, 0.5, 2.8),
  part(box, 0xb8864a, -0.97, 1.0, -0.6, 0, 0, 0, 0.06, 0.5, 2.8),
  part(box, 0xb8864a, 0.97, 1.0, -0.6, 0, 0, 0, 0.06, 0.5, 2.8),
  part(box, 0xb8864a, 0, 1.0, -1.98, 0, 0, 0, 2.0, 0.5, 0.06),
  ...[[-1, 1.4], [1, 1.4], [-1, -1.2], [1, -1.2]].map(([a, z]) => part(cyl, 0x0a0a0a, a * 0.95, 0.35, z, 0, 0, Math.PI / 2, 0.35, 0.25, 0.35)),
]);
/** Crates in the bed (shown as he loads). */
const LOAD_GEO = merge([0, 1, 2].map((i) => part(box, 0xe9c46a, (i - 1) * 0.6, 1.05, -0.6, 0, 0, 0, 0.5, 0.45, 2.2)));
/** Height of the crates' bottom (on the bed). */
const LOAD_BOTTOM = 1.05 - 0.45 / 2;

/** Incubator: a warm cabinet with a glass front, a red lamp, and the chick crate in front. */
const INCUBATOR_GEO = (() => {
  const b = L.incubator.box, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, w = b.x1 - b.x0, d = b.z1 - b.z0;
  return merge([
    part(box, 0xf2e2c4, cx, 0.6, cz, 0, 0, 0, w, 1.2, d),
    part(box, 0xffd27f, cx, 0.65, b.z1 + 0.01, 0, 0, 0, w - 0.3, 0.6, 0.02),
    part(sph, 0xff4d4d, cx + w / 2 - 0.2, 1.3, cz, 0, 0, 0, 0.1, 0.1, 0.1),
    part(box, 0x8a5a32, cx, 1.22, cz, 0, 0, 0, w + 0.06, 0.06, d + 0.06),
  ]);
})();
const CRATE_GEO = merge([
  part(box, 0xb8864a, 0, 0.12, 0, 0, 0, 0, 1.0, 0.24, 0.7),
  part(box, 0x8a5a32, 0, 0.25, 0, 0, 0, 0, 1.02, 0.04, 0.72),
]);
const CHICK_GEO = merge([
  part(sph, 0xffe14d, 0, 0.12, 0, 0, 0, 0, 0.11, 0.1, 0.11),
  part(sph, 0xffe14d, 0, 0.24, 0.05, 0, 0, 0, 0.07, 0.07, 0.07),
  part(box, 0xff9a1f, 0, 0.24, 0.12, 0, 0, 0, 0.03, 0.02, 0.04),
]);
/** Record stand: a low table with a flag; the record dish grows on it when one is set. */
const STAND_GEO = merge([
  part(box, 0xd9b44a, 0, 0.35, 0, 0, 0, 0, 1.6, 0.08, 1.0),
  ...[[-0.7, -0.4], [0.7, -0.4], [-0.7, 0.4], [0.7, 0.4]].map(([x, z]) => part(box, 0x8a5a32, x, 0.17, z, 0, 0, 0, 0.08, 0.34, 0.08)),
  part(cyl, 0xdddddd, -0.75, 1.0, -0.45, 0, 0, 0, 0.03, 1.3, 0.03),
  part(box, 0xc8102e, -0.5, 1.5, -0.45, 0, 0, 0, 0.5, 0.3, 0.02),
]);
const DISH_COLOR: Record<string, number> = { egg: 0xffd84d, milk: 0xf5ecd9, corn: 0xfff2b3 };

const GOLD_HEN = goldify(ANIMAL_GEO.chicken);

/**
 * The surplus corner: the wholesale trader's truck (a board with what he buys and his price), the incubator
 * with its crate of chicks, the record stand (what's needed for the next record; the giant dish when one is set)
 * and the golden hens strutting in the coop.
 */
export class SurplusView {
  private truck = new THREE.Group();
  private load = new THREE.Mesh(LOAD_GEO, MAT);
  private board = new CanvasSprite(320, 120, 2.6);
  private boardKey = '';
  private loadMark = groundMarker('🤝', 1.6, 'rgba(63,157,79,0.3)', '#3f9d4f');
  private incubator = new THREE.Mesh(INCUBATOR_GEO, MAT);
  private crate = new THREE.Mesh(CRATE_GEO, MAT);
  private chicks: THREE.InstancedMesh;
  private crateMark = groundMarker('🐣', 1.4, 'rgba(255,225,77,0.3)', '#e0b400');
  private crateSign = new CanvasSprite(200, 90, 1.3);
  private crateKey = '';
  private stand = new THREE.Mesh(STAND_GEO, MAT);
  private standMark = groundMarker('🏆', 1.5, 'rgba(217,180,74,0.3)', '#d9b44a');
  private standSign = new CanvasSprite(360, 160, 2.8);
  private standKey = '';
  private dish = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.12, 24), new THREE.MeshLambertMaterial({ color: 0xffd84d }));
  private hens: THREE.InstancedMesh;
  private henPos: { x: number; z: number; tx: number; tz: number; rot: number }[] = [];
  private time = 0;

  constructor(scene: THREE.Scene) {
    const body = new THREE.Mesh(TRUCK_GEO, MAT);
    this.truck.add(body, this.load);
    this.board.sprite.position.set(0, 3.0, 0);
    this.truck.add(this.board.sprite);
    // (it backs in: the bed toward the load spot)
    this.truck.rotation.y = -Math.PI / 2;
    this.loadMark.position.set(L.load.x, 0, L.load.z);
    const c = L.incubator.crate;
    this.crate.position.set(c.x, 0, c.z - 0.2);
    this.crateMark.position.set(c.x, 0, c.z);
    this.crateSign.sprite.position.set(c.x, 1.3, c.z - 0.2);
    this.chicks = new THREE.InstancedMesh(CHICK_GEO, MAT, 12);
    this.chicks.frustumCulled = false;
    this.stand.position.set(L.record.x, 0, L.record.z - 0.9);
    this.standMark.position.set(L.record.x, 0, L.record.z);
    this.standSign.sprite.position.set(L.record.x, 2.45, L.record.z - 0.9);
    this.dish.position.set(L.record.x, 0.45, L.record.z - 0.9);
    this.hens = new THREE.InstancedMesh(GOLD_HEN, MAT, ECONOMY.surplus.incubator.goldenMax);
    this.hens.frustumCulled = false;
    this.hens.count = 0;
    scene.add(this.truck, this.loadMark, this.incubator, this.crate, this.chicks, this.crateMark, this.crateSign.sprite,
      this.stand, this.standMark, this.standSign.sprite, this.dish, this.hens);
  }

  sync(sim: SimWorld, dt: number): void {
    this.time += dt;
    const s = sim.surplus;
    // the trader drives in from the west along the yard's south edge
    const v = s.visit;
    this.truck.visible = !!v;
    this.loadMark.visible = !!v && v.state === 'parked' && v.left > 0;
    if (v) {
      const k = 1 - Math.pow(1 - v.k, 2);
      this.truck.position.set(L.road.x + (L.park.x - L.road.x) * k, 0, L.park.z);
      this.load.visible = v.want - v.left > 0;
      // (scaled about the truck's origin: lift it so the crates' bottom stays on the bed)
      const sy = 0.3 + 0.7 * ((v.want - v.left) / Math.max(1, v.want));
      this.load.scale.y = sy;
      this.load.position.y = LOAD_BOTTOM * (1 - sy);
      this.drawBoard(sim);
    }
    // incubator, crate and chicks (once built)
    const built = sim.upgrades.level('eggs.incubator') > 0;
    this.incubator.visible = this.crate.visible = this.crateMark.visible = this.crateSign.sprite.visible = built;
    const n = built ? Math.min(12, s.crate) : 0;
    const _m = new THREE.Matrix4(), c = L.incubator.crate;
    for (let i = 0; i < n; i++) {
      const hop = Math.max(0, Math.sin(this.time * 6 + i * 1.3)) * 0.05;
      _m.makeRotationY(i * 1.1 + this.time * 0.3);
      _m.setPosition(c.x - 0.38 + (i % 4) * 0.25, 0.22 + hop, c.z - 0.4 + Math.floor(i / 4) * 0.2);
      this.chicks.setMatrixAt(i, _m);
    }
    this.chicks.count = n;
    this.chicks.instanceMatrix.needsUpdate = true;
    if (built) this.drawCrate(sim);
    // record stand: shows how close the next record is; the dish grows while one is being celebrated
    this.drawStand(sim);
    this.standMark.visible = !!s.ready;
    this.dish.visible = s.celebT > 0;
    if (s.celebT > 0) {
      const g = Math.min(1, (4 - s.celebT) * 1.5);
      this.dish.scale.set(0.3 + g * 0.9, 1 + g * 2, 0.3 + g * 0.9);
      (this.dish.material as THREE.MeshLambertMaterial).color.setHex(DISH_COLOR[s.celebProduct]);
    }
    this.syncHens(sim, dt);
  }

  /** Golden hens strutting about the coop (wander targets are cosmetic: render-side only). */
  private syncHens(sim: SimWorld, dt: number): void {
    const n = sim.surplus.golden, st = sim.stations.find((x) => x.def.product === 'egg');
    this.hens.count = st && st.open ? n : 0;
    if (!st || !n) return;
    const a = st.area;
    while (this.henPos.length < n) { const x = (a.x0 + a.x1) / 2, z = a.z1 - 1.2; this.henPos.push({ x, z, tx: x, tz: z, rot: 0 }); }
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1.35, 1.35, 1.35);
    this.henPos.slice(0, n).forEach((h, i) => {
      const dx = h.tx - h.x, dz = h.tz - h.z, d = Math.hypot(dx, dz);
      if (d < 0.1) { h.tx = a.x0 + 0.8 + Math.random() * (a.x1 - a.x0 - 1.6); h.tz = a.z0 + 2.6 + Math.random() * (a.z1 - a.z0 - 3.2); }
      else { const sp = Math.min(d, 0.9 * dt); h.x += (dx / d) * sp; h.z += (dz / d) * sp; h.rot = Math.atan2(dx, dz); }
      this.hens.setMatrixAt(i, _m.compose(_p.set(h.x, Math.abs(Math.sin(this.time * 8 + i)) * 0.05, h.z), _q.setFromEuler(_e.set(0, h.rot, 0)), _s));
    });
    this.hens.instanceMatrix.needsUpdate = true;
  }

  /** Over the truck: the product, how many he still takes, and his price per item. */
  private drawBoard(sim: SimWorld): void {
    const v = sim.surplus.visit!;
    const price = sim.surplus.traderPrice(v.product);
    const key = `${v.product}|${v.left}|${price.toFixed(1)}|${v.state}`;
    if (key === this.boardKey) return;
    this.boardKey = key;
    this.board.draw((c, w, h) => {
      c.fillStyle = 'rgba(255,255,255,0.95)';
      rr(c, 4, 4, w - 8, h - 8, 22); c.fill();
      c.lineWidth = 4; c.strokeStyle = '#3f9d4f'; c.stroke();
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `46px ${EMOJI}`; c.fillText(ITEM_ICON[v.product], 54, h / 2);
      c.fillStyle = '#2b2a1f'; c.font = `800 40px ${FONT}`;
      c.fillText(v.left > 0 ? `× ${v.left.toLocaleString('en-US')}` : '✓', 170, 44);
      c.fillStyle = '#2f8f3a'; c.font = `800 28px ${FONT}`;
      c.fillText(`💵 ${price < 10 ? price.toFixed(1) : Math.round(price)} للواحدة`, 180, 90);
    });
  }

  private drawCrate(sim: SimWorld): void {
    const s = sim.surplus, key = `${s.crate}|${s.hatching}`;
    if (key === this.crateKey) return;
    this.crateKey = key;
    this.crateSign.draw((c, w, h) => {
      c.fillStyle = 'rgba(255,255,255,0.9)';
      rr(c, 4, 4, w - 8, h - 8, 18); c.fill();
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `36px ${EMOJI}`; c.fillText(s.hatching > 0 ? '🥚' : '🐣', 44, h / 2);
      c.fillStyle = '#2b2a1f'; c.font = `800 38px ${FONT}`;
      c.fillText(`${s.crate}/${ECONOMY.surplus.incubator.crateMax}`, 130, h / 2 + 2);
    });
  }

  /** Over the stand: the next record of the product closest to one, and how far along the surplus is. */
  private drawStand(sim: SimWorld): void {
    const s = sim.surplus, c0 = s.closest();
    const p = s.ready ?? c0?.p ?? null;
    this.standSign.sprite.visible = !!p;
    if (!p) return;
    const need = s.need(p), have = s.ready ? need : Math.max(0, Math.floor(c0?.spare ?? 0));
    const frac = Math.min(1, have / need), hold = Math.floor((s.hold / ECONOMY.surplus.records.hold) * 10);
    const r = ECONOMY.surplus.records[p];
    const key = `${p}|${have}|${need}|${!!s.ready}|${hold}`;
    if (key === this.standKey) return;
    this.standKey = key;
    this.standSign.draw((c, w, h) => {
      c.fillStyle = s.ready ? 'rgba(255,248,220,0.97)' : 'rgba(255,255,255,0.85)';
      rr(c, 4, 4, w - 8, h - 8, 22); c.fill();
      c.lineWidth = 4; c.strokeStyle = '#d9b44a'; c.stroke();
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'rtl';
      c.font = `40px ${EMOJI}`; c.fillText(r.icon, w - 44, 42);
      c.fillStyle = '#2b2a1f'; c.font = `800 28px ${FONT}`;
      c.fillText(r.name, w / 2 - 20, 42);
      // how much spare it needs (beyond what the shop's line wants), or that it's ready
      c.font = `700 24px ${FONT}`; c.fillStyle = s.ready ? '#2f9e44' : '#6b5a2a';
      const line = s.ready
        ? (s.hold > 0 ? 'استنى هنا... ⏳' : 'جاهز! اقف هنا ✋')
        : `محتاج \u2066${have.toLocaleString('en-US')} / ${need.toLocaleString('en-US')}\u2069 ${ITEM_ICON[p]} زيادة`;
      c.fillText(line, w / 2, 88);
      c.direction = 'ltr';
      const fill = s.ready && s.hold > 0 ? Math.min(1, s.hold / ECONOMY.surplus.records.hold) : frac;
      c.fillStyle = '#e9e4d4'; rr(c, 24, h - 34, w - 48, 16, 8); c.fill();
      c.fillStyle = s.ready ? '#2f9e44' : '#d9b44a'; rr(c, 24, h - 34, Math.max(16, (w - 48) * fill), 16, 8); c.fill();
    });
  }

  invalidate(): void { this.boardKey = this.crateKey = this.standKey = ''; }
}
