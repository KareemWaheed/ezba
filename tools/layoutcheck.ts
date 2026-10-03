/**
 * Layout sanity check: upgrade tiles must not overlap each other, sit on a work spot (standing
 * there to work would also pay into the tile), or sit inside a solid. Exits 1 on any problem.
 * Run: npm run layoutcheck
 */
import { UPGRADES } from '../src/config/upgrades';
import { STATIONS } from '../src/config/stations';
import { LAYOUT, SOLIDS } from '../src/config/layout';
import { CAFE } from '../src/config/cafe';
import { FIELDS } from '../src/config/fields';
import { FACTORY } from '../src/config/factories';
import { RIVER } from '../src/config/river';
import { ECONOMY } from '../src/config/economy';
import { ZONE } from '../src/sim/world';

/** Tile cards are 1.8 squares (render/tiles.ts); keep at least this much floor between two. */
const TILE = 1.8, TILE_GAP = 0.15;
/** Tiles pay while the player stands within this of their center (ECONOMY.tiles.radius). */
const TILE_R = ECONOMY.tiles.radius;
/** Extra floor between a work zone's edge and a tile's pay radius. */
const ZONE_MARGIN = 0.05;
/** Players stand near a zone's marker; forgiving radii (shop lanes 1.9) don't mean they stand at the edge. */
const STAND_MAX = 1.3;

const problems: string[] = [];
const d = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Work zones with the radius the sim uses for them (the player stands anywhere inside while working).
 * `owner`: the zone only exists once that tile is bought (so they never show together).
 */
const zones: { name: string; x: number; z: number; r: number; owner?: string }[] = [
  ...STATIONS.flatMap((s) => [
    { name: `${s.product} pile`, x: s.pile.x, z: s.pile.z, r: ZONE.pile, owner: s.unlockTrack },
    { name: `${s.product} counter drop`, x: s.counter.dropX, z: s.counter.dropZ, r: ZONE.drop, owner: s.unlockTrack },
    ...(s.trough ? [{ name: `${s.product} trough`, ...s.trough, r: ECONOMY.feed.radius, owner: s.unlockTrack }] : []),
  ]),
  ...LAYOUT.shop.lanes.map((l, i) => ({ name: `shop lane ${i}`, x: l.x, z: LAYOUT.shop.serveZ, r: ECONOMY.serveRadius })),
  { name: 'shop cash', ...LAYOUT.shop.cash, r: ZONE.cash },
  { name: 'VIP drop', ...LAYOUT.vipStage.drop, r: 1.5 },
  { name: 'dock load', ...LAYOUT.dock.load, r: 1.4 },
  ...CAFE.kitchen.map((k) => ({ name: `${k.id} input`, ...k.input, r: 1.2 })),
  { name: 'café serve', ...CAFE.counter.serve, r: 1.6 },
  { name: 'café cash', ...CAFE.cash, r: 1.3 },
  ...CAFE.tables.map(([x, z], i) => ({ name: `café table ${i}`, x, z, r: 1.15 })),
  { name: 'grain stall drop', ...FIELDS.stall.drop, r: 1.25 },
  { name: 'grain stall cash', ...FIELDS.stall.cash, r: 1.3 },
  { name: 'fish pile', x: RIVER.pile.x, z: RIVER.pile.z, r: 1.35, owner: 'river.unlock' },
  { name: 'fish stall drop', ...RIVER.stall.drop, r: 1.25, owner: 'river.unlock' },
  { name: 'fish stall cash', ...RIVER.stall.cash, r: 1.3, owner: 'river.unlock' },
  { name: 'rowboat tie spot', ...RIVER.tie, r: 1.3, owner: 'river.unlock' },
  ...RIVER.queue && [0, 1, 2, 3, 4].map((i) => ({ name: `river queue ${i}`, x: RIVER.queue.x - i * RIVER.queue.gap, z: RIVER.queue.z, r: 0.6, owner: 'river.unlock' })),
  ...FACTORY.machines.flatMap((m) => [
    { name: `${m.id} input`, ...m.input, r: 1.1, owner: m.unlockTrack as string },
    { name: `${m.id} output`, ...m.output, r: 1.1, owner: m.unlockTrack as string },
  ]),
];
// tiles inside a crop plot would be paid into while harvesting
for (const d of UPGRADES) {
  for (const p of FIELDS.plots) {
    const b = p.box, R = 0.9;
    if (d.pos.x > b.x0 - R && d.pos.x < b.x1 + R && d.pos.z > b.z0 - R && d.pos.z < b.z1 + R) problems.push(`tile on a field: ${d.id} in ${p.id}`);
  }
}

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
    const need = TILE_R + Math.min(z.r, STAND_MAX) + ZONE_MARGIN;
    if (g < need) problems.push(`tile pays while working at ${z.name}: ${a.id} (${g.toFixed(2)} apart, need ${need.toFixed(2)})`);
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
