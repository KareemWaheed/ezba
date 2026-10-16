import type { Box } from '../sim/math';
import type { UpgradeId, VenueItemId } from './economy';

/**
 * The east (past the factory yard): places that take their own raw goods to their own kitchen and sell at their own
 * window, never through the shop counter. Each venue has sources the player (or its hands) picks from (trees; the
 * pigeon tower's door), a kitchen (drop spot, recipes) and a window where the made goods sell one at a time; the money
 * piles up at `cash`. Opening any of them moves the walkable area's east edge to EAST.unlockedX1.
 */
export interface SourceDef {
  x: number; z: number;
  item: VenueItemId;
  /** Open once this track reaches `level` (the trees track opens one more tree a level). */
  track: UpgradeId;
  level: number;
  /** Solid trunk / building around (x, z) (half sizes), and how close the player stands to pick. */
  solid: { hx: number; hz: number };
  reach: number;
  /** Where the player (and the hands) stand to pick (default: just in front, south). */
  pick?: { x: number; z: number };
}

export interface RecipeDef { inputs: Partial<Record<VenueItemId, number>>; output: VenueItemId; time: number }

export interface VenueDef {
  id: 'orchard' | 'pigeons';
  name: string;
  icon: string;
  unlock: UpgradeId;
  sources: readonly SourceDef[];
  /** Seconds per item per source (or per nest), before speed-ups; items a source holds at most. */
  grow: number;
  hold: number;
  /** Nests (pigeon tower): producers per open source = start + step x level of `track`. */
  nests?: { start: number; track: UpgradeId };
  growTrack?: UpgradeId;
  kitchen: { box: Box; input: { x: number; z: number }; inputMax: number; recipes: readonly RecipeDef[]; speedTrack: UpgradeId };
  window: { x: number; z: number; sellEvery: number; max: number; track: UpgradeId; cash: { x: number; z: number } };
  workers: { track: UpgradeId; home: { x: number; z: number } };
  /** Ground under the venue (drawn, and shaded with a lock until it opens). */
  ground: Box;
}

const tree = (x: number, z: number, item: VenueItemId, track: UpgradeId, level: number): SourceDef =>
  ({ x, z, item, track, level, solid: { hx: 0.35, hz: 0.35 }, reach: 1.45, pick: { x, z: z + 1.0 } });

export const EAST = {
  unlockedX1: 44.2,
  /** The factory yard's east fence turns solid once the east opens, with a gap (the gate) at gateZ. */
  fence: { x: 28.8, z0: -1.6, z1: 12.0, gate: { z0: 8.4, z1: 10.6 } },
  venues: [
    {
      id: 'orchard', name: 'بستان المانجة', icon: '🥭', unlock: 'orchard.unlock',
      // three mango trees to start with, one more a level (trees track), then three guava trees in their own row
      sources: [
        tree(31.6, -10.2, 'mango', 'orchard.unlock', 1), tree(34.8, -10.2, 'mango', 'orchard.unlock', 1), tree(38.0, -10.2, 'mango', 'orchard.unlock', 1),
        tree(31.6, -6.8, 'mango', 'orchard.trees', 1), tree(34.8, -6.8, 'mango', 'orchard.trees', 2), tree(38.0, -6.8, 'mango', 'orchard.trees', 3),
        tree(31.6, -3.4, 'mango', 'orchard.trees', 4), tree(34.8, -3.4, 'mango', 'orchard.trees', 5), tree(38.0, -3.4, 'mango', 'orchard.trees', 6),
        tree(41.6, -10.2, 'guava', 'orchard.guava', 1), tree(41.6, -6.8, 'guava', 'orchard.guava', 1), tree(41.6, -3.4, 'guava', 'orchard.guava', 1),
      ],
      grow: 6, hold: 6, growTrack: 'orchard.water',
      kitchen: {
        box: { x0: 32.4, x1: 37.4, z0: 0.0, z1: 1.4 }, input: { x: 33.2, z: 2.3 }, inputMax: 30, speedTrack: 'orchard.press',
        recipes: [{ inputs: { mango: 2 }, output: 'mangoJuice', time: 3 }, { inputs: { guava: 2 }, output: 'guavaJuice', time: 3.5 }],
      },
      window: { x: 35.9, z: 2.0, sellEvery: 2.0, max: 24, track: 'orchard.stand', cash: { x: 38.9, z: 2.6 } },
      workers: { track: 'orchard.picker', home: { x: 30.6, z: 1.4 } },
      ground: { x0: 29.6, x1: 43.6, z0: -12.2, z1: 3.6 },
    },
    {
      id: 'pigeons', name: 'برج الحمام', icon: '🕊️', unlock: 'pigeons.unlock',
      // one tower, its nests are the producers; squabs are picked at its door
      sources: [{ x: 40.6, z: 8.4, item: 'squab', track: 'pigeons.unlock', level: 1, solid: { hx: 1.5, hz: 1.5 }, reach: 1.4, pick: { x: 40.6, z: 10.6 } }],
      grow: 14, hold: 40, nests: { start: 4, track: 'pigeons.nests' },
      kitchen: {
        box: { x0: 32.2, x1: 36.8, z0: 6.6, z1: 8.0 }, input: { x: 33.0, z: 8.9 }, inputMax: 30, speedTrack: 'pigeons.oven',
        recipes: [{ inputs: { squab: 1 }, output: 'stuffedPigeon', time: 2.5 }],
      },
      window: { x: 35.5, z: 8.6, sellEvery: 1.6, max: 24, track: 'pigeons.waiter', cash: { x: 37.9, z: 9.4 } },
      workers: { track: 'pigeons.worker', home: { x: 38.6, z: 11.4 } },
      ground: { x0: 30.6, x1: 43.6, z0: 5.4, z1: 13.6 },
    },
  ] as readonly VenueDef[],
} as const;
