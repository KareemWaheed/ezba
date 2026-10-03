import type { Box } from '../sim/math';
import { CAFE } from './cafe';
import { FIELDS } from './fields';
import { FACTORY } from './factories';

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
  yard: { x0: -9, x1: 11.5, z0: -1.9, z1: 14 } as Box,
  /** Fenced animal areas. */
  coop: { x0: -7, x1: 0, z0: -9.4, z1: -2 } as Box,
  pen: { x0: 3, x1: 10, z0: -9.4, z1: -2 } as Box,
  /**
   * Shop front. Products are stocked at the two ends of the counter (see stations.ts) so workers and
   * belts deliver at the sides; checkout lanes sit in the middle (opened in this order). The
   * player/cashier stands at (x, serveZ) behind the counter, customers line up from (x, queueZ).
   */
  shop: {
    lanes: [{ x: 0 }, { x: -2.4 }, { x: 2.4 }],
    serveZ: 3.0,
    queueZ: 5.45,
    queueGap: 1.15,
    spawn: { x0: -3, x1: -1.5, z: 14.5 },
    exit: { x: 2.8, z: 15.5 },
    cash: { x: 6.6, z: 4.6 },
  },
  /**
   * Walled HR yard west of the farm. Locked (shaded, outside the walkable area) until the
   * HR office upgrade is bought; then the walkable area grows to `unlockedX0` and the gate in the
   * east wall lets the player in.
   */
  hrYard: {
    box: { x0: -17, x1: -10.4, z0: 1.5, z1: 10.5 } as Box,
    gate: { z0: 5.0, z1: 7.0 },
    building: { x0: -16.2, x1: -11.4, z0: 2.1, z1: 3.9 } as Box,
    unlockedX0: -16.3,
  },
  /**
   * VIP stage for scenario guests (president, stars...): they arrive from `entry` (motorcade side),
   * walk the carpet to the stage, pose, order, and the player delivers to `drop` in person.
   */
  /**
   * Mini football pitch for the star footballers' visits (right of the shop lanes). The goal mouth is
   * on the east line; the ball starts at `kick`; Messi's cones zigzag across the middle.
   */
  pitch: {
    x0: 2.9, x1: 6.3, z0: 4.8, z1: 8.0,
    goal: { x: 6.3, z0: 5.8, z1: 7.0 },
    kick: { x: 3.6, z: 6.4 },
    cones: [{ x: 4.1, z: 5.3 }, { x: 4.7, z: 7.5 }, { x: 5.3, z: 5.3 }],
  },
  /** Dance pads beside the VIP stage's crowd for the concert visit (diamond: west, east, north, south). */
  dancePads: [{ x: -2.2, z: 11.7 }, { x: -0.2, z: 11.7 }, { x: -1.2, z: 10.7 }, { x: -1.2, z: 12.7 }],
  vipStage: {
    x: -6.4, z: 8.4, w: 3.2, d: 2.2,
    seat: { x: -6.4, z: 8.1 },
    drop: { x: -6.4, z: 10.1 },
    entry: { x: -11.5, z: 13.4 },
  },
  /** Loading dock for company trucks (bottom right). The player loads at `load`; trucks park at `bay`. */
  dock: {
    load: { x: 8.4, z: 10.4 },
    bay: { x: 9.8, z: 12.6 },
    /** Where trucks come from / leave to. */
    road: { x: 9.8, z: 22 },
    platform: { x0: 7.2, x1: 11.2, z0: 10.9, z1: 11.5 } as Box,
  },
  /** Sell counter body. */
  counter: { x0: -7.6, x1: 5.4, z0: 3.55, z1: 4.45 } as Box,

  /** Decorative trees around the edge (x, z). */
  trees: [
    [-18.5, -11], [-17.5, -5], [-19.5, 2.5], [-19, 9], [-10, 15], [-13, 13], [-16.5, 12.5], [-14, -1], [17.5, -12.5], [31, -3], [31.5, 4],
    [31.5, 11], [4, 17], [-5, 17.5],
  ] as const,
  hay: [[19.6, -7.6], [19.6, -6.0], [19.6, -4.4], [20.8, -6.8]] as const,
} as const;

/** Yard walls (0.3 thick) with a gap for the gate in the east wall. */
function hrWalls(): Box[] {
  const { box: b, gate: g } = LAYOUT.hrYard, t = 0.3;
  return [
    { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z0 + t },
    { x0: b.x0, x1: b.x1, z0: b.z1 - t, z1: b.z1 },
    { x0: b.x0, x1: b.x0 + t, z0: b.z0, z1: b.z1 },
    { x0: b.x1 - t, x1: b.x1, z0: b.z0, z1: g.z0 },
    { x0: b.x1 - t, x1: b.x1, z0: g.z1, z1: b.z1 },
  ];
}
export const HR_WALLS = hrWalls();

/** Fence solids per station; mutated in place when a pen grows (see fenceFor). */
export const FENCES: Record<string, Box> = {
  eggs: { x0: LAYOUT.coop.x0 - 0.1, x1: LAYOUT.coop.x1 + 0.1, z0: LAYOUT.coop.z0 - 0.5, z1: LAYOUT.coop.z1 + 0.1 },
  milk: { x0: LAYOUT.pen.x0 - 0.1, x1: LAYOUT.pen.x1 + 0.1, z0: LAYOUT.pen.z0 - 0.5, z1: LAYOUT.pen.z1 + 0.1 },
};
/** Bumped whenever solids change, so cached routing can rebuild. */
export const SOLIDS_VERSION = { v: 0 };

const added = new Set<string>();
/** Add a solid once (things built later on ground the player can already reach). */
export function addSolid(key: string, b: Box): void {
  if (added.has(key)) return;
  added.add(key);
  SOLIDS.push({ ...b });
  SOLIDS_VERSION.v++;
}

/** Things the player can't walk through. Fence boxes are padded slightly at the back. */
export const SOLIDS: Box[] = [
  FENCES.eggs,
  FENCES.milk,
  { ...LAYOUT.counter },
  ...hrWalls(),
  { ...LAYOUT.hrYard.building },
  ...CAFE.kitchen.map((k) => ({ ...k.box })),
  { ...FIELDS.stall.box },
  // the river grill and fish stall stand on reachable ground: they become solid once built (addSolid)
  ...FACTORY.machines.filter((m) => m.id !== 'grill').map((m) => ({ ...m.box })),
  { x0: FACTORY.silo.x - FACTORY.silo.r, x1: FACTORY.silo.x + FACTORY.silo.r, z0: FACTORY.silo.z - FACTORY.silo.r, z1: FACTORY.silo.z + FACTORY.silo.r },
  { ...CAFE.counter.box },
  // hay bales lie along x (length 1.2, radius 0.5)
  ...LAYOUT.hay.map(([x, z]) => ({ x0: x - 0.6, x1: x + 0.6, z0: z - 0.5, z1: z + 0.5 })),
  // tree trunks
  ...LAYOUT.trees.map(([x, z]) => ({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 })),
];
