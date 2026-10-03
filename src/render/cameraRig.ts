import * as THREE from 'three';
import { clamp } from '../sim/math';

const ELEVATION = THREE.MathUtils.degToRad(54);
/** Half the visible world width at the player (units); camera distance adapts to aspect. */
const HALF_WIDTH = 5.6;
/** Follow stiffness. Uses the same real frame delta as movement, so no jitter on 120 Hz. */
const FOLLOW = 16;
/** Softer follow while panning to / from a focus point. */
const FOCUS_FOLLOW = 3.5;

/** Fixed tilted top-down camera that tightly follows a target (or briefly looks at a focus point). */
export class CameraRig {
  private target = new THREE.Vector3();
  private off = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private focusAt = new THREE.Vector3();
  private focusT = 0;
  /** Seconds of soft follow left after a focus ends (smooth pan back). */
  private returnT = 0;
  private zoom = 1;
  private focusZoom = 1;

  constructor(private camera: THREE.PerspectiveCamera) {}

  snap(x: number, z: number): void {
    this.target.set(x, 0, z + 0.6);
    this.update(x, z, 0);
  }

  /** Look at (x, z) for `seconds` (real time), slightly zoomed in, then pan back to the player. */
  focus(x: number, z: number, seconds: number, zoom = 0.75): void {
    this.focusAt.set(x, 0, z + 0.6);
    this.focusT = seconds;
    this.focusZoom = zoom;
  }

  update(x: number, z: number, realDt: number): void {
    const cam = this.camera;
    const focusing = this.focusT > 0;
    if (focusing) { this.focusT -= realDt; if (this.focusT <= 0) this.returnT = 0.9; }
    else if (this.returnT > 0) this.returnT -= realDt;
    const soft = focusing || this.returnT > 0;
    this.zoom += ((focusing ? this.focusZoom : 1) - this.zoom) * (1 - Math.exp(-realDt * FOCUS_FOLLOW));
    const tanH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const d = clamp(HALF_WIDTH / (tanH * cam.aspect), 14, 28) * this.zoom;
    this.off.set(0, Math.sin(ELEVATION) * d, Math.cos(ELEVATION) * d);
    const goal = focusing ? this.focusAt : this.tmp.set(x, 0, z + 0.6);
    this.target.lerp(goal, 1 - Math.exp(-realDt * (soft ? FOCUS_FOLLOW : FOLLOW)));
    cam.position.copy(this.target).add(this.off);
    cam.lookAt(this.target);
  }
}
