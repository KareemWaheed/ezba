import type { Box } from '../sim/math';
import type { CropId, UpgradeId } from './economy';

/** One crop plot: a grid of stalks (ECONOMY.field.spacing apart) inside `box`. */
export interface PlotDef {
  id: string;
  crop: CropId;
  box: Box;
  /** Upgrade that opens the plot. */
  unlockTrack: UpgradeId;
}

/**
 * Stage 4 fields north of the animal pens, reached through the gap between the coop and the cow pen.
 * Opening the corn field moves the walkable area's north edge to `unlockedZ0`.
 */
export const FIELDS = {
  plots: [
    { id: 'corn', crop: 'corn', box: { x0: -3.5, x1: 5.5, z0: -18.6, z1: -12.4 }, unlockTrack: 'field.unlock' },
    { id: 'wheat', crop: 'wheat', box: { x0: 6.5, x1: 14.5, z0: -18.6, z1: -12.4 }, unlockTrack: 'field.wheat' },
  ] as readonly PlotDef[],
  unlockedZ0: -19.0,
  /**
   * Grain stall with its back to the corn (solid); the player sells from the front (camera side)
   * at `drop` and the money piles up at `cash`.
   */
  stall: {
    box: { x0: -2.8, x1: -0.8, z0: -12.3, z1: -11.5 } as Box,
    drop: { x: -1.8, z: -10.75 },
    cash: { x: -4.2, z: -10.9 },
  },
} as const;
