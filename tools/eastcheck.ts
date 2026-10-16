/**
 * East checks (config/venues.ts): the orchard's trees grow mangoes the player picks and drops at the press, the
 * press makes juice that sells at the window into its cash pile; pickers do it on their own (also during time
 * away); guava trees add guava juice; the pigeon tower's nests fill its door with squabs for the kitchen; the
 * accountant collects the windows; it's all saved; and the east doesn't hold back selling the farm.
 *
 *   npm run eastcheck
 */
import { SimWorld } from '../src/sim/world';
import { serialize, restore } from '../src/sim/save';
import { ECONOMY, type UpgradeId } from '../src/config/economy';
import { EAST } from '../src/config/venues';
import { UPGRADE_BY_ID } from '../src/config/upgrades';
import { simulateAway } from '../src/sim/offline';

const DT = 1 / 30;
let fails = 0;
const ok = (cond: boolean, msg: string): void => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) fails++;
};

/** A late farm with the east's tracks at the given levels. */
function farm(east: Partial<Record<UpgradeId, number>>): SimWorld {
  const w = new SimWorld(11);
  // (twice: some maxes grow with other tracks, e.g. chickens with the coop)
  for (let k = 0; k < 2; k++) for (const id of Object.keys(ECONOMY.upgrades) as UpgradeId[]) if (id !== 'eggs.unlock' && !id.startsWith('orchard.') && !id.startsWith('pigeons.')) w.upgrades.levels[id] = w.upgrades.maxOf(id);
  for (const [k, v] of Object.entries(east)) w.upgrades.levels[k as UpgradeId] = v!;
  w.upgrades.bought = Object.values(w.upgrades.levels).reduce((a, n) => a + n, 0);
  // (no accountant, so the windows' cash stays where it is)
  w.upgrades.levels['hr.accountant'] = 0;
  w.upgrades.apply(); w.upgrades.refresh();
  return w;
}
const park = { x: 30.4, z: 4.2 };
const run = (w: SimWorld, s: number, at: { x: number; z: number } = park) => {
  for (let i = 0; i < s / DT; i++) { w.player.x = at.x; w.player.z = at.z; w.tick(DT); w.events.drain(() => {}); }
};
const O = EAST.venues[0], P = EAST.venues[1];

// ---- only for a finished farm ----
{
  const w = farm({});
  w.upgrades.levels['hr.accountant'] = w.upgrades.maxOf('hr.accountant');
  w.upgrades.apply();
  const def = UPGRADE_BY_ID.get('orchard.unlock')!;
  ok(w.legacyMissing.length === 0 && w.upgrades.available(def), 'a finished farm is offered the orchard');
  w.upgrades.levels['river.size'] -= 1;
  w.upgrades.apply();
  ok(w.legacyMissing.length === 0 && !w.upgrades.available(def), "while a farm upgrade is still left it isn't (even with the farm sellable)");
}

// ---- the orchard by hand ----
{
  const w = farm({ 'orchard.unlock': 1 });
  const v = w.venues.get('orchard');
  ok(v.open && v.sources.filter((s) => s.open).length === 3 && w.bounds.x1 >= EAST.unlockedX1, `the orchard opens with three trees and the walkable area reaches it (x1 ${w.bounds.x1})`);
  ok(w.legacyMissing.every((d) => !d.id.startsWith('orchard.') && !d.id.startsWith('pigeons.')), "the east's goals don't hold back selling the farm");
  run(w, O.grow * O.hold + 1);
  ok(v.sources.every((s) => !s.open || s.n === O.hold), `fruit grows up to ${O.hold} a tree`);
  const t0 = v.sources[0].def;
  run(w, 3, t0.pick ?? t0);
  ok(w.carry.n > 0 && w.carry.items.every((it) => it === 'mango'), `standing under a tree picks mangoes (${w.carry.n})`);
  const carried = w.carry.n;
  run(w, 2, O.kitchen.input);
  ok(w.carry.n === 0 && v.inputCount + 2 * v.stockCount + (v.cooking ? 2 : 0) === carried, 'they go into the press');
  run(w, 40);
  ok(v.cash.value > 0 && v.cash.bills > 0, `the press makes juice and the window sells it (${Math.round(v.cash.value)} in the cash pile)`);
  const cash = v.cash.value, money = w.money;
  run(w, 1, O.window.cash);
  ok(v.cash.value === 0 && Math.abs(w.money - money - cash) < 1e-6, 'the player collects the window money');
}

// ---- pickers, guava, time away ----
{
  const w = farm({ 'orchard.unlock': 1, 'orchard.trees': 6, 'orchard.picker': 2, 'orchard.guava': 1, 'orchard.press': 4, 'orchard.stand': 3, 'orchard.water': 3 });
  const v = w.venues.get('orchard');
  ok(v.sources.every((s) => s.open) && w.staff.workers.filter((x) => x.job === v.job).length === 2, 'every tree and two pickers');
  let mango = 0, guava = 0;
  for (let i = 0; i < 240 / DT; i++) {
    w.player.x = park.x; w.player.z = park.z;
    w.tick(DT);
    w.events.drain((e) => { if (e.type === 'venue' && e.n === 2) { if (e.product === 'mangoJuice') mango++; if (e.product === 'guavaJuice') guava++; } });
  }
  ok(mango > 20 && guava > 5, `the pickers keep the press busy: ${mango} mango and ${guava} guava juices sold in 4 min`);
  const perMin = v.cash.value / 4;
  console.log(`      (a full orchard earns ~${Math.round(perMin)}/min at x${w.priceMult.toFixed(2)} prices; the farm makes ${Math.round(w.perSec * 60)}/min from animals)`);
  // saved: fruit on the trees, the press, the window, the cash (with something in every buffer)
  v.input.mango += 3; v.input.guava += 2; v.stock.mangoJuice += 4; v.stock.guavaJuice += 1;
  const s = JSON.parse(JSON.stringify(serialize(w, Date.now())));
  const saved = s.east.orchard;
  // (taken back out, so the time away below only sells what the pickers bring)
  v.input.mango -= 3; v.input.guava -= 2; v.stock.mangoJuice -= 4; v.stock.guavaJuice -= 1;
  const q = new SimWorld(11);
  restore(q, s);
  const qv = q.venues.get('orchard');
  ok(qv.open && qv.sources.map((x) => x.n).join() === v.sources.map((x) => x.n).join() && Math.abs(qv.cash.value - v.cash.value) < 1e-6, 'the orchard is saved');
  ok(qv.input.mango === saved.in.mango && qv.input.guava === saved.in.guava && qv.stock.mangoJuice === saved.st.mangoJuice && qv.stock.guavaJuice === saved.st.guavaJuice
    && saved.in.mango >= 3 && saved.st.mangoJuice >= 4, `the press and the window come back too (${JSON.stringify(saved.in)} ${JSON.stringify(saved.st)})`);
  const before = w.money;
  const r = simulateAway(w, 3600);
  ok(r.earned > 0 && w.money > before, `time away pays for the pickers' work (${r.earned} for an hour)`);
}

// ---- the pigeon tower ----
{
  const w = farm({ 'orchard.unlock': 1, 'pigeons.unlock': 1, 'pigeons.nests': 6, 'pigeons.worker': 1 });
  const v = w.venues.get('pigeons');
  ok(v.open && v.sources[0].open, 'the pigeon tower opens');
  const nests = 4 + 6 * ECONOMY.upgrades['pigeons.nests'].step;
  ok(Math.abs(v.growTime - P.grow / nests) < 1e-9, `${nests} nests: a squab every ${v.growTime.toFixed(2)} s`);
  let plates = 0;
  for (let i = 0; i < 120 / DT; i++) {
    w.player.x = park.x; w.player.z = park.z;
    w.tick(DT);
    w.events.drain((e) => { if (e.type === 'venue' && e.n === 2 && e.product === 'stuffedPigeon') plates++; });
  }
  ok(plates > 20, `the tower hand carries squabs to the kitchen and plates sell (${plates} in 2 min)`);
  const t = v.sources[0].def.pick!;
  run(w, 2, t);
  ok(w.carry.items.some((it) => it === 'squab'), 'the player picks squabs at the tower door');
  // the accountant collects the windows
  w.upgrades.levels['hr.accountant'] = 2;
  w.upgrades.apply();
  let collected = false;
  for (let i = 0; i < (ECONOMY.upgrades['hr.accountant'].step + 1) / DT && !collected; i++) {
    w.player.x = park.x; w.player.z = park.z;
    const had = v.cash.value;
    w.tick(DT);
    w.events.drain((e) => { if (e.type === 'accountant' && had > 0 && v.cash.value < had) collected = true; });
  }
  ok(collected, 'the accountant collects the kitchen window too');
}

console.log(fails ? `\n${fails} failed` : '\nall east checks passed');
process.exit(fails ? 1 : 0);
