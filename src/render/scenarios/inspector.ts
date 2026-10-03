import * as THREE from 'three';
import type { InspectorMechanic } from '../../sim/scenarios/inspector';
import type { SimWorld } from '../../sim/world';
import { CanvasSprite, EMOJI, FONT } from '../canvas';
import type { MechanicView } from './types';

type MarkState = 'todo' | 'bad' | 'pass' | 'fail';

/**
 * Inspector: a numbered badge over every stop on the route — red while it still needs fixing,
 * green when it's fine — turning into ✅ / ❌ once the inspector has judged it.
 */
export class InspectorView implements MechanicView {
  private group = new THREE.Group();
  private marks: { s: CanvasSprite; state: MarkState | '' }[] = [];
  private time = 0;

  constructor(private scene: THREE.Scene) {
    scene.add(this.group);
  }

  private draw(m: { s: CanvasSprite; state: MarkState | '' }, n: number, state: MarkState): void {
    m.state = state;
    m.s.draw((c, w, h) => {
      c.beginPath();
      c.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2);
      c.fillStyle = state === 'bad' ? '#e0483e' : state === 'todo' ? '#2fb59a' : '#ffffff';
      c.fill();
      c.lineWidth = 6;
      c.strokeStyle = '#ffffff';
      c.stroke();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      if (state === 'pass' || state === 'fail') { c.font = `52px ${EMOJI}`; c.fillText(state === 'pass' ? '✅' : '❌', w / 2, h / 2 + 3); }
      else { c.fillStyle = '#fff'; c.font = `800 54px ${FONT}`; c.fillText(String(n), w / 2, h / 2 + 4); }
    });
  }

  sync(sim: SimWorld, dt: number): void {
    this.time += dt;
    const m = sim.scenario.mech as InspectorMechanic;
    const route = m.route ?? [];
    route.forEach((c, i) => {
      let mk = this.marks[i];
      if (!mk) { mk = { s: new CanvasSprite(96, 96, 0.8), state: '' }; this.marks[i] = mk; this.group.add(mk.s.sprite); }
      const state: MarkState = c.passed === true ? 'pass' : c.passed === false ? 'fail' : m.fine(sim, c) ? 'todo' : 'bad';
      if (mk.state !== state) this.draw(mk, i + 1, state);
      const bob = state === 'bad' ? Math.abs(Math.sin(this.time * 5 + i)) * 0.2 : 0;
      mk.s.sprite.position.set(c.x, 2.3 + bob, c.z);
    });
  }

  dispose(): void {
    this.scene.remove(this.group);
    for (const m of this.marks) m.s.dispose();
  }
}
