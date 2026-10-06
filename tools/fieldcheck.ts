/**
 * Headless field checks: hand-harvested corn handed in at the grain stall goes onto the corn pile and
 * the hired corn workers carry it to the shop counter.
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
ok(!w.carry.has('corn') && corn.pile >= 200, `the corn pile has no limit (${corn.pile} on it, ${w.carry.items.filter((x) => x === 'corn').length} left in hand)`);
const w2 = new SimWorld(1);
restore(w2, migrate(JSON.parse(JSON.stringify(serialize(w, Date.now()))))!);
ok(w2.stations.find((s) => s.def.product === 'corn')!.pile === corn.pile, 'a save keeps the whole corn pile');

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall field checks passed');
