import { ITEM_ICON } from '../render/models';
import type { CommentsMechanic } from '../sim/scenarios/comments';
import type { SimWorld } from '../sim/world';

const NAMES = ['منة', 'أبو يوسف', 'سارة_22', 'كريم', 'نور', 'الحاج سعيد', 'ملك', 'زياد', 'هنا', 'عمر'];
const ASKS = ['عايزين نشوف {p}!', 'فين ال{p}؟؟ 😍', 'هات {p} بسرعة 🔥', 'وريني {p} يا معلم', 'نفسي في {p} دلوقتي'];
const CHEER = ['❤️❤️❤️', 'جامد جدا 🔥', 'برافو عليك 👏', 'أحسن مزرعة 😍', 'متابع من زمان ❤️'];

/**
 * Live comments down the right edge during the influencer's stream: open requests (with a timer bar
 * and progress), filled ones turning into hearts, and a few cheering lines in between. Max 4 rows.
 */
export class CommentFeed {
  private el: HTMLElement;
  private key = '';

  constructor(root: HTMLElement) {
    root.insertAdjacentHTML('beforeend', '<div id="sc-feed" hidden></div>');
    this.el = root.querySelector('#sc-feed')!;
  }

  update(sim: SimWorld): void {
    const sc = sim.scenario;
    const m = sc.mech as Partial<CommentsMechanic>;
    const reqs = sc.phase === 'active' || sc.phase === 'settle' ? m.requests : undefined;
    if (!reqs) { if (!this.el.hidden) { this.el.hidden = true; this.el.innerHTML = ''; this.key = ''; } return; }
    this.el.hidden = false;
    const shown = reqs.filter((r) => r.done || r.t > 0).slice(-4);
    const key = shown.map((r) => `${r.line}:${r.got}:${r.done ? 1 : 0}`).join('|');
    if (key === this.key) return;
    this.key = key;
    this.el.innerHTML = shown.map((r) => {
      const name = NAMES[r.line % NAMES.length];
      const icon = ITEM_ICON[r.product];
      if (r.done) return `<div class="c-row done"><b>${name}</b> ${CHEER[r.line % CHEER.length]} <span class="c-likes">+❤️</span></div>`;
      const text = ASKS[r.line % ASKS.length].replace('{p}', `<span dir="ltr">${icon}×${r.qty}</span>`);
      return `<div class="c-row"><b>${name}</b> ${text}<div class="c-bar"><div style="width:${Math.round((r.got / r.qty) * 100)}%"></div></div></div>`;
    }).join('');
  }
}
