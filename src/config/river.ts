import type { Box } from '../sim/math';

/**
 * Stage 6: the river along the north edge, past the fields, with a dock west of the corn.
 * Opening it (river.unlock) moves the walkable area's north edge to `unlockedZ0` and west edge to
 * `unlockedX0`. Fishing boats leave from the pier and unload crates onto the fish pile; fish sells at
 * the fish stall or goes into the grill (a factory machine, config/factories.ts). Visitors rent
 * rowboats at the pier; a returned rowboat must be tied up (player at `tie`, or a river worker).
 */
export const RIVER = {
  /** Water (visual) and the sandy bank strip in front of it. */
  water: { x0: -40, x1: 45, z0: -32, z1: -21.0 } as Box,
  bank: { x0: -16.6, x1: 16.6, z0: -21.0, z1: -18.7 } as Box,
  /** Walkable area once open. */
  unlockedZ0: -20.6,
  unlockedX0: -16.3,
  /** Wooden pier sticking out into the water (visual). */
  pier: { x0: -11.0, x1: -9.6, z0: -25.0, z1: -20.9 } as Box,
  /** Where fishing boats moor (east side of the pier), one per boat. */
  moor: [[-8.9, -22.4], [-8.9, -23.8], [-8.9, -25.2]] as const,
  /** Where boats go to fish (off the top of the screen). */
  sea: { x: -6, z: -42 },
  /** Fish crates pile on the bank. */
  pile: { x: -8.3, z: -19.8, cols: 2, rows: 2 },
  /** Fish stall (solid): sell fish at `drop`, money piles at `cash`. */
  stall: { box: { x0: -6.4, x1: -4.6, z0: -18.0, z1: -17.2 } as Box, drop: { x: -5.5, z: -16.3 }, cash: { x: -3.0, z: -16.8 } },
  /** Rowboat rental: tie spot on the bank by the pier's west side; rowboats wait there (in the water). */
  tie: { x: -11.9, z: -20.0 },
  rowSlots: [[-11.8, -21.8], [-11.8, -23.1], [-11.8, -24.4], [-12.9, -21.8], [-12.9, -23.1]] as const,
  /** Rowboats pass the pier's far end here on the way out to the loop and back (so they never cross it). */
  pierEnd: { x: -11.9, z: -26.4 },
  /** Rowboat ride loop on the river (visual path around this ellipse). */
  ride: { x: 2.5, z: -25.8, rx: 7, rz: 2.2 },
  /** Visitors arrive from the west along the bank and queue here (line goes west). */
  queue: { x: -13.6, z: -19.6, gap: 1.0 },
  visitorSpawn: { x: -19, z: -17 },
  /** Seafood companies' refrigerated trucks: they come along the bank from the east and park by the corn. */
  truck: { load: { x: -2.6, z: -19.9 }, park: { x: 0.4, z: -19.9 }, road: { x: 26, z: -19.9 } },
} as const;
