/** Top HUD (money pill), the first-run hint, the "full" tag, the trash button and floating "+X" texts. */
export class Hud {
  /** True while the trash button is pressed (the sim throws the top carried item away). */
  trashHeld = false;
  private trash: HTMLButtonElement;
  private ride: HTMLButtonElement;
  private rideState = '';
  /** Tapped the get off / get on button (main.ts calls the sim). */
  onRide: (() => void) | null = null;
  private moneyEl: HTMLElement;
  private moneyVal: HTMLElement;
  private hint: HTMLElement;
  private full: HTMLElement;
  private shown = -1;

  constructor(private root: HTMLElement) {
    root.insertAdjacentHTML('beforeend', `
      <div id="hud"><div id="money" data-ui><span class="bill"></span><span id="moneyVal">0</span></div></div>
      <div id="hint" hidden>اسحب في أي مكان عشان تتحرك</div>
      <div id="full" hidden>مليان</div>
      <button id="trash" data-ui hidden aria-label="ارمي اللي في إيدك">🗑️<span>ارمي</span></button>
      <button id="ride" data-ui hidden></button>`);
    this.ride = root.querySelector('#ride')!;
    this.ride.addEventListener('click', () => this.onRide?.());
    this.trash = root.querySelector('#trash')!;
    // hold to keep throwing away (one item per tick of ECONOMY.player.trashInterval)
    this.trash.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; this.trashHeld = true; this.trash.setPointerCapture(e.pointerId); e.preventDefault(); });
    const up = () => { this.trashHeld = false; };
    this.trash.addEventListener('pointerup', up);
    this.trash.addEventListener('pointercancel', up);
    this.trash.addEventListener('lostpointercapture', up);
    // a release that never arrives (tab hidden / app backgrounded mid-hold) must not keep trashing
    document.addEventListener('visibilitychange', () => { if (document.hidden) up(); });
    addEventListener('blur', up);
    this.trash.addEventListener('contextmenu', (e) => e.preventDefault());
    this.moneyEl = root.querySelector('#money')!;
    this.moneyVal = root.querySelector('#moneyVal')!;
    this.hint = root.querySelector('#hint')!;
    this.full = root.querySelector('#full')!;
  }

  get money(): HTMLElement { return this.moneyEl; }

  showHint(on: boolean): void { this.hint.hidden = !on; }

  setMoney(v: number): void {
    const m = Math.floor(v);
    if (m === this.shown) return;
    if (m > this.shown && this.shown >= 0) {
      this.moneyEl.classList.add('bump');
      setTimeout(() => this.moneyEl.classList.remove('bump'), 120);
    }
    this.shown = m;
    this.moneyVal.textContent = m.toLocaleString('en-US');
  }

  /** "Full" tag at a screen position, or hidden when pos is null. */
  setFull(x: number, y: number, on: boolean): void {
    this.full.hidden = !on;
    if (on) { this.full.style.left = `${x}px`; this.full.style.top = `${y}px`; }
  }

  /** Trash button shows only while the player carries something. */
  setTrash(on: boolean): void {
    if (this.trash.hidden === !on) return;
    this.trash.hidden = !on;
    if (!on) this.trashHeld = false;
  }

  /** Get off / get on button: 'off' while driving, 'on' next to the parked vehicle, '' hidden. */
  setRide(state: '' | 'off' | 'on', icon: string): void {
    const key = state + icon;
    if (key === this.rideState) return;
    this.rideState = key;
    this.ride.hidden = !state;
    if (state) this.ride.innerHTML = state === 'off' ? `🚶<span>انزل</span>` : `${icon}<span>اركب</span>`;
  }

  /** Rising "+X" text at a screen position. */
  float(text: string, x: number, y: number, kind = ''): void {
    const el = document.createElement('div');
    el.className = kind ? `float ${kind}` : 'float';
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }
}
