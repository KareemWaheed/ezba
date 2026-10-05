import type { SimWorld } from '../sim/world';
import { TASKS } from '../config/tasks';
import { UPGRADES } from '../config/upgrades';
import { ALBUM_PAGES } from '../config/album';
import { isMuted, setMuted } from '../audio';
import { fmtMoney, ltr, type Modal } from './modal';
import { LEGACY, legacyTitle } from '../config/legacy';
import { legacyReset } from '../sim/save';
import { replaceSave } from '../storage';

interface InstallPrompt extends Event { prompt(): Promise<void> }

/** Local calendar day as YYYY-MM-DD (daily tasks reset at midnight). */
export function dayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const SOUND_KEY = 'ezba.muted';

/** Number of milestone upgrades (all of them bought = ready for a bigger ezba). */
const UPGRADE_MILESTONES = () => UPGRADES.filter((d) => d.milestone).length;

/**
 * Side buttons under the rating: 📋 daily tasks (badge = ready to claim), 📖 customer album
 * (badge = new entries since last look), ⚙️ settings (sound, install to home screen).
 */
export class MetaMenus {
  private tasksBadge: HTMLElement;
  private albumBadge: HTMLElement;
  private albumSeen = 0;
  private open: 'tasks' | 'album' | 'settings' | 'legacy' | null = null;
  private legacyBadge: HTMLElement;
  private legacyReady = false;
  /** Called once when the farm becomes ready to sell for a bigger one. */
  onLegacyReady: (() => void) | null = null;
  private installEvt: InstallPrompt | null = null;
  private t = 0;

  constructor(root: HTMLElement, private sim: SimWorld, private modal: Modal) {
    root.insertAdjacentHTML('beforeend', `
      <div id="side" data-ui>
        <button data-m="tasks">📋<span class="badge" hidden></span></button>
        <button data-m="album">📖<span class="badge" hidden></span></button>
        <button data-m="legacy">🏆<span class="badge" hidden>!</span></button>
        <button data-m="settings">⚙️</button>
      </div>`);
    const side = root.querySelector('#side')!;
    this.tasksBadge = side.querySelector('[data-m="tasks"] .badge')!;
    this.albumBadge = side.querySelector('[data-m="album"] .badge')!;
    this.legacyBadge = side.querySelector('[data-m="legacy"] .badge')!;
    this.legacyReady = sim.legacyMissing.length === 0;
    side.addEventListener('click', (e) => {
      const m = (e.target as HTMLElement).closest('button')?.dataset.m as MetaMenus['open'];
      if (m === 'tasks') this.showTasks();
      if (m === 'album') this.showAlbum();
      if (m === 'settings') this.showSettings();
      if (m === 'legacy') this.showLegacy();
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
      وتبدأ بـ <b>${ltr(fmtMoney(LEGACY.startMoney * (lv + 1)))}</b> 💰</div>`;
    let body: string;
    if (missing.length) {
      const all = UPGRADE_MILESTONES();
      const done = all - missing.length;
      const list = missing.slice(0, 6).map((d) => `<div class="l-miss">${d.icon} ${d.label}</div>`).join('')
        + (missing.length > 6 ? `<div class="l-miss">… و${missing.length - 6} كمان</div>` : '');
      body = `<div class="m-note">افتح كل حاجة في المزرعة، وبعدها تقدر تبيعها وتبدأ عزبة أكبر وأغنى</div>
        <div class="t-track"><div class="t-bar" style="width:${Math.round((done / all) * 100)}%"></div></div>
        <div class="t-sub">${done}/${all}</div>
        <div class="l-list">${list}</div>${next}
        <button class="m-btn" data-close>تمام</button>`;
    } else if (!confirm) {
      body = `<div class="m-note">فتحت كل حاجة! 🎉 بيع العزبة وابدأ واحدة أكبر</div>${next}
        <div class="m-note">بيفضل معاك: الألبوم والمهام. بيتصفّر: الفلوس والترقيات</div>
        <button class="m-btn" data-legacy>🏆 بيع العزبة وابدأ أكبر</button>
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
    card.querySelector('[data-legacy-go]')?.addEventListener('click', () => {
      const s = legacyReset(w, Date.now());
      if (!s) return;
      replaceSave(s);
      location.reload();
    });
  }

  private showSettings(): void {
    this.open = 'settings';
    const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const install = standalone ? '<div class="m-note">✅ اللعبة متثبتة على الموبايل</div>'
      : this.installEvt ? '<button class="m-btn" data-install>📲 نزّل اللعبة على الموبايل</button>'
      : ios ? '<div class="s-tip">📲 عشان تنزّلها: دوس <b>مشاركة</b> ⬆️ في سفاري وبعدين <b>Add to Home Screen</b></div>'
      : '<div class="s-tip">📲 من قايمة المتصفح اختار <b>Install</b> أو <b>Add to Home screen</b></div>';
    const card = this.modal.open(`
      <div class="m-title">⚙️ الإعدادات</div>
      <button class="m-btn s-sound" data-sound>${isMuted() ? '🔇 الصوت مقفول' : '🔊 الصوت شغال'}</button>
      ${install}
      <div class="m-note">بتشتغل من غير نت، وتقدمك بيتحفظ لوحده</div>
      <button class="m-btn" data-close>تمام</button>`, () => { this.open = null; });
    card.querySelector('[data-sound]')?.addEventListener('click', () => {
      setMuted(!isMuted());
      try { localStorage.setItem(SOUND_KEY, isMuted() ? '1' : '0'); } catch { /* storage blocked */ }
      this.showSettings();
    });
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
    const sellable = this.sim.legacyMissing.length === 0;
    this.legacyBadge.hidden = !sellable;
    if (sellable && !this.legacyReady) this.onLegacyReady?.();
    this.legacyReady = sellable;
    const fresh = this.sim.album.seen.size - this.albumSeen;
    this.albumBadge.hidden = fresh <= 0;
    this.albumBadge.textContent = String(fresh);
    if (this.open === 'tasks' && this.modal.isOpen) this.refreshTasks();
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
