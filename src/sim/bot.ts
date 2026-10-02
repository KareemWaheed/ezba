import { ECONOMY } from '../config/economy';
import { LAYOUT } from '../config/layout';
import { dist } from './math';
import type { SimWorld } from './world';
import type { TileState } from './upgrades';

/**
 * Simulated players for the pacing simulator.
 * - 'active': an efficient player running the carry-and-sell loop and buying the cheapest
 *   affordable upgrade as soon as possible.
 * - 'idle': never carries or serves; only collects cash and buys upgrades. Shows what
 *   automation alone earns (the active player must earn noticeably more).
 * The bot only steers the joystick input, so travel times, collisions and pickup rates are real.
 */
export type BotProfile = 'active' | 'idle';

type Task = 'tile' | 'stepOff' | 'drop' | 'cash' | 'pick' | 'serve' | 'wait';

export class Bot {
  task: Task = 'wait';
  private tx = 0;
  private tz = 0;
  private stuckT = 0;
  private nudgeT = 0;
  private lastX = 0;
  private lastZ = 0;
  private pickStation = -1;

  constructor(private w: SimWorld, readonly profile: BotProfile) {}

  private cheapestAffordable(): TileState | null {
    const up = this.w.upgrades;
    let best: TileState | null = null, bestR = Infinity;
    for (const t of up.tiles) {
      const r = up.remaining(t.def.id);
      if (r <= this.w.money + 1e-6 && r < bestR) { best = t; bestR = r; }
    }
    return best;
  }

  private cheapestRemaining(): number {
    let r = Infinity;
    for (const t of this.w.upgrades.tiles) r = Math.min(r, this.w.upgrades.remaining(t.def.id));
    return r;
  }

  private go(task: Task, x: number, z: number): void { this.task = task; this.tx = x; this.tz = z; }

  /** Pick what to do this tick. */
  private decide(): void {
    const w = this.w, p = w.player, c = w.carry, shop = LAYOUT.shop;
    const tile = this.cheapestAffordable();
    if (tile) {
      const d = dist(p.x, p.z, tile.def.pos.x, tile.def.pos.z);
      if (!tile.armed && d <= ECONOMY.tiles.armDistance + 0.05) {
        // the next level appeared under us: step off, then come back
        this.go('stepOff', tile.def.pos.x + 1.8, tile.def.pos.z);
        return;
      }
      this.go('tile', tile.def.pos.x, tile.def.pos.z);
      return;
    }
    const cashNeeded = w.money + w.cash.value >= this.cheapestRemaining();
    if (this.profile === 'idle') {
      if (w.cash.value > 0) this.go('cash', shop.cash.x, shop.cash.z);
      else this.go('wait', p.x, p.z);
      return;
    }
    if (c.n > 0 && !(this.task === 'pick' && !c.full() && w.stations[this.pickStation]?.pile > 0)) {
      for (const s of w.stations) {
        if (s.open && c.has(s.def.product)) { this.go('drop', s.def.counter.dropX, s.def.counter.dropZ); return; }
      }
    }
    if (w.cash.value > 0 && (cashNeeded || w.cash.bills >= 20)) { this.go('cash', shop.cash.x, shop.cash.z); return; }
    // fetch from the fullest pile once it can fill (most of) a trip
    let best = -1, bestN = 0;
    for (const s of w.stations) if (s.open && s.pile > bestN) { best = s.index; bestN = s.pile; }
    const front = w.customers.front();
    const serving = front && w.stations[front.station].counter > 0;
    if (best >= 0 && (bestN >= Math.min(c.cap, 4) || !serving)) {
      this.pickStation = best;
      const d = w.stations[best].def;
      this.go('pick', d.pile.x, d.pile.z);
      return;
    }
    if (serving) { this.go('serve', shop.servePoint.x, shop.servePoint.z); return; }
    if (w.cash.value > 0) { this.go('cash', shop.cash.x, shop.cash.z); return; }
    // nothing to do: wait by the busiest pile
    const s0 = w.stations.find((s) => s.open);
    if (s0) this.go('wait', s0.def.pile.x, s0.def.pile.z + 0.6);
  }

  update(dt: number): void {
    const w = this.w, p = w.player;
    this.decide();
    const dx = this.tx - p.x, dz = this.tz - p.z, d = Math.hypot(dx, dz);
    const stop = this.task === 'tile' ? 0.3 : 0.45;
    if (d < stop) { w.input.x = w.input.z = 0; this.stuckT = 0; return; }
    let ix = dx / d, iz = dz / d;
    // unstick: if we barely moved for a second while far from the target, sidestep
    const moved = Math.hypot(p.x - this.lastX, p.z - this.lastZ);
    this.lastX = p.x; this.lastZ = p.z;
    if (moved < 0.5 * dt) this.stuckT += dt; else this.stuckT = 0;
    if (this.stuckT > 0.6) { this.nudgeT = 0.5; this.stuckT = 0; }
    if (this.nudgeT > 0) { this.nudgeT -= dt; const t = ix; ix = -iz; iz = t; }
    w.input.x = ix;
    w.input.z = iz;
  }
}
