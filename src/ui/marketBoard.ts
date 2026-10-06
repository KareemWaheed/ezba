import { ECONOMY } from '../config/economy';
import { MARKET } from '../config/market';
import { marketHint, type MarketHint } from '../sim/guide';
import type { SimWorld } from '../sim/world';
import { ITEM_ICON } from '../render/models';
import { fmtMoney, ltr } from './modal';

const HINT: Record<MarketHint, string> = {
  checkout: '🧾 في زباين مستنيين يحاسبوا! اقف عند الكاشير',
  stock: '🛒 حط اللي في إيدك على الرف بتاعه',
  fetch: '📦 هات بضاعة من المخزن للرفوف الفاضية',
  order: '📱 البضاعة خلصت: اطلب من التابلت',
  coming: '🚚 البضاعة في السكة للمخزن',
  cash: '💵 لم الفلوس اللي جنب الكاشير',
  ok: '✅ المحل ماشي تمام',
};

/**
 * Store board (shown while the player is inside the supermarket, in place of the goal card): what to do
 * next, then who's shopping, who's in line, the cash waiting and which shelves are empty.
 */
export class MarketBoard {
  private el: HTMLElement;
  private key = '';

  constructor(root: HTMLElement) {
    root.insertAdjacentHTML('beforeend', `<div id="mboard" hidden></div>`);
    this.el = root.querySelector('#mboard')!;
  }

  /** Shown (true) while the player is in the open store and no event is on. */
  update(w: SimWorld): boolean {
    const m = w.market, P = MARKET.plot, p = w.player;
    const show = m.open && w.scenario.phase === 'idle' && p.x > P.x0 && p.x < P.x1 && p.z > P.z0 && p.z < P.z1;
    this.el.hidden = !show;
    if (!show) { this.key = ''; return false; }
    let shopping = 0, line = 0, wait = 0;
    for (const c of m.shoppers) {
      if (c.state === 'shop' || c.state === 'toQueue') shopping++;
      else if (c.state === 'queue') line++;
      if (c.state === 'shop' && c.waitT > 0) wait++;
    }
    const empty = m.shelves.filter((s) => s.open && s.stock === 0).map((s) => ITEM_ICON[s.def.item]);
    const hint = marketHint(w), serving = m.cashier ? '👩‍💼' : m.playerAtCheckout() ? '🙋' : '⚠️';
    const key = `${hint}|${shopping}|${line}|${wait}|${serving}|${Math.round(m.cash.value)}|${empty.join('')}`;
    if (key === this.key) return true;
    this.key = key;
    const cfg = ECONOMY.supermarket;
    this.el.className = hint === 'checkout' || hint === 'order' ? 'urgent' : hint === 'ok' ? 'calm' : '';
    this.el.innerHTML = `
      <div class="mb-hint">${HINT[hint]}</div>
      <div class="mb-stats">
        <span title="بيتسوقوا">🛒 ${ltr(`${shopping}/${cfg.maxInside}`)}</span>
        <span title="في الطابور">🧾 ${ltr(`${line}`)} ${line ? serving : ''}</span>
        ${wait ? `<span class="bad">⏳ ${ltr(`${wait}`)} مستنيين رف</span>` : ''}
        ${m.cash.value > 0 ? `<span>💵 ${ltr(fmtMoney(m.cash.value))}</span>` : ''}
      </div>
      ${empty.length ? `<div class="mb-empty">رفوف فاضية: ${empty.slice(0, 6).join(' ')}${empty.length > 6 ? ` ${ltr(`+${empty.length - 6}`)}` : ''}</div>` : ''}`;
    return true;
  }
}
