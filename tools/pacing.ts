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
export interface RunResult {
  profile: string;
  purchases: Purchase[];
  /** [play minute, lifetime earned] samples. */
  curve: [number, number][];
  playMin: number;
  offlineEarned: number;
}

export interface TargetResult { name: string; ok: boolean; detail: string }

const first = (r: RunResult, id: UpgradeId, level = 1) => r.purchases.find((p) => p.id === id && p.level === level);

/** Targets for the active profile. Add stage targets as stages land (worker, cows, café...). */
export function checkTargets(active: RunResult, idle: RunResult): TargetResult[] {
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

  const aE = active.curve.at(-1)?.[1] ?? 0, iE = idle.curve.at(-1)?.[1] ?? 0;
  out.push({ name: 'active player earns noticeably more than idle (>= 1.5x)', ok: aE >= 1.5 * Math.max(1, iE), detail: `active ${Math.round(aE)} vs idle ${Math.round(iE)}` });
  return out;
}
