import * as THREE from 'three';
import { ECONOMY, type VenueItemId } from '../config/economy';
import { EAST, type VenueDef } from '../config/venues';
import type { Venue } from '../sim/venue';
import type { SimWorld } from '../sim/world';
import { CanvasSprite, FONT, groundMarker, rr } from './canvas';
import { CharacterView } from './character';
import { MAT, PRIM, Q4, blob, merge, part } from './geo';
import { ITEM_GEO, ITEM_ICON } from './models';
import { InstancedStack, gridSlots } from './stacks';
import { ground, lockOverlay } from './worldView';

const { box, sph, sphLo, cyl, cylLo, cone } = PRIM;

/** A fruit tree: a short trunk and a round low-poly crown (mango darker and wider, guava lighter). */
function treeGeo(item: VenueItemId): THREE.BufferGeometry {
  const leaf = item === 'guava' ? 0x6cbf4a : 0x2f8a3a, leaf2 = item === 'guava' ? 0x5aa83e : 0x3b9c44;
  return merge([
    part(cylLo, 0x7a5232, 0, 0.7, 0, 0, 0, 0, 0.2, 1.4, 0.2),
    part(cylLo, 0x7a5232, 0.25, 1.35, 0, 0, 0, -0.7, 0.08, 0.7, 0.08),
    part(sph, leaf, 0, 2.15, 0, 0, 0, 0, 1.25, 0.95, 1.2),
    part(sph, leaf2, 0.55, 2.4, 0.35, 0, 0, 0, 0.75, 0.6, 0.7),
    part(sph, leaf2, -0.6, 2.3, -0.3, 0, 0, 0, 0.7, 0.55, 0.7),
  ]);
}

/** Where the fruit hangs on a tree (front half of the crown, so it shows). */
const FRUIT_SPOTS = [[-0.7, 1.75, 0.75], [0.6, 1.7, 0.85], [0.05, 1.55, 1.05], [-0.95, 2.1, 0.4], [0.95, 2.05, 0.45], [0.3, 2.5, 0.95]] as const;
const FRUIT_GEO: Partial<Record<VenueItemId, THREE.BufferGeometry>> = {
  mango: merge([part(sphLo, 0xf2a31b, 0, 0, 0, 0, 0, 0.5, 0.14, 0.12, 0.18), part(sphLo, 0xe0592a, 0.05, 0.03, 0.06, 0, 0, 0, 0.08, 0.07, 0.08)]),
  guava: merge([part(sphLo, 0xc7dd5a, 0, 0, 0, 0, 0, 0, 0.14, 0.14, 0.14)]),
};

/** A raised dirt ring where a tree will be planted (shown before its level is bought). */
const PLOT_GEO = merge([part(cyl, 0x8a6a45, 0, 0.05, 0, 0, 0, 0, 0.55, 0.1, 0.55), part(cone, 0x5aa83e, 0, 0.22, 0, 0, 0, 0, 0.08, 0.3, 0.08)]);

/** The juice stand: a green kiosk with a striped awning, the press (a drum with a crank) and the window counter. */
function standGeo(v: VenueDef): THREE.BufferGeometry {
  const b = v.kitchen.box, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, W = b.x1 - b.x0, D = b.z1 - b.z0;
  const p = [
    part(box, 0x2f9a5a, cx, 1.1, cz, 0, 0, 0, W, 2.2, D),
    part(box, 0xf6c23e, cx, 2.3, cz, 0, 0, 0, W + 0.1, 0.2, D + 0.1),
    part(box, 0x2a2f2a, v.window.x, 1.35, b.z1 + 0.005, 0, 0, 0, 2.2, 0.9, 0.02),
    part(box, 0xf3efe3, v.window.x, 0.9, b.z1 + 0.25, 0, 0, 0, 2.6, 0.08, 0.6),
    part(box, 0x2f9a5a, v.window.x, 0.43, b.z1 + 0.25, 0, 0, 0, 2.5, 0.86, 0.5),
    // the press by the drop spot: a steel drum on legs, a spout and a crank
    part(cyl, 0xb8bcc4, v.kitchen.input.x, 1.2, b.z1 + 0.35, 0, 0, 0, 0.45, 0.8, 0.45),
    part(cyl, 0x8c9098, v.kitchen.input.x, 1.62, b.z1 + 0.35, 0, 0, 0, 0.5, 0.06, 0.5),
    ...Q4.map(([a, c]) => part(box, 0x5a5f66, v.kitchen.input.x + a * 0.3, 0.4, b.z1 + 0.35 + c * 0.3, 0, 0, 0, 0.07, 0.8, 0.07)),
    part(cylLo, 0x8c9098, v.kitchen.input.x + 0.45, 1.0, b.z1 + 0.35, 0, 0, Math.PI / 2, 0.05, 0.3, 0.05),
  ];
  // striped awning over the window
  for (let i = 0; i < 6; i++) p.push(part(box, i % 2 ? 0xffffff : 0xf28c38, v.window.x - 1.25 + (i + 0.5) * (2.5 / 6), 2.0, b.z1 + 0.45, 0.4, 0, 0, 2.5 / 6, 0.06, 0.9));
  return merge(p);
}

/** The pigeon kitchen: a whitewashed room with a domed brick oven and the window counter. */
function kitchenGeo(v: VenueDef): THREE.BufferGeometry {
  const b = v.kitchen.box, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, W = b.x1 - b.x0, D = b.z1 - b.z0;
  const ox = v.kitchen.input.x;
  return merge([
    part(box, 0xf1e6cf, cx, 1.15, cz, 0, 0, 0, W, 2.3, D),
    part(box, 0x8a5a32, cx, 2.38, cz, 0, 0, 0, W + 0.2, 0.16, D + 0.2),
    part(box, 0x2a2f2a, v.window.x, 1.35, b.z1 + 0.005, 0, 0, 0, 2.0, 0.9, 0.02),
    part(box, 0xf3efe3, v.window.x, 0.9, b.z1 + 0.25, 0, 0, 0, 2.4, 0.08, 0.6),
    part(box, 0xb3542a, v.window.x, 0.43, b.z1 + 0.25, 0, 0, 0, 2.3, 0.86, 0.5),
    // brick oven (فرن بلدي) at the drop spot, with its dark mouth and a chimney
    part(box, 0xa8553a, ox, 0.45, b.z1 + 0.4, 0, 0, 0, 1.1, 0.9, 0.8),
    part(sph, 0xb8623f, ox, 0.9, b.z1 + 0.4, 0, 0, 0, 0.55, 0.5, 0.42),
    part(sph, 0x2a1a12, ox, 0.75, b.z1 + 0.81, 0, 0, 0, 0.22, 0.2, 0.03),
    part(cylLo, 0x7a3b2a, ox + 0.3, 1.55, b.z1 + 0.3, 0, 0, 0, 0.1, 0.6, 0.1),
  ]);
}

/** The pigeon tower (برج حمام): a tall mud cone ringed with clay pots for nests and perches, white top. */
function towerGeo(x: number, z: number): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const y = 0.45 + i * 0.85, r = 1.45 - i * 0.14;
    p.push(part(cyl, i % 2 ? 0xc9a26b : 0xbf9660, x, y, z, 0, 0, 0, r, 0.9, r));
    // nest pots (dark mouths) and a ring of perch sticks
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + i * 0.4;
      if (i > 0) p.push(part(sphLo, 0x3a2a1a, x + Math.cos(a) * (r - 0.02), y + 0.1, z + Math.sin(a) * (r - 0.02), 0, 0, 0, 0.1, 0.1, 0.1));
      if (i % 2 === 1) p.push(part(cylLo, 0x7a5232, x + Math.cos(a) * (r + 0.12), y - 0.35, z + Math.sin(a) * (r + 0.12), Math.PI / 2, -a, 0, 0.02, 0.3, 0.02));
    }
  }
  p.push(part(cone, 0xf4f1e8, x, 5.85, z, 0, 0, 0, 0.75, 0.9, 0.75));
  p.push(part(sph, 0xf4f1e8, x, 6.35, z, 0, 0, 0, 0.15, 0.15, 0.15));
  // the door, facing the camera
  p.push(part(box, 0x6b4426, x, 0.75, z + 1.42, 0, 0, 0, 0.7, 1.5, 0.06));
  return merge(p);
}

/** A grey pigeon in flight (wings drawn spread). */
const BIRD_GEO = merge([
  part(sphLo, 0x9aa3b0, 0, 0, 0, 0, 0, 0, 0.12, 0.1, 0.2),
  part(sphLo, 0x8a93a3, 0, 0.05, 0.17, 0, 0, 0, 0.08, 0.08, 0.08),
  part(box, 0xb8c0cc, 0, 0.02, 0, 0, 0, 0, 0.6, 0.02, 0.14),
  part(box, 0x6f7886, 0, 0.0, -0.2, 0, 0, 0, 0.12, 0.02, 0.12),
]);

/** The water wheel (ساقية) and its channel, drawn once orchard.water is bought. */
function sakiaGeo(): { frame: THREE.BufferGeometry; wheel: THREE.BufferGeometry } {
  const frame = merge([
    part(box, 0x8a5a32, 0, 1.2, -0.6, 0, 0, 0, 0.16, 2.4, 0.16),
    part(box, 0x8a5a32, 0, 1.2, 0.6, 0, 0, 0, 0.16, 2.4, 0.16),
    part(box, 0x8a6a45, 0, 0.1, 0, 0, 0, 0, 2.8, 0.2, 1.9),
    part(box, 0x4aa8e0, 0, 0.21, 0, 0, 0, 0, 2.5, 0.04, 1.4),
  ]);
  const w: THREE.BufferGeometry[] = [part(cylLo, 0x6b4426, 0, 0, 0, Math.PI / 2, 0, 0, 0.12, 1.3, 0.12)];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    w.push(part(box, 0x9a6b3a, Math.cos(a) * 0.65, Math.sin(a) * 0.65, 0, 0, 0, a, 1.3, 0.08, 0.08));
    w.push(part(cylLo, 0xb8732e, Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0, Math.PI / 2, 0, 0, 0.12, 0.3, 0.12));
  }
  w.push(part(cylLo, 0x6b4426, 0, 0, 0.18, Math.PI / 2, 0, 0, 1.3, 0.06, 1.3));
  return { frame, wheel: merge(w) };
}

class Tag {
  readonly s: CanvasSprite;
  private text = '';
  constructor(worldW = 2.2) { this.s = new CanvasSprite(300, 64, worldW); }
  set(text: string): void {
    if (text === this.text) return;
    this.text = text;
    this.s.draw((c, w, h) => {
      c.font = `800 36px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'ltr';
      const tw = c.measureText(text).width + 28;
      c.fillStyle = 'rgba(28,38,18,0.78)'; rr(c, (w - tw) / 2, 4, tw, h - 8, 18); c.fill();
      c.fillStyle = '#fff'; c.fillText(text, w / 2, h / 2 + 2);
    });
  }
  reset(): void { this.text = ''; }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

/** One venue: ground + lock, its sources (trees or the tower), the kitchen/stand, the window stock, cash, visitors. */
class OneVenueView {
  readonly root = new THREE.Group();
  private lock: THREE.Group;
  private srcRoots: THREE.Group[] = [];
  private plots: THREE.Mesh[] = [];
  private fruit: (THREE.InstancedMesh | null)[] = [];
  private shown: number[] = [];
  private pile: InstancedStack | null = null;
  private cups = new Map<VenueItemId, THREE.InstancedMesh>();
  private cupsShown = new Map<VenueItemId, number>();
  private cash: InstancedStack;
  private sign: CanvasSprite;
  private inputTag = new Tag(2.0);
  private visitors: CharacterView[] = [];
  private birds: THREE.InstancedMesh | null = null;
  private sakia: THREE.Group | null = null;
  private wheel: THREE.Mesh | null = null;
  private time = 0;

  constructor(scene: THREE.Scene, private v: VenueDef) {
    const g = v.ground;
    const groundMesh = new THREE.Mesh(merge([ground(g, v.id === 'orchard' ? 0x8fbf5a : 0xd8c49a, 0.011)]), MAT);
    this.lock = lockOverlay(scene, g);
    this.root.add(groundMesh);
    v.sources.forEach((s) => {
      const r = new THREE.Group();
      r.position.set(s.x, 0, s.z);
      if (v.id === 'orchard') {
        r.add(new THREE.Mesh(treeGeo(s.item), MAT), blob(1.2));
        const fg = FRUIT_GEO[s.item]!;
        const fm = new THREE.InstancedMesh(fg, MAT, FRUIT_SPOTS.length);
        fm.count = 0;
        fm.frustumCulled = false;
        r.add(fm);
        this.fruit.push(fm);
        const plot = new THREE.Mesh(PLOT_GEO, MAT);
        plot.position.set(s.x, 0, s.z);
        this.plots.push(plot);
        this.root.add(plot);
      } else {
        r.position.set(0, 0, 0);
        r.add(new THREE.Mesh(towerGeo(s.x, s.z), MAT));
        this.fruit.push(null);
        this.plots.push(new THREE.Mesh());
        const at = s.pick ?? s;
        this.pile = new InstancedStack(s.item, 24, gridSlots(s.item, 3, 2, 0.62), at.x, 0.02, at.z - 0.45);
        r.add(this.pile.group);
        this.birds = new THREE.InstancedMesh(BIRD_GEO, MAT, 24);
        this.birds.count = 0;
        this.birds.frustumCulled = false;
        r.add(this.birds);
      }
      this.srcRoots.push(r);
      this.shown.push(-1);
      this.root.add(r);
    });
    this.root.add(new THREE.Mesh(v.id === 'orchard' ? standGeo(v) : kitchenGeo(v), MAT));
    // the drop spot (what it takes), the cash spot
    const icons = [...new Set(v.kitchen.recipes.flatMap((r) => Object.keys(r.inputs) as VenueItemId[]))].map((k) => ITEM_ICON[k]).join('');
    const dm = groundMarker(icons.slice(0, 2), 1.5, 'rgba(255,214,140,0.35)', '#e8a23a');
    dm.position.set(v.kitchen.input.x, 0, v.kitchen.input.z);
    const cm = groundMarker('', 1.4, 'rgba(94,198,208,0.35)', '#5ec6d0');
    cm.position.set(v.window.cash.x, 0, v.window.cash.z);
    this.cash = new InstancedStack('bill', 40, gridSlots('bill', 2, 3, 0.34), v.window.cash.x, 0.03, v.window.cash.z, 0.08, 23 + v.id.length);
    this.root.add(dm, cm, this.cash.group);
    this.inputTag.s.sprite.position.set(v.kitchen.input.x, 2.7, v.kitchen.box.z1 + 0.4);
    this.root.add(this.inputTag.s.sprite);
    // what's for sale on the window counter (one instanced mesh per product)
    const b = v.kitchen.box;
    for (const r of v.kitchen.recipes) {
      const m = new THREE.InstancedMesh(ITEM_GEO[r.output], MAT, 12);
      m.count = 0;
      m.frustumCulled = false;
      this.cups.set(r.output, m);
      this.cupsShown.set(r.output, -1);
      this.root.add(m);
    }
    this.sign = new CanvasSprite(360, 80, 2.8);
    this.sign.sprite.position.set((b.x0 + b.x1) / 2, 3.2, (b.z0 + b.z1) / 2);
    this.root.add(this.sign.sprite);
    this.invalidate();
    // a few visitors at the window while there's something to buy
    const looks = [{ shirt: 0x5ec6d0, pants: 0x3b4a6b, skin: 0xd9a074, hair: 0x1d1d1d }, { shirt: 0xd96aa7, pants: 0x2e2e2e, skin: 0xf1c7a0, hair: 0x5a3a22 }, { shirt: 0x7a5cc4, pants: 0x6b4a2b, skin: 0xc68a5a, hair: 0x1d1d1d }];
    looks.forEach((o, i) => {
      const c = new CharacterView(o);
      // (a short line off the window's east end, so the counter stays in view)
      c.root.position.set(v.window.x + 1.05 + i * 0.25, 0, b.z1 + 0.95 + i * 0.8);
      c.root.rotation.y = Math.PI;
      this.visitors.push(c);
      this.root.add(c.root);
    });
    if (v.growTrack) {
      const sk = sakiaGeo();
      this.sakia = new THREE.Group();
      this.sakia.position.set(g.x0 + 1.0, 0, g.z0 + 1.1);
      this.sakia.rotation.y = Math.PI / 2;
      this.wheel = new THREE.Mesh(sk.wheel, MAT);
      this.wheel.position.set(0.2, 1.45, 0);
      // a water channel along the tree rows
      const ch = new THREE.Mesh(merge([part(box, 0x8a6a45, 0, 0.06, 0, 0, 0, 0, 0.6, 0.12, g.x1 - g.x0 - 2.0), part(box, 0x4aa8e0, 0, 0.13, 0, 0, 0, 0, 0.36, 0.03, g.x1 - g.x0 - 2.0)]), MAT);
      ch.position.set(0, 0, (g.x1 - g.x0) / 2);
      this.sakia.add(new THREE.Mesh(sk.frame, MAT), this.wheel, ch);
      this.root.add(this.sakia);
    }
    scene.add(this.root);
  }

  invalidate(): void {
    const text = this.v.id === 'orchard' ? '🧃 عصير مانجة' : '🍗 حمام محشي';
    this.sign.draw((c, w, h) => {
      c.font = `800 42px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'rtl';
      c.fillStyle = this.v.id === 'orchard' ? 'rgba(47,154,90,0.94)' : 'rgba(179,84,42,0.94)';
      rr(c, 6, 6, w - 12, h - 12, 22); c.fill();
      c.fillStyle = '#fff'; c.fillText(text, w / 2, h / 2 + 2);
    });
    this.inputTag.reset();
  }

  sync(sim: SimWorld, ven: Venue, dt: number): void {
    const open = ven.open;
    this.lock.visible = !open;
    this.time += dt;
    const v = this.v;
    // (the venue that isn't open yet keeps its ground, with a lock over it)
    for (const c of this.root.children) if (c !== this.root.children[0]) c.visible = open;
    if (!open) return;
    ven.sources.forEach((s, i) => {
      const r = this.srcRoots[i];
      r.visible = s.open;
      this.plots[i].visible = !s.open && v.id === 'orchard';
      const fm = this.fruit[i];
      if (fm && s.open) {
        const n = Math.min(FRUIT_SPOTS.length, s.n);
        if (n !== this.shown[i]) {
          this.shown[i] = n;
          for (let k = 0; k < n; k++) {
            const [fx, fy, fz] = FRUIT_SPOTS[k];
            fm.setMatrixAt(k, _m.compose(_p.set(fx, fy, fz), _q.setFromEuler(_e.set(0, k, 0)), _s.set(1, 1, 1)));
          }
          fm.count = n;
          fm.instanceMatrix.needsUpdate = true;
        }
      }
      if (!fm && this.pile) { this.pile.set(Math.min(24, s.n)); this.pile.update(dt); }
    });
    // pigeons circling the tower (more nests, more birds)
    if (this.birds) {
      const s = v.sources[0], nests = (v.nests?.start ?? 0) + sim.upgrades.level(v.nests!.track) * ECONOMY.upgrades[v.nests!.track].step;
      const n = Math.min(24, 4 + nests);
      for (let k = 0; k < n; k++) {
        const a = this.time * (0.6 + (k % 3) * 0.15) + (k / n) * Math.PI * 2, r = 2.2 + (k % 4) * 0.5, y = 4.2 + (k % 5) * 0.5 + Math.sin(this.time * 2 + k) * 0.2;
        _p.set(s.x + Math.cos(a) * r, y, s.z + Math.sin(a) * r);
        _q.setFromEuler(_e.set(0, -a, Math.sin(this.time * 10 + k) * 0.25));
        this.birds.setMatrixAt(k, _m.compose(_p, _q, _s.set(1, 1, 1)));
      }
      this.birds.count = n;
      this.birds.instanceMatrix.needsUpdate = true;
    }
    // the window's stock, side by side (products in turn), and the visitors while there's some
    const b = v.kitchen.box;
    let col = 0;
    for (const [item, m] of this.cups) {
      const n = Math.min(12, ven.stock[item] ?? 0);
      const first = col;
      col += 6;
      if (n === this.cupsShown.get(item)) continue;
      this.cupsShown.set(item, n);
      for (let k = 0; k < n; k++) {
        const slot = first + (k % 6), layer = Math.floor(k / 6);
        _p.set(v.window.x - 1.1 + (slot % 12) * 0.2 + (layer ? 0.1 : 0), 0.95 + layer * 0.02, b.z1 + 0.15 + layer * 0.25);
        m.setMatrixAt(k, _m.compose(_p, _q.identity(), _s.set(0.55, 0.55, 0.55)));
      }
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
    }
    const busy = ven.stockCount > 0;
    this.visitors.forEach((c, i) => {
      c.root.visible = busy && i < 1 + Math.min(2, sim.upgrades.level(v.window.track));
      if (c.root.visible) c.update(c.root.position.x, c.root.position.z, Math.PI, 0, dt, false);
    });
    this.cash.set(ven.cash.bills);
    this.cash.update(dt);
    const inside = Object.entries(ven.input).filter(([, n]) => n > 0).map(([k, n]) => `${ITEM_ICON[k as VenueItemId]} ${n}`).join(' ');
    this.inputTag.set(inside || `${ITEM_ICON[v.kitchen.recipes[0].output]} 0`);
    if (this.sakia) {
      const lv = sim.upgrades.level(v.growTrack!);
      this.sakia.visible = lv > 0;
      if (this.wheel) this.wheel.rotation.z -= dt * (0.6 + lv * 0.3);
    }
  }
}

/** The east: the orchard and the pigeon tower, and the gate in the factory yard's east fence. */
export class VenueView {
  private views: OneVenueView[];
  private gate: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    this.views = EAST.venues.map((v) => new OneVenueView(scene, v));
    // gate posts either side of the gap in the factory yard's east fence
    const f = EAST.fence;
    this.gate = new THREE.Mesh(merge([
      part(box, 0x6b4426, f.x, 0.7, f.gate.z0, 0, 0, 0, 0.22, 1.4, 0.22),
      part(box, 0x6b4426, f.x, 0.7, f.gate.z1, 0, 0, 0, 0.22, 1.4, 0.22),
      part(box, 0x8a5a32, f.x, 1.45, (f.gate.z0 + f.gate.z1) / 2, 0, 0, 0, 0.14, 0.14, f.gate.z1 - f.gate.z0 + 0.3),
    ]), MAT);
    this.gate.visible = false;
    scene.add(this.gate);
  }

  sync(sim: SimWorld, dt: number): void {
    this.views.forEach((v, i) => v.sync(sim, sim.venues.list[i], dt));
    this.gate.visible = sim.venues.open;
  }

  invalidate(): void { for (const v of this.views) v.invalidate(); }
}
