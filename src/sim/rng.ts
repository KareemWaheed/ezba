/** Seeded PRNG (mulberry32). The sim never uses Math.random, so runs are reproducible. */
export class Rng {
  constructor(public state: number) { this.state = state >>> 0; }
  /** Uniform float in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number { return a + this.next() * (b - a); }
  int(n: number): number { return Math.floor(this.next() * n); }
  pick<T>(arr: readonly T[]): T { return arr[this.int(arr.length)]; }
  chance(p: number): boolean { return this.next() < p; }
}
