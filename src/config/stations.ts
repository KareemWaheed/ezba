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
   * The belt is a cable line in the air instead (the corn's pile is far from the shop, past the coop): from a
   * tower by the pile (`a`) over the coop to a tower behind the counter's end (`tower`), then down onto the
   * counter slot. Jams are fixed at `fix` (the counter-end tower; the line's middle is over the coop).
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
    animalTrack: 'milk.animals', workerTrack: 'milk.worker', machineTrack: 'milk.machine', expand: { track: 'milk.expand', dx0: 0, dx1: 4 },
    pile: { x: 6.5, z: -0.8, cols: 2, rows: 2 },
    trough: { x: 4.4, z: -1.5 },
    counter: { x: 5.8, z: 4, dropX: 5.8, dropZ: 2.9 },
    startsOpen: false,
  },
  {
    // corn: the pile sits by the grain stall (drivers and the combine unload there); its counter slot is
    // at the left end of the shop counter
    id: 'corn', product: 'corn', unlockTrack: 'field.unlock', workerTrack: 'corn.worker', machineTrack: 'corn.machine',
    skyBelt: { a: { x: -5.7, z: -10.2 }, tower: { x: -7.2, z: 4.95 }, fix: { x: -8.1, z: 3.2 } },
    pile: { x: -4.4, z: -10.9, cols: 2, rows: 2 },
    counter: { x: -7.0, z: 4, dropX: -7.0, dropZ: 2.9 },
    startsOpen: false,
  },
  {
    // bees: hives east of the cow pen, honey sold at the east end of the counter
    id: 'honey', product: 'honey', producer: 'bee', area: LAYOUT.apiary, unlockTrack: 'honey.unlock',
    animalTrack: 'honey.animals', workerTrack: 'honey.worker',
    pile: { x: 17.3, z: -0.8, cols: 2, rows: 2 },
    counter: { x: 7.0, z: 4, dropX: 7.0, dropZ: 2.9 },
    startsOpen: false,
  },
];

/** Belt end points (pile -> counter slot), on the outer side so workers keep the inner path. */
export function beltEnds(d: StationDef, counterZ0: number): { ax: number; az: number; bx: number; bz: number } {
  const side = Math.sign(d.counter.x) || -1;
  return { ax: d.pile.x + side * 1.05, az: d.pile.z + 0.3, bx: d.counter.x + side * 0.35, bz: counterZ0 - 0.15 };
}
