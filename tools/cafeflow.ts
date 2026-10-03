/**
 * Café flow check: start right when the café opens (no kitchen staff beyond the first helper,
 * no cleaner/waiter) and let a bot play for 10 minutes. Prints café served/angry per minute.
 * Run: npm run cafeflow -- [active|casual]
 */
import { SimWorld } from '../src/sim/world';
import { Bot, type BotProfile } from '../src/sim/bot';
import type { UpgradeId } from '../src/config/economy';

const profile = (process.argv[2] ?? 'casual') as BotProfile;
const DT = 1 / 30;
const w = new SimWorld(777);
const up = w.upgrades;
const start: [UpgradeId, number][] = [['eggs.animals', 6], ['eggs.worker', 1], ['cashier', 1], ['milk.unlock', 1], ['milk.animals', 3], ['cafe.unlock', 1]];
for (const [k, l] of start) { up.levels[k] = l; up.bought += l; }
up.apply();
up.tiles = [];
up.refresh();
w.stations[0].counter = 40;
w.stations[1].counter = 30;

let cafeAngry = 0;
const angry = w.service.angry.bind(w.service);
w.service.angry = (c) => { if ('table' in c) cafeAngry++; angry(c); };

const bot = new Bot(w, profile);
let served0 = 0, angry0 = 0;
console.log(`profile ${profile}`);
console.log('min  served  angry  queue  counter(omelette/coffee)  bought');
for (let min = 1; min <= 10; min++) {
  for (let t = 0; t < 60; t += DT) { bot.update(DT); w.tick(DT); }
  const c = w.cafe;
  const q = c.customers.filter((x) => x.state === 'queue').length;
  console.log(`${String(min).padStart(3)}  ${String(w.stats.cafeServed - served0).padStart(6)}  ${String(cafeAngry - angry0).padStart(5)}  ${String(q).padStart(5)}  ${String(c.counter.omelette).padStart(12)}/${c.counter.coffee}  ${up.bought}`);
  served0 = w.stats.cafeServed; angry0 = cafeAngry;
}
console.log(`total café served ${w.stats.cafeServed}, angry ${cafeAngry}`);
