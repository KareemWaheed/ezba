import * as THREE from 'three';
import { LAYOUT } from '../../config/layout';
import type { IftarMechanic } from '../../sim/scenarios/iftar';
import type { SimWorld } from '../../sim/world';
import { MAT, PRIM, merge, part } from '../geo';
import { ITEM_GEO, ITEM_ICON } from '../models';
import { CanvasSprite, EMOJI } from '../canvas';
import type { MechanicView } from './types';

const { box, cyl, sph } = PRIM;
const T = LAYOUT.iftarTable;

/** Long table with a cloth runner, benches on both sides and Ramadan lanterns at the ends. */
function tableGeo(): THREE.BufferGeometry {
  const len = (T.places - 1) * T.gap + 1.4, cx = T.x0 + ((T.places - 1) * T.gap) / 2;
  const legs = [-1, 1].flatMap((a) => [-1, 1].map((b) => part(box, 0x7a4a2a, cx + a * (len / 2 - 0.2), 0.3, T.z + b * 0.35, 0, 0, 0, 0.1, 0.6, 0.1)));
  const lantern = (x: number) => [
    part(cyl, 0x3b2a1a, x, 1.0, T.z, 0, 0, 0, 0.03, 2.0, 0.03),
    part(cyl, 0xd9a43a, x, 2.0, T.z, 0, 0, 0, 0.18, 0.4, 0.18),
    part(sph, 0xffe08a, x, 2.0, T.z, 0, 0, 0, 0.13, 0.15, 0.13),
    part(cyl, 0xb07d20, x, 2.27, T.z, 0, 0, 0, 0.06, 0.14, 0.06),
  ];
  return merge([
    part(box, 0x8a5a32, cx, 0.62, T.z, 0, 0, 0, len, 0.06, 0.95),
    part(box, 0xf3efe3, cx, 0.66, T.z, 0, 0, 0, len, 0.02, 0.5),
    part(box, 0x9a6233, cx, 0.32, T.z - 1.05, 0, 0, 0, len, 0.06, 0.32),
    part(box, 0x9a6233, cx, 0.32, T.z + 1.05, 0, 0, 0, len, 0.06, 0.32),
    ...legs,
    ...lantern(T.x0 - 1.0), ...lantern(T.x0 + (T.places - 1) * T.gap + 1.0),
  ]);
}

const PLATE = merge([part(cyl, 0xffffff, 0, 0.68, 0, 0, 0, 0, 0.22, 0.03, 0.22)]);

/**
 * Iftar table: plates show what each seat wants until filled (then the food sits on the plate); a
 * countdown to Maghrib floats over the table, and the cannon flash comes from the HUD/sound.
 */
export class IftarView implements MechanicView {
  private group = new THREE.Group();
  private food: (THREE.Mesh | null)[] = [];
  private tags: CanvasSprite[] = [];
  private shown: string[] = [];
  private built = false;

  constructor(private scene: THREE.Scene) {
    this.group.add(new THREE.Mesh(tableGeo(), MAT));
    scene.add(this.group);
  }

  sync(sim: SimWorld): void {
    const m = sim.scenario.mech as IftarMechanic;
    if (!m.plates) return;
    if (!this.built && m.plates.length) {
      this.built = true;
      m.plates.forEach((p) => {
        const plate = new THREE.Mesh(PLATE, MAT);
        plate.position.set(p.x, 0, p.z * 0.5 + T.z * 0.5);
        this.group.add(plate);
        this.food.push(null);
        const tag = new CanvasSprite(48, 48, 0.4);
        tag.sprite.position.set(p.x, 1.25, p.z * 0.5 + T.z * 0.5);
        this.group.add(tag.sprite);
        this.tags.push(tag);
        this.shown.push('');
      });
    }
    m.plates.forEach((p, i) => {
      const z = p.z * 0.5 + T.z * 0.5;
      if (p.filled && !this.food[i]) {
        const f = new THREE.Mesh(ITEM_GEO[p.want], MAT);
        f.scale.setScalar(0.6);
        f.position.set(p.x, 0.7, z);
        this.group.add(f);
        this.food[i] = f;
      }
      const key = p.filled ? 'ok' : p.want;
      if (this.shown[i] !== key) {
        this.shown[i] = key;
        this.tags[i].sprite.visible = !p.filled;
        if (!p.filled) this.tags[i].draw((c, w, h) => { c.font = `34px ${EMOJI}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ITEM_ICON[p.want], w / 2, h / 2 + 2); });
      }
    });
  }

  dispose(): void {
    this.scene.remove(this.group);
    for (const t of this.tags) t.dispose();
  }
}

