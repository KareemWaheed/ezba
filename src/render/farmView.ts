import * as THREE from 'three';
import { ECONOMY } from '../config/economy';
import { LAYOUT } from '../config/layout';
import type { SimWorld } from '../sim/world';
import type { SimEvent } from '../sim/events';
import type { Station } from '../sim/station';
import { guideTarget } from '../sim/guide';
import { dist } from '../sim/math';
import { MAT, PRIM, merge, part } from './geo';
import { CanvasSprite, FONT, groundMarker } from './canvas';
import { InstancedStack, gridSlots, type SlotFn } from './stacks';
import { Flyers } from './flyers';
import { AnimalHerdView } from './animals';
import { CustomersView } from './customers';
import { FLY_SCALE, ITEM_H, ITEM_ICON } from './models';
import { TilesView } from './tiles';
import { StaffView } from './staffView';
import { PressureView } from './pressureView';
import { CafeView } from './cafeView';
import { PenView } from './penView';
import { SignsView } from './signs';
import { DockView } from './dockView';
import { FieldView } from './fieldView';
import { FactoryView } from './factoryView';
import { RiverView } from './riverView';
import { UPGRADES } from '../config/upgrades';

const _v = new THREE.Vector3();

/** Visuals for one station: pallet + pile, counter slot + count label, drop marker, herd. */
class StationView {
  readonly pile: InstancedStack;
  readonly counter: InstancedStack;
  readonly herd: AnimalHerdView | null;
  private label = new CanvasSprite(192, 96, 1.1);
  private labelN = -1;
  private objs: THREE.Object3D[] = [];
  private shownOpen = false;

  constructor(scene: THREE.Scene, private st: Station) {
    const d = st.def;
    this.pile = new InstancedStack(d.product, ECONOMY.pile.max, gridSlots(d.product, d.pile.cols, d.pile.rows), d.pile.x, 0.08, d.pile.z);
    this.counter = new InstancedStack(d.product, ECONOMY.counter.visualMax, gridSlots(d.product, 2, 1), d.counter.x, 0.92, d.counter.z);
    const pallet = new THREE.Mesh(merge([part(PRIM.box, 0xb07a44, 0, 0.04, 0, 0, 0, 0, 1.6, 0.08, 1.6)]), MAT);
    pallet.position.set(d.pile.x, 0, d.pile.z);
    const marker = groundMarker(ITEM_ICON[d.product], 1.5, 'rgba(255,255,255,0.25)', '#ffffff');
    marker.position.x = d.counter.dropX;
    marker.position.z = d.counter.dropZ;
    this.objs.push(this.pile.group, this.counter.group, pallet, marker, this.label.sprite);
    for (const o of this.objs) { o.visible = false; scene.add(o); }
    this.herd = d.producer ? new AnimalHerdView(scene, d.producer, st.index * 2.1) : null;
  }

  /** Show `count` and the overflow label ("x120") once the visual stack is capped. */
  private syncCounter(count: number, pop: boolean): void {
    this.counter.set(count, pop);
    const over = count > this.counter.max;
    this.label.sprite.visible = over;
    if (over && count !== this.labelN) {
      this.labelN = count;
      this.label.draw((c, w, h) => {
        c.font = `800 64px ${FONT}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.direction = 'ltr';
        c.lineWidth = 12;
        c.strokeStyle = 'rgba(28,38,18,0.85)';
        c.strokeText(`x${count}`, w / 2, h / 2 + 4);
        c.fillStyle = '#ffffff';
        c.fillText(`x${count}`, w / 2, h / 2 + 4);
      });
      const top = this.counter.slotWorld(this.counter.max - 1, _v);
      this.label.sprite.position.set(top.x, top.y + ITEM_H[this.st.def.product] + 0.55, top.z);
    }
  }

  invalidateLabel(): void { this.labelN = -1; }

  sync(time: number, dt: number, flyers: Flyers, pop: boolean): void {
    const st = this.st;
    if (st.open !== this.shownOpen) {
      this.shownOpen = st.open;
      for (const o of this.objs) o.visible = st.open;
      this.label.sprite.visible = false;
    }
    if (!st.open) return;
    this.pile.set(st.pile, pop);
    this.syncCounter(st.counter, pop);
    this.pile.update(dt);
    this.counter.update(dt);
    this.herd?.update(st, time, dt, pop);
    // sim-driven flights: animal -> top of pile
    let k = 0;
    for (const f of st.flights) {
      if (!f.active) continue;
      const to = this.pile.slotWorld(st.pile + k++, _v);
      flyers.putArc(st.def.product, f.x, 0.8, f.z, to.x, to.y + 0.2, to.z, f.t / f.dur, 1.2, FLY_SCALE);
    }
  }
}

/** Builds and syncs every gameplay visual (except the player body) from sim state. */
export class FarmView {
  readonly stations: StationView[];
  readonly cash: InstancedStack;
  readonly flyers: Flyers;
  readonly customers: CustomersView;
  readonly arrow: THREE.Mesh;
  readonly tiles: TilesView;
  readonly staff: StaffView;
  readonly pressure: PressureView;
  readonly cafe: CafeView;
  readonly pens: PenView;
  readonly signs: SignsView;
  readonly dock: DockView;
  readonly field: FieldView;
  readonly factory: FactoryView;
  readonly river: RiverView;
  /** True on frames where a coin flew into an upgrade tile (for the coin sound). */
  coinFlew = false;
  private payT = 0;
  /** Where collected cash flies to (player's chest); updated each frame. */
  readonly hand = new THREE.Vector3();
  private time = 0;
  private guide = { x: 0, z: 0 };

  constructor(scene: THREE.Scene, sim: SimWorld) {
    this.flyers = new Flyers(scene);
    this.stations = sim.stations.map((s) => new StationView(scene, s));
    const c = LAYOUT.shop.cash;
    const billSlot: SlotFn = (i, out) => {
      const layer = Math.floor(i / 6), s = i % 6;
      out.set((s % 2 - 0.5) * 0.6, layer * ITEM_H.bill, (Math.floor(s / 2) - 1) * 0.34);
    };
    this.cash = new InstancedStack('bill', 48, billSlot, c.x, 0.03, c.z, 0.08, 3);
    scene.add(this.cash.group);
    const cm = groundMarker('', 1.7, 'rgba(94,198,208,0.35)', '#5ec6d0');
    cm.position.x = c.x;
    cm.position.z = c.z;
    scene.add(cm);
    this.customers = new CustomersView(scene);
    this.tiles = new TilesView(scene);
    this.staff = new StaffView(scene);
    this.pressure = new PressureView(scene, sim);
    this.cafe = new CafeView(scene);
    this.pens = new PenView(scene, sim);
    this.field = new FieldView(scene, sim);
    this.factory = new FactoryView(scene);
    this.river = new RiverView(scene);
    this.signs = new SignsView(scene, sim);
    this.dock = new DockView(scene);
    this.arrow = new THREE.Mesh(merge([
      part(PRIM.cone, 0xff8a1f, 0, 0, 0, Math.PI, 0, 0, 0.32, 0.6, 0.32),
      part(PRIM.cyl, 0xff8a1f, 0, 0.5, 0, 0, 0, 0, 0.12, 0.6, 0.12),
    ]), MAT);
    scene.add(this.arrow);
  }

  /** `pop` = animate newly appearing items (false right after loading a save). */
  sync(sim: SimWorld, dt: number, pop = true): void {
    this.time += dt;
    const p = sim.player;
    this.hand.set(p.x, 1.4, p.z);
    this.flyers.begin();
    for (const s of this.stations) s.sync(this.time, dt, this.flyers, pop);
    this.cash.set(sim.cash.bills, pop);
    this.cash.update(dt);
    this.customers.update(sim, dt);
    this.tiles.sync(sim, dt, pop);
    this.staff.sync(sim, dt, this.flyers, pop);
    this.pressure.sync(sim, dt);
    this.cafe.sync(sim, dt);
    this.pens.sync(dt, p.x, p.z);
    this.signs.sync(sim, dt);
    this.dock.sync(sim);
    this.field.sync(sim, dt);
    this.factory.sync(sim, dt);
    this.river.sync(sim, dt);

    // coins fly from the player into the tile being paid
    this.coinFlew = false;
    this.payT -= dt;
    const paying = sim.upgrades.paying;
    if (paying && this.payT <= 0 && this.tiles.pos(paying, _v)) {
      this.flyers.launch('bill', this.hand, _v, null, 0.28);
      this.payT = 0.07;
      this.coinFlew = true;
    }

    const g = this.guide;
    const show = guideTarget(sim, g) && dist(p.x, p.z, g.x, g.z) > 1.1;
    this.arrow.visible = show;
    if (show) this.arrow.position.set(g.x, 2.0 + Math.abs(Math.sin(this.time * 4)) * 0.4, g.z);
  }

  /** Cosmetic reactions to sim events. */
  onEvent(e: SimEvent): void {
    this.field.onEvent(e);
    if (e.type === 'buy') this.tiles.bump(UPGRADES[e.id].id);
    if (e.type === 'goldenCaught') {
      _v.set(e.x, 0.8, e.z);
      for (let i = 0; i < 16; i++) this.flyers.launch('bill', _v, null, this.hand, 0.35, 1, 1.6, i * 0.03);
    }
    if (e.type === 'collect') {
      const shop = Math.abs(e.x - LAYOUT.shop.cash.x) < 0.01 && Math.abs(e.z - LAYOUT.shop.cash.z) < 0.01;
      const n = Math.min(shop ? this.cash.max : 12, e.n);
      for (let i = 0; i < n; i++) {
        if (shop) this.cash.slotWorld(i, _v);
        else _v.set(e.x + (i % 3) * 0.15, 0.9 + i * 0.05, e.z);
        this.flyers.launch('bill', _v, null, this.hand, 0.25, 1, 1.2, i * 0.012);
      }
    }
  }

  /** Finish the frame's instanced flyers (after any extra put() calls). */
  endFrame(dt: number): void {
    this.flyers.update(dt);
    this.flyers.end();
  }

  /** Redraw canvas text once the web font has loaded. */
  invalidateText(): void {
    this.customers.invalidate();
    this.cafe.invalidate();
    this.tiles.invalidate();
    for (const s of this.stations) s.invalidateLabel();
  }
}
