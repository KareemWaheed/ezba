import { CONTRACTS, COMPANIES, type CompanyDef } from '../config/contracts';
import { ECONOMY, type ItemId, type ProductId } from '../config/economy';
import { LAYOUT } from '../config/layout';
import { dist } from './math';
import type { WorkerJob } from './staff';
import type { SimWorld } from './world';

export type TruckState = 'away' | 'arriving' | 'loading' | 'leaving';
export type ContractKind = 'standing' | 'rush';

export interface ContractLine { product: ProductId; want: number; loaded: number }

export interface Truck {
  state: TruckState;
  /** Seconds left in the current state (away: until the next truck; loading: deadline). */
  t: number;
  company: CompanyDef;
  kind: ContractKind;
  lines: ContractLine[];
  /** Price per item for this contract. */
  price: Record<string, number>;
  /** Driving progress 0..1 (arriving / leaving). */
  drive: number;
}

/** Dock worker job: shop counter surplus -> the truck being loaded. */
class DockJob implements WorkerJob {
  readonly key = 'dock';
  private target = -1;
  constructor(private sys: ContractSystem) {}
  loadAt(w: SimWorld, slot: number, out: { x: number; z: number }): void {
    // the station whose product the truck needs most, with surplus on the counter
    this.target = -1;
    let best = 0;
    for (const s of w.stations) {
      const need = this.sys.stillNeeds(s.def.product);
      if (s.open && need > best && s.counter > ECONOMY.cafe.counterReserve) { best = need; this.target = s.index; }
    }
    const st = w.stations[this.target >= 0 ? this.target : 0];
    out.x = st.def.counter.dropX + (slot - 0.5) * 0.5;
    out.z = st.def.counter.dropZ - 0.5;
  }
  take(w: SimWorld): ItemId | null {
    // re-pick each time: the target may be stale (e.g. chosen while no truck was waiting)
    let s = w.stations[this.target];
    if (!s || this.sys.stillNeeds(s.def.product) <= 0 || s.counter <= ECONOMY.cafe.counterReserve) {
      s = w.stations.find((x) => x.open && this.sys.stillNeeds(x.def.product) > 0 && x.counter > ECONOMY.cafe.counterReserve)!;
      if (!s) return null;
      this.target = s.index;
    }
    s.counter--;
    return s.def.product;
  }
  unloadAt(_w: SimWorld, slot: number, out: { x: number; z: number }): void {
    out.x = LAYOUT.dock.load.x - 0.6 + slot * 0.6;
    out.z = LAYOUT.dock.load.z - 0.3;
  }
  give(_w: SimWorld, item: ItemId): boolean { return this.sys.load(item as ProductId); }
}

/**
 * Company contracts at the loading dock: a truck arrives with a contract, the player (or dock workers)
 * load it before it leaves, the company pays per item; trust per company grows with good service.
 */
export class ContractSystem {
  truck: Truck;
  /** Trust 0..5 per company id. */
  readonly trust: Record<string, number> = {};
  private dropT = 0;
  private job: DockJob;

  constructor(private w: SimWorld) {
    for (const c of COMPANIES) this.trust[c.id] = 0;
    this.truck = { state: 'away', t: 30, company: COMPANIES[0], kind: 'standing', lines: [], price: {}, drive: 0 };
    this.job = new DockJob(this);
  }

  get open(): boolean { return this.w.upgrades.level('dock.unlock') > 0; }

  /** Reconcile staff from upgrade levels. */
  sync(): void {
    this.w.staff.ensureWorkers(this.job, this.open ? this.w.upgrades.level('dock.worker') : 0, LAYOUT.dock.load.x, LAYOUT.dock.load.z - 1);
  }

  /** How many more of this product the loading truck wants beyond what the player carries. */
  stillNeeds(p: ProductId): number {
    const t = this.truck;
    if (t.state !== 'loading') return -1;
    let need = 0;
    for (const l of t.lines) if (l.product === p) need += l.want - l.loaded;
    if (need <= 0) return -1;
    let carried = 0;
    for (const it of this.w.carry.items) if (it === p) carried++;
    return need - carried;
  }

  /** Put one item on the truck. */
  load(p: ProductId): boolean {
    const t = this.truck;
    if (t.state !== 'loading') return false;
    const l = t.lines.find((x) => x.product === p && x.loaded < x.want);
    if (!l) return false;
    l.loaded++;
    if (t.lines.every((x) => x.loaded >= x.want)) t.t = Math.min(t.t, 2); // full: leave right away
    return true;
  }

  private pickCompany(): CompanyDef {
    const w = this.w;
    const open = new Set(w.stations.filter((s) => s.open).map((s) => s.def.product));
    const ok = COMPANIES.filter((c) => c.wants.some((p) => open.has(p)));
    let total = 0;
    for (const c of ok) total += c.weight;
    let r = w.rng.next() * total;
    for (const c of ok) { r -= c.weight; if (r <= 0) return c; }
    return ok[0] ?? COMPANIES[0];
  }

  private newContract(): void {
    const w = this.w, c = this.pickCompany(), t = this.truck, C = CONTRACTS;
    const trust = this.trust[c.id] ?? 0;
    const rush = w.rng.chance(C.rush.chance);
    const k = rush ? C.rush : C.standing;
    const size = (1 + trust * C.sizeStep) * (1 + w.upgrades.level('dock.size') * ECONOMY.upgrades['dock.size'].step);
    const open = new Set(w.stations.filter((s) => s.open).map((s) => s.def.product));
    t.company = c;
    t.kind = rush ? 'rush' : 'standing';
    t.lines = c.wants.filter((p) => open.has(p)).map((p) => ({ product: p, want: Math.round(k.perProduct * size), loaded: 0 }));
    t.price = {};
    for (const l of t.lines) t.price[l.product] = Math.round(ECONOMY.products[l.product].price * w.priceMult * k.priceMult * (1 + trust * C.priceStep) * 10) / 10;
    t.state = 'arriving';
    t.drive = 0;
    t.t = C.drive;
    w.events.emit('truck', '', 0, 0, 0, rush ? 1 : 0);
  }

  private settle(): void {
    const w = this.w, t = this.truck, C = CONTRACTS;
    let loaded = 0, want = 0, value = 0;
    for (const l of t.lines) { loaded += l.loaded; want += l.want; value += l.loaded * t.price[l.product]; }
    const complete = loaded >= want;
    let pay = Math.round(value);
    if (t.kind === 'rush') {
      if (complete) pay = Math.round(value * (1 + C.rush.bonusMult));
      else pay = Math.round(loaded * ECONOMY.products[t.lines[0]?.product ?? 'egg'].price * w.priceMult); // partial at the normal price
    }
    const id = t.company.id;
    const good = t.kind === 'rush' ? complete : loaded >= want * C.fillGood;
    if (good) this.trust[id] = Math.min(C.trustMax, (this.trust[id] ?? 0) + C.up);
    else if (t.kind === 'rush') this.trust[id] = Math.max(0, (this.trust[id] ?? 0) - C.down);
    if (pay > 0) { w.cash.value += pay; w.cash.bills += Math.min(20, 4 + Math.round(loaded / 5)); }
    w.stats.trucks++;
    w.events.emit('truckDone', '', 0, 0, pay, good ? 1 : 0);
  }

  /** Player loads the truck at the dock (called from world.interact). */
  interact(dt: number): void {
    if (!this.open || this.truck.state !== 'loading') return;
    const w = this.w, p = w.player, d = LAYOUT.dock.load;
    this.dropT -= dt;
    if (this.dropT > 0 || dist(p.x, p.z, d.x, d.z) > 1.4) return;
    for (const l of this.truck.lines) {
      if (l.loaded >= l.want || !w.carry.has(l.product)) continue;
      w.carry.take(l.product);
      this.load(l.product);
      this.dropT = ECONOMY.player.dropInterval;
      w.events.emit('drop', l.product, d.x, d.z, 0, w.carry.n);
      return;
    }
  }

  update(dt: number): void {
    if (!this.open) return;
    const t = this.truck, C = CONTRACTS;
    t.t -= dt;
    switch (t.state) {
      case 'away':
        if (t.t <= 0) this.newContract();
        break;
      case 'arriving':
        t.drive = Math.min(1, 1 - t.t / C.drive);
        if (t.t <= 0) { t.state = 'loading'; t.t = t.kind === 'rush' ? C.rush.window : C.standing.window; }
        break;
      case 'loading':
        if (t.t <= 0) { this.settle(); t.state = 'leaving'; t.t = C.drive; }
        break;
      case 'leaving':
        t.drive = Math.max(0, t.t / C.drive);
        if (t.t <= 0) { t.state = 'away'; t.t = this.w.rng.range(C.gapMin, C.gapMax); }
        break;
    }
  }
}
