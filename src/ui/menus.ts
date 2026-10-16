import type { SimWorld } from '../sim/world';
import { TASKS } from '../config/tasks';
import { UPGRADES } from '../config/upgrades';
import { ALBUM_PAGES } from '../config/album';
import { isMuted, setMuted } from '../audio';
import { fmtMoney, ltr, type Modal } from './modal';
import { LEGACY, legacyTitle } from '../config/legacy';
import { PERKS } from '../config/perks';
import { SHOP } from '../config/shop';
import type { ShopKind } from '../sim/shop';
import { legacyReset } from '../sim/save';
import { replaceSave } from '../storage';
import { FEATURES } from '../config/features';

interface InstallPrompt extends Event { prompt(): Promise<void> }

/** Local calendar day as YYYY-MM-DD (daily tasks reset at midnight). */
export function dayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const SOUND_KEY = 'ezba.muted';

/** Number of milestone upgrades (all of them bought = ready for a bigger ezba). */
const UPGRADE_MILESTONES = () => UPGRADES.filter((d) => d.milestone && !d.extra).length;

/**
 * Side buttons under the rating: 📋 daily tasks (badge = ready to claim), 📖 customer album
 * (badge = new entries since last look), ⚙️ settings (sound, install to home screen).
 */
export class MetaMenus {
  private tasksBadge: HTMLElement;
  private albumBadge: HTMLElement;
  private albumSeen = 0;
  private open: 'tasks' | 'album' | 'settings' | 'legacy' | 'perks' | 'shop' | null = null;
  private shopTab: ShopKind = 'decor';
  /** Something was bought in the shop (main.ts toasts it). */
  onShopBuy: ((kind: ShopKind, name: string) => void) | null = null;
  private legacyBadge: HTMLElement;
  private legacyReady = false;
  /** Called once when the farm becomes ready to sell for a bigger one. */
  onLegacyReady: (() => void) | null = null;
  /** Settings' "switch game" button (opens the start screen). */
  onSwitchGame: (() => void) | null = null;
  /** Easy mode switched in the settings. */
  onEasy: ((on: boolean) => void) | null = null;
  /** Settings' move-progress buttons. */
  onTransfer: ((kind: 'send' | 'receive') => void) | null = null;
  private installEvt: InstallPrompt | null = null;
  private t = 0;

  constructor(root: HTMLElement, private sim: SimWorld, private modal: Modal) {
    root.insertAdjacentHTML('beforeend', `
      <div id="side" data-ui>
        <button data-m="tasks">📋<span class="badge" hidden></span></button>
        <button data-m="album">📖<span class="badge" hidden></span></button>
        <button data-m="shop" aria-label="محل الزينة">🎨</button>
        <button data-m="legacy" aria-label="عزبة أكبر">🏆<span class="badge" hidden>!</span></button>
        <button data-m="settings">⚙️</button>
      </div>`);
    const side = root.querySelector('#side')!;
    this.tasksBadge = side.querySelector('[data-m="tasks"] .badge')!;
    this.albumBadge = side.querySelector('[data-m="album"] .badge')!;
    this.legacyBadge = side.querySelector('[data-m="legacy"] .badge')!;
    side.addEventListener('click', (e) => {
      const m = (e.target as HTMLElement).closest('button')?.dataset.m as MetaMenus['open'];
      if (m === 'tasks') this.showTasks();
      if (m === 'album') this.showAlbum();
      if (m === 'settings') this.showSettings();
      if (m === 'legacy') this.showLegacy();
      if (m === 'shop') this.showShop();
    });
    try { setMuted(localStorage.getItem(SOUND_KEY) === '1'); } catch { /* storage blocked */ }
    this.albumSeen = sim.album.seen.size;
    addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this.installEvt = e as InstallPrompt; });
  }

  private showTasks(): void {
    const d = this.sim.daily;
    this.open = 'tasks';
    const rows = d.tasks.map((t, i) => {
      const def = TASKS.find((x) => x.id === t.id);
      if (!def) return '';
      const p = d.progress(t), pct = Math.round((p / t.target) * 100);
      const btn = t.claimed ? '<span class="t-ok">✅</span>'
        : `<button class="t-claim" data-claim="${i}" ${p >= t.target ? '' : 'disabled'}>استلم</button>`;
      return `<div class="t-row">
        <span class="t-icon">${def.icon}</span>
        <div class="t-body"><div class="t-label">${def.label(t.target)}</div>
          <div class="t-track"><div class="t-bar" style="width:${pct}%"></div></div>
          <div class="t-sub">${p}/${t.target} · <b>${ltr(`+${fmtMoney(t.reward)}`)} 💰</b></div></div>
        ${btn}</div>`;
    }).join('');
    const card = this.modal.open(`
      <div class="m-title">📋 مهام النهارده</div>
      <div class="t-list">${rows || '<div>مفيش مهام دلوقتي</div>'}</div>
      <div class="m-note">مهام جديدة كل يوم 🌅</div>
      <button class="m-btn" data-close>تمام</button>`, () => { this.open = null; });
    card.querySelectorAll<HTMLButtonElement>('[data-claim]').forEach((b) => b.addEventListener('click', () => {
      if (d.claim(Number(b.dataset.claim))) this.showTasks();
    }));
  }

  private showAlbum(): void {
    const a = this.sim.album;
    this.open = 'album';
    this.albumSeen = a.seen.size;
    const pages = ALBUM_PAGES.map((p) => {
      const got = p.entries.filter((e) => a.seen.has(e.id)).length;
      const cells = p.entries.map((e) => a.seen.has(e.id)
        ? `<div class="a-cell"><span>${e.icon}</span><small>${e.name}</small></div>`
        : `<div class="a-cell off"><span>❓</span><small>؟؟؟</small></div>`).join('');
      const reward = a.paid.has(p.id) ? '✅ الصفحة كاملة' : `كمّل الصفحة: ${ltr(`+${fmtMoney(p.rewardSeconds * this.sim.perSec)}`)} 💰`;
      return `<div class="a-page"><div class="a-head"><b>${p.name}</b><span>${got}/${p.entries.length}</span></div>
        <div class="a-grid">${cells}</div><div class="a-reward">${reward}</div></div>`;
    }).join('');
    this.modal.open(`
      <div class="m-title">📖 ألبوم الزباين</div>
      <div class="m-note">كل زبون جديد تخدمه بيتسجل هنا</div>
      ${pages}
      <button class="m-btn" data-close>تمام</button>`, () => { this.open = null; });
  }

  /** 🏆 A bigger ezba: progress toward selling the farm, then the confirm-and-restart flow. */
  private showLegacy(confirm = false): void {
    const w = this.sim, lv = w.legacy, missing = w.legacyMissing;
    this.open = 'legacy';
    const pct = (l: number) => `+${Math.round(l * LEGACY.priceStep * 100)}%`;
    const now = lv > 0
      ? `<div>لقبك: <b>${legacyTitle(lv)}</b> · كل الأسعار <b>${ltr(pct(lv))}</b></div>`
      : `<div>لقبك: <b>${legacyTitle(0)}</b></div>`;
    const next = `<div class="l-next">🏆 العزبة الجاية: لقب <b>${legacyTitle(lv + 1)}</b>، كل الأسعار <b>${ltr(pct(lv + 1))}</b>
      وتبدأ بـ <b>${ltr(fmtMoney(LEGACY.startMoney * (lv + 1) + w.perk('head')))}</b> 💰، و<b>${PERKS.pointsPerLegacy}</b> نقط مزايا ⭐</div>`;
    const pts = w.perkPoints;
    const perks = `<button class="m-btn l-perks" data-perks>⭐ مزايا العزبة${pts > 0 ? ` <b>(${pts} نقطة)</b>` : ''}</button>`;
    let body: string;
    if (missing.length) {
      const all = UPGRADE_MILESTONES();
      const done = all - missing.length;
      const list = missing.slice(0, 6).map((d) => `<div class="l-miss">${d.icon} ${d.label}</div>`).join('')
        + (missing.length > 6 ? `<div class="l-miss">… و${missing.length - 6} كمان</div>` : '');
      body = `<div class="m-note">افتح كل حاجة في المزرعة، وبعدها تقدر تبيعها وتبدأ عزبة أكبر وأغنى</div>
        <div class="t-track"><div class="t-bar" style="width:${Math.round((done / all) * 100)}%"></div></div>
        <div class="t-sub">${done}/${all}</div>
        <div class="l-list">${list}</div>${next}${perks}
        <button class="m-btn" data-close>تمام</button>`;
    } else if (!confirm) {
      body = `<div class="m-note">فتحت كل حاجة! 🎉 بيع العزبة وابدأ واحدة أكبر</div>${next}
        <div class="m-note">بيفضل معاك: الألبوم والمهام والمزايا. بيتصفّر: الفلوس والترقيات</div>
        <button class="m-btn" data-legacy>🏆 بيع العزبة وابدأ أكبر</button>${perks}
        <button class="m-btn l-later" data-close>بعدين</button>`;
    } else {
      body = `<div class="m-title">متأكد؟</div>
        <div>هتبدأ مزرعة جديدة من الأول، بس أسعارك هتبقى ${ltr(pct(lv + 1))} على طول</div>
        <button class="m-btn" data-legacy-go>✅ أيوه، ابدأ</button>
        <button class="m-btn l-later" data-close>لأ، استنى</button>`;
    }
    const card = this.modal.open(`
      <div class="m-icon">🏆</div>
      <div class="m-title">عزبة أكبر</div>
      ${now}${body}`, () => { this.open = null; });
    card.querySelector('[data-legacy]')?.addEventListener('click', () => this.showLegacy(true));
    card.querySelector('[data-perks]')?.addEventListener('click', () => this.showPerks());
    card.querySelector('[data-legacy-go]')?.addEventListener('click', () => {
      const s = legacyReset(w, Date.now());
      if (!s) return;
      if (replaceSave(s)) { location.reload(); return; }
      this.modal.open(`<div class="m-icon">⚠️</div><div class="m-title">ماقدرناش نحفظ</div>
        <div>المتصفح مش سامح بالحفظ دلوقتي، جرّب تاني بعد شوية</div><button class="m-btn" data-close>تمام</button>`, () => { this.open = null; });
    });
  }

  /** ⭐ Perks: spend the points every sale of the farm gives; they can be taken back and spent again. */
  private showPerks(): void {
    const w = this.sim, pts = w.perkPoints;
    this.open = 'perks';
    const rows = PERKS.list.map((p) => {
      const lv = w.perks[p.id] ?? 0;
      const pips = Array.from({ length: p.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      const btn = lv >= p.max ? '<span class="t-ok">✅</span>'
        : `<button class="t-claim" data-perk="${p.id}" ${pts > 0 ? '' : 'disabled'}>+⭐</button>`;
      return `<div class="t-row p-row">
        <span class="t-icon">${p.icon}</span>
        <div class="t-body"><div class="t-label">${p.name}</div>
          <div class="t-sub">${p.desc}</div><div class="p-pips">${pips}</div></div>
        ${btn}</div>`;
    }).join('');
    const intro = w.legacy > 0
      ? `<div class="m-note">عندك <b>${pts}</b> نقطة ⭐ · كل مرة تبيع العزبة بتاخد ${PERKS.pointsPerLegacy} نقط</div>`
      : `<div class="m-note">بيع العزبة لما تفتح كل حاجة، وخد ${PERKS.pointsPerLegacy} نقط ⭐ تختار بيهم مزايا بتفضل معاك على طول</div>`;
    const spent = PERKS.list.some((p) => (w.perks[p.id] ?? 0) > 0);
    const card = this.modal.open(`
      <div class="m-title">⭐ مزايا العزبة</div>
      ${intro}
      <div class="t-list">${rows}</div>
      ${spent ? '<button class="m-btn l-later" data-perk-reset>🔄 رجّع النقط ووزّعها تاني</button>' : ''}
      <button class="m-btn" data-back>رجوع</button>`, () => { this.open = null; });
    card.querySelectorAll<HTMLButtonElement>('[data-perk]').forEach((b) => b.addEventListener('click', () => {
      if (w.buyPerk(b.dataset.perk as typeof PERKS.list[number]['id'])) this.showPerks();
    }));
    card.querySelector('[data-perk-reset]')?.addEventListener('click', () => { w.resetPerks(); this.showPerks(); });
    card.querySelector('[data-back]')?.addEventListener('click', () => this.showLegacy());
  }

  /** 🎨 The decorations shop: decorations for the farm (each raises prices), clothes and hats for the farmer. */
  private showShop(): void {
    const w = this.sim, sh = w.shop, tab = this.shopTab;
    this.open = 'shop';
    const items: { id: string; icon: string; name: string; price: number }[] = tab === 'decor' ? [...SHOP.decor] : tab === 'outfit' ? [...SHOP.outfits] : [...SHOP.hats];
    const cells = items.map((it) => {
      const owned = sh.has(tab, it.id), worn = (tab === 'outfit' && sh.outfit === it.id) || (tab === 'hat' && sh.hat === it.id);
      const btn = tab === 'decor'
        ? owned ? '<span class="sh-own">✅ في العزبة</span>' : `<button class="t-claim" data-buy="${it.id}" ${w.money >= it.price ? '' : 'disabled'}>${ltr(fmtMoney(it.price))} 💰</button>`
        : worn ? '<span class="sh-own">✅ لابسه</span>'
        : owned ? `<button class="t-claim sh-wear" data-wear="${it.id}">البس</button>`
        : `<button class="t-claim" data-buy="${it.id}" ${w.money >= it.price ? '' : 'disabled'}>${ltr(fmtMoney(it.price))} 💰</button>`;
      return `<div class="sh-cell${owned ? ' own' : ''}"><span class="sh-icon">${it.icon}</span><b>${it.name}</b>${btn}</div>`;
    }).join('');
    const tabs = ([['decor', '🌴 زينة'], ['outfit', '👕 لبس'], ['hat', '🎩 طواقي']] as const)
      .map(([k, l]) => `<button class="sh-tab${k === tab ? ' on' : ''}" data-tab="${k}">${l}</button>`).join('');
    const note = tab === 'decor'
      ? `كل زينة بتحطها في العزبة بتزوّد كل الأسعار ${Math.round(SHOP.decorBonus * 100)}% · عندك ${sh.decorCount}/${SHOP.decor.length}`
      : 'اللبس والطواقي بتفضل معاك حتى لو بعت العزبة';
    const card = this.modal.open(`
      <div class="m-title">🎨 محل الزينة</div>
      <div class="sh-tabs">${tabs}</div>
      <div class="m-note">${note}</div>
      <div class="sh-grid">${cells}</div>
      <button class="m-btn" data-close>تمام</button>`, () => { this.open = null; });
    card.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => { this.shopTab = b.dataset.tab as ShopKind; this.showShop(); }));
    card.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((b) => b.addEventListener('click', () => {
      const it = items.find((x) => x.id === b.dataset.buy);
      if (it && sh.buy(tab, it.id)) { this.onShopBuy?.(tab, it.name); this.showShop(); }
    }));
    card.querySelectorAll<HTMLButtonElement>('[data-wear]').forEach((b) => b.addEventListener('click', () => {
      if (tab !== 'decor' && sh.wear(tab, b.dataset.wear!)) this.showShop();
    }));
  }

  /** Open the settings card (also the transfer cards' way back). */
  showSettings(): void {
    this.open = 'settings';
    const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const install = standalone ? '<div class="m-note">✅ اللعبة متثبتة على الموبايل</div>'
      : this.installEvt ? '<button class="m-btn" data-install>📲 نزّل اللعبة على الموبايل</button>'
      : ios ? '<div class="s-tip">📲 عشان تنزّلها: دوس <b>مشاركة</b> ⬆️ في سفاري وبعدين <b>Add to Home Screen</b></div>'
      : '<div class="s-tip">📲 من قايمة المتصفح اختار <b>Install</b> أو <b>Add to Home screen</b></div>';
    const card = this.modal.open(`
      <div class="m-title">⚙️ الإعدادات</div>
      <button class="m-btn s-easy" data-easy>${this.sim.easy ? '😌 الوضع السهل شغال' : '💪 الوضع العادي'}<br><small>${this.sim.easy ? 'دوس عشان ترجع للعادي' : 'دوس للسهل: ترقيات أرخص وإيفنتات أكتر'}</small></button>
      <button class="m-btn s-sound" data-sound>${isMuted() ? '🔇 الصوت مقفول' : '🔊 الصوت شغال'}</button>
      ${FEATURES.supermarket ? `<button class="m-btn s-switch" data-switch>🔁 ${this.sim.mode === 'market' ? 'روح للمزرعة 🐔' : 'روح للسوبر ماركت 🛒'}</button>` : ''}
      ${install}
      <button class="m-btn s-move" data-send>📤 انقل تقدّمك لجهاز تاني</button>
      <button class="m-btn s-move" data-receive>📥 عندي كود من جهاز تاني</button>
      <div class="m-note">بتشتغل من غير نت، وتقدمك بيتحفظ لوحده</div>
      <button class="m-btn" data-close>تمام</button>`, () => { this.open = null; });
    card.querySelector('[data-sound]')?.addEventListener('click', () => {
      setMuted(!isMuted());
      try { localStorage.setItem(SOUND_KEY, isMuted() ? '1' : '0'); } catch { /* storage blocked */ }
      this.showSettings();
    });
    card.querySelector('[data-easy]')?.addEventListener('click', () => { this.onEasy?.(!this.sim.easy); this.showSettings(); });
    card.querySelector('[data-switch]')?.addEventListener('click', () => { this.modal.close(); this.onSwitchGame?.(); });
    card.querySelector('[data-send]')?.addEventListener('click', () => { this.open = null; this.onTransfer?.('send'); });
    card.querySelector('[data-receive]')?.addEventListener('click', () => { this.open = null; this.onTransfer?.('receive'); });
    card.querySelector('[data-install]')?.addEventListener('click', () => {
      const e = this.installEvt;
      this.installEvt = null;
      void e?.prompt().finally(() => this.showSettings());
    });
  }

  /** Badges + live task progress (cheap: runs a few times a second). */
  update(real: number): void {
    this.t -= real;
    if (this.t > 0) return;
    this.t = 0.5;
    const d = this.sim.daily;
    d.ensure(dayKey());
    d.check();
    const ready = d.ready;
    this.tasksBadge.hidden = ready === 0;
    this.tasksBadge.textContent = String(ready);
    const sellable = this.sim.legacyMissing.length === 0, pts = this.sim.perkPoints;
    this.legacyBadge.hidden = !sellable && pts <= 0;
    this.legacyBadge.textContent = sellable ? '!' : '⭐';
    if (sellable && !this.legacyReady) this.onLegacyReady?.();
    this.legacyReady = sellable;
    const fresh = this.sim.album.seen.size - this.albumSeen;
    this.albumBadge.hidden = fresh <= 0;
    this.albumBadge.textContent = String(fresh);
    if (this.open === 'tasks' && this.modal.isOpen) this.refreshTasks();
    if (this.open === 'shop' && this.modal.isOpen) this.refreshShop();
  }

  /** Re-render the open shop only when what the player can afford changed (money keeps coming in). */
  private shopKey = '';
  private refreshShop(): void {
    const m = this.sim.money, list = this.shopTab === 'decor' ? SHOP.decor : this.shopTab === 'outfit' ? SHOP.outfits : SHOP.hats;
    const key = list.map((it) => (m >= it.price ? 1 : 0)).join('');
    if (key === this.shopKey) return;
    this.shopKey = key;
    this.showShop();
  }

  /** Re-render the open tasks card only when progress numbers changed. */
  private lastKey = '';
  private refreshTasks(): void {
    const d = this.sim.daily;
    const key = d.tasks.map((t) => `${d.progress(t)}${t.claimed}`).join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.showTasks();
  }
}
