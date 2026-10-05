import type { UpgradeId } from './economy';

/** Which game the save is: the farm first (the store comes late), or the supermarket first (the farm opens backwards). */
export type GameMode = 'farm' | 'market';
export const GAME_MODES: readonly GameMode[] = ['farm', 'market'];

/** How a mode changes the upgrade tree (the farm path is UPGRADES as written). */
export interface PathDef {
  /** Levels owned from the start (free; they don't count toward price growth). */
  startLevels: Partial<Record<UpgradeId, number>>;
  startMoney: number;
  /** Tracks this path never offers (and that don't count for the 🏆 bigger ezba). */
  hidden: readonly UpgradeId[];
  /** Cost multiplier per track (store tracks are early-game here, so far cheaper). */
  costMult: Partial<Record<UpgradeId, number>>;
  /** Replacement `requires` lists. */
  requires: Partial<Record<UpgradeId, readonly { id: UpgradeId; level: number }[]>>;
  /** Shelf/storeroom stock a new store starts with (so the first shoppers can buy right away). */
  startShelf: number;
  startStore: number;
}

export const PATHS: Record<GameMode, PathDef> = {
  farm: {
    startLevels: {},
    startMoney: 0,
    hidden: ['eggs.unlock'],
    costMult: {},
    requires: {},
    startShelf: 0,
    startStore: 0,
  },
  /**
   * Supermarket first: a small grocer's with its first shelf row. Everything is bought wholesale at the
   * desk; the farm opens backwards (chickens, then cows, the fields, the factory, the river), and every
   * part of it makes that product free for the shelves (farm deliveries). No farm shop: the shop counter
   * is the farm's storeroom, so shop lanes/cashiers, VIPs, rushes and shop events don't exist here.
   */
  market: {
    startLevels: { 'market.unlock': 1 },
    startMoney: 300,
    hidden: ['market.unlock', 'cashier', 'shop.lanes', 'rush.reward', 'rush.warning'],
    costMult: {
      'market.ads': 0.006,
      'market.shelves': 0.012,
      'market.cashier': 0.005,
      'market.stocker': 0.015,
      'market.auto': 0.05,
      'eggs.unlock': 0.3,
    },
    requires: {
      'eggs.animals': [{ id: 'eggs.unlock', level: 1 }],
      'player.capacity': [],
      'market.stocker': [{ id: 'market.cashier', level: 1 }],
      'cafe.unlock': [{ id: 'milk.unlock', level: 1 }, { id: 'market.cashier', level: 1 }],
      'dock.unlock': [{ id: 'milk.unlock', level: 1 }],
      'hr.cashier': [{ id: 'hr.office', level: 1 }, { id: 'market.cashier', level: 1 }],
    },
    startShelf: 6,
    startStore: 20,
  },
};
