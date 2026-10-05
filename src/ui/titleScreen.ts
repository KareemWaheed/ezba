import type { GameMode } from '../config/paths';
import { MODE, chooseMode, hasSave } from '../storage';

/**
 * Start screen: pick the farm-first or the supermarket-first game. Shown over the running game the
 * first time (nothing picked yet) and from the settings; picking the game that's running just closes
 * it, picking the other one saves this game and reloads into that one (each has its own save).
 */
export class TitleScreen {
  private el: HTMLElement;

  constructor(root: HTMLElement, private saveNow: () => void) {
    root.insertAdjacentHTML('beforeend', `<div id="title" data-ui hidden></div>`);
    this.el = root.querySelector('#title')!;
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]');
      if (b) this.pick(b.dataset.mode as GameMode);
      else if ((e.target as HTMLElement).closest('[data-close]')) this.el.hidden = true;
    });
  }

  get isOpen(): boolean { return !this.el.hidden; }

  /** `closable`: opened from the settings (a ✕ goes back to the game without picking). */
  show(closable = false): void {
    const card = (m: GameMode, icon: string, name: string, line: string) => {
      const cont = hasSave(m), now = m === MODE;
      const btn = now ? '▶ كمّل هنا' : cont ? '▶ كمّل' : '✨ ابدأ';
      return `<button class="ti-card${now ? ' now' : ''}" data-mode="${m}">
        <span class="ti-icon">${icon}</span><b>${name}</b><span class="ti-line">${line}</span><span class="ti-btn">${btn}</span>
      </button>`;
    };
    this.el.innerHTML = `
      <div class="ti-box">
        ${closable ? '<button class="ti-x" data-close>✕</button>' : ''}
        <div class="ti-logo">عزبتي</div>
        <div class="ti-sub">تحب تبدأ بإيه؟</div>
        ${card('farm', '🐔', 'المزرعة', 'ابدأ بفرخة وبيض، وكبّر العزبة لحد ما تفتح السوبر ماركت')}
        ${card('market', '🛒', 'السوبر ماركت', 'ابدأ ببقالة صغيرة وبضاعة بالجملة، واشتري مزرعتك حتة حتة')}
        <div class="ti-note">كل لعبة ليها حفظ لوحدها، وتقدر تبدّل بينهم من الإعدادات ⚙️</div>
      </div>`;
    this.el.hidden = false;
  }

  private pick(m: GameMode): void {
    chooseMode(m);
    if (m === MODE) { this.el.hidden = true; return; }
    this.saveNow();
    location.reload();
  }
}
