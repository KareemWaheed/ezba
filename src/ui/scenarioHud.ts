import { SCENARIO_GOAL_LABEL } from '../config/scenarios';
import { ITEM_ICON } from '../render/models';
import type { ItemId } from '../config/economy';
import type { SimWorld } from '../sim/world';

/**
 * Scenario UI: themed banner with timer + live goal checklist (and likes meter), a big intro card
 * when the guest arrives, a screen-edge tint in the event's color, and a result card at the end.
 */
export class ScenarioHud {
  private banner: HTMLElement;
  private title: HTMLElement;
  private hint: HTMLElement;
  private goals: HTMLElement;
  private likes: HTMLElement;
  private likesBar: HTMLElement;
  private intro: HTMLElement;
  private tint: HTMLElement;
  private result: HTMLElement;
  private key = '';
  private shownPhase = 'idle';
  private resultTimer = 0;

  constructor(root: HTMLElement) {
    root.insertAdjacentHTML('beforeend', `
      <div id="sc-tint" hidden></div>
      <div id="sc-banner" hidden>
        <div class="sc-title"></div>
        <div class="sc-hint"></div>
        <div class="sc-goals"></div>
        <div class="sc-likes" hidden><span>❤️</span><div class="sc-track"><div class="sc-bar"></div></div></div>
      </div>
      <div id="sc-intro" hidden></div>
      <div id="sc-result" hidden></div>`);
    this.banner = root.querySelector('#sc-banner')!;
    this.title = this.banner.querySelector('.sc-title')!;
    this.hint = this.banner.querySelector('.sc-hint')!;
    this.goals = this.banner.querySelector('.sc-goals')!;
    this.likes = this.banner.querySelector('.sc-likes')!;
    this.likesBar = this.banner.querySelector('.sc-bar')!;
    this.intro = root.querySelector('#sc-intro')!;
    this.tint = root.querySelector('#sc-tint')!;
    this.result = root.querySelector('#sc-result')!;
  }

  /** Called by main on scenarioStart / scenarioEnd events. */
  showIntro(text: string, color: string): void {
    this.intro.textContent = text;
    this.intro.style.background = color;
    this.intro.hidden = false;
    this.intro.classList.remove('show');
    void this.intro.offsetWidth;
    this.intro.classList.add('show');
    window.setTimeout(() => { this.intro.hidden = true; }, 2600);
  }

  showResult(sim: SimWorld, won: boolean, reward: number, stars: number): void {
    const sc = sim.scenario;
    const rows = sc.lastGoals.map((g) => `<div>${g.ok ? '✅' : '❌'} ${SCENARIO_GOAL_LABEL[g.goal]}</div>`).join('');
    const starRow = won ? `<div class="r-stars">${[0, 1, 2].map((i) => `<span class="${i < stars ? 'on' : ''}" style="animation-delay:${0.25 + i * 0.25}s">★</span>`).join('')}</div>` : '';
    const title = !won ? 'معلش، المرة الجاية 😅' : stars >= 3 ? 'تحفة! 🤩' : stars === 2 ? 'برافو! 🎉' : 'نجحت! 👍';
    this.result.innerHTML = `<div class="r-icon">${sc.def.icon}</div><div class="r-title">${title}</div>${starRow}${rows}${won ? `<div class="r-reward">+${reward.toLocaleString('en-US')}</div>` : ''}`;
    this.result.style.borderColor = sc.def.color;
    this.result.hidden = false;
    this.result.classList.remove('show');
    void this.result.offsetWidth;
    this.result.classList.add('show');
    window.clearTimeout(this.resultTimer);
    this.resultTimer = window.setTimeout(() => { this.result.hidden = true; }, 4600);
  }

  update(sim: SimWorld): void {
    const sc = sim.scenario, d = sc.def, on = sc.phase !== 'idle';
    if (sc.phase !== this.shownPhase) {
      this.shownPhase = sc.phase;
      this.banner.hidden = !on;
      this.tint.hidden = !on || !d.tint;
      if (on) {
        this.banner.style.background = d.color;
        this.tint.style.boxShadow = d.tint ? `inset 0 0 70px 34px ${d.tint}, inset 0 0 12px 6px ${d.tint}` : 'none';
        this.title.textContent = `${d.icon} ${d.title}`;
        this.hint.textContent = d.hint;
        this.likes.hidden = !d.likesTarget;
      }
    }
    if (!on) return;
    const secs = sc.phase === 'warn' ? Math.ceil(sc.t) : sc.phase === 'active' ? Math.ceil(sc.t) : 0;
    const extra = sc.mech.hudText?.(sim) ?? '';
    let key = `${sc.phase}|${secs}|${sc.likes}|${extra}`;
    const states = sc.checkGoals().map((g) => g.ok);
    key += states.join(',');
    if (key === this.key) return;
    this.key = key;
    const timer = sc.phase === 'warn' ? `يبدأ بعد ${secs}` : sc.phase === 'active' ? `⏱ ${secs}` : '…';
    // "egg:12 milk:4" -> 🥚12 🥛4
    const order = extra ? `<div class="sc-order" dir="ltr">${extra.split(' ').map((p) => { const [id, n] = p.split(':'); return `<span class="${n === '0' ? 'ok' : ''}">${ITEM_ICON[id as ItemId] ?? id}${n === '0' ? '✓' : n}</span>`; }).join('')}</div>` : '';
    this.goals.innerHTML = `<span class="sc-timer">${timer}</span>` + d.goals.map((g, i) => `<span class="${states[i] ? 'ok' : ''}">${states[i] ? '✓' : '•'} ${SCENARIO_GOAL_LABEL[g]}</span>`).join('') + order;
    if (d.likesTarget) this.likesBar.style.width = `${Math.min(100, (sc.likes / d.likesTarget) * 100)}%`;
  }
}
