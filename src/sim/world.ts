import { ECONOMY } from '../config/economy';
import { LAYOUT, SOLIDS } from '../config/layout';
import type { Box } from './math';
import { STATIONS } from '../config/stations';
import { Rng } from './rng';
import { createPlayer, updatePlayer, type PlayerState } from './player';
import { Carrier } from './carrier';
import { Station } from './station';
import { CustomerSystem } from './customers';
import { UpgradeSystem } from './upgrades';
import { StaffSystem, nextBreak } from './staff';
import { ServiceSystem } from './service';
import { RushSystem } from './rush';
import { GoldenSystem } from './golden';
import { CafeSystem } from './cafe';
import { ScenarioSystem } from './scenario';
import { ContractSystem } from './contracts';
import { FieldSystem } from './field';
import { AlbumSystem, DailySystem } from './meta';
import { FactorySystem } from './factory';
import { RiverSystem } from './river';
import { MarketSystem } from './market';
import type { Clock } from '../config/events';
import { EventQueue } from './events';
import { dist } from './math';
import { LEGACY } from '../config/legacy';
import { PATHS, type GameMode, type PathDef } from '../config/paths';
import { MARKET } from '../config/market';
import { UPGRADES } from '../config/upgrades';

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
  readonly staff: StaffSystem;
  readonly service: ServiceSystem;
  readonly rush: RushSystem;
  readonly golden: GoldenSystem;
  readonly cafe: CafeSystem;
  readonly scenario: ScenarioSystem;
  readonly contracts: ContractSystem;
  readonly field: FieldSystem;
  readonly factory: FactorySystem;
  readonly river: RiverSystem;
  readonly market: MarketSystem;
  readonly album: AlbumSystem;
  readonly daily: DailySystem;
  /** Real-world clock for seasonal events (the UI updates it; the simulator keeps the default). */
  clock: Clock = { weekday: 1, hour: 12, ramadan: false };
  readonly cash = { value: 0, bills: 0 };
  /** Lifetime counters (daily tasks, album and the simulator read these). */
  readonly stats = { earned: 0, served: 0, sold: 0, angry: 0, fast: 0, vips: 0, rushesCleared: 0, fixes: 0, golden: 0, feeds: 0, tables: 0, cafeServed: 0, scenariosWon: 0, trucks: 0, stalks: 0, crops: 0, goldenStalks: 0, rides: 0, marketServed: 0, marketStocked: 0 };
  readonly events = new EventQueue();
  /**
   * What the player can't walk through: the static layout (its fence boxes are shared and move as pens
   * grow) plus things this world has built since (grill, fish stall, supermarket). Per world, so a
   * simulator or check running several worlds never sees another world's buildings.
   */
  readonly solids: Box[] = [...SOLIDS];
  /** Bumped whenever this world adds a solid (route caches rebuild). */
  solidsVersion = 0;
  private built = new Set<string>();
  /** Walkable area; grows when walled plots are unlocked. */
  readonly bounds = { ...LAYOUT.bounds };
  /** Current stick input, magnitude 0..1. Set by the UI or the simulated player. */
  readonly input = { x: 0, z: 0 };
  /** True while simulating time away: the player can't carry, serve or pay. */
  away = false;
  /** Prestige level: how many times the farm was sold for a bigger one (config/legacy.ts). */
  legacy = 0;
  /** Trash button held: the top carried item is thrown away every trashInterval. Set by the UI. */
  trashing = false;

  private pickT = 0;
  private dropT = 0;
  private trashT = 0;

  /** The upgrade path of this game (config/paths.ts). */
  readonly path: PathDef;

  /** `mode`: farm first (the classic game) or supermarket first (the farm opens backwards). */
  constructor(seed = 1, readonly mode: GameMode = 'farm') {
    this.path = PATHS[mode];
    this.rng = new Rng(seed);
    const sp = mode === 'market' ? MARKET.startSpot : LAYOUT.spawn;
    this.player = createPlayer(sp.x, sp.z);
    this.carry = new Carrier(ECONOMY.player.capacity);
    this.stations = STATIONS.map((d, i) => new Station(d, i));
    this.customers = new CustomerSystem(this);
    this.staff = new StaffSystem(this);
    this.service = new ServiceSystem(this);
    this.rush = new RushSystem(this);
    this.golden = new GoldenSystem(this);
    this.cafe = new CafeSystem(this);
    this.scenario = new ScenarioSystem(this);
    this.contracts = new ContractSystem(this);
    this.field = new FieldSystem(this);
    this.factory = new FactorySystem(this);
    this.river = new RiverSystem(this);
    this.market = new MarketSystem(this);
    this.album = new AlbumSystem(this);
    this.daily = new DailySystem(this);
    this.upgrades = new UpgradeSystem(this);
    for (const [id, n] of Object.entries(this.path.startLevels)) this.upgrades.levels[id as keyof typeof this.upgrades.levels] = n;
    this.money = this.path.startMoney;
    this.upgrades.apply();
    this.upgrades.refresh();
    // a new store opens with some stock so the first shoppers can buy right away
    for (const s of this.market.shelves) {
      if (!s.open) continue;
      s.stock = this.path.startShelf;
      this.market.store[s.def.item] = this.path.startStore;
    }
  }

  /** What the animals produce per second at shop prices (scales rewards: events, tasks, album). */
  get perSec(): number {
    let v = 0;
    for (const st of this.stations) {
      if (st.open && st.def.producer) v += (st.animals.length / ECONOMY.producers[st.def.producer].interval) * ECONOMY.products[st.def.product].price * this.priceMult;
    }
    // the supermarket's margin (so rewards scale on the supermarket path before the farm exists)
    return v + this.market.marginPerSec;
  }

  /** Sale price multiplier from farm growth (see ECONOMY.market). */
  get priceMult(): number {
    return (1 + this.upgrades.bought * ECONOMY.market.growthPerUpgrade) * (1 + this.legacy * LEGACY.priceStep);
  }

  /** Milestone upgrades not bought yet (all bought = the farm can be sold for a bigger one). */
  get legacyMissing(): typeof UPGRADES[number][] {
    return UPGRADES.filter((d) => d.milestone && !this.path.hidden.includes(d.id) && this.upgrades.level(d.id) === 0);
  }

  /** Open checkout lanes (1 at the start). */
  get lanes(): number { return 1 + this.upgrades.level('shop.lanes'); }

  /** Cashiers hired (cashier i works lane i). */
  get cashiers(): number { return this.upgrades.level('cashier'); }

  /** True when the player stands close enough to a lane's checkout spot to serve it. */
  playerAtLane(lane: number): boolean {
    if (this.away) return false;
    const l = LAYOUT.shop.lanes[lane];
    return dist(this.player.x, this.player.z, l.x, LAYOUT.shop.serveZ) < ECONOMY.serveRadius;
  }

  /** Whether the front customer of a lane can be served right now (player there, or its cashier). */
  laneServed(lane: number): boolean { return lane < this.cashiers || this.playerAtLane(lane); }

  /** Seconds between items at a lane: player speed, or the slower cashier. */
  laneInterval(lane: number): number {
    const base = ECONOMY.customers.takeInterval;
    return this.playerAtLane(lane) ? base : base * this.staff.cashierSlow;
  }

  /** Advance the simulation. Callers keep dt <= MAX_STEP. */
  tick(dt: number): void {
    this.time += dt;
    if (!this.away) updatePlayer(this.player, this.input.x, this.input.z, dt, this.solids, this.bounds);
    for (const s of this.stations) s.update(dt, this.rng, this.events);
    if (!this.away) this.interact(dt);
    this.staff.update(dt);
    this.rush.update(dt);
    this.scenario.update(dt);
    this.contracts.update(dt);
    this.customers.update(dt);
    this.service.update(dt);
    this.golden.update(dt);
    this.cafe.update(dt);
    this.field.update(dt);
    this.factory.update(dt);
    this.river.update(dt);
    this.market.update(dt);
    if (!this.away) this.upgrades.update(dt);
  }

  /** Walk-in zones: piles, counter drop spots, cash pile. */
  private interact(dt: number): void {
    const p = this.player, c = this.carry, cfg = ECONOMY.player;
    this.pickT -= dt;
    this.dropT -= dt;
    this.trashT -= dt;
    // trash button: throw the top item away (a stack nothing takes right now never gets the player stuck)
    if (this.trashing && c.n > 0 && this.trashT <= 0) {
      const it = c.items.pop()!;
      this.trashT = cfg.trashInterval;
      this.events.emit('trash', it, p.x, p.z, 0, c.n);
    }
    for (const s of this.stations) {
      if (!s.open) continue;
      const d = s.def;
      if (this.pickT <= 0 && s.pile > 0 && !c.full() && dist(p.x, p.z, d.pile.x, d.pile.z) < ZONE.pile) {
        s.pile--;
        c.push(d.product);
        this.pickT = cfg.pickInterval;
        this.events.emit('pick', d.product, d.pile.x, d.pile.z, 0, c.n, s.index);
      }
      // items a waiting VIP-stage guest still needs are kept (only surplus goes on the counter)
      if (this.dropT <= 0 && c.has(d.product) && this.scenario.stillNeeds(d.product) < 0 && dist(p.x, p.z, d.counter.dropX, d.counter.dropZ) < ZONE.drop) {
        c.take(d.product);
        s.counter++;
        this.dropT = cfg.dropInterval;
        this.events.emit('drop', d.product, d.counter.x, d.counter.z, 0, c.n, s.index);
      } else if (this.pickT <= 0 && !c.has(d.product) && !c.full() && s.counter > 0
        && this.scenario.stillNeeds(d.product) > 0 && dist(p.x, p.z, d.counter.dropX, d.counter.dropZ) < ZONE.drop) {
        // a guest is waiting on the VIP stage: grab their items from the counter stock, empty-handed
        s.counter--;
        c.push(d.product);
        this.pickT = cfg.pickInterval * 2;
        this.events.emit('pick', d.product, d.counter.x, d.counter.z, 0, c.n, s.index);
      }
    }
    // feeding troughs: stand there to refill once the boost is (nearly) used up
    const fc = ECONOMY.feed;
    for (const s of this.stations) {
      const t = s.def.trough;
      if (!t) continue;
      if (s.open && s.boostT < fc.duration * fc.refillBelow && dist(p.x, p.z, t.x, t.z) < fc.radius) {
        s.refillT += dt;
        if (s.refillT >= fc.refillTime) {
          s.boostT = fc.duration;
          s.refillT = 0;
          this.stats.feeds++;
          this.events.emit('feed', s.def.product, t.x, t.z, 0, 0, s.index);
        }
      } else s.refillT = 0;
    }
    // jammed machines: stand next to one to fix it
    const bc = ECONOMY.breakdowns;
    for (const b of this.staff.machines) {
      if (!b.broken) continue;
      if (dist(p.x, p.z, b.mx, b.mz) < bc.fixRadius) {
        b.fixT += dt;
        if (b.fixT >= bc.fixTime) {
          b.broken = false;
          b.fixT = 0;
          b.breakT = nextBreak(this);
          this.stats.fixes++;
          this.events.emit('fixed', '', b.mx, b.mz, 0, 0, this.staff.machines.indexOf(b));
        }
      } else b.fixT = 0;
    }
    this.cafe.interact(dt);
    this.scenario.deliver(dt);
    this.contracts.interact(dt);
    const cash = LAYOUT.shop.cash;
    if (this.cash.value > 0 && dist(p.x, p.z, cash.x, cash.z) < ZONE.cash) {
      const v = this.cash.value, n = this.cash.bills;
      this.money += v;
      this.stats.earned += v;
      this.cash.value = 0;
      this.cash.bills = 0;
      this.events.emit('collect', '', cash.x, cash.z, v, n);
    }
    this.field.interact(dt);
    this.factory.interact(dt);
    this.river.interact(dt);
    this.market.interact(dt);
  }

  /** Make a box solid once (something built on ground the player can already reach). */
  addSolid(key: string, b: Box): void {
    if (this.built.has(key)) return;
    this.built.add(key);
    this.solids.push({ ...b });
    this.solidsVersion++;
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
