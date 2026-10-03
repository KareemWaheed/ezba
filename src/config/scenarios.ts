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

/** A mid-event surprise (seconds into the active phase). */
export interface Twist {
  at: number;
  /** Toast text (Egyptian Arabic). */
  text: string;
  /** reorder: the guest wants something else; extend: +15 s; rush: more crowd for the rest. */
  kind: 'reorder' | 'extend' | 'rush';
}

/** Goals checked when the scenario ends. All must pass for the big reward. */
export type ScenarioGoal =
  | 'noAngry'        // nobody leaves angry during the event
  | 'serveGuest'     // the special guest gets served
  | 'noJams'         // no machine jammed when it ends
  | 'cleanTables'    // no dirty café tables when it ends
  | 'likes'          // fill the likes meter with fast services
  | 'herd'           // bring every escaped animal back
  | 'checkpoints'    // every stop on the inspector's route is fine
  | 'goals'          // score goals on the yard pitch
  | 'beatCombo'      // a combo on the dance pads
  | 'inTime'         // the guest served with patience to spare
  | 'photo'          // stood in the official photo
  | 'trays'          // served the walking group
  | 'bulkOrder'      // the army's whole order delivered
  | 'balance'        // the derby fans never clashed
  | 'takes'          // three clean takes on the film set
  | 'catch'          // caught the thief
  | 'recipes'        // cook-off recipe cards done
  | 'plates'         // every iftar plate filled before Maghrib
  | 'covered';       // every pile covered in the sandstorm

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
  /** Which flavour of the mechanic (e.g. football: 'penalty' | 'dribble'). */
  variant?: string;
  /** Mid-event surprises, in order. */
  twists?: readonly Twist[];
}

const CLASSIC_EVENTS: ScenarioDef[] = [
  {
    id: 'president', icon: '🇪🇬', title: 'الرئيس السيسي جاي يزور المزرعة!', hint: 'هات طلبه وعدّي على بوابة الأمن الأول',
    color: '#c8a02c', weight: 2, warning: 10, duration: 70, arrivalMult: 0.6, crowdShare: 0.5, crowd: 'press',
    patienceMult: 1.2, qtyMult: 1, tipMult: 1,
    guest: { name: 'الرئيس', look: 'president', qtyMult: 2, payMult: 25, patience: 90, entourage: 4 },
    goals: ['serveGuest', 'inTime'], mechanic: 'motorcade', variant: 'escort', rewardSeconds: 120, rewardShare: 1.0, ratingWin: 1, ratingLose: -0.5,
    props: ['motorcade', 'carpet', 'flags', 'guards'], music: 'anthem', minUpgrades: 40,
    flag: 'egypt', tint: 'rgba(212,175,55,0.35)', intro: 'الرئيس وصل! 🇪🇬',
  },
  {
    id: 'macron', icon: '🇫🇷', title: 'الرئيس الفرنسي ماكرون في زيارة!', hint: 'اخدمه وبعدين اقف جنبه في الصورة الرسمية 📸',
    color: '#0055a4', weight: 1, warning: 10, duration: 70, arrivalMult: 0.6, crowdShare: 0.5, crowd: 'press',
    patienceMult: 1.2, qtyMult: 1, tipMult: 1,
    guest: { name: 'ماكرون', look: 'macron', qtyMult: 2, payMult: 22, patience: 90, entourage: 4 },
    goals: ['serveGuest', 'inTime', 'photo'], mechanic: 'motorcade', variant: 'photo', rewardSeconds: 110, rewardShare: 1.0, ratingWin: 1, ratingLose: -0.5,
    props: ['motorcade', 'carpet', 'flags', 'guards'], music: 'anthem', minUpgrades: 42,
    flag: 'france', tint: 'rgba(0,85,164,0.28)', intro: 'Bienvenue! ماكرون وصل 🇫🇷',
  },
  {
    id: 'trump', icon: '🇺🇸', title: 'الرئيس الأمريكي ترامب جاي!', hint: 'طلب كبير، وخلي بالك هيغيّر رأيه!',
    color: '#3c3b6e', weight: 1, warning: 10, duration: 70, arrivalMult: 0.6, crowdShare: 0.5, crowd: 'press',
    patienceMult: 1.1, qtyMult: 1, tipMult: 1,
    guest: { name: 'ترامب', look: 'trump', qtyMult: 3, payMult: 22, patience: 80, entourage: 4 },
    goals: ['serveGuest', 'inTime'], mechanic: 'motorcade', variant: 'reorder', rewardSeconds: 110, rewardShare: 1.0, ratingWin: 1, ratingLose: -0.5,
    props: ['motorcade', 'carpet', 'flags', 'guards'], music: 'anthem', minUpgrades: 42,
    flag: 'usa', tint: 'rgba(178,34,52,0.25)', intro: 'ترامب وصل! 🇺🇸',
    twists: [{ at: 20, kind: 'reorder', text: 'ترامب غيّر رأيه! طلب جديد 😅' }, { at: 40, kind: 'reorder', text: 'ترامب غيّر رأيه تاني!! 🙄' }],
  },
  {
    id: 'salah', icon: '⚽', title: 'محمد صلاح جاي المزرعة!', hint: 'ضربات جزاء! جوّن في الحارس وكل جون الفانز يدفعوا أكتر',
    color: '#c8102e', weight: 3, warning: 8, duration: 60, arrivalMult: 2.6, crowdShare: 0.85, crowd: 'fanRed', featured: null,
    patienceMult: 0.9, qtyMult: 1, tipMult: 3,
    guest: { name: 'محمد صلاح', look: 'salah', qtyMult: 2, payMult: 12, patience: 70, entourage: 2 },
    goals: ['serveGuest', 'goals'], rewardSeconds: 75, rewardShare: 0.8, ratingWin: 0.6, ratingLose: -0.3, mechanic: 'football', variant: 'penalty',
    props: ['confetti'], music: 'chant', minUpgrades: 28,
    tint: 'rgba(200,16,46,0.28)', intro: 'مو صلاح وصل! ⚽🔥',
    twists: [{ at: 30, kind: 'rush', text: 'فانز زيادة جايين! 🏃' }],
  },
  {
    id: 'messi', icon: '🐐', title: 'ميسي في المزرعة!', hint: 'لف الكورة حوالين الأقماع وبعدين جوّن!',
    color: '#4a90d9', weight: 2, warning: 8, duration: 60, arrivalMult: 2.6, crowdShare: 0.85, crowd: 'fanBlue', featured: null,
    patienceMult: 0.9, qtyMult: 1, tipMult: 3,
    guest: { name: 'ميسي', look: 'messi', qtyMult: 2, payMult: 12, patience: 70, entourage: 2 },
    goals: ['serveGuest', 'goals'], rewardSeconds: 75, rewardShare: 0.8, ratingWin: 0.6, ratingLose: -0.3, mechanic: 'football', variant: 'dribble',
    props: ['confetti'], music: 'chant', minUpgrades: 28,
    tint: 'rgba(117,170,219,0.32)', intro: 'ميسي في المزرعة! 🐐',
    twists: [{ at: 30, kind: 'rush', text: 'فانز زيادة جايين! 🏃' }],
  },
  {
    id: 'amrdiab', icon: '🎤', title: 'عمرو دياب جاي المزرعة!', hint: 'ارقص مع الهضبة! اقف على المربع اللي بينوّر',
    color: '#111827', weight: 2, warning: 8, duration: 60, arrivalMult: 2.4, crowdShare: 0.85, crowd: 'concert', featured: null,
    patienceMult: 0.9, qtyMult: 1, tipMult: 3,
    guest: { name: 'عمرو دياب', look: 'amrdiab', qtyMult: 2, payMult: 12, patience: 70, entourage: 2 },
    goals: ['serveGuest', 'beatCombo'], rewardSeconds: 75, rewardShare: 0.8, ratingWin: 0.6, ratingLose: -0.3, mechanic: 'stage',
    props: ['confetti'], music: 'pop', minUpgrades: 26,
    tint: 'rgba(80,70,200,0.3)', intro: 'الهضبة وصل! 🎤✨',
  },
  {
    id: 'japan', icon: '🇯🇵', title: 'فوج سياح من اليابان!', hint: 'هات لكل سايح طلبه واتصوّر معاهم في الآخر 📸',
    color: '#bc002d', weight: 2, warning: 8, duration: 60, arrivalMult: 2, crowdShare: 0.9, crowd: 'tourists', featured: null,
    patienceMult: 1.2, qtyMult: 1.8, tipMult: 2.5,
    guest: { name: 'المرشد السياحي', look: 'tourguide', qtyMult: 2, payMult: 8, patience: 90, entourage: 4 },
    goals: ['trays', 'photo'], mechanic: 'procession', variant: 'tour', rewardSeconds: 70, rewardShare: 0.7, ratingWin: 0.5, ratingLose: -0.2,
    props: ['flags'], music: 'pop', minUpgrades: 22,
    flag: 'japan', tint: 'rgba(188,0,45,0.22)', intro: 'Konnichiwa! أهلاً بالسياح 🇯🇵📸',
  },
  {
    id: 'army', icon: '🪖', title: 'قافلة الجيش وصلت!', hint: 'طلبية كبيرة! جهّزها وسلّمها لعربية الجيش في الساحة',
    color: '#5b6b3a', weight: 2, warning: 40, duration: 75, arrivalMult: 1.4, crowdShare: 0.9, crowd: 'camo',
    patienceMult: 1.8, qtyMult: 2.5, tipMult: 1,
    guest: { name: 'اللواء', look: 'general', qtyMult: 3, payMult: 8, patience: 120, entourage: 2 },
    goals: ['bulkOrder', 'noAngry'], mechanic: 'bulk', rewardSeconds: 90, rewardShare: 0.6, ratingWin: 0.5, ratingLose: -0.3,
    props: ['truck', 'flags', 'guards'], music: 'drums', minUpgrades: 32,
    flag: 'military', tint: 'rgba(85,107,47,0.32)', intro: 'تمام يا فندم! 🪖',
  },
  {
    id: 'wedding', icon: '💍', title: 'زفة فرح معدية من هنا!', hint: 'الزفة معدية! خدّم المعازيم وهما ماشيين',
    color: '#d96aa7', weight: 2, warning: 6, duration: 55, arrivalMult: 2, crowdShare: 0.8, crowd: 'wedding',
    patienceMult: 1, qtyMult: 1.3, tipMult: 4,
    guest: { name: 'العريس', look: 'groom', qtyMult: 2, payMult: 10, patience: 80, entourage: 3 },
    goals: ['trays', 'serveGuest'], mechanic: 'procession', variant: 'zaffa', rewardSeconds: 60, rewardShare: 0.5, ratingWin: 0.5, ratingLose: -0.2,
    props: ['band', 'confetti', 'flags'], music: 'zaffa', minUpgrades: 25,
    flag: 'wedding', tint: 'rgba(217,106,167,0.28)', intro: 'الزفة وصلت! 💃🥁',
  },
  {
    id: 'inspector', icon: '📋', title: 'مفتش الصحة جه فجأة!', hint: 'سبق المفتش وظبّط كل حاجة قبل ما يوصلها',
    color: '#2fb59a', weight: 2, warning: 6, duration: 60, arrivalMult: 1, crowdShare: 0,
    patienceMult: 1, qtyMult: 1, tipMult: 1, mechanic: 'inspector',
    goals: ['checkpoints', 'noAngry'], rewardSeconds: 90, rewardShare: 0, ratingWin: 0.8, ratingLose: -0.8,
    props: ['clipboard'], music: 'pop', minUpgrades: 30, when: (w) => w.cafe.open,
    tint: 'rgba(47,181,154,0.25)', intro: 'التفتيش بدأ! 📋',
  },
  {
    id: 'storm', icon: '⛈️', title: 'عاصفة! الكهربا قطعت', hint: 'الحيوانات هربت في الضلمة! روح لها ترجع، والسيور واقفة',
    color: '#4b5563', weight: 2, warning: 6, duration: 50, arrivalMult: 0.8, crowdShare: 0,
    patienceMult: 1.2, qtyMult: 1, tipMult: 1.5, powerCut: true,
    goals: ['herd', 'noAngry'], rewardSeconds: 80, rewardShare: 0.5, ratingWin: 0.4, ratingLose: -0.2, mechanic: 'storm',
    props: ['rain'], music: 'thunder', minUpgrades: 35, when: (w) => w.staff.machines.some((m) => m.running),
    tint: 'rgba(20,24,40,0.45)', intro: 'الكهربا قطعت! ⚡',
    twists: [{ at: 30, kind: 'extend', text: 'العاصفة لسه شغالة! ⛈️' }],
  },
  {
    id: 'influencer', icon: '📱', title: 'إنفلونسر بيعمل لايف من المزرعة!', hint: 'بيع بإيدك اللي المتابعين بيطلبوه = لايكات',
    color: '#8e6cc4', weight: 2, warning: 6, duration: 60, arrivalMult: 1.4, crowdShare: 0,
    patienceMult: 1, qtyMult: 1, tipMult: 1.5, likesTarget: 30, mechanic: 'comments',
    guest: { name: 'الإنفلونسر', look: 'influencer', qtyMult: 1, payMult: 6, patience: 80, entourage: 1 },
    goals: ['serveGuest', 'likes'], rewardSeconds: 45, rewardShare: 0.3, ratingWin: 0.5, ratingLose: 0,
    boostAfter: { mult: 1.5, seconds: 300 },
    props: ['ringLight'], music: 'pop', minUpgrades: 25,
    tint: 'rgba(142,108,196,0.28)', intro: 'اللايف بدأ! 📱',
  },
];

/** Events added with the redesign: each has its own mechanic (sim/scenarios/). */
const NEW_EVENTS: ScenarioDef[] = [
  {
    id: 'derby', icon: '🔴⚪', title: 'ديربي الأهلي والزمالك!', hint: 'اخدم الناحيتين بالعدل، اللي يستنى كتير هيهتف',
    color: '#8b1a1a', weight: 2, warning: 8, duration: 60, arrivalMult: 2.2, crowdShare: 0.9, featured: null,
    patienceMult: 1, qtyMult: 1, tipMult: 2,
    goals: ['balance', 'noAngry'], rewardSeconds: 80, rewardShare: 0.7, ratingWin: 0.6, ratingLose: -0.3, mechanic: 'derby',
    props: ['confetti'], music: 'chant', minUpgrades: 30,
    tint: 'rgba(200,16,46,0.22)', intro: 'الديربي! 🔴⚪',
  },
  {
    id: 'filming', icon: '🎬', title: 'تصوير فيلم في المزرعة مع الزعيم!', hint: 'لما المخرج يقول أكشن اتجمّد مكانك! ولما يقول كات اتحرك',
    color: '#3b3b3b', weight: 2, warning: 6, duration: 60, arrivalMult: 0.8, crowdShare: 0.6, crowd: 'film',
    patienceMult: 1.4, qtyMult: 1, tipMult: 1.5,
    guest: { name: 'الزعيم', look: 'adelemam', qtyMult: 1, payMult: 14, patience: 110, entourage: 2 },
    goals: ['takes', 'serveGuest'], rewardSeconds: 80, rewardShare: 0.6, ratingWin: 0.6, ratingLose: -0.2, mechanic: 'filming',
    props: ['flags'], music: 'pop', minUpgrades: 27,
    tint: 'rgba(40,40,40,0.3)', intro: 'أكشن! 🎬',
  },
  {
    id: 'thief', icon: '🦹', title: 'حرامي خطف فلوس من الخزنة!', hint: 'اجري وراه وامسكه قبل ما يهرب',
    color: '#4a4a6a', weight: 2, warning: 3, duration: 45, arrivalMult: 1, crowdShare: 0,
    patienceMult: 1.2, qtyMult: 1, tipMult: 1,
    goals: ['catch'], rewardSeconds: 40, rewardShare: 0, ratingWin: 0.3, ratingLose: -0.2, mechanic: 'chase',
    props: [], music: 'drums', minUpgrades: 18, when: (w) => w.cash.value >= 100,
    tint: 'rgba(60,60,110,0.25)', intro: 'امسك حرامي! 🚨',
  },
  {
    id: 'cookoff', icon: '👨‍🍳', title: 'تحدي الطبخ مع الشيف!', hint: 'اعمل الوصفة اللي في الكارت قبل الوقت ما يخلص',
    color: '#c46a1a', weight: 2, warning: 6, duration: 100, arrivalMult: 1, crowdShare: 0,
    patienceMult: 1.2, qtyMult: 1, tipMult: 1.5,
    guest: { name: 'الشيف', look: 'sherbini', qtyMult: 1, payMult: 10, patience: 120, entourage: 1 },
    goals: ['recipes'], rewardSeconds: 80, rewardShare: 0.5, ratingWin: 0.5, ratingLose: -0.2, mechanic: 'cookoff',
    props: [], music: 'pop', minUpgrades: 30, when: (w) => w.cafe.open,
    tint: 'rgba(196,106,26,0.25)', intro: 'يلا نطبخ! 👨‍🍳🔥',
  },
  {
    id: 'iftar', icon: '🌙', title: 'مائدة الرحمن!', hint: 'جهّز كل الأطباق على المائدة قبل مدفع الإفطار',
    color: '#1f5f4a', weight: 6, warning: 8, duration: 60, arrivalMult: 0.6, crowdShare: 0,
    patienceMult: 1.3, qtyMult: 1, tipMult: 1,
    goals: ['plates'], rewardSeconds: 90, rewardShare: 0.5, ratingWin: 0.6, ratingLose: -0.1, mechanic: 'iftar',
    props: [], music: 'zaffa', minUpgrades: 15, when: (w) => w.clock.ramadan,
    tint: 'rgba(31,95,74,0.25)', intro: 'رمضان كريم! 🌙',
  },
  {
    id: 'khamaseen', icon: '🌪️', title: 'رياح الخماسين!', hint: 'الهوا هيطيّر البضاعة! اقف على كل كومة لحد ما تتغطّى',
    color: '#b5803a', weight: 2, warning: 6, duration: 50, arrivalMult: 0.8, crowdShare: 0,
    patienceMult: 1.2, qtyMult: 1, tipMult: 1.2,
    goals: ['covered', 'noAngry'], rewardSeconds: 70, rewardShare: 0.5, ratingWin: 0.4, ratingLose: -0.2, mechanic: 'khamaseen',
    props: [], music: 'thunder', minUpgrades: 22,
    tint: 'rgba(200,150,70,0.4)', intro: 'خماسين! 🌪️',
  },
];

export const SCENARIOS: readonly ScenarioDef[] = [...CLASSIC_EVENTS, ...NEW_EVENTS];

export const SCENARIO_GOAL_LABEL: Record<ScenarioGoal, string> = {
  noAngry: 'محدش يزعل',
  serveGuest: 'اخدم الضيف',
  noJams: 'مفيش أعطال',
  cleanTables: 'الترابيزات نضيفة',
  likes: 'كمّل اللايكات',
  herd: 'رجّع الحيوانات',
  checkpoints: 'كل نقط التفتيش سليمة',
  goals: 'جوّن ٣ أهداف',
  beatCombo: 'كومبو ٨ على الإيقاع',
  inTime: 'وصّل قبل الوقت',
  photo: 'اتصوّر مع الضيف',
  trays: 'خدّم ٦ وهما ماشيين',
  bulkOrder: 'كمّل طلب الجيش',
  balance: 'خلّي الجمهورين مبسوطين',
  takes: '٣ مشاهد من غير إعادة',
  catch: 'امسك الحرامي',
  recipes: 'خلّص ٣ وصفات',
  plates: 'جهّز كل الأطباق قبل المغرب',
  covered: 'غطّي كل الأكوام',
};

/** How often scenarios happen (seconds of active play between them). */
export const SCENARIO_GAP = { min: 600, max: 960 };
