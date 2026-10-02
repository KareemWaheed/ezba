/** Top HUD (money pill) and the first-run movement hint. */
export class Hud {
  private moneyEl: HTMLElement;
  private moneyVal: HTMLElement;
  private hint: HTMLElement;
  private shown = -1;

  constructor(root: HTMLElement) {
    root.insertAdjacentHTML('beforeend', `
      <div id="hud"><div id="money" data-ui><span class="bill"></span><span id="moneyVal">0</span></div></div>
      <div id="hint" hidden>اسحب في أي مكان عشان تتحرك</div>`);
    this.moneyEl = root.querySelector('#money')!;
    this.moneyVal = root.querySelector('#moneyVal')!;
    this.hint = root.querySelector('#hint')!;
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
}
