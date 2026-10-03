import * as THREE from 'three';
import type { ChaseMechanic } from '../../sim/scenarios/chase';
import type { SimWorld } from '../../sim/world';
import { CharacterView } from '../character';
import { bodyAccessories } from '../accessories';
import { PRIM, merge, part } from '../geo';
import type { MechanicView } from './types';

const { box, sph, cyl } = PRIM;
/** Money sack over the shoulder. */
const SACK = merge([part(sph, 0xc8a46a, 0, -0.35, 0.05, 0, 0, 0, 0.26, 0.3, 0.24), part(box, 0x2f8f3a, 0, -0.2, 0.25, 0, 0, 0, 0.14, 0.1, 0.02)]);
/** Black-and-white stripes, drawn as thin bands on the torso. */
const STRIPES = merge([0.74, 0.9, 1.06].map((y) => part(cyl, 0xffffff, 0, y, 0, 0, 0, 0, 0.31, 0.06, 0.25)));

/**
 * Thief chase: the thief in a striped shirt runs with a money sack; once caught he stops, and a
 * policeman walks up and leads him away.
 */
export class ChaseView implements MechanicView {
  private thief: CharacterView;
  private police: CharacterView | null = null;
  private time = 0;
  private walkT = 0;

  constructor(private scene: THREE.Scene) {
    this.thief = new CharacterView({ shirt: 0x1d1d1d, pants: 0x2e2e2e, skin: 0xd9a074, hair: 0x1d1d1d });
    this.thief.attach(STRIPES);
    const hat = bodyAccessories({ hat: { kind: 'cap', color: 0x1d1d1d } });
    if (hat) this.thief.attach(hat);
    this.thief.attach(SACK, 'hand');
    scene.add(this.thief.root);
  }

  sync(sim: SimWorld, dt: number): void {
    this.time += dt;
    const m = sim.scenario.mech as ChaseMechanic;
    if (!m.thief) return;
    const t = m.thief;
    this.thief.update(t.x, t.z, t.rot, m.caught ? 0 : t.speed, dt, false);
    if (m.caught) {
      this.thief.wave(this.time);
      if (!this.police) {
        this.police = new CharacterView({ shirt: 0xf3efe3, pants: 0x1d1d1d, skin: 0xc8916a, hair: 0x1d1d1d });
        const cap = bodyAccessories({ hat: { kind: 'cap', color: 0x1d1d1d } });
        if (cap) this.police.attach(cap);
        this.scene.add(this.police.root);
      }
      // walks in from the side and stands next to him
      this.walkT = Math.min(1, this.walkT + dt / 1.5);
      const px = t.x + 0.8 + (1 - this.walkT) * 4, pz = t.z;
      this.police.update(px, pz, -Math.PI / 2, this.walkT < 1 ? 1.5 : 0, dt, false);
    }
  }

  dispose(): void {
    this.scene.remove(this.thief.root);
    if (this.police) this.scene.remove(this.police.root);
  }
}
