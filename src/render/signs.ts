import * as THREE from 'three';
import { LAYOUT } from '../config/layout';
import { CAFE } from '../config/cafe';
import { FIELDS } from '../config/fields';
import { FACTORY } from '../config/factories';
import { RIVER } from '../config/river';
import type { SimWorld } from '../sim/world';
import { CanvasSprite, FONT, rr } from './canvas';

/** A floating Arabic hint sign above a work spot ("put eggs here", "serve here"...). */
function sign(text: string, color = 'rgba(28,38,18,0.82)'): CanvasSprite {
  const s = new CanvasSprite(480, 76, 3.0);
  s.draw((c, w, h) => {
    c.font = `800 38px ${FONT}`;
    c.direction = 'rtl';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const tw = Math.min(w - 8, c.measureText(text).width + 34);
    c.fillStyle = color;
    rr(c, (w - tw) / 2, 6, tw, h - 12, 20);
    c.fill();
    c.fillStyle = '#ffffff';
    c.fillText(text, w / 2, h / 2 + 2);
  });
  return s;
}

interface Sign { s: CanvasSprite; show: (w: SimWorld) => boolean; y: number; t: number }

/**
 * Short hint signs over every work spot so the loop explains itself. They hide once the player
 * clearly knows the spot (e.g. café signs after the first café customers, shop signs after a while).
 */
export class SignsView {
  private signs: Sign[] = [];
  private time = 0;

  constructor(scene: THREE.Scene, sim: SimWorld) {
    const add = (text: string, x: number, z: number, show: (w: SimWorld) => boolean, y = 1.9, color?: string) => {
      const s = sign(text, color);
      s.sprite.position.set(x, y, z);
      scene.add(s.sprite);
      this.signs.push({ s, show, y, t: Math.random() * 6 });
    };
    const early = (w: SimWorld) => w.upgrades.bought < 6;
    for (const st of sim.stations) {
      const d = st.def, name = d.product === 'egg' ? 'البيض' : d.product === 'milk' ? 'اللبن' : 'الدرة';
      add(`لمّ ${name} من هنا`, d.pile.x, d.pile.z + 0.6, (w) => st.open && early(w), 1.7);
      add(`حط ${name} هنا للبيع`, d.counter.dropX, d.counter.dropZ, (w) => st.open && early(w), 1.6);
    }
    add('اقف هنا عشان تبيع', LAYOUT.shop.lanes[0].x, LAYOUT.shop.serveZ - 0.4, (w) => early(w) && w.cashiers === 0, 2.4);
    add('💵 الفلوس', LAYOUT.shop.cash.x, LAYOUT.shop.cash.z, (w) => early(w), 1.2);
    // café: shown until the player has served a few café customers
    const cafeNew = (w: SimWorld) => w.cafe.open && w.stats.cafeServed < 15;
    for (const k of CAFE.kitchen) {
      // low and nudged outward so they don't touch the serve sign between them
      const out = k.input.x < CAFE.counter.serve.x ? -0.3 : 0.3;
      add(k.raw === 'egg' ? '🍳 حط البيض هنا' : '☕ حط اللبن هنا', k.input.x + out, k.input.z + 0.3, cafeNew, 0.95, 'rgba(176,96,30,0.9)');
    }
    // carrying cake/cheese/grilled fish: this is where it goes (extra sells as takeaway when the counter is full)
    const factoryDish = (w: SimWorld) => w.factory.machines.some((m) => w.carry.has(m.def.makes));
    add('🍽️ اخدم هنا', CAFE.counter.serve.x, CAFE.counter.serve.z - 0.2, (w) => cafeNew(w) && !factoryDish(w), 2.6, 'rgba(176,96,30,0.9)');
    add('🍰🧀🍢 حطهم هنا', CAFE.counter.serve.x, CAFE.counter.serve.z - 0.2, (w) => w.cafe.open && factoryDish(w), 2.6, 'rgba(176,96,30,0.9)');
    // field: until the player has sold a few bundles
    const fieldNew = (w: SimWorld) => w.field.open && w.stats.crops < 30;
    const corn = FIELDS.plots[0].box;
    add('🌽 امشي في الغيط واحصد', (corn.x0 + corn.x1) / 2, corn.z1 - 1.2, fieldNew, 2.2, 'rgba(63,155,74,0.92)');
    add('🌽🌾 سلّم المحصول هنا', FIELDS.stall.drop.x, FIELDS.stall.drop.z + 0.2, fieldNew, 0.9, 'rgba(63,155,74,0.92)');
    // factory: until a porter takes the carrying over
    for (const [i, m] of FACTORY.machines.entries()) {
      const show = (w: SimWorld) => w.factory.machines[i].open && w.upgrades.level('factory.porter') === 0;
      const inText = m.id === 'bakery' ? '🥚🌾 حط البيض والقمح' : m.id === 'grill' ? '🐟 حط السمك هنا' : '🥛 حط اللبن هنا';
      const outText = m.id === 'bakery' ? '🍰 خد الكيك للكافيه' : m.id === 'grill' ? '🍢 للكافيه أو كشك السمك' : '🧀 خد الجبنة للكافيه';
      add(inText, m.input.x - 0.3, m.input.z + 0.3, show, 0.95, 'rgba(176,96,30,0.9)');
      add(outText, m.output.x + 0.3, m.output.z + 0.3, show, 1.9, 'rgba(176,96,30,0.9)');
    }
    // river dock: until the player has some practice
    const riverNew = (w: SimWorld) => w.river.open && w.stats.rides < 5;
    add('🐟 لمّ السمك من هنا', RIVER.pile.x, RIVER.pile.z + 0.6, riverNew, 1.6, 'rgba(30,91,198,0.92)');
    // also whenever the player carries fish or grilled fish (the stall buys both)
    const fishy = (w: SimWorld) => w.carry.has('fish') || w.carry.has('grilledFish');
    add('🐟🍢 بيع السمك هنا', RIVER.stall.drop.x, RIVER.stall.drop.z + 0.2, (w) => riverNew(w) || (w.river.open && fishy(w)), 0.95, 'rgba(30,91,198,0.92)');
    add('🪢 اربط القوارب هنا', RIVER.tie.x, RIVER.tie.z + 0.2, (w) => w.river.open && w.upgrades.level('river.worker') === 0 && w.river.rowboats.some((b) => b.state === 'untied'), 1.0, 'rgba(176,96,30,0.9)');
    add('🍳 الطلبات للمنصة', LAYOUT.vipStage.drop.x, LAYOUT.vipStage.drop.z, (w) => w.scenario.guest?.state === 'order', 1.6, 'rgba(176,24,46,0.9)');
    add('🚚 حمّل العربية هنا', LAYOUT.dock.load.x, LAYOUT.dock.load.z, (w) => w.contracts.open && w.contracts.truck.state === 'loading' && w.stats.trucks < 4, 1.6, 'rgba(30,91,198,0.9)');
  }

  sync(sim: SimWorld, dt: number): void {
    this.time += dt;
    for (const g of this.signs) {
      const on = g.show(sim);
      g.s.sprite.visible = on;
      if (on) g.s.sprite.position.y = g.y + Math.sin(this.time * 2 + g.t) * 0.06;
    }
  }
}
