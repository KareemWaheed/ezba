import { ECONOMY } from '../config/economy';
import { LAYOUT } from '../config/layout';
import type { Animal, Station } from './station';
import type { SimWorld } from './world';
import { dist, moveToward } from './math';

/**
 * The butcher's (الجزارة, `meat.unlock`): an old cow (ECONOMY.butcher.readyAge in the pen) leaves for it, one at a
 * time and only while no calf is growing; a calf takes its place in the pen right away. At the side door the cow
 * goes in, and after `chopTime` the meat packs are on the window, where they sell one by one; the money piles up
 * at the window for the player (or the accountant) to collect. Runs during time away too.
 */
export class ButcherSystem {
  /** The cow on its way, and the leg of its walk (0 out to the lane, 1 east, 2 north, 3 in at the door). */
  cow: Animal | null = null;
  leg = 0;
  /** Seconds left of the chopping (0 = idle). */
  chopT = 0;
  /** Packs on the window. */
  stock = 0;
  private sellT = 0;
  readonly cash = { value: 0, bills: 0 };
  /** Cows taken in so far (not saved). */
  cows = 0;

  constructor(private w: SimWorld) {}

  get open(): boolean { return this.w.upgrades.level('meat.unlock') > 0; }

  private get pen(): Station | undefined { return this.w.stations.find((s) => s.def.producer === 'cow'); }

  /** The oldest cow ready for the butcher's, if none is on its way or being chopped and no calf is growing. */
  private nextCow(st: Station): Animal | null {
    const B = ECONOMY.butcher;
    let best: Animal | null = null;
    for (const a of st.animals) {
      if (a.leaving) continue;
      if (a.age < B.calfAge) return null;
      if (a.age >= B.readyAge && (!best || a.age > best.age)) best = a;
    }
    return best;
  }

  update(dt: number): void {
    const st = this.pen;
    if (!this.open || !st || !st.open) return;
    const w = this.w, B = ECONOMY.butcher, L = LAYOUT.butcher;
    if (!this.cow && this.chopT <= 0) {
      const a = this.nextCow(st);
      if (a) {
        a.leaving = true;
        a.pause = 0;
        this.cow = a;
        this.leg = 0;
        const calf = st.addAnimal(w.rng);
        calf.age = 0;
        if (!w.away) w.events.emit('butcher', '', a.x, a.z, 0, 1, st.index);
      }
    }
    const a = this.cow;
    if (a) {
      const tx = this.leg === 0 ? a.x : this.leg === 1 ? L.laneX : this.leg === 2 ? L.laneX : L.door.x + 0.5;
      const tz = this.leg === 0 ? L.laneZ : this.leg === 1 ? L.laneZ : L.door.z;
      if (moveToward(a, tx, tz, B.walkSpeed, dt, 0.05)) {
        if (this.leg < 3) this.leg++;
        else {
          st.animals.splice(st.animals.indexOf(a), 1);
          this.cow = null;
          this.chopT = B.chopTime;
          this.cows++;
        }
      }
    }
    if (this.chopT > 0) {
      this.chopT -= dt;
      if (this.chopT <= 0) {
        this.chopT = 0;
        this.stock += B.packs;
        this.sellT = B.sellEvery;
        if (!w.away) w.events.emit('butcher', '', L.door.x, L.door.z, B.packs, 2);
      }
    }
    if (this.stock > 0) {
      this.sellT -= dt;
      if (this.sellT <= 0) {
        this.sellT += B.sellEvery;
        this.stock--;
        const v = Math.round(B.price * w.priceMult);
        this.cash.value += v;
        this.cash.bills = Math.min(40, this.cash.bills + 1);
        if (!w.away) w.events.emit('butcher', '', (L.box.x0 + L.box.x1) / 2, L.box.z1, v, 3);
      }
    }
  }

  /** Age of the calf growing in the pen (-1 = none): saved, since pen animals aren't. */
  calfAge(): number {
    const st = this.pen;
    const calf = st?.animals.find((a) => !a.leaving && a.age < ECONOMY.butcher.calfAge);
    return calf ? calf.age : -1;
  }

  /** On load: one of the (rebuilt) cows is the calf again, `age` s old. */
  restoreCalf(age: number): void {
    const st = this.pen;
    if (!st || age < 0 || age >= ECONOMY.butcher.calfAge || st.animals.length === 0) return;
    st.animals[st.animals.length - 1].age = age;
  }

  /** Player: collect the window's money. */
  interact(): void {
    const w = this.w, p = w.player, c = LAYOUT.butcher.cash;
    if (this.cash.value > 0 && dist(p.x, p.z, c.x, c.z) < 1.3) {
      const v = this.cash.value;
      w.money += v;
      w.stats.earned += v;
      w.events.emit('collect', '', c.x, c.z, v, this.cash.bills);
      this.cash.value = 0;
      this.cash.bills = 0;
    }
  }
}
