import * as THREE from 'three';
import { LAYOUT } from '../config/layout';
import type { SimWorld } from '../sim/world';
import { MAT, PRIM, merge, part } from './geo';
import { CanvasSprite, EMOJI, FONT, groundMarker, rr } from './canvas';
import { ITEM_ICON } from './models';

const { box, cyl } = PRIM;

const PLATFORM = (() => {
  const p = LAYOUT.dock.platform, cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2, w = p.x1 - p.x0, d = p.z1 - p.z0;
  return merge([
    part(box, 0x9a9a9a, cx, 0.25, cz, 0, 0, 0, w, 0.5, d),
    part(box, 0xf2b33d, cx, 0.51, cz - d / 2 + 0.05, 0, 0, 0, w, 0.02, 0.1),
    part(box, 0x2b2b2b, cx - w / 2 + 0.2, 0.9, cz, 0, 0, 0, 0.12, 1.3, 0.12),
    part(box, 0x2b2b2b, cx + w / 2 - 0.2, 0.9, cz, 0, 0, 0, 0.12, 1.3, 0.12),
  ]);
})();

/** Truck body in a company color (cab toward the road, open bed toward the dock). */
function truckGeo(color: number): THREE.BufferGeometry {
  return merge([
    part(box, color, 0, 0.95, 1.4, 0, 0, 0, 1.8, 1.3, 1.3),
    part(box, 0x2b3a4e, 0, 1.25, 2.06, 0, 0, 0, 1.5, 0.5, 0.02),
    part(box, 0xdddddd, 0, 0.75, -0.6, 0, 0, 0, 2.0, 0.9, 2.8),
    part(box, color, 0, 1.55, -0.6, 0, 0, 0, 2.05, 0.7, 2.85),
    ...[[-1, 1.4], [1, 1.4], [-1, -0.2], [1, -0.2], [-1, -1.4], [1, -1.4]].map(([a, z]) => part(cyl, 0x0a0a0a, a * 0.95, 0.35, z, 0, 0, Math.PI / 2, 0.35, 0.25, 0.35)),
  ]);
}

/** Loading dock: platform + load marker, the company truck driving in/out, and a contract board. */
export class DockView {
  private root = new THREE.Group();
  private truck = new THREE.Group();
  private body: THREE.Mesh;
  private sign = new CanvasSprite(320, 90, 2.4);
  private board = new CanvasSprite(320, 200, 2.6);
  private shownCompany = '';
  private boardKey = '';
  private geoCache = new Map<number, THREE.BufferGeometry>();

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
    this.root.add(new THREE.Mesh(PLATFORM, MAT));
    const m = groundMarker('🚚', 1.6, 'rgba(30,91,198,0.25)', '#1e5bc6');
    m.position.x = LAYOUT.dock.load.x;
    m.position.z = LAYOUT.dock.load.z;
    this.root.add(m);
    this.body = new THREE.Mesh(truckGeo(0xffffff), MAT);
    this.truck.add(this.body);
    this.sign.sprite.position.set(0, 2.5, -0.6);
    this.truck.add(this.sign.sprite);
    this.truck.rotation.y = Math.PI;
    this.root.add(this.truck);
    this.board.sprite.position.set(LAYOUT.dock.platform.x0 - 0.6, 2.4, LAYOUT.dock.platform.z0);
    this.root.add(this.board.sprite);
    this.root.visible = false;
  }

  sync(sim: SimWorld): void {
    const ct = sim.contracts, t = ct.truck, d = LAYOUT.dock;
    this.root.visible = ct.open;
    if (!ct.open) return;
    if (t.company.id !== this.shownCompany) {
      this.shownCompany = t.company.id;
      let g = this.geoCache.get(t.company.color);
      if (!g) { g = truckGeo(t.company.color); this.geoCache.set(t.company.color, g); }
      this.body.geometry = g;
      const hex = `#${t.company.color.toString(16).padStart(6, '0')}`;
      this.sign.draw((c, w, h) => {
        c.fillStyle = hex;
        rr(c, 4, 4, w - 8, h - 8, 18);
        c.fill();
        c.fillStyle = '#fff';
        c.font = `800 44px ${FONT}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(t.company.name, w / 2, h / 2 + 3);
      });
    }
    // drive in from the road, park in the bay, drive back out
    const k = t.state === 'away' ? 0 : t.state === 'loading' ? 1 : t.drive;
    this.truck.visible = t.state !== 'away';
    this.truck.position.set(d.bay.x, 0, d.road.z + (d.bay.z - d.road.z) * k);
    // contract board: company, kind, what's loaded, time left
    const secs = t.state === 'loading' ? Math.ceil(t.t) : 0;
    const key = `${t.state}|${t.company.id}|${secs}|${t.lines.map((l) => l.loaded).join(',')}`;
    if (key === this.boardKey) return;
    this.boardKey = key;
    this.board.draw((c, w, h) => {
      c.fillStyle = 'rgba(28,38,18,0.88)';
      rr(c, 4, 4, w - 8, h - 8, 20);
      c.fill();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#fff';
      c.direction = 'rtl';
      if (t.state === 'away') {
        c.font = `800 34px ${FONT}`;
        c.fillText(`العربية الجاية بعد ${Math.ceil(t.t)}`, w / 2, h / 2);
        return;
      }
      c.font = `800 34px ${FONT}`;
      c.fillText(`${t.company.name}${t.kind === 'rush' ? ' ⚡ مستعجل' : ''}`, w / 2, 36);
      c.direction = 'ltr';
      t.lines.forEach((l, i) => {
        const y = 92 + i * 46;
        c.font = `36px ${EMOJI}`;
        c.fillText(ITEM_ICON[l.product], 70, y);
        c.font = `800 34px ${FONT}`;
        c.fillStyle = l.loaded >= l.want ? '#9ff09a' : '#fff';
        c.fillText(`${l.loaded}/${l.want}`, 170, y + 2);
        c.fillStyle = '#ffd84a';
        c.fillText(`${t.price[l.product]}💵`, 262, y + 2);
        c.fillStyle = '#fff';
      });
      if (t.state === 'loading') {
        c.font = `800 26px ${FONT}`;
        c.fillStyle = secs <= 10 ? '#ff8a80' : '#cfd8dc';
        c.fillText(`⏱ ${secs}`, w / 2, h - 22);
      }
    });
  }
}
