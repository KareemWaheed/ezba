import type { Box } from '../sim/math';
import type { DishId } from './economy';

/**
 * Farm café east of the shop (opened by the cafe.unlock upgrade, which also extends the
 * walkable area to `unlockedX1`). Kitchen in the back-right corner, café counter on the left, tables
 * in front of the kitchen.
 */
export const CAFE = {
  plot: { x0: 12.2, x1: 20.6, z0: 0.4, z1: 12.4 } as Box,
  unlockedX1: 20.2,
  /**
   * Kitchen machines side by side (each solid): drop the raw item at `input`; what it makes slides
   * on its own little conveyor to the café counter. Recipes: config/recipes.ts (KITCHEN_RECIPES).
   */
  kitchen: [
    { id: 'stove', name: 'طاسة البيض', icon: '🍳', raw: 'egg', box: { x0: 15.5, x1: 17.5, z0: 0.8, z1: 1.9 } as Box, input: { x: 16.5, z: 2.7 } },
    { id: 'coffee', name: 'ماكينة القهوة', icon: '☕', raw: 'milk', box: { x0: 18.3, x1: 20.1, z0: 0.8, z1: 1.9 } as Box, input: { x: 19.2, z: 2.7 } },
  ] as const,
  /** Café counter (solid). Dishes stack on it; the player drops dishes / serves from the kitchen side. */
  counter: {
    box: { x0: 12.9, x1: 15.5, z0: 4.6, z1: 5.4 } as Box,
    slots: { omelette: { x: 13.6 }, coffee: { x: 14.8 } } as Record<DishId, { x: number }>,
    slotZ: 5.0,
    /** Player drops dishes here and serves from here. */
    serve: { x: 14.2, z: 3.9 },
    /** Café line starts in front of the counter. */
    queue: { x: 14.2, z: 6.2, gap: 1.1 },
  },
  /** Café cash pile (cleaners bring table money here too). */
  cash: { x: 12.9, z: 3.0 },
  /** Table spots in unlock order. */
  tables: [[17.2, 6.0], [19.4, 6.0], [17.2, 8.3], [19.4, 8.3], [17.2, 10.6], [19.4, 10.6]] as const,
  spawn: { x: 16.0, z: 14.5 },
  exit: { x: 19.0, z: 15.0 },
};
