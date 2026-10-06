import { migrate, type SaveData } from './sim/save';

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
    return s && typeof s.money === 'number' && s.levels ? s : null;
  } catch {
    return null;
  }
}
