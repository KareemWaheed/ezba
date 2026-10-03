import * as THREE from 'three';
import { LAYOUT } from '../../config/layout';
import { STEP, type StageMechanic } from '../../sim/scenarios/stage';
import type { SimWorld } from '../../sim/world';
import { CanvasSprite, FONT } from '../canvas';
import type { MechanicView } from './types';

const COLORS = [0xff4fa3, 0x4fc3ff, 0xffd23f, 0x7dff6a];
const PAD = new THREE.BoxGeometry(1.15, 0.06, 1.15);

/**
 * Concert dance floor: four colored pads; the lit one glows and pulses on the beat, with a shrinking
 * ring showing when the beat lands. A combo counter floats over the floor.
 */
export class StageView implements MechanicView {
  private group = new THREE.Group();
  private pads: THREE.Mesh[] = [];
  private ring: THREE.Mesh;
  private combo = new CanvasSprite(256, 96, 2.2);
  private shownCombo = -1;
  private time = 0;

  constructor(private scene: THREE.Scene) {
    LAYOUT.dancePads.forEach((p, i) => {
      const m = new THREE.Mesh(PAD, new THREE.MeshBasicMaterial({ color: COLORS[i] }));
      m.position.set(p.x, 0.03, p.z);
      this.pads.push(m);
      this.group.add(m);
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.72, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
    this.ring.position.y = 0.08;
    this.group.add(this.ring);
    const c = LAYOUT.dancePads.reduce((a, p) => ({ x: a.x + p.x / 4, z: a.z + p.z / 4 }), { x: 0, z: 0 });
    this.combo.sprite.position.set(c.x, 2.4, c.z - 1.6);
    this.group.add(this.combo.sprite);
    scene.add(this.group);
  }

  sync(sim: SimWorld, dt: number): void {
    this.time += dt;
    const m = sim.scenario.mech as StageMechanic;
    if (!m.pads) return;
    const k = m.beatT / STEP;
    this.pads.forEach((pad, i) => {
      const mat = pad.material as THREE.MeshBasicMaterial;
      const lit = i === m.lit;
      mat.color.setHex(COLORS[i]).multiplyScalar(lit ? 1 : 0.32);
      pad.position.y = lit ? 0.03 + Math.abs(Math.sin(k * Math.PI * 2)) * 0.06 : 0.03;
    });
    // ring closes in on the lit pad as the beat approaches
    const lp = m.pads[m.lit];
    this.ring.position.x = lp.x;
    this.ring.position.z = lp.z;
    const s = 1 + (1 - k) * 1.2;
    this.ring.scale.set(s, 1, s);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + k * 0.65;
    if (m.combo !== this.shownCombo) {
      this.shownCombo = m.combo;
      this.combo.draw((c, w, h) => {
        if (m.combo < 2) return;
        c.fillStyle = 'rgba(80,70,200,0.85)';
        c.beginPath(); c.roundRect(4, 4, w - 8, h - 8, 22); c.fill();
        c.fillStyle = '#fff'; c.font = `800 52px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(`🎵 x${m.combo}`, w / 2, h / 2 + 4);
      });
    }
  }

  dispose(): void {
    this.scene.remove(this.group);
    for (const p of this.pads) (p.material as THREE.Material).dispose();
    this.combo.dispose();
  }
}
