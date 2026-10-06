import qrcode from 'qrcode-generator';
import type { SaveData } from '../sim/save';
import { qrCode, readCode, textCode } from '../transfer';
import { importSave } from '../storage';
import { FEATURES } from '../config/features';
import { fmtMoney, ltr, type Modal } from './modal';

/** One line about a save, for the "replace?" card: game, money, upgrades, bigger-ezba level. */
function summary(s: SaveData): string {
  // (from a pasted code: only numbers built here go into the HTML, never the code's own text)
  const n = (v: unknown) => Math.max(0, Math.floor(Number(v)) || 0);
  let ups = 0;
  for (const k in s.levels) ups += n(s.levels[k]);
  const game = s.mode === 'market' ? '🛒 سوبر ماركت' : '🐔 مزرعة', legacy = n(s.legacy);
  return `${game} · 💰 ${ltr(fmtMoney(n(s.money)))} · ⬆️ ${ltr(String(ups))} ترقية${legacy ? ` · 🏆 ${ltr(String(legacy))}` : ''}`;
}

/**
 * Settings -> move progress between devices. Send: a QR code (scanned by the other device's game) and a
 * text code to copy or share. Receive: paste the code or scan the QR with the camera; a card shows what
 * replaces what (the old progress is kept as a backup) before the page reloads into the new one.
 */
export class TransferPanel {
  private stopScan: (() => void) | null = null;

  constructor(private modal: Modal, private current: () => SaveData, private onBack: () => void) {}

  async showSend(): Promise<void> {
    const s = this.current();
    const [text, qr] = await Promise.all([textCode(s), qrCode(s)]);
    let svg = '';
    if (qr) {
      const q = qrcode(0, 'L');
      q.addData(qr, 'Alphanumeric');
      q.make();
      svg = q.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
    }
    const canShare = typeof navigator.share === 'function';
    const card = this.modal.open(`
      <div class="m-title">📤 انقل تقدّمك لجهاز تاني</div>
      <div class="m-note">على الجهاز التاني: ⚙️ ← 📥 عندي كود، وبعدين صوّر الـQR أو الزق الكود</div>
      ${svg ? `<div class="x-qr">${svg}</div>` : ''}
      <textarea class="x-code" readonly>${text}</textarea>
      <div class="x-btns">
        <button class="m-btn" data-copy>📋 انسخ الكود</button>
        ${canShare ? '<button class="m-btn" data-share>📤 ابعته</button>' : ''}
      </div>
      <div class="m-note">الكود فيه تقدّمك لحد دلوقتي. لو لعبت بعده، اعمل كود جديد.</div>
      <button class="m-btn l-later" data-back>رجوع</button>`);
    const area = card.querySelector<HTMLTextAreaElement>('.x-code')!;
    const copyBtn = card.querySelector<HTMLButtonElement>('[data-copy]')!;
    copyBtn.addEventListener('click', async () => {
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch {
        area.select();
        try { ok = document.execCommand('copy'); } catch { /* not allowed */ }
      }
      copyBtn.textContent = ok ? '✅ اتنسخ' : '👆 علّم الكود وانسخه';
    });
    card.querySelector('[data-share]')?.addEventListener('click', () => {
      void navigator.share({ title: 'كود تقدّمي في عزبتي', text }).catch(() => {});
    });
    card.querySelector('[data-back]')?.addEventListener('click', () => this.onBack());
  }

  showReceive(error = ''): void {
    const camera = !!navigator.mediaDevices?.getUserMedia;
    const card = this.modal.open(`
      <div class="m-title">📥 عندي كود من جهاز تاني</div>
      ${camera ? '<button class="m-btn" data-scan>📷 صوّر الـQR</button>' : ''}
      <div class="x-scan" hidden><video playsinline muted></video><div class="m-note">وجّه الكاميرا على الـQR في الجهاز التاني</div></div>
      <textarea class="x-code" placeholder="أو الزق الكود هنا"></textarea>
      ${error ? `<div class="x-err">${error}</div>` : ''}
      <button class="m-btn" data-go>✅ كمّل</button>
      <button class="m-btn l-later" data-back>رجوع</button>`, () => this.stop());
    const area = card.querySelector<HTMLTextAreaElement>('.x-code')!;
    card.querySelector('[data-go]')?.addEventListener('click', () => void this.check(area.value));
    card.querySelector('[data-back]')?.addEventListener('click', () => { this.stop(); this.onBack(); });
    card.querySelector('[data-scan]')?.addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).hidden = true;
      const box = card.querySelector<HTMLElement>('.x-scan')!;
      box.hidden = false;
      void this.scan(box.querySelector('video')!, (code) => void this.check(code)).catch(() => {
        this.stop();
        box.hidden = true;
        this.showReceive('مش قادرين نفتح الكاميرا: اسمح للعبة باستخدامها، أو الزق الكود');
      });
    });
  }

  private async check(code: string): Promise<void> {
    this.stop();
    const s = await readCode(code);
    if (!s) { this.showReceive('الكود ده مش شغال. اتأكد إنك نسخته كله'); return; }
    if (s.mode === 'market' && !FEATURES.supermarket) { this.showReceive('الكود ده للعبة السوبر ماركت، ومش متاحة دلوقتي'); return; }
    const card = this.modal.open(`
      <div class="m-title">🔁 تستبدل تقدّمك؟</div>
      <div class="x-sum"><b>هييجي:</b> ${summary(s)}</div>
      <div class="x-sum x-old"><b>هيمشي:</b> ${summary(this.current())}</div>
      <div class="m-note">هنحتفظ بنسخة من تقدّمك الحالي على الجهاز ده احتياطي</div>
      <button class="m-btn" data-yes>✅ أيوه، استبدل</button>
      <button class="m-btn l-later" data-no>لأ</button>`);
    card.querySelector('[data-no]')?.addEventListener('click', () => this.showReceive());
    card.querySelector('[data-yes]')?.addEventListener('click', () => {
      if (!importSave(s)) { this.showReceive('المتصفح مش سامح بالحفظ دلوقتي، جرّب تاني'); return; }
      location.reload();
    });
  }

  /** Camera -> QR text: the browser's own detector when there is one, else jsQR (loaded only now). */
  private async scan(video: HTMLVideoElement, found: (code: string) => void): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    let live = true;
    this.stopScan = () => { live = false; stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; };
    video.srcObject = stream;
    await video.play();
    type Detector = { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> };
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    const detector = BD ? new BD({ formats: ['qr_code'] }) : null;
    const jsQR = detector ? null : (await import('jsqr')).default;
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const tick = async (): Promise<void> => {
      if (!live) return;
      let code: string | null = null;
      try {
        if (detector) code = (await detector.detect(video))[0]?.rawValue ?? null;
        else if (jsQR && video.videoWidth) {
          const k = Math.min(1, 900 / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.round(video.videoWidth * k);
          canvas.height = Math.round(video.videoHeight * k);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data ?? null;
        }
      } catch { /* a frame that couldn't be read */ }
      if (!live) return;
      if (code) { found(code); return; }
      setTimeout(() => void tick(), 150);
    };
    void tick();
  }

  private stop(): void {
    this.stopScan?.();
    this.stopScan = null;
  }
}
