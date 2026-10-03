import { ECONOMY } from '../config/economy';
import { dist, moveToward } from './math';
import type { SimWorld } from './world';

/** A golden animal that escaped into the yard; the player has `t` seconds to catch it. */
export interface GoldenAnimal {
  station: number;
  x: number; z: number; rot: number; speed: number;
  tx: number; tz: number;
  t: number;
}

/** Spawns golden animals during active play; catching one pays a big cash reward. */
export class GoldenSystem {
  animal: GoldenAnimal | null = null;
  private t: number;

  constructor(private w: SimWorld) {
    this.t = this.gap();
  }

  private gap(): number {
    const g = ECONOMY.golden;
    return this.w.rng.range(g.gapMin, g.gapMax);
  }

  /** Cash for catching a golden animal of this station right now. */
  reward(station: number): number {
    const st = this.w.stations[station], p = ECONOMY.producers[st.def.producer];
    const perSec = (st.animals.length / p.interval) * ECONOMY.products[st.def.product].price * this.w.priceMult;
    return Math.round(Math.max(50, perSec * ECONOMY.golden.rewardSeconds));
  }

  /** Spawn one now (debug panel). */
  spawn(): void {
    const w = this.w, open = w.stations.filter((s) => s.open);
    if (!open.length || this.animal) return;
    const st = w.rng.pick(open), d = st.def;
    this.animal = { station: st.index, x: d.trough.x, z: d.trough.z + 0.8, rot: 0, speed: 0, tx: d.pile.x, tz: 1.5, t: ECONOMY.golden.lifetime };
    w.events.emit('golden', d.product, this.animal.x, this.animal.z, 0, 0, st.index);
  }

  update(dt: number): void {
    const w = this.w, cfg = ECONOMY.golden;
    if (w.away) return;
    const a = this.animal;
    if (!a) {
      this.t -= dt;
      if (this.t <= 0) {
        this.t = this.gap();
        if (w.upgrades.bought >= cfg.minUpgrades) this.spawn();
      }
      return;
    }
    a.t -= dt;
    // wander around the yard in front of its pen, quick little hops
    if (moveToward(a, a.tx, a.tz, 1.6, dt, 0.2)) {
      const d = w.stations[a.station].def;
      a.tx = w.rng.range(d.pile.x - 3, d.pile.x + 3);
      a.tz = w.rng.range(0, 2.4);
    }
    if (dist(w.player.x, w.player.z, a.x, a.z) < cfg.catchRadius) {
      const value = this.reward(a.station);
      w.money += value;
      w.stats.earned += value;
      w.stats.golden++;
      w.events.emit('goldenCaught', w.stations[a.station].def.product, a.x, a.z, value, 0, a.station);
      this.animal = null;
    } else if (a.t <= 0) {
      w.events.emit('goldenGone', '', a.x, a.z);
      this.animal = null;
    }
  }
}
