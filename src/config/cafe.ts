import type { Box } from '../sim/math';
import type { DishId } from './economy';

/**
 * Farm café east of the shop (opened by the cafe.unlock upgrade, which also extends the
 * walkable area to `unlockedX1`). Kitchen line on the back wall feeding the counter below it,
 * tables on the right, upgrade tiles in the free left and right columns.
 */
export const CAFE = {
  plot: { x0: 12.2, x1: 20.6, z0: 0.4, z1: 12.4 } as Box,
  unlockedX1: 20.2,
  /**
   * Kitchen machines side by side (each solid): drop the raw item at `input` (outer side); what it
   * makes rides a short conveyor at `beltX` (inner side) straight down onto the counter, so the line
   * reads: egg spot | egg belt | serve spot | coffee belt | milk spot. Recipes: config/recipes.ts.
   */
  kitchen: [
    { id: 'stove', name: 'طاسة البيض', icon: '🍳', raw: 'egg', box: { x0: 12.8, x1: 14.6, z0: 0.8, z1: 1.9 } as Box, input: { x: 13.2, z: 2.8 }, beltX: 14.25 },
    { id: 'coffee', name: 'ماكينة القهوة', icon: '☕', raw: 'milk', box: { x0: 15.6, x1: 17.6, z0: 0.8, z1: 1.9 } as Box, input: { x: 17.1, z: 2.8 }, beltX: 15.95 },
  ] as const,
  /** Café counter (solid). Dishes stack on it; the player drops dishes / serves from the kitchen side. */
  counter: {
    box: { x0: 13.5, x1: 17.0, z0: 4.6, z1: 5.4 } as Box,
    /** Each dish stacks where its conveyor ends (kitchen[].beltX). */
    slots: { omelette: { x: 14.25 }, coffee: { x: 15.95 } } as Record<DishId, { x: number }>,
    slotZ: 5.0,
    /** Player drops dishes here and serves from here. */
    serve: { x: 15.1, z: 3.9 },
    /** Café line starts in front of the counter. */
    queue: { x: 15.1, z: 6.3, gap: 1.1 },
  },
  /** Café cash pile (cleaners bring table money here too). */
  cash: { x: 12.7, z: 4.8 },
  /** Table spots in unlock order. */
  tables: [[17.8, 7.7], [19.5, 7.7], [17.8, 9.55], [19.5, 9.55], [17.8, 11.4], [19.5, 11.4]] as const,
  /** Where idle cleaners wait (between the line and the tables). */
  cleanerIdle: { x: 16.5, z: 12.0 },
  /** Where new kitchen helpers appear. */
  helperHome: { x: 18.0, z: 2.6 },
  spawn: { x: 16.0, z: 14.5 },
  exit: { x: 19.0, z: 15.0 },
};
