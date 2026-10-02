import type { DishId, ProductId } from '../config/economy';
import type { Recipe } from '../config/recipes';
import type { SimWorld } from './world';

/** Anything that can jam and be fixed by the player standing next to it (belts, stoves, ...). */
export interface Breakable {
  broken: boolean;
  /** Seconds of running until the next jam (<0 = not scheduled yet). */
  breakT: number;
  /** Seconds the player has spent fixing it. */
  fixT: number;
  /** Where the player stands to fix it. */
  readonly mx: number;
  readonly mz: number;
  /** Only running machines can jam. */
  readonly running: boolean;
}

/**
 * Recipe machine: raw items go into an input buffer, one recipe cooks at a time, finished items
 * wait in an output tray. Data-driven so the stage-5 bakery/dairy reuse it.
 */
export class Converter implements Breakable {
  readonly input = {} as Record<ProductId, number>;
  readonly output = {} as Record<DishId, number>;
  cooking: Recipe | null = null;
  /** Seconds left on the current recipe. */
  t = 0;
  speedMult = 1;
  enabled = false;
  broken = false;
  breakT = -1;
  fixT = 0;

  constructor(
    readonly recipes: readonly Recipe[],
    readonly inputMax: number,
    readonly outputMax: number,
    readonly mx: number,
    readonly mz: number,
  ) {
    for (const r of recipes) {
      this.output[r.output] = 0;
      for (const k of Object.keys(r.inputs) as ProductId[]) this.input[k] = 0;
    }
  }

  get running(): boolean { return this.enabled; }

  /** Recipes whose raw product is on the farm right now. */
  active(w: SimWorld): Recipe[] {
    return this.recipes.filter((r) => w.stations.some((s) => s.open && s.def.product === r.needs));
  }

  /** Can this raw item be dropped in? */
  wants(p: ProductId): boolean {
    return this.enabled && p in this.input && this.input[p] < this.inputMax;
  }

  accept(p: ProductId): boolean {
    if (!this.wants(p)) return false;
    this.input[p]++;
    return true;
  }

  /** Take one finished item (prefers the fullest tray). */
  takeAny(): DishId | null {
    let best: DishId | null = null;
    for (const k of Object.keys(this.output) as DishId[]) if (this.output[k] > 0 && (!best || this.output[k] > this.output[best])) best = k;
    if (best) this.output[best]--;
    return best;
  }

  get outputCount(): number {
    let n = 0;
    for (const k in this.output) n += this.output[k as DishId];
    return n;
  }

  update(dt: number, w: SimWorld): void {
    if (!this.enabled || this.broken) return;
    if (!this.cooking) {
      // cook whatever is lowest in the tray among recipes we have ingredients for
      let pick: Recipe | null = null;
      for (const r of this.recipes) {
        if (this.output[r.output] >= this.outputMax) continue;
        let ok = true;
        for (const [k, n] of Object.entries(r.inputs) as [ProductId, number][]) if (this.input[k] < n) { ok = false; break; }
        if (ok && (!pick || this.output[r.output] < this.output[pick.output])) pick = r;
      }
      if (!pick) return;
      for (const [k, n] of Object.entries(pick.inputs) as [ProductId, number][]) this.input[k] -= n;
      this.cooking = pick;
      this.t = pick.time / this.speedMult;
      return;
    }
    this.t -= dt;
    if (this.t <= 0) {
      this.output[this.cooking.output]++;
      w.events.emit('cooked', this.cooking.output, this.mx, this.mz);
      this.cooking = null;
    }
  }
}
