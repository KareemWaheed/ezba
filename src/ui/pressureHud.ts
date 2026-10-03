import type { SimWorld } from '../sim/world';

/** Star rating pill, fast-service combo counter and the rush banner. */
export class PressureHud {
  private stars: HTMLElement;
  private starsIcons: HTMLElement;
  private starsVal: HTMLElement;
  private priceEl: HTMLElement;
  private shownPrice = '';
  private combo: HTMLElement;
  private banner: HTMLElement;
  private shownRating = '';
  private shownCombo = -1;
  private shownBanner = '';

  constructor(root: HTMLElement) {
    root.insertAdjacentHTML('beforeend', `
      <div id="stars"><span class="st"></span><span class="sv"></span><span class="pm"></span></div>
      <div id="combo" hidden></div>
      <div id="rush" hidden></div>`);
    this.stars = root.querySelector('#stars')!;
    this.starsIcons = this.stars.querySelector('.st')!;
    this.starsVal = this.stars.querySelector('.sv')!;
    this.priceEl = this.stars.querySelector('.pm')!;
    this.combo = root.querySelector('#combo')!;
    this.banner = root.querySelector('#rush')!;
  }

  update(sim: SimWorld): void {
    const r = sim.service.rating, full = Math.round(r);
    const key = r.toFixed(1);
    if (key !== this.shownRating) {
      this.shownRating = key;
      this.starsIcons.textContent = '★'.repeat(full) + '☆'.repeat(5 - full);
      this.starsVal.textContent = key;
    }
    const pm = `💹 x${sim.priceMult.toFixed(2)}`;
    if (pm !== this.shownPrice) { this.shownPrice = pm; this.priceEl.textContent = pm; }
    const c = sim.service.combo;
    if (c !== this.shownCombo) {
      this.shownCombo = c;
      this.combo.hidden = c < 2;
      if (c >= 2) {
        this.combo.textContent = `🔥 x${c}`;
        this.combo.classList.remove('pop');
        void this.combo.offsetWidth;
        this.combo.classList.add('pop');
      }
    }
    const rush = sim.rush;
    let b = '';
    if (rush.phase === 'warn') b = `${rush.kind.icon} ${rush.kind.title} ${Math.ceil(rush.t)}`;
    else if (rush.phase === 'active') b = `${rush.kind.icon} زحمة! ${Math.ceil(rush.t)} · خلّي الكل مبسوط = مكافأة`;
    if (b !== this.shownBanner) {
      this.shownBanner = b;
      this.banner.hidden = !b;
      this.banner.textContent = b;
      this.banner.classList.toggle('warn', rush.phase === 'warn');
    }
  }
}
