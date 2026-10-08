import * as THREE from 'three';
import { ECONOMY, type ItemId } from '../config/economy';
import { MARKET, SHELVES, type ShelfDef } from '../config/market';
import { FEATURES } from '../config/features';
import type { SimWorld } from '../sim/world';
import type { MarketSystem, Shopper } from '../sim/market';
import { MAT, PRIM, merge, part } from './geo';
import { CanvasSprite, EMOJI, FONT, groundMarker, rr } from './canvas';
import { InstancedStack, gridSlots, type SlotFn } from './stacks';
import { ITEM_ICON } from './models';
import { CharacterView } from './character';
import { CustomerView, typedCustomerView } from './customers';
import { ground, lockOverlay } from './worldView';
import { hatGeo } from './accessories';
import { StoreExtrasView } from './storeExtrasView';

const { box, cyl } = PRIM;
const CASHIER = { shirt: 0xd94f45, pants: 0x2e2e2e, skin: 0xd9a074, hair: 0x1d1d1d };
/** Shelf header color per row (dairy/staples, pantry, deli/drinks). */
const ROW_COLOR = [0x3d7fd9, 0x3fae5a, 0xe8554e];
/** Items on shelves and racks are shown at this scale. */
const SHELF_SCALE = 0.55, RACK_SCALE = 0.45;

type Parts = THREE.BufferGeometry[];

/** Dry goods: an open gondola shelf (base, back panel, sides, three boards, the row's colored header). */
function shelfParts(sh: ShelfDef): Parts {
  const b = sh.box, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, w = b.x1 - b.x0, d = b.z1 - b.z0;
  const g = [
    part(box, 0xb9bec6, cx, 0.06, cz, 0, 0, 0, w, 0.12, d),
    part(box, 0xdfe3e8, cx, 0.75, b.z0 + 0.03, 0, 0, 0, w, 1.5, 0.06),
    part(box, 0x8f969f, b.x0 + 0.03, 0.75, cz, 0, 0, 0, 0.06, 1.5, d),
    part(box, 0x8f969f, b.x1 - 0.03, 0.75, cz, 0, 0, 0, 0.06, 1.5, d),
    part(box, ROW_COLOR[sh.row], cx, 1.58, b.z0 + 0.06, 0, 0, 0, w, 0.18, 0.08),
  ];
  for (const y of [0.13, 0.55, 0.97]) g.push(part(box, 0xc8cdd4, cx, y, cz + 0.02, 0, 0, 0, w - 0.1, 0.03, d - 0.06));
  return g;
}

/**
 * Chilled goods: an upright glass-door fridge. White cabinet with a pale blue cold interior, wire shelves,
 * a lit header, and two glass doors drawn as a steel frame with handles (the goods show through).
 */
function fridgeParts(sh: ShelfDef): Parts {
  const b = sh.box, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, w = b.x1 - b.x0 + 0.1, d = b.z1 - b.z0 + 0.1;
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, front = cz + d / 2, H = 1.75, steel = 0xb8c2cc;
  const g = [
    // cabinet: plinth, back, sides, roof
    part(box, 0x5a6270, cx, 0.07, cz, 0, 0, 0, w, 0.14, d),
    part(box, 0xcfe9f7, cx, H / 2, z0 + 0.04, 0, 0, 0, w, H, 0.08),
    part(box, 0xf4f6f8, x0 + 0.04, H / 2, cz, 0, 0, 0, 0.08, H, d),
    part(box, 0xf4f6f8, x1 - 0.04, H / 2, cz, 0, 0, 0, 0.08, H, d),
    part(box, 0xf4f6f8, cx, H - 0.04, cz, 0, 0, 0, w, 0.08, d),
    // lit header strip and a cold-blue sign band
    part(box, 0x3d9fd9, cx, H + 0.09, front - 0.05, 0, 0, 0, w, 0.18, 0.1),
    part(box, 0xeaf8ff, cx, H - 0.12, cz, 0, 0, 0, w - 0.2, 0.03, d - 0.15),
    // door frames: top, bottom, the two outer stiles and the middle mullion; a handle each side of it
    part(box, steel, cx, H - 0.1, front, 0, 0, 0, w, 0.06, 0.04),
    part(box, steel, cx, 0.17, front, 0, 0, 0, w, 0.06, 0.04),
    part(box, steel, x0 + 0.05, H / 2, front, 0, 0, 0, 0.06, H - 0.2, 0.04),
    part(box, steel, x1 - 0.05, H / 2, front, 0, 0, 0, 0.06, H - 0.2, 0.04),
    part(box, steel, cx, H / 2, front, 0, 0, 0, 0.05, H - 0.2, 0.04),
    part(box, 0x2b2b2b, cx - 0.1, 0.95, front + 0.04, 0, 0, 0, 0.03, 0.35, 0.03),
    part(box, 0x2b2b2b, cx + 0.1, 0.95, front + 0.04, 0, 0, 0, 0.03, 0.35, 0.03),
  ];
  // wire shelves inside, at the same heights as the open shelves (the goods sit on them)
  for (const y of [0.13, 0.55, 0.97]) g.push(part(box, 0xdde6ee, cx, y, cz, 0, 0, 0, w - 0.18, 0.025, d - 0.14));
  return g;
}

/** Vegetables: a wooden market stand with three stepped crate tiers. */
function produceParts(sh: ShelfDef): Parts {
  const b = sh.box, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, w = b.x1 - b.x0, d = b.z1 - b.z0;
  const wood = 0xa8743f, dark = 0x7a5230;
  const g = [
    part(box, dark, cx, 0.06, cz, 0, 0, 0, w, 0.12, d),
    part(box, wood, cx, 0.75, b.z0 + 0.04, 0, 0, 0, w, 1.5, 0.08),
    part(box, dark, b.x0 + 0.04, 0.75, cz, 0, 0, 0, 0.08, 1.5, d),
    part(box, dark, b.x1 - 0.04, 0.75, cz, 0, 0, 0, 0.08, 1.5, d),
    part(box, 0x3fae5a, cx, 1.58, b.z0 + 0.06, 0, 0, 0, w, 0.18, 0.08),
  ];
  // a crate on each tier: bottom slab plus a low front lip
  for (const y of [0.13, 0.55, 0.97]) {
    g.push(part(box, wood, cx, y, cz + 0.02, 0, 0, 0, w - 0.12, 0.04, d - 0.06));
    g.push(part(box, dark, cx, y + 0.07, cz + d / 2 - 0.05, 0, 0, 0, w - 0.12, 0.1, 0.04));
  }
  return g;
}

/** Static store: floor, walls, sign, shelves, checkout, storeroom racks, desk. */
function storeGeo(): THREE.BufferGeometry {
  const P = MARKET.plot, g: THREE.BufferGeometry[] = [];
  g.push(ground(P, 0xf4f1ea, 0.015));
  // checker floor
  for (let x = P.x0; x < P.x1 - 0.01; x += 1.2) {
    for (let z = P.z0; z < P.z1 - 0.01; z += 1.2) {
      if ((Math.round((x - P.x0) / 1.2) + Math.round((z - P.z0) / 1.2)) % 2) continue;
      g.push(part(box, 0xe2ddd0, x + 0.6, 0.017, z + 0.6, 0, 0, 0, 1.2, 0.01, 1.2));
    }
  }
  // walls: tall back wall with a red band, lower side walls; a door frame over the back door
  const [back, west, east] = MARKET.walls;
  g.push(
    part(box, 0xf8f4ea, (west.x1 + back.x0) / 2, 2.85, (back.z0 + back.z1) / 2, 0, 0, 0, back.x0 - west.x1, 0.7, back.z1 - back.z0),
    part(box, 0x8a5a32, west.x1 + 0.05, 1.25, (back.z0 + back.z1) / 2, 0, 0, 0, 0.1, 2.5, 0.3),
    part(box, 0x8a5a32, back.x0 - 0.05, 1.25, (back.z0 + back.z1) / 2, 0, 0, 0, 0.1, 2.5, 0.3),
  );
  g.push(part(box, 0xf8f4ea, (back.x0 + back.x1) / 2, 1.6, (back.z0 + back.z1) / 2, 0, 0, 0, back.x1 - back.x0, 3.2, back.z1 - back.z0));
  g.push(part(box, 0xd94f45, (back.x0 + back.x1) / 2, 2.9, back.z1 + 0.01, 0, 0, 0, back.x1 - back.x0, 0.5, 0.04));
  for (const s of [west, east]) {
    g.push(part(box, 0xf8f4ea, (s.x0 + s.x1) / 2, 0.8, (s.z0 + s.z1) / 2, 0, 0, 0, s.x1 - s.x0, 1.6, s.z1 - s.z0));
    g.push(part(box, 0xd94f45, (s.x0 + s.x1) / 2, 1.62, (s.z0 + s.z1) / 2, 0, 0, 0, s.x1 - s.x0 + 0.04, 0.1, s.z1 - s.z0));
  }
  for (const sh of SHELVES) g.push(...(sh.unit === 'fridge' ? fridgeParts(sh) : sh.unit === 'produce' ? produceParts(sh) : shelfParts(sh)));
  // checkout: counter with a belt and a register
  const c = MARKET.checkout.box, ccx = (c.x0 + c.x1) / 2, ccz = (c.z0 + c.z1) / 2;
  g.push(
    part(box, 0x5a6270, ccx, 0.45, ccz, 0, 0, 0, c.x1 - c.x0, 0.9, c.z1 - c.z0),
    part(box, 0x2b2b2b, ccx + 0.2, 0.91, ccz, 0, 0, 0, c.x1 - c.x0 - 0.5, 0.03, c.z1 - c.z0 - 0.15),
    part(box, 0x5ec6d0, c.x0 + 0.3, 1.08, ccz - 0.05, 0, 0, 0, 0.42, 0.3, 0.34),
    part(box, 0x2b2b2b, c.x0 + 0.3, 1.25, ccz - 0.15, -0.4, 0, 0, 0.36, 0.04, 0.2),
  );
  // storeroom racks (metal frame, two levels) and the order desk with a tablet
  const r = MARKET.store.racks, rcx = (r.x0 + r.x1) / 2, rcz = (r.z0 + r.z1) / 2;
  for (const y of [0.05, 0.8]) g.push(part(box, 0x9aa3ad, rcx, y, rcz, 0, 0, 0, r.x1 - r.x0, 0.05, r.z1 - r.z0));
  for (let z = r.z0 + 0.05; z <= r.z1; z += (r.z1 - r.z0 - 0.1) / 4) {
    for (const x of [r.x0 + 0.04, r.x1 - 0.04]) g.push(part(box, 0x3d7fd9, x, 0.8, z, 0, 0, 0, 0.06, 1.6, 0.06));
  }
  const d = MARKET.desk.box, dcx = (d.x0 + d.x1) / 2, dcz = (d.z0 + d.z1) / 2;
  g.push(
    part(box, 0x8a5a32, dcx, 0.5, dcz, 0, 0, 0, d.x1 - d.x0, 1.0, d.z1 - d.z0),
    part(box, 0x2b2b2b, dcx - 0.1, 1.12, dcz, 0, 0, 0.5, 0.06, 0.32, 0.45),
    part(box, 0x9fd3f0, dcx - 0.13, 1.12, dcz, 0, 0, 0.5, 0.02, 0.27, 0.4),
  );
  // trolleys by the entrance
  for (const k of [0, 1]) {
    const x = 26.3 - k * 0.55, z = 26.5;
    g.push(
      part(box, 0xc0c6ce, x, 0.55, z, 0, 0, 0, 0.45, 0.35, 0.7),
      part(cyl, 0x2b2b2b, x - 0.15, 0.08, z - 0.25, 0, 0, Math.PI / 2, 0.07, 0.04, 0.07),
      part(cyl, 0x2b2b2b, x + 0.15, 0.08, z + 0.25, 0, 0, Math.PI / 2, 0.07, 0.04, 0.07),
    );
  }
  return merge(g);
}

/** A shopping trolley (families push one), built at the origin. */
const TROLLEY_GEO = merge([
  part(box, 0xc0c6ce, 0, 0.5, 0, 0, 0, 0, 0.45, 0.3, 0.6),
  part(box, 0x9aa3ad, 0, 0.36, 0, 0, 0, 0, 0.42, 0.03, 0.56),
  part(box, 0x2b2b2b, 0, 0.72, -0.3, 0, 0, 0, 0.5, 0.04, 0.04),
  part(cyl, 0x2b2b2b, -0.15, 0.07, -0.22, 0, 0, Math.PI / 2, 0.07, 0.04, 0.07),
  part(cyl, 0x2b2b2b, 0.15, 0.07, -0.22, 0, 0, Math.PI / 2, 0.07, 0.04, 0.07),
  part(cyl, 0x2b2b2b, -0.15, 0.07, 0.22, 0, 0, Math.PI / 2, 0.07, 0.04, 0.07),
  part(cyl, 0x2b2b2b, 0.15, 0.07, 0.22, 0, 0, Math.PI / 2, 0.07, 0.04, 0.07),
]);

/** 12 items on a shelf: 4 across on each of the three boards (local units, before SHELF_SCALE). */
const SHELF_SLOTS: SlotFn = (i, out) => {
  const board = Math.floor(i / 4), k = i % 4;
  out.set((k - 1.5) * (0.42 / SHELF_SCALE), [0.15, 0.57, 0.99][board] / SHELF_SCALE, 0);
};

/** Small text label sprite that redraws only when its text changes. */
class Label {
  readonly s: CanvasSprite;
  private text = '';
  constructor(w: number, worldW: number, private bg = 'rgba(28,38,18,0.78)') { this.s = new CanvasSprite(w, 64, worldW); }
  set(text: string): void {
    if (text === this.text) return;
    this.text = text;
    this.s.draw((c, w, h) => {
      c.font = `800 36px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.direction = 'ltr';
      c.fillStyle = this.bg;
      const tw = Math.min(w - 4, c.measureText(text).width + 26);
      rr(c, (w - tw) / 2, 4, tw, h - 8, 18); c.fill();
      c.fillStyle = '#fff';
      c.fillText(text, w / 2, h / 2 + 2);
    });
  }
}

/** Stage 7 supermarket visuals: the building, stock on shelves and racks, shoppers, cashier, cash pile. */
export class MarketView {
  private root = new THREE.Group();
  private lock: THREE.Group;
  private shelves: InstancedStack[] = [];
  private shelfLabels: Label[] = [];
  private empty: CanvasSprite[] = [];
  private racks: InstancedStack[] = [];
  private storeLabel = new Label(200, 1.3);
  private cash: InstancedStack;
  private shoppers = new Map<number, CustomerView>();
  private chips = new Map<number, ListChip>();
  private extras: StoreExtrasView;
  private cashier: CharacterView | null = null;
  private time = 0;
  /** Store sign over the back wall. */
  private sign = new CanvasSprite(640, 112, 6.2, false);

  constructor(private scene: THREE.Scene) {
    this.lock = lockOverlay(scene, MARKET.plot);
    this.extras = new StoreExtrasView(scene);
    const mesh = new THREE.Mesh(storeGeo(), MAT);
    mesh.matrixAutoUpdate = false;
    this.root.add(mesh);
    // store sign over the back wall
    const sign = this.sign;
    this.drawSign();
    const P = MARKET.plot;
    sign.sprite.position.set((P.x0 + P.x1) / 2, 4.0, P.z0 + 0.3);
    this.root.add(sign.sprite);
    // work spots
    const mk = (icon: string, x: number, z: number, size: number, fill: string, stroke: string) => {
      const m = groundMarker(icon, size, fill, stroke);
      m.position.x = x; m.position.z = z;
      this.root.add(m);
    };
    mk('📦', MARKET.store.x, MARKET.store.z, 1.7, 'rgba(255,214,140,0.35)', '#e8a23a');
    mk('📱', MARKET.desk.x, MARKET.desk.z, 1.4, 'rgba(159,211,240,0.35)', '#3d7fd9');
    mk('🧾', MARKET.checkout.serve.x, MARKET.checkout.serve.z, 1.4, 'rgba(255,255,255,0.3)', '#ffffff');
    mk('', MARKET.cash.x, MARKET.cash.z, 1.5, 'rgba(94,198,208,0.35)', '#5ec6d0');
    for (const sh of SHELVES) {
      mk(ITEM_ICON[sh.item], sh.front.x, sh.front.z, 1.0, 'rgba(255,255,255,0.2)', '#c8cdd4');
      const b = sh.box, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      const st = new InstancedStack(sh.item, ECONOMY.supermarket.shelfMax, SHELF_SLOTS, cx, 0, cz + 0.05);
      st.group.scale.setScalar(SHELF_SCALE);
      this.root.add(st.group);
      this.shelves.push(st);
      const lb = new Label(220, 1.25);
      lb.s.sprite.position.set(cx, 2.05, cz);
      this.root.add(lb.s.sprite);
      this.shelfLabels.push(lb);
      // "empty!" bubble when a shelf runs out
      const e = new CanvasSprite(96, 96, 0.75);
      e.draw((c) => {
        c.fillStyle = '#e8554e'; c.beginPath(); c.arc(48, 48, 40, 0, Math.PI * 2); c.fill();
        c.font = `800 60px ${FONT}`; c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', 48, 52);
      });
      e.sprite.position.set(cx + 0.75, 2.05, cz);
      this.root.add(e.sprite);
      this.empty.push(e);
    }
    // storeroom stock: one small stack per product along the rack (top shelf of the rack)
    const r = MARKET.store.racks, step = (r.z1 - r.z0) / MARKET.products.length;
    MARKET.products.forEach((p, i) => {
      const st = new InstancedStack(p.item, 6, gridSlots(p.item, 1, 1), (r.x0 + r.x1) / 2, 0.83, r.z0 + step * (i + 0.5));
      st.group.scale.setScalar(RACK_SCALE);
      this.root.add(st.group);
      this.racks.push(st);
    });
    this.storeLabel.s.sprite.position.set(MARKET.store.x, 2.2, MARKET.store.z - 0.6);
    this.root.add(this.storeLabel.s.sprite);
    this.cash = new InstancedStack('bill', 40, gridSlots('bill', 2, 3, 0.34), MARKET.cash.x, 0.03, MARKET.cash.z, 0.08, 17);
    this.root.add(this.cash.group);
    this.root.visible = false;
    scene.add(this.root);
  }

  sync(sim: SimWorld, dt: number): void {
    const m = sim.market;
    this.time += dt;
    this.lock.visible = FEATURES.supermarket && !m.open && sim.factory.open;
    this.root.visible = m.open;
    if (!m.open) { this.clearShoppers(); return; }
    m.shelves.forEach((s, i) => {
      const st = this.shelves[i];
      st.group.visible = s.open;
      this.empty[i].sprite.visible = s.open && s.stock === 0;
      // shelves of rows not bought yet stand empty with a lock tag (the 🗄️ tile opens the next row)
      if (!s.open) { this.shelfLabels[i].set('🔒'); return; }
      st.set(s.stock);
      st.update(dt);
      this.shelfLabels[i].set(`${ITEM_ICON[s.def.item]} ${Math.round(m.sellPrice(s.def.item))}`);
      if (s.stock === 0) this.empty[i].sprite.scale.setScalar(0.75 + Math.sin(this.time * 6 + i) * 0.06);
    });
    let total = 0;
    MARKET.products.forEach((p, i) => {
      const n = m.store[p.item] ?? 0;
      total += n;
      this.racks[i].set(Math.ceil(n / (ECONOMY.supermarket.storeMax / 6)));
      this.racks[i].update(dt);
    });
    let incoming = 0;
    for (const d of m.incoming) incoming += d.n;
    this.storeLabel.set(incoming ? `📦 ${total}  🚚 ${incoming}` : `📦 ${total}`);
    this.cash.set(m.cash.bills);
    this.cash.update(dt);
    this.syncShoppers(sim, dt);
    this.extras.sync(sim, dt);
    if (m.cashier && !this.cashier) {
      this.cashier = new CharacterView(CASHIER);
      this.cashier.attach(merge(hatGeo({ kind: 'cap', color: 0xd94f45 })));
      this.scene.add(this.cashier.root);
    }
    if (this.cashier) {
      const s = MARKET.checkout.serve;
      this.cashier.root.visible = true;
      this.cashier.update(s.x - 0.55, s.z - 0.1, 0, 0, dt, false);
    }
  }

  private syncShoppers(sim: SimWorld, dt: number): void {
    const m = sim.market;
    for (const c of m.shoppers) {
      let v = this.shoppers.get(c.id);
      if (!v) {
        v = typedCustomerView({ kind: 'normal', look: c.look, type: c.type });
        const chip = new ListChip(!!c.family);
        v.char.root.add(chip.s.sprite);
        // a family pushes a trolley
        if (c.family) { const t = new THREE.Mesh(TROLLEY_GEO, MAT); t.position.set(0, 0, 0.55); v.char.root.add(t); }
        this.chips.set(c.id, chip);
        this.shoppers.set(c.id, v);
        this.scene.add(v.char.root);
      }
      // basket: what they picked and haven't had scanned yet
      v.items.length = 0;
      if (c.state !== 'leave' && c.state !== 'angry') for (let i = c.scanned; i < c.got.length; i++) v.items.push(c.got[i]);
      // their shopping list (ticked off as they go), then their basket at the checkout; angry: the 😡 bubble
      const angry = c.state === 'angry', chip = this.chips.get(c.id)!;
      v.bubble.sprite.visible = angry;
      if (angry) v.draw(bubbleOf(c));
      v.face.sprite.visible = c.state === 'queue';
      if (c.state === 'queue') v.drawFace(c);
      chip.s.sprite.visible = !angry && c.state !== 'leave';
      if (chip.s.sprite.visible) chip.show(c, m);
      v.char.update(c.x, c.z, c.rot, c.speed, dt, v.items.length > 0);
      v.carrier.update(v.items, c.speed > 0.1 ? 1 : 0, dt);
    }
    if (this.shoppers.size > m.shoppers.length) {
      for (const [id, v] of this.shoppers) {
        if (m.shoppers.some((c) => c.id === id)) continue;
        this.dispose(v);
        this.chips.get(id)?.s.dispose();
        this.chips.delete(id);
        this.shoppers.delete(id);
      }
    }
  }

  private clearShoppers(): void {
    for (const v of this.shoppers.values()) this.dispose(v);
    for (const c of this.chips.values()) c.s.dispose();
    this.shoppers.clear();
    this.chips.clear();
  }

  private dispose(v: CustomerView): void {
    this.scene.remove(v.char.root);
    v.bubble.dispose();
    v.face.dispose();
    v.carrier.dispose();
  }

  /** The sign's text shrinks to fit (measured with the web font once it has loaded: see invalidate). */
  private drawSign(): void {
    this.sign.draw((c, w, h) => {
      c.fillStyle = '#d94f45'; rr(c, 6, 6, w - 12, h - 12, 28); c.fill();
      const text = '🛒 سوبر ماركت العزبة';
      c.font = `800 60px ${FONT}`;
      const size = Math.min(60, Math.floor((60 * (w - 64)) / c.measureText(text).width));
      c.font = `800 ${size}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'rtl';
      c.fillStyle = '#fff'; c.fillText(text, w / 2, h / 2 + 4);
    });
  }

  invalidate(): void {
    this.drawSign();
    this.extras.invalidate();
    for (const v of this.shoppers.values()) v.invalidate();
    for (const c of this.chips.values()) c.invalidate();
  }
}

/** The 😡 bubble of a shopper who gave up. */
function bubbleOf(c: Shopper): { look: number; state: string; patience: number; patienceMax: number; lines: { product: ItemId; left: number }[] } {
  return { look: c.look, state: c.state, patience: c.patience, patienceMax: c.patienceMax, lines: [] };
}

/**
 * Over a shopper's head: their shopping list while they shop (✓ for what's in the basket, the item they're
 * after highlighted, red while its shelf is empty) with a bar for how far along they are; on the way to and
 * in the checkout line, their basket: items scanned so far and what it comes to.
 */
class ListChip {
  readonly s: CanvasSprite;
  private key = '';
  constructor(private family: boolean) {
    this.s = family ? new CanvasSprite(470, 84, 3.6) : new CanvasSprite(288, 84, 2.2);
    this.s.sprite.position.set(0, 2.8, 0);
  }

  invalidate(): void { this.key = ''; }

  show(c: Shopper, m: MarketSystem): void {
    if (c.state === 'flee') {
      // a shoplifter on the run
      if (this.key === 'flee') return;
      this.key = 'flee';
      this.s.draw((ctx, w, h) => {
        ctx.fillStyle = '#e8554e'; rr(ctx, 4, 4, w - 8, h - 8, 22); ctx.fill();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
        ctx.font = `800 40px ${FONT}`; ctx.fillStyle = '#fff';
        ctx.fillText('🦹 حرامي!', w / 2, h / 2 + 3);
      });
      return;
    }
    const shopping = c.state === 'shop';
    let total = 0;
    for (const l of c.lines) total += l.qty;
    const basket = shopping ? 0 : Math.round(c.got.reduce((a, it) => a + m.sellPrice(it), 0));
    const empty = shopping && c.waitT > 0;
    const key = shopping
      ? `s${c.li}|${empty ? 1 : 0}|${c.lines.map((l) => l.left).join(',')}`
      : `q${c.scanned}/${c.got.length}|${basket}|${c.byPlayer ? 1 : 0}`;
    if (key === this.key) return;
    this.key = key;
    this.s.draw((ctx, w, h) => {
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      rr(ctx, 4, 4, w - 8, h - 8, 22); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = shopping ? '#c8cdd4' : '#3d7fd9'; ctx.stroke();
      const bar = (frac: number, color: string) => {
        ctx.fillStyle = '#e9e4d4'; rr(ctx, 18, h - 18, w - 36, 7, 4); ctx.fill();
        ctx.fillStyle = color; rr(ctx, 18, h - 18, Math.max(7, (w - 36) * frac), 7, 4); ctx.fill();
      };
      // families: a 👨‍👩‍👧 badge on the left
      const x0 = this.family ? 66 : 8;
      if (this.family) { ctx.font = `34px ${EMOJI}`; ctx.fillText('👨‍👩‍👧', 38, 34); }
      if (shopping) {
        const n = c.lines.length, cell = (w - 8 - x0) / Math.max(n, 1);
        c.lines.forEach((l, i) => {
          // (laid out left to right in list order)
          const x = x0 + cell * (i + 0.5), cur = i === c.li;
          if (cur) { ctx.fillStyle = empty ? '#ffd2cf' : '#fff1b8'; rr(ctx, x - cell / 2 + 3, 9, cell - 6, h - 30, 14); ctx.fill(); }
          ctx.globalAlpha = l.left > 0 || cur ? 1 : 0.45;
          ctx.font = `34px ${EMOJI}`;
          ctx.fillText(ITEM_ICON[l.product], x - 18, 34);
          ctx.font = `800 30px ${FONT}`;
          ctx.fillStyle = l.left > 0 ? (cur && empty ? '#d0342c' : '#2b2a1f') : '#2f9e44';
          ctx.fillText(l.left > 0 ? `${cur && empty ? '!' : ''}${l.left}` : '✓', x + 20, 36);
          ctx.globalAlpha = 1;
        });
        bar(total ? c.got.length / total : 0, '#f6c23e');
      } else {
        const ox = x0 - 8 + (this.family ? 20 : 0);
        ctx.font = `30px ${EMOJI}`;
        ctx.fillText('🧾', ox + 34, 34);
        ctx.font = `800 30px ${FONT}`;
        ctx.fillStyle = '#2b2a1f';
        ctx.direction = 'ltr';
        ctx.fillText(`${c.scanned}/${c.got.length}`, ox + 100, 36);
        ctx.fillStyle = '#2f8f3a';
        ctx.fillText(`${basket}`, ox + 196, 36);
        ctx.font = `26px ${EMOJI}`;
        ctx.fillText('💰', ox + 252, 34);
        // the tip for checking them out in person
        if (this.family) { ctx.font = `800 24px ${FONT}`; ctx.fillStyle = '#e8554e'; ctx.fillText(c.byPlayer ? '+30% 🙋' : '🙋 +30%?', ox + 322, 36); }
        bar(c.got.length ? c.scanned / c.got.length : 0, '#3d7fd9');
      }
    });
  }
}
