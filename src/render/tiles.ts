import * as THREE from 'three';
import type { UpgradeId } from '../config/economy';
import { ECONOMY } from '../config/economy';
import type { SimWorld } from '../sim/world';
import type { TileState } from '../sim/upgrades';
import { EMOJI, FONT, rr } from './canvas';
import { easeOutBack } from './stacks';

const SIZE = 1.8;
const GEO = new THREE.PlaneGeometry(SIZE, SIZE).rotateX(-Math.PI / 2);

/** One upgrade tile on the ground: icon, label, level, remaining price and a fill bar. */
class TileView {
  readonly mesh: THREE.Mesh;
  private cv = document.createElement('canvas');
  private tex: THREE.CanvasTexture;
  private shownPaid = -1;
  private shownLevel = -1;
  private drawT = 0;
  popT = 0;

  constructor(readonly t: TileState) {
    this.cv.width = this.cv.height = 256;
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.NoColorSpace;
    this.mesh = new THREE.Mesh(GEO, new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false }));
    this.mesh.position.set(t.def.pos.x, 0.035, t.def.pos.z);
    this.mesh.scale.setScalar(0.01);
  }

  draw(level: number, paid: number, cost: number): void {
    const c = this.cv.getContext('2d')!, d = this.t.def, p = Math.min(1, paid / cost);
    const max = ECONOMY.upgrades[d.id].max;
    c.clearRect(0, 0, 256, 256);
    rr(c, 8, 8, 240, 240, 36);
    c.fillStyle = 'rgba(255,252,238,0.92)';
    c.fill();
    c.save();
    rr(c, 8, 8, 240, 240, 36);
    c.clip();
    c.fillStyle = 'rgba(92,200,88,0.85)';
    const h = 240 * p;
    c.fillRect(8, 248 - h, 240, h);
    c.restore();
    c.lineWidth = 8;
    c.strokeStyle = '#ffffff';
    c.setLineDash([22, 14]);
    rr(c, 8, 8, 240, 240, 36);
    c.stroke();
    c.setLineDash([]);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `64px ${EMOJI}`;
    c.fillText(d.icon, 128, 66);
    c.fillStyle = '#2b2a1f';
    c.font = `800 32px ${FONT}`;
    c.direction = 'rtl';
    c.fillText(d.label, 128, 132);
    c.direction = 'ltr';
    if (max > 1) {
      c.font = `800 26px ${FONT}`;
      c.fillStyle = '#5a4a1a';
      c.fillText(`Lv ${level} → ${level + 1}`, 128, 166);
    }
    rr(c, 58, 186, 46, 30, 6);
    c.fillStyle = '#5cc858';
    c.fill();
    c.lineWidth = 4;
    c.strokeStyle = '#2f8f3a';
    c.stroke();
    c.fillStyle = '#2b2a1f';
    c.font = `800 40px ${FONT}`;
    c.textAlign = 'left';
    c.fillText(Math.max(0, Math.ceil(cost - paid)).toLocaleString('en-US'), 114, 203);
    this.tex.needsUpdate = true;
  }

  /** Redraw at most every 80 ms while being paid; immediately on level change. */
  sync(level: number, paid: number, cost: number, dt: number, force: boolean): void {
    this.drawT -= dt;
    const changed = level !== this.shownLevel || Math.abs(paid - this.shownPaid) > 0.5;
    if (force || level !== this.shownLevel || (changed && this.drawT <= 0)) {
      this.draw(level, paid, cost);
      this.shownLevel = level;
      this.shownPaid = paid;
      this.drawT = 0.08;
    }
  }

  dispose(): void { this.tex.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}

/** All visible upgrade tiles, mirrored from the sim's tile list. */
export class TilesView {
  private views = new Map<UpgradeId, TileView>();
  private force = false;

  constructor(private scene: THREE.Scene) {}

  /** Tile world position for coin flights. */
  pos(id: UpgradeId, out: THREE.Vector3): THREE.Vector3 | null {
    const v = this.views.get(id);
    return v ? out.set(v.mesh.position.x, 0.1, v.mesh.position.z) : null;
  }

  sync(sim: SimWorld, dt: number, pop: boolean): void {
    const up = sim.upgrades;
    for (const t of up.tiles) {
      let v = this.views.get(t.def.id);
      if (!v) {
        v = new TileView(t);
        v.popT = pop ? 0 : 1;
        this.views.set(t.def.id, v);
        this.scene.add(v.mesh);
      }
      v.sync(up.level(t.def.id), up.paid[t.def.id], up.cost(t.def.id), dt, this.force);
      if (v.popT < 1) v.popT = Math.min(1, v.popT + dt * 5);
      v.mesh.scale.setScalar(v.popT >= 1 ? 1 : Math.max(0.01, easeOutBack(v.popT)));
    }
    this.force = false;
    if (this.views.size !== up.tiles.length) {
      for (const [id, v] of this.views) {
        if (up.tiles.some((t) => t.def.id === id)) continue;
        this.scene.remove(v.mesh);
        v.dispose();
        this.views.delete(id);
      }
    }
  }

  /** Re-pop a tile (new level bought) so the change reads. */
  bump(id: UpgradeId): void { const v = this.views.get(id); if (v) v.popT = 0; }

  invalidate(): void { this.force = true; }
}
