import type { DishId, ProductId } from './economy';

/**
 * Recipes for converter machines (the café stove now; bakery and dairy in stage 5 reuse this).
 * `inputs` = raw items consumed, `time` = seconds to cook one at speed level 0.
 */
export interface Recipe {
  output: DishId;
  inputs: Partial<Record<ProductId, number>>;
  time: number;
  /** Station that must be open for this recipe to be offered. */
  needs: ProductId;
}

export const STOVE_RECIPES: readonly Recipe[] = [
  { output: 'omelette', inputs: { egg: 2 }, time: 2.5, needs: 'egg' },
  { output: 'milkcup', inputs: { milk: 1 }, time: 1.6, needs: 'milk' },
];
