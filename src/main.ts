import '@fontsource/baloo-bhaijaan-2/arabic-600.css';
import '@fontsource/baloo-bhaijaan-2/arabic-800.css';
import '@fontsource/baloo-bhaijaan-2/latin-800.css';
import './ui/style.css';
import './render/threeSetup';

import { SimWorld } from './sim/world';
import { Renderer } from './render/renderer';
import { CameraRig } from './render/cameraRig';
import { CharacterView } from './render/character';
import { DustFx } from './render/dust';
import { buildWorld } from './render/worldView';
import { Input } from './ui/input';
import { Hud } from './ui/hud';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui')!;

const sim = new SimWorld(Date.now() & 0xffffffff);
const view = new Renderer(canvas);
const rig = new CameraRig(view.camera);
buildWorld(view.scene);

const dust = new DustFx();
view.scene.add(dust.mesh);
const player = new CharacterView({ shirt: 0xf6c23e, pants: 0x2f4a7a, skin: 0xf1c7a0, hair: 0x3b2414 });
let stepSide = 1;
player.onStep = (c) => { stepSide = -stepSide; dust.emit(c.root.position.x, c.root.position.z, c.root.rotation.y, stepSide * 0.6); };
view.scene.add(player.root);

const input = new Input(uiRoot);
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

rig.snap(sim.player.x, sim.player.z);

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

  const p = sim.player;
  player.update(p.x, p.z, p.rot, p.speed, real, false);
  dust.update(real);
  rig.update(p.x, p.z, real);
  hud.setMoney(0);

  view.measure(real);
  fpsT += real;
  if (!fpsEl.hidden && fpsT > 0.5) { fpsT = 0; fpsEl.textContent = `${Math.round(view.fps)} fps · ${view.pixelRatio.toFixed(2)}x`; }

  view.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
