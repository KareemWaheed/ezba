import * as THREE from 'three';
import { LAYOUT } from '../config/layout';
import { CAFE } from '../config/cafe';
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
      const d = st.def, name = d.product === 'egg' ? 'البيض' : 'اللبن';
      add(`لمّ ${name} من هنا`, d.pile.x, d.pile.z + 0.6, (w) => st.open && early(w), 1.7);
      add(`حط ${name} هنا للبيع`, d.counter.dropX, d.counter.dropZ, (w) => st.open && early(w), 1.6);
    }
    add('اقف هنا عشان تبيع', LAYOUT.shop.lanes[0].x, LAYOUT.shop.serveZ - 0.4, (w) => early(w) && w.cashiers === 0, 2.4);
    add('💵 الفلوس', LAYOUT.shop.cash.x, LAYOUT.shop.cash.z, (w) => early(w), 1.2);
    // café: shown until the player has served a few café customers
    const cafeNew = (w: SimWorld) => w.cafe.open && w.stats.cafeServed < 15;
    add('🥚 حط البيض واللبن هنا', CAFE.stove.input.x, CAFE.stove.input.z + 0.3, cafeNew, 1.5, 'rgba(176,96,30,0.9)');
    add('🍳 خد الأكل من هنا', CAFE.stove.output.x, CAFE.stove.output.z + 0.3, cafeNew, 3.1, 'rgba(176,96,30,0.9)');
    add('🍽️ حط الأكل واخدم هنا', CAFE.counter.serve.x, CAFE.counter.serve.z - 0.2, cafeNew, 2.3, 'rgba(176,96,30,0.9)');
    add('🧽 نضّف الترابيزات', 18.3, 8.0, cafeNew, 2.2, 'rgba(176,96,30,0.9)');
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
