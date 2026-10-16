import { DECOR_BY_ID, HAT_BY_ID, OUTFIT_BY_ID, SHOP } from '../config/shop';
import type { SimWorld } from './world';

export type ShopKind = 'outfit' | 'hat' | 'decor';

/**
 * The decorations shop (config/shop.ts): what was bought (kept when the farm is sold) and what the farmer wears.
 * Ids are prefixed by kind in `owned` ("o:suit", "h:crown", "d:palms").
 */
export class ShopSystem {
  readonly owned = new Set<string>();
  outfit = 'farmer';
  hat = 'none';
  /** Bumped on every change (the renderer redraws the farmer and the decorations). */
  version = 0;

  constructor(private w: SimWorld) {}

  private def(kind: ShopKind, id: string): { price: number } | undefined {
    return kind === 'outfit' ? OUTFIT_BY_ID.get(id) : kind === 'hat' ? HAT_BY_ID.get(id) : DECOR_BY_ID.get(id);
  }

  has(kind: ShopKind, id: string): boolean {
    const d = this.def(kind, id);
    return !!d && (d.price === 0 || this.owned.has(`${kind[0]}:${id}`));
  }

  /** Decorations on the farm (each raises prices by SHOP.decorBonus). */
  get decorCount(): number {
    let n = 0;
    for (const d of SHOP.decor) if (this.owned.has(`d:${d.id}`)) n++;
    return n;
  }

  /** Buy (clothes and hats are put on right away). False when it's unknown, owned or too dear. */
  buy(kind: ShopKind, id: string): boolean {
    const w = this.w, d = this.def(kind, id);
    if (!d || this.has(kind, id) || w.money < d.price) return false;
    w.money -= d.price;
    this.owned.add(`${kind[0]}:${id}`);
    if (kind !== 'decor') this.wear(kind, id);
    else this.build();
    this.version++;
    return true;
  }

  /** Put on clothes or a hat already owned. */
  wear(kind: 'outfit' | 'hat', id: string): boolean {
    if (!this.has(kind, id)) return false;
    if (kind === 'outfit') this.outfit = id;
    else this.hat = id;
    this.version++;
    return true;
  }

  /** Decorations with a footprint turn solid (after buying, and on load). */
  build(): void {
    for (const d of SHOP.decor) {
      if (!d.solid || !this.owned.has(`d:${d.id}`)) continue;
      d.spots.forEach((s, i) => this.w.addSolid(`decor:${d.id}${i}`, { x0: s.x - d.solid!.hx, x1: s.x + d.solid!.hx, z0: s.z - d.solid!.hz, z1: s.z + d.solid!.hz }));
    }
  }
}
