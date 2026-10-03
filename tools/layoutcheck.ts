/**
 * Layout sanity check: upgrade tiles must not overlap each other, sit on a work spot (standing
 * there to work would also pay into the tile), or sit inside a solid. Exits 1 on any problem.
 * Run: npm run layoutcheck
 */
import { UPGRADES } from '../src/config/upgrades';
import { STATIONS } from '../src/config/stations';
import { LAYOUT, SOLIDS } from '../src/config/layout';
import { CAFE } from '../src/config/cafe';

/** Tile cards are 1.8 squares (render/tiles.ts); keep at least this much floor between two. */
const TILE = 1.8, TILE_GAP = 0.15;
/** A tile closer than this to a work spot gets stepped on while working there. */
const ZONE_GAP = 1.6;

const problems: string[] = [];
const d = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** `owner`: the zone only exists once that tile is bought (so they never show together). */
const zones: { name: string; x: number; z: number; owner?: string }[] = [
  ...STATIONS.flatMap((s) => [
    { name: `${s.product} pile`, x: s.pile.x, z: s.pile.z, owner: s.unlockTrack },
    { name: `${s.product} counter drop`, x: s.counter.dropX, z: s.counter.dropZ, owner: s.unlockTrack },
  ]),
  ...LAYOUT.shop.lanes.map((l, i) => ({ name: `shop lane ${i}`, x: l.x, z: LAYOUT.shop.serveZ })),
  { name: 'shop cash', ...LAYOUT.shop.cash },
  { name: 'VIP drop', ...LAYOUT.vipStage.drop },
  { name: 'dock load', ...LAYOUT.dock.load },
  ...CAFE.kitchen.map((k) => ({ name: `${k.id} input`, ...k.input })),
  { name: 'café serve', ...CAFE.counter.serve },
  { name: 'café cash', ...CAFE.cash },
  ...CAFE.tables.map(([x, z], i) => ({ name: `café table ${i}`, x, z })),
];

for (let i = 0; i < UPGRADES.length; i++) {
  const a = UPGRADES[i];
  for (let j = i + 1; j < UPGRADES.length; j++) {
    const b = UPGRADES[j];
    const dx = Math.abs(a.pos.x - b.pos.x), dz = Math.abs(a.pos.z - b.pos.z);
    // same spot = a chained tile that replaces the other (e.g. animals -> expand)
    if (dx + dz > 0.01 && dx < TILE + TILE_GAP && dz < TILE + TILE_GAP) problems.push(`tiles overlap: ${a.id} & ${b.id} (dx ${dx.toFixed(2)}, dz ${dz.toFixed(2)})`);
  }
  for (const z of zones) {
    if (z.owner === a.id) continue;
    const g = d(a.pos, z);
    if (g < ZONE_GAP) problems.push(`tile on a work spot: ${a.id} & ${z.name} (${g.toFixed(2)} apart)`);
  }
  for (const s of SOLIDS) {
    if (a.pos.x > s.x0 - 0.5 && a.pos.x < s.x1 + 0.5 && a.pos.z > s.z0 - 0.5 && a.pos.z < s.z1 + 0.5) {
      problems.push(`tile in/against a solid: ${a.id} at (${a.pos.x}, ${a.pos.z})`);
    }
  }
}

if (problems.length) {
  console.log(problems.join('\n'));
  console.log(`${problems.length} layout problem(s)`);
  process.exit(1);
}
console.log(`layout ok (${UPGRADES.length} tiles, ${zones.length} work spots, ${SOLIDS.length} solids)`);
