/**
 * Headless scenario checks: runs each event on a grown farm and asserts goals, teardown and saves.
 *
 *   npm run eventcheck            all cases
 *   npm run eventcheck -- storm   one scenario id (plus the shared cases)
 */
import { SimWorld } from '../src/sim/world';
import { SCENARIOS, type ScenarioDef } from '../src/config/scenarios';
import { serialize, restore, migrate, type SaveData } from '../src/sim/save';
import { Bot } from '../src/sim/bot';

const DT = 1 / 30;
const only = process.argv[2];
let fails = 0;
const ok = (cond: boolean, msg: string): void => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) fails++;
};

/** A farm with most areas open: the active bot with plenty of money buys `n` upgrade levels. */
function grownSave(n = 160, seed = 7): SaveData {
  const w = new SimWorld(seed), bot = new Bot(w, 'active');
  for (let i = 0; i < 30 * 60 * 60 && w.upgrades.bought < n; i++) {
    w.money = Math.max(w.money, 1e9);
    bot.update(DT);
    w.tick(DT);
    w.events.drain(() => {});
  }
  w.money = 0;
  return serialize(w, 0);
}

const snapshot = JSON.stringify(grownSave());
export const fresh = (): SimWorld => {
  const w = new SimWorld(7);
  restore(w, migrate(JSON.parse(snapshot))!);
  return w;
};

export function tickFor(w: SimWorld, seconds: number, drive?: (w: SimWorld) => void): void {
  for (let i = 0; i < seconds / DT; i++) { drive?.(w); w.tick(DT); w.events.drain(() => {}); }
}

/** Run until the event is over (or maxSec). */
export function runUntilIdle(w: SimWorld, drive?: (w: SimWorld) => void, maxSec = 400): void {
  for (let i = 0; i < maxSec / DT && w.scenario.phase !== 'idle'; i++) { drive?.(w); w.tick(DT); w.events.drain(() => {}); }
}

const goalOk = (w: SimWorld, g: string): boolean | undefined => w.scenario.lastGoals.find((x) => x.goal === g)?.ok;

// ---- shared cases, every scenario ----
const base = fresh();
console.log(`grown farm: ${base.upgrades.bought} upgrades, café ${base.cafe.open ? 'open' : 'closed'}`);
for (const def of SCENARIOS) {
  if (only && def.id !== only) continue;
  if (def.when && !def.when(base)) { console.log(`SKIP  ${def.id}: not available on the test farm`); continue; }
  {
    const w = fresh();
    w.scenario.trigger(def.id);
    runUntilIdle(w);
    ok(w.scenario.phase === 'idle' && w.scenario.lastGoals.length === def.goals.length, `${def.id}: ends and evaluates every goal`);
  }
  {
    const w = fresh();
    w.scenario.trigger(def.id);
    tickFor(w, 20);
    w.away = true; w.tick(DT); w.away = false;
    ok(w.scenario.phase === 'idle' && !w.scenario.powerCut, `${def.id}: time away tears the event down`);
  }
  {
    const w = fresh();
    const before = w.money + w.cash.value;
    const animals = w.stations.map((s) => s.animals.length).join();
    w.scenario.trigger(def.id);
    tickFor(w, 20);
    const w2 = new SimWorld(7);
    restore(w2, migrate(JSON.parse(JSON.stringify(serialize(w, 0))))!);
    ok(w2.scenario.phase === 'idle' && w2.stations.map((s) => s.animals.length).join() === animals, `${def.id}: save mid-event restores clean`);
    ok(w2.money + w2.cash.value >= before, `${def.id}: save mid-event loses no money`);
  }
}

// ---- twists and star grades ----
if (!only || only === 'trump') {
  const w = fresh();
  w.scenario.trigger('trump');
  let twists = 0, stars = -1;
  for (let i = 0; i < 400 / DT && w.scenario.phase !== 'idle'; i++) {
    w.tick(DT);
    w.events.drain((e) => { if (e.type === 'scenarioTwist') twists++; if (e.type === 'scenarioEnd') stars = e.id; });
  }
  ok(twists === 2, `trump: changes his order twice (got ${twists})`);
  ok(stars === 0 && w.scenario.stars === 0, 'trump unattended: 0 stars');
}
{
  // a fully passed event earns at least one star and more money than the old flat reward
  const w = fresh();
  w.scenario.trigger('wedding');
  w.scenario.debugWin = true;
  let stars = -1;
  for (let i = 0; i < 400 / DT && w.scenario.phase !== 'idle'; i++) { w.tick(DT); w.events.drain((e) => { if (e.type === 'scenarioEnd') stars = e.id; }); }
  ok(stars >= 1 && stars <= 3, `forced win earns 1-3 stars (got ${stars})`);
}

// ---- availability: never pick an event whose area is locked ----
{
  const w = new SimWorld(1);
  w.upgrades.bought = 99;
  const pick = (w.scenario as unknown as { pick(): ScenarioDef | null }).pick.bind(w.scenario);
  let bad = '';
  for (let i = 0; i < 400; i++) {
    const d = pick();
    if (d && ((d.when && !d.when(w)) || (d.id === 'inspector' && !w.cafe.open))) bad = d.id;
  }
  ok(!bad, `fresh farm never picks a locked event${bad ? ` (picked ${bad})` : ''}`);
}

export { goalOk };

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall event checks passed');
