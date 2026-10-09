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
import { RIVER as LAYOUT_RIVER } from '../src/config/river';

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
  const lv: Partial<Record<UpgradeId, number>> = { 'eggs.animals': 4, 'eggs.worker': 1, 'surplus.yard': 1, ...extra };
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
  ok(w.surplus.records.egg === 0, 'it takes staying at the stand a moment');
  run(w, S.records.hold + 0.5, L.record);
  // (the egg worker may refill the counter meanwhile)
  ok(w.surplus.records.egg === 1 && e.counter < need + 50 && w.money - m0 >= pay - 1, `the record uses the eggs and pays big (${Math.round(w.money - m0)})`);
  ok(pay > need * ECONOMY.products.egg.price * w.priceMult * 2, 'more than selling them one by one');
  ok(w.surplus.need('egg') > need, `the next egg record needs more (${w.surplus.need('egg')})`);
  const w2 = new SimWorld(1);
  restore(w2, migrate(JSON.parse(JSON.stringify(serialize(w, Date.now()))))!);
  ok(w2.surplus.records.egg === 1, 'records survive a reload');
  e.counter = 300;
  run(w, 1, away);
  ok(w.surplus.ready === null, 'a small surplus sets no record');
  // walking up to the stand without enough: one hint with what's still needed
  const hints: { value: number; id: number }[] = [];
  for (let i = 0; i < 2 / DT; i++) {
    w.player.x = L.record.x; w.player.z = L.record.z; w.tick(DT);
    w.events.drain((ev) => { if (ev.type === 'record' && ev.n === 0) hints.push(ev); });
  }
  ok(hints.length === 1 && hints[0].id === w.surplus.need(w.surplus.closest()!.p) && hints[0].value < hints[0].id,
    `at the stand with too little: one hint (${hints[0]?.value}/${hints[0]?.id})`);
  ok(w.surplus.records.egg === 1, '...and nothing is taken');
}

// ---- seafood trucks at the river ----
{
  const T = ECONOMY.river.trucks;
  const w = farm({ 'river.unlock': 1 });
  ok(w.river.open, 'test farm: the river is open');
  w.river.pile = 35;
  for (let i = 0; i < (T.every * 2) / DT && w.river.truck?.state !== 'parked'; i++) { w.river.pile = Math.max(w.river.pile, 35); w.player.x = away.x; w.player.z = away.z; w.tick(DT); w.events.drain(() => {}); }
  const t = w.river.truck;
  ok(!!t && t.want === Math.min(T.maxLoad, 35), `a big fish pile brings a seafood truck (${t ? T.companies[t.company].name : '-'} wants ${t?.want})`);
  run(w, 3, away);
  ok(w.river.truck?.left === w.river.truck?.want, 'it waits for the player');
  const price = w.river.truckPrice();
  let sold = 0, got = 0;
  for (let i = 0; i < (T.loadTime + 1) / DT; i++) {
    w.player.x = LAYOUT_RIVER.truck.load.x; w.player.z = LAYOUT_RIVER.truck.load.z;
    w.tick(DT);
    w.events.drain((ev) => { if (ev.type === 'fishTruck' && ev.n === 2) { got = ev.value; sold = t!.want; } });
  }
  ok(sold > 0 && Math.abs(got - sold * price) <= 2, `the player loads it (${sold} fish for ${got})`);
  ok(price > ECONOMY.crops.fish.price * w.priceMult, 'it pays more than the fish stall');
  const w2 = farm({ 'river.unlock': 1, 'river.worker': 1 });
  w2.river.pile = 35;
  let loaded = 0;
  for (let i = 0; i < (T.every * 3) / DT && loaded === 0; i++) {
    w2.player.x = away.x; w2.player.z = away.z; w2.tick(DT); w2.events.drain(() => {});
    const tr = w2.river.truck;
    if (tr && tr.state === 'parked') loaded = Math.max(loaded, tr.want - tr.left);
  }
  ok(loaded > 0, `river workers load it on their own (${loaded} fish)`);
}

// the surplus yard: nothing of it before it's built; a save that already used the corner gets the yard
{
  const w = farm({ 'surplus.yard': 0 });
  egg(w).counter = 5000;
  run(w, 400, away);
  ok(!w.surplus.visit && w.surplus.ready === null, 'no trader and no record before the yard is built');
  ok(w.solids.some((b) => b.x1 === LAYOUT.surplusYard.box.x1 && b.z0 === LAYOUT.surplusYard.gate.z0), 'its gate is shut');
  const old = new SimWorld(1);
  const s = migrate(JSON.parse(JSON.stringify(serialize(farm({ 'surplus.yard': 0, 'eggs.incubator': 1 }), Date.now()))))!;
  restore(old, s);
  ok(old.upgrades.level('surplus.yard') === 1 && old.surplus.open, 'an older save with the incubator gets the yard');
  ok(!old.solids.some((b) => b.x1 === LAYOUT.surplusYard.box.x1 && b.z0 === LAYOUT.surplusYard.gate.z0), '...with its gate open');
  ok(old.bounds.x0 <= LAYOUT.surplusYard.unlockedX0, '...and the walkable area reaching it');
}

// bees: the apiary makes honey, its worker carries it to the counter, and shoppers buy it; five lanes with five cashiers
{
  const w = farm({ 'milk.unlock': 1, 'cafe.unlock': 1, 'honey.unlock': 1, 'honey.worker': 1, 'cashier': 5, 'shop.lanes': 4 });
  const h = w.stations.find((s) => s.def.product === 'honey')!;
  ok(h.open && h.animals.length === ECONOMY.producers.bee.start, `the apiary opens with ${h.animals.length} hives`);
  const sold0 = w.stats.sold;
  let made = 0, bought = 0;
  for (let i = 0; i < 240 * 30; i++) {
    w.player.x = 8; w.player.z = 8; w.input.x = w.input.z = 0; w.tick(1 / 30);
    w.events.drain((e) => { if (e.type === 'produce' && e.product === 'honey') made++; if (e.type === 'sell' && e.product === 'honey') bought++; });
  }
  ok(made > 50, `hives make honey (${made} jars in 4 min)`);
  ok(bought > 10 && w.stats.sold > sold0, `shoppers buy it off the counter (${bought} jars)`);
  ok(w.lanes === 5 && w.cashiers === 5, `five lanes, five cashiers (${w.lanes}/${w.cashiers})`);
  const lanesUsed = new Set(w.customers.list.map((c) => c.lane));
  ok(lanesUsed.size >= 4, `shoppers use the new lanes (${[...lanesUsed].sort().join(',')})`);
}

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall surplus checks passed');
