import { ECONOMY } from '../config/economy';
import type { StationDef } from '../config/stations';
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
}

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
  /** Pooled flights; inactive entries are reused. */
  readonly flights: Flight[] = [];

  constructor(readonly def: StationDef, readonly index: number) {
    this.open = def.startsOpen;
  }

  get pileFull(): boolean { return this.pile + this.pending >= ECONOMY.pile.max; }

  addAnimal(rng: Rng): Animal {
    const a = this.def.area;
    const x = rng.range(a.x0 + 0.6, a.x1 - 0.6), z = rng.range(a.z0 + 0.8, a.z1 - 0.6);
    const animal: Animal = { x, z, rot: rng.range(0, 6.28), speed: 0, tx: x, tz: z, pause: rng.range(0, 2), t: rng.range(0, 2), hop: 0 };
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
    if (!this.open) return;
    const cfg = ECONOMY.producers[this.def.producer];
    const area = this.def.area;
    for (const a of this.animals) {
      if (a.pause > 0) { a.pause -= dt; a.speed = 0; }
      else if (moveToward(a, a.tx, a.tz, cfg.wanderSpeed, dt, 0.1)) {
        a.pause = rng.range(0.5, 2.5);
        a.tx = rng.range(area.x0 + 0.7, area.x1 - 0.7);
        a.tz = rng.range(area.z0 + 0.9, area.z1 - 0.7);
      }
      a.t += dt;
      if (a.t >= cfg.interval) {
        if (!this.pileFull) {
          a.t -= cfg.interval;
          a.hop = 1;
          this.launch(a.x, a.z);
          events.emit('produce', this.def.product, a.x, a.z, 0, 0, this.index);
        } else a.t = cfg.interval; // wait until the pile has room
      }
      a.hop = Math.max(0, a.hop - dt * 3);
    }
    for (const f of this.flights) {
      if (!f.active) continue;
      f.t += dt;
      if (f.t >= f.dur) { f.active = false; this.pending--; this.pile++; }
    }
  }
}
