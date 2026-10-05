import * as THREE from 'three';
import { ECONOMY, type ItemId } from '../config/economy';
import { MARKET, SHELVES } from '../config/market';
import type { SimWorld } from '../sim/world';
import type { Shopper } from '../sim/market';
import { MAT, PRIM, merge, part } from './geo';
import { CanvasSprite, FONT, groundMarker, rr } from './canvas';
import { InstancedStack, gridSlots, type SlotFn } from './stacks';
import { ITEM_ICON } from './models';
import { CharacterView } from './character';
import { CustomerView, typedCustomerView } from './customers';
import { ground, lockOverlay } from './worldView';
import { hatGeo } from './accessories';

const { box, cyl } = PRIM;
const CASHIER = { shirt: 0xd94f45, pants: 0x2e2e2e, skin: 0xd9a074, hair: 0x1d1d1d };
/** Shelf header color per row (dairy/staples, pantry, deli/drinks). */
const ROW_COLOR = [0x3d7fd9, 0x3fae5a, 0xe8554e];
/** Items on shelves and racks are shown at this scale. */
const SHELF_SCALE = 0.55, RACK_SCALE = 0.45;

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
  // gondola shelves: base, back panel, three boards, colored header
  for (const sh of SHELVES) {
    const b = sh.box, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, w = b.x1 - b.x0, d = b.z1 - b.z0;
    g.push(
      part(box, 0xb9bec6, cx, 0.06, cz, 0, 0, 0, w, 0.12, d),
      part(box, 0xdfe3e8, cx, 0.75, b.z0 + 0.03, 0, 0, 0, w, 1.5, 0.06),
      part(box, 0x8f969f, b.x0 + 0.03, 0.75, cz, 0, 0, 0, 0.06, 1.5, d),
      part(box, 0x8f969f, b.x1 - 0.03, 0.75, cz, 0, 0, 0, 0.06, 1.5, d),
      part(box, ROW_COLOR[sh.row], cx, 1.58, b.z0 + 0.06, 0, 0, 0, w, 0.18, 0.08),
    );
    for (const y of [0.13, 0.55, 0.97]) g.push(part(box, 0xc8cdd4, cx, y, cz + 0.02, 0, 0, 0, w - 0.1, 0.03, d - 0.06));
  }
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
  private cashier: CharacterView | null = null;
  private time = 0;

  constructor(private scene: THREE.Scene) {
    this.lock = lockOverlay(scene, MARKET.plot);
    const mesh = new THREE.Mesh(storeGeo(), MAT);
    mesh.matrixAutoUpdate = false;
    this.root.add(mesh);
    // store sign over the back wall
    const sign = new CanvasSprite(512, 112, 5.2, false);
    sign.draw((c, w, h) => {
      c.fillStyle = '#d94f45'; rr(c, 6, 6, w - 12, h - 12, 28); c.fill();
      c.font = `800 60px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'rtl';
      c.fillStyle = '#fff'; c.fillText('🛒 سوبر ماركت العزبة', w / 2, h / 2 + 4);
    });
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
    this.lock.visible = !m.open && sim.factory.open;
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
    let front: Shopper | null = null;
    for (const c of m.shoppers) if (c.state === 'queue') { front = c; break; }
    for (const c of m.shoppers) {
      let v = this.shoppers.get(c.id);
      if (!v) { v = typedCustomerView({ kind: 'normal', look: c.look, type: c.type }); this.shoppers.set(c.id, v); this.scene.add(v.char.root); }
      // basket: what they picked and haven't had scanned yet
      v.items.length = 0;
      if (c.state !== 'leave' && c.state !== 'angry') for (let i = c.scanned; i < c.got.length; i++) v.items.push(c.got[i]);
      const waiting = c.state === 'shop' && c.waitT > 0;
      const full = c.state === 'angry' || c === front || waiting;
      v.bubble.sprite.visible = full;
      v.face.sprite.visible = !full && c.state === 'queue';
      if (full) v.draw(bubbleOf(c, c === front));
      else if (c.state === 'queue') v.drawFace(c);
      v.char.update(c.x, c.z, c.rot, c.speed, dt, v.items.length > 0);
      v.carrier.update(v.items, c.speed > 0.1 ? 1 : 0, dt);
    }
    if (this.shoppers.size > m.shoppers.length) {
      for (const [id, v] of this.shoppers) {
        if (m.shoppers.some((c) => c.id === id)) continue;
        this.dispose(v);
        this.shoppers.delete(id);
      }
    }
  }

  private clearShoppers(): void {
    for (const v of this.shoppers.values()) this.dispose(v);
    this.shoppers.clear();
  }

  private dispose(v: CustomerView): void {
    this.scene.remove(v.char.root);
    v.bubble.dispose();
    v.face.dispose();
    v.carrier.dispose();
  }

  invalidate(): void { for (const v of this.shoppers.values()) v.invalidate(); }
}

/** Bubble rows: at an empty shelf, the item they're waiting for; at the checkout, the basket (✓ once scanned). */
function bubbleOf(c: Shopper, checkout: boolean): { look: number; state: string; patience: number; patienceMax: number; lines: { product: ItemId; left: number }[] } {
  const lines: { product: ItemId; left: number }[] = [];
  if (checkout) {
    for (let i = 0; i < c.got.length; i++) {
      const it = c.got[i], l = lines.find((x) => x.product === it);
      const left = i >= c.scanned ? 1 : 0;
      if (l) l.left += left; else lines.push({ product: it, left });
    }
  } else {
    const l = c.lines[c.li];
    if (l) lines.push({ product: l.product, left: l.left });
  }
  return { look: c.look, state: c.state, patience: c.patience, patienceMax: c.patienceMax, lines: lines.slice(0, 3) };
}

