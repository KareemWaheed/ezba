import * as THREE from 'three';
import { MARKET } from '../config/market';
import type { SimWorld } from '../sim/world';
import { MAT, PRIM, merge, part } from './geo';
import { CanvasSprite, EMOJI, FONT, groundMarker, rr } from './canvas';
import { CharacterView } from './character';
import { hatGeo } from './accessories';
import { ITEM_ICON } from './models';

const { box, cyl } = PRIM;
const CASHIER = { shirt: 0xd94f45, pants: 0x2e2e2e, skin: 0xc68e5c, hair: 0x2a1a10 };
const CLEANER = { shirt: 0x3fae5a, pants: 0x2e2e2e, skin: 0xd9a074, hair: 0x1d1d1d };
const GUARD = { shirt: 0x1f2f4f, pants: 0x1a1a1a, skin: 0xb07a50, hair: 0x111111 };

/** Second checkout counter: same make as the first (counter, belt, register). */
function counterGeo(b: { x0: number; x1: number; z0: number; z1: number }): THREE.BufferGeometry {
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  return merge([
    part(box, 0x5a6270, cx, 0.45, cz, 0, 0, 0, b.x1 - b.x0, 0.9, b.z1 - b.z0),
    part(box, 0x2b2b2b, cx + 0.2, 0.91, cz, 0, 0, 0, b.x1 - b.x0 - 0.5, 0.03, b.z1 - b.z0 - 0.15),
    part(box, 0x5ec6d0, b.x0 + 0.3, 1.08, cz - 0.05, 0, 0, 0, 0.42, 0.3, 0.34),
    part(box, 0x2b2b2b, b.x0 + 0.3, 1.25, cz - 0.15, -0.4, 0, 0, 0.36, 0.04, 0.2),
  ]);
}

/** Self-checkout kiosk: a slim stand with a tilted touch screen and a scanner glow. */
function kioskGeo(b: { x0: number; x1: number; z0: number; z1: number }): THREE.BufferGeometry {
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  return merge([
    part(box, 0xe9edf2, cx, 0.5, cz, 0, 0, 0, b.x1 - b.x0, 1.0, b.z1 - b.z0),
    part(box, 0x3d7fd9, cx, 1.02, cz, 0, 0, 0, b.x1 - b.x0, 0.04, b.z1 - b.z0),
    part(box, 0x2b2b2b, cx, 1.35, cz - 0.05, -0.5, 0, 0, 0.6, 0.42, 0.05),
    part(box, 0x7fd3ff, cx, 1.35, cz - 0.02, -0.5, 0, 0, 0.52, 0.34, 0.02),
    part(box, 0xff4d4d, cx, 1.05, cz + 0.2, 0, 0, 0, 0.3, 0.02, 0.12),
  ]);
}

/** Delivery van: white box van with the store's red stripe and a cab facing the road. */
const VAN_GEO = merge([
  part(box, 0xf6f6f6, 0, 1.0, -0.4, 0, 0, 0, 1.7, 1.5, 2.6),
  part(box, 0xd94f45, 0, 1.0, -0.4, 0, 0, 0, 1.72, 0.25, 2.62),
  part(box, 0xf6f6f6, 0, 0.8, 1.45, 0, 0, 0, 1.6, 1.1, 1.1),
  part(box, 0x2b3a4e, 0, 1.15, 2.0, 0, 0, 0, 1.4, 0.45, 0.02),
  ...[[-1, 1.4], [1, 1.4], [-1, -1.2], [1, -1.2]].map(([a, z]) => part(cyl, 0x0a0a0a, a * 0.85, 0.33, z, 0, 0, Math.PI / 2, 0.33, 0.25, 0.33)),
]);

/** A spill: a flat puddle (drawn per spill) with a carton on its side. */
const PUDDLE_GEO = merge([
  part(cyl, 0xf3e3a0, 0, 0.02, 0, 0, 0, 0, 0.62, 0.01, 0.48),
  part(cyl, 0xffffff, 0.18, 0.025, 0.08, 0, 0, 0, 0.25, 0.01, 0.2),
  part(box, 0xffffff, -0.15, 0.09, -0.05, 0, 0.5, Math.PI / 2, 0.16, 0.24, 0.12),
  part(box, 0x3d7fd9, -0.15, 0.09, -0.05, 0, 0.5, Math.PI / 2, 0.165, 0.08, 0.125),
]);
const MOP_GEO = merge([part(box, 0x8a5a32, 0, -0.05, 0.25, 0.6, 0, 0, 0.04, 0.04, 0.9), part(box, 0xdddddd, 0, -0.08, 0.68, 0.6, 0, 0, 0.22, 0.08, 0.1)]);

/**
 * The store's upgrades beyond shelves and the first checkout: the second counter (and its cashier), the
 * self-checkout kiosk, the delivery van with its loading spot and order board, spills, the cleaner and the
 * guard at the door.
 */
export class StoreExtrasView {
  private root = new THREE.Group();
  private counter2 = new THREE.Mesh(counterGeo(MARKET.checkout2.box), MAT);
  private kiosk = new THREE.Mesh(kioskGeo(MARKET.kiosk.box), MAT);
  private serve2 = groundMarker('🧾', 1.4, 'rgba(255,255,255,0.3)', '#ffffff');
  private van = new THREE.Group();
  private vanBoard = new CanvasSprite(320, 120, 2.6);
  private vanKey = '';
  private puddles: THREE.Mesh[] = [];
  private cashier2: CharacterView | null = null;
  private cleaner: CharacterView | null = null;
  private guard: CharacterView | null = null;
  private time = 0;

  constructor(private scene: THREE.Scene) {
    this.serve2.position.set(MARKET.checkout2.serve.x, 0, MARKET.checkout2.serve.z);
    this.root.add(this.counter2, this.kiosk, this.serve2);
    const body = new THREE.Mesh(VAN_GEO, MAT);
    body.rotation.y = Math.PI / 2;
    this.van.add(body);
    this.van.position.set(MARKET.van.park.x, 0, MARKET.van.park.z);
    const spot = groundMarker('🚚', 1.6, 'rgba(61,127,217,0.25)', '#3d7fd9');
    spot.position.set(MARKET.van.x - MARKET.van.park.x, 0, 0);
    this.van.add(spot);
    this.vanBoard.sprite.position.set(0, 2.9, 0);
    this.van.add(this.vanBoard.sprite);
    this.root.add(this.van);
    this.root.visible = false;
    scene.add(this.root);
  }

  sync(sim: SimWorld, dt: number): void {
    const m = sim.market, up = sim.upgrades, x = m.extras;
    this.time += dt;
    this.root.visible = m.open;
    if (!m.open) return;
    this.counter2.visible = this.serve2.visible = m.laneOpen(1);
    this.kiosk.visible = m.laneOpen(2);
    this.van.visible = up.level('market.delivery') > 0;
    // second cashier (market.cashier level 2 at the second counter)
    if (m.laneStaffed(1) && !this.cashier2) {
      this.cashier2 = new CharacterView(CASHIER);
      this.cashier2.attach(merge(hatGeo({ kind: 'cap', color: 0xd94f45 })));
      this.scene.add(this.cashier2.root);
    }
    if (this.cashier2) {
      const s = MARKET.checkout2.serve;
      this.cashier2.update(s.x - 0.55, s.z - 0.1, 0, 0, dt, false);
    }
    // spills: a puddle each
    while (this.puddles.length < x.spills.length) {
      const p = new THREE.Mesh(PUDDLE_GEO, MAT);
      this.root.add(p);
      this.puddles.push(p);
    }
    this.puddles.forEach((p, i) => {
      const s = x.spills[i];
      p.visible = !!s;
      if (!s) return;
      p.position.set(s.x, 0, s.z);
      // shrinks while being mopped
      p.scale.setScalar(Math.max(0.2, 1 - s.mop / 1.4) * (1 + Math.sin(this.time * 3 + i) * 0.03));
    });
    // the cleaner with his mop
    if (up.level('market.cleaner') > 0 && !this.cleaner) {
      this.cleaner = new CharacterView(CLEANER);
      this.cleaner.attach(MOP_GEO, 'hand');
      this.scene.add(this.cleaner.root);
    }
    if (this.cleaner) {
      const c = x.cleaner;
      this.cleaner.update(c.x, c.z, c.rot + (c.mopping ? Math.sin(this.time * 9) * 0.4 : 0), c.speed, dt, false);
    }
    // the guard at the door, facing in
    if (up.level('market.guard') > 0 && !this.guard) {
      this.guard = new CharacterView(GUARD);
      this.guard.attach(merge(hatGeo({ kind: 'cap', color: 0x1f2f4f })));
      this.scene.add(this.guard.root);
    }
    if (this.guard) {
      const t = m.thief, e = MARKET.exit;
      // steps toward a runner near the door
      const gx = t ? e.x + (t.x - e.x) * 0.3 : e.x + 1.2, gz = t ? e.z - 3 + (t.z - (e.z - 3)) * 0.3 : e.z - 3;
      this.guard.update(gx, gz, Math.PI, 0, dt, false);
    }
    this.drawVanBoard(sim);
  }

  /** Over the van: the phone order (items left, timer) or "waiting for a call". */
  private drawVanBoard(sim: SimWorld): void {
    const o = sim.market.extras.order;
    const key = o ? o.lines.map((l) => `${l.item}${l.left}`).join(',') + `|${Math.ceil(o.t)}` : 'idle';
    if (key === this.vanKey) return;
    this.vanKey = key;
    this.vanBoard.draw((c, w, h) => {
      c.fillStyle = o ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.7)';
      rr(c, 4, 4, w - 8, h - 8, 22); c.fill();
      c.lineWidth = 4; c.strokeStyle = '#3d7fd9'; c.stroke();
      c.textAlign = 'center'; c.textBaseline = 'middle';
      if (!o) {
        c.font = `800 34px ${FONT}`; c.fillStyle = '#5a6270'; c.direction = 'rtl';
        c.fillText('📞 مستني طلب…', w / 2, h / 2 + 2);
        return;
      }
      const cell = (w - 30) / o.lines.length;
      o.lines.forEach((l, i) => {
        const x = 15 + cell * (i + 0.5);
        c.font = `36px ${EMOJI}`; c.fillText(ITEM_ICON[l.item], x - 16, 44);
        c.font = `800 32px ${FONT}`; c.fillStyle = l.left ? '#2b2a1f' : '#2f9e44';
        c.fillText(l.left ? String(l.left) : '✓', x + 22, 46);
        c.fillStyle = '#2b2a1f';
      });
      const frac = Math.max(0, o.t / o.tMax);
      c.fillStyle = '#e9e4d4'; rr(c, 20, h - 30, w - 40, 12, 6); c.fill();
      c.fillStyle = frac > 0.3 ? '#3d7fd9' : '#e8554e'; rr(c, 20, h - 30, Math.max(12, (w - 40) * frac), 12, 6); c.fill();
    });
  }

  invalidate(): void { this.vanKey = ''; }
}
