import type { ProducerKind, ProductId, UpgradeId } from './economy';
import type { Box } from '../sim/math';
import { LAYOUT } from './layout';

/**
 * A station = one product's chain: producers in an area -> pickup pile -> sell counter slot.
 * Stages add stations as data; systems iterate over them and never special-case a product.
 */
export interface StationDef {
  id: string;
  product: ProductId;
  /** Animals that make the product (none for corn: it's cut in the field). */
  producer?: ProducerKind;
  /** Area the animals wander in. */
  area?: Box;
  /** Pickup pile position and footprint (cols x rows per layer). */
  pile: { x: number; z: number; cols: number; rows: number };
  /** Spot on the counter where this product stacks, and the drop zone in front of it (player side). */
  counter: { x: number; z: number; dropX: number; dropZ: number };
  /** Upgrade track that adds animals (one per level step). */
  animalTrack?: UpgradeId;
  /** Upgrade track that hires workers for this station (one per level). */
  workerTrack?: UpgradeId;
  /** Upgrade track for this station's belt (level 1 builds it, later levels speed it up). */
  machineTrack?: UpgradeId;
  /** Whether the station is open at the start of a new game. */
  startsOpen: boolean;
  /** Upgrade that opens a station that doesn't start open. */
  unlockTrack?: UpgradeId;
  /** Fence moves out by these amounts per level of `track` (bigger pen). */
  expand?: { track: UpgradeId; dx0: number; dx1: number };
  /**
   * The belt is a cable line in the air instead (the corn's pile is far from the shop, past the coop; the honey's
   * strip is too narrow): from a tower by the pile (`a`) to a tower on its side's main belt junction (`tower`), then
   * down onto the belt to the sorter. Jams are fixed at `fix`.
   */
  skyBelt?: { a: { x: number; z: number }; tower: { x: number; z: number }; fix: { x: number; z: number } };
  /** Feeding trough on the front fence (player refills it for a production boost). */
  trough?: { x: number; z: number };
}

export const STATIONS: readonly StationDef[] = [
  {
    id: 'eggs', product: 'egg', producer: 'chicken', area: LAYOUT.coop, animalTrack: 'eggs.animals',
    workerTrack: 'eggs.worker', machineTrack: 'eggs.machine', expand: { track: 'eggs.expand', dx0: -4, dx1: 0 },
    pile: { x: -3, z: -0.8, cols: 2, rows: 2 },
    trough: { x: -1.0, z: -1.5 },
    counter: { x: -5.8, z: 4, dropX: -5.8, dropZ: 2.9 },
    startsOpen: true,
  },
  {
    id: 'milk', product: 'milk', producer: 'cow', area: LAYOUT.pen, unlockTrack: 'milk.unlock',
    animalTrack: 'milk.animals', workerTrack: 'milk.worker', machineTrack: 'milk.machine', expand: { track: 'milk.expand', dx0: 0, dx1: 2 }, // (2 m a level: the apiary is east of the grown pen)
    pile: { x: 6.5, z: -0.8, cols: 2, rows: 2 },
    trough: { x: 4.4, z: -1.5 },
    counter: { x: 5.8, z: 4, dropX: 5.8, dropZ: 2.9 },
    startsOpen: false,
  },
  {
    // corn: the pile sits by the grain stall (drivers and the combine unload there); its counter slot is
    // at the left end of the shop counter
    id: 'corn', product: 'corn', unlockTrack: 'field.unlock', workerTrack: 'corn.worker', machineTrack: 'corn.machine',
    skyBelt: { a: { x: -5.7, z: -10.2 }, tower: { x: LAYOUT.trunk.west.x, z: LAYOUT.trunk.z }, fix: { x: -7.6, z: 1.3 } },
    pile: { x: -4.4, z: -10.9, cols: 2, rows: 2 },
    counter: { x: -7.0, z: 4, dropX: -7.0, dropZ: 2.9 },
    startsOpen: false,
  },
  {
    // bees: hives east of the cow pen, honey sold at the east end of the counter
    id: 'honey', product: 'honey', producer: 'bee', area: LAYOUT.apiary, unlockTrack: 'honey.unlock',
    animalTrack: 'honey.animals', workerTrack: 'honey.worker', machineTrack: 'honey.machine',
    // (a cable line too: between the apiary and the café there's no room for a ground belt beside the tiles)
    skyBelt: { a: { x: 18.5, z: -0.5 }, tower: { x: LAYOUT.trunk.east.x, z: LAYOUT.trunk.z }, fix: { x: 18.5, z: 0.0 } },
    pile: { x: 17.3, z: -0.8, cols: 2, rows: 2 },
    counter: { x: 7.0, z: 4, dropX: 7.0, dropZ: 2.9 },
    startsOpen: false,
  },
];

export interface PathPoint { x: number; y: number; z: number }

/** Height of a ground belt's top, and of the cable line. */
export const BELT_Y = 0.2, SKY_Y = 3.7;
/** Height items ride up to inside a sorter (a gantry over the walkway). */
export const SORTER_Y = 2.4;

/**
 * Where a product's items ride once its belt is built (LAYOUT.trunk): off the pile (or up the corn's cable line and
 * over to the junction), along the main belt of its side to the junction, down the belt to the sorter, and onto its
 * counter slot.
 */
export function beltPath(d: StationDef): PathPoint[] {
  const T = LAYOUT.trunk, side = d.counter.x < 0 ? T.west : T.east, slot = { x: d.counter.x, y: 1.15, z: d.counter.z };
  const down: PathPoint[] = [
    { x: side.x, y: BELT_Y, z: T.z },
    { x: side.x, y: BELT_Y, z: T.sortZ },
    { x: side.x, y: SORTER_Y, z: (T.westSorter.z0 + T.westSorter.z1) / 2 },
    slot,
  ];
  const sky = d.skyBelt;
  if (sky) {
    return [
      { x: sky.a.x, y: 0.5, z: sky.a.z },
      { x: sky.a.x, y: SKY_Y - 0.35, z: sky.a.z },
      { x: sky.tower.x, y: SKY_Y - 0.35, z: sky.tower.z },
      ...down,
    ];
  }
  return [
    { x: d.pile.x, y: 0.6, z: d.pile.z + 0.4 },
    { x: d.pile.x, y: BELT_Y, z: T.z },
    ...down,
  ];
}

/** Where a station's belt jams are fixed: by its pile's spot on the main belt (the corn: by its junction tower). */
export function beltFix(d: StationDef): { x: number; z: number } {
  return d.skyBelt ? d.skyBelt.fix : { x: d.pile.x, z: LAYOUT.trunk.z + 1.0 };
}
