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
import { serialize, restore, legacyReset } from '../src/sim/save';
import { PERK_BY_ID } from '../src/config/perks';
import { SHOP } from '../src/config/shop';
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

// perks: saved, never more than the points earned, kept when the farm is sold, and they do what they say
{
  const p = new SimWorld(3);
  p.legacy = 2;
  const cap0 = p.carry.cap, cost0 = p.upgrades.cost('milk.unlock');
  ok(p.buyPerk('carry') && p.buyPerk('carry') && p.buyPerk('discount') && p.buyPerk('walk') && !p.buyPerk('walk'), 'perks cost a point a level (4 points after two sales)');
  ok(p.carry.cap === cap0 + 2 * PERK_BY_ID.get('carry')!.step && p.upgrades.cost('milk.unlock') < cost0, `perks apply at once (carry ${cap0} -> ${p.carry.cap}, price ${cost0} -> ${p.upgrades.cost('milk.unlock')})`);
  const s = JSON.parse(JSON.stringify(serialize(p, Date.now())));
  const q = new SimWorld(3);
  restore(q, s);
  ok(q.perks.carry === 2 && q.perks.discount === 1 && q.perks.walk === 1 && q.carry.cap === p.carry.cap, 'perks are saved');
  s.legacy = 1;
  const r = new SimWorld(3);
  restore(r, s);
  ok(r.perkPoints === 0 && Object.values(r.perks).reduce((a, n) => a + n, 0) === 2, 'a save with more perks than points loads only what the points cover');
  for (const id of Object.keys(ECONOMY.upgrades) as UpgradeId[]) if (id !== 'eggs.unlock') p.upgrades.levels[id] = p.upgrades.maxOf(id);
  const sold = legacyReset(p, Date.now())!;
  const n = new SimWorld(3);
  restore(n, JSON.parse(JSON.stringify(sold)));
  ok(n.legacy === 3 && n.perks.carry === 2 && n.perkPoints === 2, 'selling the farm keeps the perks and adds two points');
  p.upgrades.apply();
  const capPerks = p.carry.cap;
  p.resetPerks();
  ok(p.perkPoints === 4 && p.carry.cap === capPerks - 2 * PERK_BY_ID.get('carry')!.step, 'points can be taken back');
}

// the decorations shop: buying costs money, decorations raise prices (and the solid ones block), it's all saved and kept
{
  const p = new SimWorld(5);
  p.money = 2_000_000;
  const m0 = p.priceMult, solids0 = p.solids.length;
  ok(p.shop.buy('decor', 'fountain') && p.shop.buy('hat', 'tarboosh') && p.shop.buy('outfit', 'suit') && !p.shop.buy('decor', 'fountain'), 'the shop sells each thing once');
  ok(p.money === 2_000_000 - 400_000 - 12_000 - 80_000 && p.shop.hat === 'tarboosh' && p.shop.outfit === 'suit', 'buying pays and puts the clothes on');
  ok(Math.abs(p.priceMult / m0 - (1 + SHOP.decorBonus)) < 1e-9 && p.solids.length === solids0 + 1, 'a decoration raises the prices and stands solid');
  const left = p.money;
  p.money = 500;
  ok(!p.shop.buy('decor', 'statue') && p.money === 500, "it can't be bought without the money");
  p.money = left;
  p.shop.wear('outfit', 'farmer');
  const q = new SimWorld(5);
  restore(q, JSON.parse(JSON.stringify(serialize(p, Date.now()))));
  ok(q.shop.has('decor', 'fountain') && q.shop.hat === 'tarboosh' && q.shop.outfit === 'farmer' && q.shop.has('outfit', 'suit') && q.solids.length === solids0 + 1, 'the shop is saved');
  for (const id of Object.keys(ECONOMY.upgrades) as UpgradeId[]) if (id !== 'eggs.unlock') p.upgrades.levels[id] = p.upgrades.maxOf(id);
  const n = new SimWorld(5);
  restore(n, JSON.parse(JSON.stringify(legacyReset(p, Date.now())!)));
  ok(n.shop.has('decor', 'fountain') && n.shop.hat === 'tarboosh', 'selling the farm keeps what was bought in the shop');
}

// a late-game farm: every track maxed, money, stats, a full album page's worth of state
const w = new SimWorld(42);
for (const id of Object.keys(ECONOMY.upgrades) as UpgradeId[]) if (!id.startsWith('market.')) w.upgrades.levels[id] = ECONOMY.upgrades[id].max;
w.upgrades.apply();
w.money = 12_345_678.9;
w.legacy = 2;
w.perks.carry = 2; w.perks.walk = 1;
for (const d of SHOP.decor) w.shop.owned.add(`d:${d.id}`);
for (const o of SHOP.outfits) w.shop.owned.add(`o:${o.id}`);
for (const h of SHOP.hats) w.shop.owned.add(`h:${h.id}`);
w.shop.outfit = 'suit'; w.shop.hat = 'crown';
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
