/** One centered card over a dimmed screen (welcome back, tasks, album, settings). One at a time. */
export class Modal {
  private back: HTMLElement;
  private card: HTMLElement;
  private onClose: (() => void) | null = null;

  constructor(root: HTMLElement) {
    root.insertAdjacentHTML('beforeend', `<div id="modal" data-ui hidden><div class="m-card"></div></div>`);
    this.back = root.querySelector('#modal')!;
    this.card = this.back.querySelector('.m-card')!;
    // tap outside the card or on any [data-close] closes it
    this.back.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === this.back || t.closest('[data-close]')) this.close();
    });
  }

  get isOpen(): boolean { return !this.back.hidden; }

  /** Show `html` in the card; returns the card so callers can wire buttons. */
  open(html: string, onClose?: () => void): HTMLElement {
    this.card.innerHTML = html;
    this.onClose = onClose ?? null;
    this.back.hidden = false;
    return this.card;
  }

  close(): void {
    if (this.back.hidden) return;
    this.back.hidden = true;
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }
}

const hours = (h: number) => (h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : h <= 10 ? `${h} ساعات` : `${h} ساعة`);
const mins = (m: number) => (m === 1 ? 'دقيقة' : m === 2 ? 'دقيقتين' : m <= 10 ? `${m} دقايق` : `${m} دقيقة`);

/** "ساعتين و5 دقايق" style duration (Egyptian Arabic counting words). */
export function fmtAway(seconds: number): string {
  const m = Math.floor(seconds / 60), h = Math.floor(m / 60);
  if (h > 0) return `${hours(h)}${m % 60 ? ` و${mins(m % 60)}` : ''}`;
  return mins(Math.max(1, m));
}

export const fmtMoney = (v: number) => Math.round(v).toLocaleString('en-US');
