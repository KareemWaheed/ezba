/**
 * Progress transfer checks: a late-game save survives the text code and the QR code (drawn, then read
 * back with the same decoder the game uses on camera frames), old debug codes still load, bad codes
 * don't, and the QR stays small enough to scan off a phone screen.
 *
 *   npm run transfercheck
 */
import qrcode from 'qrcode-generator';
import jsQR from 'jsqr';
import { SimWorld } from '../src/sim/world';
import { serialize, restore } from '../src/sim/save';
import { ECONOMY, type UpgradeId } from '../src/config/economy';
import { SCENARIO_GAP } from '../src/config/scenarios';
import { textCode, qrCode, readCode, toBase45, fromBase45 } from '../src/transfer';
import { exportCode } from '../src/storage';

let fails = 0;
const ok = (cond: boolean, msg: string): void => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) fails++;
};

// base45 (RFC 9285 examples)
const enc = (s: string) => toBase45(new TextEncoder().encode(s));
ok(enc('AB') === 'BB8' && enc('Hello!!') === '%69 VD92EX0' && enc('base-45') === 'UJCLQE7W581', 'base45 matches the RFC examples');
ok(new TextDecoder().decode(fromBase45('QED8WEX0')!) === 'ietf!', 'base45 decodes the RFC example');
ok(fromBase45('GGW') === null, 'base45 rejects an out-of-range triple');

// easy mode: upgrades cost ECONOMY.easy.costMult, events come every eventGap, and it's saved; switching mid-game
{
  const n = new SimWorld(7), e = new SimWorld(7);
  e.setEasy(true);
  const id: UpgradeId = 'milk.unlock';
  ok(e.upgrades.cost(id) === Math.round(n.upgrades.cost(id) * ECONOMY.easy.costMult), `easy prices (${n.upgrades.cost(id)} -> ${e.upgrades.cost(id)})`);
  const back = new SimWorld(7);
  restore(back, JSON.parse(JSON.stringify(serialize(e, Date.now()))));
  const fresh = new SimWorld(7);
  // (an old save: written before easy mode, no `easy` field)
  const oldSave = serialize(n, Date.now());
  delete oldSave.easy;
  restore(fresh, JSON.parse(JSON.stringify(oldSave)));
  ok(back.easy && !fresh.easy, 'easy mode is saved (and an old save stays normal)');
  const G = ECONOMY.easy.eventGap;
  let gaps = 0, inRange = 0;
  for (let i = 0; i < 40; i++) { const t = (e.scenario as unknown as { gap(): number }).gap(); gaps++; if (t >= G.min && t <= G.max) inRange++; }
  ok(inRange === gaps && e.scenario.t <= G.max, `events every ${G.min}-${G.max} s in easy mode (next in ${Math.round(e.scenario.t)} s)`);
  const tE = e.scenario.t;
  const tile = e.upgrades.tiles.find((t) => t.def.id === 'eggs.animals');
  e.setEasy(false);
  ok(e.upgrades.cost('eggs.animals') === n.upgrades.cost('eggs.animals') && !!tile, 'switching back restores the normal prices');
  ok(Math.abs(e.scenario.t - tE * SCENARIO_GAP.max / G.max) < 1e-6 && e.scenario.t >= SCENARIO_GAP.min * (G.min / G.max), `...and the next event moves back out (${Math.round(tE)} -> ${Math.round(e.scenario.t)} s)`);
}

// a late-game farm: every track maxed, money, stats, a full album page's worth of state
const w = new SimWorld(42);
for (const id of Object.keys(ECONOMY.upgrades) as UpgradeId[]) if (!id.startsWith('market.')) w.upgrades.levels[id] = ECONOMY.upgrades[id].max;
w.upgrades.apply();
w.money = 12_345_678.9;
w.legacy = 2;
for (const k of Object.keys(w.stats) as (keyof typeof w.stats)[]) w.stats[k] = 98765;
for (let i = 0; i < 30 * 60 * 10; i++) w.tick(1 / 30);
const save = serialize(w, Date.now());
// (the whole save, field for field: migrate leaves a current-version save as it is)
const same = (s: typeof save | null): boolean => !!s && JSON.stringify(s) === JSON.stringify(save);

void (async () => {
  const text = await textCode(save);
  console.log(`save ${JSON.stringify(save).length} chars -> text code ${text.length} chars`);
  ok(same(await readCode(text)), 'the text code brings the whole save back');
  // chat apps wrap long text: line breaks and spaces inside the code are ignored
  ok(same(await readCode(`  ${text.slice(0, 300)}\n${text.slice(300, 900)} \n${text.slice(900)}\n`)), 'a code broken over lines by a chat app still reads');
  ok(same(await readCode(exportCode(save))), "the debug panel's older codes still read");
  ok((await readCode(text.slice(0, text.length - 40))) === null, 'a cut-off code is refused');
  ok((await readCode('hello')) === null && (await readCode('')) === null, 'random text is refused');
  // crafted codes: a save that would stop the game loading, or smuggle markup into the preview card
  const bad = async (patch: Record<string, unknown>) => readCode(await textCode({ ...save, ...patch } as typeof save));
  ok((await bad({ carry: 5 })) === null, 'a code with a non-list carry is refused');
  ok((await bad({ album: { seen: 'x', paid: [] } })) === null, 'a code with a malformed album is refused');
  ok((await bad({ levels: { ...save.levels, 'eggs.animals': '<img src=x onerror=alert(1)>' } })) === null, 'a code with text in a levels slot is refused');
  ok((await bad({ money: '1e9' })) === null, 'a code with text in the money field is refused');

  // QR: drawn module by module, read back the way the game reads a camera frame
  const payload = (await qrCode(save))!;
  const q = qrcode(0, 'L');
  q.addData(payload, 'Alphanumeric');
  q.make();
  const n = q.getModuleCount(), version = (n - 17) / 4, px = 4, quiet = 4, size = (n + quiet * 2) * px;
  console.log(`QR payload ${payload.length} chars -> version ${version} (${n}x${n} modules)`);
  ok(version <= 30, `the QR stays scannable off a phone screen (version ${version} <= 30)`);
  const img = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!q.isDark(r, c)) continue;
    for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
      const i = (((r + quiet) * px + y) * size + (c + quiet) * px + x) * 4;
      img[i] = img[i + 1] = img[i + 2] = 0;
    }
  }
  const read = jsQR(img, size, size);
  ok(read?.data === payload, 'the QR reads back to the same payload');
  ok(same(await readCode(read?.data ?? '')), 'the scanned QR brings the whole save back');

  // and the imported save loads into a world
  const back = new SimWorld(1);
  restore(back, (await readCode(text))!);
  const owned = Object.values(save.levels).reduce((a, n) => a + n, 0);
  ok(back.money === save.money && back.upgrades.bought === owned, `the imported save loads (${back.upgrades.bought} of ${owned} upgrades)`);

  console.log(fails ? `\n${fails} failed` : '\nall transfer checks passed');
  process.exit(fails ? 1 : 0);
})();
