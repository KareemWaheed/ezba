import type { Box } from '../sim/math';
import type { DishId, UpgradeId } from './economy';

/** One factory machine: solid body, a drop spot for ingredients and a pick-up spot for what it makes. */
export interface FactoryDef {
  id: string;
  name: string;
  icon: string;
  makes: DishId;
  unlockTrack: UpgradeId;
  box: Box;
  input: { x: number; z: number };
  output: { x: number; z: number };
}

/**
 * Stage 5 factory yard east of the café. Opening it (factory.unlock) moves the walkable area's east
 * edge to `unlockedX1`. Recipes: config/recipes.ts (FACTORY_RECIPES).
 */
export const FACTORY = {
  yard: { x0: 21.0, x1: 28.6, z0: -1.6, z1: 12.0 } as Box,
  unlockedX1: 28.3,
  machines: [
    { id: 'bakery', name: 'الفرن', icon: '🍰', makes: 'cake', unlockTrack: 'factory.unlock', box: { x0: 21.8, x1: 25.0, z0: 0.0, z1: 1.3 }, input: { x: 22.3, z: 2.2 }, output: { x: 24.5, z: 2.2 } },
    { id: 'dairy', name: 'مصنع الجبنة', icon: '🧀', makes: 'cheese', unlockTrack: 'factory.dairy', box: { x0: 21.8, x1: 25.0, z0: 5.0, z1: 6.3 }, input: { x: 22.3, z: 7.2 }, output: { x: 24.5, z: 7.2 } },
  ] as readonly FactoryDef[],
  /** Wheat silo beside the bakery (solid). */
  silo: { x: 26.3, z: 0.6, r: 0.75 },
} as const;
