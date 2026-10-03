import * as THREE from 'three';
import { LAYOUT } from '../../config/layout';
import type { MotorcadeMechanic } from '../../sim/scenarios/motorcade';
import type { SimWorld } from '../../sim/world';
import { MAT, PRIM, merge, part } from '../geo';
import type { Renderer } from '../renderer';
import type { MechanicView } from './types';

const { box } = PRIM;
const ARCH = merge([
  part(box, 0x9aa3ad, -0.75, 1.1, 0, 0, 0, 0, 0.18, 2.2, 0.4),
  part(box, 0x9aa3ad, 0.75, 1.1, 0, 0, 0, 0, 0.18, 2.2, 0.4),
  part(box, 0x9aa3ad, 0, 2.25, 0, 0, 0, 0, 1.7, 0.18, 0.4),
  part(box, 0x2b3a4e, 0, 2.25, 0.21, 0, 0, 0, 0.6, 0.12, 0.02),
]);

/**
 * President visits: a security arch on the carpet (lamp turns green once your load is checked) and,
 * for the photo-op, a marker by the guest that pulses during the countdown, with a camera flash.
 */
export class MotorcadeView implements MechanicView {
  private group = new THREE.Group();
  private lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshBasicMaterial({ color: 0xe0483e }));
  private arch: THREE.Mesh | null = null;
  private marker: THREE.Mesh;
  private time = 0;
  private lastTries = 0;

  constructor(private scene: THREE.Scene, private view: Renderer) {
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true }));
    const ph = LAYOUT.vipStage.photo;
    this.marker.position.set(ph.x, 0.05, ph.z);
    this.marker.visible = false;
    this.group.add(this.marker);
    scene.add(this.group);
  }

  sync(sim: SimWorld, dt: number): void {
    this.time += dt;
    const m = sim.scenario.mech as MotorcadeMechanic;
    if (!m.variant) return;
    if (m.variant === 'escort' && !this.arch) {
      const g = LAYOUT.vipStage.gate, e = LAYOUT.vipStage.entry, d = LAYOUT.vipStage.drop;
      this.arch = new THREE.Mesh(ARCH, MAT);
      this.arch.position.set(g.x, 0, g.z);
      // across the carpet
      this.arch.rotation.y = Math.atan2(d.x - e.x, d.z - e.z) + Math.PI / 2;
      this.lamp.position.set(0, 2.45, 0);
      this.arch.add(this.lamp);
      this.group.add(this.arch);
    }
    if (this.arch) (this.lamp.material as THREE.MeshBasicMaterial).color.setHex(m.cleared ? 0x3ddc84 : 0xe0483e);
    const photoOn = m.variant === 'photo' && sim.scenario.guestServed && !m.photoTaken && m.photoTries < 2;
    this.marker.visible = photoOn;
    if (photoOn) {
      const s = 1 + Math.abs(Math.sin(this.time * 6)) * 0.25;
      this.marker.scale.set(s, 1, s);
    }
    // camera flash when the photographer shoots
    if (m.photoTries !== this.lastTries) { this.lastTries = m.photoTries; this.view.lightning(); }
  }

  dispose(): void {
    this.scene.remove(this.group);
  }
}
