import type { GuestLook } from './looks';
import type { SimWorld } from '../sim/world';
import { SCENARIOS } from './scenarios';

/** A kind of regular customer: their look, how often they come, and when they start coming. */
export interface CustomerType {
  name: string;
  icon: string;
  shirts: readonly number[];
  pants: readonly number[];
  hat?: GuestLook['hat'];
  holds?: GuestLook['holds'];
  /** Relative chance among the types that can come right now. */
  weight: number;
  /** Starts coming once this holds (always when absent). */
  when?: (w: SimWorld) => boolean;
}

export const CUSTOMER_TYPES = {
  farmer: { name: 'فلاح', icon: '👨‍🌾', shirts: [0x8a6a4a, 0xa08060, 0x6b8e4e], pants: [0x5a4632, 0x3b3b3b], hat: { kind: 'straw', color: 0xe8c86a }, weight: 3 },
  grandma: { name: 'الحاجّة', icon: '👵', shirts: [0x3b2a4a, 0x2e2e2e, 0x5a2a2a], pants: [0x2e2e2e], hat: { kind: 'veil', color: 0x222222 }, weight: 2 },
  student: { name: 'طالب', icon: '🎒', shirts: [0x3d7fd9, 0xffffff, 0x8fc1ff], pants: [0x2f4a7a, 0x3b3b3b], hat: { kind: 'cap', color: 0x3d7fd9 }, weight: 2 },
  worker: { name: 'عامل', icon: '👷', shirts: [0xf28c38, 0x4a6fa5], pants: [0x3b4a6b], hat: { kind: 'hardhat', color: 0xf5c542 }, weight: 1.5, when: (w) => w.upgrades.level('eggs.worker') > 0 },
  tourist: { name: 'سايح', icon: '📸', shirts: [0xff6fb5, 0x30c0c0, 0xf6d24a], pants: [0xe9dfb6, 0x6fa8dc], hat: { kind: 'cap', color: 0xffffff }, holds: 'phone', weight: 1.2, when: (w) => w.upgrades.level('shop.lanes') > 0 },
  chef: { name: 'شيف', icon: '👨‍🍳', shirts: [0xffffff], pants: [0x2e2e2e, 0x5a5a5a], hat: { kind: 'chef', color: 0xffffff }, weight: 1, when: (w) => w.cafe.open },
  doctor: { name: 'دكتور', icon: '🩺', shirts: [0xf3f3f3], pants: [0x2f4a7a], weight: 0.8, when: (w) => w.stats.served >= 400 },
  trucker: { name: 'سوّاق', icon: '🚚', shirts: [0x8b1a1a, 0x4a6b3a], pants: [0x3b3b3b], hat: { kind: 'cap', color: 0x8b1a1a }, weight: 1, when: (w) => w.contracts.open },
} satisfies Record<string, CustomerType>;

export type CustomerTypeId = keyof typeof CUSTOMER_TYPES;
const TYPE_IDS = Object.keys(CUSTOMER_TYPES) as CustomerTypeId[];

/**
 * Customer type from the look seed (no extra random draws, so the sim stays the same per seed):
 * a weighted pick among the types that can come right now.
 */
export function pickType(w: SimWorld, look: number): CustomerTypeId {
  let total = 0;
  for (const id of TYPE_IDS) { const t: CustomerType = CUSTOMER_TYPES[id]; if (!t.when || t.when(w)) total += t.weight; }
  let r = ((look >>> 3) % 1000) / 1000 * total;
  for (const id of TYPE_IDS) {
    const t: CustomerType = CUSTOMER_TYPES[id];
    if (t.when && !t.when(w)) continue;
    r -= t.weight;
    if (r < 0) return id;
  }
  return 'farmer';
}

/** Album entry ids: customer types, 'vip', and 'g:<scenario id>' for special guests. */
export interface AlbumPage {
  id: string;
  name: string;
  entries: { id: string; name: string; icon: string }[];
  /** Completing the page pays this many seconds of farm production. */
  rewardSeconds: number;
}

export const ALBUM_PAGES: AlbumPage[] = [
  {
    id: 'locals', name: 'أهل البلد', rewardSeconds: 120,
    entries: (['farmer', 'grandma', 'student', 'worker'] as const).map((id) => ({ id, name: CUSTOMER_TYPES[id].name, icon: CUSTOMER_TYPES[id].icon })),
  },
  {
    id: 'visitors', name: 'زوار', rewardSeconds: 300,
    entries: [
      ...(['tourist', 'chef', 'doctor', 'trucker'] as const).map((id) => ({ id, name: CUSTOMER_TYPES[id].name, icon: CUSTOMER_TYPES[id].icon })),
      { id: 'vip', name: 'زبون VIP', icon: '⭐' },
    ],
  },
  {
    id: 'stars', name: 'ضيوف مميزين', rewardSeconds: 900,
    entries: SCENARIOS.filter((s) => s.guest).map((s) => ({ id: `g:${s.id}`, name: s.guest!.name, icon: s.icon })),
  },
];
