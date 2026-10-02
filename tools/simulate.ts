/**
 * Headless pacing simulator: runs the real sim code with a simulated player through daily
 * sessions and offline breaks, then prints when each upgrade gets bought.
 *
 *   npm run simulate                 timeline + targets, writes sim-out/pacing.html
 *   npm run simulate -- --days 5     simulate more days
 *   npm run simulate -- --check      exit 1 if a pacing target is missed
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { UPGRADES } from '../src/config/upgrades';
import { SimWorld } from '../src/sim/world';
import { Bot, type BotProfile } from '../src/sim/bot';
import { simulateAway } from '../src/sim/offline';
import { upgradeCost } from '../src/sim/upgrades';
import { PLAY, checkTargets, type Purchase, type RunResult } from './pacing';

const args = process.argv.slice(2);
const argVal = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const days = Number(argVal('--days') ?? PLAY.days);
const check = args.includes('--check');
const DT = 1 / 30;

function run(profile: BotProfile): RunResult {
  const w = new SimWorld(PLAY.seed);
  const bot = new Bot(w, profile);
  const purchases: Purchase[] = [];
  const curve: [number, number][] = [[0, 0]];
  let playSec = 0, offlineEarned = 0, day = 1;
  const onEvent = (e: { type: string; id: number; n: number }) => {
    if (e.type !== 'buy') return;
    const id = UPGRADES[e.id].id;
    purchases.push({ id, level: e.n, cost: upgradeCost(id, e.n - 1), playMin: playSec / 60, day });
  };
  for (day = 1; day <= days; day++) {
    for (let s = 0; s < PLAY.sessionsPerDay; s++) {
      const end = playSec + PLAY.sessionMinutes * 60;
      let nextSample = Math.ceil(playSec / 30) * 30;
      while (playSec < end) {
        bot.update(DT);
        w.tick(DT);
        playSec += DT;
        w.events.drain(onEvent);
        if (playSec >= nextSample) { curve.push([playSec / 60, w.stats.earned]); nextSample += 30; }
      }
      const hours = s === PLAY.sessionsPerDay - 1 ? PLAY.overnightHours : PLAY.breakHours;
      const earned = simulateAway(w, hours * 3600);
      offlineEarned += earned;
      w.stats.earned += earned;
      w.money += w.cash.value; // returning player grabs the cash pile
      w.cash.value = 0; w.cash.bills = 0;
      w.events.drain(onEvent);
    }
  }
  return { profile, purchases, curve, playMin: playSec / 60, offlineEarned };
}

const fmtMin = (m: number) => `${Math.floor(m)}:${String(Math.floor((m % 1) * 60)).padStart(2, '0')}`;

function printTimeline(r: RunResult): void {
  console.log(`\n=== ${r.profile.toUpperCase()} player: ${r.purchases.length} purchases in ${fmtMin(r.playMin)} play (${days} days) ===`);
  console.log(' #   play   day  upgrade              lvl    cost   gap');
  let prev = 0;
  r.purchases.forEach((p, i) => {
    const label = UPGRADES.find((u) => u.id === p.id)!.id;
    console.log(
      `${String(i + 1).padStart(2)}  ${fmtMin(p.playMin).padStart(6)}  ${String(p.day).padStart(3)}  ${label.padEnd(20)} ${String(p.level).padStart(3)}  ${String(p.cost).padStart(6)}  ${fmtMin(p.playMin - prev).padStart(5)}`,
    );
    prev = p.playMin;
  });
  console.log(`offline earned: ${Math.round(r.offlineEarned)}   lifetime earned: ${Math.round(r.curve.at(-1)?.[1] ?? 0)}`);
}

function chartHtml(runs: RunResult[]): string {
  const W = 760, H = 360, pad = 44;
  const maxX = Math.max(...runs.map((r) => r.playMin)), maxY = Math.max(1, ...runs.map((r) => r.curve.at(-1)![1]));
  const sx = (x: number) => pad + (x / maxX) * (W - pad * 2), sy = (y: number) => H - pad - (y / maxY) * (H - pad * 2);
  const colors: Record<string, string> = { active: '#2a78d6', idle: '#e8554e' };
  const lines = runs.map((r) => `<polyline fill="none" stroke="${colors[r.profile]}" stroke-width="2.5" points="${r.curve.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ')}"/>`).join('');
  const marks = runs[0].purchases.map((p) => `<line x1="${sx(p.playMin)}" x2="${sx(p.playMin)}" y1="${H - pad}" y2="${H - pad + 6}" stroke="#2a78d6"><title>${p.id} lv${p.level} @ ${fmtMin(p.playMin)}</title></line>`).join('');
  const ticks = Array.from({ length: 9 }, (_, i) => (maxX * i) / 8).map((x) => `<text x="${sx(x)}" y="${H - pad + 22}" text-anchor="middle">${Math.round(x)}m</text>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>Ezba pacing</title>
<style>body{font:14px system-ui;margin:24px;background:#fffdf5;color:#2b2a1f}text{font-size:12px;fill:#555}</style>
<h2>Lifetime earnings vs play time</h2>
<p><span style="color:#2a78d6">■ active</span> &nbsp; <span style="color:#e8554e">■ idle (automation only)</span> — ticks on the axis = active purchases (hover)</p>
<svg width="${W}" height="${H}"><line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="#999"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${H - pad}" stroke="#999"/>
<text x="${pad - 6}" y="${pad}" text-anchor="end">${Math.round(maxY)}</text>${ticks}${lines}${marks}</svg>`;
}

const t0 = Date.now();
const active = run('active');
const idle = run('idle');
printTimeline(active);
printTimeline(idle);

const results = checkTargets(active, idle);
console.log('\n=== Targets ===');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.detail})`);

mkdirSync('sim-out', { recursive: true });
writeFileSync('sim-out/pacing.html', chartHtml([active, idle]));
console.log(`\nchart: sim-out/pacing.html   (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
if (check && results.some((r) => !r.ok)) process.exit(1);
