import * as THREE from 'three';
import type { MoneyRainMechanic } from '../../sim/scenarios/moneyrain';
import type { HideSeekMechanic } from '../../sim/scenarios/hideseek';
import { RACE_GATES, type RaceMechanic } from '../../sim/scenarios/race';
import type { SimWorld } from '../../sim/world';
import { MAT, PRIM, merge, part } from '../geo';
import { CharacterView } from '../character';
import { bodyAccessories } from '../accessories';
import type { MechanicView } from './types';

const { box, cyl, sph } = PRIM;

const DISC_GEO = new THREE.CircleGeometry(0.5, 24).rotateX(-Math.PI / 2);

/** A soft dark disc on the ground (the drop's shadow, a gate's glow): shared geometry, its own material. */
function disc(color: number, opacity: number): THREE.Mesh {
  const m = new THREE.Mesh(DISC_GEO, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  m.position.y = 0.03;
  return m;
}

/** Free a disc's material (the geometry is shared). */
function dropDisc(m: THREE.Mesh): void { (m.material as THREE.Material).dispose(); }

/** The sprinter's cap (one look object: the accessory cache is keyed by it). */
const BOLT_CAP = { hat: { kind: 'cap' as const, color: 0x1f8a3a } };

// ---- money rain ----

const HELI_GEO = merge([
  part(sph, 0x1f7a3a, 0, 0, 0, 0, 0, 0, 0.9, 0.7, 1.3),
  part(sph, 0x9fd4ff, 0, 0.1, 0.7, 0, 0, 0, 0.55, 0.45, 0.5),
  part(box, 0x1f7a3a, 0, 0.1, -1.6, 0, 0, 0, 0.18, 0.18, 1.8),
  part(box, 0x1f7a3a, 0, 0.45, -2.4, 0, 0, 0, 0.08, 0.6, 0.35),
  part(box, 0x333333, -0.5, -0.75, 0, 0, 0, 0, 0.08, 0.06, 1.6),
  part(box, 0x333333, 0.5, -0.75, 0, 0, 0, 0, 0.08, 0.06, 1.6),
  part(cyl, 0x333333, 0, 0.75, 0, 0, 0, 0, 0.08, 0.3, 0.08),
]);
const ROTOR_GEO = merge([part(box, 0x222222, 0, 0, 0, 0, 0, 0, 4.2, 0.04, 0.2), part(box, 0x222222, 0, 0, 0, 0, Math.PI / 2, 0, 4.2, 0.04, 0.2)]);
/** A bundle of notes with a paper band. */
const CASH_GEO = merge([part(box, 0x3fae5a, 0, 0, 0, 0, 0, 0, 0.5, 0.2, 0.28), part(box, 0xf3efe3, 0, 0, 0, 0, 0, 0, 0.12, 0.21, 0.29)]);

/** The helicopter circling over the square, bundles falling under it and their shadows growing on the ground. */
export class MoneyRainView implements MechanicView {
  private heli = new THREE.Group();
  private rotor = new THREE.Mesh(ROTOR_GEO, MAT);
  private cash: THREE.Mesh[] = [];
  private shadows: THREE.Mesh[] = [];
  private time = 0;

  constructor(private scene: THREE.Scene) {
    this.heli.add(new THREE.Mesh(HELI_GEO, MAT));
    this.rotor.position.y = 0.95;
    this.heli.add(this.rotor);
    // (small and high: it's scenery, the shadows on the ground are what matter)
    this.heli.scale.setScalar(0.55);
    scene.add(this.heli);
  }

  sync(sim: SimWorld, dt: number): void {
    this.time += dt;
    const m = sim.scenario.mech as MoneyRainMechanic;
    if (!m.heli) return;
    this.heli.position.set(m.heli.x, 8 + Math.sin(this.time * 1.5) * 0.2, m.heli.z - 1.5);
    this.heli.rotation.y = -m.heli.a;
    this.rotor.rotation.y += dt * 30;
    while (this.cash.length < m.drops.length) {
      const c = new THREE.Mesh(CASH_GEO, MAT), s = disc(0x000000, 0.35);
      this.scene.add(c, s);
      this.cash.push(c); this.shadows.push(s);
    }
    this.cash.forEach((c, i) => {
      const d = m.drops[i], s = this.shadows[i];
      c.visible = s.visible = !!d;
      if (!d) return;
      // from under the helicopter down onto its shadow
      const f = Math.max(0, d.t / d.tMax);
      c.position.set(d.x + (d.fx - d.x) * f, 0.15 + f * 7, d.z + (d.fz - d.z) * f);
      c.rotation.set(Math.sin(this.time * 4 + i) * 0.5, this.time * 3 + i, 0);
      s.position.set(d.x, 0.03, d.z);
      // the shadow grows and darkens as it comes down (the catch zone)
      s.scale.setScalar(1.2 + (1 - f) * 1.3);
      (s.material as THREE.MeshBasicMaterial).opacity = 0.15 + (1 - f) * 0.4;
    });
  }

  dispose(): void {
    this.scene.remove(this.heli, ...this.cash, ...this.shadows);
    this.shadows.forEach(dropDisc);
  }
}

// ---- hide and seek ----

const BOX_GEO = merge([
  part(box, 0xc89a5a, 0, 0.35, 0, 0, 0, 0, 0.8, 0.7, 0.7),
  part(box, 0xa77a40, 0, 0.71, 0, 0, 0, 0, 0.82, 0.02, 0.06),
  part(box, 0x8a6a3a, 0.2, 0.4, 0.36, 0, 0, 0, 0.18, 0.12, 0.01),
]);
const OPEN_GEO = merge([
  part(box, 0xc89a5a, 0, 0.35, 0, 0, 0, 0, 0.8, 0.7, 0.7),
  part(box, 0xb88a4a, 0, 0.85, 0.5, -0.9, 0, 0, 0.8, 0.02, 0.35),
  part(box, 0xb88a4a, 0, 0.85, -0.5, 0.9, 0, 0, 0.8, 0.02, 0.35),
  part(box, 0x3a2a1a, 0, 0.705, 0, 0, 0, 0, 0.72, 0.01, 0.62),
]);

/** Cardboard boxes on the square (they shuffle a little now and then); he pops out of the right one. */
export class HideSeekView implements MechanicView {
  private boxes: THREE.Mesh[] = [];
  private bean: CharacterView;
  private time = 0;

  constructor(private scene: THREE.Scene) {
    this.bean = new CharacterView({ shirt: 0x6b5a3a, pants: 0x4a4a4a, skin: 0xf1c7a0, hair: 0x3b2414 });
    this.bean.attach(merge([part(box, 0x8b1a1a, 0, 1.05, 0.2, 0, 0, 0, 0.08, 0.3, 0.02)]));
    this.bean.root.visible = false;
    scene.add(this.bean.root);
  }

  sync(sim: SimWorld, dt: number): void {
    this.time += dt;
    const m = sim.scenario.mech as HideSeekMechanic;
    if (!m.boxes) return;
    while (this.boxes.length < m.boxes.length) {
      const b = new THREE.Mesh(BOX_GEO, MAT);
      this.scene.add(b);
      this.boxes.push(b);
    }
    this.boxes.forEach((mesh, i) => {
      const b = m.boxes[i];
      mesh.visible = !!b;
      if (!b) return;
      mesh.geometry = b.open ? OPEN_GEO : BOX_GEO;
      mesh.position.set(b.x, 0, b.z);
      // every box gives a little shiver now and then (so the wobble doesn't give him away)
      const sh = Math.sin(this.time * 1.7 + i * 2.1) > 0.97 && !b.open ? Math.sin(this.time * 40) * 0.08 : 0;
      mesh.rotation.set(0, b.rot + sh, sh * 0.5);
    });
    const out = m.popT > 0;
    this.bean.root.visible = out;
    if (out) {
      // jumps up out of the box, then waves
      const up = Math.min(1, (2.6 - m.popT) * 4);
      // (just behind the box, so the player standing at it doesn't hide him)
      this.bean.update(m.pop.x, m.pop.z - 0.5, 0, 0, dt, false);
      this.bean.root.position.y = 0.2 + up * 0.8;
      this.bean.wave(this.time);
    }
  }

  dispose(): void {
    this.scene.remove(this.bean.root, ...this.boxes);
  }
}

// ---- the race ----

const GATE_GEO = merge([
  part(cyl, 0xf2d03d, -1.0, 1.1, 0, 0, 0, 0, 0.08, 2.2, 0.08),
  part(cyl, 0xf2d03d, 1.0, 1.1, 0, 0, 0, 0, 0.08, 2.2, 0.08),
  part(box, 0x1f8a3a, 0, 2.2, 0, 0, 0, 0, 2.2, 0.3, 0.1),
]);
const FINISH_GEO = merge([
  part(cyl, 0xffffff, -1.0, 1.1, 0, 0, 0, 0, 0.08, 2.2, 0.08),
  part(cyl, 0xffffff, 1.0, 1.1, 0, 0, 0, 0, 0.08, 2.2, 0.08),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => part(box, k % 2 ? 0x111111 : 0xffffff, -0.875 + k * 0.25, 2.2, 0, 0, 0, 0, 0.25, 0.3, 0.1)),
]);

/** Gates round the square (the next one glows), a finish arch at the start, and the sprinter in yellow. */
export class RaceView implements MechanicView {
  private gates: THREE.Mesh[] = [];
  private glow = disc(0xf2d03d, 0.5);
  private runner: CharacterView;
  private time = 0;

  constructor(private scene: THREE.Scene) {
    RACE_GATES.forEach((g, i) => {
      if (i === RACE_GATES.length - 1) return;
      const n = RACE_GATES[(i + 1) % RACE_GATES.length], p = RACE_GATES[(i - 1 + RACE_GATES.length - 1) % (RACE_GATES.length - 1)];
      const mesh = new THREE.Mesh(i === 0 ? FINISH_GEO : GATE_GEO, MAT);
      mesh.position.set(g.x, 0, g.z);
      // across the running line
      mesh.rotation.y = Math.atan2(n.x - p.x, n.z - p.z) + Math.PI / 2;
      scene.add(mesh);
      this.gates.push(mesh);
    });
    this.glow.scale.setScalar(2.6);
    scene.add(this.glow);
    this.runner = new CharacterView({ shirt: 0xf2d03d, pants: 0x1f8a3a, skin: 0x5a3a22, hair: 0x111111 });
    const acc = bodyAccessories(BOLT_CAP);
    if (acc) this.runner.attach(acc);
    scene.add(this.runner.root);
  }

  sync(sim: SimWorld, dt: number): void {
    this.time += dt;
    const m = sim.scenario.mech as RaceMechanic;
    if (!m.runner) return;
    const r = m.runner, posing = m.poseT > 0;
    this.runner.update(r.x, r.z, posing ? 0 : r.rot, posing ? 0 : r.speed, dt, false);
    if (posing) this.runner.wave(this.time);
    const next = sim.scenario.phase === 'warn' ? RACE_GATES[0] : m.playerGate < RACE_GATES.length && m.playerTime === 0 ? RACE_GATES[m.playerGate] : null;
    this.glow.visible = !!next;
    if (next) {
      this.glow.position.set(next.x, 0.03, next.z);
      (this.glow.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(this.time * 6) * 0.15;
    }
  }

  dispose(): void {
    this.scene.remove(this.glow, this.runner.root, ...this.gates);
    dropDisc(this.glow);
  }
}
