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
import { guideTarget, nextGoal } from './sim/guide';
import { restore, serialize } from './sim/save';
import { UPGRADES } from './config/upgrades';
import { clearSave, loadSave, requestPersistence, writeSave } from './storage';
import { GoalCard, Toast } from './ui/panels';
import { preventZoom } from './ui/noZoom';
import { PressureHud } from './ui/pressureHud';
import { clockFromDate } from './config/events';

preventZoom();
const canvas = document.getElementById('c') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui')!;

const sim = new SimWorld(Date.now() & 0x7fffffff);
const view = new Renderer(canvas);
const rig = new CameraRig(view.camera);
const locks = buildWorld(view.scene);
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
const toast = new Toast(uiRoot);
const goalCard = new GoalCard(uiRoot);
const pressureHud = new PressureHud(uiRoot);
sim.clock = clockFromDate(new Date());
setInterval(() => { sim.clock = clockFromDate(new Date()); }, 60_000);

// ---- save / load ----
const saved = loadSave();
if (saved) restore(sim, saved);
else hud.showHint(true);
const save = () => writeSave(serialize(sim, Date.now()));
setInterval(save, ECONOMY.save.autosaveEvery * 1000);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
addEventListener('pagehide', save);
void requestPersistence();

// temporary dev strip until the M9 debug panel: triple-tap the money counter
uiRoot.insertAdjacentHTML('beforeend', `
  <div id="dev" data-ui hidden>
    <span id="fps"></span>
    <button data-a="money">+500</button>
    <button data-a="rush">زحمة</button>
    <button data-a="break">عطل</button>
    <button data-a="vip">VIP</button>
    <button data-a="golden">دهبي</button>
    <button data-a="reset">ابدأ من الأول</button>
  </div>`);
const devEl = document.getElementById('dev')!;
const fpsEl = document.getElementById('fps')!;
devEl.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest('button')?.dataset.a;
  if (a === 'money') sim.money += 500;
  if (a === 'rush') sim.rush.trigger();
  if (a === 'break') for (const b of sim.staff.belts) if (b.level > 0) b.breakT = 0.01;
  if (a === 'vip') sim.customers.forceVip = true;
  if (a === 'golden') sim.golden.spawn();
  if (a === 'reset') { clearSave(); location.reload(); }
});
let taps: number[] = [];
hud.money.addEventListener('pointerdown', () => {
  const now = performance.now();
  taps = taps.filter((t) => now - t < 700);
  taps.push(now);
  if (taps.length >= 3) { devEl.hidden = !devEl.hidden; taps = []; }
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
    case 'tip': {
      sfx.tip();
      const s = toScreen(e.x, 3.4, e.z);
      hud.float(`+${e.value}`, s.x, s.y, 'tip');
      break;
    }
    case 'angry': {
      sfx.angry();
      const s = toScreen(e.x, 3.2, e.z);
      hud.float('😡', s.x, s.y, 'bad');
      break;
    }
    case 'rushWarn': sfx.alarm(); break;
    case 'vip': sfx.sparkle(); toast.show('زبون VIP وصل! خدمه بنفسك ⭐'); break;
    case 'rushEnd':
      if (e.n) { sfx.fanfare(); toast.show(`الزحمة عدّت من غير زعل! +${e.value} 🎉`); }
      else toast.show('الزحمة خلصت، بس في زباين زعلوا 😕');
      break;
    case 'break': sfx.clunk(); toast.show('السير عطل! روح صلّحه 🔧'); break;
    case 'fixed': sfx.fixed(); break;
    case 'feed': sfx.drop(); break;
    case 'golden': sfx.sparkle(); toast.show('في حيوان دهبي هرب! امسكه ✨'); break;
    case 'goldenCaught': {
      sfx.fanfare();
      const s = toScreen(e.x, 2, e.z);
      hud.float(`+${e.value}`, s.x, s.y);
      break;
    }
    case 'buy':
      sfx.buy();
      toast.show(UPGRADES[e.id].msg);
      save();
      break;
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
farm.sync(sim, 0, false);
if (import.meta.env.DEV) Object.assign(window, { sim, input, guideTarget });

let last = performance.now();
let fpsT = 0;
let goalT = 0;
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
  if (farm.coinFlew) sfx.coin();
  dust.update(real);
  rig.update(p.x, p.z, real);
  locks.hrYard.visible = sim.upgrades.level('hr.office') === 0;
  locks.pen.visible = !sim.stations.some((s) => s.def.id === 'milk' && s.open);
  locks.cafe.visible = !sim.cafe.open;
  hud.setMoney(sim.money);
  pressureHud.update(sim);
  goalT -= real;
  if (goalT <= 0) { goalT = 0.25; goalCard.update(nextGoal(sim), sim.money); }
  if (sim.carry.full()) {
    const s = toScreen(p.x, 0.78 + playerStack.height + 0.5, p.z);
    hud.setFull(s.x, s.y, true);
  } else hud.setFull(0, 0, false);

  view.measure(real);
  fpsT += real;
  if (!devEl.hidden && fpsT > 0.5) { fpsT = 0; fpsEl.textContent = `${Math.round(view.fps)} fps · ${view.pixelRatio.toFixed(2)}x`; }

  view.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
