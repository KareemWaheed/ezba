import type { ScenarioDef, ScenarioGoal } from '../../config/scenarios';
import type { SimWorld } from '../world';
import type { ProductId } from '../../config/economy';
import type { CrowdStyle } from '../../config/looks';

/**
 * What makes one scenario play differently from another. ScenarioSystem owns the phases (warn,
 * active, settle) and the reward; a mechanic adds the event's own rules, state and goals.
 */
export interface Mechanic {
  /** The warning starts (e.g. announce an order so the player can prepare). */
  warn?(w: SimWorld, def: ScenarioDef): void;
  /** The event goes active. */
  start(w: SimWorld, def: ScenarioDef): void;
  /** Every tick while the event is active or settling. */
  update(w: SimWorld, dt: number): void;
  /** State of a goal this mechanic owns; undefined for goals it doesn't own. */
  goal(w: SimWorld, g: ScenarioGoal): boolean | undefined;
  /** 0..1 progress for the HUD bar of an owned goal. */
  progress?(w: SimWorld, g: ScenarioGoal): number;
  /** An item was sold at a shop lane (byPlayer: the player was serving that lane). */
  onSell?(w: SimWorld, product: ProductId, byPlayer: boolean): void;
  /** The guest's order may be handed over right now (e.g. not before the security check). */
  canDeliver?(w: SimWorld): boolean;
  /** A stop to make on the way to the stage with the guest's order (null = go straight). */
  deliverVia?(w: SimWorld): { x: number; z: number } | null;
  /** The player put a raw item into a café machine. */
  onPlayerFeed?(w: SimWorld, machine: string): void;
  /** Let the player feed this café machine even when its tray is full. */
  feedAnyway?(machine: string): boolean;
  /** Multiplies event customers' tips (on top of the event's own tipMult). */
  tipMult?(): number;
  /** Extra condition for the third star (e.g. a perfect run). */
  bonus?(w: SimWorld): boolean;
  /** Where the bot should go to work on this event (null = nothing to do). */
  botTarget?(w: SimWorld): { x: number; z: number } | null;
  /** Crowd look for an event customer with this look seed (default: the event's crowd). */
  crowdStyle?(look: number): CrowdStyle;
  /** A -1..1 tug meter for the banner (e.g. the derby's balance). */
  hudMeter?(): number;
  /** A screen mode for the HUD (e.g. 'rec' while the camera rolls). */
  hudMode?(): string;
  /** Extra line for the event banner (e.g. what's left of an order). */
  hudText?(w: SimWorld): string;
  /** Keep the event going past its timer (e.g. a procession still walking). */
  busy?(w: SimWorld): boolean;
  /** Drop all temporary state (event end, time away). Idempotent. */
  teardown(w: SimWorld): void;
}

export type MechanicId = 'basic' | 'motorcade' | 'football' | 'stage' | 'storm' | 'inspector' | 'procession' | 'comments' | 'bulk'
  | 'derby' | 'filming' | 'chase' | 'cookoff' | 'iftar' | 'khamaseen';

/** No extra rules: the guest, crowd and built-in goals only. */
export const BASIC: Mechanic = { start() {}, update() {}, goal: () => undefined, teardown() {} };
