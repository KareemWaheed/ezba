import * as THREE from 'three';
import { ECONOMY } from '../config/economy';
import { RIVER } from '../config/river';
import type { SimWorld } from '../sim/world';
import { MAT, PRIM, merge, part } from './geo';
import { CanvasSprite, EMOJI, FONT, groundMarker, rr } from './canvas';
import { InstancedStack, gridSlots } from './stacks';
import { ground, lockOverlay } from './worldView';
import { typedCustomerView, type CustomerView } from './customers';

const { box, cyl, cone } = PRIM;

/** Fishing boat: white hull, red stripe, little cabin and a mast; bow toward +z. */
const BOAT_GEO = merge([
  part(box, 0xf3f3f3, 0, 0.35, 0, 0, 0, 0, 1.2, 0.5, 2.4),
  part(cone, 0xf3f3f3, 0, 0.35, 1.45, Math.PI / 2, 0, 0, 0.6, 0.5, 0.25),
  part(box, 0xc8463c, 0, 0.52, 0, 0, 0, 0, 1.22, 0.1, 2.42),
  part(box, 0x3d7fd9, 0, 0.95, -0.55, 0, 0, 0, 0.8, 0.7, 0.8),
  part(box, 0x9fd3f0, 0, 1.05, -0.14, 0, 0, 0, 0.6, 0.3, 0.04),
  part(cyl, 0x8a5a32, 0, 1.5, 0.4, 0, 0, 0, 0.05, 1.8, 0.05),
]);
/** Rental rowboat with two oars. */
const ROW_GEO = merge([
  part(box, 0x9a6233, 0, 0.22, 0, 0, 0, 0, 0.8, 0.3, 1.6),
  part(cone, 0x9a6233, 0, 0.22, 0.95, Math.PI / 2, 0, 0, 0.4, 0.3, 0.2),
  part(box, 0xc68a4b, 0, 0.36, 0, 0, 0, 0, 0.7, 0.04, 0.3),
  part(box, 0x7a4b2a, -0.55, 0.32, 0, 0, 0, 0.5, 0.9, 0.04, 0.08),
  part(box, 0x7a4b2a, 0.55, 0.32, 0, 0, 0, -0.5, 0.9, 0.04, 0.08),
]);

class Bubble {
  readonly s = new CanvasSprite(96, 96, 0.8);
  private shown = -1;
  /** k: 0..20 fill steps, -1 = just the icon. */
  draw(icon: string, k: number): void {
    if (k === this.shown) return;
    this.shown = k;
    this.s.draw((c) => {
      c.fillStyle = 'rgba(255,251,234,0.95)';
      c.beginPath(); c.arc(48, 48, 40, 0, Math.PI * 2); c.fill();
      if (k >= 0) {
        c.lineWidth = 8;
        c.strokeStyle = '#5cc858';
        c.beginPath(); c.arc(48, 48, 40, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * k) / 20); c.stroke();
      }
      c.font = `46px ${EMOJI}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(icon, 48, 52);
    });
  }
}

/** Stage 6: the river (always there as scenery), dock area, boats, visitors. */
export class RiverView {
  private dock = new THREE.Group();
  private lock: THREE.Group;
  private waves: THREE.InstancedMesh;
  private boats: { root: THREE.Group; crates: InstancedStack }[] = [];
  private rows: { root: THREE.Group; tag: Bubble }[] = [];
  private visitors = new Map<number, CustomerView>();
  private pile: InstancedStack;
  private cash: InstancedStack;
  private tieRing = new Bubble();
  private time = 0;
  private _m = new THREE.Matrix4();

  constructor(private scene: THREE.Scene) {
    const wtr = RIVER.water, bank = RIVER.bank, p = RIVER.pier;
    const g = [
      ground(wtr, 0x4aa3df, 0.01),
      ground(bank, 0xe9c98a, 0.012),
      // pier planks on posts
      part(box, 0xb07a44, (p.x0 + p.x1) / 2, 0.32, (p.z0 + p.z1) / 2, 0, 0, 0, p.x1 - p.x0, 0.12, p.z1 - p.z0),
    ];
    for (let z = p.z0 + 0.3; z < p.z1; z += 1.2) for (const x of [p.x0 + 0.1, p.x1 - 0.1]) g.push(part(cyl, 0x7a4b2a, x, 0.2, z, 0, 0, 0, 0.1, 0.6, 0.1));
    for (let z = p.z0 + 0.2; z < p.z1; z += 0.45) g.push(part(box, 0x9a6233, (p.x0 + p.x1) / 2, 0.385, z, 0, 0, 0, p.x1 - p.x0, 0.01, 0.04));
    // reeds along the bank
    for (let x = bank.x0 + 0.7; x < bank.x1; x += 2.3) g.push(part(cone, 0x5f9e35, x, 0.35, wtr.z1 + 0.15, 0, 0, 0, 0.12, 0.7, 0.12));
    const mesh = new THREE.Mesh(merge(g), MAT);
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    // drifting wave glints
    this.waves = new THREE.InstancedMesh(merge([part(box, 0xbfe6fb, 0, 0.02, 0, 0, 0, 0, 0.9, 0.01, 0.08)]), MAT, 26);
    this.waves.frustumCulled = false;
    scene.add(this.waves);
    // dock-area lock (the bank west of the corn)
    this.lock = lockOverlay(scene, { x0: -16.3, x1: -3.6, z0: -21.0, z1: -18.7 });
    // fish stall: wooden table with a blue awning, sign
    const st = RIVER.stall, b = st.box, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, w = b.x1 - b.x0, d = b.z1 - b.z0;
    const sg = [
      part(box, 0x9a6233, cx, 0.45, cz, 0, 0, 0, w, 0.9, d),
      part(box, 0x3d7fd9, cx, 1.0, cz, 0, 0, 0, w - 0.4, 0.15, d - 0.2),
      part(box, 0x7a4b2a, b.x0 + 0.08, 1.4, b.z0 + 0.08, 0, 0, 0, 0.08, 2.8, 0.08),
      part(box, 0x7a4b2a, b.x1 - 0.08, 1.4, b.z0 + 0.08, 0, 0, 0, 0.08, 2.8, 0.08),
    ];
    for (let i = 0; i < 5; i++) sg.push(part(box, i % 2 ? 0xffffff : 0x3d7fd9, b.x0 + (i + 0.5) * (w / 5), 2.75, cz + 0.1, 0.35, 0, 0, w / 5, 0.06, d + 0.6));
    const sign = new CanvasSprite(320, 80, 2.2);
    sign.draw((c, cw, ch) => {
      c.font = `800 44px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'rtl';
      c.fillStyle = 'rgba(30,91,198,0.92)'; rr(c, 6, 6, cw - 12, ch - 12, 22); c.fill();
      c.fillStyle = '#fff'; c.fillText('🐟 كشك السمك', cw / 2, ch / 2 + 2);
    });
    sign.sprite.position.set(cx, 3.6, b.z0);
    const drop = groundMarker('🐟', 1.5, 'rgba(255,255,255,0.3)', '#ffffff');
    drop.position.set(st.drop.x, 0, st.drop.z);
    const cm = groundMarker('', 1.4, 'rgba(94,198,208,0.35)', '#5ec6d0');
    cm.position.set(st.cash.x, 0, st.cash.z);
    this.cash = new InstancedStack('bill', 40, gridSlots('bill', 2, 3, 0.34), st.cash.x, 0.03, st.cash.z, 0.08, 13);
    const pal = new THREE.Mesh(merge([part(box, 0xb07a44, RIVER.pile.x, 0.04, RIVER.pile.z, 0, 0, 0, 1.6, 0.08, 1.6)]), MAT);
    this.pile = new InstancedStack('fish', ECONOMY.river.pileMax, gridSlots('fish', RIVER.pile.cols, RIVER.pile.rows), RIVER.pile.x, 0.08, RIVER.pile.z);
    const tie = groundMarker('🪢', 1.4, 'rgba(255,214,140,0.35)', '#e8a23a');
    tie.position.set(RIVER.tie.x, 0, RIVER.tie.z);
    this.tieRing.s.sprite.position.set(RIVER.tie.x, 2.2, RIVER.tie.z);
    this.dock.add(new THREE.Mesh(merge(sg), MAT), sign.sprite, drop, cm, this.cash.group, pal, this.pile.group, tie, this.tieRing.s.sprite);
    this.dock.visible = false;
    scene.add(this.dock);
  }

  sync(sim: SimWorld, dt: number): void {
    this.time += dt;
    const r = sim.river;
    // waves drift along the river
    const wtr = RIVER.water;
    for (let i = 0; i < 26; i++) {
      const x = wtr.x0 + ((i * 7.3 + this.time * 0.6) % (wtr.x1 - wtr.x0));
      const z = wtr.z1 - 1 - ((i * 3.7) % 9);
      this._m.makeTranslation(x, 0, z);
      this.waves.setMatrixAt(i, this._m);
    }
    this.waves.instanceMatrix.needsUpdate = true;
    this.lock.visible = !r.open;
    this.dock.visible = r.open;
    if (!r.open) return;
    this.pile.set(r.pile);
    this.pile.update(dt);
    this.cash.set(r.cash.bills);
    this.cash.update(dt);
    // fishing boats (bob on the water), crates on deck
    while (this.boats.length < r.boats.length) {
      const root = new THREE.Group();
      root.add(new THREE.Mesh(BOAT_GEO, MAT));
      const crates = new InstancedStack('fish', 12, gridSlots('fish', 2, 2, 0.5), 0, 0.6, 0.6);
      root.add(crates.group);
      this.scene.add(root);
      this.boats.push({ root, crates });
    }
    r.boats.forEach((b, i) => {
      const v = this.boats[i];
      v.root.position.set(b.x, Math.sin(this.time * 2 + i) * 0.05, b.z);
      v.root.rotation.y = b.rot;
      v.root.rotation.z = Math.sin(this.time * 1.6 + i) * 0.04;
      v.crates.set(b.crates);
      v.crates.update(dt);
    });
    // rowboats; a loose one shows a rope bubble until it's tied
    while (this.rows.length < r.rowboats.length) {
      const root = new THREE.Group();
      root.add(new THREE.Mesh(ROW_GEO, MAT));
      const tag = new Bubble();
      tag.s.sprite.position.set(0, 1.4, 0);
      root.add(tag.s.sprite);
      this.scene.add(root);
      this.rows.push({ root, tag });
    }
    let loose = 0;
    r.rowboats.forEach((b, i) => {
      const v = this.rows[i];
      v.root.position.set(b.x, Math.sin(this.time * 2.4 + i * 1.7) * 0.04, b.z);
      v.root.rotation.y = b.rot;
      v.tag.s.sprite.visible = b.state === 'untied';
      if (b.state === 'untied') { loose++; v.tag.draw('🪢', -1); }
    });
    this.tieRing.s.sprite.visible = loose > 0;
    if (loose > 0) this.tieRing.draw('🪢', r.tying > 0 ? Math.round(r.tying * 20) : -1);
    // visitors (tourists): walk in, queue, sit in a rowboat, walk off
    for (const vis of r.visitors) {
      let v = this.visitors.get(vis.id);
      if (!v) {
        v = typedCustomerView({ kind: 'normal', look: vis.look, type: 'tourist' });
        this.visitors.set(vis.id, v);
        this.scene.add(v.char.root);
      }
      const riding = vis.state === 'ride';
      v.char.update(vis.x, vis.z, vis.rot, riding ? 0 : vis.speed, dt, false, riding);
      if (riding) v.char.root.position.y = 0.15;
    }
    for (const [id, v] of this.visitors) {
      let here = false;
      for (const vis of r.visitors) if (vis.id === id) { here = true; break; }
      if (here) continue;
      this.scene.remove(v.char.root);
      v.carrier.dispose();
      this.visitors.delete(id);
    }
  }
}
