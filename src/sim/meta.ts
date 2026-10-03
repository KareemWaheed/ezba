import { ALBUM_PAGES } from '../config/album';
import { TASKS, TASKS_PER_DAY, type StatKey } from '../config/tasks';
import { Rng } from './rng';
import type { SimWorld } from './world';

/** Customer album: entries are recorded the first time that kind of customer is served. */
export class AlbumSystem {
  readonly seen = new Set<string>();
  /** Pages whose completion bonus was paid. */
  readonly paid = new Set<string>();

  constructor(private w: SimWorld) {}

  /** Record an entry; pays a page's bonus the moment it's complete. */
  see(id: string): void {
    if (!id || this.seen.has(id)) return;
    this.seen.add(id);
    const w = this.w;
    const pi = ALBUM_PAGES.findIndex((p) => p.entries.some((e) => e.id === id));
    if (pi < 0) return;
    w.events.emit('albumNew', '', 0, 0, 0, pi, ALBUM_PAGES[pi].entries.findIndex((e) => e.id === id));
    const page = ALBUM_PAGES[pi];
    if (!this.paid.has(page.id) && page.entries.every((e) => this.seen.has(e.id))) {
      this.paid.add(page.id);
      const v = Math.round(page.rewardSeconds * w.perSec);
      w.money += v;
      w.stats.earned += v;
      w.events.emit('albumPage', '', 0, 0, v, pi);
    }
  }
}

export interface DailyTask {
  id: string;
  target: number;
  /** Stat value when the day's tasks were picked. */
  start: number;
  reward: number;
  claimed: boolean;
  /** Completion toast already shown. */
  notified: boolean;
}

/** Three tasks per calendar day (picked from the pool by date), each with a claimable reward. */
export class DailySystem {
  day = '';
  tasks: DailyTask[] = [];

  constructor(private w: SimWorld) {}

  /** Pick the day's tasks when the date changes (`day` = local YYYY-MM-DD). */
  ensure(day: string): void {
    if (day === this.day && this.tasks.length) return;
    const w = this.w;
    this.day = day;
    let seed = 7;
    for (const ch of day) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rng = new Rng(seed);
    const pool = TASKS.filter((t) => !t.when || t.when(w));
    const picked: typeof pool = [];
    while (picked.length < TASKS_PER_DAY && pool.length) picked.push(pool.splice(rng.int(pool.length), 1)[0]);
    // targets grow with the farm; rewards are seconds of current production
    const scale = 1 + Math.floor(w.upgrades.bought / 15) * 0.5;
    this.tasks = picked.map((t) => ({
      id: t.id, target: Math.max(1, Math.round(t.base * scale)), start: w.stats[t.stat], reward: Math.max(100, Math.round(t.rewardSeconds * w.perSec)),
      claimed: false, notified: false,
    }));
  }

  progress(t: DailyTask): number {
    const def = TASKS.find((d) => d.id === t.id);
    return def ? Math.min(t.target, this.w.stats[def.stat as StatKey] - t.start) : 0;
  }

  done(t: DailyTask): boolean { return this.progress(t) >= t.target; }

  /** Tasks finished but not claimed yet (drives the HUD badge). */
  get ready(): number { return this.tasks.filter((t) => !t.claimed && this.done(t)).length; }

  claim(i: number): boolean {
    const t = this.tasks[i];
    if (!t || t.claimed || !this.done(t)) return false;
    t.claimed = true;
    this.w.money += t.reward;
    this.w.stats.earned += t.reward;
    this.w.events.emit('taskClaimed', '', 0, 0, t.reward, i);
    return true;
  }

  /** Emit a one-time 'taskDone' event per finished task (call now and then). */
  check(): void {
    this.tasks.forEach((t, i) => {
      if (t.notified || !this.done(t)) return;
      t.notified = true;
      this.w.events.emit('taskDone', '', 0, 0, t.reward, i);
    });
  }
}
