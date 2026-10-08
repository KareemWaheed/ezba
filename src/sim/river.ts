import { ECONOMY, type ItemId } from '../config/economy';
import { RIVER } from '../config/river';
import type { WorkerJob } from './staff';
import type { SimWorld } from './world';
import { dist, moveToward } from './math';
import { jitter, newVisit, stepVisit, type Visit } from './visit';

export interface FishBoat {
  x: number; z: number; rot: number; speed: number;
  state: 'docked' | 'out' | 'back' | 'unload';
  /** Seconds left in this state. */
  t: number;
  /** Crates on board. */
  crates: number;
  slot: number;
}

export interface Rowboat {
  x: number; z: number; rot: number; speed: number;
  /** tied = ready to rent; ride = out with a visitor; untied = back, waiting to be tied up. */
  state: 'tied' | 'ride' | 'untied';
  t: number;
  /** Ride angle around the loop. */
  a: number;
  /** Ride leg: 0 out past the pier end, 1 loop, 2 back past the pier end, 3 into the slot. */
  leg: number;
  slot: number;
  rider: number;
}

export interface Visitor {
  id: number;
  look: number;
  x: number; z: number; rot: number; speed: number;
  state: 'walk' | 'queue' | 'ride' | 'leave' | 'angry';
  patience: number;
  patienceMax: number;
  gone: boolean;
}

/** A seafood company's truck at the river (the visit itself: sim/visit.ts). */
export interface FishTruck extends Visit { company: number }

/** River worker: fish pile -> the grill (while it wants fish) or the fish stall; also ties returned rowboats. */
class FishJob implements WorkerJob {
  readonly key = 'river.fish';
  constructor(private r: RiverSystem) {}
  loadAt(_w: SimWorld, slot: number, out: { x: number; z: number }): void {
    out.x = RIVER.pile.x + 1.0 - slot * 0.4;
    out.z = RIVER.pile.z + 1.0;
  }
  take(): ItemId | null {
    // (a seafood truck being loaded gets the pile: it pays better than the stall)
    if (this.r.pile <= 0 || this.r.truckLoading()) return null;
    this.r.pile--;
    return 'fish';
  }
  unloadAt(w: SimWorld, slot: number, out: { x: number; z: number }): void {
    const g = w.factory.machine('grill');
    const to = g && g.open && g.conv.wants('fish') ? g.def.input : RIVER.stall.drop;
    out.x = to.x + 0.4 - slot * 0.4;
    out.z = to.z + 0.4;
  }
  give(w: SimWorld, item: ItemId): boolean {
    const g = w.factory.machine('grill');
    if (g && g.open && g.conv.accept(item)) return true;
    this.r.sell(1);
    return true;
  }
}

/**
 * Stage 6 river dock: fishing boats bring crates to the fish pile; fish sells at the stall (or goes into
 * the grill, a factory machine). Visitors queue to rent rowboats; a returned boat has to be tied up
 * (player at the tie spot, or a river worker) before the next ride.
 */
export class RiverSystem {
  open = false;
  pile = 0;
  readonly cash = { value: 0, bills: 0 };
  readonly boats: FishBoat[] = [];
  readonly rowboats: Rowboat[] = [];
  readonly visitors: Visitor[] = [];
  private nextId = 1;
  private spawnT = 4;
  private sellT = 0;
  private pickT = 0;
  private tieT = 0;
  private job = new FishJob(this);
  /** Rowboats that were out/untied when the game was saved (applied once the boats exist). */
  pendingUntied = 0;
  /** The seafood truck waiting by the bank (null = none). Not saved. */
  truck: FishTruck | null = null;
  private truckT = 40;
  private trucks = 0;

  constructor(private w: SimWorld) {}

  get tripTime(): number {
    return ECONOMY.river.trip / (1 + this.w.upgrades.level('river.speed') * ECONOMY.upgrades['river.speed'].step);
  }

  get cratesPerTrip(): number {
    return ECONOMY.river.crates + this.w.upgrades.level('river.size') * ECONOMY.upgrades['river.size'].step;
  }

  sync(): void {
    const w = this.w, up = w.upgrades;
    this.open = up.level('river.unlock') > 0;
    const nBoats = this.open ? 1 + up.level('river.boats') : 0;
    while (this.boats.length < nBoats) {
      const i = this.boats.length, [x, z] = RIVER.moor[i];
      this.boats.push({ x, z, rot: Math.PI, speed: 0, state: 'docked', t: 2 + i * 4, crates: 0, slot: i });
    }
    const nRow = this.open ? 2 + up.level('river.rowboats') : 0;
    while (this.rowboats.length < nRow) {
      const i = this.rowboats.length, [x, z] = RIVER.rowSlots[i];
      this.rowboats.push({ x, z, rot: Math.PI, speed: 0, state: this.pendingUntied > 0 ? 'untied' : 'tied', t: ECONOMY.river.workerTie, a: 0, leg: 0, slot: i, rider: 0 });
      if (this.pendingUntied > 0) this.pendingUntied--;
    }
    const p = RIVER.pile;
    w.staff.ensureWorkers(this.job, up.level('river.worker'), p.x + 1.2, p.z + 1.4);
  }

  /** Sell `n` fish at the stall (money piles up there). */
  sell(n: number): void {
    const w = this.w, v = Math.round(n * ECONOMY.crops.fish.price * w.priceMult);
    this.cash.value += v;
    this.cash.bills = Math.min(40, this.cash.bills + n);
    if (!w.away) w.events.emit('cropSold', 'fish', RIVER.stall.drop.x, RIVER.stall.drop.z, v, 0, -1);
  }

  /** Sell one grilled fish at the stall (takeaway price, like the café's overflow). */
  private sellGrilled(): void {
    const w = this.w, v = Math.round(ECONOMY.dishes.grilledFish.price * ECONOMY.cafe.takeawayMult * w.priceMult);
    this.cash.value += v;
    this.cash.bills = Math.min(40, this.cash.bills + 1);
    w.events.emit('cropSold', 'grilledFish', RIVER.stall.drop.x, RIVER.stall.drop.z, v, 0, -1);
  }

  update(dt: number): void {
    if (!this.open) return;
    this.updateBoats(dt);
    this.updateRowboats(dt);
    this.updateVisitors(dt);
    this.updateTruck(dt);
  }

  /** Price a seafood company pays for one fish right now. */
  truckPrice(): number { return ECONOMY.crops.fish.price * this.w.priceMult * ECONOMY.river.trucks.price; }

  /** A parked seafood truck is being loaded right now (river workers, or the player at it). */
  truckLoading(): boolean {
    const v = this.truck, w = this.w, T = RIVER.truck;
    return !!v && v.state === 'parked' && v.left > 0
      && (w.upgrades.level('river.worker') > 0 || dist(w.player.x, w.player.z, T.load.x, T.load.z) < 1.3);
  }

  /**
   * Seafood trucks: with a big fish pile a company's truck drives along the bank and waits by the corn; the
   * player loads it at the truck (river workers do it on their own). Pays better than the stall.
   */
  private updateTruck(dt: number): void {
    const w = this.w, cfg = ECONOMY.river.trucks, T = RIVER.truck, v = this.truck;
    if (w.away) { this.truck = null; return; }
    const workers = w.upgrades.level('river.worker') > 0;
    if (!v) {
      if ((this.truckT -= dt) > 0) return;
      // (its own jitter, like the wholesale trader: the world's random sequence stays untouched)
      const n = ++this.trucks;
      this.truckT = cfg.every * (0.8 + 0.4 * jitter(n, 78.233));
      // a big pile; with river workers (who keep the pile low) it comes for what the boats bring meanwhile
      if (this.pile < cfg.min && !workers) return;
      const want = workers ? cfg.maxLoad : Math.min(cfg.maxLoad, this.pile);
      const company = n % cfg.companies.length;
      this.truck = { ...newVisit(want, cfg.stay), company };
      w.events.emit('fishTruck', 'fish', T.load.x, T.load.z, want, 1, company);
      return;
    }
    // (out of fish: the player's lot is what's there; workers keep loading as the boats bring more)
    const ev = stepVisit(v, dt, {
      drive: 4, loadTime: cfg.loadTime, onEmpty: workers ? 'wait' : 'end',
      loading: this.truckLoading(),
      take: () => { if (this.pile <= 0) return false; this.pile--; return true; },
      price: () => this.truckPrice(),
      pay: (m) => { w.money += m; w.stats.earned += m; },
    });
    if (ev === 'done') w.events.emit('fishTruck', 'fish', T.load.x, T.load.z, v.paid, 2, v.company);
    else if (ev === 'left') w.events.emit('fishTruck', 'fish', T.park.x, T.park.z, v.paid, 3, v.company);
    else if (ev === 'gone') this.truck = null;
  }

  private updateBoats(dt: number): void {
    const cfg = ECONOMY.river, sea = RIVER.sea;
    for (const b of this.boats) {
      const [mx, mz] = RIVER.moor[b.slot];
      b.t -= dt;
      switch (b.state) {
        case 'docked':
          b.speed = 0;
          if (b.t <= 0) { b.state = 'out'; b.t = this.tripTime; }
          break;
        case 'out':
          // sail away and fish off screen; head back once the trip time (minus the sail home) is up
          moveToward(b, sea.x + b.slot * 3, sea.z, 4, dt, 0.5);
          if (b.t <= 5) { b.state = 'back'; b.crates = this.cratesPerTrip; }
          break;
        case 'back':
          if (moveToward(b, mx, mz, 4, dt, 0.2)) { b.state = 'unload'; b.t = 0; b.rot = Math.PI; }
          break;
        case 'unload':
          b.speed = 0;
          if (b.t <= 0 && b.crates > 0 && this.pile < cfg.pileMax) {
            b.crates--;
            this.pile++;
            b.t = 0.25;
            if (!this.w.away) this.w.events.emit('produce', 'fish', mx, mz, 0, 0, -1);
          }
          if (b.crates <= 0) { b.state = 'docked'; b.t = 2; }
          break;
      }
    }
  }

  private updateRowboats(dt: number): void {
    const r = RIVER.ride, w = this.w;
    const workers = w.upgrades.level('river.worker');
    for (const b of this.rowboats) {
      const [sx, sz] = RIVER.rowSlots[b.slot];
      switch (b.state) {
        case 'tied':
          b.speed = 0;
          moveToward(b, sx, sz, 2, dt, 0.05);
          break;
        case 'ride': {
          b.t -= dt;
          const pe = RIVER.pierEnd;
          if (b.leg === 0) { if (moveToward(b, pe.x, pe.z, 3, dt, 0.3)) b.leg = 1; break; }
          if (b.leg === 1) {
            // paddle around the loop until it's time to head back
            b.a += dt * (Math.PI * 2) / (ECONOMY.river.ride - 6);
            moveToward(b, r.x + Math.cos(b.a) * r.rx, r.z + Math.sin(b.a) * r.rz, 3, dt, 0.05);
            if (b.t <= 4) b.leg = 2;
            break;
          }
          if (b.leg === 2) { if (moveToward(b, pe.x, pe.z, 3.5, dt, 0.3)) b.leg = 3; break; }
          if (moveToward(b, sx, sz, 3, dt, 0.1) || b.t < -8) {
            // back at the pier: the rider pays and goes; the boat waits to be tied up
            const v = this.visitorById(b.rider);
            if (v) {
              v.state = 'leave';
              const pay = Math.round(ECONOMY.river.ridePay * w.priceMult);
              this.cash.value += pay;
              this.cash.bills = Math.min(40, this.cash.bills + 2);
              w.stats.rides++;
              if (!w.away) w.events.emit('paid', '', RIVER.tie.x, RIVER.tie.z, pay);
            }
            b.rider = 0;
            b.state = 'untied';
            b.t = ECONOMY.river.workerTie;
          }
          break;
        }
        case 'untied':
          b.speed = 0;
          b.t -= dt;
          if (workers > 0 && b.t <= 0) b.state = 'tied';
          break;
      }
    }
  }

  private updateVisitors(dt: number): void {
    const w = this.w, cfg = ECONOMY.river, q = RIVER.queue;
    this.spawnT -= dt;
    let waiting = 0;
    for (const v of this.visitors) if (v.state === 'walk' || v.state === 'queue') waiting++;
    if (this.spawnT <= 0) {
      this.spawnT = cfg.visitorEvery * w.rng.range(0.7, 1.3);
      if (waiting < 5) {
        const sp = RIVER.visitorSpawn;
        this.visitors.push({ id: this.nextId++, look: w.rng.int(1 << 30), x: sp.x, z: sp.z, rot: 0, speed: 0, state: 'walk', patience: cfg.visitorPatience, patienceMax: cfg.visitorPatience, gone: false });
      }
    }
    let slot = 0;
    for (const v of this.visitors) {
      switch (v.state) {
        case 'walk':
        case 'queue': {
          const s = slot++;
          if (moveToward(v, q.x - s * q.gap, q.z, 2.2, dt, 0.08)) v.state = 'queue';
          if (v.state !== 'queue') break;
          v.patience -= dt;
          // front of the line takes a tied rowboat
          const boat = s === 0 ? this.boatIn('tied') : null;
          if (boat) {
            boat.state = 'ride';
            boat.t = cfg.ride;
            boat.a = Math.PI;
            boat.leg = 0;
            boat.rider = v.id;
            v.state = 'ride';
          } else if (v.patience <= 0) {
            v.state = 'angry';
            w.stats.angry++;
            if (!w.away) w.events.emit('angry', '', v.x, v.z, 0, 0, v.id);
          }
          break;
        }
        case 'ride': {
          // sits in the boat (the renderer places them)
          for (const b of this.rowboats) if (b.rider === v.id) { v.x = b.x; v.z = b.z; v.rot = b.rot; }
          break;
        }
        case 'leave':
        case 'angry':
          if (moveToward(v, RIVER.visitorSpawn.x, RIVER.visitorSpawn.z, 2.4, dt, 0.3)) v.gone = true;
          break;
      }
    }
    for (let i = this.visitors.length - 1; i >= 0; i--) if (this.visitors[i].gone) this.visitors.splice(i, 1);
  }

  /** Player: fish from the pile, fish into the stall, tie returned rowboats, collect the stall money. */
  interact(dt: number): void {
    if (!this.open) return;
    const w = this.w, p = w.player, c = w.carry, cfg = ECONOMY.player;
    this.pickT -= dt;
    this.sellT -= dt;
    const pl = RIVER.pile, st = RIVER.stall;
    if (this.pickT <= 0 && this.pile > 0 && !c.full() && dist(p.x, p.z, pl.x, pl.z) < 1.35) {
      this.pile--;
      c.push('fish');
      this.pickT = cfg.pickInterval;
      w.events.emit('pick', 'fish', pl.x, pl.z, 0, c.n, -1);
    }
    if (this.sellT <= 0 && dist(p.x, p.z, st.drop.x, st.drop.z) < 1.25) {
      // fish, and grilled fish from the grill next door (no long walk to the café needed)
      if (c.take('grilledFish')) { this.sellGrilled(); this.sellT = cfg.dropInterval; }
      else if (c.take('fish')) { this.sell(1); this.sellT = cfg.dropInterval; }
    }
    // tying up: stand at the tie spot; one boat at a time
    const t = RIVER.tie;
    const loose = this.boatIn('untied');
    if (loose && dist(p.x, p.z, t.x, t.z) < 1.3) {
      this.tieT += dt;
      if (this.tieT >= ECONOMY.river.tieTime) { loose.state = 'tied'; this.tieT = 0; w.events.emit('fixed', '', t.x, t.z); }
    } else this.tieT = 0;
    if (this.cash.value > 0 && dist(p.x, p.z, st.cash.x, st.cash.z) < 1.3) {
      const v = this.cash.value;
      w.money += v;
      w.stats.earned += v;
      w.events.emit('collect', '', st.cash.x, st.cash.z, v, this.cash.bills);
      this.cash.value = 0;
      this.cash.bills = 0;
    }
  }

  private boatIn(state: Rowboat['state']): Rowboat | null {
    for (const b of this.rowboats) if (b.state === state) return b;
    return null;
  }

  private visitorById(id: number): Visitor | null {
    for (const v of this.visitors) if (v.id === id) return v;
    return null;
  }

  /** Progress 0..1 of tying the current loose boat (for the ring). */
  get tying(): number { return this.tieT / ECONOMY.river.tieTime; }
}
