import { ECONOMY } from '../config/economy';
import type { StationDef } from '../config/stations';
import type { Box } from './math';
import type { Rng } from './rng';
import { moveToward } from './math';
import type { EventQueue } from './events';

export interface Animal {
  x: number; z: number; rot: number; speed: number;
  /** Wander target. */
  tx: number; tz: number;
  /** Seconds left standing still (pecking / grazing). */
  pause: number;
  /** Production timer. */
  t: number;
  /** 1 right after producing, decays to 0 (drives the hop animation). */
  hop: number;
  /** Seconds in the pen (a cow is ready for the butcher's at ECONOMY.butcher.readyAge; a calf grows until calfAge). */
  age: number;
  /** On its way to the butcher's (sim/butcher.ts moves it; it neither wanders nor produces). */
  leaving: boolean;
}

/** Barns stand inside each pen along the back fence; animals stay in front of this strip. */
export const BARN_DEPTH = 1.1;
const BACK = BARN_DEPTH + 1.3;

/** An item flying from an animal to its pile. Lands after `dur`. */
export interface Flight { active: boolean; x: number; z: number; t: number; dur: number }

/** Runtime state of one product chain (producers -> pile -> counter slot). */
export class Station {
  open: boolean;
  readonly animals: Animal[] = [];
  /** Items sitting in the pickup pile. */
  pile = 0;
  /** Items in flight toward the pile (reserved slots). */
  pending = 0;
  /** Items on the sell counter. Unlimited by design. */
  counter = 0;
  /** Seconds of feeding-trough boost left (production x feed.mult while > 0). */
  boostT = 0;
  /** Seconds the player has been refilling the trough. */
  refillT = 0;
  /** Pooled flights; inactive entries are reused. */
  readonly flights: Flight[] = [];

  /** Where the animals live; grows when the pen is expanded. */
  readonly area: Box;

  constructor(readonly def: StationDef, readonly index: number) {
    this.open = def.startsOpen;
    this.area = { ...(def.area ?? { x0: 0, x1: 0, z0: 0, z1: 0 }) };
  }

  /** Production stopped for now (an animal ran off in a storm). Never saved. */
  paused = false;

  /** Has animals (eggs, milk); corn doesn't (golden animals, troughs, rushes and pens skip it). */
  get farmed(): boolean { return !!this.def.producer; }

  /** Pile cap: animals' piles hold ECONOMY.pile.max; the corn pile by the grain stall has no limit. */
  get pileMax(): number { return this.farmed ? ECONOMY.pile.max : Infinity; }

  get pileFull(): boolean { return this.pile + this.pending >= this.pileMax; }

  addAnimal(rng: Rng): Animal {
    const a = this.area;
    const x = rng.range(a.x0 + 0.6, a.x1 - 0.6), z = rng.range(a.z0 + BACK, a.z1 - 0.6);
    // (grown, of mixed ages: ages aren't saved, and cows shouldn't all be ready for the butcher's at once;
    // spread by count, not drawn from rng, so adding ages didn't shift every seeded run)
    const B = ECONOMY.butcher, spread = (this.animals.length * 0.618) % 1;
    const animal: Animal = {
      x, z, rot: rng.range(0, 6.28), speed: 0, tx: x, tz: z, pause: rng.range(0, 2), t: rng.range(0, 2), hop: 0,
      age: B.calfAge + spread * (B.readyAge - B.calfAge), leaving: false,
    };
    this.animals.push(animal);
    return animal;
  }

  private launch(x: number, z: number): void {
    let f = this.flights.find((fl) => !fl.active);
    if (!f) { f = { active: false, x: 0, z: 0, t: 0, dur: 0 }; this.flights.push(f); }
    f.active = true; f.x = x; f.z = z; f.t = 0; f.dur = ECONOMY.pile.flyTime;
    this.pending++;
  }

  update(dt: number, rng: Rng, events: EventQueue): void {
    if (this.open) for (const f of this.flights) if (f.active) { f.t += dt; if (f.t >= f.dur) { f.active = false; this.pending--; this.pile++; } }
    if (!this.open || !this.def.producer) return;
    const cfg = ECONOMY.producers[this.def.producer];
    const area = this.area;
    const interval = this.boostT > 0 ? cfg.interval / ECONOMY.feed.mult : cfg.interval;
    if (this.boostT > 0) this.boostT = Math.max(0, this.boostT - dt);
    for (const a of this.animals) {
      if (a.leaving) continue;
      a.age += dt;
      if (a.pause > 0) { a.pause -= dt; a.speed = 0; }
      else if (moveToward(a, a.tx, a.tz, cfg.wanderSpeed, dt, 0.1)) {
        a.pause = rng.range(0.5, 2.5);
        a.tx = rng.range(area.x0 + 0.7, area.x1 - 0.7);
        a.tz = rng.range(area.z0 + BACK, area.z1 - 0.7);
      }
      // (a calf gives no milk yet)
      if (!this.paused && a.age >= ECONOMY.butcher.calfAge) a.t += dt;
      if (a.t >= interval) {
        if (!this.pileFull) {
          a.t -= interval;
          a.hop = 1;
          this.launch(a.x, a.z);
          events.emit('produce', this.def.product, a.x, a.z, 0, 0, this.index);
        } else a.t = interval; // wait until the pile has room
      }
      a.hop = Math.max(0, a.hop - dt * 3);
    }
  }
}
