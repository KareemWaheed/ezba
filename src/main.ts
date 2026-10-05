import '@fontsource/baloo-bhaijaan-2/arabic-600.css';
import '@fontsource/baloo-bhaijaan-2/arabic-800.css';
import '@fontsource/baloo-bhaijaan-2/latin-800.css';
import './ui/style.css';
import './render/threeSetup';

import * as THREE from 'three';
import { ECONOMY, type ItemId } from './config/economy';
import { SimWorld } from './sim/world';
import { Renderer } from './render/renderer';
import { CameraRig } from './render/cameraRig';
import { CharacterView } from './render/character';
import { DustFx } from './render/dust';
import { buildWorld } from './render/worldView';
import { FarmView } from './render/farmView';
import { CarrierView } from './render/stacks';
import { PRIM, merge, part } from './render/geo';
import { Input } from './ui/input';
import { Hud } from './ui/hud';
import { music, sfx, unlockAudio } from './audio';
import { guideTarget, nextGoal } from './sim/guide';
import { restore, serialize } from './sim/save';
import { UPGRADES } from './config/upgrades';
import { MODE, chosenMode, clearSave, loadSave, requestPersistence, writeSave } from './storage';
import { TitleScreen } from './ui/titleScreen';
import { GoalCard, Toast } from './ui/panels';
import { preventZoom } from './ui/noZoom';
import { PressureHud } from './ui/pressureHud';
import { ScenarioHud } from './ui/scenarioHud';
import { ScenarioView } from './render/scenarioView';
import { Cinematic } from './render/cinematic';
import { CommentFeed } from './ui/commentFeed';
import { LAYOUT } from './config/layout';
import { clockFromDate } from './config/events';
import { Modal, fmtAway, fmtMoney, ltr } from './ui/modal';
import { DebugPanel } from './ui/debug';
import { MetaMenus, dayKey } from './ui/menus';
import { OrderPanel } from './ui/orderPanel';
import { ITEM_ICON } from './render/models';
import { ALBUM_PAGES } from './config/album';
import { simulateAway } from './sim/offline';

preventZoom();
const canvas = document.getElementById('c') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui')!;

const sim = new SimWorld(Date.now() & 0x7fffffff, MODE);
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
// sickle in the right hand while standing in an open field; swings while cutting
const sickle = player.attach(merge([
  part(PRIM.box, 0x8a5a32, 0, -0.12, 0.08, 0.3, 0, 0, 0.06, 0.06, 0.32),
  part(PRIM.box, 0xd9dde3, 0, -0.1, 0.32, 0, 0.5, 0, 0.04, 0.03, 0.3),
  part(PRIM.box, 0xd9dde3, 0.12, -0.1, 0.42, 0, 1.3, 0, 0.04, 0.03, 0.22),
]), 'hand');
sickle.visible = false;
let swishT = 0;

const input = new Input(uiRoot);
input.onGesture = unlockAudio;
const hud = new Hud(uiRoot);
hud.onRide = () => sim.field.toggleVehicle();
const toast = new Toast(uiRoot);
const goalCard = new GoalCard(uiRoot);
const pressureHud = new PressureHud(uiRoot);
const scenarioHud = new ScenarioHud(uiRoot);
const scenarioView = new ScenarioView(view.scene, view);
const cinematic = new Cinematic(uiRoot, rig);
const commentFeed = new CommentFeed(uiRoot);
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

const modal = new Modal(uiRoot);

/** Time away (reopen or tab return): run the automation for it and say what it earned. */
function welcomeBack(seconds: number): void {
  if (seconds < ECONOMY.offline.minSeconds) return;
  const r = simulateAway(sim, seconds);
  sim.events.drain(() => {});
  const capped = seconds > ECONOMY.offline.capSeconds ? `<div class="m-note">(بنحسب لحد ${fmtAway(ECONOMY.offline.capSeconds)} بس)</div>` : '';
  if (r.earned > 0) {
    sfx.kaching();
    modal.open(`
      <div class="m-icon">👋</div>
      <div class="m-title">أهلاً بيك تاني!</div>
      <div>وانت غايب ${fmtAway(seconds)}، العمال والمكن كسبولك</div>
      <div class="m-big">+${fmtMoney(r.earned)} 💰</div>${capped}
      <button class="m-btn" data-close>تمام</button>`);
  } else if (seconds >= 600) {
    modal.open(`
      <div class="m-icon">😴</div>
      <div class="m-title">أهلاً بيك تاني!</div>
      <div>المزرعة ما كسبتش حاجة وانت غايب. وظّف عمال وكاشير عشان يشتغلوا وانت مش موجود.</div>
      <button class="m-btn" data-close>ماشي</button>`);
  }
  save();
}
if (saved) welcomeBack((Date.now() - saved.t) / 1000);
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (hiddenAt) welcomeBack((Date.now() - hiddenAt) / 1000);
  hiddenAt = 0;
});

sim.daily.ensure(dayKey());
const title = new TitleScreen(uiRoot, save);
// first launch (or first since the supermarket game arrived): pick a game
if (!chosenMode()) title.show();
const menus = new MetaMenus(uiRoot, sim, modal);
menus.onSwitchGame = () => title.show(true);
const orderPanel = new OrderPanel(sim, modal);
menus.onLegacyReady = () => { sfx.fanfare(); toast.show('🏆 فتحت كل حاجة! دوس 🏆 وابدأ عزبة أكبر'); };

const debug = new DebugPanel(uiRoot, sim, view, {
  away: (sec) => welcomeBack(sec),
  reset: () => { clearSave(); location.reload(); },
}, hud.money);

const _sv = new THREE.Vector3();
function toScreen(x: number, y: number, z: number): THREE.Vector3 {
  _sv.set(x, y, z).project(view.camera);
  _sv.x = ((_sv.x + 1) / 2) * innerWidth;
  _sv.y = ((1 - _sv.y) / 2) * innerHeight;
  return _sv;
}

/** Items dropped in the current unload run (for the arpeggio on big unloads). */
let dropRun = 0;
/** Sounds for a mechanic's cues (n is mechanic-specific; see sim/scenarios/). */
function cueSound(mech: string | undefined, n: number, v = 0): void {
  if (mech === 'storm') { if (n === 1) sfx.angry(); else sfx.fixed(); }
  // motorcade: 1 security ok, 2 photo countdown (value = count), 3 photo taken, 4 missed, 9 turned away
  if (mech === 'motorcade') {
    if (n === 1) { sfx.fixed(); toast.show('الأمن: تمام، اتفضل 🛂✅'); }
    else if (n === 2) { sfx.coin(); toast.show(`📸 ${v}...`); }
    else if (n === 3) { sfx.fanfare(); toast.show('صورة تاريخية! 📸✨'); }
    else if (n === 4) toast.show('الصورة طلعت من غيرك 😅 كمان مرة!');
    else if (n === 9) { sfx.angry(); toast.show('الحرس: لازم تعدّي على بوابة الأمن الأول! 🛂'); }
  }
  // procession: 1 a walker got their order (value = paid), 2 photo countdown, 3 photo taken, 4 missed
  if (mech === 'procession') {
    if (n === 1) sfx.tip();
    else if (n === 2) { sfx.alarm(); toast.show('المرشد: كله يتجمع للصورة! 📸 اقف معاهم'); }
    else if (n === 3) { sfx.fanfare(); toast.show('Cheese! صورة حلوة 📸'); }
    else if (n === 4) toast.show('الصورة اتاخدت من غيرك 😅');
  }
  if (mech === 'derby' && n === 1) { sfx.angry(); toast.show('الجمهورين اشتبكوا بالهتافات! 📣 اخدم الناحية التانية'); }
  if (mech === 'filming') {
    if (n === 1) { sfx.alarm(); toast.show('🎬 أكشن! اتجمّد مكانك'); }
    else if (n === 2) { sfx.fixed(); toast.show(`كات! مشهد ${v} تمام 👏`); }
    else if (n === 3) { sfx.angry(); toast.show('المخرج: كات كات! إنت دخلت في الكادر 🤦 تاني!'); }
  }
  if (mech === 'chase' && n === 1) { sfx.fanfare(); toast.show(`مسكته! 🚓 الفلوس رجعت ومعاها مكافأة ${v}`); }
  if (mech === 'cookoff') {
    if (n === 1) { sfx.sparkle(); toast.show('الشيف: الوصفة الجاية! 📜'); }
    else if (n === 2) { sfx.fanfare(); toast.show('الشيف: الله عليك! 👨‍🍳👌'); }
    else if (n === 3) toast.show('الوقت خلص على الوصفة دي 😕');
  }
  if (mech === 'iftar' && n === 2) { sfx.clunk(); sfx.fanfare(); toast.show('مدفع الإفطار! 🌙💥 كل سنة وانت طيب'); }
  if (mech === 'khamaseen') { if (n === 1) sfx.fixed(); else sfx.swish(); }
  if (mech === 'bulk' && n === 1) { sfx.fanfare(); toast.show('تمام يا فندم! الطلبية كاملة 🪖✅'); }
  if (mech === 'stage') { if (n === 1) sfx.tip(); else sfx.angry(); }
  if (mech === 'comments') { if (n === 1) sfx.sell(); else sfx.tip(); }
  if (mech === 'inspector') { if (n === 1) sfx.fixed(); else sfx.clunk(); }
  // football: 1 goal, 2 saved, 3 cone passed, 4 shot without the cones
  if (mech === 'football') { if (n === 1) { sfx.fanfare(); toast.show('جووون! ⚽🔥 الفانز هيدفعوا أكتر'); } else if (n === 2) sfx.clunk(); else if (n === 3) sfx.coin(); else toast.show('لازم تلف على كل الأقماع الأول! 🔶'); }
}

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
    case 'cut': {
      const t = performance.now();
      if (t - swishT > 90) { swishT = t; sfx.swish(); }
      break;
    }
    case 'cropSold': sfx.sell(); break;
    case 'trash': sfx.swish(); break;
    case 'delivery':
      sfx.clunk();
      if (sim.upgrades.level('market.auto') === 0) toast.show(`🚚 وصلت البضاعة: ${ltr(`${e.n}`)} ${ITEM_ICON[e.product as ItemId]} في المخزن`);
      break;
    case 'albumNew': {
      const en = ALBUM_PAGES[e.n]?.entries[e.id];
      if (en) { sfx.sparkle(); toast.show(`📖 جديد في الألبوم: ${en.name} ${en.icon}`); }
      break;
    }
    case 'albumPage': sfx.fanfare(); toast.show(`📖 كمّلت صفحة "${ALBUM_PAGES[e.n].name}"! ${ltr(`+${e.value.toLocaleString('en-US')}`)} 💰`); break;
    case 'taskDone': sfx.sparkle(); toast.show('📋 خلصت مهمة! افتح المهام واستلم الجايزة'); break;
    case 'taskClaimed': {
      sfx.kaching();
      const s = toScreen(sim.player.x, 2.6, sim.player.z);
      hud.float(`+${e.value}`, s.x, s.y);
      save();
      break;
    }
    case 'goldenStalk': {
      sfx.fanfare();
      const s = toScreen(e.x, 2, e.z);
      hud.float(`✨ +${e.value}`, s.x, s.y);
      break;
    }
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
    case 'truck': {
      const t = sim.contracts.truck;
      sfx.sparkle();
      toast.show(`🚚 عربية ${t.company.name} جاية${e.n ? ' (طلبية مستعجلة!)' : ''}، حمّلها من الرصيف`);
      break;
    }
    case 'truckDone':
      if (e.value > 0) { sfx.kaching(); toast.show(`${sim.contracts.truck.company.name} دفعت ${ltr(`+${e.value.toLocaleString('en-US')}`)} ${e.n ? '👍' : ''}`); }
      else toast.show(`العربية مشيت فاضية 😕`);
      break;
    case 'vip':
      if (e.id === -1) { sfx.sparkle(); toast.show(`${sim.scenario.def.guest?.name ?? ''} طلب! هات الطلب بنفسك للمنصة ⭐`); }
      else { sfx.sparkle(); toast.show('زبون VIP وصل! خدمه بنفسك ⭐'); }
      break;
    case 'scenarioWarn': sfx.alarm(); music.play(sim.scenario.def.music); break;
    case 'scenarioStart': {
      const d = sim.scenario.def;
      if (d.intro) scenarioHud.showIntro(d.intro, d.color);
      if (d.guest) {
        // pan to the carpet between where the guest steps out and the stage (closer to the stage, clear of the trees)
        const s = LAYOUT.vipStage;
        sfx.sparkle();
        cinematic.play(s.entry.x * 0.35 + s.seat.x * 0.65, s.entry.z * 0.35 + s.seat.z * 0.65);
      }
      break;
    }
    case 'scenarioCue': cueSound(sim.scenario.def.mechanic, e.n, e.value); break;
    case 'scenarioTwist': {
      const tw = sim.scenario.def.twists?.[e.n];
      if (tw) { sfx.alarm(); toast.show(tw.text); }
      break;
    }
    case 'scenarioEnd':
      music.stop();
      if (e.n) sfx.fanfare();
      scenarioHud.showResult(sim, !!e.n, e.value, e.id);
      break;
    case 'rushEnd':
      if (e.n) { sfx.fanfare(); toast.show(`الزحمة عدّت من غير زعل! ${ltr(`+${e.value}`)} 🎉`); }
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
if (import.meta.env.DEV) Object.assign(window, { sim, input, guideTarget, farm });

let last = performance.now();
let goalT = 0;
function frame(now: number): void {
  const real = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;

  input.poll();
  if (input.moved) hud.showHint(false);
  sim.input.x = input.x;
  sim.input.z = input.z;
  hud.setTrash(sim.carry.n > 0 && !sim.away);
  const f = sim.field;
  hud.setRide(!f.canToggle ? '' : f.driving ? 'off' : 'on', f.vehicle === 'combine' ? '🌾' : '🚜');
  sim.trashing = hud.trashHeld;
  cinematic.update(real);
  sim.advance(real * debug.speed * cinematic.timeScale);
  sim.events.drain(onEvent);

  const p = sim.player;
  const driving = sim.field.driving ? sim.field.vehicle : null;
  player.update(p.x, p.z, p.rot, driving ? 0 : p.speed, real, sim.carry.n > 0, !!driving);
  playerStack.update(sim.carry.items, Math.min(1, p.speed / ECONOMY.player.speed), real);
  const inField = !driving && (sim.field.plotAt(p.x, p.z)?.open ?? false);
  sickle.visible = inField;
  sickle.rotation.x = sim.field.cutting > 0 ? Math.sin(now * 0.03) * 0.9 : 0;
  farm.field.quality = view.fps < 40 ? 0.5 : 1;
  farm.sync(sim, real);
  player.shadow.visible = !driving;
  if (driving) farm.field.vehicles.seat(player.root, driving);
  farm.endFrame(real);
  if (farm.coinFlew) sfx.coin();
  dust.update(real);
  rig.update(p.x, p.z, real);
  locks.hrYard.visible = sim.upgrades.level('hr.office') === 0;
  locks.pen.visible = !sim.stations.some((s) => s.def.id === 'milk' && s.open);
  locks.cafe.visible = !sim.cafe.open;
  hud.setMoney(sim.money);
  pressureHud.update(sim);
  scenarioHud.update(sim);
  commentFeed.update(sim);
  scenarioView.sync(sim, real);
  if (sim.scenario.phase === 'idle') music.stop();
  goalT -= real;
  if (goalT <= 0) { goalT = 0.25; goalCard.update(nextGoal(sim), sim.money); }
  if (sim.carry.full()) {
    const s = toScreen(p.x, 0.78 + playerStack.height + 0.5, p.z);
    hud.setFull(s.x, s.y, true);
  } else hud.setFull(0, 0, false);

  view.measure(real);
  debug.update(real);
  menus.update(real);
  orderPanel.update();

  view.render(real);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
