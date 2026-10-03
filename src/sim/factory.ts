import { ECONOMY, type DishId, type ItemId } from '../config/economy';
import { FACTORY, type FactoryDef } from '../config/factories';
import { FACTORY_RECIPES } from '../config/recipes';
import { CAFE } from '../config/cafe';
import { Converter } from './converter';
import type { WorkerJob } from './staff';
import type { SimWorld } from './world';
import { dist } from './math';

/** One factory machine (bakery, dairy) and whether it's built. */
export interface FactoryMachine {
  readonly def: FactoryDef;
  readonly conv: Converter;
  open: boolean;
}

/** Factory supplier: eggs and milk from the shop counters' surplus (or full piles) into the machines. */
class SupplyJob implements WorkerJob {
  readonly key = 'factory.supply';
  /** Per worker slot: station index and machine index of the current trip. */
  private st: number[] = [];
  private mc: number[] = [];
  private fromPile: boolean[] = [];
  constructor(private f: FactorySystem) {}

  /** The open machine + raw product most in need (lowest fill), with a station that has some. */
  private pick(w: SimWorld, slot: number): boolean {
    let best = -1, bestM = -1, bestN = Infinity;
    for (let mi = 0; mi < this.f.machines.length; mi++) {
      const m = this.f.machines[mi];
      if (!m.open) continue;
      for (const s of w.stations) {
        const p = s.def.product;
        if (!s.open || !m.conv.wants(p)) continue;
        if (s.pile < 3 && s.counter <= ECONOMY.cafe.counterReserve) continue;
        const n = m.conv.input[p];
        if (n < bestN) { best = s.index; bestM = mi; bestN = n; }
      }
    }
    if (best < 0) return false;
    this.st[slot] = best;
    this.mc[slot] = bestM;
    return true;
  }

  loadAt(w: SimWorld, slot: number, out: { x: number; z: number }): void {
    if (!this.pick(w, slot) && this.st[slot] === undefined) { out.x = FACTORY.machines[0].input.x; out.z = FACTORY.machines[0].input.z + 0.8; return; }
    const s = w.stations[this.st[slot]], d = s.def;
    // a full pile is quicker to grab from; otherwise the counter's surplus
    this.fromPile[slot] = s.pile >= 3;
    if (this.fromPile[slot]) { out.x = d.pile.x + 1.0 - slot * 0.4; out.z = d.pile.z + 1.1; }
    else { out.x = d.counter.dropX - 0.4 * slot; out.z = d.counter.dropZ - 0.4; }
  }

  take(w: SimWorld): ItemId | null {
    for (let slot = 0; slot < this.st.length; slot++) {
      const s = w.stations[this.st[slot]], m = this.f.machines[this.mc[slot]];
      if (!s || !m || !m.conv.wants(s.def.product)) continue;
      if (this.fromPile[slot]) { if (s.pile > 0) { s.pile--; return s.def.product; } }
      else if (s.counter > ECONOMY.cafe.counterReserve) { s.counter--; return s.def.product; }
    }
    return null;
  }

  unloadAt(_w: SimWorld, slot: number, out: { x: number; z: number }): void {
    const m = this.f.machines[this.mc[slot] ?? 0];
    out.x = m.def.input.x - 0.3 + slot * 0.4;
    out.z = m.def.input.z + 0.6;
  }

  give(_w: SimWorld, item: ItemId): boolean {
    for (const m of this.f.machines) if (m.open && m.conv.accept(item)) return true;
    return false;
  }
  room(w: SimWorld, slot: number): number {
    const s = w.stations[this.st[slot]], m = this.f.machines[this.mc[slot]];
    return s && m ? m.conv.inputMax - m.conv.input[s.def.product] : 0;
  }
  putBack(w: SimWorld, item: ItemId): void {
    const s = w.stations.find((x) => x.def.product === item);
    if (s) s.counter++;
  }
}

/** Factory porter: cake and cheese from the machine trays to the café counter. */
class PorterJob implements WorkerJob {
  readonly key = 'factory.porter';
  private mc: number[] = [];
  constructor(private f: FactorySystem) {}

  loadAt(_w: SimWorld, slot: number, out: { x: number; z: number }): void {
    // the open machine with the most finished items (whose dish the café counter isn't full of)
    let best = 0, bestN = -1;
    for (let i = 0; i < this.f.machines.length; i++) {
      const m = this.f.machines[i];
      if (!m.open) continue;
      const n = m.conv.outputCount - (this.f.cafeFull(m.def.makes) ? 1000 : 0);
      if (n > bestN) { best = i; bestN = n; }
    }
    this.mc[slot] = best;
    const o = this.f.machines[best].def.output;
    out.x = o.x + slot * 0.4;
    out.z = o.z + 0.6;
  }

  take(): ItemId | null {
    for (let slot = 0; slot < this.mc.length; slot++) {
      const m = this.f.machines[this.mc[slot]];
      if (m && !this.f.cafeFull(m.def.makes)) { const d = m.conv.takeAny(); if (d) return d; }
    }
    return null;
  }

  unloadAt(_w: SimWorld, slot: number, out: { x: number; z: number }): void {
    out.x = CAFE.counter.serve.x + 0.5 + slot * 0.4;
    out.z = CAFE.counter.serve.z - 0.3;
  }

  give(w: SimWorld, item: ItemId): boolean {
    const d = item as DishId;
    if (this.f.cafeFull(d)) return false;
    w.cafe.counter[d]++;
    return true;
  }
  room(w: SimWorld, slot: number): number {
    const m = this.f.machines[this.mc[slot] ?? 0];
    return ECONOMY.cafe.counterMax - w.cafe.counter[m.def.makes];
  }
  putBack(_w: SimWorld, item: ItemId): void {
    const m = this.f.machines.find((x) => x.def.makes === item);
    if (m) m.conv.output[item as DishId]++;
  }
}

/**
 * Stage 5 factories in the yard east of the café: the bakery (eggs + wheat -> cake) and the dairy
 * (milk -> cheese). The player drops ingredients at a machine's input and picks finished items up at
 * its output; staff can take both over. While the bakery runs, wheat sold at the grain stall fills
 * its silo first, and the silo feeds the bakery.
 */
export class FactorySystem {
  readonly machines: FactoryMachine[];
  /** Wheat waiting in the silo beside the bakery. */
  silo = 0;
  private dropT = 0;
  private pickT = 0;
  private supply = new SupplyJob(this);
  private porter = new PorterJob(this);

  constructor(private w: SimWorld) {
    const c = ECONOMY.factory;
    this.machines = FACTORY.machines.map((def) => {
      const conv = new Converter(FACTORY_RECIPES[def.id], c.inputMax, c.outputMax, (def.box.x0 + def.box.x1) / 2, def.box.z1 + 0.7);
      w.staff.machines.push(conv);
      return { def, conv, open: false };
    });
  }

  get open(): boolean { return this.machines[0].open; }

  machine(id: string): FactoryMachine | undefined { return this.machines.find((m) => m.def.id === id); }

  /** The café counter has enough of this dish (porters stop adding). */
  cafeFull(d: DishId): boolean { return this.w.cafe.counter[d] >= ECONOMY.cafe.counterMax; }

  /** Wheat the silo still takes (0 while the bakery isn't built). */
  get siloRoom(): number { return this.open ? ECONOMY.factory.siloMax - this.silo : 0; }

  sync(): void {
    const up = this.w.upgrades;
    const speed = 1 + up.level('factory.speed') * ECONOMY.upgrades['factory.speed'].step;
    for (const m of this.machines) {
      m.open = up.level(m.def.unlockTrack) > 0;
      m.conv.enabled = m.open;
      m.conv.speedMult = speed;
    }
    const home = FACTORY.machines[0].input;
    // (the porter also serves the river grill: farmRoute takes them through the gap between the pens)
    this.w.staff.ensureWorkers(this.supply, up.level('factory.worker'), home.x, home.z + 1.2);
    this.w.staff.ensureWorkers(this.porter, up.level('factory.porter'), home.x + 2, home.z + 1.2);
  }

  update(dt: number): void {
    const w = this.w;
    // the silo's auger tops the bakery up with wheat
    const bakery = this.machines[0].conv;
    while (this.open && this.silo > 0 && bakery.wants('wheat')) { bakery.accept('wheat'); this.silo--; }
    if (!w.scenario.powerCut) for (const m of this.machines) if (m.open) m.conv.update(dt, w);
  }

  /** Player: ingredients into a machine at its input, finished items out at its output. */
  interact(dt: number): void {
    const w = this.w, p = w.player, c = w.carry, cfg = ECONOMY.player, R = ECONOMY.factory.zone;
    this.dropT -= dt;
    this.pickT -= dt;
    for (const m of this.machines) {
      if (!m.open) continue;
      const d = m.def;
      if (this.dropT <= 0 && dist(p.x, p.z, d.input.x, d.input.z) < R) {
        for (let i = c.n - 1; i >= 0; i--) {
          const it = c.items[i];
          if (!m.conv.wants(it)) continue;
          c.items.splice(i, 1);
          m.conv.accept(it);
          this.dropT = cfg.dropInterval;
          w.events.emit('drop', it, d.input.x, d.input.z, 0, c.n);
          break;
        }
      }
      if (this.pickT <= 0 && !c.full() && dist(p.x, p.z, d.output.x, d.output.z) < R) {
        const it = m.conv.takeAny();
        if (it) {
          c.push(it);
          this.pickT = cfg.pickInterval;
          w.events.emit('pick', it, d.output.x, d.output.z, 0, c.n, -1);
        }
      }
    }
  }

  /** Wheat sold at the grain stall: keep what the silo has room for; returns how many were kept. */
  store(wheat: number): number {
    const n = Math.min(wheat, this.siloRoom);
    this.silo += n;
    return n;
  }
}
