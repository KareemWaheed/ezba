import type { ScenarioDef, ScenarioGoal } from '../../config/scenarios';
import type { CrowdStyle } from '../../config/looks';
import { LAYOUT } from '../../config/layout';
import type { SimWorld } from '../world';
import type { Mechanic } from './mechanic';

/** |meter| above this for CLASH_AFTER seconds = the fans start chanting at each other. */
const HOT = 0.75;
const CLASH_AFTER = 4;
/** How fast the meter follows the crowd. */
const FOLLOW = 0.35;
/** Seconds before the meter starts moving (both sides are still arriving). */
const GRACE = 12;
/** Patience every derby fan loses in a clash (share of their max). */
const CLASH_COST = 0.2;

/**
 * Ahly vs Zamalek: red and white fans come in together, each side in its own lanes. A meter leans
 * toward the side with more fans kept waiting; keep it near the middle by serving that side's lane, or
 * they clash (everyone loses patience). The fans' side comes from their look seed (no extra random draws).
 */
export class DerbyMechanic implements Mechanic {
  /** -1 (white waited much longer) .. 1 (red waited much longer). */
  meter = 0;
  clash = 0;
  private hotT = 0;
  private time = 0;

  start(_w: SimWorld, _def: ScenarioDef): void {}

  /** Derby fans wear one side's colors. */
  crowdStyle(look: number): CrowdStyle { return look % 2 ? 'fanWhite' : 'fanRed'; }

  /**
   * Each side has its own stand: Ahly fans queue in lanes 1 and 3, Zamalek fans only in lane 2, so the
   * white line backs up unless the player helps there (with one lane open everyone shares it).
   */
  laneFor(look: number, waiting: readonly number[], lanes: number): number | null {
    if (lanes < 2) return null;
    if (look % 2) return 1;
    return lanes >= 3 && waiting[2] < waiting[0] ? 2 : 0;
  }

  /** Fans of each side waiting in line. */
  private waiting(w: SimWorld): { red: number; white: number } {
    let red = 0, white = 0;
    for (const c of w.customers.list) {
      if (!c.scenario || c.state !== 'queue') continue;
      if (c.style === 'fanRed') red++; else if (c.style === 'fanWhite') white++;
    }
    return { red, white };
  }

  update(w: SimWorld, dt: number): void {
    if (w.scenario.phase !== 'active') return;
    this.time += dt;
    if (this.time < GRACE) return;
    // the side with more fans kept waiting gets rowdy
    const { red, white } = this.waiting(w);
    const target = ((red - white) / Math.max(4, red + white)) * 1.4;
    this.meter += (Math.max(-1, Math.min(1, target)) - this.meter) * Math.min(1, dt * FOLLOW);
    if (Math.abs(this.meter) > HOT) this.hotT += dt; else this.hotT = 0;
    if (this.hotT >= CLASH_AFTER) {
      this.hotT = 0;
      this.clash++;
      this.meter *= 0.3;
      for (const c of w.customers.list) if (c.scenario && c.state === 'queue') c.patience = Math.max(1, c.patience - c.patienceMax * CLASH_COST);
      w.events.emit('scenarioCue', '', 0, 0, this.clash, 1);
    }
  }

  hudMeter(): number { return this.meter; }

  goal(_w: SimWorld, g: ScenarioGoal): boolean | undefined {
    return g === 'balance' ? this.clash === 0 : undefined;
  }

  progress(_w: SimWorld, g: ScenarioGoal): number { return g === 'balance' ? 1 - Math.abs(this.meter) : 0; }

  /** The lane whose front fan is on the side the meter leans to (the one waiting longest there). */
  botTarget(w: SimWorld): { x: number; z: number } | null {
    const want = this.meter >= 0 ? 'fanRed' : 'fanWhite';
    let lane = -1, best = -1;
    for (let i = 0; i < w.lanes; i++) {
      const f = w.customers.front(i);
      if (!f || !f.scenario) continue;
      const waited = f.patienceMax - f.patience + (f.style === want ? 1000 : 0);
      if (waited > best) { best = waited; lane = i; }
    }
    return lane < 0 ? null : { x: LAYOUT.shop.lanes[lane].x, z: LAYOUT.shop.serveZ };
  }

  teardown(): void {
    this.meter = 0;
  }
}
