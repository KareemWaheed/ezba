import { ECONOMY } from '../config/economy';
import { MARKET } from '../config/market';
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
    const at = this.sim.market.atDesk;
    if (at && !this.wasAt && !this.modal.isOpen) this.show();
    this.wasAt = at;
    // live numbers while open (deliveries landing, shelves emptying)
    if (this.shown && this.modal.isOpen && this.stateKey() !== this.key) this.show();
  }

  private stateKey(): string {
    const m = this.sim.market;
    return `${Math.floor(this.sim.money / 10)}|${m.shelves.map((s) => s.stock).join(',')}|${MARKET.products.map((p) => m.stocked(p.item) * 100 + Math.min(99, m.farmSpare(p.item))).join(',')}`;
  }

  private show(): void {
    const w = this.sim, m = w.market, box = ECONOMY.supermarket.box;
    this.key = this.stateKey();
    const rows = m.shelves.filter((s) => s.open).map((s) => {
      const it = s.def.item, p = MARKET.products.find((x) => x.item === it)!;
      const cost = m.boxCost(it), room = m.canOrder(it);
      const farm = p.farm ? m.farmSpare(it) : 0;
      const farmBtn = p.farm
        ? `<button class="t-claim o-farm" data-farm="${it}" ${room && farm > 0 ? '' : 'disabled'}>🚚 ${ltr(`${Math.min(box, farm)}`)} ببلاش</button>`
        : '';
      return `<div class="t-row">
        <span class="t-icon">${ITEM_ICON[it]}</span>
        <div class="t-body"><div class="t-label">${p.name} · <span class="o-price">${ltr(fmtMoney(m.sellPrice(it)))} 💰</span></div>
          <div class="t-sub">على الرف ${ltr(`${s.stock}/${ECONOMY.supermarket.shelfMax}`)} · في المخزن ${ltr(`${m.stocked(it)}`)}</div></div>
        ${farmBtn}
        <button class="t-claim" data-buy="${it}" ${room && w.money >= cost ? '' : 'disabled'}>📦 +${box}<br><small>${ltr(fmtMoney(cost))}</small></button>
      </div>`;
    }).join('');
    const card = this.modal.open(`
      <div class="m-title">📱 اطلب بضاعة</div>
      <div class="m-note">البضاعة بتوصل المخزن بعد ${ECONOMY.supermarket.deliveryTime} ثواني · منتجات المزرعة ممكن تيجي من مزرعتك ببلاش 🚚</div>
      <div class="t-list">${rows}</div>
      <button class="m-btn" data-close>تمام</button>`, () => { this.shown = false; });
    this.shown = true;
    card.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((b) => b.addEventListener('click', () => {
      if (m.order(b.dataset.buy as never)) this.show();
    }));
    card.querySelectorAll<HTMLButtonElement>('[data-farm]').forEach((b) => b.addEventListener('click', () => {
      if (m.orderFromFarm(b.dataset.farm as never)) this.show();
    }));
  }
}
