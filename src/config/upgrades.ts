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
  /** Level can't exceed 1 + this track's level (e.g. one cashier per open lane). */
  capBy?: UpgradeId;
}

export const UPGRADES: readonly UpgradeDef[] = [
  {
    id: 'eggs.animals', icon: '🐔', label: 'فرخة جديدة', msg: 'فرخة جديدة في العشة 🐔',
    pos: { x: -5.6, z: 1.6 }, requires: [],
  },
  {
    id: 'player.capacity', icon: '🎒', label: 'شيل أكتر', msg: 'بقيت تشيل أكتر 💪',
    pos: { x: -5.6, z: 4.0 }, requires: [{ id: 'eggs.animals', level: 1 }],
  },
  {
    id: 'player.speed', icon: '👟', label: 'جري أسرع', msg: 'بقيت أسرع ⚡',
    pos: { x: -5.6, z: 6.4 }, requires: [{ id: 'player.capacity', level: 1 }],
  },
  {
    id: 'eggs.worker', icon: '👷', label: 'عامل للبيض', msg: 'العامل بيلم البيض بدالك 👷',
    pos: { x: -0.8, z: 0.4 }, requires: [{ id: 'eggs.animals', level: 4 }], milestone: true,
  },
  {
    id: 'cashier', icon: '🧾', label: 'كاشير', msg: 'الكاشير بيبيع بدالك دلوقتي 🧾',
    pos: { x: 3.8, z: 1.9 }, requires: [{ id: 'eggs.worker', level: 1 }], milestone: true, capBy: 'shop.lanes',
  },
  {
    id: 'shop.lanes', icon: '🛒', label: 'خط دفع جديد', msg: 'فتحت خط دفع جديد، زباين أكتر 🛒',
    pos: { x: 6.4, z: 1.6 }, requires: [{ id: 'cashier', level: 1 }], milestone: true,
  },
  {
    id: 'eggs.machine', icon: '⚙️', label: 'سير للبيض', msg: 'سير البيض شغال لوحده ⚙️',
    pos: { x: -5.2, z: -0.6 }, requires: [{ id: 'cashier', level: 1 }], milestone: true,
  },
  // HR office: staff upgrades
  {
    id: 'hr.speed', icon: '⚡', label: 'العمال أسرع', msg: 'العمال بقوا أسرع ⚡',
    pos: { x: -7.4, z: 12.3 }, requires: [{ id: 'eggs.worker', level: 1 }],
  },
  {
    id: 'hr.capacity', icon: '📦', label: 'العمال يشيلوا أكتر', msg: 'العمال بيشيلوا أكتر 📦',
    pos: { x: -5.4, z: 12.3 }, requires: [{ id: 'eggs.worker', level: 1 }],
  },
  {
    id: 'hr.cashier', icon: '💨', label: 'كاشير أسرع', msg: 'الكاشير بقى أسرع 💨',
    pos: { x: -3.4, z: 12.3 }, requires: [{ id: 'cashier', level: 1 }],
  },
];

export const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));
