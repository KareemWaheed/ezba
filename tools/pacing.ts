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
  days: 2,
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

/** Targets for the active profile. Add stage targets as stages land (worker, cows, café...). */
export function checkTargets(active: RunResult): TargetResult[] {
  const out: TargetResult[] = [];
  const p = active.purchases;
  const t1 = p[0]?.playMin ?? Infinity;
  out.push({ name: 'first upgrade within ~1 min', ok: t1 <= 1.5, detail: `${t1.toFixed(1)} min` });

  let maxGap = 0, at = 0, prev = 0;
  for (const x of p) {
    if (x.playMin > 30) break;
    if (x.playMin - prev > maxGap) { maxGap = x.playMin - prev; at = prev; }
    prev = x.playMin;
  }
  out.push({ name: 'something new every few minutes (first 30 min, gap <= 5 min)', ok: maxGap <= 5, detail: `max gap ${maxGap.toFixed(1)} min after minute ${at.toFixed(1)}` });

  const stage1Done = p.filter((x) => x.playMin <= 20).length;
  const total1 = p.length;
  out.push({ name: 'stage 1 not exhausted before 20 min', ok: total1 === 0 || stage1Done < total1 || p[p.length - 1].playMin >= 20, detail: `${stage1Done}/${total1} purchases by minute 20` });

  const w = first(active, 'eggs.animals', 8);
  if (w) out.push({ name: 'chicken track not maxed before ~15 min', ok: w.playMin >= 15, detail: `maxed at ${w.playMin.toFixed(1)} min` });

  const wk = first(active, 'eggs.worker');
  out.push({ name: 'first worker around 20-30 min', ok: !!wk && wk.playMin >= 18 && wk.playMin <= 32, detail: wk ? `${wk.playMin.toFixed(1)} min` : 'never' });

  // active play must beat automation alone; checked on every session once automation exists
  const auto = active.sessions.filter((s) => s.autoPerMin > 0);
  const worst = auto.reduce((m, s) => Math.min(m, s.activePerMin / s.autoPerMin), Infinity);
  out.push({
    name: 'active player earns noticeably more than automation alone (>= 1.5x)',
    ok: auto.length === 0 || worst >= 1.5,
    pending: 'M7 (tips, VIP, rushes, golden animals, feeding troughs)',
    detail: auto.length ? `worst ratio ${worst.toFixed(2)}x` : 'no automation yet',
  });
  return out;
}
