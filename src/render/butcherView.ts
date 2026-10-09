import * as THREE from 'three';
import { ECONOMY } from '../config/economy';
import { LAYOUT } from '../config/layout';
import type { SimWorld } from '../sim/world';
import { MAT, PRIM, merge, part } from './geo';
import { CanvasSprite, FONT, groundMarker, rr } from './canvas';
import { InstancedStack, gridSlots } from './stacks';

const { box, cyl, sph } = PRIM;
const L = LAYOUT.butcher;
const B = L.box, CX = (B.x0 + B.x1) / 2, CZ = (B.z0 + B.z1) / 2, W = B.x1 - B.x0, D = B.z1 - B.z0;

/** White-tiled shop with a red-and-white awning over the window, a counter in front and a side door. */
const SHOP_GEO = merge([
  part(box, 0xf4f1ea, CX, 1.2, CZ, 0, 0, 0, W, 2.4, D),
  part(box, 0xb3261e, CX, 2.5, CZ, 0, 0, 0, W + 0.1, 0.2, D + 0.1),
  // window opening (dark) and the counter in front of it
  part(box, 0x3a2a22, CX, 1.35, B.z1 + 0.005, 0, 0, 0, W - 1.0, 0.9, 0.02),
  part(box, 0xb3261e, CX, 0.45, B.z1 + 0.25, 0, 0, 0, W - 0.6, 0.9, 0.5),
  part(box, 0xdedede, CX, 0.92, B.z1 + 0.25, 0, 0, 0, W - 0.5, 0.06, 0.6),
  // side door (west)
  part(box, 0x7a4b2a, B.x0 - 0.005, 0.8, L.door.z, 0, 0, 0, 0.02, 1.6, 0.9),
  // hooks rail inside the window
  part(cyl, 0x888888, CX, 1.75, B.z1 - 0.1, 0, 0, Math.PI / 2, 0.03, W - 1.2, 0.03),
  // hanging cuts
  ...[-0.9, -0.3, 0.3, 0.9].map((dx) => part(sph, 0xc0392b, CX + dx, 1.5, B.z1 - 0.1, 0, 0, 0, 0.14, 0.26, 0.1)),
]);
/** Awning stripes over the window. */
const AWNING_GEO = merge(Array.from({ length: 6 }, (_, i) =>
  part(box, i % 2 ? 0xffffff : 0xb3261e, B.x0 + 0.3 + (i + 0.5) * ((W - 0.6) / 6), 2.05, B.z1 + 0.45, 0.4, 0, 0, (W - 0.6) / 6, 0.06, 0.9)));
/** A meat pack on the window counter: red cut on a white tray. */
const PACK_GEO = merge([
  part(box, 0xffffff, 0, 0.02, 0, 0, 0, 0, 0.36, 0.04, 0.26),
  part(sph, 0xc0392b, 0, 0.07, 0, 0, 0, 0, 0.14, 0.05, 0.1),
  part(sph, 0xf5e6d3, 0.06, 0.09, 0.02, 0, 0, 0, 0.04, 0.02, 0.03),
]);
const PACKS_MAX = ECONOMY.butcher.packs * 2;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

/** The butcher's: the shop, the packs on its window, the money pile, and a bump while a cow is being chopped. */
export class ButcherView {
  private group = new THREE.Group();
  private shop = new THREE.Mesh(SHOP_GEO, MAT);
  private packs = new THREE.InstancedMesh(PACK_GEO, MAT, PACKS_MAX);
  private cash: InstancedStack;
  private shown = -1;
  private time = 0;

  constructor(scene: THREE.Scene) {
    const sign = new CanvasSprite(300, 80, 2.2);
    sign.draw((c, cw, ch) => {
      c.font = `800 44px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'rtl';
      c.fillStyle = 'rgba(179,38,30,0.92)'; rr(c, 6, 6, cw - 12, ch - 12, 22); c.fill();
      c.fillStyle = '#fff'; c.fillText('🥩 الجزارة', cw / 2, ch / 2 + 2);
    });
    sign.sprite.position.set(CX, 3.3, CZ);
    const cm = groundMarker('', 1.4, 'rgba(94,198,208,0.35)', '#5ec6d0');
    cm.position.set(L.cash.x, 0, L.cash.z);
    this.cash = new InstancedStack('bill', 40, gridSlots('bill', 2, 3, 0.34), L.cash.x, 0.03, L.cash.z, 0.08, 17);
    this.packs.count = 0;
    this.packs.frustumCulled = false;
    this.group.add(this.shop, new THREE.Mesh(AWNING_GEO, MAT), sign.sprite, cm, this.cash.group, this.packs);
    this.group.visible = false;
    scene.add(this.group);
  }

  sync(sim: SimWorld, dt: number): void {
    const b = sim.butcher;
    this.group.visible = b.open;
    if (!b.open) return;
    this.time += dt;
    // the shop shakes a little while the butcher is at work
    const chop = b.chopT > 0 ? Math.abs(Math.sin(this.time * 14)) * 0.04 : 0;
    this.shop.position.y = chop;
    const n = Math.min(PACKS_MAX, b.stock);
    if (n !== this.shown) {
      this.shown = n;
      const per = 8, x0 = CX - (per - 1) * 0.2;
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / per) % 2, layer = Math.floor(i / (per * 2));
        _p.set(x0 + (i % per) * 0.4, 0.95 + layer * 0.06, B.z1 + 0.12 + row * 0.28);
        this.packs.setMatrixAt(i, _m.compose(_p, _q, _s));
      }
      this.packs.count = n;
      this.packs.instanceMatrix.needsUpdate = true;
    }
    this.cash.set(b.cash.bills);
    this.cash.update(dt);
  }
}
