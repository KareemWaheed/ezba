/** Top HUD (money pill), the first-run hint, the "full" tag and floating "+X" texts. */
export class Hud {
  private moneyEl: HTMLElement;
  private moneyVal: HTMLElement;
  private hint: HTMLElement;
  private full: HTMLElement;
  private shown = -1;

  constructor(private root: HTMLElement) {
    root.insertAdjacentHTML('beforeend', `
      <div id="hud"><div id="money" data-ui><span class="bill"></span><span id="moneyVal">0</span></div></div>
      <div id="hint" hidden>اسحب في أي مكان عشان تتحرك</div>
      <div id="full" hidden>مليان</div>`);
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

  /** Rising "+X" text at a screen position. */
  float(text: string, x: number, y: number): void {
    const el = document.createElement('div');
    el.className = 'float';
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }
}
