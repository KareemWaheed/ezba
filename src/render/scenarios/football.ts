import * as THREE from 'three';
import { LAYOUT } from '../../config/layout';
import type { FootballMechanic } from '../../sim/scenarios/football';
import type { SimWorld } from '../../sim/world';
import { MAT, PRIM, merge, part } from '../geo';
import { CharacterView } from '../character';
import { CanvasSprite, FONT } from '../canvas';
import type { MechanicView } from './types';

const P = LAYOUT.pitch;
const { box, cyl, sph } = PRIM;
const LINE = 0xffffff;

/** Chalk lines: outline, halfway mark, penalty box. */
function pitchLines(): THREE.BufferGeometry {
  const w = P.x1 - P.x0, d = P.z1 - P.z0, cx = (P.x0 + P.x1) / 2, cz = (P.z0 + P.z1) / 2, t = 0.06, y = 0.02;
  return merge([
    part(box, LINE, cx, y, P.z0, 0, 0, 0, w, 0.01, t),
    part(box, LINE, cx, y, P.z1, 0, 0, 0, w, 0.01, t),
    part(box, LINE, P.x0, y, cz, 0, 0, 0, t, 0.01, d),
    part(box, LINE, P.x1, y, cz, 0, 0, 0, t, 0.01, d),
    // penalty box round the (bigger) goal
    part(box, LINE, P.x1 - 1.3, y, cz, 0, 0, 0, t, 0.01, 3.6),
    part(box, LINE, P.x1 - 0.65, y, cz - 1.8, 0, 0, 0, 1.3, 0.01, t),
    part(box, LINE, P.x1 - 0.65, y, cz + 1.8, 0, 0, 0, 1.3, 0.01, t),
    part(sph, LINE, P.kick.x, y, P.kick.z, 0, 0, 0, 0.09, 0.01, 0.09),
  ]);
}

/** Goal frame: posts + crossbar, a net (back, roof, sides) with a few net lines. */
function goalGeo(): THREE.BufferGeometry {
  const g = P.goal, h = 1.15, x = g.x, deep = 0.65, w = g.z1 - g.z0, cz = (g.z0 + g.z1) / 2, net = 0xdfe8e8;
  const parts = [
    part(cyl, 0xffffff, x, h / 2, g.z0, 0, 0, 0, 0.07, h, 0.07),
    part(cyl, 0xffffff, x, h / 2, g.z1, 0, 0, 0, 0.07, h, 0.07),
    part(cyl, 0xffffff, x, h, cz, Math.PI / 2, 0, 0, 0.07, w, 0.07),
    part(box, net, x + deep, h / 2, cz, 0, 0, 0, 0.02, h, w),
    part(box, net, x + deep / 2, h - 0.01, cz, 0, 0, 0, deep, 0.02, w),
    part(box, net, x + deep / 2, h / 2, g.z0, 0, 0, 0, deep, h, 0.02),
    part(box, net, x + deep / 2, h / 2, g.z1, 0, 0, 0, deep, h, 0.02),
  ];
  for (let z = g.z0 + 0.25; z < g.z1; z += 0.25) parts.push(part(box, 0xb9c4c4, x + deep - 0.01, h / 2, z, 0, 0, 0, 0.025, h, 0.015));
  for (let y = 0.2; y < h; y += 0.2) parts.push(part(box, 0xb9c4c4, x + deep - 0.01, y, cz, 0, 0, 0, 0.025, 0.015, w));
  return merge(parts);
}

/**
 * The ball, built around its center (it spins about that point while rolling; a model built from the
 * ground up would swing around its bottom and wobble). Black patches all round.
 */
const BALL_GEO = merge([
  part(sph, 0xffffff, 0, 0, 0, 0, 0, 0, 0.2, 0.2, 0.2),
  part(sph, 0x222222, 0, 0.16, 0, 0, 0, 0, 0.07, 0.05, 0.07),
  part(sph, 0x222222, 0, -0.16, 0, 0, 0, 0, 0.07, 0.05, 0.07),
  part(sph, 0x222222, 0.16, 0.02, 0, 0, 0, 0, 0.05, 0.07, 0.07),
  part(sph, 0x222222, -0.16, 0.02, 0, 0, 0, 0, 0.05, 0.07, 0.07),
  part(sph, 0x222222, 0, 0.02, 0.16, 0, 0, 0, 0.07, 0.07, 0.05),
  part(sph, 0x222222, 0, 0.02, -0.16, 0, 0, 0, 0.07, 0.07, 0.05),
]);
/** Ball model scale and the resulting radius (it rests on the ground). */
const BALL_SCALE = 1.35, BALL_VIS_R = 0.2 * BALL_SCALE;
const CONE_GEO = merge([part(cyl, 0xff7a1a, 0, 0.22, 0, 0, 0, 0, 0.13, 0.44, 0.13), part(box, 0xff7a1a, 0, 0.02, 0, 0, 0, 0, 0.36, 0.04, 0.36), part(cyl, 0xffffff, 0, 0.26, 0, 0, 0, 0, 0.1, 0.07, 0.1)]);

/** Football visit: pitch lines, a goal, the ball, cones (Messi) or a goalkeeper (Salah), and a score sign. */
export class FootballView implements MechanicView {
  private group = new THREE.Group();
  private ball = new THREE.Mesh(BALL_GEO, MAT);
  private cones: THREE.Mesh[] = [];
  private keeper: CharacterView | null = null;
  private score = new CanvasSprite(256, 96, 2.4);
  private shown = -1;
  private time = 0;
  private axis = new THREE.Vector3();

  constructor(private scene: THREE.Scene) {
    this.group.add(new THREE.Mesh(pitchLines(), new THREE.MeshBasicMaterial({ vertexColors: true })));
    this.group.add(new THREE.Mesh(goalGeo(), MAT));
    this.group.add(this.ball);
    this.score.sprite.position.set(P.goal.x - 0.6, 2.6, P.goal.z0 - 0.8);
    this.ball.scale.setScalar(BALL_SCALE);
    this.group.add(this.score.sprite);
    scene.add(this.group);
  }

  sync(sim: SimWorld, dt: number): void {
    this.time += dt;
    const m = sim.scenario.mech as FootballMechanic;
    if (!m.ball) return;
    if (m.variant === 'dribble' && !this.cones.length) {
      for (const c of P.cones) { const k = new THREE.Mesh(CONE_GEO, MAT); k.position.set(c.x, 0, c.z); this.cones.push(k); this.group.add(k); }
    }
    if (m.variant === 'penalty' && !this.keeper) {
      this.keeper = new CharacterView({ shirt: 0x2fbf4a, pants: 0x111111, skin: 0xd9a074, hair: 0x1a1a1a });
      this.scene.add(this.keeper.root);
    }
    // the ball rolls: spin around the axis across its motion
    const b = m.ball, sp = Math.hypot(b.vx, b.vz);
    this.ball.position.set(b.x, BALL_VIS_R, b.z);
    if (sp > 0.01) this.ball.rotateOnWorldAxis(this.axis.set(b.vz / sp, 0, -b.vx / sp), (sp * dt) / BALL_VIS_R);
    // passed cones sink a little and glow white
    this.cones.forEach((c, i) => { c.scale.y = m.cones[i] ? 0.6 : 1 + Math.sin(this.time * 6 + i) * 0.05; });
    if (this.keeper) {
      const k = m.keeper;
      // side-steps along the line with both arms up
      this.keeper.update(P.goal.x - 0.3, k.z, -Math.PI / 2, 0.85, dt, false);
      this.keeper.film();
    }
    if (m.scored !== this.shown) {
      this.shown = m.scored;
      this.score.draw((c, w, h) => {
        c.fillStyle = 'rgba(17,24,39,0.85)';
        c.beginPath(); c.roundRect(4, 4, w - 8, h - 8, 22); c.fill();
        c.fillStyle = '#fff'; c.font = `800 58px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(`⚽ ${m.scored}`, w / 2, h / 2 + 4);
      });
    }
  }

  dispose(): void {
    this.scene.remove(this.group);
    if (this.keeper) this.scene.remove(this.keeper.root);
    this.score.dispose();
  }
}
