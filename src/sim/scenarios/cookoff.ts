import type { ScenarioDef, ScenarioGoal } from '../../config/scenarios';
import type { ItemId } from '../../config/economy';
import type { SimWorld } from '../world';
import type { Mechanic } from './mechanic';

/** A recipe card: feed this many of `raw` into the café machine `machine` yourself before time runs out. */
export interface Card { machine: string; raw: ItemId; qty: number; got: number; t: number; done: boolean }

const CARDS = 4;
const CARD_TIME = 22;
const GOAL = 3;

/**
 * Cook-off with the chef: recipe cards come one at a time ("3 eggs in the pan!"). Feed the right café
 * machine with your own hands before the card's timer runs out. The machine takes the chef's orders
 * even when its tray is full.
 */
export class CookoffMechanic implements Mechanic {
  cards: Card[] = [];
  ix = 0;

  start(w: SimWorld, _def: ScenarioDef): void {
    const ms = w.cafe.machines;
    for (let i = 0; i < CARDS && ms.length; i++) {
      const m = ms[i % ms.length];
      this.cards.push({ machine: m.id, raw: m.raw, qty: 3 + (i >> 1), got: 0, t: CARD_TIME, done: false });
    }
    if (this.cards.length) w.events.emit('scenarioCue', this.cards[0].raw, 0, 0, 0, 1, 0);
  }

  /** The card being cooked right now. */
  get card(): Card | null { return this.cards[this.ix] ?? null; }

  get done(): number { return this.cards.filter((c) => c.done).length; }

  private next(w: SimWorld): void {
    this.ix++;
    const c = this.card;
    if (c) w.events.emit('scenarioCue', c.raw, 0, 0, 0, 1, this.ix);
  }

  update(w: SimWorld, dt: number): void {
    const c = this.card;
    if (!c || w.scenario.phase !== 'active') return;
    c.t -= dt;
    if (c.t <= 0) { w.events.emit('scenarioCue', '', 0, 0, 0, 3, this.ix); this.next(w); }
  }

  /** The player put a raw item into a café machine. */
  onPlayerFeed(w: SimWorld, machine: string): void {
    const c = this.card;
    if (!c || c.machine !== machine) return;
    c.got++;
    if (c.got < c.qty) return;
    c.done = true;
    w.events.emit('scenarioCue', '', 0, 0, 0, 2, this.ix);
    this.next(w);
  }

  /** The chef's card goes in even when the machine's tray is full. */
  feedAnyway(machine: string): boolean { return this.card?.machine === machine; }

  /** Keep going until every card is done or timed out. */
  busy(): boolean { return this.ix < this.cards.length; }

  goal(_w: SimWorld, g: ScenarioGoal): boolean | undefined {
    return g === 'recipes' ? this.done >= GOAL : undefined;
  }

  progress(_w: SimWorld, g: ScenarioGoal): number { return g === 'recipes' ? Math.min(1, this.done / GOAL) : 0; }

  bonus(): boolean { return this.cards.length > 0 && this.done === this.cards.length; }

  /** With the card's item in hand: its machine. Otherwise the pile that has it. */
  botTarget(w: SimWorld): { x: number; z: number } | null {
    const c = this.card;
    if (!c || w.scenario.phase !== 'active') return null;
    if (w.carry.has(c.raw)) return w.cafe.machines.find((m) => m.id === c.machine)?.input ?? null;
    const st = w.stations.find((s) => s.open && s.def.product === c.raw && s.pile > 0);
    return st && !w.carry.full() ? st.def.pile : null;
  }

  hudText(): string {
    const c = this.card;
    return c ? `${c.raw}:${c.qty - c.got}` : '';
  }

  teardown(): void {
    this.cards = [];
  }
}
