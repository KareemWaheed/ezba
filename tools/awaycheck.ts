/**
 * Time away: 8 h counts (the overseer, away.cap, raises it to 12 h then 24 h); the first 2 h earn at full
 * rate and the rest at a reduced one; only an hour is simulated and the rest extrapolated, so a day away stays quick.
 */
import { ECONOMY } from '../src/config/economy';
import { SimWorld } from '../src/sim/world';
import { awayCap, simulateAway } from '../src/sim/offline';

let fails = 0;
const ok = (cond: boolean, msg: string): void => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) fails++;
};
const H = 3600;

/** A farm with workers and belts on eggs and milk (earns on its own). */
function farm(cap = 0): SimWorld {
  const w = new SimWorld(4);
  for (const [k, v] of [['milk.unlock', 1], ['eggs.worker', 2], ['milk.worker', 2], ['eggs.machine', 2], ['milk.machine', 2], ['cashier', 1], ['eggs.animals', 6], ['milk.animals', 4]] as const) w.upgrades.levels[k] = v;
  w.upgrades.levels['away.cap'] = cap;
  w.upgrades.apply();
  for (let i = 0; i < 60 * 30; i++) { w.tick(1 / 30); w.events.drain(() => {}); }
  return w;
}

ok(awayCap(farm()) === 8 * H && awayCap(farm(1)) === 12 * H && awayCap(farm(2)) === 24 * H, 'time away counts 8 h, then 12 h and 24 h with the overseer');

const r2 = simulateAway(farm(), 2 * H), r8 = simulateAway(farm(), 8 * H), r30 = simulateAway(farm(), 30 * H);
ok(r2.earned > 0 && r8.seconds === 8 * H && r30.seconds === 8 * H, `capped at 8 h (2 h: ${r2.earned}, 8 h: ${r8.earned}, 30 h: ${r30.earned})`);
ok(r30.earned === r8.earned, 'a day away pays the same as 8 h without the overseer');
// 8 h = 2 h at full rate + 6 h at lateFactor (the rate wobbles a little run to run)
const k = r8.earned / r2.earned, want = (2 + 6 * ECONOMY.offline.lateFactor) / 2;
ok(Math.abs(k - want) < 0.3, `the hours after the first two earn less (8 h pays ${k.toFixed(2)}x of 2 h, ~${want.toFixed(2)} expected)`);
const t0 = Date.now(), r24 = simulateAway(farm(2), 30 * H), ms = Date.now() - t0;
ok(r24.seconds === 24 * H && r24.earned > r8.earned * 2, `with the overseer a day counts (${r24.earned})`);
ok(ms < 8000, `a day away is quick to work out (${ms} ms incl. building the farm)`);

// mechanics (hr.mechanic): walk out of the HR yard to a jam and fix it, the player far away; also while away
{
  const w = farm();
  w.upgrades.levels['hr.office'] = 1; w.upgrades.levels['maint'] = 1; w.upgrades.levels['hr.mechanic'] = 2;
  w.upgrades.apply();
  ok(w.staff.mechanics.length === 2, 'two mechanics with level 2');
  const [a, b] = w.staff.belts.filter((x) => x.running);
  a.broken = true; b.broken = true;
  let t = 0;
  while ((a.broken || b.broken) && t < 60) { w.player.x = 8; w.player.z = 8; w.input.x = w.input.z = 0; w.tick(1 / 30); w.events.drain(() => {}); t += 1 / 30; }
  ok(!a.broken && !b.broken, `they fix both jams on their own (${t.toFixed(1)} s)`);
  const fixes = w.stats.fixes;
  ok(fixes === 0, 'the player fixed none of them');
  // time away: jams don't pile up
  simulateAway(w, H);
  ok(w.staff.belts.filter((x) => x.running && x.broken).length === 0 || w.staff.mechanics.some((m) => m.target), 'after an hour away no jam is left waiting for the player');
}

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall away checks passed');
