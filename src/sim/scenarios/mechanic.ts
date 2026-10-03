import type { ScenarioDef, ScenarioGoal } from '../../config/scenarios';
import type { SimWorld } from '../world';

/**
 * What makes one scenario play differently from another. ScenarioSystem owns the phases (warn,
 * active, settle) and the reward; a mechanic adds the event's own rules, state and goals.
 */
export interface Mechanic {
  /** The event goes active. */
  start(w: SimWorld, def: ScenarioDef): void;
  /** Every tick while the event is active or settling. */
  update(w: SimWorld, dt: number): void;
  /** State of a goal this mechanic owns; undefined for goals it doesn't own. */
  goal(w: SimWorld, g: ScenarioGoal): boolean | undefined;
  /** 0..1 progress for the HUD bar of an owned goal. */
  progress?(w: SimWorld, g: ScenarioGoal): number;
  /** Where the bot should go to work on this event (null = nothing to do). */
  botTarget?(w: SimWorld): { x: number; z: number } | null;
  /** Drop all temporary state (event end, time away). Idempotent. */
  teardown(w: SimWorld): void;
}

export type MechanicId = 'basic' | 'motorcade' | 'football' | 'stage' | 'storm' | 'inspector' | 'procession' | 'comments' | 'bulk'
  | 'derby' | 'filming' | 'chase' | 'cookoff' | 'iftar' | 'khamaseen';

/** No extra rules: the guest, crowd and built-in goals only. */
export const BASIC: Mechanic = { start() {}, update() {}, goal: () => undefined, teardown() {} };
