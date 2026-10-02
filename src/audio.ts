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
  angry(): void { tone(180, 0.25, 'sawtooth', 0.03, 0, 0.7); },
  tip(): void { tone(1568, 0.06, 'triangle', 0.04); tone(2093, 0.1, 'triangle', 0.04, 0.05); },
  alarm(): void { for (let i = 0; i < 3; i++) { tone(880, 0.12, 'square', 0.03, i * 0.22); tone(660, 0.12, 'square', 0.03, i * 0.22 + 0.11); } },
  clunk(): void { tone(110, 0.2, 'square', 0.05, 0, 0.5); tone(70, 0.25, 'sawtooth', 0.04, 0.08, 0.6); },
  fixed(): void { tone(784, 0.08, 'triangle', 0.05); tone(1175, 0.14, 'triangle', 0.05, 0.08); },
  sparkle(): void { [1568, 1976, 2349, 2637].forEach((f, i) => tone(f, 0.08, 'triangle', 0.03, i * 0.05)); },
  fanfare(): void { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.16, 'triangle', 0.06, i * 0.09)); },
  buy(): void { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.14, 'triangle', 0.07, i * 0.07)); },
  /** Quick rising run after unloading a big stack. */
  arpeggio(n: number): void {
    const k = Math.min(8, Math.max(3, Math.round(n / 2)));
    for (let i = 0; i < k; i++) tone(523 * semis(LADDER[i]), 0.1, 'triangle', 0.045, i * 0.045);
  },
};

// ---------------------------------------------------------------------------
// Scenario music: tiny step sequencer (WebAudio oscillators + filtered noise).

let noiseBuf: AudioBuffer | null = null;
function noise(dur: number, vol: number, freq: number, delay = 0, type: BiquadFilterType = 'highpass'): void {
  if (!ctx || muted) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime + delay, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf;
  f.type = type;
  f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(ctx.destination);
  src.start(t);
  src.stop(t + dur + 0.02);
}

const N = (name: string) => {
  const m = /^([A-G])(#|b)?(\d)$/.exec(name);
  if (!m) return 0;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1] as 'C'] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * Math.pow(2, (base + (Number(m[3]) - 4) * 12 - 9) / 12);
};

interface Track { step: number; play(i: number): void; length: number }

/** One loop per scenario mood. `play(i)` schedules step i. */
const TRACKS: Record<string, Track> = {
  anthem: { step: 0.32, length: 16, play: (i) => {
    const mel = ['C4', 'E4', 'G4', 'C5', 'G4', 'E4', 'G4', '', 'A4', 'F4', 'A4', 'C5', 'G4', '', 'E4', 'G4'];
    if (mel[i]) { tone(N(mel[i]), 0.28, 'sawtooth', 0.025); tone(N(mel[i]) / 2, 0.28, 'triangle', 0.03); }
    if (i % 4 === 0) { tone(N('C3'), 0.3, 'triangle', 0.05); noise(0.15, 0.03, 300, 0, 'lowpass'); }
  } },
  chant: { step: 0.25, length: 16, play: (i) => {
    // "oh-oh-oh" crowd + claps + whistle
    if ([0, 2, 4, 8, 10, 12].includes(i)) { tone(N(i < 8 ? 'E4' : 'G4'), 0.22, 'square', 0.025); tone(N(i < 8 ? 'B3' : 'D4'), 0.22, 'square', 0.02); }
    if (i % 4 === 2 || i === 15) noise(0.08, 0.06, 1500);
    if (i === 14) tone(2400, 0.2, 'sine', 0.02, 0, 1.2);
  } },
  drums: { step: 0.18, length: 16, play: (i) => {
    // march: snare rolls + bass drum on the beat
    if (i % 4 === 0) tone(70, 0.2, 'sine', 0.09, 0, 0.6);
    if ([2, 6, 10, 11, 14].includes(i)) noise(0.09, 0.06, 900);
    if (i === 12) noise(0.3, 0.05, 700);
  } },
  zaffa: { step: 0.19, length: 16, play: (i) => {
    // maqsum on the darbuka: DUM tek - tek DUM - tek - ; mizmar-like line in a hijaz flavour
    const dum = [0, 7], tek = [3, 5, 10, 12, 14];
    if (dum.includes(i)) tone(95, 0.18, 'sine', 0.1, 0, 0.7);
    if (tek.includes(i)) noise(0.05, 0.05, 2500);
    const mel = ['D5', '', 'Eb5', 'F#5', 'G5', '', 'F#5', 'Eb5', 'D5', '', 'A4', '', 'Bb4', 'A4', 'G4', ''];
    if (mel[i]) tone(N(mel[i]), 0.17, 'square', 0.016);
  } },
  thunder: { step: 0.5, length: 16, play: (i) => {
    noise(0.6, 0.02, 400, 0, 'lowpass');
    if (i === 0 || i === 9) noise(1.8, 0.12, 120, 0, 'lowpass');
  } },
  pop: { step: 0.2, length: 16, play: (i) => {
    if (i % 4 === 0) tone(60, 0.15, 'sine', 0.09, 0, 0.5);
    if (i % 2 === 1) noise(0.03, 0.03, 6000);
    const mel = ['E5', '', 'G5', '', 'A5', 'G5', '', 'E5', 'D5', '', 'E5', '', 'G5', '', 'E5', ''];
    if (mel[i]) tone(N(mel[i]), 0.12, 'triangle', 0.025);
  } },
};

let musicTimer = 0;
let musicId = '';

export const music = {
  play(id: string): void {
    if (id === musicId) return;
    this.stop();
    const tr = TRACKS[id];
    if (!tr) return;
    musicId = id;
    let i = 0;
    const tick = () => { tr.play(i); i = (i + 1) % tr.length; };
    tick();
    musicTimer = window.setInterval(tick, tr.step * 1000);
  },
  stop(): void {
    window.clearInterval(musicTimer);
    musicId = '';
  },
};
