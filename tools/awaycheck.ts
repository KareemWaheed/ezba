/**
 * Time away: 8 h counts (the overseer, away.cap, raises it to 12 h then 24 h); the first 2 h earn at full
 * rate and the rest at a reduced one; only an hour is simulated and the rest extrapolated, so a day away stays quick.
 */
import { ECONOMY } from '../src/config/economy';
import { SimWorld } from '../src/sim/world';
import { awayCap, simulateAway } from '../src/sim/offline';
import { LAYOUT } from '../src/config/layout';

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
const f24 = farm(2), t0 = Date.now(), r24 = simulateAway(f24, 30 * H), ms = Date.now() - t0;
ok(r24.seconds === 24 * H && r24.earned > r8.earned * 2, `with the overseer a day counts (${r24.earned})`);
// (only the first simSeconds are ticked; a generous bound so a slow machine doesn't flake)
ok(ms < 8000, `a day away is quick to work out (${ms} ms)`);

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
  // ...and walk back into the HR yard (they used to loop at the gate, flickering, never getting in)
  const home = LAYOUT.hrYard.mechanics;
  // (no new jam during the walk home: a re-break would rightly send one back out)
  for (const mc of w.staff.machines) mc.breakT = 1e9;
  for (let i = 0; i < 40 * 30; i++) { w.player.x = 8; w.player.z = 8; w.input.x = w.input.z = 0; w.tick(1 / 30); w.events.drain(() => {}); }
  const d = Math.max(...w.staff.mechanics.map((m, i) => Math.hypot(m.x - (home.x + i * 0.8), m.z - home.z)));
  ok(d < 0.5, `and walk back through the gate to the office (${d.toFixed(2)} m from their spots)`);
  const fixes = w.stats.fixes;
  ok(fixes === 0, 'the player fixed none of them');
  for (const mc of w.staff.machines) mc.breakT = -1;
  // time away: jams don't pile up
  simulateAway(w, H);
  ok(w.staff.belts.filter((x) => x.running && x.broken).length === 0 || w.staff.mechanics.some((m) => m.target), 'after an hour away no jam is left waiting for the player');
}

// feeder (hr.feeder): walks out of the HR yard to troughs running low and refills them (not the player's feeds)
{
  const w = farm();
  w.upgrades.levels['hr.office'] = 1; w.upgrades.levels['hr.feeder'] = 1;
  w.upgrades.apply();
  ok(w.staff.feeders.length === 1, 'a feeder with the upgrade');
  const troughs = w.stations.filter((s) => s.open && s.def.trough);
  for (const s of troughs) s.boostT = 0;
  const feeds0 = w.stats.feeds;
  let t = 0;
  while (troughs.some((s) => s.boostT <= 0) && t < 60) { w.player.x = 8; w.player.z = 8; w.input.x = w.input.z = 0; w.tick(1 / 30); w.events.drain(() => {}); t += 1 / 30; }
  ok(troughs.every((s) => s.boostT > 0), `he fills every empty trough (${troughs.length} in ${t.toFixed(1)} s)`);
  ok(w.stats.feeds === feeds0, "they don't count as the player's feeds");
  // time away: the troughs stay full
  simulateAway(w, H);
  ok(troughs.every((s) => s.boostT > 0 || w.staff.feeders[0].target >= 0), 'after an hour away the troughs are still being kept full');
}

// accountant (hr.accountant): the cash piles go into the player's money on their own
{
  const w = farm();
  w.upgrades.levels['hr.office'] = 1; w.upgrades.levels['cafe.unlock'] = 1; w.upgrades.levels['hr.accountant'] = 1;
  w.upgrades.apply();
  w.cash.value = 500; w.cafe.cash.value = 300; w.field.cash.value = 200;
  const m0 = w.money;
  for (let i = 0; i < 35 * 30; i++) { w.player.x = -15; w.player.z = 6; w.input.x = w.input.z = 0; w.tick(1 / 30); w.events.drain(() => {}); }
  ok(w.money - m0 >= 1000 && w.cafe.cash.value === 0 && w.field.cash.value === 0, `the accountant collects the cash piles (${Math.round(w.money - m0)} in 35 s, player in the HR yard)`);
  // not the supermarket's till (it has its own checkout staff)
  w.market.cash.value = 700;
  for (let i = 0; i < 35 * 30; i++) { w.player.x = -15; w.player.z = 6; w.input.x = w.input.z = 0; w.tick(1 / 30); w.events.drain(() => {}); }
  ok(w.market.cash.value >= 700, `...but not the supermarket's till (${w.market.cash.value} still there)`);
  // not while away: the piles a time away leaves are its own sum (taken back out and paid once)
  w.cash.value = 0; w.field.cash.value = 0; w.cafe.cash.value = 0;
  let collected = 0;
  w.away = true;
  for (let i = 0; i < 60 * 2; i++) { w.advance(0.5); w.events.drain((e) => { if (e.type === 'accountant') collected += e.value; }); }
  w.away = false;
  ok(collected === 0, 'and not during time away');
}

// customer service (hr.service): shop customers wait longer
{
  const a = farm(), b = farm();
  b.upgrades.levels['hr.office'] = 1; b.upgrades.levels['hr.service'] = 3;
  b.upgrades.apply();
  for (let i = 0; i < 30 * 30; i++) { a.tick(1 / 30); b.tick(1 / 30); a.events.drain(() => {}); b.events.drain(() => {}); }
  const pm = (w: SimWorld) => Math.max(...w.customers.list.map((c) => c.patienceMax));
  ok(pm(b) > pm(a) * 1.3, `customers are more patient with customer service (max patience ${pm(a).toFixed(0)} -> ${pm(b).toFixed(0)} s)`);
}

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall away checks passed');
