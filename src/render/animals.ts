import * as THREE from 'three';
import type { ProducerKind } from '../config/economy';
import type { Station } from '../sim/station';
import { MAT } from './geo';
import { ANIMAL_GEO, ANIMAL_SHADOW } from './models';
import { easeOutBack } from './stacks';

const CAP = 64;
const BLOB_GEO = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2);
const BLOB_MAT = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false });

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();

/** All animals of one station: one InstancedMesh for bodies, one for contact shadows. */
export class AnimalHerdView {
  private body: THREE.InstancedMesh;
  private shadow: THREE.InstancedMesh;
  private popT = new Float32Array(CAP).fill(1);
  private shown = 0;
  private shadowR: number;

  constructor(scene: THREE.Scene, kind: ProducerKind, private seedPhase: number) {
    this.body = new THREE.InstancedMesh(ANIMAL_GEO[kind], MAT, CAP);
    this.shadow = new THREE.InstancedMesh(BLOB_GEO, BLOB_MAT, CAP);
    for (const m of [this.body, this.shadow]) {
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
    this.shadowR = ANIMAL_SHADOW[kind];
  }

  update(st: Station, time: number, dt: number, pop: boolean): void {
    const list = st.animals, n = Math.min(CAP, list.length);
    for (let i = this.shown; i < n; i++) this.popT[i] = pop ? 0 : 1;
    this.shown = n;
    for (let i = 0; i < n; i++) {
      const a = list[i];
      let sc = 1;
      if (this.popT[i] < 1) { this.popT[i] = Math.min(1, this.popT[i] + dt * 5); sc = Math.max(0.01, easeOutBack(this.popT[i])); }
      // peck/graze while standing, hop when producing
      const peck = a.pause > 0 ? Math.max(0, Math.sin(time * 6 + i * 1.7 + this.seedPhase)) * 0.25 : 0;
      const hop = Math.sin(a.hop * Math.PI) * 0.35;
      _q.setFromEuler(_e.set(peck, a.rot, 0, 'YXZ'));
      this.body.setMatrixAt(i, _m.compose(_p.set(a.x, hop, a.z), _q, _s.set(sc, sc, sc)));
      _q.identity();
      this.shadow.setMatrixAt(i, _m.compose(_p.set(a.x, 0.02, a.z), _q, _s.setScalar(this.shadowR * sc)));
    }
    this.body.count = n;
    this.shadow.count = n;
    this.body.instanceMatrix.needsUpdate = true;
    this.shadow.instanceMatrix.needsUpdate = true;
  }
}
