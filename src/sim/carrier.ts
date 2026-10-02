import type { ItemId } from '../config/economy';

/** A stack of items carried by the player, a worker or a customer (bottom first). */
export class Carrier {
  readonly items: ItemId[] = [];
  constructor(public cap: number) {}

  get n(): number { return this.items.length; }
  full(): boolean { return this.items.length >= this.cap; }
  has(p: ItemId): boolean { return this.items.includes(p); }
  push(p: ItemId): void { this.items.push(p); }

  /** Remove the topmost item of product p. */
  take(p: ItemId): boolean {
    const i = this.items.lastIndexOf(p);
    if (i < 0) return false;
    this.items.splice(i, 1);
    return true;
  }
}
