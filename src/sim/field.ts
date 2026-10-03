import { ECONOMY, type CropId } from '../config/economy';
import { FIELDS, type PlotDef } from '../config/fields';
import type { SimWorld } from './world';
import { dist, moveToward } from './math';

/** A hired driver: mows its plot row by row, then unloads its hopper at the stall. */
export interface Driver {
  x: number; z: number; rot: number; speed: number;
  state: 'cut' | 'toStall' | 'unload' | 'back';
  /** Plot index it works. */
  plot: number;
  /** Waypoint index along the mowing path. */
  wp: number;
  hopper: number;
  crop: CropId;
  /** Seconds until the next bundle unloads. */
  t: number;
  /** 1..0 while cutting (drives the spinning cutter). */
  cutting: number;
}

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
  /** True while the player drives the owned vehicle in the farmland. */
  driving = false;
  /** Combine hopper: bundles per crop waiting to be unloaded at the stall. */
  readonly hopper = { corn: 0, wheat: 0 } as Record<CropId, number>;
  hopperN = 0;
  private sellT = 0;
  readonly drivers: Driver[] = [];
  /** Mowing path per plot (back-and-forth rows, reach-spaced). */
  private paths: { x: number; z: number }[][];

  constructor(private w: SimWorld) {
    this.plots = FIELDS.plots.map((d, i) => new Plot(d, i));
    const gap = ECONOMY.field.driver.reach * 1.7;
    this.paths = FIELDS.plots.map((d) => {
      const b = d.box, pts: { x: number; z: number }[] = [];
      let left = true;
      for (let z = b.z1 - gap / 2; z > b.z0; z -= gap) {
        pts.push({ x: left ? b.x0 + 0.4 : b.x1 - 0.4, z }, { x: left ? b.x1 - 0.4 : b.x0 + 0.4, z });
        left = !left;
      }
      return pts;
    });
  }

  get open(): boolean { return this.plots[0].open; }

  /** Best vehicle owned (null = on foot with the sickle). */
  get vehicle(): 'tractor' | 'combine' | null {
    const up = this.w.upgrades;
    return up.level('field.combine') > 0 ? 'combine' : up.level('field.tractor') > 0 ? 'tractor' : null;
  }

  /** Cutting reach of the current tool (+ the vehicle's cutter while driving). */
  get toolRadius(): number {
    const v = this.driving ? this.vehicle : null;
    return ECONOMY.field.toolRadius + this.w.upgrades.level('field.tool') * ECONOMY.upgrades['field.tool'].step
      + (v ? ECONOMY.field[v].reach : 0);
  }

  /** No room for another bundle (the combine's hopper while driving it, else the player's stack). */
  full(): boolean {
    return this.driving && this.vehicle === 'combine' ? this.hopperN >= ECONOMY.field.combine.hopper : this.w.carry.full();
  }

  /** Bundles that still need selling (carried + in the hopper). */
  get held(): number {
    let n = this.hopperN;
    for (const it of this.w.carry.items) if (it in ECONOMY.crops) n++;
    return n;
  }

  regrowTime(p: Plot): number {
    return ECONOMY.field.regrow[p.crop] / (1 + this.w.upgrades.level('field.regrow') * ECONOMY.upgrades['field.regrow'].step);
  }

  /** Reconcile from upgrade levels (called from UpgradeSystem.apply). */
  sync(): void {
    for (const p of this.plots) p.open = this.w.upgrades.level(p.def.unlockTrack) > 0;
    while (this.drivers.length < this.w.upgrades.level('field.driver')) {
      const u = this.unloadSpot(this.drivers.length, { x: 0, z: 0 });
      this.drivers.push({ x: u.x, z: u.z, rot: Math.PI, speed: 0, state: 'back', plot: 0, wp: 0, hopper: 0, crop: 'corn', t: 0, cutting: 0 });
    }
  }

  private spot = { x: 0, z: 0 };

  /** Unload spot for driver i (side by side east of the stall's sell spot), written into `out`. */
  unloadSpot(i: number, out: { x: number; z: number }): { x: number; z: number } {
    out.x = FIELDS.stall.drop.x + 1.7 + i * 1.5;
    out.z = FIELDS.stall.drop.z + 0.1;
    return out;
  }

  private updateDrivers(dt: number): void {
    const cfg = ECONOMY.field.driver, w = this.w;
    const speed = cfg.speed * (1 + w.upgrades.level('field.engine') * ECONOMY.upgrades['field.engine'].step);
    const reach = cfg.reach + w.upgrades.level('field.tool') * ECONOMY.upgrades['field.tool'].step * 0.5;
    for (let i = 0; i < this.drivers.length; i++) {
      const d = this.drivers[i];
      d.cutting = Math.max(0, d.cutting - dt * 3);
      switch (d.state) {
        case 'back': {
          // the open plot with the most grown stalks; drivers prefer "their" plot (by index) on ties
          let best = -1, bestN = -1;
          for (let k = 0; k < this.plots.length; k++) {
            const p = this.plots[k];
            if (!p.open) continue;
            const n = p.grown + (k === i % this.plots.length ? 10 : 0);
            if (n > bestN) { best = k; bestN = n; }
          }
          if (best < 0) { d.speed = 0; break; }
          if (d.plot !== best) { d.plot = best; d.wp = 0; }
          const t = this.paths[best][d.wp];
          if (moveToward(d, t.x, t.z, speed, dt, 0.3)) d.state = 'cut';
          break;
        }
        case 'cut': {
          const p = this.plots[d.plot], path = this.paths[d.plot];
          const t = path[d.wp];
          if (moveToward(d, t.x, t.z, speed * 0.8, dt, 0.3)) d.wp = (d.wp + 1) % path.length;
          if (p.grown > 0) {
            const made = this.cutAround(p, d.x, d.z, reach, cfg.hopper - d.hopper);
            if (made > 0) { d.hopper += made; d.crop = p.crop; }
            if (this.lastCut > 0) d.cutting = 1;
          }
          if (d.hopper >= cfg.hopper || (p.grown === 0 && d.hopper > 0)) d.state = 'toStall';
          break;
        }
        case 'toStall': {
          const u = this.unloadSpot(i, this.spot);
          if (moveToward(d, u.x, u.z, speed, dt, 0.2)) { d.state = 'unload'; d.t = 0; }
          break;
        }
        case 'unload': {
          d.speed = 0;
          d.t -= dt;
          if (d.t <= 0 && d.hopper > 0) {
            d.t = cfg.unloadInterval;
            d.hopper--;
            const v = Math.round(ECONOMY.crops[d.crop].price * w.priceMult);
            this.cash.value += v;
            this.cash.bills = Math.min(40, this.cash.bills + 1);
            w.stats.crops++;
            if (!w.away) w.events.emit('cropSold', d.crop, d.x, d.z, v, 0, -1);
          }
          if (d.hopper <= 0) d.state = 'back';
          break;
        }
      }
    }
  }

  /** Stalks cut by the last cutAround() call. */
  private lastCut = 0;

  /**
   * Cut grown stalks within r of (x, z) until `maxBundles` bundles are made; returns the bundles made
   * (stalks cut -> lastCut). Golden stalks only pay out for the player.
   */
  private cutAround(p: Plot, x: number, z: number, r: number, maxBundles: number): number {
    const cfg = ECONOMY.field, s = cfg.spacing, b = p.def.box, w = this.w;
    const c0 = Math.max(0, Math.floor((x - r - b.x0) / s)), c1 = Math.min(p.cols - 1, Math.floor((x + r - b.x0) / s));
    const r0 = Math.max(0, Math.floor((z - r - b.z0) / s)), r1 = Math.min(p.rows - 1, Math.floor((z + r - b.z0) / s));
    const regrow = this.regrowTime(p);
    let made = 0;
    this.lastCut = 0;
    for (let row = r0; row <= r1 && made < maxBundles; row++) {
      for (let col = c0; col <= c1 && made < maxBundles; col++) {
        const i = row * p.cols + col;
        if (p.regrow[i] > 0) continue;
        const sx = p.x(i), sz = p.z(i);
        if (dist(x, z, sx, sz) > r) continue;
        p.regrow[i] = regrow;
        p.grown--;
        p.golden[i] = 0;
        this.lastCut++;
        w.stats.stalks++;
        if (!w.away) w.events.emit('cut', p.crop, sx, sz, 0, 0, p.index);
        if (++p.partial >= cfg.stalksPerBundle) { p.partial = 0; made++; }
      }
    }
    return made;
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
    const cfg = ECONOMY.field, rng = this.w.rng, w = this.w, v = this.vehicle;
    this.driving = this.open && !!v && !w.away && w.player.z < cfg.farmlandZ;
    w.player.driveMult = this.driving && v
      ? cfg[v].speedMult * (1 + w.upgrades.level('field.engine') * ECONOMY.upgrades['field.engine'].step) : 1;
    w.player.radius = this.driving && v ? cfg[v].radius : ECONOMY.player.radius;
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
    this.updateDrivers(dt);
  }

  /** Player in a field: cut what's in reach; at the stall: sell bundles; at the stall cash: collect. */
  interact(dt: number): void {
    if (!this.open) return;
    const w = this.w, pl = w.player, c = w.carry, cfg = ECONOMY.field;
    const p = this.plotAt(pl.x, pl.z);
    const combine = this.driving && this.vehicle === 'combine';
    if (p && p.open && !this.full()) {
      const R = this.toolRadius, s = cfg.spacing, b = p.def.box;
      const c0 = Math.max(0, Math.floor((pl.x - R - b.x0) / s)), c1 = Math.min(p.cols - 1, Math.floor((pl.x + R - b.x0) / s));
      const r0 = Math.max(0, Math.floor((pl.z - R - b.z0) / s)), r1 = Math.min(p.rows - 1, Math.floor((pl.z + R - b.z0) / s));
      const regrow = this.regrowTime(p);
      for (let row = r0; row <= r1 && !this.full(); row++) {
        for (let col = c0; col <= c1 && !this.full(); col++) {
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
            if (combine) { this.hopper[p.crop]++; this.hopperN++; }
            else {
              c.push(p.crop);
              w.events.emit('pick', p.crop, x, z, 0, c.n, -1);
            }
          }
        }
      }
    }
    // sell bundles at the stall, one at a time
    const st = FIELDS.stall;
    this.sellT -= dt;
    if (this.sellT <= 0 && dist(pl.x, pl.z, st.drop.x, st.drop.z) < (this.driving ? 1.9 : 1.25)) {
      for (const p2 of this.plots) {
        // carried bundles first, then the combine's hopper (unloads twice as fast)
        let fromHopper = false;
        if (!c.take(p2.crop)) {
          if (this.hopper[p2.crop] <= 0) continue;
          this.hopper[p2.crop]--;
          this.hopperN--;
          fromHopper = true;
        }
        const v = Math.round(ECONOMY.crops[p2.crop].price * w.priceMult);
        this.cash.value += v;
        this.cash.bills = Math.min(40, this.cash.bills + 1);
        w.stats.crops++;
        w.events.emit('cropSold', p2.crop, st.drop.x, st.drop.z, v, c.n);
        this.sellT = fromHopper ? cfg.sellInterval / 2 : cfg.sellInterval;
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
