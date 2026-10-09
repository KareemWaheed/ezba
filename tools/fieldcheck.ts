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
import { ECONOMY } from '../src/config/economy';
import { COMPANIES } from '../src/config/contracts';

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

// the corn field shows as a locked preview (what it needs) while the café is on offer, and goes once it's open
{
  const t = new SimWorld(4);
  for (const [id, lv] of [['eggs.animals', 4], ['eggs.worker', 1], ['milk.unlock', 1], ['cashier', 1]] as const) { t.upgrades.levels[id] = lv; t.upgrades.bought += lv; }
  t.upgrades.apply(); t.upgrades.refresh();
  const corn = t.upgrades.teasers().find((x) => x.def.id === 'field.unlock');
  ok(!!corn && corn.needs.length === 1 && corn.needs[0].id === 'cafe.unlock', `the corn field is previewed, needing the café (${corn?.needs.map((n) => n.id).join()})`);
  t.upgrades.levels['cafe.unlock'] = 1; t.upgrades.apply(); t.upgrades.refresh();
  ok(!t.upgrades.teasers().some((x) => x.def.id === 'field.unlock') && t.upgrades.tiles.some((x) => x.def.id === 'field.unlock'), 'with the café open the preview turns into the real tile');
}

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
  // (two hands, 3 min: ~18 bundles a minute each; a tractor driver still brings more)
  ok(bundles >= 60 && bundles <= 150, `two hands harvest and hand in on their own (${bundles} bundles, ${stalks} stalks in 3 min)`);
  const d2 = new SimWorld(3);
  d2.upgrades.levels['field.unlock'] = 1;
  d2.upgrades.levels['field.tractor'] = 1;
  d2.upgrades.levels['field.driver'] = 1;
  d2.upgrades.apply();
  d2.player.x = 8; d2.player.z = 8;
  const dc0 = d2.stats.crops;
  tick(d2, 180);
  ok(d2.stats.crops - dc0 > bundles * 1.4, `one tractor driver out-harvests two untrained hands (${d2.stats.crops - dc0} vs ${bundles})`);
  const h2 = new SimWorld(1);
  restore(h2, migrate(JSON.parse(JSON.stringify(serialize(h, Date.now()))))!);
  ok(h2.field.hands.length === 2, 'the hands come back after a reload');
  // training (field.handSkill): faster sickles and legs, bigger sacks
  const t = new SimWorld(3);
  t.upgrades.levels['field.unlock'] = 1;
  t.upgrades.levels['field.hand'] = 2;
  t.upgrades.levels['field.handSkill'] = ECONOMY.upgrades['field.handSkill'].max;
  t.upgrades.apply();
  t.player.x = 8; t.player.z = 8;
  const tc0 = t.stats.crops;
  tick(t, 180);
  const trained = t.stats.crops - tc0;
  ok(trained >= bundles * 2, `fully trained hands bring at least twice as much (${trained} vs ${bundles} bundles in 3 min)`);
  ok(t.field.handStats().hopper > ECONOMY.field.hand.hopper, `...and carry more (${t.field.handStats().hopper} bundles)`);
}

// the combine unloads at the stall: it can't fit at the front (between the stall and the coop fence), so it
// drives (for real, with collisions) to the back from the field and empties there
{
  const c = new SimWorld(3);
  c.upgrades.levels['field.unlock'] = 1; c.upgrades.levels['field.wheat'] = 1;
  c.upgrades.levels['field.tractor'] = 1; c.upgrades.levels['field.combine'] = 1;
  c.upgrades.apply();
  const steer = (tx: number, tz: number, s: number) => tick(c, s, () => {
    const dx = tx - c.player.x, dz = tz - c.player.z, L = Math.hypot(dx, dz);
    c.input.x = L > 0.2 ? dx / L : 0; c.input.z = L > 0.2 ? dz / L : 0;
  });
  c.player.x = 1.5; c.player.z = -15;
  steer(1.5, -15, 0.5);
  ok(c.field.driving && c.field.vehicle === 'combine', 'test farm: driving the combine in the corn');
  c.field.hopper.corn = 30; c.field.hopperN = 30;
  // toward the front drop (it can't fit in front, between the stall and the coop): it empties at the stall's side
  steer(FIELDS.stall.drop.x, FIELDS.stall.drop.z, 6);
  ok(c.field.hopperN === 0, `driving at the front, the combine empties against the stall's side (${c.field.hopperN} left)`);
  // from the field to the back
  c.field.hopper.corn = 30; c.field.hopperN = 30;
  c.player.x = 1.5; c.player.z = -15;
  steer(1.5, -15, 0.5);
  const before = c.field.hopperN;
  steer(FIELDS.stall.vehicleDrop.x, FIELDS.stall.vehicleDrop.z, 6);
  ok(before >= 30 && c.field.hopperN === 0, `from the field it empties at the back of the stall (${before} -> ${c.field.hopperN})`);
}

// the corn cable line (corn.machine): pile by the grain stall -> shop counter, over the coop; jams are fixed
// at the counter-end tower (the middle of the line is over the coop, out of reach)
{
  const k = new SimWorld(3);
  k.upgrades.levels['field.unlock'] = 1; k.upgrades.levels['corn.machine'] = 1;
  k.upgrades.apply();
  const st = k.stations.find((s) => s.def.product === 'corn')!, belt = k.staff.belts[st.index];
  st.pile = 40; st.counter = 0;
  tick(k, 12, () => { k.player.x = 8; k.player.z = 8; k.input.x = k.input.z = 0; });
  ok(40 - st.pile >= 20 && st.counter + belt.inTransit > 0, `the cable line carries corn to the shop counter by itself (${40 - st.pile} sent in 12 s)`);
  const fix = st.def.skyBelt!.fix;
  ok(belt.mx === fix.x && belt.mz === fix.z, 'its jams are fixed at the counter-end tower');
  belt.broken = true;
  tick(k, 6, () => { k.player.x = fix.x; k.player.z = fix.z; k.input.x = k.input.z = 0; });
  ok(!belt.broken && Math.hypot(k.player.x - fix.x, k.player.z - fix.z) < 0.5, 'the player reaches the fix spot and fixes it');
}

// a hungry bakery sends the tractor drivers to the wheat (its silo was stuck at 0 with the drivers on the corn)
{
  const b = new SimWorld(3);
  for (const k of ['cafe.unlock', 'field.unlock', 'field.wheat', 'factory.unlock', 'field.tractor', 'field.driver'] as const) b.upgrades.levels[k] = 1;
  b.upgrades.apply();
  const wheatIx = b.field.plots.findIndex((p) => p.crop === 'wheat');
  tick(b, 2, () => { b.player.x = 8; b.player.z = 8; b.input.x = b.input.z = 0; });
  ok(b.field.drivers[0].plot === wheatIx, `with the bakery short of wheat the driver works the wheat (plot ${b.field.drivers[0].plot})`);
  b.factory.silo = ECONOMY.factory.siloMax;
  b.field.drivers[0].state = 'back';
  tick(b, 2, () => { b.player.x = 8; b.player.z = 8; b.input.x = b.input.z = 0; });
  ok(b.field.drivers[0].plot !== wheatIx, 'with the silo full it goes back to its own plot');
}

// dock workers fetch whatever the truck ordered: wheat (kept at the stall, or from the silo) and corn (the
// pile by the stall too, not only the shop counter's surplus) for the mills truck (playtest: 0/28 wheat, slow corn)
{
  const d = new SimWorld(3);
  for (const k of ['cafe.unlock', 'field.unlock', 'field.wheat', 'factory.unlock', 'dock.unlock'] as const) d.upgrades.levels[k] = 1;
  d.upgrades.levels['dock.worker'] = 2;
  d.upgrades.apply();
  const mills = COMPANIES.find((c) => c.id === 'mills')!;
  d.contracts.truck = { state: 'loading', t: 600, company: mills, kind: 'standing', lines: [{ product: 'wheat', want: 20, loaded: 0 }, { product: 'corn', want: 20, loaded: 0 }], price: { wheat: 10, corn: 10 }, drive: 1 };
  d.factory.silo = 0;
  d.stations.find((s) => s.def.product === 'corn')!.pile = 60;
  // wheat handed in at the stall is kept for the truck (not the silo, not sold)
  for (let i = 0; i < 6; i++) d.carry.push('wheat');
  tick(d, 3, () => { d.player.x = FIELDS.stall.drop.x; d.player.z = FIELDS.stall.drop.z; d.input.x = d.input.z = 0; });
  ok(d.field.dockWheat === 6 && d.factory.silo === 0, `wheat handed in at the stall is kept for the truck (${d.field.dockWheat} kept, silo ${d.factory.silo})`);
  tick(d, 150, () => { d.player.x = 8; d.player.z = 8; d.input.x = d.input.z = 0; });
  const l = d.contracts.truck.lines;
  ok(l[0].loaded === 6 && d.field.dockWheat === 0 && l[1].loaded >= 15, `the dock workers load the kept wheat and the corn (${l[0].loaded}/20 wheat, ${l[1].loaded}/20 corn)`);
  // two workers on two different orders keep their own sources (cake from the bakery tray, corn from the pile)
  const tseppas = COMPANIES.find((c) => c.id === 'tseppas')!;
  d.contracts.truck = { state: 'loading', t: 600, company: tseppas, kind: 'standing', lines: [{ product: 'cake', want: 8, loaded: 0 }, { product: 'corn', want: 8, loaded: 0 }], price: { cake: 10, corn: 10 }, drive: 1 };
  const bakery = d.factory.machines.find((m) => m.def.id === 'bakery')!;
  bakery.conv.output.cake = 8; bakery.conv.input.egg = 0;
  d.stations.find((s) => s.def.product === 'corn')!.pile = 30;
  tick(d, 150, () => { d.player.x = 8; d.player.z = 8; d.input.x = d.input.z = 0; });
  const l2 = d.contracts.truck.lines;
  ok(l2[0].loaded === 8 && l2[1].loaded === 8 && bakery.conv.output.cake === 0, `two workers fill a cake + corn order from two places (${l2[0].loaded}/8 cake, ${l2[1].loaded}/8 corn)`);
}

// more land (field.expand): a second corn plot, then a second wheat plot, east of the wheat
{
  const x = new SimWorld(3);
  x.upgrades.levels['field.unlock'] = 1; x.upgrades.levels['field.wheat'] = 1;
  x.upgrades.apply();
  const n0 = x.field.plots.filter((p) => p.open).length, x1 = x.bounds.x1;
  x.upgrades.levels['field.expand'] = 1; x.upgrades.apply();
  const corn2 = x.field.plots.find((p) => p.def.id === 'corn2')!, wheat2 = x.field.plots.find((p) => p.def.id === 'wheat2')!;
  ok(corn2.open && !wheat2.open && x.bounds.x1 >= corn2.def.box.x1, `level 1 opens a second corn plot (${n0} -> ${x.field.plots.filter((p) => p.open).length} plots, reach x ${x1} -> ${x.bounds.x1})`);
  x.upgrades.levels['field.expand'] = 2; x.upgrades.apply();
  ok(wheat2.open && x.bounds.x1 >= wheat2.def.box.x1, 'level 2 opens a second wheat plot');
  // cutting the new corn works like the old
  const c0 = x.stats.stalks;
  x.player.x = (corn2.def.box.x0 + corn2.def.box.x1) / 2; x.player.z = -15;
  tick(x, 1);
  ok(x.stats.stalks > c0, `the player harvests the new plot (${x.stats.stalks - c0} stalks)`);
  const x2 = new SimWorld(1);
  restore(x2, migrate(JSON.parse(JSON.stringify(serialize(x, Date.now()))))!);
  ok(x2.field.plots.find((p) => p.def.id === 'wheat2')!.open, 'the new land stays after a reload');
}

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall field checks passed');
