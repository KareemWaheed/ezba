import { registerSW } from 'virtual:pwa-register';

/** How often an open game asks the server for a new version (and again whenever it comes back to the front). */
const CHECK_EVERY = 20 * 60 * 1000;

/**
 * New-version button: the game checks for an update now and then; when one is downloaded it shows a
 * button instead of reloading by itself mid-game. Tapping it saves first, then reloads into the new version.
 */
export function updateBanner(root: HTMLElement, save: () => void): void {
  root.insertAdjacentHTML('beforeend', `
    <button id="update" data-ui hidden>
      <span class="u-top">🔄 في تحديث جديد! دوس هنا</span>
      <span class="u-sub">✅ تقدّمك محفوظ ومش هيضيع</span>
    </button>`);
  const btn = root.querySelector<HTMLButtonElement>('#update')!;
  const update = registerSW({
    onNeedRefresh() { btn.hidden = false; },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => { if (navigator.onLine) void reg.update().catch(() => {}); };
      setInterval(check, CHECK_EVERY);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    },
  });
  btn.addEventListener('click', () => {
    btn.disabled = true;
    save();
    void update(true);
  });
}
