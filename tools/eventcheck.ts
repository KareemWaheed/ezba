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
import type { StormMechanic } from '../src/sim/scenarios/storm';
import type { InspectorMechanic } from '../src/sim/scenarios/inspector';
import { FOOTBALL, type FootballMechanic } from '../src/sim/scenarios/football';
import type { CommentsMechanic } from '../src/sim/scenarios/comments';
import type { StageMechanic } from '../src/sim/scenarios/stage';
import type { ProcessionMechanic } from '../src/sim/scenarios/procession';
import type { BulkMechanic } from '../src/sim/scenarios/bulk';
import { LAYOUT } from '../src/config/layout';

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

// ---- storm: herd the escaped animals ----
if (!only || only === 'storm') {
  const w = fresh();
  w.scenario.trigger('storm');
  runUntilIdle(w);
  ok(goalOk(w, 'herd') === false, 'storm unattended: herd fails');
  ok(w.stations.every((s) => !s.paused), 'storm: no station left paused');
}
if (!only || only === 'storm') {
  const w = fresh();
  w.scenario.trigger('storm');
  let escaped = 0;
  runUntilIdle(w, (w) => {
    const m = w.scenario.mech as StormMechanic;
    escaped = Math.max(escaped, m.total ?? 0);
    const s = m.strays?.find((x) => !x.home);
    if (s) { w.player.x = s.x; w.player.z = s.z; }
  });
  ok(escaped >= 3, `storm: animals escape (${escaped})`);
  ok(goalOk(w, 'herd') === true, 'storm herded: herd passes');
}
if (!only || only === 'storm') {
  // the bot goes after strays on its own
  const w = fresh(), bot = new Bot(w, 'active');
  w.scenario.trigger('storm');
  runUntilIdle(w, () => bot.update(DT));
  ok(goalOk(w, 'herd') === true, 'storm: the active bot herds them back');
}

// ---- inspector: a walking checklist ----
if (!only || only === 'inspector') {
  const w = fresh();
  w.scenario.trigger('inspector');
  runUntilIdle(w);
  ok(goalOk(w, 'checkpoints') === false, 'inspector unattended: checkpoints fail');
}
if (!only || only === 'inspector') {
  // stand at whatever the event points at (fix, feed, clean happen by standing there)
  const w = fresh();
  w.scenario.trigger('inspector');
  let route = 0;
  runUntilIdle(w, (w) => {
    const m = w.scenario.mech as InspectorMechanic;
    route = Math.max(route, m.route?.length ?? 0);
    const t = m.botTarget?.(w);
    if (t) { w.player.x = t.x; w.player.z = t.z; }
  });
  ok(route >= 3, `inspector: route has checkpoints (${route})`);
  ok(goalOk(w, 'checkpoints') === true, 'inspector: everything fixed in time passes');
}
if (!only || only === 'inspector') {
  const w = fresh(), bot = new Bot(w, 'active');
  w.scenario.trigger('inspector');
  runUntilIdle(w, () => bot.update(DT));
  ok(goalOk(w, 'checkpoints') === true, 'inspector: the active bot passes');
}

// ---- football: Salah penalties, Messi dribble ----
/** Walk the player behind the ball (on the far side from `aim`) and push it toward `aim`. */
function dribbleTo(w: SimWorld, aim: { x: number; z: number }): void {
  const m = w.scenario.mech as FootballMechanic, b = m.ball;
  if (!b) return;
  // start on the pitch (it's on the customers' side of the counter)
  if (w.player.z < FOOTBALL.z0) { w.player.x = FOOTBALL.x0 + 0.3; w.player.z = FOOTBALL.kick.z; }
  const dx = aim.x - b.x, dz = aim.z - b.z, d = Math.hypot(dx, dz) || 1;
  const bx = b.x - (dx / d) * 0.55, bz = b.z - (dz / d) * 0.55;
  const p = w.player, px = bx - p.x, pz = bz - p.z, pd = Math.hypot(px, pz);
  // get behind the ball first (without touching it), then run through it
  if (pd > 0.25) { const k = Math.min(1, pd); w.input.x = (px / pd) * k; w.input.z = (pz / pd) * k; }
  else { w.input.x = dx / d; w.input.z = dz / d; }
}
for (const id of ['salah', 'messi'] as const) {
  if (only && only !== id) continue;
  {
    const w = fresh();
    w.scenario.trigger(id);
    runUntilIdle(w);
    ok(goalOk(w, 'goals') === false, `${id} unattended: goals fail`);
  }
  {
    const w = fresh();
    w.scenario.trigger(id);
    let scored = 0;
    runUntilIdle(w, (w) => {
      const m = w.scenario.mech as FootballMechanic;
      if (!m.ball) return;
      scored = m.scored;
      dribbleTo(w, m.nextAim(w));
    });
    w.input.x = w.input.z = 0;
    ok(scored >= 3, `${id}: a player following the aim scores 3 (${scored})`);
  }
}
if (!only || only === 'messi') {
  // straight at the goal, skipping the cones: nothing counts
  const w = fresh();
  w.scenario.trigger('messi');
  let scored = 0;
  runUntilIdle(w, (w) => {
    const m = w.scenario.mech as FootballMechanic;
    if (!m.ball) return;
    scored = m.scored;
    dribbleTo(w, FOOTBALL.goal);
  });
  w.input.x = w.input.z = 0;
  ok(scored === 0, `messi: skipping the cones scores nothing (${scored})`);
}

// ---- influencer: live comment requests ----
if (!only || only === 'influencer') {
  const w = fresh();
  w.scenario.trigger('influencer');
  runUntilIdle(w);
  ok(goalOk(w, 'likes') === false, 'influencer unattended: likes fail');
}
if (!only || only === 'influencer') {
  // serve at the lane whose front customer wants a requested product
  const w = fresh();
  w.scenario.trigger('influencer');
  let done = 0, total = 0;
  runUntilIdle(w, (w) => {
    const m = w.scenario.mech as CommentsMechanic;
    if (!m.requests) return;
    done = m.requests.filter((r) => r.done).length; total = m.requests.length;
    const t = m.botTarget(w) ?? { x: LAYOUT.shop.lanes[0].x, z: LAYOUT.shop.serveZ };
    w.player.x = t.x; w.player.z = t.z;
  });
  ok(total >= 3 && done >= 2, `influencer: requests come in and get filled (${done}/${total})`);
  ok(goalOk(w, 'likes') === true, `influencer: serving requests fills the likes (${w.scenario.likes})`);
}

// ---- Amr Diab: dance pads on the beat ----
if (!only || only === 'amrdiab') {
  const w = fresh();
  w.scenario.trigger('amrdiab');
  runUntilIdle(w);
  ok(goalOk(w, 'beatCombo') === false, 'amrdiab unattended: combo fails');
}
if (!only || only === 'amrdiab') {
  const w = fresh();
  w.scenario.trigger('amrdiab');
  let best = 0;
  runUntilIdle(w, (w) => {
    const m = w.scenario.mech as StageMechanic;
    if (!m.pads) return;
    best = m.best;
    const p = m.pads[m.lit];
    w.player.x = p.x; w.player.z = p.z;
  });
  ok(best >= 16, `amrdiab: always on the lit pad builds a long combo (${best})`);
  ok(goalOk(w, 'beatCombo') === true, 'amrdiab: combo goal passes');
}
if (!only || only === 'amrdiab') {
  const w = fresh();
  w.scenario.trigger('amrdiab');
  let best = 0;
  runUntilIdle(w, (w) => {
    const m = w.scenario.mech as StageMechanic;
    if (!m.pads) return;
    best = m.best;
    const p = m.pads[(m.lit + 1) % m.pads.length];
    w.player.x = p.x; w.player.z = p.z;
  });
  ok(best === 0, `amrdiab: the wrong pad never counts (${best})`);
}

// ---- presidents: timed delivery; Sisi's security gate; Macron's photo ----
/** Tick until the guest is waiting for their order. */
function untilOrder(w: SimWorld): void {
  for (let i = 0; i < 60 / DT && w.scenario.guest?.state !== 'order'; i++) { w.tick(DT); w.events.drain(() => {}); }
}
/** Put exactly the guest's order in the player's hands. */
function carryOrder(w: SimWorld): void {
  w.carry.items.length = 0;
  w.carry.cap = 99;
  for (const l of w.scenario.guest!.lines) for (let k = 0; k < l.left; k++) w.carry.push(l.product);
}
for (const id of ['president', 'macron', 'trump'] as const) {
  if (only && only !== id) continue;
  const w = fresh();
  w.scenario.trigger(id);
  runUntilIdle(w);
  ok(goalOk(w, 'inTime') === false, `${id} unattended: in-time fails`);
}
if (!only || only === 'president') {
  const w = fresh();
  w.scenario.trigger('president');
  untilOrder(w);
  carryOrder(w);
  const d = LAYOUT.vipStage.drop;
  w.player.x = d.x; w.player.z = d.z;
  tickFor(w, 4);
  ok(!w.scenario.guestServed, 'president: guards refuse an order that skipped the security gate');
  const g = LAYOUT.vipStage.gate;
  w.player.x = g.x; w.player.z = g.z;
  tickFor(w, 1);
  w.player.x = d.x; w.player.z = d.z;
  tickFor(w, 6);
  ok(w.scenario.guestServed, 'president: through the gate, the order is delivered');
  runUntilIdle(w);
  ok(goalOk(w, 'inTime') === true, 'president: quick delivery is in time');
}
if (!only || only === 'macron') {
  for (const pose of [false, true]) {
    const w = fresh();
    w.scenario.trigger('macron');
    untilOrder(w);
    carryOrder(w);
    const d = LAYOUT.vipStage.drop, ph = LAYOUT.vipStage.photo;
    w.player.x = d.x; w.player.z = d.z;
    runUntilIdle(w, (w) => { if (pose && w.scenario.guestServed) { w.player.x = ph.x; w.player.z = ph.z; } });
    ok(goalOk(w, 'photo') === pose, `macron: photo ${pose ? 'taken when standing on the marker' : 'missed when away from the marker'}`);
  }
}
if (!only || only === 'president') {
  const w = fresh(), bot = new Bot(w, 'active');
  w.scenario.trigger('president');
  runUntilIdle(w, () => bot.update(DT));
  ok(w.scenario.lastGoals.find((g) => g.goal === 'serveGuest')?.ok === true, 'president: the active bot gets through security and serves');
}

// ---- procession: wedding zaffa, Japanese tour ----
for (const id of ['wedding', 'japan'] as const) {
  if (only && only !== id) continue;
  {
    const w = fresh();
    w.scenario.trigger(id);
    runUntilIdle(w);
    ok(goalOk(w, 'trays') === false, `${id} unattended: trays fail`);
  }
  {
    // walk up to the next hungry guest with what they want in hand; pose at the tour photo
    const w = fresh();
    w.scenario.trigger(id);
    let served = 0, total = 0;
    runUntilIdle(w, (w) => {
      const m = w.scenario.mech as ProcessionMechanic;
      if (!m.guests) return;
      served = m.guests.filter((g) => g.served).length; total = m.guests.length;
      if (m.photoAt) { w.player.x = m.photoAt.x; w.player.z = m.photoAt.z; return; }
      const g = m.guests.find((x) => !x.served && x.x > -50);
      if (!g) return;
      if (!w.carry.has(g.want)) { w.carry.items.length = 0; w.carry.push(g.want); }
      w.player.x = g.x + 0.4; w.player.z = g.z;
    });
    ok(total >= 6 && served >= 6, `${id}: guests get served on the move (${served}/${total})`);
    ok(goalOk(w, 'trays') === true, `${id}: trays goal passes`);
    if (id === 'japan') ok(goalOk(w, 'photo') === true, 'japan: the group photo is taken');
  }
}

// ---- army: plan and fill a bulk order ----
if (!only || only === 'army') {
  const w = fresh();
  w.scenario.trigger('army');
  const m = w.scenario.mech as BulkMechanic;
  ok((m.order?.length ?? 0) > 0 && w.scenario.phase === 'warn', 'army: the order is known during the warning');
  runUntilIdle(w);
  ok(goalOk(w, 'bulkOrder') === false, 'army unattended: bulk order fails');
}
if (!only || only === 'army') {
  const w = fresh();
  w.scenario.trigger('army');
  const drop = LAYOUT.army.drop;
  runUntilIdle(w, (w) => {
    const m = w.scenario.mech as BulkMechanic;
    if (!m.order || w.scenario.phase !== 'active') return;
    const l = m.order.find((x) => x.left > 0);
    if (!l) return;
    if (!w.carry.has(l.product)) { w.carry.items.length = 0; for (let k = 0; k < 8; k++) w.carry.push(l.product); }
    w.player.x = drop.x; w.player.z = drop.z;
  });
  ok(goalOk(w, 'bulkOrder') === true, 'army: delivering everything passes');
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
