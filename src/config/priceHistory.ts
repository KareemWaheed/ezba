import type { UpgradeId } from './economy';
import type { GameMode } from './paths';

/**
 * Upgrade price history, for refunds: when an update makes upgrades cheaper, players who bought them at
 * the old price get the difference back once (sim/refund.ts). Each change lists the prices *before* it.
 * To cut a price: change it in economy.ts/paths.ts, add an entry here with the old values, bump
 * PRICE_VERSION. Saves remember the version they were priced at.
 */
export interface PriceChange {
  version: number;
  /** Track prices before this change. */
  tracks: Partial<Record<UpgradeId, { base: number; growth: number }>>;
  /** Path cost multipliers before this change (a track missing here kept its multiplier). */
  costMult?: Partial<Record<GameMode, Partial<Record<UpgradeId, number>>>>;
}

export const PRICE_VERSION = 1;

export const PRICE_CHANGES: readonly PriceChange[] = [
  {
    // economy review: production upgrades past demand, café staff, dock sizes
    version: 1,
    tracks: {
      'eggs.animals': { base: 40, growth: 1.55 },
      'eggs.expand': { base: 5000, growth: 3.5 },
      'milk.machine': { base: 6000, growth: 3 },
      'cafe.helper': { base: 30000, growth: 3 },
      'cafe.waiter': { base: 160000, growth: 1 },
      'dock.size': { base: 12000, growth: 2.4 },
      'factory.speed': { base: 30000, growth: 2.2 },
      // (got dearer: listed so its old price is known; nobody pays the difference)
      'field.driver': { base: 60000, growth: 2.2 },
    },
    costMult: { market: { 'eggs.expand': 1 } },
  },
];
