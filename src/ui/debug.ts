import { SCENARIOS } from '../config/scenarios';
import type { SimWorld } from '../sim/world';
import type { Renderer, Quality } from '../render/renderer';

export interface DebugHooks {
  /** Simulate this much time away (shows the welcome-back popup). */
  away(seconds: number): void;
  reset(): void;
}

/**
 * Hidden debug panel (triple-tap the money counter): money, game speed, time away, pressure events,
 * render quality, FPS, reset. Works in production builds too (it's a personal game).
 */
export class DebugPanel {
  readonly el: HTMLElement;
  /** Game speed multiplier (1, 5, 10). */
  speed = 1;
  private fps: HTMLElement;
  private fpsT = 0;
  private moneyHold = 0;
  private moneyStep = 500;

  constructor(root: HTMLElement, sim: SimWorld, private view: Renderer, hooks: DebugHooks, trigger: HTMLElement) {
    root.insertAdjacentHTML('beforeend', `
      <div id="dev" data-ui hidden>
        <div class="d-row"><span id="fps"></span><button data-a="close" class="close">✕</button></div>
        <div class="d-row"><b>فلوس</b><button data-a="money">+500 (اضغط مطوّل)</button><button data-a="money10k">+10,000</button></div>
        <div class="d-row"><b>السرعة</b>${[1, 5, 10].map((s) => `<button data-speed="${s}">x${s}</button>`).join('')}</div>
        <div class="d-row"><b>غياب</b><button data-away="600">10 د</button><button data-away="3600">ساعة</button><button data-away="7200">ساعتين</button></div>
        <div class="d-row"><b>أحداث</b><button data-a="rush">زحمة</button><button data-a="break">عطل</button><button data-a="vip">VIP</button><button data-a="golden">دهبي</button><button data-a="event">حدث 🎉</button><button data-a="win">كسّب الحدث ✅</button></div>
        <div class="d-row d-events"><b>حدث</b>${SCENARIOS.map((s) => `<button data-ev="${s.id}" title="${s.id}">${s.icon}</button>`).join('')}</div>
        <div class="d-row"><b>الجودة</b>${['auto', 1, 1.5, 2].map((q) => `<button data-q="${q}">${q === 'auto' ? 'تلقائي' : `${q}x`}</button>`).join('')}</div>
        <div class="d-row"><button data-a="reset" class="close">ابدأ من الأول</button></div>
      </div>`);
    this.el = root.querySelector('#dev')!;
    this.fps = this.el.querySelector('#fps')!;
    // "+500": tap adds 500; hold to keep adding, faster and faster
    const moneyBtn = this.el.querySelector('[data-a="money"]') as HTMLElement;
    const stop = () => { window.clearInterval(this.moneyHold); this.moneyHold = 0; };
    moneyBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sim.money += 500;
      this.moneyStep = 500;
      stop();
      this.moneyHold = window.setInterval(() => { sim.money += this.moneyStep; this.moneyStep = Math.round(this.moneyStep * 1.25); }, 120);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) moneyBtn.addEventListener(ev, stop);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      const a = b.dataset.a;
      if (a === 'close') this.el.hidden = true;
      if (a === 'money10k') sim.money += 10000;
      if (a === 'rush') sim.rush.trigger();
      if (a === 'break') for (const m of sim.staff.machines) if (m.running) { m.breakT = 0.01; break; }
      if (a === 'vip') sim.customers.forceVip = true;
      if (a === 'golden') sim.golden.spawn();
      if (a === 'event') sim.scenario.trigger();
      if (a === 'win') sim.scenario.debugWin = true;
      if (b.dataset.ev) sim.scenario.trigger(b.dataset.ev);
      if (a === 'reset') hooks.reset();
      if (b.dataset.speed) this.speed = Number(b.dataset.speed);
      if (b.dataset.away) hooks.away(Number(b.dataset.away));
      if (b.dataset.q) view.setQuality((b.dataset.q === 'auto' ? 'auto' : Number(b.dataset.q)) as Quality);
      this.mark();
    });
    let taps: number[] = [];
    trigger.addEventListener('pointerdown', () => {
      const now = performance.now();
      taps = taps.filter((t) => now - t < 700);
      taps.push(now);
      if (taps.length >= 3) { this.el.hidden = !this.el.hidden; taps = []; this.mark(); }
    });
  }

  /** Highlight the active speed and quality buttons. */
  private mark(): void {
    for (const b of this.el.querySelectorAll<HTMLElement>('[data-speed]')) b.classList.toggle('on', Number(b.dataset.speed) === this.speed);
    for (const b of this.el.querySelectorAll<HTMLElement>('[data-q]')) b.classList.toggle('on', String(this.view.quality) === b.dataset.q);
  }

  update(real: number): void {
    if (this.el.hidden) return;
    this.fpsT += real;
    if (this.fpsT < 0.5) return;
    this.fpsT = 0;
    this.fps.textContent = `${Math.round(this.view.fps)} fps · ${this.view.pixelRatio.toFixed(2)}x · x${this.speed}`;
  }
}
