import * as THREE from 'three';
import { CROWD_LOOKS, type CrowdLook } from '../../config/looks';
import type { ProcessionMechanic } from '../../sim/scenarios/procession';
import type { SimWorld } from '../../sim/world';
import { CharacterView } from '../character';
import { bodyAccessories } from '../accessories';
import { CanvasSprite, EMOJI } from '../canvas';
import { ITEM_ICON } from '../models';
import type { MechanicView } from './types';

interface WalkerView { char: CharacterView; tag: CanvasSprite; shown: string }

/**
 * Walking group: wedding guests dancing along (zaffa) or tourists with phones (tour). Each shows what
 * they want over their head, a heart once served; the tour's photo marker pulses at the last stop.
 */
export class ProcessionView implements MechanicView {
  private group = new THREE.Group();
  private walkers: WalkerView[] = [];
  private marker: THREE.Mesh;
  private time = 0;

  constructor(private scene: THREE.Scene) {
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.68, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    this.marker.visible = false;
    this.group.add(this.marker);
    scene.add(this.group);
  }

  private build(sim: SimWorld, m: ProcessionMechanic): void {
    const look: CrowdLook = CROWD_LOOKS[sim.scenario.def.crowd ?? (m.variant === 'tour' ? 'tourists' : 'wedding')];
    m.guests.forEach((_, i) => {
      const char = new CharacterView({ shirt: look.shirts[i % look.shirts.length], pants: look.pants[i % look.pants.length], skin: [0xf1c7a0, 0xd9a074, 0xa86d45][i % 3], hair: [0x1d1d1d, 0x3b2414, 0x5a3a22][i % 3] });
      const acc = look.hat ? bodyAccessories({ hat: look.hat }) : null;
      if (acc) char.attach(acc);
      const tag = new CanvasSprite(64, 64, 0.6);
      this.group.add(char.root, tag.sprite);
      this.walkers.push({ char, tag, shown: '' });
    });
  }

  sync(sim: SimWorld, dt: number): void {
    this.time += dt;
    const m = sim.scenario.mech as ProcessionMechanic;
    if (!m.guests) return;
    if (!this.walkers.length && m.guests.length) this.build(sim, m);
    m.guests.forEach((g, i) => {
      const v = this.walkers[i];
      if (!v) return;
      const on = g.x > -50;
      v.char.root.visible = v.tag.sprite.visible = on;
      if (!on) return;
      const stopped = m.stopT > 0;
      v.char.update(g.x, g.z, g.rot, stopped ? 0 : 0.8, dt, false);
      // wedding guests dance with an arm up; tourists film at stops
      if (m.variant === 'zaffa' && (i + Math.floor(this.time * 2)) % 3 === 0) v.char.wave(this.time + i);
      if (m.variant === 'tour' && stopped) v.char.film();
      const key = g.served ? 'ok' : g.want;
      if (v.shown !== key) {
        v.shown = key;
        v.tag.draw((c, w, h) => {
          c.fillStyle = g.served ? 'rgba(217,106,167,0.9)' : 'rgba(255,255,255,0.92)';
          c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 3, 0, Math.PI * 2); c.fill();
          c.font = `36px ${EMOJI}`; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(g.served ? '❤️' : ITEM_ICON[g.want], w / 2, h / 2 + 2);
        });
      }
      v.tag.sprite.position.set(g.x, 2.15 + Math.sin(this.time * 5 + i) * 0.05, g.z);
    });
    this.marker.visible = !!m.photoAt;
    if (m.photoAt) {
      this.marker.position.set(m.photoAt.x, 0.05, m.photoAt.z);
      const s = 1 + Math.abs(Math.sin(this.time * 6)) * 0.25;
      this.marker.scale.set(s, 1, s);
    }
  }

  dispose(): void {
    this.scene.remove(this.group);
    for (const v of this.walkers) v.tag.dispose();
  }
}
