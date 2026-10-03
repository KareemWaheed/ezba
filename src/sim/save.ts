import { ECONOMY, ITEM_IDS, type ItemId, type UpgradeId } from '../config/economy';
import type { SimWorld } from './world';

/**
 * Versioned save format. Bump SAVE_VERSION when the shape changes and add a migration from the
 * previous version, so updates never wipe progress. Unknown ids (removed upgrades/products) are
 * ignored on load instead of failing.
 */
export const SAVE_VERSION = 1;

export interface SaveData {
  v: number;
  /** Wall-clock ms when saved (for offline earnings). */
  t: number;
  /** Sim time played (s). */
  time: number;
  money: number;
  rng: number;
  levels: Record<string, number>;
  paid: Record<string, number>;
  stations: Record<string, { open: boolean; pile: number; counter: number }>;
  carry: string[];
  cash: { value: number; bills: number };
  player: { x: number; z: number };
  stats?: Partial<Record<string, number>>;
  rating?: number;
  /** Per station: trough boost seconds left; per belt: jammed. */
  boost?: Record<string, number>;
  broken?: Record<string, boolean>;
  trust?: Record<string, number>;
  cafe?: {
    counter: Record<string, number>;
    /** Per kitchen machine: raw items waiting and dishes ready. */
    kitchen?: Record<string, { in: Record<string, number>; out: Record<string, number> }>;
    tables: { dirty: boolean; cash: number; bills: number }[];
    cash: { value: number; bills: number };
  };
  album?: { seen: string[]; paid: string[] };
  /** Factory machine buffers and the wheat silo. */
  factory?: { silo: number; machines: Record<string, { in: Record<string, number>; out: Record<string, number> }> };
  daily?: { day: string; tasks: { id: string; target: number; start: number; reward: number; claimed: boolean; notified: boolean }[] };
  /** Grain stall money not collected yet (stalks restart fully grown). */
  field?: { cash: number; bills: number; hopper?: Record<string, number> };
}

type Migration = (s: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[n] upgrades a version-n save to version n+1. */
const MIGRATIONS: Record<number, Migration> = {};

/** Bring any older save up to SAVE_VERSION. Returns null for unreadable/future saves. */
export function migrate(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  let s = raw as Record<string, unknown>;
  let v = typeof s.v === 'number' ? s.v : 0;
  if (v > SAVE_VERSION) return null;
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) return null;
    s = m(s);
    v++;
    s.v = v;
  }
  return s as unknown as SaveData;
}

export function serialize(w: SimWorld, now: number): SaveData {
  const stations: SaveData['stations'] = {};
  for (const s of w.stations) {
    // items in workers' hands or on belts are saved as already on the counter
    let moving = w.staff.belts[s.index].inTransit;
    for (const x of w.staff.workers) if (x.job.key === s.def.id) moving += x.carry.n;
    stations[s.def.id] = { open: s.open, pile: s.pile + s.pending, counter: s.counter + moving };
  }
  return {
    v: SAVE_VERSION, t: now, time: w.time, money: w.money, rng: w.rng.state,
    levels: { ...w.upgrades.levels }, paid: { ...w.upgrades.paid }, stations,
    carry: [...w.carry.items], cash: { ...w.cash }, player: { x: w.player.x, z: w.player.z }, stats: { ...w.stats },
    rating: w.service.rating,
    trust: { ...w.contracts.trust },
    boost: Object.fromEntries(w.stations.map((s) => [s.def.id, s.boostT])),
    broken: Object.fromEntries(w.staff.machines.map((m, i) => [String(i), m.broken])),
    cafe: {
      // dishes on the café belt / in customers' hands go back on the counter
      counter: { ...w.cafe.counter },
      kitchen: Object.fromEntries(w.cafe.machines.map((m) => [m.id, { in: { ...m.conv.input }, out: { ...m.conv.output } }])),
      tables: w.cafe.tables.map((t) => ({ dirty: t.dirty, cash: t.cash, bills: t.bills })),
      cash: { value: w.cafe.uncollected - w.cafe.tables.reduce((a, t) => a + t.cash, 0), bills: w.cafe.cash.bills },
    },
    field: { cash: w.field.cash.value, bills: w.field.cash.bills, hopper: { ...w.field.hopper } },
    album: { seen: [...w.album.seen], paid: [...w.album.paid] },
    factory: { silo: w.factory.silo, machines: Object.fromEntries(w.factory.machines.map((m) => [m.def.id, { in: { ...m.conv.input }, out: { ...m.conv.output } }])) },
    daily: { day: w.daily.day, tasks: w.daily.tasks.map((t) => ({ ...t })) },
  };
}

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Load a (migrated) save into a fresh world. */
export function restore(w: SimWorld, s: SaveData): void {
  w.time = num(s.time);
  w.money = num(s.money);
  if (s.rng) w.rng.state = num(s.rng, w.rng.state) >>> 0;
  const up = w.upgrades;
  for (const id of Object.keys(up.levels) as UpgradeId[]) {
    up.levels[id] = Math.min(ECONOMY.upgrades[id].max + 50, Math.max(0, Math.floor(num(s.levels?.[id]))));
    up.paid[id] = Math.max(0, num(s.paid?.[id]));
    up.bought += up.levels[id];
  }
  for (const st of w.stations) {
    const d = s.stations?.[st.def.id];
    if (!d) continue;
    st.open = st.def.startsOpen || !!d.open;
    st.pile = Math.min(ECONOMY.pile.max, Math.max(0, Math.floor(num(d.pile))));
    st.counter = Math.max(0, Math.floor(num(d.counter)));
  }
  w.player.x = num(s.player?.x, w.player.x);
  w.player.z = num(s.player?.z, w.player.z);
  for (const k of Object.keys(w.stats) as (keyof typeof w.stats)[]) w.stats[k] = num(s.stats?.[k]);
  w.service.rating = Math.max(1, Math.min(5, num(s.rating, w.service.rating)));
  for (const k of Object.keys(w.contracts.trust)) w.contracts.trust[k] = Math.max(0, Math.min(5, num(s.trust?.[k])));
  for (const st of w.stations) st.boostT = Math.max(0, num(s.boost?.[st.def.id]));
  const cf = s.cafe, cafe = w.cafe;
  if (cf) {
    for (const k of Object.keys(cafe.counter) as (keyof typeof cafe.counter)[]) cafe.counter[k] = Math.max(0, Math.floor(num(cf.counter?.[k])));
    for (const m of cafe.machines) {
      const d = cf.kitchen?.[m.id];
      if (!d) continue;
      for (const k of Object.keys(m.conv.input) as (keyof typeof m.conv.input)[]) m.conv.input[k] = Math.max(0, Math.floor(num(d.in?.[k])));
      for (const k of Object.keys(m.conv.output) as (keyof typeof m.conv.output)[]) m.conv.output[k] = Math.max(0, Math.floor(num(d.out?.[k])));
    }
    cafe.tables.forEach((t, i) => { const d = cf.tables?.[i]; if (d) { t.dirty = !!d.dirty; t.cash = num(d.cash); t.bills = Math.floor(num(d.bills)); } });
    cafe.cash.value = num(cf.cash?.value);
    cafe.cash.bills = Math.floor(num(cf.cash?.bills));
  }
  w.factory.silo = Math.max(0, Math.floor(num(s.factory?.silo)));
  for (const m of w.factory.machines) {
    const d = s.factory?.machines?.[m.def.id];
    if (!d) continue;
    for (const k of Object.keys(m.conv.input) as (keyof typeof m.conv.input)[]) m.conv.input[k] = Math.max(0, Math.floor(num(d.in?.[k])));
    for (const k of Object.keys(m.conv.output) as (keyof typeof m.conv.output)[]) m.conv.output[k] = Math.max(0, Math.floor(num(d.out?.[k])));
  }
  for (const id of s.album?.seen ?? []) if (typeof id === 'string') w.album.seen.add(id);
  for (const id of s.album?.paid ?? []) if (typeof id === 'string') w.album.paid.add(id);
  if (s.daily && typeof s.daily.day === 'string' && Array.isArray(s.daily.tasks)) {
    w.daily.day = s.daily.day;
    w.daily.tasks = s.daily.tasks.filter((t) => t && typeof t.id === 'string').map((t) => ({
      id: t.id, target: Math.max(1, num(t.target, 1)), start: num(t.start), reward: num(t.reward), claimed: !!t.claimed, notified: !!t.notified,
    }));
  }
  w.field.cash.value = num(s.field?.cash);
  w.field.cash.bills = Math.floor(num(s.field?.bills));
  w.field.hopperN = 0;
  for (const k of Object.keys(w.field.hopper) as (keyof typeof w.field.hopper)[]) {
    w.field.hopper[k] = Math.max(0, Math.floor(num(s.field?.hopper?.[k])));
    w.field.hopperN += w.field.hopper[k];
  }
  w.cash.value = num(s.cash?.value);
  w.cash.bills = Math.floor(num(s.cash?.bills));
  up.apply();
  w.carry.items.length = 0;
  for (const p of s.carry ?? []) if ((ITEM_IDS as string[]).includes(p) && !w.carry.full()) w.carry.push(p as ItemId);
  w.staff.machines.forEach((m, i) => { m.broken = m.running && !!s.broken?.[String(i)]; });
  // rebuild tiles from scratch so one under the restored player position starts disarmed
  up.tiles = [];
  up.refresh();
}
