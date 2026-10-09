/**
 * Headless pacing simulator: runs the real sim code with a simulated efficient player through
 * daily sessions and offline breaks, then prints when each upgrade gets bought.
 *
 *   npm run simulate                 timeline + targets, writes sim-out/pacing.html
 *   npm run simulate -- --days 5     simulate more days
 *   npm run simulate -- --check      exit 1 if a pacing target is missed
 *   npm run simulate -- --easy       easy mode (its own targets: a casual player buys everything in 2 days)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { UPGRADES } from '../src/config/upgrades';
import { SimWorld } from '../src/sim/world';
import { Bot, type BotProfile } from '../src/sim/bot';
import { simulateAway } from '../src/sim/offline';
import { PLAY, checkTargets, checkEasyTargets, type Purchase, type RunResult, type SessionStat } from './pacing';

const args = process.argv.slice(2);
const argVal = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const days = Number(argVal('--days') ?? (args.includes('--easy') ? PLAY.easyDays : PLAY.days));
const check = args.includes('--check');
const easy = args.includes('--easy');
const verbose = args.includes('--verbose');
const DT = 1 / 30;

/** Upgrade levels this game still offers (every track not hidden on its path, up to its max). */
function levelsLeft(w: SimWorld): number {
  let n = 0;
  for (const d of UPGRADES) if (!w.upgrades.hidden(d.id)) n += Math.max(0, w.upgrades.maxOf(d.id) - w.upgrades.level(d.id));
  return n;
}
function leftIds(w: SimWorld): string[] {
  return UPGRADES.filter((d) => !w.upgrades.hidden(d.id) && !w.upgrades.maxed(d.id)).map((d) => `${d.id} ${w.upgrades.level(d.id)}/${w.upgrades.maxOf(d.id)}`);
}

function run(profile: BotProfile): RunResult {
  const w = new SimWorld(PLAY.seed);
  w.easy = easy;
  w.upgrades.refresh();
  let doneMin: number | undefined, doneDay: number | undefined, events = 0;
  const bot = new Bot(w, profile);
  const purchases: Purchase[] = [];
  const sessions: SessionStat[] = [];
  const curve: [number, number][] = [[0, 0]];
  let playSec = 0, offlineEarned = 0, day = 1;
  const money = { shopSales: 0, cafeSales: 0, tips: 0, rush: 0, golden: 0, trucks: 0, crops: 0 };
  const onEvent = (e: { type: string; id: number; n: number; value: number }) => {
    if (e.type === 'paid') money.shopSales += e.value;
    else if (e.type === 'cafePaid') money.cafeSales += e.value;
    else if (e.type === 'tip') money.tips += e.value;
    else if (e.type === 'rushEnd') money.rush += e.value;
    else if (e.type === 'goldenCaught') money.golden += e.value;
    else if (e.type === 'truckDone') money.trucks += e.value;
    else if (e.type === 'cropSold' || e.type === 'goldenStalk') money.crops += e.value;
    if (e.type === 'scenarioStart') events++;
    if (e.type !== 'buy') return;
    const id = UPGRADES[e.id].id;
    purchases.push({ id, level: e.n, cost: w.upgrades.costAt(id, e.n - 1), playMin: playSec / 60, day });
    if (doneMin === undefined && levelsLeft(w) === 0) { doneMin = playSec / 60; doneDay = day; }
  };
  for (day = 1; day <= days; day++) {
    for (let s = 0; s < PLAY.sessionsPerDay; s++) {
      const ticks = Math.round((PLAY.sessionMinutes * 60) / DT);
      const earned0 = w.stats.earned;
      const st0 = { ...w.stats };
      for (const k in money) money[k as keyof typeof money] = 0;
      let nextSample = Math.ceil(playSec / 30) * 30;
      for (let i = 0; i < ticks; i++) {
        bot.update(DT);
        w.tick(DT);
        playSec += DT;
        w.events.drain(onEvent);
        if (playSec >= nextSample) { curve.push([playSec / 60, w.stats.earned]); nextSample += 30; }
      }
      const activePerMin = (w.stats.earned - earned0) / PLAY.sessionMinutes;
      const detail = {
        shopServed: w.stats.served - st0.served, cafeServed: w.stats.cafeServed - st0.cafeServed, angry: w.stats.angry - st0.angry,
        shopSales: money.shopSales, cafeSales: money.cafeSales, tips: money.tips, rush: money.rush, golden: money.golden, trucks: money.trucks, crops: money.crops, rating: w.service.rating,
      };
      const hours = s === PLAY.sessionsPerDay - 1 ? PLAY.overnightHours : PLAY.breakHours;
      const away = simulateAway(w, hours * 3600);
      offlineEarned += away.earned;
      w.events.drain(onEvent);
      sessions.push({ day, session: s + 1, endMin: playSec / 60, activePerMin, autoPerMin: away.raw / (away.seconds / 60), offline: away.earned, detail });
    }
  }
  return { profile, purchases, sessions, curve, playMin: playSec / 60, offlineEarned, events, left: levelsLeft(w), leftIds: leftIds(w), doneMin, doneDay };
}

const fmtMin = (m: number) => `${Math.floor(m)}:${String(Math.floor((m % 1) * 60)).padStart(2, '0')}`;

function printTimeline(r: RunResult): void {
  console.log(`\n=== ${r.profile === 'casual' ? 'Casual' : 'Efficient'} player: ${r.purchases.length} purchases in ${fmtMin(r.playMin)} play (${days} days) ===`);
  console.log(' #   play   day  upgrade              lvl    cost    gap');
  let prev = 0;
  r.purchases.forEach((p, i) => {
    console.log(
      `${String(i + 1).padStart(2)}  ${fmtMin(p.playMin).padStart(6)}  ${String(p.day).padStart(3)}  ${p.id.padEnd(20)} ${String(p.level).padStart(3)}  ${String(p.cost).padStart(6)}  ${fmtMin(p.playMin - prev).padStart(5)}`,
    );
    prev = p.playMin;
  });
  console.log('\nsession  ends   active/min  automation/min  offline credited');
  for (const s of r.sessions) {
    console.log(`d${s.day} s${s.session}  ${fmtMin(s.endMin).padStart(6)}  ${String(Math.round(s.activePerMin)).padStart(10)}  ${String(Math.round(s.autoPerMin)).padStart(14)}  ${String(Math.round(s.offline)).padStart(16)}`);
  }
  if (verbose) {
    console.log('\nsession  shopServed cafeServed angry  shop$   cafe$   tips  rush$ golden$ truck$ crop$ rating');
    for (const s of r.sessions) {
      const d = s.detail, f = (v: number, n: number) => String(Math.round(v)).padStart(n);
      console.log(`d${s.day} s${s.session}   ${f(d.shopServed, 8)} ${f(d.cafeServed, 10)} ${f(d.angry, 5)} ${f(d.shopSales, 6)} ${f(d.cafeSales, 7)} ${f(d.tips, 6)} ${f(d.rush, 6)} ${f(d.golden, 7)} ${f(d.trucks, 6)} ${f(d.crops, 6)} ${d.rating.toFixed(1).padStart(6)}`);
    }
  }
  console.log(`\noffline credited: ${Math.round(r.offlineEarned)}   lifetime earned: ${Math.round(r.curve.at(-1)?.[1] ?? 0)}`);
}

function chartHtml(r: RunResult): string {
  const W = 760, H = 360, pad = 48;
  const maxX = r.playMin, maxY = Math.max(1, r.curve.at(-1)![1]);
  const sx = (x: number) => pad + (x / maxX) * (W - pad * 2), sy = (y: number) => H - pad - (y / maxY) * (H - pad * 2);
  const line = `<polyline fill="none" stroke="#2a78d6" stroke-width="2.5" points="${r.curve.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ')}"/>`;
  const marks = r.purchases.map((p) => `<line x1="${sx(p.playMin)}" x2="${sx(p.playMin)}" y1="${H - pad}" y2="${H - pad + 7}" stroke="#2a78d6"><title>${p.id} lv${p.level} @ ${fmtMin(p.playMin)}</title></line>`).join('');
  const breaks = r.sessions.map((s) => `<line x1="${sx(s.endMin)}" x2="${sx(s.endMin)}" y1="${pad}" y2="${H - pad}" stroke="#ccc" stroke-dasharray="3 3"><title>offline +${Math.round(s.offline)}</title></line>`).join('');
  const ticks = Array.from({ length: 9 }, (_, i) => (maxX * i) / 8).map((x) => `<text x="${sx(x)}" y="${H - pad + 22}" text-anchor="middle">${Math.round(x)}m</text>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>Ezba pacing</title>
<style>body{font:14px system-ui;margin:24px;background:#fffdf5;color:#2b2a1f}text{font-size:12px;fill:#555}</style>
<h2>Lifetime earnings vs play time</h2>
<p>Ticks on the axis = purchases (hover). Dashed lines = offline breaks (hover for credited amount).</p>
<svg width="${W}" height="${H}">${breaks}<line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="#999"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${H - pad}" stroke="#999"/>
<text x="${pad - 6}" y="${pad}" text-anchor="end">${Math.round(maxY)}</text>${ticks}${line}${marks}</svg>`;
}

const t0 = Date.now();
const efficient = run('active');
const casual = run('casual');
printTimeline(efficient);
printTimeline(casual);
const result = casual;

const results = easy ? checkEasyTargets(efficient, casual) : checkTargets(efficient, casual);
for (const r of [efficient, casual]) console.log(`${r.profile}: ${r.events} events in ${fmtMin(r.playMin)} play; ${r.left} upgrade levels left${r.doneMin !== undefined ? `, all bought at ${fmtMin(r.doneMin)} (day ${r.doneDay})` : ''}${r.left ? `: ${r.leftIds.join(', ')}` : ''}`);
console.log('\n=== Targets ===');
for (const r of results) console.log(`${r.ok ? 'PASS' : r.pending ? 'TODO' : 'FAIL'}  ${r.name}  (${r.detail})${!r.ok && r.pending ? ` [pending: ${r.pending}]` : ''}`);

mkdirSync('sim-out', { recursive: true });
writeFileSync('sim-out/pacing.html', chartHtml(result));
console.log(`\nchart: sim-out/pacing.html   (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
if (check && results.some((r) => !r.ok && !r.pending)) process.exit(1);
