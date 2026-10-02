import { ECONOMY, type UpgradeId } from '../config/economy';
import { UPGRADES, type UpgradeDef } from '../config/upgrades';
import { LAYOUT } from '../config/layout';
import { CAFE } from '../config/cafe';
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
  maxed(id: UpgradeId): boolean { return this.level(id) >= ECONOMY.upgrades[id].max; }
  cost(id: UpgradeId): number { return upgradeCost(id, this.level(id)); }
  remaining(id: UpgradeId): number { return Math.max(0, this.cost(id) - this.paid[id]); }

  /** Tile is shown when requirements are met and the track isn't maxed. */
  available(def: UpgradeDef): boolean {
    if (this.maxed(def.id)) return false;
    if (def.capBy && this.level(def.id) >= 1 + this.level(def.capBy)) return false;
    for (const r of def.requires) if (this.level(r.id) < r.level) return false;
    return true;
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
      const track = s.def.animalTrack;
      if (!s.open || !track) continue;
      const want = ECONOMY.producers[s.def.producer].start + this.level(track) * U[track].step;
      while (s.animals.length < want) s.addAnimal(w.rng);
    }
    w.staff.sync();
    w.bounds.x0 = this.level('hr.office') > 0 ? LAYOUT.hrYard.unlockedX0 : LAYOUT.bounds.x0;
    w.cafe.sync();
    w.bounds.x1 = w.cafe.open ? CAFE.unlockedX1 : LAYOUT.bounds.x1;
  }

  private purchase(t: TileState): void {
    const id = t.def.id, p = this.w.player;
    this.levels[id]++;
    this.paid[id] = 0;
    this.bought++;
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
