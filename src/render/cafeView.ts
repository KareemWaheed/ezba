import * as THREE from 'three';
import { DISH_IDS, ECONOMY, type DishId } from '../config/economy';
import { CAFE } from '../config/cafe';
import type { SimWorld } from '../sim/world';
import type { CafeSystem } from '../sim/cafe';
import { MAT, PRIM, merge, part } from './geo';
import { CanvasSprite, EMOJI, FONT, groundMarker, rr } from './canvas';
import { InstancedStack, easeOutBack, gridSlots } from './stacks';
import { ITEM_GEO, ITEM_ICON } from './models';
import { CharacterView } from './character';
import { CarrierView } from './stacks';
import { CustomerView, typedCustomerView } from './customers';
import { hatGeo } from './accessories';

const { box, cyl } = PRIM;
const CLEANER = { shirt: 0x6cb6e0, pants: 0x2e2e2e, skin: 0xd9a074, hair: 0x3b2414 };
const WAITER = { shirt: 0xffffff, pants: 0x2e2e2e, skin: 0xc8916a, hair: 0x1d1d1d };

/** Round table + one chair on the customer side (+z), in plain and "nice" variants. */
function tableGeo(nice: boolean): THREE.BufferGeometry {
  const top = nice ? 0xfff4d6 : 0xb07a44, cloth = nice ? 0xd94f45 : 0x9a6233;
  return merge([
    part(cyl, cloth, 0, 0.72, 0, 0, 0, 0, 0.62, 0.06, 0.62),
    part(cyl, top, 0, 0.76, 0, 0, 0, 0, 0.56, 0.03, 0.56),
    part(cyl, 0x5a3a22, 0, 0.36, 0, 0, 0, 0, 0.07, 0.72, 0.07),
    part(cyl, 0x5a3a22, 0, 0.02, 0, 0, 0, 0, 0.3, 0.04, 0.3),
    // chair
    part(box, 0x8a5a32, 0, 0.42, 0.78, 0, 0, 0, 0.46, 0.06, 0.42),
    part(box, 0x8a5a32, 0, 0.75, 0.98, 0, 0, 0, 0.46, 0.6, 0.06),
    part(box, 0x6b4426, -0.18, 0.2, 0.62, 0, 0, 0, 0.05, 0.4, 0.05),
    part(box, 0x6b4426, 0.18, 0.2, 0.62, 0, 0, 0, 0.05, 0.4, 0.05),
    part(box, 0x6b4426, -0.18, 0.2, 0.94, 0, 0, 0, 0.05, 0.4, 0.05),
    part(box, 0x6b4426, 0.18, 0.2, 0.94, 0, 0, 0, 0.05, 0.4, 0.05),
  ]);
}
const TABLE_GEO = [tableGeo(false), tableGeo(true)];
const DIRTY_GEO = merge([
  part(cyl, 0xf2f2f2, -0.15, 0.8, 0.05, 0, 0, 0, 0.18, 0.03, 0.18),
  part(cyl, 0xc9a26b, -0.12, 0.82, 0.06, 0, 0, 0, 0.08, 0.02, 0.06),
  part(cyl, 0xf2f2f2, 0.18, 0.8, -0.1, 0, 0, 0, 0.15, 0.03, 0.15),
  part(cyl, 0xe0e0e0, 0.2, 0.86, 0.15, 0, 0, 0, 0.05, 0.12, 0.05),
]);

class TableView {
  readonly root = new THREE.Group();
  private mesh: THREE.Mesh;
  private dirty: THREE.Mesh;
  private food: THREE.Mesh;
  readonly cash: InstancedStack;
  private ring = new CanvasSprite(96, 96, 0.8);
  private ringShown = -1;
  private niceShown = -1;
  popT = 1;
  shown = false;

  constructor(scene: THREE.Scene, x: number, z: number) {
    this.root.position.set(x, 0, z);
    this.mesh = new THREE.Mesh(TABLE_GEO[0], MAT);
    this.dirty = new THREE.Mesh(DIRTY_GEO, MAT);
    this.food = new THREE.Mesh(ITEM_GEO.omelette, MAT);
    this.food.position.set(0, 0.79, 0.15);
    this.cash = new InstancedStack('bill', 8, gridSlots('bill', 2, 1, 0.3), 0.25, 0.8, -0.25, 0.1, 5);
    this.ring.sprite.position.set(0, 1.7, 0);
    this.root.add(this.mesh, this.dirty, this.food, this.cash.group, this.ring.sprite);
    this.root.visible = false;
    scene.add(this.root);
  }

  sync(sys: CafeSystem, i: number, dt: number, nice: number, eating: DishId | null): void {
    const t = sys.tables[i];
    const show = i < sys.tableCount;
    if (show && !this.shown) this.popT = 0;
    this.shown = show;
    this.root.visible = show;
    if (!show) return;
    if (nice !== this.niceShown) { this.niceShown = nice; this.mesh.geometry = TABLE_GEO[nice > 0 ? 1 : 0]; }
    if (this.popT < 1) { this.popT = Math.min(1, this.popT + dt * 4); this.root.scale.setScalar(Math.max(0.01, easeOutBack(this.popT))); }
    this.dirty.visible = t.dirty;
    this.food.visible = !!eating;
    if (eating) this.food.geometry = ITEM_GEO[eating];
    this.cash.set(Math.min(8, t.bills));
    this.cash.update(dt);
    // every dirty free table shows a 🧽 bubble (asks to be cleaned); the ring fills while cleaning
    const frac = t.dirty && !t.occupant ? t.cleanT / ECONOMY.cafe.cleanTime : -1;
    this.ring.sprite.visible = frac >= 0;
    const k = Math.round(frac * 20);
    if (frac >= 0 && k !== this.ringShown) {
      this.ringShown = k;
      this.ring.draw((c) => {
        c.lineWidth = 10;
        c.strokeStyle = 'rgba(0,0,0,0.25)';
        c.beginPath(); c.arc(48, 48, 36, 0, Math.PI * 2); c.stroke();
        c.strokeStyle = '#6cb6e0';
        c.beginPath(); c.arc(48, 48, 36, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); c.stroke();
        c.font = `34px ${EMOJI}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('🧽', 48, 50);
      });
    }
  }
}

/** Small text label sprite that redraws only when its text changes. */
class Label {
  readonly s: CanvasSprite;
  private text = '';
  constructor(w: number, worldW: number) { this.s = new CanvasSprite(w, 64, worldW); }
  set(text: string): void {
    if (text === this.text) return;
    this.text = text;
    this.s.draw((c, w, h) => {
      c.font = `800 38px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.direction = 'ltr';
      c.fillStyle = 'rgba(28,38,18,0.78)';
      const tw = c.measureText(text).width + 28;
      rr(c, (w - tw) / 2, 4, tw, h - 8, 18); c.fill();
      c.fillStyle = '#fff';
      c.fillText(text, w / 2, h / 2 + 2);
    });
  }
}

/** Everything that moves or changes in the café. */
export class CafeView {
  private root = new THREE.Group();
  private counter: Record<DishId, InstancedStack>;
  private counterLabel: Record<DishId, Label>;
  /** Per kitchen machine: input-count label and a flame/steam sprite while working. */
  private machineLabels: Label[] = [];
  private machineFx: CanvasSprite[] = [];
  private machineKeys: number[] = [];
  private cash: InstancedStack;
  private tables: TableView[];
  private customers = new Map<number, CustomerView>();
  private cleaners: { char: CharacterView; stack: CarrierView }[] = [];
  private time = 0;
  /** Dish being eaten at each table this frame (rebuilt in one pass). */
  private diners: (DishId | null)[] = [];

  constructor(private scene: THREE.Scene) {
    const cb = CAFE.counter;
    scene.add(this.root);
    const mk = (icon: string, x: number, z: number, fill = 'rgba(255,255,255,0.3)', stroke = '#ffffff') => {
      const m = groundMarker(icon, 1.4, fill, stroke);
      m.position.x = x;
      m.position.z = z;
      this.root.add(m);
    };
    for (const k of CAFE.kitchen) {
      mk(k.raw === 'egg' ? '🥚' : '🥛', k.input.x, k.input.z, 'rgba(255,214,140,0.35)', '#e8a23a');
      const lb = new Label(240, 2.0);
      lb.s.sprite.position.set((k.box.x0 + k.box.x1) / 2, 2.8, (k.box.z0 + k.box.z1) / 2);
      this.root.add(lb.s.sprite);
      this.machineLabels.push(lb);
      this.machineKeys.push(-1);
      const fx = new CanvasSprite(96, 96, 0.9);
      const icon = k.id === 'stove' ? '🔥' : '♨️';
      fx.draw((c) => { c.font = `70px ${EMOJI}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(icon, 48, 52); });
      fx.sprite.position.set((k.box.x0 + k.box.x1) / 2 - (k.id === 'stove' ? 0.45 : 0), k.id === 'stove' ? 1.45 : 2.3, (k.box.z0 + k.box.z1) / 2);
      this.root.add(fx.sprite);
      this.machineFx.push(fx);
    }
    mk('🍽️', cb.serve.x, cb.serve.z);
    mk('', CAFE.cash.x, CAFE.cash.z, 'rgba(94,198,208,0.35)', '#5ec6d0');
    this.counter = {} as Record<DishId, InstancedStack>;
    this.counterLabel = {} as Record<DishId, Label>;
    DISH_IDS.forEach((d) => {
      const sl = cb.slots[d];
      const ct = new InstancedStack(d, ECONOMY.cafe.counterVisualMax, gridSlots(d, sl.cols, 1, 0.42), sl.x, 0.96, sl.z);
      this.root.add(ct.group);
      this.counter[d] = ct;
      const lb = new Label(160, 1.0);
      lb.s.sprite.position.set(sl.x, 2.4, sl.z);
      this.root.add(lb.s.sprite);
      this.counterLabel[d] = lb;
    });
    const bills = gridSlots('bill', 2, 3, 0.34);
    this.cash = new InstancedStack('bill', 36, bills, CAFE.cash.x, 0.03, CAFE.cash.z, 0.08, 9);
    this.root.add(this.cash.group);
    this.tables = CAFE.tables.map(([x, z]) => new TableView(scene, x, z));
    this.root.visible = false;
  }

  sync(sim: SimWorld, dt: number): void {
    const cafe = sim.cafe;
    this.time += dt;
    this.root.visible = cafe.open;
    for (const t of this.tables) t.root.visible = cafe.open && t.shown;
    if (!cafe.open) return;
    for (const d of DISH_IDS) {
      const n = cafe.counter[d], vis = this.counter[d];
      vis.set(n);
      vis.update(dt);
      const lb = this.counterLabel[d];
      lb.s.sprite.visible = n > vis.max;
      if (n > vis.max) lb.set(`x${n}`);
    }
    // each machine: "🥚 12" style input count (redrawn only when it changes) + flame/steam while working
    cafe.machines.forEach((m, i) => {
      const n = m.conv.input[m.raw];
      if (n !== this.machineKeys[i]) { this.machineKeys[i] = n; this.machineLabels[i].set(`${m.icon} ${ITEM_ICON[m.raw]} ${n}`); }
      const fx = this.machineFx[i];
      fx.sprite.visible = !!m.conv.cooking && !m.conv.broken;
      fx.sprite.scale.setScalar(0.8 + Math.sin(this.time * 14 + i) * 0.12);
    });
    this.cash.set(cafe.cash.bills);
    this.cash.update(dt);

    // tables + who is eating where
    const nice = sim.upgrades.level('cafe.nice');
    const diners = this.diners;
    for (let i = 0; i < cafe.tables.length; i++) diners[i] = null;
    for (const c of cafe.customers) if (c.state === 'eat' && c.table >= 0) diners[c.table] = c.lines[0].product;
    for (let i = 0; i < cafe.tables.length; i++) this.tables[i].sync(cafe, i, dt, nice, diners[i]);

    // café customers (same views/bubbles as the shop)
    let front = null;
    for (const c of cafe.customers) if (c.state === 'queue') { front = c; break; }
    for (const c of cafe.customers) {
      let v = this.customers.get(c.id);
      if (!v) { v = typedCustomerView({ kind: 'normal', look: c.look, type: c.type }); this.customers.set(c.id, v); this.scene.add(v.char.root); }
      v.items.length = 0;
      if (c.state === 'queue' || c.state === 'toTable') for (const l of c.lines) for (let i = l.left; i < l.qty; i++) v.items.push(l.product);
      const full = c.state === 'angry' || c === front;
      v.bubble.sprite.visible = full;
      v.face.sprite.visible = !full && c.state === 'queue';
      if (full) v.draw(c);
      else if (c.state === 'queue') v.drawFace(c);
      v.char.update(c.x, c.z, c.rot, c.speed, dt, v.items.length > 0, c.state === 'eat');
      v.carrier.update(v.items, c.speed > 0.1 ? 1 : 0, dt);
    }
    if (this.customers.size > cafe.customers.length) {
      for (const [id, v] of this.customers) {
        if (cafe.customers.some((c) => c.id === id)) continue;
        this.scene.remove(v.char.root);
        v.bubble.dispose();
        v.face.dispose();
        v.carrier.dispose();
        this.customers.delete(id);
      }
    }

    // cleaners
    while (this.cleaners.length < cafe.cleaners.length) {
      const char = new CharacterView(CLEANER);
      const stack = new CarrierView(char.root, 8);
      this.scene.add(char.root);
      this.cleaners.push({ char, stack });
    }
    cafe.cleaners.forEach((cl, i) => {
      const v = this.cleaners[i];
      v.char.update(cl.x, cl.z, cl.rot, cl.speed, dt, cl.carryCash > 0);
    });

    // café cashier: stands behind the counter next to the serve spot, facing the line
    if (cafe.waiter && !this.waiter) {
      this.waiter = new CharacterView(WAITER);
      this.waiter.attach(merge(hatGeo({ kind: 'chef', color: 0xffffff })));
      this.scene.add(this.waiter.root);
    }
    if (this.waiter) {
      const s = CAFE.counter.serve, front = cafe.customers.some((c) => c.state === 'queue');
      this.waiter.update(s.x - 0.55, s.z + 0.15, 0, 0, dt, front);
    }
  }

  private waiter: CharacterView | null = null;

  /** World position of the café cash pile (for collect flyers). */
  cashSlot(i: number, out: THREE.Vector3): THREE.Vector3 { return this.cash.slotWorld(i, out); }

  invalidate(): void { for (const v of this.customers.values()) v.invalidate(); }
}

