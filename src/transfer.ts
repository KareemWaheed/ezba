import { migrate, restore, type SaveData } from './sim/save';
import { SimWorld } from './sim/world';

/**
 * Progress transfer codes: the save, deflated, as text the player copies/shares ("EZBA1." + base64url) or
 * as a QR code ("EZ1:" + base45, which packs into the QR alphanumeric mode: a smaller, easier-to-scan code).
 * Without CompressionStream (old browsers) the JSON goes uncompressed ("EZBA0.").
 */
const TEXT = 'EZBA1.';
const PLAIN = 'EZBA0.';
const QR = 'EZ1:';
const B45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

const canDeflate = (): boolean => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
const deflate = (b: Uint8Array) => pipe(b, new CompressionStream('deflate-raw'));
const inflate = (b: Uint8Array) => pipe(b, new DecompressionStream('deflate-raw'));

function toB64url(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

/** RFC 9285 base45: two bytes -> three characters (one byte -> two). */
export function toBase45(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 2) {
    if (i + 1 < b.length) {
      const n = b[i] * 256 + b[i + 1];
      s += B45[n % 45] + B45[Math.floor(n / 45) % 45] + B45[Math.floor(n / 2025)];
    } else s += B45[b[i] % 45] + B45[Math.floor(b[i] / 45)];
  }
  return s;
}

export function fromBase45(s: string): Uint8Array | null {
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 3) {
    const c = B45.indexOf(s[i]), d = B45.indexOf(s[i + 1] ?? '');
    if (c < 0 || d < 0) return null;
    if (i + 2 < s.length) {
      const e = B45.indexOf(s[i + 2]);
      if (e < 0) return null;
      const n = c + d * 45 + e * 2025;
      if (n > 0xffff) return null;
      out.push(n >> 8, n & 0xff);
    } else {
      const n = c + d * 45;
      if (n > 0xff) return null;
      out.push(n);
    }
  }
  return new Uint8Array(out);
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const strings = (v: unknown) => v === undefined || (Array.isArray(v) && v.every((x) => typeof x === 'string'));

/**
 * A code is only taken when it's a real save: the shape restore relies on (numbers where numbers go, lists
 * where lists go), and then a trial load into a scratch world must not throw. A bad save written in
 * would stop the game from starting at all.
 */
function valid(s: SaveData): boolean {
  if (!isNum(s.money) || !isObj(s.levels) || !Object.values(s.levels).every(isNum) || !isObj(s.stations)) return false;
  if (s.paid !== undefined && (!isObj(s.paid) || !Object.values(s.paid).every(isNum))) return false;
  if (!strings(s.carry) || (s.legacy !== undefined && !isNum(s.legacy)) || (s.mode !== undefined && s.mode !== 'farm' && s.mode !== 'market')) return false;
  if (s.album !== undefined && (!isObj(s.album) || !strings(s.album.seen) || !strings(s.album.paid))) return false;
  if (s.daily !== undefined && (!isObj(s.daily) || !Array.isArray(s.daily.tasks))) return false;
  try {
    restore(new SimWorld(1, s.mode === 'market' ? 'market' : 'farm'), JSON.parse(JSON.stringify(s)) as SaveData);
  } catch { return false; }
  return true;
}

const json = (s: SaveData) => new TextEncoder().encode(JSON.stringify(s));

/** The save as a text code (to copy or send). */
export async function textCode(s: SaveData): Promise<string> {
  return canDeflate() ? TEXT + toB64url(await deflate(json(s))) : PLAIN + toB64url(json(s));
}

/** The save as a QR payload (null when this browser can't compress: the QR would be too dense). */
export async function qrCode(s: SaveData): Promise<string | null> {
  return canDeflate() ? QR + toBase45(await deflate(json(s))) : null;
}

/**
 * A pasted or scanned code back to a save (migrated to this version), or null when it isn't one. Also takes
 * the debug panel's older plain base64 codes. Spaces and line breaks a chat app may add are ignored.
 */
export async function readCode(raw: string): Promise<SaveData | null> {
  try {
    const t = raw.trim();
    let bytes: Uint8Array | null;
    if (t.startsWith(QR)) {
      // (base45 has a space in its alphabet: only trim the ends)
      bytes = fromBase45(t.slice(QR.length));
      bytes = bytes && (await inflate(bytes));
    } else {
      const c = t.replace(/\s+/g, '');
      if (c.startsWith(TEXT)) bytes = await inflate(fromB64url(c.slice(TEXT.length)));
      else if (c.startsWith(PLAIN)) bytes = fromB64url(c.slice(PLAIN.length));
      else bytes = new TextEncoder().encode(decodeURIComponent(escape(atob(c))));
    }
    if (!bytes) return null;
    const s = migrate(JSON.parse(new TextDecoder().decode(bytes)));
    return s && valid(s) ? s : null;
  } catch {
    return null;
  }
}
