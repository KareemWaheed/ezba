/**
 * Headless supermarket checks: the hand loop (order -> storeroom -> shelves -> checkout -> cash), farm
 * deliveries, a fully staffed store at steady state, saves and time away.
 *
 *   npm run marketcheck
 */
import { SimWorld } from '../src/sim/world';
import { ECONOMY, type UpgradeId } from '../src/config/economy';
import { MARKET, SHELVES } from '../src/config/market';
import { serialize, restore, migrate } from '../src/sim/save';
import { simulateAway } from '../src/sim/offline';

const DT = 1 / 30;
let fails = 0;
const ok = (cond: boolean, msg: string): void => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) fails++;
};

/** A grown farm (everything but the store at max), with the store opened at the given levels. */
function farm(market: Partial<Record<UpgradeId, number>> = { 'market.unlock': 1 }): SimWorld {
  const w = new SimWorld(5), up = w.upgrades;
  for (const id of Object.keys(ECONOMY.upgrades) as UpgradeId[]) {
    up.levels[id] = id.startsWith('market.') ? market[id] ?? 0 : ECONOMY.upgrades[id].max;
    up.bought += up.levels[id];
  }
  up.apply();
  up.refresh();
  return w;
}
/** Stand at (x, z) for `s` seconds. */
const at = (w: SimWorld, x: number, z: number, s: number) => { for (let i = 0; i < s / DT; i++) { w.player.x = x; w.player.z = z; w.tick(DT); w.events.drain(() => {}); } };
const run = (w: SimWorld, s: number) => { for (let i = 0; i < s / DT; i++) { w.tick(DT); w.events.drain(() => {}); } };

// ---- locked until bought ----
{
  const w = farm({});
  ok(!w.market.open && w.market.shelves.every((s) => !s.open), 'store is closed until market.unlock');
  ok(!w.market.order('rice'), 'nothing can be ordered while closed');
}

// ---- the hand loop ----
{
  const w = farm(), m = w.market;
  w.money = 0;
  ok(!m.order('rice'), 'an order needs the money');
  w.money = 1e6;
  const open = m.shelves.filter((s) => s.open).map((s) => s.def.item);
  ok(open.length === 4, `first shelf row opens with the store (${open.join(', ')})`);
  for (const it of open) m.order(it);
  ok(m.store.rice === 0 && m.incoming.length === 4, 'orders are on the way, not in the storeroom yet');
  at(w, 20, 26, ECONOMY.supermarket.deliveryTime + 0.5);
  ok(open.every((it) => m.store[it] === ECONOMY.supermarket.box), 'deliveries land in the storeroom');
  for (let k = 0; k < 4; k++) m.order('rice');
  ok(m.stocked('rice') <= ECONOMY.supermarket.storeMax && !m.canOrder('rice'), 'the storeroom caps what can be ordered');
  w.carry.items.length = 0;
  at(w, MARKET.store.x, MARKET.store.z, 1.5);
  ok(w.carry.n > 0 && new Set(w.carry.items).size === 4, `the storeroom hands out what the shelves need (${w.carry.items.join(',')})`);
  for (const s of SHELVES.slice(0, 4)) at(w, s.front.x, s.front.z, 0.8);
  ok(w.carry.n === 0 && m.shelves.slice(0, 4).every((s) => s.stock > 0), 'standing at a shelf stocks it');
  const served0 = w.stats.marketServed;
  at(w, MARKET.checkout.serve.x, MARKET.checkout.serve.z, 90);
  ok(w.stats.marketServed - served0 >= 3 && m.cash.value > 0, `the player runs the checkout (${w.stats.marketServed - served0} paid)`);
  const money0 = w.money, cash = m.cash.value;
  at(w, MARKET.cash.x, MARKET.cash.z, 0.5);
  ok(m.cash.value === 0 && Math.abs(w.money - money0 - cash) < 1e-6, 'the checkout cash is collected');
}

// ---- free deliveries from the farm ----
{
  const w = farm(), m = w.market, eggs = w.stations.find((s) => s.def.product === 'egg')!;
  eggs.counter = 30;
  ok(m.farmSpare('egg') > 0 && m.orderFromFarm('egg'), 'eggs can come from the farm');
  ok(eggs.counter === 20 && m.stocked('egg') === 10, `a farm delivery takes the farm's surplus (counter ${eggs.counter})`);
  ok(m.farmSpare('rice') === 0 && !m.orderFromFarm('rice'), 'wholesale goods never come from the farm');
}

// ---- fully staffed store at steady state ----
{
  const w = farm({ 'market.unlock': 1, 'market.shelves': 2, 'market.cashier': 1, 'market.stocker': 2, 'market.ads': 3, 'market.auto': 1 });
  const m = w.market;
  w.money = 1e6;
  w.player.x = 0; w.player.z = 8;
  run(w, 300); // warm-up: the empty store fills
  const a0 = m.angry, s0 = w.stats.marketServed, c0 = m.cash.value, mo0 = w.money;
  let samples = 0, inShelf = 0;
  for (let i = 0; i < 300 / DT; i++) {
    w.tick(DT);
    w.events.drain(() => {});
    for (const c of m.shoppers) {
      samples++;
      for (const s of SHELVES) { const b = s.box; if (c.x > b.x0 + 0.1 && c.x < b.x1 - 0.1 && c.z > b.z0 + 0.1 && c.z < b.z1 - 0.1) inShelf++; }
    }
  }
  const served = w.stats.marketServed - s0, gross = m.cash.value - c0, spent = mo0 - w.money;
  ok(served >= 80, `staffed store serves shoppers on its own (${served} in 5 min)`);
  ok(m.angry - a0 === 0, `nobody leaves unhappy once it's running (${m.angry - a0})`);
  ok(gross > spent * 1.3, `it makes money (sales ${Math.round(gross)} vs orders ${Math.round(spent)})`);
  ok(inShelf / samples < 0.01, `shoppers walk the aisles, not through shelves (${((inShelf / samples) * 100).toFixed(2)}%)`);

  // save mid-shopping: shelf/storeroom stock survives (baskets go back on the shelves, deliveries land)
  const total = (x: SimWorld) => x.market.shelves.reduce((a, s) => a + s.stock, 0) + Object.values(x.market.store).reduce((a, n) => a + n, 0);
  const w2 = new SimWorld(1);
  restore(w2, migrate(JSON.parse(JSON.stringify(serialize(w, Date.now()))))!);
  w2.upgrades.apply();
  ok(w2.market.open && total(w2) >= total(w), `save keeps the stock (${total(w)} -> ${total(w2)})`);

  // time away: a staffed store earns while the player is gone (paid out with the rest, not left in its cash pile)
  const cash0 = m.cash.value, r = simulateAway(w, 600);
  ok(r.raw > 0 && m.cash.value === cash0, `time away counts the store's sales (${Math.round(r.raw)} raw in 10 min)`);
}

console.log(fails ? `\n${fails} failed` : '\nall market checks passed');
process.exit(fails ? 1 : 0);
