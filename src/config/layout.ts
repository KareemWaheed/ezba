import type { Box } from '../sim/math';

/**
 * Static farm layout (world units, +x right, +z toward the camera).
 * Stage-specific stations (piles, counters, tiles) are added by stage data from M2 on;
 * this file holds the shared ground plan.
 */
export const LAYOUT = {
  /** Walkable area; the player is clamped inside it. */
  bounds: { x0: -8.6, x1: 11.4, z0: -9.5, z1: 13.5 } as Box,
  spawn: { x: -1.5, z: 1.6 },

  /** Sandy yard in front of the animal areas. */
  yard: { x0: -8, x1: 11.5, z0: -1.9, z1: 14 } as Box,
  /** Fenced animal areas. */
  coop: { x0: -7, x1: 0, z0: -9.4, z1: -2 } as Box,
  pen: { x0: 3, x1: 10, z0: -9.4, z1: -2 } as Box,
  /** Sell counter body. */
  counter: { x0: -2.3, x1: 2.3, z0: 3.55, z1: 4.45 } as Box,

  /** Decorative trees around the edge (x, z). */
  trees: [
    [-10, -11], [-10.5, -5], [-11, 2], [-10.5, 9], [-10, 15], [13.5, -10], [14, -3], [13.5, 4],
    [14, 11], [-4, -13], [2, -12.5], [9, -13], [4, 17], [-5, 17.5],
  ] as const,
  hay: [[11.6, 7], [11.6, 8.6], [11.6, 10.2], [12.8, 7.8], [12.8, 9.4]] as const,
} as const;

/** Things the player can't walk through. Fence boxes are padded slightly at the back. */
export const SOLIDS: Box[] = [
  { x0: LAYOUT.coop.x0 - 0.1, x1: LAYOUT.coop.x1 + 0.1, z0: LAYOUT.coop.z0 - 0.5, z1: LAYOUT.coop.z1 + 0.1 },
  { x0: LAYOUT.pen.x0 - 0.1, x1: LAYOUT.pen.x1 + 0.1, z0: LAYOUT.pen.z0 - 0.5, z1: LAYOUT.pen.z1 + 0.1 },
  { ...LAYOUT.counter },
  // hay bales lie along x (length 1.2, radius 0.5)
  ...LAYOUT.hay.map(([x, z]) => ({ x0: x - 0.6, x1: x + 0.6, z0: z - 0.5, z1: z + 0.5 })),
  // tree trunks
  ...LAYOUT.trees.map(([x, z]) => ({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 })),
];
