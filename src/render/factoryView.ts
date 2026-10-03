import * as THREE from 'three';
import { ECONOMY } from '../config/economy';
import { FACTORY } from '../config/factories';
import type { SimWorld } from '../sim/world';
import { MAT, PRIM, merge, part } from './geo';
import { CanvasSprite, EMOJI, FONT, groundMarker, rr } from './canvas';
import { InstancedStack, gridSlots } from './stacks';
import { ground, lockOverlay } from './worldView';

const { box, cyl, cone } = PRIM;

/** Small count label ("🥚 12  🌾 8") that redraws only when its text changes. */
class Tag {
  readonly s = new CanvasSprite(300, 64, 2.2);
  private text = '';
  set(text: string): void {
    if (text === this.text) return;
    this.text = text;
    this.s.draw((c, w, h) => {
      c.font = `800 36px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.direction = 'ltr';
      const tw = c.measureText(text).width + 28;
      c.fillStyle = 'rgba(28,38,18,0.78)';
      rr(c, (w - tw) / 2, 4, tw, h - 8, 18);
      c.fill();
      c.fillStyle = '#fff';
      c.fillText(text, w / 2, h / 2 + 2);
    });
  }
}

/** Machine bodies: a brick bakery oven with a chimney, a steel dairy with two milk tanks. */
function machineGeo(id: string, b: { x0: number; x1: number; z0: number; z1: number }): THREE.BufferGeometry {
  const x = (b.x0 + b.x1) / 2, z = (b.z0 + b.z1) / 2, w = b.x1 - b.x0, d = b.z1 - b.z0;
  if (id === 'bakery') {
    return merge([
      part(box, 0xb5653f, x, 0.6, z, 0, 0, 0, w, 1.2, d),
      part(box, 0x8e4a2c, x, 1.25, z, 0, 0, 0, w + 0.1, 0.1, d + 0.1),
      part(cyl, 0xc8774c, x - 0.5, 1.3, z, 0, 0, 0, 0.75, 0.6, 0.6),
      part(box, 0x2b1a12, x - 0.5, 0.55, b.z1 + 0.01, 0, 0, 0, 0.9, 0.6, 0.04),
      part(box, 0xf28c38, x - 0.5, 0.45, b.z1 + 0.02, 0, 0, 0, 0.7, 0.25, 0.02),
      part(box, 0x7a3b2a, x + 1.0, 2.0, z - 0.2, 0, 0, 0, 0.4, 1.6, 0.4),
    ]);
  }
  return merge([
    part(box, 0xdfe6ec, x, 0.55, z, 0, 0, 0, w, 1.1, d),
    part(box, 0x3d7fd9, x, 0.85, b.z1 + 0.01, 0, 0, 0, w - 0.2, 0.15, 0.04),
    part(cyl, 0xf3f6f8, x - 0.8, 1.5, z - 0.1, 0, 0, 0, 0.5, 1.6, 0.5),
    part(cyl, 0xf3f6f8, x + 0.4, 1.5, z - 0.1, 0, 0, 0, 0.5, 1.6, 0.5),
    part(cone, 0xc0c8d0, x - 0.8, 2.45, z - 0.1, 0, 0, 0, 0.52, 0.3, 0.52),
    part(cone, 0xc0c8d0, x + 0.4, 2.45, z - 0.1, 0, 0, 0, 0.52, 0.3, 0.52),
  ]);
}

/** One machine: body, drop/pick markers, ingredient label, finished-items stack, puff while working. */
class MachineView {
  readonly root = new THREE.Group();
  private tag = new Tag();
  private out: InstancedStack;
  private puff = new CanvasSprite(96, 96, 0.9);

  constructor(scene: THREE.Scene, private i: number) {
    const def = FACTORY.machines[i], b = def.box;
    const body = new THREE.Mesh(machineGeo(def.id, b), MAT);
    const inIcon = def.id === 'bakery' ? '🥚' : '🥛';
    const mi = groundMarker(inIcon, 1.5, 'rgba(255,214,140,0.35)', '#e8a23a');
    mi.position.set(def.input.x, 0, def.input.z);
    const mo = groundMarker(def.id === 'bakery' ? '🍰' : '🥪', 1.5, 'rgba(255,255,255,0.3)', '#ffffff');
    mo.position.set(def.output.x, 0, def.output.z);
    this.out = new InstancedStack(def.makes, 16, gridSlots(def.makes, 2, 2, 0.45), def.output.x, 0.03, def.output.z - 0.2);
    this.tag.s.sprite.position.set((b.x0 + b.x1) / 2, 3.0, (b.z0 + b.z1) / 2);
    this.puff.draw((c) => { c.font = `70px ${EMOJI}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(def.id === 'bakery' ? '🔥' : '♨️', 48, 52); });
    this.puff.sprite.position.set(def.id === 'bakery' ? b.x1 - 0.6 : b.x0 + 0.8, def.id === 'bakery' ? 3.0 : 2.8, (b.z0 + b.z1) / 2 - 0.2);
    this.root.add(body, mi, mo, this.out.group, this.tag.s.sprite, this.puff.sprite);
    this.root.visible = false;
    scene.add(this.root);
  }

  sync(sim: SimWorld, dt: number, time: number): void {
    const m = sim.factory.machines[this.i];
    this.root.visible = m.open;
    if (!m.open) return;
    const inp = m.conv.input;
    this.tag.set(m.def.id === 'bakery' ? `🥚 ${inp.egg ?? 0}   🌾 ${inp.wheat ?? 0}` : `🥛 ${inp.milk ?? 0}`);
    this.out.set(m.conv.output[m.def.makes]);
    this.out.update(dt);
    this.puff.sprite.visible = !!m.conv.cooking && !m.conv.broken;
    this.puff.sprite.scale.setScalar(0.8 + Math.sin(time * 10 + this.i) * 0.12);
  }
}

/** Stage 5: the factory yard (ground, lock), the machines, the wheat silo with its fill level. */
export class FactoryView {
  private lock: THREE.Group;
  private machines: MachineView[];
  private silo = new THREE.Group();
  private siloFill: THREE.Mesh;
  private siloTag = new Tag();
  private time = 0;

  constructor(scene: THREE.Scene) {
    const y = FACTORY.yard;
    const g = [ground(y, 0xcfcab8, 0.012)];
    // tiled concrete lines and a low fence along the far side
    for (let z = y.z0 + 1.5; z < y.z1; z += 1.5) g.push(part(box, 0xbdb7a4, (y.x0 + y.x1) / 2, 0.02, z, 0, 0, 0, y.x1 - y.x0, 0.005, 0.05));
    for (let z = y.z0 + 0.4; z < y.z1; z += 1.2) g.push(part(box, 0x8a5a32, y.x1 + 0.2, 0.45, z, 0, 0, 0, 0.12, 0.9, 0.12));
    g.push(part(box, 0x9a6233, y.x1 + 0.2, 0.75, (y.z0 + y.z1) / 2, 0, 0, 0, 0.08, 0.1, y.z1 - y.z0));
    const yard = new THREE.Mesh(merge(g), MAT);
    yard.matrixAutoUpdate = false;
    scene.add(yard);
    this.lock = lockOverlay(scene, y);
    this.machines = FACTORY.machines.map((_, i) => new MachineView(scene, i));
    const s = FACTORY.silo;
    this.silo.add(new THREE.Mesh(merge([
      part(cyl, 0xd9d9d9, s.x, 1.6, s.z, 0, 0, 0, s.r, 3.2, s.r),
      part(cone, 0xb84a3c, s.x, 3.55, s.z, 0, 0, 0, s.r + 0.08, 0.7, s.r + 0.08),
      part(box, 0x9a9a9a, s.x - s.r - 0.05, 1.6, s.z, 0, 0, 0, 0.06, 3.0, 0.06),
    ]), MAT));
    // wheat level shows through a window strip on the front
    this.siloFill = new THREE.Mesh(merge([part(box, 0xe2b955, 0, 0.5, 0, 0, 0, 0, 0.4, 1, 0.05)]), MAT);
    this.siloFill.position.set(s.x, 0.3, s.z + s.r + 0.01);
    this.siloTag.s.sprite.position.set(s.x, 4.4, s.z);
    this.silo.add(this.siloFill, this.siloTag.s.sprite);
    this.silo.visible = false;
    scene.add(this.silo);
  }

  sync(sim: SimWorld, dt: number): void {
    this.time += dt;
    const f = sim.factory;
    this.lock.visible = !f.open;
    this.silo.visible = f.open;
    if (f.open) {
      const fill = f.silo / ECONOMY.factory.siloMax;
      this.siloFill.scale.y = Math.max(0.02, fill * 2.6);
      this.siloTag.set(`🌾 ${f.silo}/${ECONOMY.factory.siloMax}`);
    }
    for (const m of this.machines) m.sync(sim, dt, this.time);
  }
}
