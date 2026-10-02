import type { Box } from '../sim/math';
import type { DishId } from './economy';

/**
 * Farm café east of the shop (opened by the cafe.unlock upgrade, which also extends the
 * walkable area to `unlockedX1`). Kitchen at the back, café counter on the left, tables on the right.
 */
export const CAFE = {
  plot: { x0: 12.2, x1: 20.6, z0: 0.4, z1: 12.4 } as Box,
  unlockedX1: 20.2,
  /** Stove body (solid) and its two zones: drop raw items in, pick cooked dishes up. */
  stove: {
    box: { x0: 15.2, x1: 18.0, z0: 0.8, z1: 1.9 } as Box,
    input: { x: 15.9, z: 2.7 },
    output: { x: 17.6, z: 2.7 },
  },
  /** Café counter (solid). Dishes stack on it; the player drops dishes / serves from the kitchen side. */
  counter: {
    box: { x0: 12.9, x1: 15.5, z0: 4.6, z1: 5.4 } as Box,
    slots: { omelette: { x: 13.6 }, milkcup: { x: 14.8 } } as Record<DishId, { x: number }>,
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
