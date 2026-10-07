import { ECONOMY } from '../config/economy';
import { MARKET } from '../config/market';
import { marketHint, type MarketHint } from '../sim/guide';
import type { SimWorld } from '../sim/world';
import { ITEM_ICON } from '../render/models';
import { fmtMoney, ltr } from './modal';

const HINT: Record<MarketHint, string> = {
  thief: '🦹 حرامي بيجري على الباب! الحقه وامسكه',
  checkout: '🧾 في زباين مستنيين يحاسبوا! اقف عند الكاشير',
  van: '🚚 حط الطلب في عربية التوصيل',
  phone: '📞 في طلب تليفون! هات حاجاته من المخزن 📦',
  spill: '🧃 في حاجة واقعة على الأرض: اقف عليها تمسحها',
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
    // (inside the store or in its yard, where the van and the upgrade tiles are)
    const show = m.open && w.scenario.phase === 'idle' && p.x > P.x0 && p.x < P.x1 + 1 && p.z > P.z0 && p.z < MARKET.yardZ1 + 0.5;
    this.el.hidden = !show;
    if (!show) { this.key = ''; return false; }
    let shopping = 0, line = 0, wait = 0, famLine = 0;
    for (const c of m.shoppers) {
      if (c.state === 'shop' || c.state === 'toQueue') shopping++;
      else if (c.state === 'queue') line++;
      if (c.state === 'shop' && c.waitT > 0) wait++;
      if (c.family && c.state === 'queue') famLine++;
    }
    const empty = m.shelves.filter((s) => s.open && s.stock === 0).map((s) => ITEM_ICON[s.def.item]);
    const hint = marketHint(w), serving = m.unservedLane() >= 0 ? '⚠️' : m.playerAtCheckout() ? '🙋' : '👩‍💼';
    const rush = m.rushT > 0 ? Math.ceil(m.rushT) : 0;
    // the phone order: what's left to load, time left and what it pays
    const o = m.extras.order;
    const order = o ? `📞 ${o.lines.map((l) => `${ITEM_ICON[l.item]}${l.left ? ltr(`${l.left}`) : '✓'}`).join(' ')} · ⏱${ltr(`${Math.ceil(o.t)}`)} · 💰${ltr(fmtMoney(o.value))}` : '';
    const spills = m.extras.spills.length;
    const key = `${rush}|${famLine}|${hint}|${shopping}|${line}|${wait}|${serving}|${Math.round(m.cash.value)}|${empty.join('')}|${order}|${spills}`;
    if (key === this.key) return true;
    this.key = key;
    const cfg = ECONOMY.supermarket;
    this.el.className = rush || hint === 'thief' || hint === 'checkout' || hint === 'order' ? 'urgent' : hint === 'ok' ? 'calm' : '';
    this.el.innerHTML = `
      ${rush ? `<div class="mb-rush">🔥 زحمة! الزباين جايين كتير · ${ltr(`${rush}`)}ث</div>` : ''}
      <div class="mb-hint">${HINT[hint]}</div>
      ${order ? `<div class="mb-order">${order}</div>` : ''}
      <div class="mb-stats">
        <span title="بيتسوقوا">🛒 ${ltr(`${shopping}/${cfg.maxInside}`)}</span>
        <span title="في الطابور">🧾 ${ltr(`${line}`)} ${line ? serving : ''}</span>
        ${famLine ? `<span>🛒👨‍👩‍👧 ${ltr(`${famLine}`)} عيلة: حاسبهم بنفسك +${ltr(`${Math.round(ECONOMY.supermarket.family.tip * 100)}%`)}</span>` : ''}
        ${wait ? `<span class="bad">⏳ ${ltr(`${wait}`)} مستنيين رف</span>` : ''}
        ${m.cash.value > 0 ? `<span>💵 ${ltr(fmtMoney(m.cash.value))}</span>` : ''}
        ${spills ? `<span class="bad">🧃 ${ltr(`${spills}`)}</span>` : ''}
      </div>
      ${empty.length ? `<div class="mb-empty">رفوف فاضية: ${empty.slice(0, 6).join(' ')}${empty.length > 6 ? ` ${ltr(`+${empty.length - 6}`)}` : ''}</div>` : ''}`;
    return true;
  }
}
