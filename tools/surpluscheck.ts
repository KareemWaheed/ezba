/**
 * Surplus checks: the wholesale trader buys part of a big counter surplus cheaply (the player at his truck, or
 * on his own with a deal), the incubator turns spare eggs into chicks and golden hens, and a big enough surplus
 * sets a record.
 *
 *   npm run surpluscheck
 */
import { SimWorld } from '../src/sim/world';
import { serialize, restore, migrate } from '../src/sim/save';
import { ECONOMY, type UpgradeId } from '../src/config/economy';
import { LAYOUT } from '../src/config/layout';

const DT = 1 / 30;
let fails = 0;
const ok = (cond: boolean, msg: string): void => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) fails++;
};
const L = LAYOUT.surplus, S = ECONOMY.surplus;

/** A farm with the coop and its worker; extra levels on top. */
function farm(extra: Partial<Record<UpgradeId, number>> = {}): SimWorld {
  const w = new SimWorld(9);
  const lv: Partial<Record<UpgradeId, number>> = { 'eggs.animals': 4, 'eggs.worker': 1, ...extra };
  for (const [k, v] of Object.entries(lv)) { w.upgrades.levels[k as UpgradeId] = v!; w.upgrades.bought += v!; }
  w.upgrades.apply(); w.upgrades.refresh();
  return w;
}
const egg = (w: SimWorld) => w.stations.find((s) => s.def.product === 'egg')!;
const run = (w: SimWorld, s: number, at?: { x: number; z: number }) => {
  for (let i = 0; i < s / DT; i++) { if (at) { w.player.x = at.x; w.player.z = at.z; } w.tick(DT); w.events.drain(() => {}); }
};
const away = { x: 6, z: 7 };
/** Run until the trader is parked (or `max` s). */
const untilParked = (w: SimWorld, max: number) => {
  for (let i = 0; i < max / DT && w.surplus.visit?.state !== 'parked'; i++) { w.player.x = away.x; w.player.z = away.z; w.tick(DT); w.events.drain(() => {}); }
};

// ---- the wholesale trader ----
{
  const w = farm(), e = egg(w);
  e.counter = 3000;
  untilParked(w, S.trader.every * 1.5);
  const v = w.surplus.visit;
  ok(!!v && v.product === 'egg' && v.want >= S.trader.minLoad && v.want <= 3100 * S.trader.share, `a big egg surplus brings the trader for part of it (${v?.product} x${v?.want})`);
  run(w, 5, away);
  ok(!!w.surplus.visit && w.surplus.visit.left === w.surplus.visit.want, 'he waits: nothing is loaded while the player is elsewhere');
  const want = w.surplus.visit!.want, price = w.surplus.traderPrice('egg');
  let sold = 0, got = 0;
  for (let i = 0; i < (S.trader.loadTime + 1) / DT; i++) {
    w.player.x = L.load.x; w.player.z = L.load.z;
    w.tick(DT);
    w.events.drain((ev) => { if (ev.type === 'trader' && ev.n === 2) { sold = ev.id; got = ev.value; } });
  }
  ok(sold === want && Math.abs(got - sold * price) <= sold * 0.01 + 2, `the player at the truck sells him the lot (${sold} eggs for ${got}, ${price.toFixed(2)} each)`);
  ok(price < ECONOMY.products.egg.price * w.priceMult * 0.5, 'he pays well under the shop price');
  run(w, 6, away);
  ok(!w.surplus.visit, 'then he drives off');
}
{
  const w = farm({ 'trader.deal': 1 }), e = egg(w);
  e.counter = 2000;
  untilParked(w, S.trader.every * 1.5);
  run(w, S.trader.loadTime + 2, away);
  ok(e.counter < 2000, `with a deal he loads on his own (${2000 - e.counter} eggs)`);
}
{
  const w = farm(), e = egg(w);
  e.counter = 100;
  run(w, S.trader.every * 2.5, away);
  ok(!w.surplus.visit, 'a small surplus never calls him');
  e.counter = 3000;
  w.away = true;
  for (let i = 0; i < (S.trader.every * 2.5) / DT; i++) w.tick(DT);
  w.away = false;
  ok(!w.surplus.visit, 'nor does time away');
}

// ---- the incubator ----
{
  const w = farm({ 'eggs.incubator': 1 }), e = egg(w), ic = S.incubator;
  e.counter = 1000;
  run(w, ic.batchTime + 3, away);
  ok(w.surplus.crate === ic.batch && e.counter <= 1000 - ic.batch * ic.perChick, `spare eggs hatch into chicks (${w.surplus.crate} chicks, ${1000 - e.counter} eggs used)`);
  // (just the reserve spare: the shop's own customers keep buying meanwhile)
  run(w, 0.2, L.incubator.crate);
  w.surplus.hatching = 0;
  const h0 = w.surplus.hatched;
  for (let i = 0; i < (ic.batchTime * 3) / DT; i++) {
    e.counter = ic.reserve + w.shopWants(e) + ECONOMY.cafe.counterReserve + 10;
    w.player.x = away.x; w.player.z = away.z;
    w.tick(DT); w.events.drain(() => {});
  }
  ok(w.surplus.hatched === h0 && w.surplus.hatching === 0, 'it leaves a reserve on the counter for the kitchen and the factory');
  w.surplus.crate = 10;
  const m0 = w.money, n = w.surplus.crate;
  run(w, 0.5, L.incubator.crate);
  ok(w.surplus.crate === 0 && Math.abs(w.money - m0 - n * w.surplus.chickPrice()) <= 1, `chicks sell at the crate (${n} for ${Math.round(w.money - m0)})`);
  // a big surplus over a while: the crate fills and stops; golden hens come every so many chicks
  e.counter = 50000;
  run(w, ic.batchTime * 12, away);
  ok(w.surplus.crate <= ic.crateMax, `the crate never overfills (${w.surplus.crate}/${ic.crateMax})`);
  for (let k = 0; k < 12; k++) run(w, ic.batchTime + 1, L.incubator.crate);
  ok(w.surplus.golden >= 1 && w.surplus.productMult('egg') > 1, `golden hens hatch and eggs sell for more (${w.surplus.golden} hens, x${w.surplus.productMult('egg').toFixed(2)})`);
  ok(w.surplus.productMult('milk') === 1, 'only eggs');
  const w2 = new SimWorld(1);
  restore(w2, migrate(JSON.parse(JSON.stringify(serialize(w, Date.now()))))!);
  ok(w2.surplus.golden === w.surplus.golden && w2.surplus.hatched === w.surplus.hatched, 'hens and hatch count survive a reload');
}

// ---- records ----
{
  const w = farm(), e = egg(w), need = S.records.egg.need;
  e.counter = need + 50;
  run(w, 1, away);
  ok(w.surplus.ready === 'egg', `with ${need} spare eggs a record is ready`);
  const m0 = w.money, pay = w.surplus.recordPay('egg');
  run(w, 0.5, L.record);
  ok(w.surplus.records.egg === 0, 'it takes holding still at the stand');
  run(w, S.records.hold + 0.5, L.record);
  ok(w.surplus.records.egg === 1 && e.counter <= 50 && w.money - m0 >= pay - 1, `the record uses the eggs and pays big (${Math.round(w.money - m0)})`);
  ok(pay > need * ECONOMY.products.egg.price * w.priceMult * 2, 'more than selling them one by one');
  ok(w.surplus.need('egg') > need, `the next egg record needs more (${w.surplus.need('egg')})`);
  const w2 = new SimWorld(1);
  restore(w2, migrate(JSON.parse(JSON.stringify(serialize(w, Date.now()))))!);
  ok(w2.surplus.records.egg === 1, 'records survive a reload');
  e.counter = 300;
  run(w, 1, away);
  ok(w.surplus.ready === null, 'a small surplus sets no record');
}

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall surplus checks passed');
