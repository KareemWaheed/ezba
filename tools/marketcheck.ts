/**
 * Headless supermarket checks: the hand loop (order -> storeroom -> shelves -> checkout -> cash), farm
 * deliveries, a fully staffed store at steady state, saves and time away.
 *
 *   npm run marketcheck
 */
import { SimWorld } from '../src/sim/world';
import { FEATURES } from '../src/config/features';

// the store checks run with the supermarket on, whatever the game's switch says
FEATURES.supermarket = true;
import { ECONOMY, type UpgradeId } from '../src/config/economy';
import { MARKET, PRICE_TAGS, SHELVES } from '../src/config/market';
import { serialize, restore, migrate, legacyReset } from '../src/sim/save';
import { simulateAway } from '../src/sim/offline';
import { Bot } from '../src/sim/bot';
import { LAYOUT } from '../src/config/layout';
import { UPGRADE_BY_ID } from '../src/config/upgrades';
import { marketHint } from '../src/sim/guide';
import { upgradeCost } from '../src/sim/upgrades';

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

// ---- the supermarket-first game ----
{
  const w = new SimWorld(3, 'market'), m = w.market, up = w.upgrades;
  ok(m.open && m.shelves.filter((s) => s.open).every((s) => s.stock > 0), 'a supermarket game starts with an open, stocked store');
  ok(w.stations.every((s) => !s.open), 'the farm starts closed (the coop too)');
  const tiles = up.tiles.map((t) => t.def.id);
  ok(!tiles.includes('market.unlock') && !tiles.includes('cashier') && tiles.includes('market.cashier'), `store tiles from the start, no farm-shop tiles (${tiles.join(', ')})`);
  ok(up.cost('market.cashier') < 1000, `store upgrades are early-game prices here (cashier ${up.cost('market.cashier')})`);
  run(w, 120);
  ok(w.customers.list.length === 0 && m.shoppers.length > 0, 'no farm-shop customers, shoppers in the store');
  up.levels['market.cashier'] = 1;
  up.levels['eggs.unlock'] = 1;
  up.apply();
  up.refresh();
  ok(w.stations[0].open && up.tiles.some((t) => t.def.id === 'eggs.animals'), 'buying the coop opens the chickens');
  const w2 = new SimWorld(1, 'market');
  restore(w2, migrate(JSON.parse(JSON.stringify(serialize(w, Date.now()))))!);
  ok(w2.stations[0].open && w2.market.open && w2.upgrades.level('eggs.unlock') === 1, 'a supermarket save loads back');
  ok(!w.legacyMissing.some((d) => w.path.hidden.includes(d.id)), 'hidden tiles never block the 🏆 bigger ezba');
  for (const d of w.legacyMissing) w.upgrades.levels[d.id] = 1;
  const nx = new SimWorld(1, 'market');
  restore(nx, migrate(JSON.parse(JSON.stringify(legacyReset(w, Date.now())!)))!);
  ok(nx.mode === 'market' && nx.legacy === 1 && nx.market.open && !nx.stations[0].open, 'a bigger ezba stays a supermarket game');
}

// ---- price tags: dearer pays more per item but fewer shoppers want it; saved with the game ----
{
  const share = (tag: number) => {
    const w = farm({ 'market.unlock': 1 }), m = w.market;
    m.setPrice('rice', tag);
    let rice = 0, all = 0;
    for (let i = 0; i < 400; i++) {
      (m as unknown as { spawn(): void }).spawn();
      const c = m.shoppers.pop()!;
      for (const l of c.lines) { all += l.qty; if (l.product === 'rice') rice += l.qty; }
    }
    return { share: rice / all, price: m.sellPrice('rice') };
  };
  const cheap = share(0), normal = share(1), dear = share(3);
  ok(cheap.share > normal.share && normal.share > dear.share, `cheaper rice is wanted more (cheap ${(cheap.share * 100).toFixed(0)}%, normal ${(normal.share * 100).toFixed(0)}%, very dear ${(dear.share * 100).toFixed(0)}%)`);
  ok(dear.price > normal.price && normal.price > cheap.price, `and pays more per item when dear (${Math.round(cheap.price)} / ${Math.round(normal.price)} / ${Math.round(dear.price)})`);
  const w = farm({ 'market.unlock': 1 });
  w.market.setPrice('pasta', PRICE_TAGS.length - 1);
  w.market.setPrice('egg', 99);
  const w2 = new SimWorld(1);
  restore(w2, migrate(JSON.parse(JSON.stringify(serialize(w, Date.now()))))!);
  ok(w2.market.price.pasta === PRICE_TAGS.length - 1 && w2.market.price.egg === PRICE_TAGS.length - 1, 'price tags are clamped and saved');
}

// ---- locked until bought ----
{
  const w = farm({});
  ok(!w.market.open && w.market.shelves.every((s) => !s.open), 'store is closed until market.unlock');
  ok(!w.market.order('rice'), 'nothing can be ordered while closed');
}

// ---- the hand loop ----
{
  const w = farm(), m = w.market;
  // with stock in the store an order needs the money; an (almost) empty store gets supplier credit
  w.money = 0;
  m.store.pasta = ECONOMY.supermarket.creditBelow;
  ok(!m.order('rice'), 'an order needs the money while the store has stock');
  m.store.pasta = 0;
  ok(m.order('rice') && w.money < 0, `an empty store orders on credit (money ${Math.round(w.money)})`);
  ok(!m.order('rice') || w.money >= -ECONOMY.supermarket.creditMax * w.priceMult - m.boxCost('rice'), 'credit has a limit');
  m.incoming.length = 0;
  w.money = 1e6;
  const open = m.shelves.filter((s) => s.open).map((s) => s.def.item);
  ok(open.length === 5, `first shelf row opens with the store (${open.join(', ')})`);
  for (const it of open) m.order(it);
  ok(m.store.rice === 0 && m.incoming.length === 5, 'orders are on the way, not in the storeroom yet');
  // (wait clear of the upgrade tiles along the front: standing on one would buy it)
  at(w, 20, 24, ECONOMY.supermarket.deliveryTime + 0.5);
  ok(open.every((it) => m.store[it] === ECONOMY.supermarket.box), 'deliveries land in the storeroom');
  for (let k = 0; k < 4; k++) m.order('rice');
  ok(m.stocked('rice') <= ECONOMY.supermarket.storeMax && !m.canOrder('rice'), 'the storeroom caps what can be ordered');
  w.carry.items.length = 0;
  at(w, MARKET.store.x, MARKET.store.z, 1.5);
  ok(w.carry.n > 0 && new Set(w.carry.items).size === 5, `the storeroom hands out what the shelves need (${w.carry.items.join(',')})`);
  const held = w.carry.n, stocked0 = w.stats.marketStocked;
  for (const s of SHELVES.slice(0, 5)) at(w, s.front.x, s.front.z, 0.8);
  // (shoppers may buy some straight off the shelf meanwhile: count what went onto the shelves)
  ok(w.carry.n === 0 && w.stats.marketStocked - stocked0 === held, `standing at a shelf stocks it (${w.stats.marketStocked - stocked0} of ${held})`);
  const served0 = w.stats.marketServed;
  at(w, MARKET.checkout.serve.x, MARKET.checkout.serve.z, 90);
  ok(w.stats.marketServed - served0 >= 3 && m.cash.value > 0, `the player runs the checkout (${w.stats.marketServed - served0} paid)`);
  const money0 = w.money, cash = m.cash.value;
  at(w, MARKET.cash.x, MARKET.cash.z, 0.5);
  ok(m.cash.value === 0 && Math.abs(w.money - money0 - cash) < 1e-6, 'the checkout cash is collected');
  ok(w.upgrades.level('market.cashier') === 0, 'the hand loop ran without buying any store upgrade');
}

// ---- free deliveries from the farm ----
{
  const w = farm(), m = w.market, eggs = w.stations.find((s) => s.def.product === 'egg')!;
  eggs.counter = 30;
  ok(m.farmSpare('egg') > 0 && m.orderFromFarm('egg'), 'eggs can come from the farm');
  ok(eggs.counter === 20 && m.stocked('egg') === 10, `a farm delivery takes the farm's surplus (counter ${eggs.counter})`);
  ok(m.farmSpare('rice') === 0 && !m.orderFromFarm('rice'), 'wholesale goods never come from the farm');
}

// ---- stockers fetch farm products from the farm's surplus (no auto-reorder needed) ----
{
  const w = farm({ 'market.unlock': 1, 'market.stocker': 1 }), m = w.market, milk = w.stations.find((s) => s.def.product === 'milk')!;
  milk.counter = 40;
  run(w, ECONOMY.supermarket.deliveryTime + 30);
  ok(m.shelfFor('milk')!.stock > 0 && milk.counter < 40, `a stocker brings farm milk to the shelf (shelf ${m.shelfFor('milk')!.stock}, farm counter ${milk.counter})`);
  ok(m.stocked('rice') === 0, 'without auto-reorder nothing is bought');
}

// ---- saves never lose stock: stockers' hands and over-full baskets ----
{
  const w = farm({ 'market.unlock': 1, 'market.stocker': 2 }), m = w.market;
  m.store.rice = 30;
  m.store.pasta = 30;
  let carrying = 0;
  for (let i = 0; i < 20 / DT && carrying === 0; i++) {
    w.tick(DT);
    carrying = w.staff.workers.filter((x) => x.job.key.startsWith('market.stock')).reduce((a, x) => a + x.carry.n, 0);
  }
  const stock = (x: SimWorld) => x.market.shelves.reduce((a, s) => a + s.stock, 0) + Object.values(x.market.store).reduce((a, n) => a + n, 0);
  const inBaskets = m.shoppers.reduce((a, c) => a + (c.state !== 'leave' ? c.got.length : 0), 0);
  // a full shelf plus a basket from it (worst case for the "back on the shelf" save)
  m.shelfFor('rice')!.stock = ECONOMY.supermarket.shelfMax;
  m.shoppers.push({ id: 999, look: 1, type: 'normal', x: 20, z: 20, rot: 0, speed: 0, state: 'queue', lines: [], li: 0, got: ['rice', 'rice', 'rice'], scanned: 0, waitT: 0, takeT: 0, patience: 50, patienceMax: 70, gone: false });
  const w2 = new SimWorld(1);
  restore(w2, migrate(JSON.parse(JSON.stringify(serialize(w, Date.now()))))!);
  ok(carrying > 0 && stock(w2) >= stock(w) + carrying + inBaskets + 3, `a save mid-trip keeps every item (carrying ${carrying}, saved ${stock(w2)})`);
  // buildings belong to their world: a fresh world has none of this store's walls or shelves
  ok(new SimWorld(2).solids.length < w.solids.length, 'another world never collides with this world\'s store');
}

// ---- items put back are never lost: an unhappy shopper's basket when the shelf has been refilled ----
{
  const w = farm(), m = w.market, rice = m.shelfFor('rice')!;
  rice.stock = ECONOMY.supermarket.shelfMax;
  m.store.rice = ECONOMY.supermarket.storeMax;
  m.shoppers.push({ id: 998, look: 1, type: 'normal', x: 14.2, z: 26.4, rot: 0, speed: 0, state: 'queue', lines: [], li: 0, got: ['rice', 'rice'], scanned: 0, waitT: 0, takeT: 0, patience: 0.01, patienceMax: 70, gone: false });
  run(w, 0.2);
  ok(rice.stock + m.store.rice === ECONOMY.supermarket.shelfMax + ECONOMY.supermarket.storeMax + 2, `an unhappy shopper's basket goes back somewhere (shelf ${rice.stock}, storeroom ${m.store.rice})`);
}

// ---- the active bot reaches and buys every store tile from the yard (routing round walls and shelves) ----
{
  const w = farm({}), bot = new Bot(w, 'active');
  w.player.x = LAYOUT.spawn.x;
  w.player.z = LAYOUT.spawn.z;
  for (let i = 0; i < 20 * 60 / DT && w.upgrades.level('market.auto') === 0; i++) { w.money = Math.max(w.money, 1e9); bot.update(DT); w.tick(DT); w.events.drain(() => {}); }
  const ids: UpgradeId[] = ['market.unlock', 'market.shelves', 'market.cashier', 'market.stocker', 'market.ads', 'market.auto'];
  ok(ids.every((id) => w.upgrades.level(id) > 0), `the bot buys every store upgrade (${ids.map((id) => `${id.slice(7)} ${w.upgrades.level(id)}`).join(', ')})`);
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

// the café always pays more for a dish than the supermarket sells it for
for (const p of MARKET.products) {
  if (!(p.item in ECONOMY.dishes)) continue;
  const cafe = ECONOMY.dishes[p.item as keyof typeof ECONOMY.dishes].price;
  ok(cafe > PRICE_TAGS[PRICE_TAGS.length - 1].mult * p.sell, `café ${p.name} (${cafe}) pays more than the store, even at its dearest (${Math.round(PRICE_TAGS[PRICE_TAGS.length - 1].mult * p.sell)})`);
}

// price tags change how many shoppers come: cheap fills the store, dear empties it
{
  const w = farm({ 'market.unlock': 1 }), m = w.market, base = m.interval;
  for (const s of m.shelves) if (s.open) m.setPrice(s.def.item, 0);
  const cheap = m.interval;
  for (const s of m.shelves) if (s.open) m.setPrice(s.def.item, 3);
  const dear = m.interval;
  ok(cheap < base * 0.7 && dear > base * 2, `cheap tags bring shoppers faster, dear slower (every ${cheap.toFixed(1)}s / ${base.toFixed(1)}s / ${dear.toFixed(1)}s)`);
}

// families: long lists, and they tip the player who checks them out
{
  const w = farm({ 'market.unlock': 1, 'market.shelves': 2, 'market.cashier': 1 }), m = w.market;
  let fam = 0, famItems = 0, other = 0, otherItems = 0;
  for (let i = 0; i < 600; i++) {
    (m as unknown as { spawn(): void }).spawn();
    const c = m.shoppers.pop()!, n = c.lines.reduce((a, l) => a + l.qty, 0);
    if (c.family) { fam++; famItems += n; } else { other++; otherItems += n; }
  }
  ok(fam > 30 && famItems / fam > 1.8 * (otherItems / other), `families come now and then with much longer lists (${fam}/600, ${(famItems / fam).toFixed(1)} vs ${(otherItems / other).toFixed(1)} items)`);
}

// rush hour (once there's a cashier, into stocked shelves): comes on its own, shoppers come much faster, then it ends
{
  const w = farm({ 'market.unlock': 1, 'market.cashier': 1 }), m = w.market, normal = m.interval;
  let started = 0, ended = 0, fast = Infinity;
  // bare shelves: no rush yet
  run(w, ECONOMY.supermarket.rush.first + 5);
  ok(m.rushT === 0, 'no rush hour into bare shelves');
  for (let i = 0; i < (ECONOMY.supermarket.rush.time + 40) / DT; i++) {
    for (const s of m.shelves) if (s.open) s.stock = Math.max(s.stock, 6);
    w.tick(DT);
    if (m.rushT > 0) fast = Math.min(fast, m.interval);
    w.events.drain((e) => { if (e.type === 'storeRush') { if (e.n) started++; else ended++; } });
  }
  ok(started === 1 && ended === 1 && fast < normal / 2, `a rush hour comes, brings shoppers ${(normal / fast).toFixed(1)}x as fast, and ends`);
}

// store board hints and the order-everything button
{
  const w = farm({ 'market.unlock': 1 }), m = w.market, D = MARKET.desk;
  w.money = 1e6;
  at(w, D.x, D.z, 0.1);
  ok(marketHint(w) === 'order', `empty store: the board says order (${marketHint(w)})`);
  const open = m.shelves.filter((s) => s.open);
  const n = m.restockAll();
  ok(n === open.length && open.every((s) => !m.needsBox(s.def.item)), `one tap orders a box for every empty shelf (${n}/${open.length})`);
  ok(m.restockAll() === 0, 'a second tap orders nothing more');
  ok(marketHint(w) === 'coming', `then: on its way (${marketHint(w)})`);
  at(w, D.x, D.z, ECONOMY.supermarket.deliveryTime + 1);
  ok(marketHint(w) === 'fetch', `delivered: fetch it to the shelves (${marketHint(w)})`);
  const S = MARKET.store;
  at(w, S.x, S.z, 3);
  ok(w.carry.n > 0 && marketHint(w) === 'stock', `carrying: stock the shelf (${marketHint(w)})`);
  m.shoppers.push({ id: 999, look: 1, type: 'normal', x: 0, z: 0, rot: 0, speed: 0, state: 'queue', lines: [], li: 0, got: ['rice'], scanned: 0, waitT: 0, takeT: 0, patience: 90, patienceMax: 90, gone: false });
  ok(marketHint(w) === 'checkout', `someone in line and no cashier: go to the checkout (${marketHint(w)})`);
}

// price drops: a save from before them gets the difference back once (not for prices that went up)
{
  const w = new SimWorld(5);
  const up = w.upgrades;
  up.levels['eggs.animals'] = 12; up.levels['cafe.helper'] = 1; up.levels['field.driver'] = 1;
  up.paid['eggs.animals'] = 0;
  const old = JSON.parse(JSON.stringify(serialize(w, Date.now())));
  delete old.pv;
  old.money = 1000;
  let want = 0;
  for (let l = 0; l < 12; l++) want += Math.round(40 * 1.55 ** l) - Math.round(40 * 1.4 ** l);
  want += 30000 - 15000;
  const a = new SimWorld(1);
  restore(a, migrate(old)!);
  const got = a.refunds.reduce((s, l) => s + l.amount, 0);
  ok(got === want && a.money === 1000 + want, `an old save gets the price drops back (${got} of ${want}, money ${a.money})`);
  ok(!a.refunds.some((l) => l.id === 'field.driver') && a.refunds.some((l) => l.id === 'eggs.animals'), 'only for what got cheaper (no charge for the dearer drivers)');
  const b = new SimWorld(1);
  restore(b, migrate(JSON.parse(JSON.stringify(serialize(a, Date.now()))))!);
  ok(b.refunds.length === 0 && b.money === a.money, 'given once: the next load gives nothing');
  // paid toward the next level beyond its new price: the rest comes back and the level completes on the next step
  const c = JSON.parse(JSON.stringify(old));
  c.paid['eggs.animals'] = Math.round(40 * 1.55 ** 12) - 5;
  const d = new SimWorld(1);
  restore(d, migrate(c)!);
  const next = d.upgrades.cost('eggs.animals');
  ok(d.upgrades.paid['eggs.animals'] === next && d.refunds.reduce((s, l) => s + l.amount, 0) === want + (c.paid['eggs.animals'] - next), 'a part-paid level: the payment beyond its new price comes back');
  // the supermarket game: its own cost multipliers, old and new
  const m = new SimWorld(1, 'market');
  m.upgrades.levels['eggs.unlock'] = 1; m.upgrades.levels['eggs.expand'] = 1;
  const ms = JSON.parse(JSON.stringify(serialize(m, Date.now())));
  delete ms.pv;
  const m2 = new SimWorld(1, 'market');
  restore(m2, migrate(ms)!);
  ok(m2.refunds.find((l) => l.id === 'eggs.expand')?.amount === 5000 - Math.round(3500 * 0.5), `the supermarket game is refunded at its own prices (${m2.refunds.map((l) => `${l.id} ${l.amount}`).join(', ')})`);
  // a brand-new game has nothing to get back
  const n = new SimWorld(1);
  restore(n, migrate(JSON.parse(JSON.stringify(serialize(new SimWorld(2), Date.now()))))!);
  ok(n.refunds.length === 0, 'a new game gets no refund');
}

// 'on its way' only when the low shelf's own product is coming, not any box
{
  // a box for a well-stocked shelf (pasta) is on its way; the other shelves are bare and no box can be had
  // for them (no money, no farm surplus, too much stock for supplier credit): nothing is coming for them
  const w = farm({ 'market.unlock': 1 }), m = w.market, D = MARKET.desk;
  at(w, D.x, D.z, 0.1);
  w.money = 0;
  m.cash.value = 0;
  for (const st of w.stations) { st.counter = 0; st.pile = 0; }
  m.shelfFor('pasta')!.stock = ECONOMY.supermarket.shelfMax;
  m.incoming.push({ item: 'pasta', n: ECONOMY.supermarket.box, t: 60 });
  const bare = m.shelves.filter((s) => m.low(s));
  ok(bare.length > 0 && bare.every((s) => !m.canGetBox(s.def.item)) && m.totalStock >= ECONOMY.supermarket.creditBelow, 'setup: bare shelves, no box to be had for them');
  ok(marketHint(w) === 'order', `a box for another shelf doesn't count as "on its way" for the bare ones (${marketHint(w)})`);
}

// supermarket-first game: the farm's goods reach the store by themselves (free), stockers push a trolley
{
  const w = new SimWorld(3, 'market'), up = w.upgrades;
  up.levels['eggs.unlock'] = 1; up.levels['milk.unlock'] = 1; up.levels['market.cashier'] = 1; up.levels['market.stocker'] = 1;
  up.apply(); up.refresh();
  const eggs = w.stations[0], milk = w.stations[1], m = w.market;
  eggs.counter = 40; milk.pile = ECONOMY.pile.max; milk.counter = 0;
  for (const k of Object.keys(m.store)) m.store[k as keyof typeof m.store] = 0;
  m.incoming.length = 0;
  w.money = 0;
  run(w, ECONOMY.supermarket.pileIdle + 20);
  ok(m.store.egg + m.stocked('egg') > 0 && m.stocked('milk') > 0 && w.money >= 0, `the farm's eggs (counter) and a milk pile nobody collects go to the store for free (egg ${m.stocked('egg')}, milk ${m.stocked('milk')}, milk pile ${milk.pile})`);
  ok(w.staff.workers.filter((x) => x.job.key.startsWith('market.stock')).every((x) => x.carry.cap >= ECONOMY.supermarket.stockerCapacity), 'stockers carry a trolley load');
}

// switched off (as in the game now): a save that built the store gets its spend back and the store stays shut
{
  const w = farm({ 'market.unlock': 1, 'market.shelves': 3, 'market.cashier': 1 });
  w.market.cash.value = 120;
  const saved = JSON.parse(JSON.stringify(serialize(w, Date.now())));
  FEATURES.supermarket = false;
  const w2 = new SimWorld(1);
  restore(w2, migrate(saved)!);
  w2.upgrades.apply();
  let spent = 0;
  for (const [id, n] of [['market.unlock', 1], ['market.shelves', 3], ['market.cashier', 1]] as const) for (let l = 0; l < n; l++) spent += upgradeCost(id, l);
  ok(!w2.market.open && w2.upgrades.level('market.unlock') === 0, 'switched off: a saved store stays shut');
  ok(w2.money === saved.money + spent + 120 && w2.market.cash.value === 0, `switched off: every store upgrade and the cash pile come back (${Math.round(w2.money - saved.money)} of ${spent + 120})`);
  ok(w2.upgrades.hidden('market.unlock') && !w2.upgrades.available(UPGRADE_BY_ID.get('market.unlock')!), 'switched off: its tiles are hidden');
  FEATURES.supermarket = true;
}

console.log(fails ? `\n${fails} failed` : '\nall market checks passed');
process.exit(fails ? 1 : 0);
