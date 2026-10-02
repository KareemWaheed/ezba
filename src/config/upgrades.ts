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
    pos: { x: -7.6, z: -0.2 }, requires: [],
  },
  {
    id: 'player.capacity', icon: '🎒', label: 'شيل أكتر', msg: 'بقيت تشيل أكتر 💪',
    pos: { x: -7.6, z: 2.0 }, requires: [{ id: 'eggs.animals', level: 1 }],
  },
  {
    id: 'player.speed', icon: '👟', label: 'جري أسرع', msg: 'بقيت أسرع ⚡',
    pos: { x: -7.6, z: 4.2 }, requires: [{ id: 'player.capacity', level: 1 }],
  },
  {
    id: 'eggs.worker', icon: '👷', label: 'عامل للبيض', msg: 'العامل بيلم البيض بدالك 👷',
    pos: { x: -0.6, z: 0.6 }, requires: [{ id: 'eggs.animals', level: 4 }], milestone: true,
  },
  {
    id: 'cashier', icon: '🧾', label: 'كاشير', msg: 'الكاشير بيبيع بدالك دلوقتي 🧾',
    pos: { x: 1.6, z: 1.0 }, requires: [{ id: 'eggs.worker', level: 1 }], milestone: true, capBy: 'shop.lanes',
  },
  {
    id: 'shop.lanes', icon: '🛒', label: 'خط دفع جديد', msg: 'فتحت خط دفع جديد، زباين أكتر 🛒',
    pos: { x: 7.4, z: 1.8 }, requires: [{ id: 'cashier', level: 1 }], milestone: true,
  },
  {
    id: 'eggs.machine', icon: '⚙️', label: 'سير للبيض', msg: 'سير البيض شغال لوحده ⚙️',
    pos: { x: -5.4, z: -0.3 }, requires: [{ id: 'cashier', level: 1 }], milestone: true,
  },
  // Stage 2: cows
  {
    id: 'milk.unlock', icon: '🐄', label: 'حظيرة البقر', msg: 'فتحت حظيرة البقر 🐄🥛',
    pos: { x: 6.5, z: 0.2 }, requires: [{ id: 'eggs.worker', level: 1 }], milestone: true,
  },
  {
    id: 'milk.animals', icon: '🐄', label: 'بقرة جديدة', msg: 'بقرة جديدة في الحظيرة 🐄',
    pos: { x: 9.8, z: 2.0 }, requires: [{ id: 'milk.unlock', level: 1 }],
  },
  {
    id: 'milk.worker', icon: '👷', label: 'عامل للبن', msg: 'العامل بيلم اللبن بدالك 👷',
    pos: { x: 4.0, z: 0.6 }, requires: [{ id: 'milk.animals', level: 2 }], milestone: true,
  },
  {
    id: 'milk.machine', icon: '⚙️', label: 'سير للبن', msg: 'سير اللبن شغال لوحده ⚙️',
    pos: { x: 9.0, z: -0.3 }, requires: [{ id: 'milk.worker', level: 1 }, { id: 'cashier', level: 1 }], milestone: true,
  },
  // HR office: an unlockable walled yard west of the farm, with the staff upgrades inside
  {
    id: 'hr.office', icon: '🏢', label: 'مكتب الموظفين', msg: 'فتحت مكتب الموظفين، طوّر عمالك من جوه 🏢',
    pos: { x: -7.6, z: 6.4 }, requires: [{ id: 'eggs.worker', level: 1 }], milestone: true,
  },
  {
    id: 'hr.speed', icon: '⚡', label: 'العمال أسرع', msg: 'العمال بقوا أسرع ⚡',
    pos: { x: -15.2, z: 7.6 }, requires: [{ id: 'hr.office', level: 1 }],
  },
  {
    id: 'hr.capacity', icon: '📦', label: 'العمال يشيلوا أكتر', msg: 'العمال بيشيلوا أكتر 📦',
    pos: { x: -13.4, z: 7.6 }, requires: [{ id: 'hr.office', level: 1 }],
  },
  {
    id: 'hr.cashier', icon: '💨', label: 'كاشير أسرع', msg: 'الكاشير بقى أسرع 💨',
    pos: { x: -13.4, z: 5.4 }, requires: [{ id: 'hr.office', level: 1 }, { id: 'cashier', level: 1 }],
  },
  {
    id: 'maint', icon: '🔧', label: 'صيانة', msg: 'المكن بقى يعطل أقل 🔧',
    pos: { x: -15.2, z: 5.4 }, requires: [{ id: 'hr.office', level: 1 }, { id: 'eggs.machine', level: 1 }],
  },
  {
    id: 'rush.reward', icon: '🎁', label: 'مكافأة الزحمة', msg: 'مكافأة الزحمة زادت 🎁',
    pos: { x: -13.4, z: 9.3 }, requires: [{ id: 'hr.office', level: 1 }],
  },
  {
    id: 'rush.warning', icon: '📣', label: 'إنذار بدري', msg: 'هتعرف بالزحمة بدري ⏰',
    pos: { x: -15.2, z: 9.3 }, requires: [{ id: 'hr.office', level: 1 }],
  },
];

export const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));
