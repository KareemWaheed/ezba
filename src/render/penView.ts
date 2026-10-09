import * as THREE from 'three';
import type { SimWorld } from '../sim/world';
import type { Station } from '../sim/station';
import { MAT, PRIM, merge, part } from './geo';
import { barn, fence, ground, hive } from './worldView';
import { BARN_DEPTH } from '../sim/station';

const GROUND: Record<string, number> = { chicken: 0xe6d07c, cow: 0x7cc044, bee: 0x9fd86a };

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
      const g: THREE.BufferGeometry[] = [ground(a, GROUND[this.st.def.producer ?? ''] ?? 0xe6d07c, 0.012)];
      fence(a, g);
      if (this.st.def.producer === 'bee') {
        // flowers for the bees (fixed pattern, so a rebuild looks the same)
        for (let i = 0; i < 26; i++) {
          const fx = a.x0 + 0.4 + ((i * 0.618) % 1) * (a.x1 - a.x0 - 0.8), fz = a.z0 + 2.2 + ((i * 0.381 + 0.17) % 1) * (a.z1 - a.z0 - 2.6);
          g.push(part(PRIM.cylLo, 0x4f9e3a, fx, 0.12, fz, 0, 0, 0, 0.02, 0.24, 0.02), part(PRIM.sphLo, [0xf26b8a, 0xffffff, 0xf2c230, 0xb07ad9][i % 4], fx, 0.26, fz, 0, 0, 0, 0.09, 0.06, 0.09));
        }
      }
      // one barn per ~7 units of width, inside the pen along the back fence (the strip behind the
      // pens is the walkway in front of the crop fields)
      const w = a.x1 - a.x0, n = Math.max(1, Math.round(w / 7)), bg: THREE.BufferGeometry[] = [];
      if (this.st.def.producer === 'bee') {
        // an apiary: a row of hives along the back fence and flowers dotted about
        for (let i = 0; i < 3; i++) hive(a.x0 + (w * (i + 0.5)) / 3, a.z0 + BARN_DEPTH * 0.6, bg);
        hive(a.x0 + w * 0.3, a.z0 + BARN_DEPTH + 2.2, bg); hive(a.x0 + w * 0.72, a.z0 + BARN_DEPTH + 3.4, bg);
      } else for (let i = 0; i < n; i++) barn(a.x0 + (w * (i + 0.5)) / n, a.z0 + BARN_DEPTH, bg);
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
    this.pens = sim.stations.filter((s) => s.farmed).map((s) => new PenMesh(scene, s));
  }
  sync(dt: number, px: number, pz: number): void { for (const p of this.pens) p.sync(dt, px, pz); }
}
