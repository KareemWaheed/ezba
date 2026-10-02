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
  producer: ProducerKind;
  /** Area the animals wander in. */
  area: Box;
  /** Pickup pile position and footprint (cols x rows per layer). */
  pile: { x: number; z: number; cols: number; rows: number };
  /** Spot on the counter where this product stacks, and the drop zone in front of it (player side). */
  counter: { x: number; z: number; dropX: number; dropZ: number };
  /** Upgrade track that adds animals (one per level step). */
  animalTrack?: UpgradeId;
  /** Whether the station is open at the start of a new game. */
  startsOpen: boolean;
}

export const STATIONS: readonly StationDef[] = [
  {
    id: 'eggs', product: 'egg', producer: 'chicken', area: LAYOUT.coop, animalTrack: 'eggs.animals',
    pile: { x: -3, z: -0.8, cols: 2, rows: 2 },
    counter: { x: -1.2, z: 4, dropX: -1.2, dropZ: 2.9 },
    startsOpen: true,
  },
  {
    id: 'milk', product: 'milk', producer: 'cow', area: LAYOUT.pen,
    pile: { x: 6.5, z: -0.8, cols: 2, rows: 2 },
    counter: { x: 1.2, z: 4, dropX: 1.2, dropZ: 2.9 },
    startsOpen: false,
  },
];
