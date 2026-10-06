/** Joystick radius in CSS px. */
const RADIUS = 55;

/**
 * Floating virtual joystick (touch anywhere, drag to move) plus WASD/arrows for desktop.
 * Produces a stick vector with magnitude 0..1: x = right, z = down-screen (toward the camera).
 */
export class Input {
  x = 0;
  z = 0;
  /** True once the player has moved at least once (hides the hint). */
  moved = false;
  private sx = 0; private sz = 0;
  private id: number | null = null;
  private ox = 0; private oy = 0;
  private keys = new Set<string>();
  private joy: HTMLElement; private knob: HTMLElement;
  /** Called on first user gesture (audio unlock etc.). */
  onGesture: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.joy = document.createElement('div');
    this.joy.id = 'joy';
    this.joy.hidden = true;
    this.knob = document.createElement('div');
    this.knob.id = 'knob';
    this.joy.appendChild(this.knob);
    root.appendChild(this.joy);

    addEventListener('pointerdown', (e) => {
      this.onGesture?.();
      if ((e.target as HTMLElement).closest('[data-ui]')) return;
      this.id = e.pointerId; this.ox = e.clientX; this.oy = e.clientY;
      this.joy.style.left = `${e.clientX}px`;
      this.joy.style.top = `${e.clientY}px`;
      this.knob.style.transform = '';
      this.joy.hidden = false;
    });
    addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.id) return;
      let dx = e.clientX - this.ox, dy = e.clientY - this.oy;
      const d = Math.hypot(dx, dy);
      if (d > RADIUS) { dx *= RADIUS / d; dy *= RADIUS / d; }
      this.sx = dx / RADIUS; this.sz = dy / RADIUS;
      this.knob.style.transform = `translate(${dx}px,${dy}px)`;
      if (d > 12) this.moved = true;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.id) return;
      this.id = null; this.sx = this.sz = 0; this.joy.hidden = true;
    };
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
    addEventListener('keydown', (e) => {
      this.onGesture?.();
      // typing in a text box (the transfer code) doesn't walk the player
      if ((e.target as HTMLElement).closest?.('textarea, input')) return;
      this.keys.add(e.key.toLowerCase());
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => { this.keys.clear(); this.id = null; this.sx = this.sz = 0; this.joy.hidden = true; });
  }

  /** Refresh x/z from stick and keys. Call once per frame. */
  poll(): void {
    const k = this.keys;
    const kx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    const kz = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
    if (kx || kz) {
      const m = Math.hypot(kx, kz);
      this.x = kx / m; this.z = kz / m; this.moved = true;
    } else { this.x = this.sx; this.z = this.sz; }
  }
}
