import type { Box } from '../sim/math';
import type { ItemId, UpgradeId } from './economy';

/** One product in the supermarket: shelf price and wholesale cost per item (both x the farm's price growth). */
export interface MarketProduct {
  item: ItemId;
  name: string;
  /** Shelf price per item. */
  sell: number;
  /** Wholesale cost per item at the order desk. */
  cost: number;
  /** Made on the farm (the player and stockers can bring it from there for free). */
  farm: boolean;
}

/** One shelf unit (solid): one product, restocked and shopped from the `front` spot (aisle side). */
export interface ShelfDef {
  item: ItemId;
  box: Box;
  front: { x: number; z: number };
  /** market.shelves level that opens this shelf (0 = opens with the store). */
  row: number;
}

/**
 * Stage 7: the supermarket on the grass south of the café / factory yard (opened by market.unlock, which
 * needs the factory, so the walkable area already reaches its east wall). Back wall north, open front
 * (camera side). Shelf rows run east-west; the storeroom (racks + pick spot) is in the east bay, the
 * order desk next to it, the checkout front-left with its line going out the front.
 */
export const MARKET = {
  plot: { x0: 12.8, x1: 27.6, z0: 15.6, z1: 27.4 } as Box,
  /**
   * Wall solids (back wall + the two side walls). The front stays open; a back door at the back wall's
   * west end (x 13.05..14.9) lets the player in from the café / farm side.
   */
  walls: [
    { x0: 14.9, x1: 27.6, z0: 15.6, z1: 15.85 },
    { x0: 12.8, x1: 13.05, z0: 15.6, z1: 25.0 },
    { x0: 27.35, x1: 27.6, z0: 15.6, z1: 25.0 },
  ] as Box[],
  products: [
    { item: 'egg', name: 'بيض', sell: 6, cost: 4, farm: true },
    { item: 'milk', name: 'لبن', sell: 11, cost: 7, farm: true },
    { item: 'rice', name: 'رز', sell: 30, cost: 16, farm: false },
    { item: 'pasta', name: 'مكرونة', sell: 24, cost: 12, farm: false },
    { item: 'corn', name: 'درة', sell: 13, cost: 9, farm: true },
    { item: 'oil', name: 'زيت', sell: 60, cost: 30, farm: false },
    { item: 'tea', name: 'شاي', sell: 40, cost: 20, farm: false },
    { item: 'chips', name: 'شيبسي', sell: 14, cost: 7, farm: false },
    { item: 'cheese', name: 'جبنة', sell: 70, cost: 50, farm: true },
    { item: 'cake', name: 'كيك', sell: 90, cost: 64, farm: true },
    { item: 'fish', name: 'سمك', sell: 28, cost: 20, farm: true },
    { item: 'soda', name: 'بيبسي', sell: 18, cost: 9, farm: false },
  ] as readonly MarketProduct[],
  /** Storeroom: the player/stockers pick here (what the shelves need most); racks show the stock. */
  store: { x: 25.7, z: 19.6, r: 1.0, racks: { x0: 26.55, x1: 27.3, z0: 16.4, z1: 23.6 } as Box },
  /** Order desk (opens the order panel while standing on it). */
  desk: { x: 25.7, z: 23.4, r: 0.9, box: { x0: 26.55, x1: 27.3, z0: 22.9, z1: 23.9 } as Box },
  /** Checkout counter (solid); the player/cashier stands at `serve`, the line forms from `queue` out the front. */
  checkout: {
    box: { x0: 13.4, x1: 15.0, z0: 24.9, z1: 25.5 } as Box,
    serve: { x: 14.2, z: 24.2 },
    queue: { x: 14.2, z: 26.4, gap: 1.05 },
    /** Shoppers walk round the counter's east end on their way to the line. */
    via: { x: 16.0, z: 26.0 },
    serveR: 1.1,
  },
  cash: { x: 13.6, z: 22.9, r: 1.0 },
  /** Shoppers come in from the road south-east and leave the same way. */
  spawn: { x: 21.0, z: 30.5 },
  exit: { x: 17.5, z: 30.5 },
  shelfR: 0.75,
} as const;

const ROWS = [17.2, 19.8, 22.4];
const COLS = [16.3, 18.6, 20.9, 23.2];

/** 3 rows x 4 shelves, in MARKET.products order (row r opens with market.shelves level r). */
export const SHELVES: readonly ShelfDef[] = MARKET.products.map((p, i) => {
  const r = Math.floor(i / 4), x = COLS[i % 4], z = ROWS[r];
  return { item: p.item, row: r, box: { x0: x - 0.9, x1: x + 0.9, z0: z - 0.3, z1: z + 0.3 }, front: { x, z: z + 0.95 } };
});

export const MARKET_PRODUCT = new Map(MARKET.products.map((p) => [p.item, p]));

/** Upgrade that opens shelf row r. */
export const SHELF_TRACK: UpgradeId = 'market.shelves';
