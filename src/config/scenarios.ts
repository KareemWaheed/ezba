import type { ProductId } from './economy';
import type { CrowdStyle, FlagId, GuestLookId } from './looks';
import type { MechanicId } from '../sim/scenarios/mechanic';
import type { SimWorld } from '../sim/world';

export type { CrowdStyle } from './looks';

/**
 * Scenario events: special visits that change the rules, the look and the music for a few minutes.
 * Pure data; ScenarioSystem runs them and ScenarioView draws them. To add one: append an entry here
 * (and, for a new guest or crowd, a look in config/looks.ts).
 */

export type ScenarioProp = 'carpet' | 'flags' | 'motorcade' | 'guards' | 'confetti' | 'truck' | 'band' | 'rain' | 'ringLight' | 'clipboard';
export type MusicId = 'anthem' | 'chant' | 'drums' | 'zaffa' | 'thunder' | 'pop';

/** Goals checked when the scenario ends. All must pass for the big reward. */
export type ScenarioGoal =
  | 'noAngry'        // nobody leaves angry during the event
  | 'serveGuest'     // the special guest gets served
  | 'noJams'         // no machine jammed when it ends
  | 'cleanTables'    // no dirty café tables when it ends
  | 'likes';         // fill the likes meter with fast services

/** The special guest (served only by the player, like a VIP). */
export interface GuestDef {
  name: string;
  /** Key into GUEST_LOOKS (config/looks.ts). */
  look: GuestLookId;
  /** Order size multiplier and pay multiplier vs. a normal customer. */
  qtyMult: number;
  payMult: number;
  patience: number;
  /** Followers walking with the guest (guards, bride, cameraman...). Visual only. */
  entourage: number;
}

export interface ScenarioDef {
  id: string;
  icon: string;
  /** Banner title (Egyptian Arabic). */
  title: string;
  /** Short line under the title: what to do. */
  hint: string;
  /** Banner color. */
  color: string;
  weight: number;
  warning: number;
  duration: number;
  /** Customer arrival multiplier while active. */
  arrivalMult: number;
  /** Share of arrivals that wear the crowd look (and order the featured product). */
  crowdShare: number;
  crowd?: CrowdStyle;
  /** Featured product for the crowd (null = random each time). */
  featured?: ProductId | null;
  /** Crowd patience x, order size x, tip x. */
  patienceMult: number;
  qtyMult: number;
  tipMult: number;
  guest?: GuestDef;
  /** Power cut: belts and the stove stop for the whole event. */
  powerCut?: boolean;
  /** Fast services needed to fill the likes meter. */
  likesTarget?: number;
  goals: readonly ScenarioGoal[];
  /** Reward if every goal passes: this many seconds of the farm's full production value + a share of the event's sales. */
  rewardSeconds: number;
  rewardShare: number;
  /** Rating change on success / failure. */
  ratingWin: number;
  ratingLose: number;
  /** After success: arrival boost x for this many seconds (e.g. going viral). */
  boostAfter?: { mult: number; seconds: number };
  /** Sound/visual flavour keys for the renderer. */
  props: readonly ScenarioProp[];
  music: MusicId;
  /** Flags put up all over the farm (FLAGS in config/looks.ts). */
  flag?: FlagId;
  /** Screen tint (CSS color) at the edges while the event runs. */
  tint?: string;
  /** Big intro card when the guest arrives. */
  intro?: string;
  /** Only after this many upgrades. */
  minUpgrades: number;
  /** Only when this holds (e.g. the area it needs is open). */
  when?: (w: SimWorld) => boolean;
  /** The event's own rules (sim/scenarios/). */
  mechanic?: MechanicId;
}

export const SCENARIOS: readonly ScenarioDef[] = [
  {
    id: 'president', icon: '🇪🇬', title: 'الرئيس السيسي جاي يزور المزرعة!', hint: 'اخدمه بنفسك ومحدش يزعل',
    color: '#c8a02c', weight: 2, warning: 10, duration: 70, arrivalMult: 0.6, crowdShare: 0.5, crowd: 'press',
    patienceMult: 1.2, qtyMult: 1, tipMult: 1,
    guest: { name: 'الرئيس', look: 'president', qtyMult: 2, payMult: 25, patience: 90, entourage: 4 },
    goals: ['serveGuest', 'noAngry', 'noJams'], rewardSeconds: 120, rewardShare: 1.0, ratingWin: 1, ratingLose: -0.5,
    props: ['motorcade', 'carpet', 'flags', 'guards'], music: 'anthem', minUpgrades: 40,
    flag: 'egypt', tint: 'rgba(212,175,55,0.35)', intro: 'الرئيس وصل! 🇪🇬',
  },
  {
    id: 'macron', icon: '🇫🇷', title: 'الرئيس الفرنسي ماكرون في زيارة!', hint: 'اخدمه بنفسك ومحدش يزعل',
    color: '#0055a4', weight: 1, warning: 10, duration: 70, arrivalMult: 0.6, crowdShare: 0.5, crowd: 'press',
    patienceMult: 1.2, qtyMult: 1, tipMult: 1,
    guest: { name: 'ماكرون', look: 'macron', qtyMult: 2, payMult: 22, patience: 90, entourage: 4 },
    goals: ['serveGuest', 'noAngry', 'noJams'], rewardSeconds: 110, rewardShare: 1.0, ratingWin: 1, ratingLose: -0.5,
    props: ['motorcade', 'carpet', 'flags', 'guards'], music: 'anthem', minUpgrades: 42,
    flag: 'france', tint: 'rgba(0,85,164,0.28)', intro: 'Bienvenue! ماكرون وصل 🇫🇷',
  },
  {
    id: 'trump', icon: '🇺🇸', title: 'الرئيس الأمريكي ترامب جاي!', hint: 'طلب كبير جداً، اخدمه بنفسك',
    color: '#3c3b6e', weight: 1, warning: 10, duration: 70, arrivalMult: 0.6, crowdShare: 0.5, crowd: 'press',
    patienceMult: 1.1, qtyMult: 1, tipMult: 1,
    guest: { name: 'ترامب', look: 'trump', qtyMult: 3, payMult: 22, patience: 80, entourage: 4 },
    goals: ['serveGuest', 'noAngry', 'noJams'], rewardSeconds: 110, rewardShare: 1.0, ratingWin: 1, ratingLose: -0.5,
    props: ['motorcade', 'carpet', 'flags', 'guards'], music: 'anthem', minUpgrades: 42,
    flag: 'usa', tint: 'rgba(178,34,52,0.25)', intro: 'ترامب وصل! 🇺🇸',
  },
  {
    id: 'salah', icon: '⚽', title: 'محمد صلاح جاي المزرعة!', hint: 'الفانز هيطلبوا زيه، خدمهم بسرعة',
    color: '#c8102e', weight: 3, warning: 8, duration: 60, arrivalMult: 2.6, crowdShare: 0.85, crowd: 'fanRed', featured: null,
    patienceMult: 0.9, qtyMult: 1, tipMult: 3,
    guest: { name: 'محمد صلاح', look: 'salah', qtyMult: 2, payMult: 12, patience: 70, entourage: 2 },
    goals: ['serveGuest', 'noAngry'], rewardSeconds: 75, rewardShare: 0.8, ratingWin: 0.6, ratingLose: -0.3,
    props: ['confetti'], music: 'chant', minUpgrades: 28,
    tint: 'rgba(200,16,46,0.28)', intro: 'مو صلاح وصل! ⚽🔥',
  },
  {
    id: 'messi', icon: '🐐', title: 'ميسي في المزرعة!', hint: 'زحمة فانز! كله عايز اللي ميسي طلبه',
    color: '#4a90d9', weight: 2, warning: 8, duration: 60, arrivalMult: 2.6, crowdShare: 0.85, crowd: 'fanBlue', featured: null,
    patienceMult: 0.9, qtyMult: 1, tipMult: 3,
    guest: { name: 'ميسي', look: 'messi', qtyMult: 2, payMult: 12, patience: 70, entourage: 2 },
    goals: ['serveGuest', 'noAngry'], rewardSeconds: 75, rewardShare: 0.8, ratingWin: 0.6, ratingLose: -0.3,
    props: ['confetti'], music: 'chant', minUpgrades: 28,
    tint: 'rgba(117,170,219,0.32)', intro: 'ميسي في المزرعة! 🐐',
  },
  {
    id: 'amrdiab', icon: '🎤', title: 'عمرو دياب جاي المزرعة!', hint: 'الجمهور كله جاي وراه، خدمهم بسرعة',
    color: '#111827', weight: 2, warning: 8, duration: 60, arrivalMult: 2.4, crowdShare: 0.85, crowd: 'concert', featured: null,
    patienceMult: 0.9, qtyMult: 1, tipMult: 3,
    guest: { name: 'عمرو دياب', look: 'amrdiab', qtyMult: 2, payMult: 12, patience: 70, entourage: 2 },
    goals: ['serveGuest', 'noAngry'], rewardSeconds: 75, rewardShare: 0.8, ratingWin: 0.6, ratingLose: -0.3,
    props: ['confetti'], music: 'pop', minUpgrades: 26,
    tint: 'rgba(80,70,200,0.3)', intro: 'الهضبة وصل! 🎤✨',
  },
  {
    id: 'japan', icon: '🇯🇵', title: 'فوج سياح من اليابان!', hint: 'طلبات كبيرة وبقشيش حلو، متخليش حد يستنى',
    color: '#bc002d', weight: 2, warning: 8, duration: 60, arrivalMult: 2, crowdShare: 0.9, crowd: 'tourists', featured: null,
    patienceMult: 1.2, qtyMult: 1.8, tipMult: 2.5,
    guest: { name: 'المرشد السياحي', look: 'tourguide', qtyMult: 2, payMult: 8, patience: 90, entourage: 4 },
    goals: ['serveGuest', 'noAngry'], rewardSeconds: 70, rewardShare: 0.7, ratingWin: 0.5, ratingLose: -0.2,
    props: ['flags'], music: 'pop', minUpgrades: 22,
    flag: 'japan', tint: 'rgba(188,0,45,0.22)', intro: 'Konnichiwa! أهلاً بالسياح 🇯🇵📸',
  },
  {
    id: 'army', icon: '🪖', title: 'قافلة الجيش وصلت!', hint: 'طلبات كبيرة، بس صبرهم طويل',
    color: '#5b6b3a', weight: 2, warning: 8, duration: 75, arrivalMult: 1.4, crowdShare: 0.9, crowd: 'camo',
    patienceMult: 1.8, qtyMult: 2.5, tipMult: 1,
    guest: { name: 'اللواء', look: 'general', qtyMult: 3, payMult: 8, patience: 120, entourage: 2 },
    goals: ['serveGuest', 'noAngry'], rewardSeconds: 90, rewardShare: 0.6, ratingWin: 0.5, ratingLose: -0.3,
    props: ['truck', 'flags', 'guards'], music: 'drums', minUpgrades: 32,
    flag: 'military', tint: 'rgba(85,107,47,0.32)', intro: 'تمام يا فندم! 🪖',
  },
  {
    id: 'wedding', icon: '💍', title: 'زفة فرح معدية من هنا!', hint: 'المعازيم بيدّوا بقشيش كتير',
    color: '#d96aa7', weight: 2, warning: 6, duration: 55, arrivalMult: 2, crowdShare: 0.8, crowd: 'wedding',
    patienceMult: 1, qtyMult: 1.3, tipMult: 4,
    guest: { name: 'العريس', look: 'groom', qtyMult: 2, payMult: 10, patience: 80, entourage: 3 },
    goals: ['serveGuest', 'noAngry'], rewardSeconds: 60, rewardShare: 0.5, ratingWin: 0.5, ratingLose: -0.2,
    props: ['band', 'confetti', 'flags'], music: 'zaffa', minUpgrades: 25,
    flag: 'wedding', tint: 'rgba(217,106,167,0.28)', intro: 'الزفة وصلت! 💃🥁',
  },
  {
    id: 'inspector', icon: '📋', title: 'مفتش الصحة جه فجأة!', hint: 'صلّح العطل ونضّف الترابيزات ومحدش يزعل',
    color: '#2fb59a', weight: 2, warning: 4, duration: 45, arrivalMult: 1, crowdShare: 0,
    patienceMult: 1, qtyMult: 1, tipMult: 1,
    goals: ['noAngry', 'noJams', 'cleanTables'], rewardSeconds: 90, rewardShare: 0, ratingWin: 0.8, ratingLose: -0.8,
    props: ['clipboard'], music: 'pop', minUpgrades: 30, when: (w) => w.cafe.open,
    tint: 'rgba(47,181,154,0.25)', intro: 'التفتيش بدأ! 📋',
  },
  {
    id: 'storm', icon: '⛈️', title: 'عاصفة! الكهربا قطعت', hint: 'السيور والبوتاجاز واقفين، شيل بإيدك',
    color: '#4b5563', weight: 2, warning: 6, duration: 50, arrivalMult: 0.8, crowdShare: 0,
    patienceMult: 1.2, qtyMult: 1, tipMult: 1.5, powerCut: true,
    goals: ['noAngry'], rewardSeconds: 70, rewardShare: 0.5, ratingWin: 0.4, ratingLose: -0.2,
    props: ['rain'], music: 'thunder', minUpgrades: 35, when: (w) => w.staff.machines.some((m) => m.running),
    tint: 'rgba(20,24,40,0.45)', intro: 'الكهربا قطعت! ⚡',
  },
  {
    id: 'influencer', icon: '📱', title: 'إنفلونسر بيعمل لايف من المزرعة!', hint: 'خدمة سريعة = لايكات، لو الفيديو ضرب الزباين هتزيد',
    color: '#8e6cc4', weight: 2, warning: 6, duration: 60, arrivalMult: 1.4, crowdShare: 0,
    patienceMult: 1, qtyMult: 1, tipMult: 1.5, likesTarget: 10,
    guest: { name: 'الإنفلونسر', look: 'influencer', qtyMult: 1, payMult: 6, patience: 80, entourage: 1 },
    goals: ['serveGuest', 'likes'], rewardSeconds: 45, rewardShare: 0.3, ratingWin: 0.5, ratingLose: 0,
    boostAfter: { mult: 1.5, seconds: 300 },
    props: ['ringLight'], music: 'pop', minUpgrades: 25,
    tint: 'rgba(142,108,196,0.28)', intro: 'اللايف بدأ! 📱',
  },
];

export const SCENARIO_GOAL_LABEL: Record<ScenarioGoal, string> = {
  noAngry: 'محدش يزعل',
  serveGuest: 'اخدم الضيف',
  noJams: 'مفيش أعطال',
  cleanTables: 'الترابيزات نضيفة',
  likes: 'كمّل اللايكات',
};

/** How often scenarios happen (seconds of active play between them). */
export const SCENARIO_GAP = { min: 600, max: 960 };
