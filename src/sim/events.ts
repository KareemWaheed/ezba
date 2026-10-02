import type { ProductId } from '../config/economy';

export type SimEventType =
  | 'pick'      // player picked an item from a pile (n = stack size after)
  | 'drop'      // player dropped an item on a counter
  | 'sell'      // a customer took an item off the counter (id = customer)
  | 'paid'      // a customer finished and left cash (value)
  | 'collect'   // player collected the cash pile (value, n = bills)
  | 'produce'   // an animal produced an item (id = station index)
  | 'buy'       // an upgrade level was bought (id = UPGRADES index, n = new level)
  | 'angry'     // a customer gave up (id = customer)
  | 'tip'       // player earned a tip (value, n = combo)
  | 'rushWarn'  // rush warning started (product = featured, n = seconds)
  | 'rushStart'
  | 'rushEnd'   // value = bonus, n = 1 if cleared with no angry customers
  | 'break'     // a machine jammed (id = station)
  | 'fixed'     // the player fixed it (id = station)
  | 'feed'      // the player refilled a trough (id = station)
  | 'golden'    // a golden animal escaped (id = station)
  | 'goldenCaught' // value = reward
  | 'goldenGone'
  | 'vip';      // a VIP joined a line (id = customer, n = lane)

export interface SimEvent {
  type: SimEventType;
  product: ProductId | '';
  x: number; z: number;
  value: number;
  n: number;
  id: number;
}

/**
 * Fixed-size ring of reusable event objects. The renderer drains it each frame; if nobody drains it
 * (headless simulator), the oldest events are overwritten. No allocations after construction.
 */
export class EventQueue {
  private buf: SimEvent[];
  private start = 0;
  length = 0;

  constructor(private cap = 256) {
    this.buf = Array.from({ length: cap }, () => ({ type: 'pick', product: '', x: 0, z: 0, value: 0, n: 0, id: 0 }));
  }

  emit(type: SimEventType, product: ProductId | '' = '', x = 0, z = 0, value = 0, n = 0, id = 0): void {
    let i: number;
    if (this.length < this.cap) i = (this.start + this.length++) % this.cap;
    else { i = this.start; this.start = (this.start + 1) % this.cap; }
    const e = this.buf[i];
    e.type = type; e.product = product; e.x = x; e.z = z; e.value = value; e.n = n; e.id = id;
  }

  /** Visit events oldest-first, then clear. */
  drain(fn: (e: SimEvent) => void): void {
    for (let k = 0; k < this.length; k++) fn(this.buf[(this.start + k) % this.cap]);
    this.start = 0;
    this.length = 0;
  }
}
