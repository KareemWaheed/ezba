import * as THREE from 'three';
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { MAT, PRIM, merge, part } from './geo';

type Rapier = typeof RAPIER_NS;

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** Chassis rests this high above the vehicle's ground anchor (spring length 0). */
const RIDE = 0.6;
const CORNERS = [[-0.6, -0.9], [0.6, -0.9], [-0.6, 0.9], [0.6, 0.9]] as const;
const CHAFF_CAP = 150;
/** Visible body tilt cap (radians). */
const MAX_TILT = 0.14;
const IDENTITY = new THREE.Quaternion();
const CHAFF_LIFE = 1.3;
/** Collision groups: chassis (member 2) collides with nothing; chaff (member 1) with the ground (member 1). */
const NO_COLLIDE = 0x0002_0000;

/**
 * Cosmetic-only physics (stage 4): a sprung vehicle body that bobs and tilts over the field, and
 * chaff bits that scatter, bounce and settle. The suspension is simulated in the vehicle's own frame
 * (anchor fixed at the origin, body yaw locked): driving shows up as inertial pushes (lean in turns,
 * dip when braking) plus random wheel bumps. Rapier loads lazily the first time the fields open;
 * nothing here ever feeds back into the sim. Until it's ready, callers fall back to simple effects.
 */
export class PhysicsFx {
  ready = false;
  private R!: Rapier;
  private world!: RAPIER_NS.World;
  private anchor!: RAPIER_NS.RigidBody;
  private chassis!: RAPIER_NS.RigidBody;
  private chaff: RAPIER_NS.RigidBody[] = [];
  private life = new Float32Array(CHAFF_CAP);
  private next = 0;
  private acc = 0;
  private bumpT = 0;
  /** Vehicle position/velocity last frame (world), for its acceleration. */
  private px = NaN;
  private pz = 0;
  private vx = 0;
  private vz = 0;
  readonly mesh: THREE.InstancedMesh;
  /** Chassis offset relative to the anchor (local), read by the vehicle view. */
  readonly offset = new THREE.Vector3();
  readonly tilt = new THREE.Quaternion();

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(merge([part(PRIM.box, 0xffffff, 0, 0, 0, 0, 0, 0, 0.14, 0.03, 0.06)]), MAT, CHAFF_CAP);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < CHAFF_CAP; i++) { this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); this.mesh.setColorAt(i, _c.setRGB(1, 1, 1)); }
    scene.add(this.mesh);
  }

  /** Load Rapier (separate chunk) and build the world. Safe to call more than once. */
  private loading = false;
  load(): void {
    if (this.loading) return;
    this.loading = true;
    import('@dimforge/rapier3d-compat').then(async (mod) => {
      const R = (mod as unknown as { default?: Rapier }).default ?? (mod as unknown as Rapier);
      await R.init();
      this.R = R;
      this.build();
      this.ready = true;
    }).catch(() => { /* stays on the fallback effects */ });
  }

  private build(): void {
    const R = this.R;
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.createCollider(R.ColliderDesc.cuboid(200, 0.1, 200).setTranslation(0, -0.1, 0).setFriction(0.9).setCollisionGroups(0x0001_0001));
    this.anchor = this.world.createRigidBody(R.RigidBodyDesc.fixed());
    this.chassis = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0, RIDE, 0).enabledRotations(true, false, true).setLinearDamping(1.5).setAngularDamping(3));
    this.world.createCollider(R.ColliderDesc.cuboid(0.7, 0.3, 1.0).setDensity(40).setCollisionGroups(NO_COLLIDE), this.chassis);
    for (const [x, z] of CORNERS) {
      this.world.createImpulseJoint(R.JointData.spring(0, 3200, 160, { x, y: RIDE, z }, { x, y: 0, z }), this.anchor, this.chassis, true);
    }
    for (let i = 0; i < CHAFF_CAP; i++) {
      const b = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0, -5, 0).setCanSleep(true));
      this.world.createCollider(R.ColliderDesc.cuboid(0.07, 0.015, 0.03).setDensity(2).setRestitution(0.35).setFriction(0.8).setCollisionGroups(0x0001_0001), b);
      b.setEnabled(false);
      this.chaff.push(b);
    }
  }

  /** Spray `count` chaff bits from a cut point. */
  burst(x: number, z: number, color: number, count: number, rand: () => number): void {
    if (!this.ready) return;
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % CHAFF_CAP;
      const b = this.chaff[i];
      b.setEnabled(true);
      b.setTranslation({ x, y: 0.6, z }, true);
      const a = rand() * Math.PI * 2, sp = 0.8 + rand() * 1.6;
      b.setLinvel({ x: Math.cos(a) * sp, y: 2 + rand() * 2, z: Math.sin(a) * sp }, true);
      b.setAngvel({ x: (rand() - 0.5) * 20, y: (rand() - 0.5) * 20, z: (rand() - 0.5) * 20 }, true);
      this.life[i] = CHAFF_LIFE * (0.7 + rand() * 0.3);
      this.mesh.setColorAt(i, _c.setHex(color).multiplyScalar(0.8 + rand() * 0.35));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /**
   * Step the world and read results. `x, z, rot` = where the vehicle is (the anchor follows it);
   * `bumpy` = driving through stalks (random kicks on the wheels).
   */
  update(dt: number, x: number, z: number, rot: number, moving: boolean, bumpy: boolean, rand: () => number): void {
    if (!this.ready || dt <= 0) return;
    // vehicle acceleration in its own frame (skip jumps: parking / un-parking)
    const nvx = (x - this.px) / dt, nvz = (z - this.pz) / dt;
    const jump = Number.isNaN(this.px) || Math.hypot(x - this.px, z - this.pz) > 2;
    const ax = jump ? 0 : (nvx - this.vx) / dt, az = jump ? 0 : (nvz - this.vz) / dt;
    this.px = x; this.pz = z;
    this.vx = jump ? 0 : nvx; this.vz = jump ? 0 : nvz;
    const c = Math.cos(rot), sn = Math.sin(rot);
    const lx = ax * c - az * sn, lz = ax * sn + az * c;
    const m = this.chassis.mass(), k = 0.006;
    const fx = Math.max(-1, Math.min(1, -lx * k)) * m, fz = Math.max(-1, Math.min(1, -lz * k)) * m;
    const t = this.chassis.translation();
    // inertia acts above the springs, so the body leans (turns) and pitches (speed changes)
    if (fx || fz) this.chassis.applyImpulseAtPoint({ x: fx * dt * 60, y: 0, z: fz * dt * 60 }, { x: t.x, y: t.y + 0.5, z: t.z }, true);
    this.bumpT -= dt;
    if (moving && this.bumpT <= 0) {
      this.bumpT = bumpy ? 0.08 + rand() * 0.1 : 0.25 + rand() * 0.3;
      const [cx, cz] = CORNERS[Math.floor(rand() * 4)];
      const kick = (bumpy ? 5 : 2) * (0.5 + rand());
      this.chassis.applyImpulseAtPoint({ x: 0, y: kick, z: 0 }, { x: t.x + cx, y: t.y, z: t.z + cz }, true);
    }
    // fixed 60 Hz steps
    this.acc = Math.min(this.acc + dt, 0.1);
    while (this.acc >= 1 / 60) { this.world.step(); this.acc -= 1 / 60; }
    const ct = this.chassis.translation(), cr = this.chassis.rotation();
    this.offset.set(ct.x, ct.y - RIDE, ct.z).clampLength(0, 0.25);
    this.tilt.set(cr.x, cr.y, cr.z, cr.w);
    // keep it a light wobble: at most MAX_TILT radians
    const ang = 2 * Math.acos(Math.min(1, Math.abs(this.tilt.w)));
    if (ang > MAX_TILT) this.tilt.slerpQuaternions(IDENTITY, this.tilt, MAX_TILT / ang);
    // chaff
    let any = false;
    for (let i = 0; i < CHAFF_CAP; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      const b = this.chaff[i];
      if (this.life[i] <= 0) { b.setEnabled(false); this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
      const p = b.translation(), r = b.rotation(), sc = Math.min(1, this.life[i] * 3);
      this.mesh.setMatrixAt(i, _m.compose(_p.set(p.x, p.y, p.z), _q.set(r.x, r.y, r.z, r.w), _s.set(sc, sc, sc)));
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
