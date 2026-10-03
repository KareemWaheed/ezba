import * as THREE from 'three';
import './threeSetup';

export type Quality = 'auto' | 1 | 1.5 | 2;

/**
 * WebGL renderer + adaptive resolution.
 * Starts at min(devicePixelRatio, 2). In 'auto' it may try a lower ratio when frames are slow,
 * keeps it only if FPS improves by >= 12%, otherwise restores sharpness and stops adapting.
 * Never goes below 1x.
 */
export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  readonly maxPR = Math.min(window.devicePixelRatio || 1, 2);
  pixelRatio = this.maxPR;
  quality: Quality = 'auto';
  fps = 0;

  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private sky = new THREE.Color(0xa7dcf2);
  private mood = 1;
  private moodTarget = 1;
  private flash = 0;
  private haze = 0;
  private hazeTarget = 0;
  private hazeColor = new THREE.Color();
  private fAcc = 0; private fN = 0; private slowStreak = 0;
  private adaptLocked = false;
  private trial: { pr: number; fps: number; wait: number } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(this.pixelRatio);
    // Match the r128 prototype's look: hex colors used as-is, no sRGB conversion on output.
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    const sky = 0xa7dcf2;
    this.scene.background = new THREE.Color(sky);
    this.scene.fog = new THREE.Fog(sky, 40, 80);
    // Physically based light units: intensities here match the r128 prototype's look (old values x PI).
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x88aa55, 2.45);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.73);
    this.sun.position.set(-6, 12, 8);
    this.scene.add(this.sun);
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize(): void {
    this.gl.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  setPixelRatio(pr: number): void {
    this.pixelRatio = pr;
    this.gl.setPixelRatio(pr);
    this.resize();
  }

  setQuality(q: Quality): void {
    this.quality = q;
    if (q === 'auto') { this.adaptLocked = false; this.trial = null; this.setPixelRatio(this.maxPR); }
    else this.setPixelRatio(Math.max(1, Math.min(q, window.devicePixelRatio || 1)));
  }

  /** Feed real frame time; evaluates once per second. */
  measure(real: number): void {
    this.fAcc += real; this.fN++;
    if (this.fAcc < 1) return;
    const ms = (this.fAcc / this.fN) * 1000, fps = 1000 / ms;
    this.fps = fps; this.fAcc = 0; this.fN = 0;
    if (this.quality !== 'auto' || this.adaptLocked || document.hidden) return;
    if (this.trial) {
      if (--this.trial.wait > 0) return;
      // lowering resolution didn't buy frames (e.g. browser capped at 30/60): restore and stop
      if (fps < this.trial.fps * 1.12) { this.setPixelRatio(this.trial.pr); this.adaptLocked = true; }
      this.trial = null;
      return;
    }
    if (ms > 21 && this.pixelRatio > 1) {
      if (++this.slowStreak >= 3) {
        this.trial = { pr: this.pixelRatio, fps, wait: 2 };
        this.setPixelRatio(Math.max(1, this.pixelRatio - 0.5));
        this.slowStreak = 0;
      }
    } else this.slowStreak = 0;
  }

  /** Scene brightness 0..1 (storms darken it); eases toward the target. */
  setMood(target: number): void { this.moodTarget = target; }
  /** A lightning flash. */
  lightning(): void { this.flash = 1; }
  /** Haze over the scene (e.g. a sandstorm): sky and fog blend toward `color` and the fog closes in. 0 = off. */
  setHaze(color: number, amount: number): void { this.hazeColor.setHex(color); this.hazeTarget = amount; }

  private applyMood(dt: number): void {
    this.mood += (this.moodTarget - this.mood) * Math.min(1, dt * 2);
    this.flash = Math.max(0, this.flash - dt * 4);
    const k = Math.min(1.6, this.mood + this.flash * 1.2);
    this.hemi.intensity = 2.45 * k;
    this.sun.intensity = 1.73 * k;
    this.haze += (this.hazeTarget - this.haze) * Math.min(1, dt * 1.5);
    if (Math.abs(this.haze - this.hazeTarget) < 0.002) this.haze = this.hazeTarget;
    const bg = this.scene.background as THREE.Color, fog = this.scene.fog as THREE.Fog;
    bg.copy(this.sky).multiplyScalar(0.35 + 0.65 * Math.min(1, k)).lerp(this.hazeColor, this.haze);
    fog.color.copy(bg);
    fog.near = 40 - 32 * this.haze;
    fog.far = 80 - 52 * this.haze;
  }

  render(dt = 0): void {
    if (this.mood !== this.moodTarget || this.flash > 0 || this.haze !== this.hazeTarget) this.applyMood(dt);
    this.gl.render(this.scene, this.camera);
  }
}
