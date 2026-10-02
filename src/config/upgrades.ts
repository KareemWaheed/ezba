import type { UpgradeId } from './economy';

/**
 * Where each upgrade track's tile sits and how it reads. One tile per track: buying a level
 * advances the same tile in place. Costs and effects live in economy.ts (ECONOMY.upgrades).
 */
export interface UpgradeDef {
  id: UpgradeId;
  icon: string;
  /** Tile label (Egyptian Arabic). */
  label: string;
  /** Toast after each purchase. */
  msg: string;
  pos: { x: number; z: number };
  /** Tile appears once every listed track has reached the given level. */
  requires: readonly { id: UpgradeId; level: number }[];
  /** Big unlocks shown in the HUD "next goal" card. */
  milestone?: boolean;
}

export const UPGRADES: readonly UpgradeDef[] = [
  {
    id: 'eggs.animals', icon: '🐔', label: 'فرخة جديدة', msg: 'فرخة جديدة في العشة 🐔',
    pos: { x: -5.6, z: 1.6 }, requires: [],
  },
  {
    id: 'player.capacity', icon: '🎒', label: 'شيل أكتر', msg: 'بقيت تشيل أكتر 💪',
    pos: { x: -5.6, z: 4.8 }, requires: [{ id: 'eggs.animals', level: 1 }],
  },
  {
    id: 'player.speed', icon: '👟', label: 'جري أسرع', msg: 'بقيت أسرع ⚡',
    pos: { x: -5.6, z: 8.0 }, requires: [{ id: 'player.capacity', level: 1 }],
  },
];

export const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));
