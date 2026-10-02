import { ECONOMY } from '../config/economy';
import { LAYOUT, SOLIDS } from '../config/layout';
import { STATIONS } from '../config/stations';
import { Rng } from './rng';
import { createPlayer, updatePlayer, type PlayerState } from './player';
import { Carrier } from './carrier';
import { Station } from './station';
import { CustomerSystem } from './customers';
import { UpgradeSystem } from './upgrades';
import { EventQueue } from './events';
import { dist } from './math';

/** Radii of the walk-in zones (units). */
export const ZONE = { pile: 1.35, drop: 1.25, cash: 1.3 } as const;

/** All gameplay state. Pure data + tick(); the renderer and the simulator both drive this. */
export class SimWorld {
  time = 0;
  money = 0;
  readonly rng: Rng;
  readonly player: PlayerState;
  readonly carry: Carrier;
  readonly stations: Station[];
  readonly customers: CustomerSystem;
  readonly upgrades: UpgradeSystem;
  readonly cash = { value: 0, bills: 0 };
  /** Lifetime counters (daily tasks, album and the simulator read these). */
  readonly stats = { earned: 0, served: 0, sold: 0 };
  readonly events = new EventQueue();
  /** Current stick input, magnitude 0..1. Set by the UI or the simulated player. */
  readonly input = { x: 0, z: 0 };
  /** Whether a cashier serves customers without the player present (M5). */
  cashier = false;
  /** True while simulating time away: the player can't carry, serve or pay. */
  away = false;

  private pickT = 0;
  private dropT = 0;

  constructor(seed = 1) {
    this.rng = new Rng(seed);
    this.player = createPlayer(LAYOUT.spawn.x, LAYOUT.spawn.z);
    this.carry = new Carrier(ECONOMY.player.capacity);
    this.stations = STATIONS.map((d, i) => new Station(d, i));
    this.customers = new CustomerSystem(this);
    this.upgrades = new UpgradeSystem(this);
    this.upgrades.apply();
    this.upgrades.refresh();
  }

  /** True when customers can take items right now. */
  get canServe(): boolean {
    const sp = LAYOUT.shop.servePoint;
    return this.cashier || (!this.away && dist(this.player.x, this.player.z, sp.x, sp.z) < ECONOMY.serveRadius);
  }

  /** Advance the simulation. Callers keep dt <= MAX_STEP. */
  tick(dt: number): void {
    this.time += dt;
    if (!this.away) updatePlayer(this.player, this.input.x, this.input.z, dt, SOLIDS, LAYOUT.bounds);
    for (const s of this.stations) s.update(dt, this.rng, this.events);
    if (!this.away) this.interact(dt);
    this.customers.update(dt, this.canServe);
    if (!this.away) this.upgrades.update(dt);
  }

  /** Walk-in zones: piles, counter drop spots, cash pile. */
  private interact(dt: number): void {
    const p = this.player, c = this.carry, cfg = ECONOMY.player;
    this.pickT -= dt;
    this.dropT -= dt;
    for (const s of this.stations) {
      if (!s.open) continue;
      const d = s.def;
      if (this.pickT <= 0 && s.pile > 0 && !c.full() && dist(p.x, p.z, d.pile.x, d.pile.z) < ZONE.pile) {
        s.pile--;
        c.push(d.product);
        this.pickT = cfg.pickInterval;
        this.events.emit('pick', d.product, d.pile.x, d.pile.z, 0, c.n, s.index);
      }
      if (this.dropT <= 0 && c.has(d.product) && dist(p.x, p.z, d.counter.dropX, d.counter.dropZ) < ZONE.drop) {
        c.take(d.product);
        s.counter++;
        this.dropT = cfg.dropInterval;
        this.events.emit('drop', d.product, d.counter.x, d.counter.z, 0, c.n, s.index);
      }
    }
    const cash = LAYOUT.shop.cash;
    if (this.cash.value > 0 && dist(p.x, p.z, cash.x, cash.z) < ZONE.cash) {
      const v = this.cash.value, n = this.cash.bills;
      this.money += v;
      this.stats.earned += v;
      this.cash.value = 0;
      this.cash.bills = 0;
      this.events.emit('collect', '', cash.x, cash.z, v, n);
    }
  }

  /** Advance by any amount of time in safe sub-steps. */
  advance(dt: number): void {
    while (dt > 1e-6) {
      const s = Math.min(dt, MAX_STEP);
      this.tick(s);
      dt -= s;
    }
  }
}

export const MAX_STEP = 1 / 30;
