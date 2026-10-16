import * as THREE from 'three';
import { HAT_BY_ID, OUTFIT_BY_ID, SHOP, type DecorKind, type HatDef, type OutfitDef } from '../config/shop';
import type { SimWorld } from '../sim/world';
import { hatGeo } from './accessories';
import type { CharacterView } from './character';
import { MAT, PRIM, Q4, blob, merge, part } from './geo';

const { box, sph, cyl, cone, cylLo } = PRIM;

/** Hat geometry for the shop's hats (the guests' kinds plus a tarboosh and a turban). */
function shopHat(h: HatDef): THREE.BufferGeometry[] {
  switch (h.kind) {
    case 'tarboosh': return [
      part(cyl, h.color, 0, 1.72, -0.02, 0, 0, 0, 0.22, 0.24, 0.22),
      part(cyl, 0x1b1b1b, 0.02, 1.85, -0.02, 0, 0, 0, 0.025, 0.04, 0.025),
      part(box, 0x1b1b1b, 0.12, 1.74, -0.14, 0, 0, 0.3, 0.03, 0.2, 0.03),
    ];
    case 'turban': return [
      part(sph, h.color, 0, 1.64, -0.03, 0, 0, 0, 0.32, 0.17, 0.31),
      part(sph, h.color, 0, 1.73, -0.03, 0, 0, 0, 0.26, 0.13, 0.26),
      part(sph, 0xe7e1cf, 0.05, 1.79, -0.01, 0, 0, 0, 0.16, 0.08, 0.16),
    ];
    case 'flowerCrown': case 'crown': return hatGeo({ kind: h.kind, color: h.color });
    default: return hatGeo({ kind: h.kind, color: h.color });
  }
}

const LOOK_CACHE = new Map<string, THREE.BufferGeometry | null>();

/** The farmer's clothes extras (robe, tie) and hat as one body mesh (null when there's nothing to add). */
function lookGeo(o: OutfitDef, h: HatDef): THREE.BufferGeometry | null {
  const key = `${o.id}|${h.id}`;
  if (LOOK_CACHE.has(key)) return LOOK_CACHE.get(key)!;
  const p: THREE.BufferGeometry[] = [];
  // (a robe down to the ankles: the legs swing inside it)
  if (o.robe) p.push(part(cyl, o.shirt, 0, 0.42, 0, 0, 0, 0, 0.34, 0.72, 0.28), part(box, 0x5a4630, 0, 1.1, 0.25, 0, 0, 0, 0.05, 0.22, 0.02));
  if (o.tie !== undefined) p.push(part(box, o.tie, 0, 1.0, 0.25, 0, 0, 0, 0.07, 0.3, 0.03), part(box, 0xffffff, 0, 1.12, 0.24, 0, 0, 0, 0.16, 0.12, 0.02));
  if (h.id !== 'none') p.push(...shopHat(h));
  const g = p.length ? merge(p) : null;
  LOOK_CACHE.set(key, g);
  return g;
}

/** Dresses the player's character as the shop says (only redraws when something changed). */
export class PlayerLook {
  private version = -1;
  private extra: THREE.Mesh | null = null;

  constructor(private c: CharacterView, private skin: number, private hair: number) {}

  sync(sim: SimWorld): void {
    const sh = sim.shop;
    if (sh.version === this.version) return;
    this.version = sh.version;
    const o = OUTFIT_BY_ID.get(sh.outfit) ?? SHOP.outfits[0], h = HAT_BY_ID.get(sh.hat) ?? SHOP.hats[0];
    this.c.setOutfit({ shirt: o.shirt, pants: o.pants, skin: this.skin, hair: this.hair });
    const g = lookGeo(o, h);
    if (!g) { if (this.extra) this.extra.visible = false; return; }
    if (!this.extra) this.extra = this.c.attach(g);
    this.extra.geometry = g;
    this.extra.visible = true;
  }
}

/** Static model of one decoration piece (origin on the ground at its spot). */
function decorGeo(kind: DecorKind): THREE.BufferGeometry {
  switch (kind) {
    case 'flowers': {
      const p = [part(box, 0x8a5a32, 0, 0.18, 0, 0, 0, 0, 1.3, 0.36, 0.5), part(box, 0x5a3a22, 0, 0.37, 0, 0, 0, 0, 1.2, 0.04, 0.42)];
      const cols = [0xe8554e, 0xf6c23e, 0xd96aa7, 0xffffff, 0xf28c38];
      for (let i = 0; i < 6; i++) {
        const x = -0.5 + i * 0.2;
        p.push(part(sphLeaf(), 0x3e8e3a, x, 0.48, (i % 2) * 0.1 - 0.05, 0, 0, 0, 0.11, 0.1, 0.11));
        p.push(part(sph, cols[i % cols.length], x, 0.6, (i % 2) * 0.1 - 0.05, 0, 0, 0, 0.08, 0.08, 0.08));
      }
      return merge(p);
    }
    case 'flags': return merge([
      part(cylLo, 0xd9d9d9, 0, 1.6, 0, 0, 0, 0, 0.05, 3.2, 0.05),
      part(sph, 0xf5c542, 0, 3.25, 0, 0, 0, 0, 0.08, 0.08, 0.08),
    ]);
    case 'lamps': return merge([
      part(cylLo, 0x2b2b2b, 0, 1.3, 0, 0, 0, 0, 0.07, 2.6, 0.07),
      part(cyl, 0x2b2b2b, 0, 0.08, 0, 0, 0, 0, 0.18, 0.16, 0.18),
      part(box, 0x2b2b2b, 0, 2.62, 0, 0, 0, 0, 0.36, 0.06, 0.36),
      part(sph, 0xfff1a8, 0, 2.45, 0, 0, 0, 0, 0.2, 0.22, 0.2),
      part(cone, 0x2b2b2b, 0, 2.75, 0, 0, 0, 0, 0.26, 0.2, 0.26),
    ]);
    case 'palms': {
      const p: THREE.BufferGeometry[] = [];
      // a slightly curved ringed trunk, fronds drooping all round, dates under them
      for (let i = 0; i < 7; i++) p.push(part(cylLo, i % 2 ? 0x8a6038 : 0x9c6d40, i * 0.035, 0.25 + i * 0.5, 0, 0, 0, -0.04, 0.17 - i * 0.008, 0.52, 0.17 - i * 0.008));
      const top = { x: 0.25, y: 3.6 };
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        p.push(part(box, i % 2 ? 0x3e9a3a : 0x4fb348, top.x + Math.cos(a) * 0.75, top.y - 0.15, Math.sin(a) * 0.75, 0, -a, 0.45, 1.6, 0.06, 0.32));
      }
      for (let i = 0; i < 4; i++) p.push(part(sph, 0xb3542a, top.x + Math.cos(i * 1.6) * 0.22, top.y - 0.35, Math.sin(i * 1.6) * 0.22, 0, 0, 0, 0.12, 0.16, 0.12));
      return merge(p);
    }
    case 'cart': {
      const p = [
        part(box, 0x2f7fc1, 0, 0.75, 0, 0, 0, 0, 1.5, 0.6, 0.85),
        part(box, 0xf6c23e, 0, 1.08, 0, 0, 0, 0, 1.56, 0.06, 0.9),
        // the big copper pot of beans (قدرة الفول) and its lid
        part(cyl, 0xb8732e, -0.25, 1.38, 0, 0, 0, 0, 0.3, 0.5, 0.3),
        part(cyl, 0xd08a3c, -0.25, 1.66, 0, 0, 0, 0, 0.18, 0.08, 0.18),
        part(box, 0xffffff, 0.4, 1.15, 0.1, 0, 0, 0, 0.4, 0.06, 0.3),
        // canopy on four posts
        ...Q4.map(([sx, sz]) => part(cylLo, 0x8a5a32, sx * 0.7, 1.7, sz * 0.38, 0, 0, 0, 0.03, 1.3, 0.03)),
        part(box, 0xe8554e, 0, 2.36, 0, 0, 0, 0, 1.7, 0.08, 1.0),
        part(box, 0xffffff, 0, 2.3, 0.5, 0, 0, 0, 1.7, 0.14, 0.04),
        part(cyl, 0x2b2b2b, 0, 0.32, 0.45, Math.PI / 2, 0, 0, 0.3, 0.08, 0.3),
        part(cyl, 0x2b2b2b, 0, 0.32, -0.45, Math.PI / 2, 0, 0, 0.3, 0.08, 0.3),
      ];
      return merge(p);
    }
    case 'swing': return merge([
      // two A-frames and the top bar
      ...[-1, 1].flatMap((s) => [
        part(cylLo, 0xd8262c, s * 1.0, 1.1, -0.28, 0.26, 0, 0, 0.06, 2.3, 0.06),
        part(cylLo, 0xd8262c, s * 1.0, 1.1, 0.28, -0.26, 0, 0, 0.06, 2.3, 0.06),
      ]),
      part(cylLo, 0xf6c23e, 0, 2.2, 0, 0, 0, Math.PI / 2, 0.07, 2.1, 0.07),
    ]);
    case 'fountain': {
      const p = [
        part(cyl, 0xbdb6a5, 0, 0.25, 0, 0, 0, 0, 1.2, 0.5, 1.2),
        part(cyl, 0x4aa8e0, 0, 0.47, 0, 0, 0, 0, 1.05, 0.06, 1.05),
        part(cyl, 0xbdb6a5, 0, 0.9, 0, 0, 0, 0, 0.16, 1.0, 0.16),
        part(cyl, 0xbdb6a5, 0, 1.38, 0, 0, 0, 0, 0.55, 0.14, 0.55),
        part(cyl, 0x4aa8e0, 0, 1.46, 0, 0, 0, 0, 0.47, 0.04, 0.47),
      ];
      return merge(p);
    }
    case 'statue': return merge([
      part(box, 0xd9c08a, 0, 0.3, 0, 0, 0, 0, 1.2, 0.6, 1.2),
      part(box, 0xc9a86a, 0, 0.62, 0, 0, 0, 0, 1.0, 0.06, 1.0),
      // a pharaoh's head with the striped nemes headdress, a beard and the cobra
      part(box, 0xd8a640, 0, 1.15, 0, 0, 0, 0, 0.5, 1.0, 0.4),
      part(box, 0xd8a640, 0, 1.9, 0.02, 0, 0, 0, 0.36, 0.46, 0.36),
      ...[0, 1, 2, 3, 4].map((i) => part(box, i % 2 ? 0x2f5fb3 : 0xf5c542, 0, 2.2 - i * 0.12, -0.08, 0, 0, 0, 0.66 - i * 0.02, 0.1, 0.4)),
      part(box, 0x2f5fb3, 0, 1.52, 0.18, 0, 0, 0, 0.08, 0.26, 0.06),
      part(box, 0x1b1b1b, -0.08, 1.98, 0.2, 0, 0, 0, 0.08, 0.03, 0.02),
      part(box, 0x1b1b1b, 0.08, 1.98, 0.2, 0, 0, 0, 0.08, 0.03, 0.02),
      part(cone, 0xf5c542, 0, 2.3, 0.18, 0, 0, 0, 0.05, 0.14, 0.05),
    ]);
    case 'lanterns': return new THREE.BufferGeometry();
  }
}

let LEAF: THREE.BufferGeometry | null = null;
function sphLeaf(): THREE.BufferGeometry { return LEAF ??= new THREE.SphereGeometry(1, 6, 4); }

/** One colored lantern (فانوس) hanging from its top. */
function lanternGeo(color: number): THREE.BufferGeometry {
  return merge([
    part(cylLo, 0x1b1b1b, 0, -0.08, 0, 0, 0, 0, 0.012, 0.16, 0.012),
    part(cone, 0xf5c542, 0, -0.2, 0, Math.PI, 0, 0, 0.13, 0.1, 0.13),
    part(cylLo, color, 0, -0.36, 0, 0, 0, 0, 0.12, 0.24, 0.12),
    part(cone, 0xf5c542, 0, -0.53, 0, Math.PI, 0, 0, 0.12, 0.12, 0.12),
  ]);
}

/** Egyptian flag cloth (red, white, black, with the gold eagle), hanging off the pole at its left edge. */
const FLAG = merge([
  part(box, 0xce1126, 0.42, 0.18, 0, 0, 0, 0, 0.84, 0.18, 0.02),
  part(box, 0xffffff, 0.42, 0, 0, 0, 0, 0, 0.84, 0.18, 0.02),
  part(box, 0x111111, 0.42, -0.18, 0, 0, 0, 0, 0.84, 0.18, 0.02),
  part(sph, 0xc09300, 0.42, 0, 0.015, 0, 0, 0, 0.06, 0.07, 0.01),
]);

/** The decorations bought in the shop, at their spots, with a little life (water, swaying, swinging). */
export class DecorView {
  private version = -1;
  private root = new THREE.Group();
  private moving: { obj: THREE.Object3D; kind: string; i: number }[] = [];

  constructor(scene: THREE.Scene) { scene.add(this.root); }

  private build(sim: SimWorld): void {
    this.root.clear();
    this.moving.length = 0;
    for (const d of SHOP.decor) {
      if (!sim.shop.has('decor', d.id)) continue;
      d.spots.forEach((s, i) => {
        const g = new THREE.Group();
        g.position.set(s.x, 0, s.z);
        g.rotation.y = s.rot ?? 0;
        if (d.id !== 'lanterns') g.add(new THREE.Mesh(decorGeo(d.id), MAT));
        if (d.id !== 'lanterns' && d.id !== 'flags' && d.id !== 'lamps') g.add(blob(d.solid ? Math.max(d.solid.hx, d.solid.hz) * 1.2 : 0.7));
        if (d.id === 'flags') {
          const f = new THREE.Mesh(FLAG, MAT);
          f.position.set(0.04, 2.85, 0);
          g.add(f);
          this.moving.push({ obj: f, kind: 'flag', i });
        }
        if (d.id === 'lanterns') this.lanterns(g);
        if (d.id === 'swing') {
          const seat = new THREE.Group();
          seat.position.y = 2.2;
          seat.add(new THREE.Mesh(merge([
            part(cylLo, 0x5a3a22, -0.28, -0.75, 0, 0, 0, 0, 0.02, 1.5, 0.02),
            part(cylLo, 0x5a3a22, 0.28, -0.75, 0, 0, 0, 0, 0.02, 1.5, 0.02),
            part(box, 0x8a5a32, 0, -1.5, 0, 0, 0, 0, 0.7, 0.07, 0.36),
          ]), MAT));
          g.add(seat);
          this.moving.push({ obj: seat, kind: 'swing', i });
        }
        if (d.id === 'fountain') {
          const jet = new THREE.Mesh(merge([part(sph, 0x9fd6f5, 0, 0, 0, 0, 0, 0, 0.12, 0.5, 0.12), part(sph, 0xd5eefb, 0, 0.4, 0, 0, 0, 0, 0.08, 0.14, 0.08)]), MAT);
          jet.position.y = 1.65;
          g.add(jet);
          this.moving.push({ obj: jet, kind: 'jet', i });
        }
        this.root.add(g);
      });
    }
  }

  /** A garland over the counter, from one sorter to the other, with lanterns swaying under it. */
  private lanterns(g: THREE.Group): void {
    const span = 14.6, y = 3.15, cols = [0xe8554e, 0x2f6fd6, 0x3fae5a, 0xd96aa7, 0xf28c38];
    g.add(new THREE.Mesh(merge([
      part(box, 0x5a3a22, 0, y, 0, 0, 0, 0, span, 0.025, 0.025),
      // little triangle flags all along the rope
      ...Array.from({ length: 28 }, (_, k) => part(cone, cols[k % cols.length], -span / 2 + 0.3 + k * ((span - 0.6) / 27), y - 0.12, 0, Math.PI, 0, 0, 0.12, 0.22, 0.02)),
    ]), MAT));
    for (let k = 0; k < 9; k++) {
      const l = new THREE.Mesh(lanternGeo(cols[k % cols.length]), MAT);
      l.position.set(-span / 2 + 0.8 + k * ((span - 1.6) / 8), y, 0);
      g.add(l);
      this.moving.push({ obj: l, kind: 'lantern', i: k });
    }
  }

  update(sim: SimWorld, time: number): void {
    if (sim.shop.version !== this.version) { this.version = sim.shop.version; this.build(sim); }
    for (const m of this.moving) {
      if (m.kind === 'flag') m.obj.rotation.y = Math.sin(time * 2.2 + m.i) * 0.25;
      else if (m.kind === 'lantern') m.obj.rotation.z = Math.sin(time * 1.6 + m.i * 0.9) * 0.12;
      else if (m.kind === 'swing') m.obj.rotation.x = Math.sin(time * 1.3) * 0.45;
      else if (m.kind === 'jet') m.obj.scale.set(1, 0.85 + Math.sin(time * 6) * 0.15, 1);
    }
  }
}
