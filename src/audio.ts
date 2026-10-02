/** Tiny procedural sound effects (WebAudio oscillators, no asset files). */
let ctx: AudioContext | null = null;
let muted = false;

export function unlockAudio(): void {
  if (!ctx) {
    try { ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); }
    catch { return; }
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

export function setMuted(m: boolean): void { muted = m; }
export function isMuted(): boolean { return muted; }

function tone(f: number, dur: number, type: OscillatorType, vol: number, delay = 0, slide = 0): void {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Major-pentatonic ladder so stacking climbs musically. */
const LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const semis = (n: number) => Math.pow(2, n / 12);

export const sfx = {
  /** Pitch climbs with stack height. */
  pick(stackN: number): void {
    const step = LADDER[Math.min(LADDER.length - 1, Math.max(0, stackN - 1))];
    tone(440 * semis(step), 0.08, 'triangle', 0.05, 0, 1.4);
  },
  drop(): void { tone(380, 0.07, 'triangle', 0.05, 0, 0.8); },
  sell(): void { tone(700, 0.05, 'square', 0.02); },
  kaching(): void { tone(1046, 0.08, 'square', 0.035); tone(1568, 0.16, 'square', 0.035, 0.07); },
  coin(): void { tone(1318, 0.05, 'square', 0.025); },
  buy(): void { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.14, 'triangle', 0.07, i * 0.07)); },
  /** Quick rising run after unloading a big stack. */
  arpeggio(n: number): void {
    const k = Math.min(8, Math.max(3, Math.round(n / 2)));
    for (let i = 0; i < k; i++) tone(523 * semis(LADDER[i]), 0.1, 'triangle', 0.045, i * 0.045);
  },
};
