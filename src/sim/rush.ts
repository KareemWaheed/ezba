import { ECONOMY, type ProductId } from '../config/economy';
import { RUSH_KINDS, type RushKind } from '../config/events';
import type { SimWorld } from './world';

export type RushPhase = 'idle' | 'warn' | 'active' | 'settle';

/**
 * Rush events: idle -> warn (countdown banner) -> active (burst of arrivals, skewed to one
 * product) -> settle (wait for the last rush customer) -> bonus if nobody left angry.
 * Only runs during active play.
 */
export class RushSystem {
  phase: RushPhase = 'idle';
  /** Seconds left in the current phase (idle: until the next warning). */
  t: number;
  kind: RushKind = RUSH_KINDS[0];
  featured: ProductId | null = null;
  /** Rush customers spawned / gone angry, and their sales. */
  spawned = 0;
  angry = 0;
  sales = 0;

  constructor(private w: SimWorld) {
    this.t = this.gap();
  }

  private gap(): number {
    const r = ECONOMY.rush;
    return this.w.rng.range(r.gapMin, r.gapMax);
  }

  get active(): boolean { return this.phase === 'active'; }

  /** Shop arrival multiplier (café rushes use their own, see CafeSystem.interval). */
  get arrivalMult(): number { return this.active && this.kind.target !== 'cafe' ? ECONOMY.rush.arrivalMult : 1; }

  /** Start the warning now (debug panel / tests). */
  trigger(): void {
    if (this.phase !== 'idle') return;
    this.t = 0;
    this.update(0, true);
  }

  private pickKind(): RushKind {
    const w = this.w, ok = RUSH_KINDS.filter((k) => (!k.when || k.when(w.clock)) && (k.target !== 'cafe' || w.cafe.open));
    let total = 0;
    for (const k of ok) total += k.weight;
    let r = w.rng.next() * total;
    for (const k of ok) { r -= k.weight; if (r <= 0) return k; }
    return ok[0];
  }

  update(dt: number, force = false): void {
    const w = this.w, cfg = ECONOMY.rush;
    if (w.away) {
      // leaving cancels any rush in progress (no bonus, no penalty)
      if (this.phase !== 'idle') {
        this.phase = 'idle';
        this.t = this.gap();
        for (const c of w.customers.list) c.rush = false;
      }
      return;
    }
    this.t -= dt;
    switch (this.phase) {
      case 'idle': {
        if (this.t > 0) break;
        if (!force && w.upgrades.bought < cfg.minUpgrades) { this.t = 30; break; }
        const open = w.stations.filter((s) => s.open);
        this.kind = this.pickKind();
        this.featured = open.length ? w.rng.pick(open).def.product : null;
        this.phase = 'warn';
        this.t = cfg.warning + w.upgrades.level('rush.warning') * ECONOMY.upgrades['rush.warning'].step;
        this.spawned = this.angry = this.sales = 0;
        w.events.emit('rushWarn', this.featured ?? '', 0, 0, 0, Math.ceil(this.t));
        break;
      }
      case 'warn':
        if (this.t <= 0) { this.phase = 'active'; this.t = cfg.duration; w.events.emit('rushStart', this.featured ?? ''); }
        break;
      case 'active':
        if (this.t <= 0) this.phase = 'settle';
        break;
      case 'settle': {
        if (w.customers.list.some((c) => c.rush)) break;
        if (this.kind.target === 'cafe') this.sales = Math.max(this.sales, 100);
        const ok = this.spawned > 0 && this.angry === 0;
        const share = cfg.bonusShare + w.upgrades.level('rush.reward') * ECONOMY.upgrades['rush.reward'].step;
        const bonus = ok ? Math.round(cfg.bonusFlat + this.sales * share) : 0;
        if (ok) { w.cash.value += bonus; w.cash.bills += 10; w.stats.rushesCleared++; }
        w.events.emit('rushEnd', '', 0, 0, bonus, ok ? 1 : 0);
        this.phase = 'idle';
        this.t = this.gap();
        break;
      }
    }
  }
}
