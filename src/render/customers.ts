import * as THREE from 'three';
import { moodOf, type CustomerSystem, type Mood } from '../sim/customers';
import { CharacterView, type Outfit } from './character';
import { CarrierView } from './stacks';
import { CanvasSprite, EMOJI, FONT, rr } from './canvas';
import { ITEM_ICON } from './models';
import { MAT, PRIM, merge, part } from './geo';
import type { ItemId } from '../config/economy';

const SHIRTS = [0xe8554e, 0x4a90d9, 0x8e6cc4, 0x2fb59a, 0xf28c38, 0xd96aa7];
const PANTS = [0x3b4a6b, 0x5a4632, 0x2e2e2e, 0x6b4f8a];
const SKINS = [0xf1c7a0, 0xd9a074, 0xa86d45];
const HAIRS = [0x3b2414, 0x8b4513, 0xe0b04a, 0x1d1d1d, 0xc0582b];
const VIP: Outfit = { shirt: 0x1f1f2e, pants: 0x1f1f2e, skin: 0xf1c7a0, hair: 0x111111 };

const FACE: Record<Mood, string> = { happy: '😊', bored: '😐', angry: '😠' };
const RING: Record<Mood, string> = { happy: '#5cc858', bored: '#f2b33d', angry: '#e8554e' };

/** Gold crown + bow tie for VIPs (merged, shared). */
const VIP_GEO = merge([
  part(PRIM.cyl, 0xf5c542, 0, 1.78, -0.03, 0, 0, 0, 0.2, 0.14, 0.2),
  ...[0, 1, 2, 3, 4].map((i) => part(PRIM.cone, 0xf5c542, Math.cos((i / 5) * Math.PI * 2) * 0.16, 1.9, -0.03 + Math.sin((i / 5) * Math.PI * 2) * 0.16, 0, 0, 0, 0.05, 0.12, 0.05)),
  part(PRIM.sph, 0xe8554e, 0, 1.92, 0.15, 0, 0, 0, 0.04, 0.04, 0.04),
  part(PRIM.box, 0xd9b44a, 0, 1.18, 0.25, 0, 0, 0, 0.18, 0.08, 0.04),
]);

function outfitOf(look: number): Outfit {
  return {
    shirt: SHIRTS[look % SHIRTS.length],
    pants: PANTS[(look >>> 4) % PANTS.length],
    skin: SKINS[(look >>> 8) % SKINS.length],
    hair: HAIRS[(look >>> 12) % HAIRS.length],
  };
}

/** One customer's visuals: body, carried items and the order bubble with a patience ring. */
/** What a bubble needs: shop and café customers both fit this. */
export interface BubbleCustomer {
  kind?: 'normal' | 'vip';
  look: number;
  state: string;
  patience: number;
  patienceMax: number;
  lines: readonly { product: ItemId; left: number }[];
}

export class CustomerView {
  readonly char: CharacterView;
  readonly carrier: CarrierView;
  readonly bubble = new CanvasSprite(220, 152, 1.5);
  /** Small mood face + patience ring for customers further back in line. */
  readonly face = new CanvasSprite(72, 72, 0.6);
  private faceKey = -1;
  readonly items: ItemId[] = [];
  private shownKey = -1;

  constructor(c: Pick<BubbleCustomer, 'kind' | 'look'>, outfit?: Outfit) {
    const vip = c.kind === 'vip';
    this.char = new CharacterView(outfit ?? (vip ? VIP : outfitOf(c.look)));
    if (vip) this.char.body.add(new THREE.Mesh(VIP_GEO, MAT));
    this.carrier = new CarrierView(this.char.root, 8);
    this.bubble.sprite.position.set(0, 2.8, 0);
    this.face.sprite.position.set(0, 2.15, 0);
    this.char.root.add(this.bubble.sprite, this.face.sprite);
  }

  /**
   * Bubble: patience ring with a mood face on the left, then one row per order line.
   * Redrawn only when something visible changes (patience is quantized to 24 steps).
   */
  draw(c: BubbleCustomer): void {
    const lines = c.lines;
    const mood = moodOf(c);
    const angry = c.state === 'angry';
    const frac = Math.max(0, c.patience / c.patienceMax);
    let key = (angry ? 1 : 0) * 1e6 + Math.round(frac * 24) * 1e4 + lines.length * 1e3 + (c.kind === 'vip' ? 500 : 0);
    for (const l of lines) key = key * 3 + l.left;
    if (key === this.shownKey) return;
    this.shownKey = key;
    this.bubble.draw((ctx, w, h) => {
      const rows = angry ? 1 : lines.length;
      const top = h - 30 - rows * 56;
      ctx.fillStyle = c.kind === 'vip' ? '#fff3c4' : '#ffffff';
      rr(ctx, 4, top, w - 8, rows * 56 + 16, 26);
      ctx.fill();
      const tip = top + rows * 56 + 14;
      ctx.beginPath(); ctx.moveTo(w / 2 - 14, tip); ctx.lineTo(w / 2, h - 4); ctx.lineTo(w / 2 + 14, tip); ctx.fill();
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      // patience ring + face
      const cx = 40, cy = top + 8 + (rows * 56) / 2;
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#e9e4d4';
      ctx.beginPath(); ctx.arc(cx, cy, 25, 0, Math.PI * 2); ctx.stroke();
      if (!angry) {
        ctx.strokeStyle = RING[mood];
        ctx.beginPath(); ctx.arc(cx, cy, 25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
      }
      ctx.font = `30px ${EMOJI}`;
      ctx.fillText(angry ? '😡' : FACE[mood], cx, cy + 2);
      if (angry) return;
      lines.forEach((l, i) => {
        const y = top + 36 + i * 56;
        ctx.globalAlpha = l.left > 0 ? 1 : 0.35;
        ctx.font = `40px ${EMOJI}`;
        ctx.fillText(ITEM_ICON[l.product], 112, y);
        ctx.fillStyle = '#2b2a1f';
        ctx.font = `800 42px ${FONT}`;
        ctx.fillText(l.left > 0 ? String(l.left) : '✓', 172, y + 3);
        ctx.globalAlpha = 1;
      });
      if (c.kind === 'vip') { ctx.font = `26px ${EMOJI}`; ctx.fillText('⭐', w - 22, top + 10); }
    });
  }

  /** Compact indicator: mood face inside a patience ring. */
  drawFace(c: BubbleCustomer): void {
    const mood = moodOf(c), frac = Math.max(0, c.patience / c.patienceMax);
    const key = Math.round(frac * 16) * 4 + (mood === 'happy' ? 0 : mood === 'bored' ? 1 : 2);
    if (key === this.faceKey) return;
    this.faceKey = key;
    this.face.draw((ctx) => {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(36, 36, 30, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = RING[mood];
      ctx.beginPath(); ctx.arc(36, 36, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
      ctx.font = `34px ${EMOJI}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(FACE[mood], 36, 38);
    });
  }

  /** Force a redraw (after the web font loads). */
  invalidate(): void { this.shownKey = -1; this.faceKey = -1; }
}

/** Maps sim customers to views; views are created on arrival and dropped when the customer leaves. */
export class CustomersView {
  private views = new Map<number, CustomerView>();

  constructor(private scene: THREE.Scene) {}

  update(sys: CustomerSystem, dt: number): void {
    const list = sys.list;
    for (const c of list) {
      let v = this.views.get(c.id);
      if (!v) {
        v = new CustomerView(c);
        this.views.set(c.id, v);
        this.scene.add(v.char.root);
      }
      v.items.length = 0;
      for (const l of c.lines) for (let i = l.left; i < l.qty; i++) v.items.push(l.product);
      // full order bubble only for the customer being served (front of a lane) and for angry exits;
      // everyone else in line just shows a small mood/patience face
      const full = c.state === 'angry' || (c.state === 'queue' && sys.front(c.lane) === c);
      v.bubble.sprite.visible = full;
      v.face.sprite.visible = !full && c.state === 'queue';
      if (full) v.draw(c);
      else if (c.state === 'queue') v.drawFace(c);
      v.char.update(c.x, c.z, c.rot, c.speed, dt, v.items.length > 0);
      v.carrier.update(v.items, c.speed > 0.1 ? 1 : 0, dt);
    }
    if (this.views.size > list.length) {
      for (const [id, v] of this.views) {
        if (list.some((c) => c.id === id)) continue;
        this.scene.remove(v.char.root);
        v.bubble.dispose();
        v.face.dispose();
        v.carrier.dispose();
        this.views.delete(id);
      }
    }
  }

  invalidate(): void { for (const v of this.views.values()) v.invalidate(); }
}
