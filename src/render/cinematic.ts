import type { CameraRig } from './cameraRig';

/**
 * Event entrances: the camera pans to the guest, letterbox bars slide in and the game slows down
 * for a moment. The slow-down scales how much real time the sim advances (like the debug speed),
 * never the sim's step, so the sim stays deterministic.
 */
export class Cinematic {
  private bars: HTMLElement;
  private t = 0;
  private slowT = 0;

  constructor(root: HTMLElement, private rig: CameraRig) {
    root.insertAdjacentHTML('beforeend', '<div id="cine" hidden><div class="cine-bar top"></div><div class="cine-bar bottom"></div></div>');
    this.bars = root.querySelector('#cine')!;
  }

  /** Pan to (x, z) for an entrance. */
  play(x: number, z: number, seconds = 2.6): void {
    this.rig.focus(x, z, seconds);
    this.t = seconds;
    this.slowT = 1.2;
    this.bars.hidden = false;
    this.bars.classList.remove('on');
    void this.bars.offsetWidth;
    this.bars.classList.add('on');
  }

  get playing(): boolean { return this.t > 0; }

  /** Sim speed factor for this frame (1 = normal). */
  get timeScale(): number { return this.slowT > 0 ? 0.35 : 1; }

  update(real: number): void {
    if (this.t <= 0) return;
    this.t -= real;
    this.slowT -= real;
    if (this.t <= 0) {
      this.bars.classList.remove('on');
      window.setTimeout(() => { if (this.t <= 0) this.bars.hidden = true; }, 400);
    }
  }
}
