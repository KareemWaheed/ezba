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
  bounds: { x0: -8.6, x1: 11.4, z0: -9.5, z1: 27.4 } as Box,
  spawn: { x: -1.5, z: 1.6 },

  /** Sandy yard in front of the animal areas. */
  yard: { x0: -9, x1: 11.5, z0: -1.9, z1: 14 } as Box,
  /** Fenced animal areas. */
  coop: { x0: -7, x1: 0, z0: -9.4, z1: -2 } as Box,
  pen: { x0: 3, x1: 10, z0: -9.4, z1: -2 } as Box,
  /**
   * The apiary east of the cow pen: a 1.5 m walk between it and the fully grown pen (x1 14: `milk.expand` grows it
   * 2 m a level); flush with the walkable edge east.
   */
  apiary: { x0: 15.6, x1: 19.6, z0: -9.4, z1: -2 } as Box,
  /**
   * Shop front. Products are stocked at the two ends of the counter (see stations.ts) so workers and
   * belts deliver at the sides; checkout lanes sit in the middle (opened in this order). The
   * player/cashier stands at (x, serveZ) behind the counter, customers line up from (x, queueZ).
   */
  shop: {
    lanes: [{ x: 0 }, { x: -2.4 }, { x: 2.4 }, { x: -4.8 }, { x: 4.8 }],
    serveZ: 3.0,
    queueZ: 5.45,
    queueGap: 1.15,
    spawn: { x0: -3, x1: -1.5, z: 14.5 },
    exit: { x: 2.8, z: 15.5 },
    // (south-west of the east sorter)
    cash: { x: 8.0, z: 6.2 },
  },
  /**
   * The main belts (السير الرئيسي) along the front of the pens, at `z`: each product's belt lifts items off its pile
   * onto the belt of its side, which runs to a junction at the counter's end (`west.x` / `east.x`), turns south down
   * to the sorter (الفرّازة) standing against that end of the counter, and the sorter drops each item onto its slot.
   * West: eggs, and the corn's cable line from the field lands on the junction. East: milk and honey.
   */
  trunk: {
    z: 0.4,
    west: { x: -8.5 },
    east: { x: 8.5 },
    /** Where the belt down from the junction ends, on top of the sorter. */
    sortZ: 3.2,
    /** The sorters' footprint, against the counter's ends: gantries up on legs, walked under (the west one spans
     *  the only way round that end of the counter). */
    westSorter: { x0: -9.3, x1: -7.6, z0: 3.2, z1: 4.8 } as Box,
    eastSorter: { x0: 7.6, x1: 9.3, z0: 3.2, z1: 4.8 } as Box,
  },
  /**
   * Walled HR yard west of the farm. Locked (shaded, outside the walkable area) until the
   * HR office upgrade is bought; then the walkable area grows to `unlockedX0` and the gate in the
   * east wall lets the player in.
   */
  hrYard: {
    // (widened 4.3 m west for two more columns of staff tiles: overseer, mechanic, accountant, customer service)
    box: { x0: -21.3, x1: -10.4, z0: 1.5, z1: 10.5 } as Box,
    gate: { z0: 5.0, z1: 7.0 },
    building: { x0: -20.4, x1: -11.4, z0: 2.1, z1: 3.9 } as Box,
    unlockedX0: -20.6,
    /** Where hired mechanics wait between jobs (by the office door). */
    mechanics: { x: -14.9, z: 4.4 },
  },
  /**
   * Event square (ساحة الاحتفالات): paved ground south of the yard where special visits happen, so
   * the stage, the crowd, the pitch and the dance floor have room and stay clear of the shop.
   */
  plaza: { x0: -9, x1: 8.2, z0: 14.0, z1: 27.6 } as Box,
  /**
   * VIP stage for scenario guests (president, stars...): they arrive from `entry` (motorcade side),
   * walk the carpet to the stage, pose, order, and the player delivers to `drop` in person.
   */
  vipStage: {
    x: -4.8, z: 19.0, w: 3.2, d: 2.2,
    seat: { x: -4.8, z: 18.7 },
    drop: { x: -4.8, z: 20.7 },
    entry: { x: -11.5, z: 23.4 },
    /** Security gate on the carpet (escort visits check the order here). */
    gate: { x: -8.2, z: 22.0 },
    /** Where the player stands for the official photo next to the guest. */
    photo: { x: -3.6, z: 20.9 },
  },
  /** Fans and press stand here, facing the stage (two rows). */
  fans: { x: -6.8, z: 23.6 },
  /**
   * Football pitch for the star footballers' visits (east half of the square). The goal mouth is on
   * the east line; the ball starts at `kick`; Messi's cones zigzag across the middle.
   */
  pitch: {
    x0: 0.6, x1: 6.6, z0: 16.2, z1: 21.0,
    // a proper little goal (was 1.4 wide): room to beat Salah's keeper
    goal: { x: 6.6, z0: 17.3, z1: 19.9 },
    kick: { x: 1.8, z: 18.6 },
    cones: [{ x: 2.8, z: 17.2 }, { x: 3.7, z: 20.0 }, { x: 4.6, z: 17.2 }, { x: 5.4, z: 20.0 }],
  },
  /** Dance floor for the concert visit (diamond: west, east, north, south). */
  dancePads: [{ x: 0.9, z: 23.6 }, { x: 2.9, z: 23.6 }, { x: 1.9, z: 22.6 }, { x: 1.9, z: 24.6 }],
  /** Route of a walking group (wedding zaffa, tour) across the square, and the tour's stops. */
  procession: {
    path: [{ x: -10.5, z: 26.4 }, { x: 5.2, z: 26.4 }, { x: 7.5, z: 24.0 }, { x: 7.5, z: 15.2 }, { x: 9.4, z: 14.4 }],
    stops: [{ x: -4.5, z: 26.4 }, { x: 2.5, z: 26.4 }, { x: 7.5, z: 20.0 }],
  },
  /** Ramadan iftar table in the event square: `places` seats per side, `gap` apart, starting at x0. */
  iftarTable: { x0: -0.5, z: 18.6, places: 6, gap: 1.2 },
  /** Where the army truck parks and the player hands over the bulk order. */
  army: { drop: { x: -7.4, z: 19.6 }, truck: { x: -10.0, z: 19.6 } },
  /** Where the health inspector walks in from (the yard's west side). */
  inspectorEntry: { x: -8.3, z: 13.0 },
  /**
   * The surplus yard (حوش العزبة, `surplus.yard`): walled, west of the main yard below the HR yard, with a gate in
   * its east wall and a gap in the west wall for the trader's truck. Inside: the trader parks west of `load`, the
   * incubator stands at `incubator.box` (chicks are sold at `incubator.crate`), and records are set at `record`.
   * Locked (shaded) until bought; then the walkable area grows to `unlockedX0`.
   */
  surplusYard: {
    box: { x0: -22.4, x1: -10.6, z0: 10.9, z1: 17.6 } as Box,
    gate: { z0: 12.4, z1: 14.6 },
    road: { z0: 11.3, z1: 13.9 },
    unlockedX0: -22.1,
  },
  surplus: {
    load: { x: -16.6, z: 12.6 },
    park: { x: -19.6, z: 12.6 },
    road: { x: -34, z: 12.6 },
    incubator: { box: { x0: -14.2, x1: -12.8, z0: 11.4, z1: 12.3 } as Box, crate: { x: -13.5, z: 13.2 } },
    record: { x: -18.4, z: 16.4 },
  },
  /**
   * The butcher's (الجزارة, `meat.unlock`) north of the factory yard, east of the apiary, its window facing the
   * camera. Old cows leave the pen at its front, walk east along `laneZ` past the apiary, north along `laneX`,
   * and in at the side door. Meat sells at the window; the money piles up at `cash`.
   */
  butcher: {
    box: { x0: 21.4, x1: 24.8, z0: -8.9, z1: -7.5 } as Box,
    laneZ: -1.25,
    laneX: 20.5,
    door: { x: 21.4, z: -8.2 },
    cash: { x: 23.9, z: -6.2 },
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
  counter: { x0: -7.6, x1: 7.6, z0: 3.55, z1: 4.45 } as Box,

  /** Decorative trees around the edge (x, z); kept clear of the wholesale trader's road (z 12.6, west of the surplus yard). */
  trees: [
    [-18.5, -11], [-17.5, -5], [-23.6, 2.5], [-23.2, 9], [-15.5, 18.6], [-18.5, 18.8], [-21.2, 19.2], [-14, -1], [31, -12.5], [31, -3], [31.5, 4],
    [31.5, 11], [-12.5, 27.5], [10.5, 28.5], [-15.2, 21.0], [11.3, 24.8], [-2, 30], [6, 31],
  ] as const,
  // (east of the butcher's, with room to walk between: a narrow gap by the apiary trapped the walker)
  hay: [[27.0, -8.4], [27.0, -6.8], [27.0, -5.2], [28.2, -7.6]] as const,
} as const;

/** Walls (0.3 thick) around a yard, with a gate in the east wall and, optionally, a road gap in the west wall. */
function yardWalls(b: Box, gate: { z0: number; z1: number }, road?: { z0: number; z1: number }): Box[] {
  const t = 0.3;
  return [
    { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z0 + t },
    { x0: b.x0, x1: b.x1, z0: b.z1 - t, z1: b.z1 },
    ...(road
      ? [{ x0: b.x0, x1: b.x0 + t, z0: b.z0, z1: road.z0 }, { x0: b.x0, x1: b.x0 + t, z0: road.z1, z1: b.z1 }]
      : [{ x0: b.x0, x1: b.x0 + t, z0: b.z0, z1: b.z1 }]),
    { x0: b.x1 - t, x1: b.x1, z0: b.z0, z1: gate.z0 },
    { x0: b.x1 - t, x1: b.x1, z0: gate.z1, z1: b.z1 },
  ];
}
function hrWalls(): Box[] { return yardWalls(LAYOUT.hrYard.box, LAYOUT.hrYard.gate); }
export const HR_WALLS = hrWalls();
export const SURPLUS_WALLS = yardWalls(LAYOUT.surplusYard.box, LAYOUT.surplusYard.gate, LAYOUT.surplusYard.road);

/** Fence solids per station; mutated in place when a pen grows (see fenceFor). */
export const FENCES: Record<string, Box> = {
  eggs: { x0: LAYOUT.coop.x0 - 0.1, x1: LAYOUT.coop.x1 + 0.1, z0: LAYOUT.coop.z0 - 0.5, z1: LAYOUT.coop.z1 + 0.1 },
  milk: { x0: LAYOUT.pen.x0 - 0.1, x1: LAYOUT.pen.x1 + 0.1, z0: LAYOUT.pen.z0 - 0.5, z1: LAYOUT.pen.z1 + 0.1 },
  honey: { x0: LAYOUT.apiary.x0 - 0.1, x1: LAYOUT.apiary.x1 + 0.1, z0: LAYOUT.apiary.z0 - 0.5, z1: LAYOUT.apiary.z1 + 0.1 },
};
/** Bumped whenever solids change, so cached routing can rebuild. */
export const SOLIDS_VERSION = { v: 0 };

/** Things the player can't walk through. Fence boxes are padded slightly at the back. */
export const SOLIDS: Box[] = [
  FENCES.eggs,
  FENCES.milk,
  FENCES.honey,
  { ...LAYOUT.counter },
  ...hrWalls(),
  ...SURPLUS_WALLS,
  { ...LAYOUT.hrYard.building },
  ...CAFE.kitchen.map((k) => ({ ...k.box })),
  { ...FIELDS.stall.box },
  // the river grill and fish stall stand on reachable ground: they become solid once built (SimWorld.addSolid)
  ...FACTORY.machines.filter((m) => m.id !== 'grill').map((m) => ({ ...m.box })),
  { x0: FACTORY.silo.x - FACTORY.silo.r, x1: FACTORY.silo.x + FACTORY.silo.r, z0: FACTORY.silo.z - FACTORY.silo.r, z1: FACTORY.silo.z + FACTORY.silo.r },
  { ...CAFE.counter.box },
  // hay bales lie along x (length 1.2, radius 0.5)
  ...LAYOUT.hay.map(([x, z]) => ({ x0: x - 0.6, x1: x + 0.6, z0: z - 0.5, z1: z + 0.5 })),
  // tree trunks
  ...LAYOUT.trees.map(([x, z]) => ({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 })),
];
