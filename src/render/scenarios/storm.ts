import * as THREE from 'three';
import type { StormMechanic } from '../../sim/scenarios/storm';
import type { SimWorld } from '../../sim/world';
import { MAT } from '../geo';
import { ANIMAL_GEO } from '../models';
import { CanvasSprite, EMOJI } from '../canvas';
import type { Renderer } from '../renderer';
import type { MechanicView } from './types';

/** Soft round light pool texture (white center fading out). */
function poolTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,244,200,0.85)');
  g.addColorStop(0.55, 'rgba(255,236,170,0.35)');
  g.addColorStop(1, 'rgba(255,236,170,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

interface StrayMesh { body: THREE.Mesh; tag: CanvasSprite }

/**
 * Storm: dark scene, a flashlight pool around the player, and the escaped animals hopping around
 * with a "!" over their heads (a heart when they're on their way home).
 */
export class StormView implements MechanicView {
  private group = new THREE.Group();
  private light: THREE.Mesh;
  private meshes: StrayMesh[] = [];
  private time = 0;

  constructor(private scene: THREE.Scene, private view: Renderer) {
    scene.add(this.group);
    this.light = new THREE.Mesh(
      new THREE.CircleGeometry(4.2, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.light.position.y = 0.03;
    this.light.renderOrder = 2;
    this.group.add(this.light);
  }

  private mesh(i: number, sim: SimWorld, station: number): StrayMesh {
    let m = this.meshes[i];
    if (!m) {
      const kind = sim.stations[station].def.producer ?? 'chicken';
      const body = new THREE.Mesh(ANIMAL_GEO[kind], MAT);
      const tag = new CanvasSprite(64, 64, 0.7);
      this.group.add(body, tag.sprite);
      m = { body, tag };
      this.meshes[i] = m;
      this.drawTag(m, false);
    }
    return m;
  }

  private drawTag(m: StrayMesh, home: boolean): void {
    m.tag.draw((c, w, h) => { c.font = `44px ${EMOJI}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(home ? '❤️' : '❗', w / 2, h / 2 + 2); });
    m.tag.sprite.userData.home = home;
  }

  sync(sim: SimWorld, dt: number): void {
    this.time += dt;
    // darker than the generic storm tint: the flashlight is the only good light
    this.view.setMood(0.3);
    const p = sim.player;
    this.light.position.x = p.x + Math.sin(p.rot) * 1.2;
    this.light.position.z = p.z + Math.cos(p.rot) * 1.2;
    const m = sim.scenario.mech as StormMechanic;
    const strays = m.strays ?? [];
    strays.forEach((s, i) => {
      const v = this.mesh(i, sim, s.station);
      const visible = !s.done;
      v.body.visible = v.tag.sprite.visible = visible;
      if (!visible) return;
      const hop = Math.abs(Math.sin(this.time * (s.home ? 9 : 12) + i)) * 0.25;
      v.body.position.set(s.x, hop, s.z);
      v.body.rotation.y = Math.atan2(s.tx - s.x, s.tz - s.z);
      v.tag.sprite.position.set(s.x, 1.5 + hop + Math.sin(this.time * 4 + i) * 0.08, s.z);
      if (v.tag.sprite.userData.home !== s.home) this.drawTag(v, s.home);
    });
    for (let i = strays.length; i < this.meshes.length; i++) this.meshes[i].body.visible = this.meshes[i].tag.sprite.visible = false;
  }

  dispose(): void {
    this.scene.remove(this.group);
    for (const m of this.meshes) m.tag.dispose();
    (this.light.material as THREE.MeshBasicMaterial).map?.dispose();
  }
}
