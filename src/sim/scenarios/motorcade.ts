import type { ScenarioDef, ScenarioGoal } from '../../config/scenarios';
import type { ProductId } from '../../config/economy';
import { LAYOUT } from '../../config/layout';
import { dist } from '../math';
import type { SimWorld } from '../world';
import type { Mechanic } from './mechanic';

export type MotorcadeVariant = 'escort' | 'photo' | 'reorder';

/** Served with at least this share of the guest's patience left counts as in time. */
const IN_TIME = 0.3;
/** Perfect: this much patience left. */
const FAST = 0.6;
const GATE_R = 0.9;
const PHOTO_R = 0.8;
/** Photo countdown after the guest is served, and the gap before a second try. */
const PHOTO_COUNT = 3;
const PHOTO_RETRY = 2.5;

/**
 * A president's visit: deliver the order to the stage before the guest runs out of patience.
 * escort (Sisi): the guards only accept an order that went through the security gate on the carpet.
 * photo (Macron): after serving, stand on the marker for the official photo when the count hits 0.
 * reorder (Trump): he changes his order twice (the event's twists), so keep an eye on the bubble.
 */
export class MotorcadeMechanic implements Mechanic {
  variant: MotorcadeVariant = 'escort';
  /** Escort: the player's current load went through security. */
  cleared = false;
  /** Photo: seconds left on the countdown (0 = not counting), tries used, taken. */
  photoT = 0;
  photoTries = 0;
  photoTaken = false;
  private waitT = 0;

  start(_w: SimWorld, def: ScenarioDef): void {
    this.variant = def.variant === 'photo' ? 'photo' : def.variant === 'reorder' ? 'reorder' : 'escort';
  }

  /** Is the player carrying anything the guest still wants? */
  private carriesOrder(w: SimWorld): boolean {
    const g = w.scenario.guest;
    if (!g) return false;
    return g.lines.some((l) => l.left > 0 && w.carry.has(l.product as ProductId));
  }

  update(w: SimWorld, dt: number): void {
    const g = w.scenario.guest;
    if (this.variant === 'escort') {
      const gate = LAYOUT.vipStage.gate;
      if (!this.cleared && this.carriesOrder(w) && dist(w.player.x, w.player.z, gate.x, gate.z) < GATE_R) {
        this.cleared = true;
        w.events.emit('scenarioCue', '', gate.x, gate.z, 0, 1);
      }
      // hands emptied without delivering: the next load needs checking again
      if (this.cleared && !this.carriesOrder(w) && g?.state === 'order') this.cleared = false;
    }
    if (this.variant === 'photo' && w.scenario.guestServed && !this.photoTaken && this.photoTries < 2) {
      if (this.photoT <= 0) {
        this.waitT -= dt;
        if (this.waitT <= 0) { this.photoT = PHOTO_COUNT; w.events.emit('scenarioCue', '', 0, 0, PHOTO_COUNT, 2); }
        return;
      }
      const before = Math.ceil(this.photoT);
      this.photoT -= dt;
      if (this.photoT > 0) {
        if (Math.ceil(this.photoT) !== before) w.events.emit('scenarioCue', '', 0, 0, Math.ceil(this.photoT), 2);
        return;
      }
      this.photoT = 0;
      this.photoTries++;
      const ph = LAYOUT.vipStage.photo;
      this.photoTaken = dist(w.player.x, w.player.z, ph.x, ph.z) < PHOTO_R;
      this.waitT = PHOTO_RETRY;
      w.events.emit('scenarioCue', '', ph.x, ph.z, 0, this.photoTaken ? 3 : 4);
    }
  }

  /** Guards turn the order away until it has been through the gate (escort only). */
  canDeliver(): boolean { return this.variant !== 'escort' || this.cleared; }

  /** Where to go before the stage: the security gate with an unchecked load. */
  deliverVia(w: SimWorld): { x: number; z: number } | null {
    return this.variant === 'escort' && !this.cleared && this.carriesOrder(w) ? LAYOUT.vipStage.gate : null;
  }

  goal(w: SimWorld, g: ScenarioGoal): boolean | undefined {
    if (g === 'inTime') return w.scenario.guestServed && w.scenario.servedPatience >= IN_TIME;
    if (g === 'photo') return this.photoTaken;
    return undefined;
  }

  bonus(w: SimWorld): boolean { return w.scenario.servedPatience >= FAST; }

  /** The photo marker while the photographer counts down. */
  botTarget(w: SimWorld): { x: number; z: number } | null {
    if (this.variant === 'photo' && w.scenario.guestServed && !this.photoTaken && this.photoTries < 2) return LAYOUT.vipStage.photo;
    return null;
  }

  teardown(): void {
    this.cleared = false;
    this.photoT = 0;
  }
}
