import { ECONOMY, type UpgradeId } from '../config/economy';
import { UPGRADES, UPGRADE_BY_ID, type UpgradeDef } from '../config/upgrades';
import { FENCES, LAYOUT, SOLIDS_VERSION } from '../config/layout';
import { CAFE } from '../config/cafe';
import { FIELDS } from '../config/fields';
import { FACTORY } from '../config/factories';
import { RIVER } from '../config/river';
import { MARKET, SHELVES } from '../config/market';
import { FEATURES } from '../config/features';
import { dist } from './math';
import type { SimWorld } from './world';

export interface TileState {
  def: UpgradeDef;
  index: number;
  /** False while the player is still standing where the tile appeared (no accidental spending). */
  armed: boolean;
}

/** Cost of buying the next level of a track at its current level. */
export function upgradeCost(id: UpgradeId, level: number): number {
  const u = ECONOMY.upgrades[id];
  return Math.round(u.base * Math.pow(u.growth, level));
}

/** Upgrade levels, partial payments and the visible tiles the player pays into. */
/** Besides the `*.unlock` tracks (new areas), these big steps get a locked preview tile too. */
const TEASED = new Set<UpgradeId>(['field.wheat', 'field.tractor', 'field.combine', 'factory.dairy', 'river.grill']);

export class UpgradeSystem {
  readonly levels = {} as Record<UpgradeId, number>;
  /** Money already paid toward the next level of each track. */
  readonly paid = {} as Record<UpgradeId, number>;
  /** Tiles currently on the ground. */
  tiles: TileState[] = [];
  /** Track being paid into this tick (for the coin-flying effect), or null. */
  paying: UpgradeId | null = null;
  /** Total levels bought across all tracks. */
  bought = 0;

  constructor(private w: SimWorld) {
    for (const u of UPGRADES) { this.levels[u.id] = 0; this.paid[u.id] = 0; }
  }

  level(id: UpgradeId): number { return this.levels[id] ?? 0; }
  /** Current max level, including bonuses from other tracks (e.g. bigger coop -> more chickens). */
  maxOf(id: UpgradeId): number {
    const def = UPGRADE_BY_ID.get(id);
    const bonus = def?.maxBonus ? this.level(def.maxBonus.by) * def.maxBonus.per : 0;
    return ECONOMY.upgrades[id].max + bonus;
  }
  maxed(id: UpgradeId): boolean { return this.level(id) >= this.maxOf(id); }
  cost(id: UpgradeId): number { return Math.max(1, Math.round(upgradeCost(id, this.level(id)) * this.mult(id))); }
  /** Price of a level of a track in this game. */
  costAt(id: UpgradeId, level: number): number { return Math.max(1, Math.round(upgradeCost(id, level) * this.mult(id))); }
  /** This game's price factor for a track: its path's, and easy mode's. */
  mult(id: UpgradeId): number { return (this.w.path.costMult[id] ?? 1) * (this.w.easy ? ECONOMY.easy.costMult : 1); }

  /** Requirements on this game's path (the supermarket path rewires some). */
  requires(def: UpgradeDef): readonly { id: UpgradeId; level: number }[] { return this.w.path.requires[def.id] ?? def.requires; }
  remaining(id: UpgradeId): number { return Math.max(0, this.cost(id) - this.paid[id]); }

  /** Tile is shown when requirements are met and the track isn't maxed. */
  /** Never offered in this game: hidden on its path, or part of a feature that's switched off. */
  hidden(id: UpgradeId): boolean {
    return this.w.path.hidden.includes(id) || (!FEATURES.supermarket && id.startsWith('market.'));
  }

  /**
   * The supermarket is switched off: give back what its upgrades cost (and anything paid toward the
   * next level) and take the levels away. Returns the money refunded (0 when there was nothing).
   */
  refundClosedFeatures(): number {
    if (FEATURES.supermarket) return 0;
    let refund = 0;
    for (const id of Object.keys(this.levels) as UpgradeId[]) {
      if (!id.startsWith('market.')) continue;
      const free = this.w.path.startLevels[id] ?? 0;
      for (let l = free; l < this.levels[id]; l++) refund += Math.round(upgradeCost(id, l) * this.mult(id));
      refund += this.paid[id];
      this.bought -= Math.max(0, this.levels[id] - free);
      this.levels[id] = 0;
      this.paid[id] = 0;
    }
    return refund;
  }

  /** A product's workers once its belt is built: the belt does their job (the tile goes; they go home). */
  beltReplaces(id: UpgradeId): boolean {
    const st = this.w.stations.find((s) => s.def.workerTrack === id);
    return !!st && !!st.def.machineTrack && this.level(st.def.machineTrack) > 0;
  }

  /**
   * Workers whose product has a belt now go home, and what they cost (with anything paid toward the next one)
   * comes back. On buying a belt (`onlyTrack`: a 'retired' event, main.ts says so); and once on loading a save from
   * before this rule, for belts bought then (listed in w.refunds: main.ts shows them with the price-drop refunds).
   */
  retireWorkers(onlyTrack?: UpgradeId): void {
    const w = this.w;
    for (const st of w.stations) {
      const wt = st.def.workerTrack, mt = st.def.machineTrack;
      if (!wt || !mt || this.level(mt) <= 0 || (onlyTrack && onlyTrack !== mt)) continue;
      const free = w.path.startLevels[wt] ?? 0;
      let amount = this.paid[wt];
      for (let l = free; l < this.level(wt); l++) amount += this.costAt(wt, l);
      this.paid[wt] = 0;
      if (amount <= 0) continue;
      w.money += amount;
      if (!onlyTrack) w.refunds.push({ id: wt, amount, retired: true });
      else if (!w.away) w.events.emit('retired', st.def.product, st.def.pile.x, st.def.pile.z, amount, 0, st.index);
    }
  }

  available(def: UpgradeDef): boolean {
    if (this.hidden(def.id) || this.maxed(def.id) || this.beltReplaces(def.id)) return false;
    if (def.capBy && this.level(def.id) >= 1 + this.level(def.capBy)) return false;
    if (def.requiresMaxed && !this.maxed(def.requiresMaxed)) return false;
    for (const r of this.requires(def)) if (this.level(r.id) < r.level) return false;
    return true;
  }

  /**
   * Big unlocks one step away (new areas and the big machines): one not yet on offer only because of upgrades the player can buy right
   * now (each missing one has its tile up). Drawn as a faded, locked tile at its spot with what it needs, so
   * the player sees what's next without it shouting. Skips spots a live tile already stands on.
   */
  teasers(): { def: UpgradeDef; needs: { id: UpgradeId; level: number }[] }[] {
    const out: { def: UpgradeDef; needs: { id: UpgradeId; level: number }[] }[] = [];
    for (const def of UPGRADES) {
      if (!TEASED.has(def.id) && !def.id.endsWith('.unlock')) continue;
      if (this.level(def.id) > 0 || this.hidden(def.id) || this.available(def)) continue;
      const needs = this.requires(def).filter((r) => this.level(r.id) < r.level).map((r) => ({ id: r.id, level: r.level }));
      if (def.requiresMaxed && !this.maxed(def.requiresMaxed)) needs.push({ id: def.requiresMaxed, level: this.maxOf(def.requiresMaxed) });
      if (!needs.length || !needs.every((n) => this.tiles.some((t) => t.def.id === n.id))) continue;
      if (this.tiles.some((t) => dist(t.def.pos.x, t.def.pos.z, def.pos.x, def.pos.z) < 1.6)) continue;
      out.push({ def, needs });
    }
    return out;
  }

  /** Rebuild the visible tile list; keeps armed state of tiles that stay. */
  refresh(): void {
    const p = this.w.player, arm = ECONOMY.tiles.armDistance;
    const next: TileState[] = [];
    UPGRADES.forEach((def, index) => {
      if (!this.available(def)) return;
      const old = this.tiles.find((t) => t.def.id === def.id);
      next.push(old ?? { def, index, armed: dist(p.x, p.z, def.pos.x, def.pos.z) > arm });
    });
    this.tiles = next;
  }

  /** Derived effects of all levels. Safe to call repeatedly (e.g. after loading). */
  apply(): void {
    const w = this.w, U = ECONOMY.upgrades;
    w.carry.cap = ECONOMY.player.capacity + this.level('player.capacity') * U['player.capacity'].step;
    w.player.speedMult = 1 + this.level('player.speed') * U['player.speed'].step;
    for (const s of w.stations) {
      if (s.def.unlockTrack) s.open = this.level(s.def.unlockTrack) > 0;
      // supermarket path: even the coop starts closed (eggs.unlock opens it)
      else if (w.mode === 'market') s.open = this.level('eggs.unlock') > 0;
      // bigger pens: move the fence out and update its solid
      const ex = s.def.expand, area = s.def.area;
      if (ex && area) {
        const n = this.level(ex.track), a = area, f = FENCES[s.def.id];
        const x0 = a.x0 + ex.dx0 * n, x1 = a.x1 + ex.dx1 * n;
        if (s.area.x0 !== x0 || s.area.x1 !== x1) {
          s.area.x0 = x0;
          s.area.x1 = x1;
          if (f) { f.x0 = x0 - 0.1; f.x1 = x1 + 0.1; SOLIDS_VERSION.v++; }
        }
      }
      const track = s.def.animalTrack;
      if (!s.open || !track || !s.def.producer) continue;
      const want = ECONOMY.producers[s.def.producer].start + this.level(track) * U[track].step;
      // (a cow on its way to the butcher's isn't in the pen any more)
      while (s.animals.filter((a) => !a.leaving).length < want) s.addAnimal(w.rng);
    }
    // (before staff.sync, so new stockers get the HR carry bonus right away)
    w.market.sync();
    w.staff.sync();
    w.bounds.x0 = this.level('hr.office') > 0 ? LAYOUT.hrYard.unlockedX0 : LAYOUT.bounds.x0;
    if (this.level('river.unlock') > 0) w.bounds.x0 = Math.min(w.bounds.x0, RIVER.unlockedX0);
    if (this.level('surplus.yard') > 0) w.bounds.x0 = Math.min(w.bounds.x0, LAYOUT.surplusYard.unlockedX0);
    // a locked yard keeps its gate shut (the walkable area can reach it once the river or the other yard opens)
    const shut = (y: { box: { x1: number }; gate: { z0: number; z1: number } }) => ({ x0: y.box.x1 - 0.3, x1: y.box.x1, z0: y.gate.z0, z1: y.gate.z1 });
    w.setSolid('hrGate', this.level('hr.office') > 0 ? null : shut(LAYOUT.hrYard));
    w.setSolid('surplusGate', this.level('surplus.yard') > 0 ? null : shut(LAYOUT.surplusYard));
    w.cafe.sync();
    w.field.sync();
    w.bounds.z0 = w.field.open ? FIELDS.unlockedZ0 : LAYOUT.bounds.z0;
    w.river.sync();
    if (w.river.open) { w.bounds.z0 = RIVER.unlockedZ0; w.addSolid('fishStall', RIVER.stall.box); }
    if (this.level('eggs.incubator') > 0) w.addSolid('incubator', LAYOUT.surplus.incubator.box);
    // the sorters stand on reachable ground: solid once a belt on their side is built
    for (const st of w.stations) {
      const mt = st.def.machineTrack;
      if (!mt || this.level(mt) <= 0) continue;
      if (st.def.counter.x < 0) w.addSolid('westSorter', LAYOUT.trunk.westSorter);
      else w.addSolid('eastSorter', LAYOUT.trunk.eastSorter);
    }
    if (this.level('meat.unlock') > 0) w.addSolid('butcher', { ...LAYOUT.butcher.box, z1: LAYOUT.butcher.box.z1 + 0.5 }); // (with the window counter)
    const grill = FACTORY.machines.find((m) => m.id === 'grill');
    if (grill && this.level(grill.unlockTrack) > 0) w.addSolid('grill', grill.box);
    w.contracts.sync();
    w.factory.sync();
    w.bounds.x1 = w.factory.open || w.mode === 'market' ? FACTORY.unlockedX1 : w.cafe.open ? CAFE.unlockedX1 : LAYOUT.bounds.x1;
    const ex = this.level('field.expand');
    if (ex > 0) w.bounds.x1 = Math.max(w.bounds.x1, FIELDS.expandX1[Math.min(ex, FIELDS.expandX1.length) - 1]);
    // the yard south of a built store is walkable (its upgrade tiles stand there)
    w.bounds.z1 = w.market.open ? MARKET.yardZ1 : LAYOUT.bounds.z1;
    if (w.market.open) {
      // the store stands on reachable grass: walls, counter, racks and desk turn solid once it's built
      MARKET.walls.forEach((b, i) => w.addSolid(`marketWall${i}`, b));
      w.addSolid('marketCheckout', MARKET.checkout.box);
      if (this.level('market.lanes') > 0) w.addSolid('marketCheckout2', MARKET.checkout2.box);
      if (this.level('market.selfcheck') > 0) w.addSolid('marketKiosk', MARKET.kiosk.box);
      w.addSolid('marketRacks', MARKET.store.racks);
      w.addSolid('marketDesk', MARKET.desk.box);
    }
    for (const s of w.market.shelves) if (s.open) w.addSolid(`shelf${s.index}`, SHELVES[s.index].box);
  }

  private purchase(t: TileState): void {
    const id = t.def.id, p = this.w.player;
    this.levels[id]++;
    this.paid[id] = 0;
    this.bought++;
    if (this.levels[id] === 1) this.retireWorkers(id);
    // the next level's tile appears right under the player: it must not drain until they step off
    t.armed = dist(p.x, p.z, t.def.pos.x, t.def.pos.z) > ECONOMY.tiles.armDistance;
    this.apply();
    this.refresh();
    this.w.events.emit('buy', '', t.def.pos.x, t.def.pos.z, 0, this.levels[id], t.index);
  }

  update(dt: number): void {
    const w = this.w, p = w.player, cfg = ECONOMY.tiles;
    this.paying = null;
    for (const t of this.tiles) {
      const d = dist(p.x, p.z, t.def.pos.x, t.def.pos.z);
      if (!t.armed) { if (d > cfg.armDistance) t.armed = true; continue; }
      if (d >= cfg.radius || p.speed > cfg.maxPaySpeed || w.money <= 1e-6) continue;
      const id = t.def.id, cost = this.cost(id);
      const amt = Math.min(w.money, cost - this.paid[id], Math.max(cost * cfg.costFraction, cfg.minRate) * dt);
      w.money -= amt;
      this.paid[id] += amt;
      this.paying = id;
      if (cost - this.paid[id] <= 0.01) { this.purchase(t); break; }
    }
  }
}
