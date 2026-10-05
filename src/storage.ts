import { SAVE_VERSION, migrate, type SaveData } from './sim/save';

const KEY = 'ezba-save';

/** Read and migrate the save. Keeps a copy of the pre-migration save in case a migration is buggy. */
export function loadSave(): SaveData | null {
  let raw: unknown = null;
  let text: string | null = null;
  try { text = localStorage.getItem(KEY); raw = text ? JSON.parse(text) : null; } catch { return null; }
  if (!raw) return null;
  const v = (raw as { v?: number }).v ?? 0;
  if (v < SAVE_VERSION && text) {
    try { localStorage.setItem(`${KEY}-backup-v${v}`, text); } catch { /* storage full: still try to load */ }
  }
  return migrate(raw);
}

let blocked = false;

export function writeSave(s: SaveData): void {
  if (blocked) return;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* quota / private mode */ }
}

/** Replace the save for good (selling the farm): later writes from this page are blocked until reload. */
export function replaceSave(s: SaveData): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* quota / private mode */ }
  blocked = true;
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
