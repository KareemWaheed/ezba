import { ECONOMY, type CropId } from '../config/economy';
import { FIELDS, type PlotDef } from '../config/fields';
import type { SimWorld } from './world';
import { dist } from './math';

/** Runtime state of one crop plot: a grid of stalks, each grown (regrow = 0) or regrowing. */
export class Plot {
  open = false;
  readonly cols: number;
  readonly rows: number;
  /** Seconds until each stalk is grown again (0 = grown, ready to cut). */
  readonly regrow: Float32Array;
  /** 1 = golden stalk (bonus when cut). */
  readonly golden: Uint8Array;
  /** Grown stalks right now. */
  grown: number;
  /** Stalks cut toward the next bundle. */
  partial = 0;

  constructor(readonly def: PlotDef, readonly index: number) {
    const s = ECONOMY.field.spacing, b = def.box;
    this.cols = Math.floor((b.x1 - b.x0) / s);
    this.rows = Math.floor((b.z1 - b.z0) / s);
    this.regrow = new Float32Array(this.cols * this.rows);
    this.golden = new Uint8Array(this.cols * this.rows);
    this.grown = this.cols * this.rows;
  }

  get crop(): CropId { return this.def.crop; }
  get size(): number { return this.regrow.length; }

  /** World position of stalk i (cell centers). */
  x(i: number): number { return this.def.box.x0 + ((i % this.cols) + 0.5) * ECONOMY.field.spacing; }
  z(i: number): number { return this.def.box.z0 + (Math.floor(i / this.cols) + 0.5) * ECONOMY.field.spacing; }
}

/**
 * Stage 4 fields: the player walks through an open plot and every grown stalk within the tool's
 * reach is cut; every few stalks become a bundle on the player's stack. Bundles sell at the grain
 * stall (money piles up there to collect). Cut stalks regrow after a delay.
 */
export class FieldSystem {
  readonly plots: Plot[];
  /** Grain stall money waiting to be collected. */
  readonly cash = { value: 0, bills: 0 };
  /** Seconds the tool has been cutting (drives the swing animation; 0 when idle). */
  cutting = 0;
  private sellT = 0;

  constructor(private w: SimWorld) {
    this.plots = FIELDS.plots.map((d, i) => new Plot(d, i));
  }

  get open(): boolean { return this.plots[0].open; }

  /** Cutting reach of the current tool. */
  get toolRadius(): number {
    return ECONOMY.field.toolRadius + this.w.upgrades.level('field.tool') * ECONOMY.upgrades['field.tool'].step;
  }

  regrowTime(p: Plot): number {
    return ECONOMY.field.regrow[p.crop] / (1 + this.w.upgrades.level('field.regrow') * ECONOMY.upgrades['field.regrow'].step);
  }

  /** Reconcile from upgrade levels (called from UpgradeSystem.apply). */
  sync(): void {
    for (const p of this.plots) p.open = this.w.upgrades.level(p.def.unlockTrack) > 0;
  }

  /** The plot the point is inside (open or not), or null. */
  plotAt(x: number, z: number): Plot | null {
    for (const p of this.plots) {
      const b = p.def.box;
      if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return p;
    }
    return null;
  }

  update(dt: number): void {
    const cfg = ECONOMY.field, rng = this.w.rng;
    for (const p of this.plots) {
      if (!p.open || p.grown === p.size) continue;
      const r = p.regrow;
      for (let i = 0; i < r.length; i++) {
        if (r[i] <= 0) continue;
        r[i] -= dt;
        if (r[i] <= 0) {
          r[i] = 0;
          p.grown++;
          p.golden[i] = rng.next() < cfg.goldenChance ? 1 : 0;
        }
      }
    }
    this.cutting = Math.max(0, this.cutting - dt);
  }

  /** Player in a field: cut what's in reach; at the stall: sell bundles; at the stall cash: collect. */
  interact(dt: number): void {
    if (!this.open) return;
    const w = this.w, pl = w.player, c = w.carry, cfg = ECONOMY.field;
    const p = this.plotAt(pl.x, pl.z);
    if (p && p.open && !c.full()) {
      const R = this.toolRadius, s = cfg.spacing, b = p.def.box;
      const c0 = Math.max(0, Math.floor((pl.x - R - b.x0) / s)), c1 = Math.min(p.cols - 1, Math.floor((pl.x + R - b.x0) / s));
      const r0 = Math.max(0, Math.floor((pl.z - R - b.z0) / s)), r1 = Math.min(p.rows - 1, Math.floor((pl.z + R - b.z0) / s));
      const regrow = this.regrowTime(p);
      for (let row = r0; row <= r1 && !c.full(); row++) {
        for (let col = c0; col <= c1 && !c.full(); col++) {
          const i = row * p.cols + col;
          if (p.regrow[i] > 0) continue;
          const x = p.x(i), z = p.z(i);
          if (dist(pl.x, pl.z, x, z) > R) continue;
          p.regrow[i] = regrow;
          p.grown--;
          this.cutting = 0.25;
          w.stats.stalks++;
          w.events.emit('cut', p.crop, x, z, 0, 0, p.index);
          if (p.golden[i]) {
            p.golden[i] = 0;
            const v = Math.round(cfg.goldenReward * w.priceMult);
            w.money += v;
            w.stats.earned += v;
            w.stats.goldenStalks++;
            w.events.emit('goldenStalk', p.crop, x, z, v);
          }
          if (++p.partial >= cfg.stalksPerBundle) {
            p.partial = 0;
            c.push(p.crop);
            w.events.emit('pick', p.crop, x, z, 0, c.n, -1);
          }
        }
      }
    }
    // sell bundles at the stall, one at a time
    const st = FIELDS.stall;
    this.sellT -= dt;
    if (this.sellT <= 0 && dist(pl.x, pl.z, st.drop.x, st.drop.z) < 1.25) {
      for (const p2 of this.plots) {
        if (!c.take(p2.crop)) continue;
        const v = Math.round(ECONOMY.crops[p2.crop].price * w.priceMult);
        this.cash.value += v;
        this.cash.bills = Math.min(40, this.cash.bills + 1);
        w.stats.crops++;
        w.events.emit('cropSold', p2.crop, st.drop.x, st.drop.z, v, c.n);
        this.sellT = cfg.sellInterval;
        break;
      }
    }
    if (this.cash.value > 0 && dist(pl.x, pl.z, st.cash.x, st.cash.z) < 1.3) {
      const v = this.cash.value;
      w.money += v;
      w.stats.earned += v;
      w.events.emit('collect', '', st.cash.x, st.cash.z, v, this.cash.bills);
      this.cash.value = 0;
      this.cash.bills = 0;
    }
  }

  /** Grown stalks in all open plots. */
  get ready(): number {
    let n = 0;
    for (const p of this.plots) if (p.open) n += p.grown;
    return n;
  }
}
