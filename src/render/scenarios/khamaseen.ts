import * as THREE from 'three';
import type { KhamaseenMechanic } from '../../sim/scenarios/khamaseen';
import type { SimWorld } from '../../sim/world';
import { MAT, PRIM, merge, part } from '../geo';
import type { Renderer } from '../renderer';
import type { MechanicView } from './types';

const { box } = PRIM;
/** A tarp pulled over a pile, weighted with two stones. */
const TARP = merge([
  part(box, 0x2f6f9a, 0, 0.55, 0, 0.12, 0, 0, 1.7, 0.08, 1.5),
  part(box, 0x8a8a8a, -0.7, 0.62, 0.6, 0, 0, 0, 0.2, 0.15, 0.2),
  part(box, 0x8a8a8a, 0.7, 0.5, -0.6, 0, 0, 0, 0.2, 0.15, 0.2),
]);
const GRAINS = 140;

/**
 * Khamaseen: a sandy haze closes in, sand streaks blow across the screen, and covered piles get a
 * blue tarp. The ring under an uncovered pile fills while the player stands there.
 */
export class KhamaseenView implements MechanicView {
  private group = new THREE.Group();
  private tarps = new Map<number, THREE.Mesh>();
  private rings = new Map<number, THREE.Mesh>();
  private sand: THREE.InstancedMesh;
  private pos = new Float32Array(GRAINS * 3);
  private m = new THREE.Matrix4();

  constructor(private scene: THREE.Scene, private view: Renderer) {
    this.sand = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: 0xf0d8a0, transparent: true, opacity: 0.85 }), GRAINS);
    this.sand.frustumCulled = false;
    this.group.add(this.sand);
    scene.add(this.group);
    view.setHaze(0xd8b070, 0.65);
  }

  sync(sim: SimWorld, dt: number): void {
    this.view.setMood(0.82);
    const k = sim.scenario.mech as KhamaseenMechanic;
    if (!k.covered) return;
    const p = sim.player;
    // sand blowing west to east around the player
    for (let i = 0; i < GRAINS; i++) {
      let x = this.pos[i * 3], y = this.pos[i * 3 + 1], z = this.pos[i * 3 + 2];
      x += dt * (9 + (i % 5));
      if (x > p.x + 12 || y === 0) { x = p.x - 12 + Math.random() * 3; y = 0.2 + Math.random() * 2.5; z = p.z + (Math.random() - 0.5) * 20; }
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      this.m.makeTranslation(x, y, z);
      this.sand.setMatrixAt(i, this.m);
    }
    this.sand.instanceMatrix.needsUpdate = true;
    sim.stations.forEach((st, i) => {
      if (!st.open || !st.farmed) return;
      const pile = st.def.pile;
      if (k.covered[i] && !this.tarps.has(i)) {
        const t = new THREE.Mesh(TARP, MAT);
        t.position.set(pile.x, 0, pile.z);
        this.group.add(t);
        this.tarps.set(i, t);
      }
      let ring = this.rings.get(i);
      if (!ring) {
        ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.15, 32, 1, 0, Math.PI * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
        ring.position.set(pile.x, 0.04, pile.z);
        this.group.add(ring);
        this.rings.set(i, ring);
      }
      ring.visible = !k.covered[i];
      const f = Math.min(1, (k.coverT[i] ?? 0) / 1.5);
      (ring.material as THREE.MeshBasicMaterial).color.setHex(f > 0 ? 0x3ddc84 : 0xffffff);
      ring.scale.setScalar(1 - f * 0.5);
    });
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.view.setHaze(0xd8b070, 0);
    this.view.setMood(1);
  }
}
