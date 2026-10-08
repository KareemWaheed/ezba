/**
 * Headless field checks: hand-harvested corn handed in at the grain stall goes onto the corn pile and
 * the hired corn workers carry it to the shop counter; hired field hands harvest on foot, slower than a driver.
 *
 *   npm run fieldcheck
 */
import { SimWorld } from '../src/sim/world';
import { serialize, restore, migrate } from '../src/sim/save';
import { Bot } from '../src/sim/bot';
import { FIELDS } from '../src/config/fields';

const DT = 1 / 30;
let fails = 0;
const ok = (cond: boolean, msg: string): void => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) fails++;
};
const tick = (w: SimWorld, s: number, drive?: () => void): void => {
  for (let i = 0; i < s / DT; i++) { drive?.(); w.tick(DT); w.events.drain(() => {}); }
};

// a farm with the corn field and a corn worker, no tractor drivers
const w = new SimWorld(7), bot = new Bot(w, 'active');
for (let i = 0; i < 30 * 60 * 90 && w.upgrades.level('corn.worker') < 1; i++) { w.money = Math.max(w.money, 1e9); bot.update(DT); w.tick(DT); w.events.drain(() => {}); }
const corn = w.stations.find((s) => s.def.product === 'corn')!;
ok(corn.open && w.upgrades.level('corn.worker') >= 1 && w.field.drivers.length === 0, 'test farm: corn field + corn worker, no drivers');

// the player brings a full stack of hand-cut corn to the stall
corn.pile = 0;
w.carry.items.length = 0;
for (let k = 0; k < 8; k++) w.carry.push('corn');
const d = FIELDS.stall.drop, counter0 = corn.counter;
tick(w, 6, () => { w.player.x = d.x; w.player.z = d.z; w.input.x = w.input.z = 0; });
ok(!w.carry.has('corn'), `the stall takes the carried corn (${w.carry.items.filter((x) => x === 'corn').length} left in hand)`);
// walk away; the corn worker moves it to the shop
w.player.x = 8; w.player.z = 8;
// (shop customers may buy some of it straight off the counter: those count as delivered too)
let cornSold = 0;
for (let i = 0; i < 60 / DT; i++) { w.tick(DT); w.events.drain((e) => { if (e.type === 'sell' && e.product === 'corn') cornSold++; }); }
const reached = corn.counter - counter0 + cornSold;
ok(reached >= 8, `the corn worker carried it to the shop counter (+${reached}, ${cornSold} already sold)`);

// the corn pile has no limit: a big pile still takes everything the player brings (and saves whole)
corn.pile = 200;
w.carry.items.length = 0;
for (let k = 0; k < 6; k++) w.carry.push('corn');
tick(w, 3, () => { w.player.x = d.x; w.player.z = d.z; });
// (the corn worker keeps taking from it meanwhile: the point is the hand empties onto a pile way past the old cap of 24)
ok(!w.carry.has('corn') && corn.pile > 150, `the corn pile has no limit (${corn.pile} on it, ${w.carry.items.filter((x) => x === 'corn').length} left in hand)`);
const w2 = new SimWorld(1);
restore(w2, migrate(JSON.parse(JSON.stringify(serialize(w, Date.now()))))!);
ok(w2.stations.find((s) => s.def.product === 'corn')!.pile === corn.pile, 'a save keeps the whole corn pile');

// field hands: on foot with a sickle, slow but on their own (before any tractor)
{
  const h = new SimWorld(3);
  h.upgrades.levels['field.unlock'] = 1;
  h.upgrades.levels['field.hand'] = 2;
  h.upgrades.apply();
  ok(h.field.hands.length === 2 && h.field.drivers.length === 0, 'field hands come with the upgrade, no tractor needed');
  h.player.x = 8; h.player.z = 8;
  const crops0 = h.stats.crops, stalks0 = h.stats.stalks;
  tick(h, 180);
  const bundles = h.stats.crops - crops0, stalks = h.stats.stalks - stalks0;
  // (two hands, 3 min: a few bundles a minute each; a tractor driver brings far more)
  ok(bundles >= 15 && bundles <= 70, `two hands harvest and hand in on their own, slowly (${bundles} bundles, ${stalks} stalks in 3 min)`);
  const d2 = new SimWorld(3);
  d2.upgrades.levels['field.unlock'] = 1;
  d2.upgrades.levels['field.tractor'] = 1;
  d2.upgrades.levels['field.driver'] = 1;
  d2.upgrades.apply();
  d2.player.x = 8; d2.player.z = 8;
  const dc0 = d2.stats.crops;
  tick(d2, 180);
  ok(d2.stats.crops - dc0 > bundles * 3, `one tractor driver out-harvests two hands several times over (${d2.stats.crops - dc0} vs ${bundles})`);
  const h2 = new SimWorld(1);
  restore(h2, migrate(JSON.parse(JSON.stringify(serialize(h, Date.now()))))!);
  ok(h2.field.hands.length === 2, 'the hands come back after a reload');
}

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall field checks passed');
