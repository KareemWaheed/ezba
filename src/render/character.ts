import * as THREE from 'three';
import { MAT, PRIM, blob, merge, part } from './geo';

export interface Outfit { shirt: number; pants: number; skin: number; hair: number }

interface CharGeo { torso: THREE.BufferGeometry; leg: THREE.BufferGeometry; arm: THREE.BufferGeometry }
const CACHE = new Map<string, CharGeo>();

/** Character geometry is cached per outfit, so spawning customers never rebuilds it. */
function charGeo(o: Outfit): CharGeo {
  const key = `${o.shirt},${o.pants},${o.skin},${o.hair}`;
  let g = CACHE.get(key);
  if (g) return g;
  const { box, sph, cyl } = PRIM;
  g = {
    torso: merge([
      part(cyl, o.shirt, 0, 0.88, 0, 0, 0, 0, 0.3, 0.62, 0.24),
      part(box, o.pants, 0, 0.6, 0, 0, 0, 0, 0.5, 0.14, 0.26),
      part(sph, o.skin, 0, 1.42, 0, 0, 0, 0, 0.26, 0.27, 0.26),
      part(sph, o.hair, 0, 1.53, -0.05, 0, 0, 0, 0.28, 0.19, 0.27),
      part(sph, 0x222222, -0.09, 1.45, 0.23, 0, 0, 0, 0.035, 0.045, 0.035),
      part(sph, 0x222222, 0.09, 1.45, 0.23, 0, 0, 0, 0.035, 0.045, 0.035),
    ]),
    // limbs hang from their pivot (hip / shoulder) so rotation.x swings them
    leg: merge([
      part(box, o.pants, 0, -0.27, 0, 0, 0, 0, 0.2, 0.54, 0.24),
      part(box, 0x5a3a22, 0, -0.55, 0.04, 0, 0, 0, 0.22, 0.1, 0.32),
    ]),
    arm: merge([
      part(box, o.shirt, 0, -0.2, 0, 0, 0, 0, 0.13, 0.42, 0.15),
      part(sph, o.skin, 0, -0.45, 0, 0, 0, 0, 0.08, 0.08, 0.08),
    ]),
  };
  CACHE.set(key, g);
  return g;
}

/** How far the walk cycle advances per unit travelled (radians/unit). Tuned so feet don't slide. */
const STRIDE = 4.4;

export class CharacterView {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  private legL: THREE.Mesh; private legR: THREE.Mesh;
  private armL: THREE.Mesh; private armR: THREE.Mesh;
  private phase = 0;
  private spd = 0;
  private hold = 0;
  /** Called on each footfall while running (for dust puffs). */
  onStep: ((c: CharacterView) => void) | null = null;

  constructor(outfit: Outfit) {
    const g = charGeo(outfit);
    this.root.add(this.body, blob(0.45));
    this.body.add(new THREE.Mesh(g.torso, MAT));
    const limb = (geo: THREE.BufferGeometry, x: number, y: number) => {
      const m = new THREE.Mesh(geo, MAT);
      m.position.set(x, y, 0);
      this.body.add(m);
      return m;
    };
    this.legL = limb(g.leg, -0.14, 0.6); this.legR = limb(g.leg, 0.14, 0.6);
    this.armL = limb(g.arm, -0.37, 1.13); this.armR = limb(g.arm, 0.37, 1.13);
  }

  /** Raise the right arm and wave (call after update()). */
  wave(time: number): void {
    this.armR.rotation.x = -2.7;
    this.armR.rotation.z = -0.3 + Math.sin(time * 9) * 0.35;
  }

  /** Hold something up in front of the face (phone filming), both arms. Call after update(). */
  film(): void {
    this.armL.rotation.x = this.armR.rotation.x = -1.9;
    this.armL.rotation.z = 0.35;
    this.armR.rotation.z = -0.35;
  }

  /** Add a merged accessory mesh to the body (hat, beard...) or to the right hand (props). */
  attach(geo: THREE.BufferGeometry, to: 'body' | 'hand' = 'body'): THREE.Mesh {
    const m = new THREE.Mesh(geo, MAT);
    (to === 'hand' ? this.armR : this.body).add(m);
    return m;
  }

  /**
   * Pose from sim state. The cycle phase advances with distance travelled (speed * dt),
   * not with time, so stride always matches ground speed.
   */
  update(x: number, z: number, rot: number, speed: number, dt: number, carrying: boolean, sitting = false): void {
    this.root.position.set(x, 0, z);
    this.root.rotation.y = rot;
    this.spd += (speed - this.spd) * Math.min(1, dt * 20);
    const prev = this.phase;
    this.phase += this.spd * dt * STRIDE;
    const s = Math.min(1, this.spd / 2.5), sw = Math.sin(this.phase) * 0.95 * s;
    if (this.onStep && s > 0.4 && Math.floor(prev / Math.PI) !== Math.floor(this.phase / Math.PI)) this.onStep(this);
    this.legL.rotation.x = sw;
    this.legR.rotation.x = -sw;
    // arms reach forward to hold a stack, swing when empty
    this.hold += ((carrying ? 1 : 0) - this.hold) * Math.min(1, dt * 10);
    const swing = sw * 0.8 * (1 - this.hold), hold = -1.25 * this.hold;
    this.armL.rotation.x = hold - swing;
    this.armR.rotation.x = hold + swing;
    this.armL.rotation.z = this.armR.rotation.z = 0;
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.11 * s;
    this.body.rotation.z = Math.sin(this.phase) * 0.09 * s;
    this.body.rotation.x = 0.14 * s;
    if (sitting) {
      // seated on a chair: thighs forward, body lowered, hands on the table
      this.legL.rotation.x = this.legR.rotation.x = -1.45;
      this.body.position.y = -0.22;
      this.armL.rotation.x = this.armR.rotation.x = -1.1;
    }
  }
}
