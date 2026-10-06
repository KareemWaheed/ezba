import { ECONOMY } from '../config/economy';
import { MARKET, PRICE_TAGS } from '../config/market';
import type { SimWorld } from '../sim/world';
import { ITEM_ICON } from '../render/models';
import { fmtMoney, ltr, type Modal } from './modal';

/**
 * Supermarket order desk: opens when the player steps onto the 📱 spot. One row per open shelf with
 * its shelf / storeroom stock, a wholesale "+box" button and, for farm products, a free delivery from
 * the farm's surplus.
 */
export class OrderPanel {
  private wasAt = false;
  private shown = false;
  private key = '';

  constructor(private sim: SimWorld, private modal: Modal) {}

  update(): void {
    // stepping onto the desk opens the panel; if another card is up (e.g. welcome back) it opens once
    // that one closes, as long as the player is still on the desk
    const at = this.sim.market.atDesk;
    if (!at) this.wasAt = false;
    else if (!this.wasAt && !this.modal.isOpen) { this.wasAt = true; this.show(); }
    // live numbers while open (deliveries landing, shelves emptying)
    if (this.shown && this.modal.isOpen && this.stateKey() !== this.key) this.show();
  }

  private stateKey(): string {
    const m = this.sim.market;
    return `${Math.floor(this.sim.money)}|${Object.values(m.price).join('')}|${m.shelves.map((s) => s.stock).join(',')}|${MARKET.products.map((p) => m.stocked(p.item) * 100 + Math.min(99, m.farmSpare(p.item))).join(',')}`;
  }

  private show(): void {
    const w = this.sim, m = w.market, box = ECONOMY.supermarket.box;
    this.key = this.stateKey();
    const rows = m.shelves.filter((s) => s.open).map((s) => {
      const it = s.def.item, p = MARKET.products.find((x) => x.item === it)!;
      const cost = m.boxCost(it), room = m.canOrder(it), coming = m.stocked(it) - m.store[it];
      const farm = p.farm ? m.farmSpare(it) : 0;
      // (only once the farm makes it: on the supermarket path the farm opens bit by bit)
      const farmBtn = m.farmMakes(it)
        ? `<button class="t-claim o-farm" data-farm="${it}" ${room && farm > 0 ? '' : 'disabled'}>🚚 ببلاش<br><small>${ltr(`${Math.min(box, farm)}`)} من المزرعة</small></button>`
        : '';
      return `<div class="t-row${m.needsBox(it) ? ' o-need' : s.stock === 0 ? ' o-empty' : ''}">
        <span class="t-icon">${ITEM_ICON[it]}</span>
        <div class="t-body"><div class="t-label">${p.name} · <span class="o-price">${ltr(fmtMoney(m.sellPrice(it)))} 💰</span></div>
          <div class="o-tag"><button data-price="${it}" data-d="-1" ${m.price[it] > 0 ? '' : 'disabled'}>➖</button><span class="o-tag-${m.price[it]}">${PRICE_TAGS[m.price[it]].label}</span><button data-price="${it}" data-d="1" ${m.price[it] < PRICE_TAGS.length - 1 ? '' : 'disabled'}>➕</button></div>
          <div class="t-sub">على الرف ${ltr(`${s.stock}/${ECONOMY.supermarket.shelfMax}`)} · في المخزن ${ltr(`${m.store[it]}`)}${coming ? ` · 🚚 ${ltr(`+${coming}`)}` : ''}</div></div>
        <div class="o-btns">${farmBtn}
        <button class="t-claim" data-buy="${it}" ${room && (w.money >= cost || m.onCredit(it)) ? '' : 'disabled'}>📦 +${box}<br><small>${w.money < cost && m.onCredit(it) ? 'على النوتة 📒' : ltr(fmtMoney(cost))}</small></button></div>
      </div>`;
    }).join('');
    // one tap for everything running out: farm surplus first (free), the rest wholesale
    const need = m.shelves.filter((s) => s.open && m.needsBox(s.def.item));
    const needCost = need.reduce((a, s) => a + (m.farmSpare(s.def.item) > 0 ? 0 : m.boxCost(s.def.item)), 0);
    const all = need.length
      ? `<button class="m-btn o-all" data-all>📦 اطلب لكل الناقص (${ltr(`${need.length}`)}) ${need.map((s) => ITEM_ICON[s.def.item]).join('')}<br><small>${needCost ? ltr(fmtMoney(needCost)) + ' 💰' : 'ببلاش من المزرعة 🚚'}</small></button>`
      : `<div class="o-allok">✅ كل الرفوف ليها بضاعة في المخزن أو جاية</div>`;
    const card = this.modal.open(`
      <div class="m-title">📱 اطلب بضاعة</div>
      ${all}
      <div class="m-note">البضاعة بتوصل المخزن بعد ${ECONOMY.supermarket.deliveryTime} ثواني · منتجات المزرعة ممكن تيجي من مزرعتك ببلاش 🚚 · ➖➕ السعر: الرخيص بيتباع أكتر</div>
      <div class="t-list">${rows}</div>
      <button class="m-btn" data-close>تمام</button>`, () => { this.shown = false; });
    this.shown = true;
    card.querySelector<HTMLButtonElement>('[data-all]')?.addEventListener('click', () => {
      if (m.restockAll()) this.show();
    });
    card.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((b) => b.addEventListener('click', () => {
      if (m.order(b.dataset.buy as never)) this.show();
    }));
    card.querySelectorAll<HTMLButtonElement>('[data-price]').forEach((b) => b.addEventListener('click', () => {
      const it = b.dataset.price as never;
      m.setPrice(it, m.price[it] + Number(b.dataset.d));
      this.show();
    }));
    card.querySelectorAll<HTMLButtonElement>('[data-farm]').forEach((b) => b.addEventListener('click', () => {
      if (m.orderFromFarm(b.dataset.farm as never)) this.show();
    }));
  }
}
