import type { Goal } from '../sim/guide';

/** Short message under the HUD (purchases, unlocks). */
export class Toast {
  private el: HTMLElement;
  private timer = 0;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'toast';
    root.appendChild(this.el);
  }

  show(msg: string): void {
    this.el.textContent = msg;
    this.el.classList.add('show');
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.el.classList.remove('show'), 2400);
  }
}

/** HUD card with the next big goal and how close the player is to affording it. */
export class GoalCard {
  private el: HTMLElement;
  private icon: HTMLElement;
  private label: HTMLElement;
  private bar: HTMLElement;
  private price: HTMLElement;
  private key = '';

  constructor(root: HTMLElement) {
    root.insertAdjacentHTML('beforeend', `
      <div id="goal" hidden>
        <span class="g-icon"></span>
        <div class="g-body"><div class="g-label"></div><div class="g-track"><div class="g-bar"></div></div></div>
        <span class="g-price"></span>
      </div>`);
    this.el = root.querySelector('#goal')!;
    this.icon = this.el.querySelector('.g-icon')!;
    this.label = this.el.querySelector('.g-label')!;
    this.bar = this.el.querySelector('.g-bar')!;
    this.price = this.el.querySelector('.g-price')!;
  }

  update(goal: Goal | null, money: number): void {
    this.el.hidden = !goal;
    if (!goal) return;
    const pct = Math.max(0, Math.min(1, money / goal.remaining));
    const key = `${goal.def.id}|${Math.floor(pct * 100)}|${Math.ceil(goal.remaining)}`;
    if (key === this.key) return;
    this.key = key;
    this.icon.textContent = goal.def.icon;
    this.label.textContent = goal.def.label;
    this.bar.style.width = `${pct * 100}%`;
    this.price.textContent = Math.ceil(goal.remaining).toLocaleString('en-US');
  }
}
