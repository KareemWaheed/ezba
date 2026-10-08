import { SAVE_VERSION, migrate, type SaveData } from './sim/save';
import type { GameMode } from './config/paths';
import { FEATURES } from './config/features';

const MODE_KEY = 'ezba.mode';
/** Each game has its own save slot (the farm keeps the original key, so old saves load as the farm). */
const keyOf = (m: GameMode) => (m === 'market' ? 'ezba-save-market' : 'ezba-save');

/** The game picked on the start screen (null = never picked: show the start screen). */
export function chosenMode(): GameMode | null {
  try { const m = localStorage.getItem(MODE_KEY); return m === 'farm' || m === 'market' ? m : null; } catch { return null; }
}

/** The game this page runs: the one picked, else the farm (always the farm while the supermarket is off). */
export const MODE: GameMode = FEATURES.supermarket ? chosenMode() ?? 'farm' : 'farm';
const KEY = keyOf(MODE);

/** Remember the picked game (the caller reloads the page when it changes). */
export function chooseMode(m: GameMode): void {
  try { localStorage.setItem(MODE_KEY, m); } catch { /* storage blocked: stays on the farm */ }
}

/** Whether a game has a save to continue. */
export function hasSave(m: GameMode): boolean {
  try { return !!localStorage.getItem(keyOf(m)); } catch { return false; }
}

/** Read and migrate the save. Keeps a copy of the pre-migration save in case a migration is buggy. */
export function loadSave(): SaveData | null {
  let raw: unknown = null;
  let text: string | null = null;
  try {
    text = localStorage.getItem(KEY);
    // supermarket switched off: a supermarket-first game (its own slot) loads as the farm, store refunded on load
    // (the next autosave moves it to the farm slot)
    if (!text && !FEATURES.supermarket) text = localStorage.getItem(keyOf('market'));
    raw = text ? JSON.parse(text) : null;
  } catch { return null; }
  if (!raw) return null;
  lastT = Number((raw as { t?: number }).t) || 0;
  const v = (raw as { v?: number }).v ?? 0;
  if (v < SAVE_VERSION && text) {
    try { localStorage.setItem(`${KEY}-backup-v${v}`, text); } catch { /* storage full: still try to load */ }
  }
  return migrate(raw);
}

let blocked = false;

/**
 * Two copies of the game on one phone (an old tab and the installed app, two tabs...) would each autosave their
 * own state over the other's, and coming back to the older copy wiped what was bought in the newer one. So a
 * page remembers the save it last loaded or wrote (its `t`); once another copy has written a newer save this
 * page stops saving and asks to reload (`onStale`).
 */
let lastT = 0;
let stale = false;
let staleCb: (() => void) | null = null;

function goStale(): void {
  if (stale) return;
  stale = true;
  staleCb?.();
}

/** Has another copy of the game saved since this page last loaded or saved? (Also flags this page stale.) */
export function checkStale(): boolean {
  if (stale || blocked) return stale;
  try {
    const text = localStorage.getItem(KEY);
    const t = text ? Number((JSON.parse(text) as { t?: number }).t) || 0 : 0;
    if (t > lastT) goStale();
  } catch { /* storage blocked: nothing to compare */ }
  return stale;
}

/** Called once when this page finds it is no longer the newest copy of the game. */
export function onStale(cb: () => void): void {
  staleCb = cb;
  if (stale) cb();
}

try { addEventListener('storage', (e) => { if (e.key === KEY && e.newValue && !blocked) goStale(); }); } catch { /* no window (tools) */ }

export function writeSave(s: SaveData): void {
  if (blocked || checkStale()) return;
  try { localStorage.setItem(KEY, JSON.stringify(s)); lastT = s.t; } catch { /* quota / private mode */ }
}

/** Replace the save for good (selling the farm): later writes from this page are blocked until reload. */
export function replaceSave(s: SaveData): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { return false; }
  blocked = true;
  return true;
}

/** Wipe the save; further writes are blocked until reload so an autosave can't resurrect it. */
export function clearSave(): void {
  blocked = true;
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Ask the browser not to evict our storage (Safari evicts after 7 days without a visit otherwise). */
export async function requestPersistence(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}

/** Portable backup code (base64 JSON) for the debug panel's export/import. */
export function exportCode(s: SaveData): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(s))));
}

export function importCode(code: string): SaveData | null {
  try { return migrate(JSON.parse(decodeURIComponent(escape(atob(code.trim()))))); } catch { return null; }
}

/**
 * Bring in progress from another device: the save goes into its game's slot (the current one there is kept
 * as `<slot>-before-import`), that game becomes the one this page opens, and later writes from this page
 * are blocked until the caller reloads.
 */
export function importSave(s: SaveData): boolean {
  const mode: GameMode = s.mode === 'market' ? 'market' : 'farm';
  const key = keyOf(mode);
  const back = `${key}-before-import`;
  let old: string | null = null, oldBack: string | null = null, oldMode: string | null = null;
  try {
    old = localStorage.getItem(key);
    oldBack = localStorage.getItem(back);
    oldMode = localStorage.getItem(MODE_KEY);
    if (old) localStorage.setItem(back, old);
    localStorage.setItem(key, JSON.stringify({ ...s, mode }));
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // all or nothing: put back whatever was written before the failure
    const put = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage gone */ } };
    put(key, old); put(back, oldBack); put(MODE_KEY, oldMode);
    return false;
  }
  blocked = true;
  return true;
}
