import * as THREE from 'three';
import type { SimWorld } from '../sim/world';
import type { Station } from '../sim/station';
import { MAT, merge } from './geo';
import { barn, fence, ground } from './worldView';
import { BARN_DEPTH } from '../sim/station';

const GROUND: Record<string, number> = { chicken: 0xe6d07c, cow: 0x7cc044 };

/**
 * A pen's ground, fence and barns; rebuilt (with a little pop) whenever the pen grows. Barns are a
 * separate mesh that fades see-through while the player is behind the pen (field walkway).
 */
class PenMesh {
  mesh: THREE.Mesh | null = null;
  private barns: THREE.Mesh | null = null;
  private barnMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 1 });
  private x0 = NaN;
  private x1 = NaN;
  private popT = 1;

  constructor(private scene: THREE.Scene, private st: Station) {}

  sync(dt: number, px: number, pz: number): void {
    const a = this.st.area;
    if (a.x0 !== this.x0 || a.x1 !== this.x1) {
      const grew = !Number.isNaN(this.x0);
      this.x0 = a.x0;
      this.x1 = a.x1;
      const g: THREE.BufferGeometry[] = [ground(a, GROUND[this.st.def.producer] ?? 0xe6d07c, 0.012)];
      fence(a, g);
      // one barn per ~7 units of width, inside the pen along the back fence (the strip behind the
      // pens is the walkway in front of the crop fields)
      const w = a.x1 - a.x0, n = Math.max(1, Math.round(w / 7)), bg: THREE.BufferGeometry[] = [];
      for (let i = 0; i < n; i++) barn(a.x0 + (w * (i + 0.5)) / n, a.z0 + BARN_DEPTH, bg);
      if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); }
      if (this.barns) { this.mesh?.remove(this.barns); this.barns.geometry.dispose(); }
      this.mesh = new THREE.Mesh(merge(g), MAT);
      this.barns = new THREE.Mesh(merge(bg), this.barnMat);
      this.mesh.add(this.barns);
      this.scene.add(this.mesh);
      if (grew) this.popT = 0;
    }
    // see-through while the player stands behind the pen
    const behind = pz < a.z0 && px > a.x0 - 1.5 && px < a.x1 + 1.5;
    const target = behind ? 0.3 : 1;
    const m = this.barnMat;
    if (m.opacity !== target) {
      m.opacity = target > m.opacity ? Math.min(target, m.opacity + dt * 4) : Math.max(target, m.opacity - dt * 4);
      m.depthWrite = m.opacity > 0.99;
    }
    if (this.popT < 1 && this.mesh) {
      this.popT = Math.min(1, this.popT + dt * 2.5);
      this.mesh.position.y = Math.sin(this.popT * Math.PI) * 0.25;
    }
  }
}

/** All pens. */
export class PenView {
  private pens: PenMesh[];
  constructor(scene: THREE.Scene, sim: SimWorld) {
    this.pens = sim.stations.map((s) => new PenMesh(scene, s));
  }
  sync(dt: number, px: number, pz: number): void { for (const p of this.pens) p.sync(dt, px, pz); }
}
