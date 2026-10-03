import type { SimWorld } from '../sim/world';

export type StatKey = keyof SimWorld['stats'];

/** A daily task: push one lifetime stat up by `base` (scaled with farm size) for a reward. */
export interface TaskDef {
  id: string;
  icon: string;
  label: (n: number) => string;
  stat: StatKey;
  base: number;
  /** Reward = this many seconds of farm production (with price growth). */
  rewardSeconds: number;
  /** Only offered once this holds. */
  when?: (w: SimWorld) => boolean;
}

/** Pool of daily tasks; three different ones are picked per calendar day. */
export const TASKS: readonly TaskDef[] = [
  { id: 'serve', icon: '🛒', label: (n) => `اخدم ${n} زبون`, stat: 'served', base: 40, rewardSeconds: 90 },
  { id: 'sell', icon: '🥚', label: (n) => `بيع ${n} حاجة`, stat: 'sold', base: 150, rewardSeconds: 90 },
  { id: 'fast', icon: '⚡', label: (n) => `اخدم ${n} زبون بسرعة`, stat: 'fast', base: 15, rewardSeconds: 120 },
  { id: 'feed', icon: '🌾', label: (n) => `أكّل الحيوانات ${n} مرات`, stat: 'feeds', base: 3, rewardSeconds: 90 },
  { id: 'rush', icon: '🔥', label: (n) => `عدّي ${n} زحمة من غير زعل`, stat: 'rushesCleared', base: 1, rewardSeconds: 150, when: (w) => w.upgrades.bought >= 6 },
  { id: 'fix', icon: '🔧', label: (n) => `صلّح ${n} عطل`, stat: 'fixes', base: 2, rewardSeconds: 90, when: (w) => w.staff.machines.some((m) => m.running) },
  { id: 'golden', icon: '✨', label: (n) => `امسك ${n} حيوان دهبي`, stat: 'golden', base: 1, rewardSeconds: 120, when: (w) => w.upgrades.bought >= 8 },
  { id: 'vip', icon: '⭐', label: (n) => `اخدم ${n} زبون VIP`, stat: 'vips', base: 2, rewardSeconds: 120, when: (w) => w.upgrades.bought >= 10 },
  { id: 'tables', icon: '🧽', label: (n) => `نضّف ${n} ترابيزة`, stat: 'tables', base: 15, rewardSeconds: 90, when: (w) => w.cafe.open },
  { id: 'cafe', icon: '☕', label: (n) => `اخدم ${n} زبون في الكافيه`, stat: 'cafeServed', base: 20, rewardSeconds: 120, when: (w) => w.cafe.open },
  { id: 'trucks', icon: '🚚', label: (n) => `حمّل ${n} عربية`, stat: 'trucks', base: 2, rewardSeconds: 150, when: (w) => w.contracts.open },
  { id: 'stalks', icon: '🌽', label: (n) => `احصد ${n} عود`, stat: 'stalks', base: 400, rewardSeconds: 120, when: (w) => w.field.open },
];

/** Tasks per day. */
export const TASKS_PER_DAY = 3;
