import * as THREE from 'three';

export const FONT = '"Baloo Bhaijaan 2", Tahoma, sans-serif';
export const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

/** Rounded-rect path. */
export function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** A sprite backed by its own canvas; call redraw() then it uploads once. */
export class CanvasSprite {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly tex: THREE.CanvasTexture;
  readonly sprite: THREE.Sprite;

  constructor(w: number, h: number, worldW: number, onTop = true) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.NoColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthTest: !onTop }));
    if (onTop) this.sprite.renderOrder = 10;
    this.sprite.scale.set(worldW, (worldW * h) / w, 1);
  }

  /** Clear, draw, upload. */
  draw(fn: (c: CanvasRenderingContext2D, w: number, h: number) => void): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    fn(this.ctx, this.canvas.width, this.canvas.height);
    this.tex.needsUpdate = true;
  }

  dispose(): void {
    this.tex.dispose();
    this.sprite.material.dispose();
  }
}

/** Flat ground decal with a canvas texture (drop zones, cash spot). */
export function groundMarker(icon: string, size: number, fill: string, stroke: string): THREE.Mesh {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const c = cv.getContext('2d')!;
  rr(c, 10, 10, 236, 236, 40);
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = 10;
  c.strokeStyle = stroke;
  c.setLineDash([26, 16]);
  rr(c, 10, 10, 236, 236, 40);
  c.stroke();
  if (icon) {
    c.setLineDash([]);
    c.globalAlpha = 0.55;
    c.font = `96px ${EMOJI}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(icon, 128, 134);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  m.position.y = 0.025;
  return m;
}
