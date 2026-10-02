import * as THREE from 'three';
import type { Customer } from '../sim/customers';
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
  readonly bubble = new CanvasSprite(160, 100, 1.3);
  readonly items: ProductId[] = [];
  private shownLeft = -1;

  constructor(look: number) {
    this.char = new CharacterView(outfitOf(look));
    this.carrier = new CarrierView(this.char.root, 8);
    this.bubble.sprite.position.set(0, 2.6, 0);
    this.char.root.add(this.bubble.sprite);
  }

  drawBubble(product: ProductId, left: number): void {
    if (left === this.shownLeft) return;
    this.shownLeft = left;
    this.bubble.draw((c) => {
      rr(c, 6, 4, 148, 72, 26);
      c.fillStyle = '#ffffff';
      c.fill();
      c.beginPath(); c.moveTo(66, 74); c.lineTo(80, 96); c.lineTo(94, 74); c.fill();
      c.textBaseline = 'middle';
      c.textAlign = 'center';
      c.font = `44px ${EMOJI}`;
      c.fillText(ITEM_ICON[product], 52, 42);
      c.fillStyle = '#2b2a1f';
      c.font = `800 46px ${FONT}`;
      c.fillText(String(left), 108, 45);
    });
  }

  /** Force a redraw (after the web font loads). */
  invalidate(): void { this.shownLeft = -1; }
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
      v.items.length = carried;
      for (let i = 0; i < carried; i++) v.items[i] = c.product;
      v.bubble.sprite.visible = c.state === 'queue';
      if (c.state === 'queue') v.drawBubble(c.product, c.left);
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
