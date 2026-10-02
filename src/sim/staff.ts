import { ECONOMY } from '../config/economy';
import { Carrier } from './carrier';
import { dist, moveToward, turnToward } from './math';
import type { Station } from './station';
import type { SimWorld } from './world';

type WorkerState = 'toPile' | 'load' | 'toCounter' | 'unload';

/** A hired hand that shuttles items from a station's pile to its counter slot. */
export class Worker {
  x: number; z: number; rot = 0; speed = 0;
  state: WorkerState = 'toPile';
  readonly carry: Carrier;
  private t = 0;
  private wait = 0;

  constructor(readonly station: Station, readonly slot: number) {
    const d = station.def.pile;
    this.x = d.x + 1.2 + slot * 0.5;
    this.z = d.z + 1.4;
    this.carry = new Carrier(ECONOMY.staff.worker.capacity);
  }

  update(w: SimWorld, dt: number, speedMult: number): void {
    const cfg = ECONOMY.staff.worker, st = this.station, d = st.def;
    const near = !w.away && dist(w.player.x, w.player.z, this.x, this.z) < ECONOMY.staff.boostRadius;
    const boost = near ? 1 + ECONOMY.staff.boost : 1;
    const speed = cfg.speed * speedMult * boost;
    const interval = cfg.transferInterval / boost;
    const off = this.slot * 0.45;
    this.t -= dt;
    this.speed = 0;
    switch (this.state) {
      case 'toPile':
        if (moveToward(this, d.pile.x + off, d.pile.z + 1.0, speed, dt, 0.15)) { this.state = 'load'; this.wait = 0; }
        break;
      case 'load':
        this.wait += dt;
        this.rot = turnToward(this.rot, 0, -1, 12, dt);
        if (this.t <= 0 && st.pile > 0 && !this.carry.full()) {
          st.pile--;
          this.carry.push(d.product);
          this.t = interval;
        }
        if (this.carry.full() || (this.carry.n > 0 && this.wait > cfg.maxWait)) this.state = 'toCounter';
        break;
      case 'toCounter':
        if (moveToward(this, d.counter.dropX + 0.15 + off, d.counter.dropZ - 0.1, speed, dt, 0.15)) this.state = 'unload';
        break;
      case 'unload':
        this.rot = turnToward(this.rot, 0, 1, 12, dt);
        if (this.t <= 0 && this.carry.n > 0) {
          this.carry.take(d.product);
          st.counter++;
          this.t = interval;
        }
        if (this.carry.n === 0) this.state = 'toPile';
        break;
    }
  }
}

/** One item riding a belt. */
export interface BeltItem { active: boolean; t: number }

/** Conveyor from a station's pile to its counter slot. */
export class Belt {
  level = 0;
  private timer = 0.5;
  readonly items: BeltItem[] = [];

  constructor(readonly station: Station) {}

  get interval(): number {
    const b = ECONOMY.machines.belt;
    return b.interval / Math.pow(b.speedUp, Math.max(0, this.level - 1));
  }

  update(dt: number): void {
    if (this.level <= 0) return;
    const st = this.station, travel = ECONOMY.machines.belt.travel;
    this.timer -= dt;
    if (this.timer <= 0 && st.pile > 0) {
      st.pile--;
      let it = this.items.find((i) => !i.active);
      if (!it) { it = { active: false, t: 0 }; this.items.push(it); }
      it.active = true;
      it.t = 0;
      this.timer = this.interval;
    } else if (this.timer < 0) this.timer = 0;
    for (const it of this.items) {
      if (!it.active) continue;
      it.t += dt / travel;
      if (it.t >= 1) { it.active = false; st.counter++; }
    }
  }

  /** Items in transit (counted as stock for saving). */
  get inTransit(): number { let n = 0; for (const i of this.items) if (i.active) n++; return n; }
}

/** Workers, belts and the cashier, reconciled from upgrade levels. */
export class StaffSystem {
  readonly workers: Worker[] = [];
  readonly belts: Belt[] = [];

  constructor(private w: SimWorld) {
    for (const s of w.stations) this.belts.push(new Belt(s));
  }

  /** Match staff/machines to upgrade levels. Called from UpgradeSystem.apply(). */
  sync(): void {
    const w = this.w, up = w.upgrades;
    for (const s of w.stations) {
      if (!s.open) continue;
      const wt = s.def.workerTrack;
      if (wt) {
        const want = up.level(wt) * ECONOMY.upgrades[wt].step;
        let have = this.workers.filter((x) => x.station === s).length;
        while (have < want) this.workers.push(new Worker(s, have++));
      }
      const mt = s.def.machineTrack;
      if (mt) this.belts[s.index].level = up.level(mt);
    }
    const cap = ECONOMY.staff.worker.capacity + up.level('hr.capacity') * ECONOMY.upgrades['hr.capacity'].step;
    for (const x of this.workers) x.carry.cap = cap;
  }

  /** Cashier service slowdown vs. the player (1 = player speed). */
  get cashierSlow(): number {
    return ECONOMY.staff.cashier.slowFactor / (1 + this.w.upgrades.level('hr.cashier') * ECONOMY.upgrades['hr.cashier'].step);
  }

  update(dt: number): void {
    const speedMult = 1 + this.w.upgrades.level('hr.speed') * ECONOMY.upgrades['hr.speed'].step;
    for (const x of this.workers) x.update(this.w, dt, speedMult);
    for (const b of this.belts) b.update(dt);
  }
}
