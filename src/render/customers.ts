import * as THREE from 'three';
import type { Customer, OrderLine } from '../sim/customers';
import { CharacterView, type Outfit } from './character';
import { CarrierView } from './stacks';
import { CanvasSprite, EMOJI, FONT, rr } from './canvas';
import { ITEM_ICON } from './models';
import type { ProductId } from '../config/economy';

const SHIRTS = [0xe8554e, 0x4a90d9, 0x8e6cc4, 0x2fb59a, 0xf28c38, 0xd96aa7];
const PANTS = [0x3b4a6b, 0x5a4632, 0x2e2e2e, 0x6b4f8a];
const SKINS = [0xf1c7a0, 0xd9a074, 0xa86d45];
const HAIRS = [0x3b2414, 0x8b4513, 0xe0b04a, 0x1d1d1d, 0xc0582b];

function outfitOf(look: number): Outfit {
  return {
    shirt: SHIRTS[look % SHIRTS.length],
    pants: PANTS[(look >>> 4) % PANTS.length],
    skin: SKINS[(look >>> 8) % SKINS.length],
    hair: HAIRS[(look >>> 12) % HAIRS.length],
  };
}

/** One customer's visuals: body, carried items and the order bubble. */
class CustomerView {
  readonly char: CharacterView;
  readonly carrier: CarrierView;
  readonly bubble = new CanvasSprite(160, 152, 1.3);
  readonly items: ProductId[] = [];
  private shownKey = -1;

  constructor(look: number) {
    this.char = new CharacterView(outfitOf(look));
    this.carrier = new CarrierView(this.char.root, 8);
    this.bubble.sprite.position.set(0, 2.9, 0);
    this.char.root.add(this.bubble.sprite);
  }

  /** One row per order line (icon + items still wanted); two-line orders get a taller bubble. */
  drawBubble(lines: readonly OrderLine[]): void {
    let key = lines.length;
    for (const l of lines) key = key * 64 + l.left;
    if (key === this.shownKey) return;
    this.shownKey = key;
    this.bubble.draw((c, _w, h) => {
      const rows = lines.length, top = h - 30 - rows * 56;
      rr(c, 6, top, 148, rows * 56 + 16, 26);
      c.fillStyle = '#ffffff';
      c.fill();
      const tip = top + rows * 56 + 14;
      c.beginPath(); c.moveTo(66, tip); c.lineTo(80, h - 4); c.lineTo(94, tip); c.fill();
      c.textBaseline = 'middle';
      c.textAlign = 'center';
      lines.forEach((l, i) => {
        const y = top + 36 + i * 56;
        c.globalAlpha = l.left > 0 ? 1 : 0.35;
        c.font = `42px ${EMOJI}`;
        c.fillText(ITEM_ICON[l.product], 52, y);
        c.fillStyle = '#2b2a1f';
        c.font = `800 44px ${FONT}`;
        c.fillText(l.left > 0 ? String(l.left) : '✓', 108, y + 3);
        c.globalAlpha = 1;
      });
    });
  }

  /** Force a redraw (after the web font loads). */
  invalidate(): void { this.shownKey = -1; }
}

/** Maps sim customers to views; views are created on arrival and dropped when the customer leaves. */
export class CustomersView {
  private views = new Map<number, CustomerView>();

  constructor(private scene: THREE.Scene) {}

  update(list: readonly Customer[], dt: number): void {
    for (const c of list) {
      let v = this.views.get(c.id);
      if (!v) {
        v = new CustomerView(c.look);
        this.views.set(c.id, v);
        this.scene.add(v.char.root);
      }
      const carried = c.qty - c.left;
      v.items.length = 0;
      for (const l of c.lines) for (let i = l.left; i < l.qty; i++) v.items.push(l.product);
      v.bubble.sprite.visible = c.state === 'queue';
      if (c.state === 'queue') v.drawBubble(c.lines);
      v.char.update(c.x, c.z, c.rot, c.speed, dt, carried > 0);
      v.carrier.update(v.items, c.speed > 0.1 ? 1 : 0, dt);
    }
    if (this.views.size > list.length) {
      for (const [id, v] of this.views) {
        if (list.some((c) => c.id === id)) continue;
        this.scene.remove(v.char.root);
        v.bubble.dispose();
        v.carrier.dispose();
        this.views.delete(id);
      }
    }
  }

  invalidate(): void { for (const v of this.views.values()) v.invalidate(); }
}
