import type { DishId, ItemId, ProductId } from './economy';

/**
 * Recipes for converter machines (café kitchen now; bakery and dairy in stage 5 reuse this).
 * `inputs` = raw items consumed, `time` = seconds to make one at speed level 0.
 */
export interface Recipe {
  output: DishId;
  inputs: Partial<Record<ItemId, number>>;
  time: number;
  /** Station that must be open for this recipe to be offered (none = always while the machine runs). */
  needs?: ProductId;
}

/** Café kitchen machines and what each makes (keyed by CAFE.kitchen ids). */
export const KITCHEN_RECIPES: Record<string, readonly Recipe[]> = {
  stove: [{ output: 'omelette', inputs: { egg: 2 }, time: 2.5, needs: 'egg' }],
  coffee: [{ output: 'coffee', inputs: { milk: 1 }, time: 1.8, needs: 'milk' }],
};

/** Stage 5 factories (keyed by FACTORY.machines ids): bakery and dairy. */
export const FACTORY_RECIPES: Record<string, readonly Recipe[]> = {
  bakery: [{ output: 'cake', inputs: { egg: 2, wheat: 2 }, time: 4 }],
  dairy: [{ output: 'cheese', inputs: { milk: 3 }, time: 4 }],
  grill: [{ output: 'grilledFish', inputs: { fish: 1 }, time: 3 }],
};
