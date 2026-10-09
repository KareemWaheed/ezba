/**
 * Main belt checks (LAYOUT.trunk): each product's belt carries its pile along its side's main belt to the sorter and
 * onto its counter slot (eggs and milk on the ground, corn and honey on cable lines); buying a product's belt sends
 * its workers home with what they cost back; a save from before that rule gets its refund once; the sorters turn
 * solid with the first belt that reaches them.
 *
 *   npm run beltcheck
 */
import { SimWorld } from '../src/sim/world';
import { serialize, restore, migrate } from '../src/sim/save';
import { UPGRADES } from '../src/config/upgrades';
import { LAYOUT } from '../src/config/layout';
import type { UpgradeId } from '../src/config/economy';

const DT = 1 / 30;
let fails = 0;
const ok = (cond: boolean, msg: string): void => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) fails++;
};
const farm = (lv: Partial<Record<UpgradeId, number>>): SimWorld => {
  const w = new SimWorld(3);
  for (const [k, v] of Object.entries(lv)) { w.upgrades.levels[k as UpgradeId] = v!; w.upgrades.bought += v!; }
  w.upgrades.apply(); w.upgrades.refresh();
  return w;
};
const away = { x: 1, z: 8 };
/** Stand on a tile with the money for it until its level goes up (the real way to buy). */
const buy = (w: SimWorld, id: UpgradeId): string[] => {
  const pos = UPGRADES.find((u) => u.id === id)!.pos, lv = w.upgrades.level(id), seen: string[] = [];
  w.money += w.upgrades.cost(id) + 10;
  w.player.x = away.x; w.player.z = away.z; w.tick(DT);
  for (let i = 0; i < 20 / DT && w.upgrades.level(id) === lv; i++) {
    w.player.x = pos.x; w.player.z = pos.z; w.input.x = w.input.z = 0; w.tick(DT);
    w.events.drain((e) => seen.push(e.type));
  }
  return seen;
};
const delivered = (w: SimWorld, product: string, s: number): number => {
  const st = w.stations.find((x) => x.def.product === product)!, c0 = st.counter;
  let sold = 0;
  for (let i = 0; i < s / DT; i++) {
    st.pile = Math.max(st.pile, 20);
    w.player.x = away.x; w.player.z = away.z; w.tick(DT);
    w.events.drain((e) => { if (e.type === 'sell' && e.product === product) sold++; });
  }
  return st.counter - c0 + sold;
};

// buying the eggs' belt: the egg workers go home, their cost comes back, their tile goes
{
  const w = farm({ 'eggs.animals': 4, 'eggs.worker': 2 });
  const workers = () => w.staff.workers.filter((k) => k.job.key === 'eggs').length;
  ok(workers() === 2, `two egg workers before the belt (${workers()})`);
  const cost = w.upgrades.costAt('eggs.worker', 0) + w.upgrades.costAt('eggs.worker', 1), before = w.money;
  const seen = buy(w, 'eggs.machine');
  const m0 = w.money;
  ok(w.upgrades.level('eggs.machine') === 1 && workers() === 0, `the belt is built and the egg workers are gone (${workers()} left)`);
  ok(seen.includes('retired') && Math.abs(m0 - before - 10 - cost) < 1, `their cost came back (+${Math.round(m0 - before - 10)} of ${cost}, a 'retired' event)`);
  ok(!w.upgrades.tiles.some((t) => t.def.id === 'eggs.worker'), 'no egg worker tile while the belt runs');
  ok(w.solids.some((b) => b.x0 === LAYOUT.trunk.westSorter.x0 && b.z0 === LAYOUT.trunk.westSorter.z0), 'the west sorter is solid now');
  ok(!w.solids.some((b) => b.x0 === LAYOUT.trunk.eastSorter.x0 && b.z0 === LAYOUT.trunk.eastSorter.z0), '...the east one not yet (no belt there)');
  const n = delivered(w, 'egg', 20);
  ok(n > 25, `the belt carries eggs along the main belt to the counter (${n} in 20 s)`);
  ok(w.money - m0 < cost, 'the refund was paid once');
}

// every product's belt reaches its slot: milk on the ground, corn and honey by cable
{
  const w = farm({ 'eggs.animals': 4, 'eggs.worker': 1, 'milk.unlock': 1, 'milk.worker': 1, 'milk.machine': 1, 'cafe.unlock': 1, 'honey.unlock': 1, 'honey.worker': 1, 'honey.machine': 1, 'field.unlock': 1, 'corn.machine': 1 });
  for (const [p, min] of [['milk', 25], ['honey', 25], ['corn', 25]] as const) {
    const n = delivered(w, p, 20);
    ok(n > min, `${p}: ${n} delivered in 20 s`);
  }
  const honey = w.staff.belts[w.stations.find((s) => s.def.product === 'honey')!.index];
  ok(!!honey.route.path && honey.route.path[2].y > 3, 'the honey rides a cable line');
  ok(w.solids.some((b) => b.x0 === LAYOUT.trunk.eastSorter.x0), 'the east sorter is solid');
}

// a save from before belts replaced workers: their cost comes back once, listed with the refunds
{
  const w = farm({ 'eggs.animals': 4, 'eggs.worker': 1, 'eggs.machine': 1 });
  const old = serialize(w, Date.now());
  delete old.rt;
  const a = new SimWorld(3);
  restore(a, migrate(JSON.parse(JSON.stringify(old)))!);
  const line = a.refunds.find((l) => l.id === 'eggs.worker');
  ok(!!line && line.retired === true && a.money === old.money + line.amount, `an old save gets its egg worker back (+${line?.amount})`);
  const b = new SimWorld(3);
  restore(b, migrate(JSON.parse(JSON.stringify(serialize(a, Date.now()))))!);
  ok(!b.refunds.some((l) => l.retired) && b.money === a.money, 'and only once');
  ok(b.staff.workers.filter((k) => k.job.key === 'eggs').length === 0, 'no egg workers come back on load');
}

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall belt checks passed');
