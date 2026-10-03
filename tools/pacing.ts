/**
 * Pacing simulator settings and targets. Play pattern = the simulated player's daily routine.
 * Targets mirror the brief; `npm run simulate -- --check` fails if any is missed.
 */
import type { UpgradeId } from '../src/config/economy';

export const PLAY = {
  /** Play sessions per day and their length (minutes). Day 1 ~ 80 min of play. */
  sessionsPerDay: 4,
  sessionMinutes: 20,
  /** Hours away between sessions within a day, and overnight. */
  breakHours: 3,
  overnightHours: 12,
  /** Days simulated by default (override with --days N). */
  days: 7,
  seed: 12345,
};

export interface Purchase { id: UpgradeId; level: number; cost: number; playMin: number; day: number }
export interface SessionStat {
  day: number; session: number; endMin: number;
  /** Lifetime earnings per minute during this session (player + automation). */
  activePerMin: number;
  /** What automation alone earned per minute during the following break (before offline efficiency). */
  autoPerMin: number;
  /** Offline money credited for the following break. */
  offline: number;
  /** Per-session breakdown for --verbose. */
  detail: { shopServed: number; cafeServed: number; angry: number; shopSales: number; cafeSales: number; tips: number; rush: number; golden: number; trucks: number; rating: number };
}
export interface RunResult {
  profile: string;
  purchases: Purchase[];
  sessions: SessionStat[];
  /** [play minute, lifetime earned] samples. */
  curve: [number, number][];
  playMin: number;
  offlineEarned: number;
}

/** pending = shown but not enforced by --check yet (lands in a later milestone). */
export interface TargetResult { name: string; ok: boolean; detail: string; pending?: string }

const first = (r: RunResult, id: UpgradeId, level = 1) => r.purchases.find((p) => p.id === id && p.level === level);

const fmt = (x?: Purchase) => (x ? `${x.playMin.toFixed(0)} min (day ${x.day})` : 'never');

/** When every worker/cashier/machine step of stages 1-3 has been bought at least once. */
const AUTO: UpgradeId[] = ['eggs.worker', 'eggs.machine', 'cashier', 'milk.worker', 'milk.machine', 'cafe.helper', 'cafe.belt', 'cafe.waiter', 'cafe.cleaner'];
function automated(r: RunResult): Purchase | undefined {
  const last = AUTO.map((id) => first(r, id));
  if (!last.every(Boolean)) return undefined;
  let done: Purchase | undefined;
  for (const x of last as Purchase[]) if (!done || x.playMin > done.playMin) done = x;
  return done;
}

/**
 * Two-sided targets: the efficient bot must not race through (lower bounds), and a casual player
 * must not find it too slow (upper bounds). Times are minutes of play; a day = 80 min of play.
 */
export function checkTargets(eff: RunResult, casual: RunResult): TargetResult[] {
  const out: TargetResult[] = [];
  const add = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });

  // early game (casual player): quick first win, steady stream of upgrades
  const c1 = casual.purchases[0];
  add('casual: first upgrade within ~1.5 min', !!c1 && c1.playMin <= 1.5, fmt(c1));
  let maxGap = 0, at = 0, prev = 0;
  for (const x of casual.purchases) { if (x.playMin > 30) break; if (x.playMin - prev > maxGap) { maxGap = x.playMin - prev; at = prev; } prev = x.playMin; }
  add('casual: something new every few minutes (first 30 min, gap <= 5)', maxGap <= 5, `max gap ${maxGap.toFixed(1)} after minute ${at.toFixed(1)}`);

  // milestones: efficient not before X, casual not after Y
  const span = (label: string, id: UpgradeId, effMin: number, casualMax: number) => {
    const e = first(eff, id), c = first(casual, id);
    add(`${label}: efficient >= ${effMin} min, casual <= ${casualMax} min`, !!e && e.playMin >= effMin && !!c && c.playMin <= casualMax, `efficient ${fmt(e)}, casual ${fmt(c)}`);
  };
  span('first worker', 'eggs.worker', 15, 35);
  span('cows', 'milk.unlock', 45, 160);
  span('egg belt', 'eggs.machine', 70, 240);
  span('café', 'cafe.unlock', 80, 320);

  const ea = automated(eff), ca = automated(casual);
  add('stages 1-3 automated: efficient from day 4, casual by day 7', !!ea && ea.day >= 4 && !!ca && ca.day <= 7, `efficient ${fmt(ea)}${ea ? ' last ' + ea.id : ''}, casual ${fmt(ca)}${ca ? ' last ' + ca.id : ''}`);

  // active play must beat automation alone; checked on every session once automation exists
  const autoS = eff.sessions.filter((s) => s.autoPerMin > 0);
  const worst = autoS.reduce((m, s) => Math.min(m, s.activePerMin / s.autoPerMin), Infinity);
  add('active player earns noticeably more than automation alone (>= 1.5x)', autoS.length === 0 || worst >= 1.5, autoS.length ? `worst ratio ${worst.toFixed(2)}x` : 'no automation yet');
  return out;
}
