import type { DishId, ProductId } from './economy';

/**
 * Recipes for converter machines (café kitchen now; bakery and dairy in stage 5 reuse this).
 * `inputs` = raw items consumed, `time` = seconds to make one at speed level 0.
 */
export interface Recipe {
  output: DishId;
  inputs: Partial<Record<ProductId, number>>;
  time: number;
  /** Station that must be open for this recipe to be offered. */
  needs: ProductId;
}

/** Café kitchen machines and what each makes (keyed by CAFE.kitchen ids). */
export const KITCHEN_RECIPES: Record<string, readonly Recipe[]> = {
  stove: [{ output: 'omelette', inputs: { egg: 2 }, time: 2.5, needs: 'egg' }],
  coffee: [{ output: 'coffee', inputs: { milk: 1 }, time: 1.8, needs: 'milk' }],
};
