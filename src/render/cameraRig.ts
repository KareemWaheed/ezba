import * as THREE from 'three';
import { clamp } from '../sim/math';

const ELEVATION = THREE.MathUtils.degToRad(54);
/** Half the visible world width at the player (units); camera distance adapts to aspect. */
const HALF_WIDTH = 5.6;
/** Follow stiffness. Uses the same real frame delta as movement, so no jitter on 120 Hz. */
const FOLLOW = 16;

/** Fixed tilted top-down camera that tightly follows a target. */
export class CameraRig {
  private target = new THREE.Vector3();
  private off = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  constructor(private camera: THREE.PerspectiveCamera) {}

  snap(x: number, z: number): void {
    this.target.set(x, 0, z + 0.6);
    this.update(x, z, 0);
  }

  update(x: number, z: number, realDt: number): void {
    const cam = this.camera;
    const tanH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const d = clamp(HALF_WIDTH / (tanH * cam.aspect), 14, 28);
    this.off.set(0, Math.sin(ELEVATION) * d, Math.cos(ELEVATION) * d);
    this.target.lerp(this.tmp.set(x, 0, z + 0.6), 1 - Math.exp(-realDt * FOLLOW));
    cam.position.copy(this.target).add(this.off);
    cam.lookAt(this.target);
  }
}
