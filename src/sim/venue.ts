import { ECONOMY, type ItemId, type VenueItemId } from '../config/economy';
import { EAST, type RecipeDef, type SourceDef, type VenueDef } from '../config/venues';
import { dist } from './math';
import type { WorkerJob } from './staff';
import type { SimWorld } from './world';

/** A tree (or the pigeon tower's door): items grow on it up to `hold`, picked by the player or the venue's hands. */
export interface Source { def: SourceDef; open: boolean; n: number; t: number }

/** Hands of a venue: the source with the most on it -> the kitchen's drop spot. */
class VenueJob implements WorkerJob {
  readonly key: string;
  readonly repick = true;
  private from: number[] = [];

  constructor(private v: Venue) { this.key = `venue.${v.def.id}`; }

  loadAt(_w: SimWorld, slot: number, out: { x: number; z: number }): void {
    const v = this.v;
    // (a trip keeps its tree while it still has fruit: called every step of the walk)
    const cur = v.sources[this.from[slot] ?? -1];
    if (cur && cur.open && cur.n > 0) { const p = cur.def.pick ?? cur.def; out.x = p.x + (slot - 0.5) * 0.5; out.z = p.z + 0.2; return; }
    // (a source with something on it whose item the kitchen is shortest of, the fullest of those, one nobody else
    // is heading to if possible: mango and guava both keep coming)
    let best = -1, bestScore = -Infinity;
    v.sources.forEach((s, i) => {
      if (!s.open) return;
      const taken = this.from.some((f, k) => k !== slot && f === i) ? 0.5 : 0;
      const score = (s.n > 0 ? 1000 : 0) - (v.input[s.def.item] + v.madeOf(s.def.item)) * 10 + s.n - taken;
      if (score > bestScore) { best = i; bestScore = score; }
    });
    this.from[slot] = best;
    const s = v.sources[Math.max(0, best)].def, p = s.pick ?? s;
    out.x = p.x + (slot - 0.5) * 0.5;
    out.z = p.z + 0.2;
  }

  take(_w: SimWorld, slot: number): ItemId | null {
    const s = this.v.sources[this.from[slot] ?? -1];
    if (!s || s.n <= 0) return null;
    s.n--;
    return s.def.item;
  }

  unloadAt(_w: SimWorld, slot: number, out: { x: number; z: number }): void {
    // (the next trip picks its tree afresh)
    this.from[slot] = -1;
    const k = this.v.def.kitchen.input;
    out.x = k.x + slot * 0.5;
    out.z = k.z + 0.5;
  }

  give(_w: SimWorld, item: ItemId): boolean { return this.v.accept(item as VenueItemId); }

  room(): number { return this.v.def.kitchen.inputMax - this.v.inputCount; }

  putBack(_w: SimWorld, item: ItemId, slot: number): void {
    const s = this.v.sources[this.from[slot] ?? -1] ?? this.v.sources.find((x) => x.def.item === item);
    // (never past what a source holds: a tree that refilled meanwhile keeps its own fruit)
    if (s) s.n = Math.min(this.v.def.hold, s.n + 1);
  }
}

/**
 * One venue of the east (config/venues.ts): sources grow items, the player or its hands carry them to the kitchen,
 * the kitchen cooks one recipe at a time into the window's stock, and the window sells one item every so often
 * into its cash pile. Runs during time away too.
 */
export class Venue {
  open = false;
  readonly sources: Source[];
  readonly input = {} as Record<VenueItemId, number>;
  /** Made goods waiting at the window, by item. */
  readonly stock = {} as Record<VenueItemId, number>;
  cooking: RecipeDef | null = null;
  cookT = 0;
  private sellT = 0;
  /** Alternates the window between products. */
  private sellIx = 0;
  readonly cash = { value: 0, bills: 0 };
  readonly job: VenueJob;

  constructor(private w: SimWorld, readonly def: VenueDef) {
    this.sources = def.sources.map((d) => ({ def: d, open: false, n: 0, t: 0 }));
    for (const r of def.kitchen.recipes) {
      this.stock[r.output] = 0;
      for (const k of Object.keys(r.inputs) as VenueItemId[]) this.input[k] = 0;
    }
    this.job = new VenueJob(this);
  }

  /** Made goods waiting at the window that came from this raw item. */
  madeOf(item: VenueItemId): number {
    let n = 0;
    for (const r of this.def.kitchen.recipes) if (item in r.inputs) n += this.stock[r.output];
    return n;
  }

  get inputCount(): number { let n = 0; for (const k in this.input) n += this.input[k as VenueItemId]; return n; }
  get stockCount(): number { let n = 0; for (const k in this.stock) n += this.stock[k as VenueItemId]; return n; }

  /** Producers behind one open source (nests for the tower, 1 for a tree). */
  private producers(): number {
    const n = this.def.nests;
    return n ? n.start + this.w.upgrades.level(n.track) * ECONOMY.upgrades[n.track].step : 1;
  }

  /** Seconds for one item to grow on a source. */
  get growTime(): number {
    const g = this.def.growTrack, lv = g ? this.w.upgrades.level(g) * ECONOMY.upgrades[g].step : 0;
    return this.def.grow / (1 + lv) / this.producers();
  }

  get sellEvery(): number {
    const t = this.def.window.track;
    return this.def.window.sellEvery / (1 + this.w.upgrades.level(t) * ECONOMY.upgrades[t].step);
  }

  private get speed(): number {
    const t = this.def.kitchen.speedTrack;
    return 1 + this.w.upgrades.level(t) * ECONOMY.upgrades[t].step;
  }

  /** Reconcile from upgrade levels (UpgradeSystem.apply). */
  sync(): void {
    const w = this.w, up = w.upgrades;
    this.open = up.level(this.def.unlock) > 0;
    for (const s of this.sources) {
      const was = s.open;
      s.open = this.open && up.level(s.def.track) >= s.def.level;
      if (s.open && !was) s.t = this.growTime;
    }
    const wt = this.def.workers.track, h = this.def.workers.home;
    w.staff.ensureWorkers(this.job, this.open ? up.level(wt) * ECONOMY.upgrades[wt].step : 0, h.x, h.z);
  }

  /** Can the kitchen take this item right now? */
  wants(item: VenueItemId): boolean {
    return this.open && item in this.input && this.inputCount < this.def.kitchen.inputMax;
  }

  accept(item: VenueItemId): boolean {
    if (!this.wants(item)) return false;
    this.input[item]++;
    return true;
  }

  update(dt: number): void {
    if (!this.open) return;
    const w = this.w, grow = this.growTime;
    for (const s of this.sources) {
      if (!s.open || s.n >= this.def.hold) continue;
      s.t -= dt;
      while (s.t <= 0 && s.n < this.def.hold) { s.n++; s.t += grow; }
      if (s.n >= this.def.hold) s.t = grow;
    }
    // the kitchen: the recipe whose product is lowest at the window, among those it has the inputs for
    if (!this.cooking) {
      let pick: RecipeDef | null = null;
      for (const r of this.def.kitchen.recipes) {
        if (this.stock[r.output] >= this.def.window.max) continue;
        if (!(Object.entries(r.inputs) as [VenueItemId, number][]).every(([k, n]) => this.input[k] >= n)) continue;
        if (!pick || this.stock[r.output] < this.stock[pick.output]) pick = r;
      }
      if (pick) {
        for (const [k, n] of Object.entries(pick.inputs) as [VenueItemId, number][]) this.input[k] -= n;
        this.cooking = pick;
        this.cookT = pick.time / this.speed;
      }
    } else if ((this.cookT -= dt) <= 0) {
      this.stock[this.cooking.output]++;
      if (!w.away) w.events.emit('venue', this.cooking.output, this.def.kitchen.input.x, this.def.kitchen.input.z, 0, 1, this.index);
      this.cooking = null;
    }
    // the window: one sale every sellEvery while there's stock (turns between products)
    if (this.stockCount > 0) {
      this.sellT -= dt;
      if (this.sellT <= 0) {
        this.sellT += this.sellEvery;
        const outs = Object.keys(this.stock) as VenueItemId[];
        let it: VenueItemId | null = null;
        for (let k = 0; k < outs.length && !it; k++) { const o = outs[(this.sellIx + k) % outs.length]; if (this.stock[o] > 0) it = o; }
        this.sellIx++;
        if (it) {
          this.stock[it]--;
          const v = Math.round(ECONOMY.venue[it].price * w.priceMult);
          this.cash.value += v;
          this.cash.bills = Math.min(40, this.cash.bills + 1);
          if (!w.away) w.events.emit('venue', it, this.def.window.x, this.def.window.z, v, 2, this.index);
        }
      }
    } else this.sellT = Math.min(this.sellT, this.sellEvery);
  }

  get index(): number { return EAST.venues.indexOf(this.def); }

  private pickT = 0;
  private dropT = 0;

  /** Player: pick at a source, drop at the kitchen, collect the window's money. */
  interact(dt: number): void {
    if (!this.open) return;
    const w = this.w, p = w.player, c = w.carry, cfg = ECONOMY.player;
    this.pickT -= dt;
    this.dropT -= dt;
    if (this.pickT <= 0 && !c.full()) {
      for (const s of this.sources) {
        const at = s.def.pick ?? s.def;
        if (!s.open || s.n <= 0 || dist(p.x, p.z, at.x, at.z) > s.def.reach) continue;
        s.n--;
        c.push(s.def.item);
        this.pickT = cfg.pickInterval * 1.5;
        w.events.emit('pick', s.def.item, s.def.x, s.def.z, 0, c.n);
        break;
      }
    }
    const k = this.def.kitchen.input;
    if (this.dropT <= 0 && dist(p.x, p.z, k.x, k.z) < 1.3) {
      for (const it of Object.keys(this.input) as VenueItemId[]) {
        if (!c.has(it) || !this.wants(it)) continue;
        c.take(it);
        this.input[it]++;
        this.dropT = cfg.dropInterval;
        w.events.emit('drop', it, k.x, k.z, 0, c.n);
        break;
      }
    }
    const cs = this.def.window.cash;
    if (this.cash.value > 0 && dist(p.x, p.z, cs.x, cs.z) < 1.3) {
      const v = this.cash.value;
      w.money += v;
      w.stats.earned += v;
      w.events.emit('collect', '', cs.x, cs.z, v, this.cash.bills);
      this.cash.value = 0;
      this.cash.bills = 0;
    }
  }
}

/** The east's venues (orchard, pigeon tower), in EAST.venues order. */
export class VenueSystem {
  readonly list: Venue[];

  constructor(private w: SimWorld) {
    this.list = EAST.venues.map((d) => new Venue(w, d));
  }

  get open(): boolean { return this.list.some((v) => v.open); }

  get(id: VenueDef['id']): Venue { return this.list.find((v) => v.def.id === id)!; }

  sync(): void {
    for (const v of this.list) v.sync();
    const w = this.w;
    if (!this.open) return;
    for (const v of this.list) {
      if (!v.open) continue;
      v.sources.forEach((s, i) => { if (s.open) w.addSolid(`venue:${v.def.id}${i}`, { x0: s.def.x - s.def.solid.hx, x1: s.def.x + s.def.solid.hx, z0: s.def.z - s.def.solid.hz, z1: s.def.z + s.def.solid.hz }); });
      w.addSolid(`venue:${v.def.id}Kitchen`, v.def.kitchen.box);
    }
    // the factory yard's east fence (non-solid until now: the walkable area ended in front of it), with its gate
    const f = EAST.fence;
    w.addSolid('eastFence0', { x0: f.x - 0.1, x1: f.x + 0.1, z0: f.z0, z1: f.gate.z0 });
    w.addSolid('eastFence1', { x0: f.x - 0.1, x1: f.x + 0.1, z0: f.gate.z1, z1: f.z1 });
  }

  update(dt: number): void { for (const v of this.list) v.update(dt); }
  interact(dt: number): void { for (const v of this.list) v.interact(dt); }
}
