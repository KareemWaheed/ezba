import '@fontsource/baloo-bhaijaan-2/arabic-600.css';
import '@fontsource/baloo-bhaijaan-2/arabic-800.css';
import '@fontsource/baloo-bhaijaan-2/latin-800.css';
import './ui/style.css';
import './render/threeSetup';

import * as THREE from 'three';
import { ECONOMY } from './config/economy';
import { SimWorld } from './sim/world';
import { Renderer } from './render/renderer';
import { CameraRig } from './render/cameraRig';
import { CharacterView } from './render/character';
import { DustFx } from './render/dust';
import { buildWorld } from './render/worldView';
import { FarmView } from './render/farmView';
import { CarrierView } from './render/stacks';
import { Input } from './ui/input';
import { Hud } from './ui/hud';
import { sfx, unlockAudio } from './audio';
import { guideTarget } from './sim/guide';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui')!;

const sim = new SimWorld(Date.now() & 0x7fffffff);
const view = new Renderer(canvas);
const rig = new CameraRig(view.camera);
buildWorld(view.scene);
const farm = new FarmView(view.scene, sim);

const dust = new DustFx();
view.scene.add(dust.mesh);
const player = new CharacterView({ shirt: 0xf6c23e, pants: 0x2f4a7a, skin: 0xf1c7a0, hair: 0x3b2414 });
const playerStack = new CarrierView(player.root);
let stepSide = 1;
player.onStep = (c) => { stepSide = -stepSide; dust.emit(c.root.position.x, c.root.position.z, c.root.rotation.y, stepSide * 0.6); };
view.scene.add(player.root);

const input = new Input(uiRoot);
input.onGesture = unlockAudio;
const hud = new Hud(uiRoot);
hud.showHint(true);

// temporary FPS readout until the M9 debug panel: triple-tap the money counter
const fpsEl = document.createElement('div');
fpsEl.id = 'fps';
fpsEl.hidden = true;
uiRoot.appendChild(fpsEl);
let taps: number[] = [];
hud.money.addEventListener('pointerdown', () => {
  const now = performance.now();
  taps = taps.filter((t) => now - t < 700);
  taps.push(now);
  if (taps.length >= 3) { fpsEl.hidden = !fpsEl.hidden; taps = []; }
});

const _sv = new THREE.Vector3();
function toScreen(x: number, y: number, z: number): THREE.Vector3 {
  _sv.set(x, y, z).project(view.camera);
  _sv.x = ((_sv.x + 1) / 2) * innerWidth;
  _sv.y = ((1 - _sv.y) / 2) * innerHeight;
  return _sv;
}

/** Items dropped in the current unload run (for the arpeggio on big unloads). */
let dropRun = 0;
function onEvent(e: Parameters<Parameters<typeof sim.events.drain>[0]>[0]): void {
  farm.onEvent(e);
  switch (e.type) {
    case 'pick': sfx.pick(e.n); break;
    case 'drop':
      dropRun++;
      sfx.drop();
      if (e.n === 0) { if (dropRun >= 6) sfx.arpeggio(dropRun); dropRun = 0; }
      break;
    case 'sell': sfx.sell(); break;
    case 'paid': sfx.kaching(); break;
    case 'collect': {
      sfx.kaching();
      const s = toScreen(sim.player.x, 2.6, sim.player.z);
      hud.float(`+${e.value}`, s.x, s.y);
      break;
    }
    default: break;
  }
}

document.fonts?.ready.then(() => farm.invalidateText());

rig.snap(sim.player.x, sim.player.z);
if (import.meta.env.DEV) Object.assign(window, { sim, input, guideTarget });

let last = performance.now();
let fpsT = 0;
function frame(now: number): void {
  const real = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;

  input.poll();
  if (input.moved) hud.showHint(false);
  sim.input.x = input.x;
  sim.input.z = input.z;
  sim.advance(real);
  sim.events.drain(onEvent);

  const p = sim.player;
  player.update(p.x, p.z, p.rot, p.speed, real, sim.carry.n > 0);
  playerStack.update(sim.carry.items, Math.min(1, p.speed / ECONOMY.player.speed), real);
  farm.sync(sim, real);
  farm.endFrame(real);
  dust.update(real);
  rig.update(p.x, p.z, real);
  hud.setMoney(sim.money);
  if (sim.carry.full()) {
    const s = toScreen(p.x, 0.78 + playerStack.height + 0.5, p.z);
    hud.setFull(s.x, s.y, true);
  } else hud.setFull(0, 0, false);

  view.measure(real);
  fpsT += real;
  if (!fpsEl.hidden && fpsT > 0.5) { fpsT = 0; fpsEl.textContent = `${Math.round(view.fps)} fps · ${view.pixelRatio.toFixed(2)}x`; }

  view.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
