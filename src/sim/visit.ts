/**
 * A buyer's truck visit (the wholesale trader in the yard, the seafood trucks at the river): it drives in, waits
 * parked while it's loaded, pays as it goes, and drives off. One state machine for both so they stay alike.
 */
export interface Visit {
  /** Items it came for, and how many are still to load. */
  want: number;
  left: number;
  state: 'arrive' | 'parked' | 'leave';
  /** 0..1 along the road while arriving/leaving. */
  k: number;
  /** Seconds left parked. */
  t: number;
  /** Money paid so far. */
  paid: number;
  /** Fraction of an item loaded toward the next one, and money owed below a whole unit. */
  part: number;
  owed: number;
}

export function newVisit(want: number, stay: number): Visit {
  return { want, left: want, state: 'arrive', k: 0, t: stay, paid: 0, part: 0, owed: 0 };
}

export interface VisitStep {
  /** Seconds to drive in or out. */
  drive: number;
  /** Seconds to load the whole lot. */
  loadTime: number;
  /** Someone is loading it right now (the player at the truck, or a worker). */
  loading: boolean;
  /** Take one item from the farm's stock (false = none left right now). */
  take: () => boolean;
  /** Price of one item. */
  price: () => number;
  /** Out of stock mid-load: 'end' sells what's loaded (the lot shrinks), 'wait' keeps waiting for more. */
  onEmpty: 'end' | 'wait';
  /** Pay out money (whole units). */
  pay: (m: number) => void;
}

/** What happened this step: 'done' = the lot is fully loaded, 'left' = it just drove off, 'gone' = off the road. */
export type VisitEvent = 'done' | 'left' | 'gone' | null;

/** One tick of a visit. */
export function stepVisit(v: Visit, dt: number, s: VisitStep): VisitEvent {
  if (v.state === 'arrive') { v.k = Math.min(1, v.k + dt / s.drive); if (v.k >= 1) v.state = 'parked'; return null; }
  if (v.state === 'leave') { v.k = Math.max(0, v.k - dt / s.drive); return v.k <= 0 ? 'gone' : null; }
  v.t -= dt;
  let ev: VisitEvent = null;
  if (s.loading && v.left > 0) {
    v.part += (v.want / s.loadTime) * dt;
    while (v.part >= 1 && v.left > 0) {
      v.part -= 1;
      if (!s.take()) {
        if (s.onEmpty === 'end') { v.want -= v.left; v.left = 0; }
        v.part = 0;
        break;
      }
      v.left--;
      v.owed += s.price();
    }
    // paid in whole units as it goes (the rest when the lot is done or it leaves)
    flush(v, s, v.left > 0);
    // (the full lot always gets its short loaded pause, even if the stay ran out this tick)
    if (v.left <= 0) { ev = 'done'; v.t = 1.5; }
  }
  if (!ev && v.t <= 0) {
    flush(v, s, false);
    v.state = 'leave';
    return 'left';
  }
  return ev;
}

function flush(v: Visit, s: VisitStep, wholeOnly: boolean): void {
  const m = wholeOnly ? Math.floor(v.owed) : Math.round(v.owed);
  if (m > 0) { s.pay(m); v.paid += m; }
  v.owed = wholeOnly ? v.owed - m : 0;
}

/** 0..1, fixed per n (a little variety without touching the world's random sequence). */
export function jitter(n: number, salt = 12.9898): number {
  const x = Math.sin(n * salt) * 43758.5453;
  return x - Math.floor(x);
}
