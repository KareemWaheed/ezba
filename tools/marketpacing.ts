/**
 * Pacing of the supermarket-first game: an active and a casual bot play a fresh store and the unlock
 * times are checked against targets (the farm path has tools/simulate.ts).
 *
 *   npm run marketpacing            timeline + checks
 */
import { SimWorld } from '../src/sim/world';
import { Bot, type BotProfile } from '../src/sim/bot';
import { UPGRADES } from '../src/config/upgrades';
import type { UpgradeId } from '../src/config/economy';

const DT = 1 / 30;
let fails = 0;
const ok = (cond: boolean, msg: string): void => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) fails++;
};

interface Run { first: Record<string, number>; times: number[]; served: number; unhappy: number; earned: number; lateServed: number; lateUnhappy: number }

function play(profile: BotProfile, minutes: number): Run {
  const w = new SimWorld(11, 'market'), bot = new Bot(w, profile);
  const first: Record<string, number> = {}, times: number[] = [];
  let served0 = 0, unhappy0 = 0;
  for (let i = 0; i < (minutes * 60) / DT; i++) {
    // the last hour: the store is running (stockers, cashier), so unhappy shoppers should be rare
    if (i === Math.round(((minutes - 60) * 60) / DT)) { served0 = w.stats.marketServed; unhappy0 = w.market.angry; }
    bot.update(DT);
    w.tick(DT);
    w.events.drain((e) => {
      if (e.type !== 'buy') return;
      const id = UPGRADES[e.id].id, t = w.time / 60;
      times.push(t);
      first[id] ??= t;
    });
  }
  return { first, times, served: w.stats.marketServed, unhappy: w.market.angry, earned: w.stats.earned, lateServed: w.stats.marketServed - served0, lateUnhappy: w.market.angry - unhappy0 };
}

const fmt = (t?: number) => (t === undefined ? '—' : `${t.toFixed(1)} min`);
const KEY: UpgradeId[] = ['market.ads', 'market.cashier', 'market.shelves', 'eggs.unlock', 'eggs.worker', 'market.stocker', 'milk.unlock', 'market.auto', 'hr.office', 'cafe.unlock', 'field.unlock', 'factory.unlock'];
const runs: Record<string, Run> = {};
for (const p of ['active', 'casual'] as const) {
  const r = (runs[p] = play(p, p === 'active' ? 150 : 240));
  console.log(`\n${p}: ${r.times.length} upgrades, ${r.served} shoppers paid, ${r.unhappy} unhappy, earned ${Math.round(r.earned)}`);
  for (const id of KEY) console.log(`  ${id.padEnd(16)} ${fmt(r.first[id])}`);
}
console.log('');

const a = runs.active, c = runs.casual;
ok((c.times[0] ?? 99) <= 2, `casual: first upgrade within 2 min (${fmt(c.times[0])})`);
let gap = 0, at = 0, prev = 0;
for (const t of c.times) { if (t > 30) break; if (t - prev > gap) { gap = t - prev; at = prev; } prev = t; }
if (prev < 30 && 30 - prev > gap) { gap = 30 - prev; at = prev; }
ok(gap <= 5, `casual: something new every few minutes (first 30 min, gap <= 5) (max gap ${gap.toFixed(1)} after minute ${at.toFixed(1)})`);
ok((a.first['eggs.unlock'] ?? 0) >= 6 && (c.first['eggs.unlock'] ?? 999) <= 40, `chickens: efficient >= 6 min, casual <= 40 min (${fmt(a.first['eggs.unlock'])} / ${fmt(c.first['eggs.unlock'])})`);
ok((c.first['milk.unlock'] ?? 999) <= 120, `cows: casual <= 120 min (${fmt(c.first['milk.unlock'])})`);
ok((c.first['cafe.unlock'] ?? 999) <= 240, `café: casual within 4 h (${fmt(c.first['cafe.unlock'])})`);
ok(a.lateUnhappy <= a.lateServed * 0.03, `active: once staffed, nearly nobody leaves unhappy (last hour ${a.lateUnhappy} of ${a.lateServed + a.lateUnhappy})`);
ok(c.unhappy <= c.served * 0.3, `casual: unhappy shoppers stay a minority over the whole run (${c.unhappy} of ${c.served + c.unhappy})`);
console.log(fails ? `\n${fails} failed` : '\nall supermarket pacing checks passed');
process.exit(fails ? 1 : 0);
