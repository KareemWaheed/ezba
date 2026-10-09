import type { UpgradeId } from './economy';

/**
 * Where each upgrade track's tile sits and how it reads. One tile per track: buying a level
 * advances the same tile in place. Costs and effects live in economy.ts (ECONOMY.upgrades).
 */
export interface UpgradeDef {
  id: UpgradeId;
  icon: string;
  /** Tile label (Egyptian Arabic). */
  label: string;
  /** Toast after each purchase. */
  msg: string;
  pos: { x: number; z: number };
  /** Tile appears once every listed track has reached the given level. */
  requires: readonly { id: UpgradeId; level: number }[];
  /** Big unlocks shown in the HUD "next goal" card. */
  milestone?: boolean;
  /** Level can't exceed 1 + this track's level (e.g. one cashier per open lane). */
  capBy?: UpgradeId;
  /** Only offered while this track is at its (current) max, e.g. "expand the coop" once it's full. */
  requiresMaxed?: UpgradeId;
  /** This track's max grows by `per` for every level of `by` (e.g. more chickens after expanding). */
  maxBonus?: { by: UpgradeId; per: number };
}

export const UPGRADES: readonly UpgradeDef[] = [
  {
    id: 'eggs.animals', icon: '🐔', label: 'فرخة جديدة', msg: 'فرخة جديدة في العشة 🐔',
    pos: { x: -7.6, z: -0.2 }, requires: [], maxBonus: { by: 'eggs.expand', per: 6 },
  },
  {
    // supermarket path only (hidden on the farm path): the coop opens; the chickens tile then takes this spot
    id: 'eggs.unlock', icon: '🐔', label: 'افتح العشة', msg: 'فتحت عشة الفراخ! البيض بقى ببلاش للسوبر ماركت 🐔',
    pos: { x: -7.6, z: -0.2 }, requires: [{ id: 'market.cashier', level: 1 }], milestone: true,
  },
  {
    id: 'eggs.expand', icon: '🏗️', label: 'كبّر العشة', msg: 'العشة كبرت! مكان لفراخ أكتر 🏗️',
    pos: { x: -7.6, z: -0.2 }, requires: [{ id: 'eggs.worker', level: 1 }], requiresMaxed: 'eggs.animals', milestone: true,
  },
  {
    id: 'player.capacity', icon: '🎒', label: 'شيل أكتر', msg: 'بقيت تشيل أكتر 💪',
    pos: { x: -4.3, z: 6.3 }, requires: [{ id: 'eggs.animals', level: 1 }],
  },
  {
    id: 'player.speed', icon: '👟', label: 'جري أسرع', msg: 'بقيت أسرع ⚡',
    pos: { x: 8.0, z: 6.6 }, requires: [{ id: 'player.capacity', level: 1 }],
  },
  {
    id: 'eggs.worker', icon: '👷', label: 'وظّف عامل بيض', msg: 'العامل بيلم البيض بدالك 👷',
    pos: { x: -0.6, z: 0.6 }, requires: [{ id: 'eggs.animals', level: 4 }], milestone: true,
  },
  {
    id: 'cashier', icon: '🧾', label: 'وظّف كاشير', msg: 'الكاشير بيبيع بدالك دلوقتي 🧾',
    pos: { x: 1.4, z: 0.6 }, requires: [{ id: 'eggs.worker', level: 1 }], milestone: true, capBy: 'shop.lanes',
  },
  {
    id: 'shop.lanes', icon: '🛒', label: 'خط دفع جديد', msg: 'فتحت خط دفع جديد، زباين أكتر 🛒',
    pos: { x: 7.6, z: 2.3 }, requires: [{ id: 'cashier', level: 1 }], milestone: true,
  },
  {
    id: 'eggs.machine', icon: '⚙️', label: 'سير للبيض', msg: 'سير البيض شغال لوحده ⚙️',
    pos: { x: -5.4, z: -0.3 }, requires: [{ id: 'eggs.worker', level: 1 }], milestone: true,
  },
  // Stage 2: cows
  {
    id: 'milk.unlock', icon: '🐄', label: 'حظيرة البقر', msg: 'فتحت حظيرة البقر 🐄🥛',
    pos: { x: 6.5, z: 0.2 }, requires: [{ id: 'eggs.worker', level: 1 }], milestone: true,
  },
  {
    id: 'milk.animals', icon: '🐄', label: 'بقرة جديدة', msg: 'بقرة جديدة في الحظيرة 🐄',
    pos: { x: 9.8, z: 2.0 }, requires: [{ id: 'milk.unlock', level: 1 }], maxBonus: { by: 'milk.expand', per: 4 },
  },
  {
    id: 'milk.expand', icon: '🏗️', label: 'كبّر الحظيرة', msg: 'الحظيرة كبرت! مكان لبقر أكتر 🏗️',
    pos: { x: 9.8, z: 2.0 }, requires: [{ id: 'milk.worker', level: 1 }], requiresMaxed: 'milk.animals', milestone: true,
  },
  {
    id: 'milk.worker', icon: '👷', label: 'وظّف عامل لبن', msg: 'العامل بيلم اللبن بدالك 👷',
    pos: { x: 4.0, z: 0.6 }, requires: [{ id: 'milk.animals', level: 2 }], milestone: true,
  },
  {
    id: 'milk.machine', icon: '⚙️', label: 'سير للبن', msg: 'سير اللبن شغال لوحده ⚙️',
    pos: { x: 9.0, z: -0.3 }, requires: [{ id: 'milk.worker', level: 1 }], milestone: true,
  },
  // Stage 3: farm café (east of the shop)
  {
    id: 'cafe.unlock', icon: '☕', label: 'كافيه المزرعة', msg: 'فتحت الكافيه! اطبخ واخدم الزباين ☕',
    pos: { x: 10.4, z: 7.0 }, requires: [{ id: 'milk.unlock', level: 1 }, { id: 'cashier', level: 1 }], milestone: true,
  },
  {
    id: 'cafe.tables', icon: '🪑', label: 'ترابيزة زيادة', msg: 'ترابيزة جديدة في الكافيه 🪑',
    pos: { x: 13.3, z: 7.2 }, requires: [{ id: 'cafe.unlock', level: 1 }],
  },
  {
    id: 'cafe.nice', icon: '🌷', label: 'ترابيزات أشيك', msg: 'الكافيه بقى أشيك، الأسعار زادت 🌷',
    pos: { x: 13.3, z: 9.2 }, requires: [{ id: 'cafe.tables', level: 2 }],
  },
  {
    id: 'cafe.cleaner', icon: '🧹', label: 'وظّف عامل نظافة', msg: 'عامل النظافة بيمسح الترابيزات 🧹',
    pos: { x: 13.3, z: 11.2 }, requires: [{ id: 'cafe.unlock', level: 1 }], milestone: true,
  },
  {
    id: 'cafe.waiter', icon: '💁', label: 'وظّف كاشير الكافيه', msg: 'كاشير الكافيه بيخدم الزباين 💁',
    pos: { x: 19.4, z: 5.3 }, requires: [{ id: 'cafe.cleaner', level: 1 }], milestone: true,
  },
  {
    id: 'cafe.stove', icon: '🔥', label: 'مطبخ أسرع', msg: 'المطبخ بقى أسرع 🔥',
    pos: { x: 19.4, z: 1.3 }, requires: [{ id: 'cafe.unlock', level: 1 }],
  },
  {
    id: 'cafe.helper', icon: '🧑‍🍳', label: 'وظّف مساعد مطبخ', msg: 'مساعد مطبخ جديد بيجيب البيض واللبن 🧑‍🍳',
    pos: { x: 19.4, z: 3.3 }, requires: [{ id: 'cafe.unlock', level: 1 }], milestone: true,
  },
  // Stage 4: crop fields north of the pens
  {
    id: 'field.unlock', icon: '🌽', label: 'غيط الدرة', msg: 'فتحت غيط الدرة! امشي فيه واحصد 🌽',
    pos: { x: 1.5, z: -7.5 }, requires: [{ id: 'cafe.unlock', level: 1 }], milestone: true,
  },
  {
    id: 'field.hand', icon: '👨‍🌾', label: 'وظّف عامل حصاد', msg: 'عامل حصاد بالمنجل بيحصد ويودّي للكشك 👨‍🌾',
    pos: { x: 1.2, z: -11.1 }, requires: [{ id: 'field.unlock', level: 1 }],
  },
  {
    id: 'field.handSkill', icon: '💪', label: 'درّب عمال الحصاد', msg: 'عمال الحصاد بقوا أسرع وبيشيلوا أكتر 💪',
    pos: { x: 17.4, z: -11.1 }, requires: [{ id: 'field.hand', level: 1 }],
  },
  {
    id: 'field.tool', icon: '🔪', label: 'منجل أعرض', msg: 'المنجل بقى بيحصد أوسع 🔪',
    pos: { x: 3.4, z: -11.1 }, requires: [{ id: 'field.unlock', level: 1 }],
  },
  {
    id: 'field.regrow', icon: '🌱', label: 'سماد', msg: 'الزرع بيطلع أسرع 🌱',
    pos: { x: 5.6, z: -11.1 }, requires: [{ id: 'field.unlock', level: 1 }],
  },
  {
    id: 'field.wheat', icon: '🌾', label: 'غيط القمح', msg: 'فتحت غيط القمح! القمح أغلى 🌾',
    pos: { x: 8.6, z: -11.1 }, requires: [{ id: 'field.tool', level: 2 }], milestone: true,
  },
  {
    id: 'field.expand', icon: '🗺️', label: 'وسّع الغيط', msg: 'الغيط كبر! أرض جديدة جنب القمح 🌽🌾',
    pos: { x: 19.6, z: -11.1 }, requires: [{ id: 'field.wheat', level: 1 }, { id: 'field.tractor', level: 1 }],
  },
  {
    id: 'field.tractor', icon: '🚜', label: 'جرار', msg: 'اشتريت جرار! ادخل الغيط وسوق 🚜',
    pos: { x: 10.8, z: -11.1 }, requires: [{ id: 'field.tool', level: 3 }], milestone: true,
  },
  {
    id: 'field.combine', icon: '🌾', label: 'كومباين', msg: 'كومباين! بيحصد عريض ويشيل في الخزان 🌾',
    pos: { x: 10.8, z: -11.1 }, requires: [{ id: 'field.wheat', level: 1 }], requiresMaxed: 'field.tractor', milestone: true,
  },
  {
    id: 'field.driver', icon: '🧑‍🌾', label: 'وظّف سوّاق جرار', msg: 'سوّاق جرار جديد بيحصد لوحده 🧑‍🌾',
    pos: { x: 15.2, z: -11.1 }, requires: [{ id: 'field.tractor', level: 1 }], milestone: true,
  },
  {
    id: 'field.engine', icon: '⚙️', label: 'موتور أقوى', msg: 'العربية بقت أسرع ⚙️',
    pos: { x: 13.0, z: -11.1 }, requires: [{ id: 'field.tractor', level: 1 }],
  },
  {
    id: 'corn.machine', icon: '🚡', label: 'تلفريك الدرة', msg: 'تلفريك الدرة شغال! بينقل الدرة فوق العشة للكاونتر 🚡',
    pos: { x: -4.4, z: -13.3 }, requires: [{ id: 'field.unlock', level: 1 }],
  },
  {
    id: 'corn.worker', icon: '🌽', label: 'وظّف عامل درة', msg: 'عامل الدرة بيودّي الدرة للبيع 🌽',
    pos: { x: -6.6, z: -13.8 }, requires: [{ id: 'field.unlock', level: 1 }], milestone: true,
  },
  // Stage 5: factory yard east of the café
  {
    id: 'factory.unlock', icon: '🏭', label: 'المصنع والفرن', msg: 'فتحت المصنع! الفرن بيعمل كيك من البيض والقمح 🍰',
    pos: { x: 19.6, z: -0.9 }, requires: [{ id: 'field.wheat', level: 1 }, { id: 'cafe.unlock', level: 1 }], milestone: true,
  },
  {
    id: 'factory.dairy', icon: '🧀', label: 'مصنع الجبنة', msg: 'مصنع الجبنة شغال! لبن يبقى جبنة 🧀',
    pos: { x: 23.4, z: 9.4 }, requires: [{ id: 'factory.unlock', level: 1 }], milestone: true,
  },
  {
    id: 'factory.worker', icon: '👷', label: 'وظّف عامل مصنع', msg: 'عامل المصنع بيجيب البيض واللبن 👷',
    pos: { x: 27.2, z: 3.4 }, requires: [{ id: 'factory.unlock', level: 1 }], milestone: true,
  },
  {
    id: 'factory.porter', icon: '🛒', label: 'وظّف شيّال', msg: 'الشيّال بيودّي الكيك والجبنة للكافيه 🛒',
    pos: { x: 27.2, z: 5.6 }, requires: [{ id: 'factory.unlock', level: 1 }], milestone: true,
  },
  {
    id: 'factory.speed', icon: '⚙️', label: 'مكن أسرع', msg: 'مكن المصنع بقى أسرع ⚙️',
    pos: { x: 27.2, z: 7.8 }, requires: [{ id: 'factory.unlock', level: 1 }],
  },
  // Stage 6: the river dock (north, past the fields)
  {
    id: 'river.unlock', icon: '⛵', label: 'مرسى النهر', msg: 'فتحت المرسى! مراكب صيد وقوارب للإيجار ⛵',
    pos: { x: -6.6, z: -16.6 }, requires: [{ id: 'field.wheat', level: 1 }], milestone: true,
  },
  {
    id: 'river.boats', icon: '🚤', label: 'مركب صيد', msg: 'مركب صيد جديد 🚤',
    pos: { x: -15.0, z: -13.0 }, requires: [{ id: 'river.unlock', level: 1 }],
  },
  {
    id: 'river.size', icon: '📦', label: 'مراكب أكبر', msg: 'المراكب بتجيب سمك أكتر 📦',
    pos: { x: -12.9, z: -13.0 }, requires: [{ id: 'river.unlock', level: 1 }],
  },
  {
    id: 'river.speed', icon: '💨', label: 'مراكب أسرع', msg: 'رحلة الصيد بقت أسرع 💨',
    pos: { x: -10.8, z: -13.0 }, requires: [{ id: 'river.unlock', level: 1 }],
  },
  {
    id: 'river.rowboats', icon: '🛶', label: 'قارب إيجار', msg: 'قارب إيجار زيادة 🛶',
    pos: { x: -8.7, z: -13.0 }, requires: [{ id: 'river.unlock', level: 1 }],
  },
  {
    id: 'river.grill', icon: '🍢', label: 'شوّاية سمك', msg: 'الشوّاية شغالة! سمك مشوي للكافيه 🍢',
    pos: { x: -10.6, z: -16.9 }, requires: [{ id: 'river.unlock', level: 1 }, { id: 'cafe.unlock', level: 1 }], milestone: true,
  },
  {
    id: 'river.worker', icon: '🧑‍✈️', label: 'وظّف عامل مرسى', msg: 'عامل المرسى بيشيل السمك ويربط القوارب 🧑‍✈️',
    pos: { x: -8.6, z: -16.9 }, requires: [{ id: 'river.unlock', level: 1 }], milestone: true,
  },
  // Stage 7: the supermarket south of the café
  {
    id: 'market.unlock', icon: '🛒', label: 'سوبر ماركت', msg: 'فتحت السوبر ماركت! املا الرفوف من المخزن 🛒',
    pos: { x: 22.6, z: 14.2 }, requires: [{ id: 'factory.unlock', level: 1 }], milestone: true,
  },
  {
    id: 'market.shelves', icon: '🗄️', label: 'رفوف جديدة', msg: 'صف رفوف جديد ومنتجات أكتر 🗄️',
    pos: { x: 21.4, z: 26.6 }, requires: [{ id: 'market.unlock', level: 1 }], milestone: true,
  },
  {
    id: 'market.cashier', icon: '🧾', label: 'كاشير السوبر ماركت', msg: 'الكاشير بيحاسب الزباين بدالك 🧾',
    pos: { x: 23.4, z: 26.6 }, requires: [{ id: 'market.unlock', level: 1 }], milestone: true, capBy: 'market.lanes',
  },
  {
    id: 'market.stocker', icon: '📦', label: 'وظّف عامل رفوف', msg: 'عامل الرفوف بيملا الرفوف من المخزن والمزرعة 📦',
    pos: { x: 25.4, z: 26.6 }, requires: [{ id: 'market.unlock', level: 1 }], milestone: true,
  },
  {
    id: 'market.ads', icon: '📣', label: 'إعلانات', msg: 'زباين أكتر جايين للسوبر ماركت 📣',
    pos: { x: 27.4, z: 26.6 }, requires: [{ id: 'market.unlock', level: 1 }],
  },
  {
    id: 'market.auto', icon: '🤖', label: 'طلب أوتوماتيك', msg: 'البضاعة بتتطلب لوحدها لما تخلص 🤖',
    pos: { x: 21.4, z: 28.6 }, requires: [{ id: 'market.stocker', level: 1 }], milestone: true,
  },
  {
    id: 'market.lanes', icon: '🛒', label: 'كاشير تاني', msg: 'فتحت كاشير تاني بطابور لوحده 🛒',
    pos: { x: 23.4, z: 28.6 }, requires: [{ id: 'market.cashier', level: 1 }], milestone: true,
  },
  {
    id: 'market.selfcheck', icon: '🤳', label: 'دفع ذاتي', msg: 'ماكينة الدفع الذاتي شغالة: الحاجات القليلة بتتحاسب لوحدها 🤳',
    pos: { x: 25.4, z: 28.6 }, requires: [{ id: 'market.lanes', level: 1 }],
  },
  {
    id: 'market.delivery', icon: '🚚', label: 'توصيل للبيوت', msg: 'عربية التوصيل جاهزة! طلبات التليفون هتبدأ توصل 🚚',
    pos: { x: 27.4, z: 28.6 }, requires: [{ id: 'market.stocker', level: 1 }],
  },
  {
    id: 'market.cleaner', icon: '🧹', label: 'عامل نظافة', msg: 'عامل النظافة بيمسح أي حاجة بتقع 🧹',
    pos: { x: 21.4, z: 30.6 }, requires: [{ id: 'market.shelves', level: 1 }],
  },
  {
    id: 'market.guard', icon: '👮', label: 'أمن', msg: 'الأمن واقف على الباب: الحرامية مش هيعرفوا يهربوا 👮',
    pos: { x: 23.4, z: 30.6 }, requires: [{ id: 'market.shelves', level: 1 }],
  },
  // Loading dock: company contracts with trucks
  // what a big surplus is good for (bottom left of the yard)
  {
    id: 'eggs.incubator', icon: '🐣', label: 'حضّانة', msg: 'الحضّانة شغالة! البيض الزيادة بيطلع كتاكيت 🐣',
    pos: { x: -5.3, z: 8.4 }, requires: [{ id: 'eggs.worker', level: 1 }],
  },
  {
    id: 'trader.deal', icon: '🤝', label: 'اتفاق مع تاجر الجملة', msg: 'تاجر الجملة هيحمّل لوحده من النهارده 🤝',
    pos: { x: -3.2, z: 10.2 }, requires: [{ id: 'eggs.worker', level: 1 }],
  },
  {
    id: 'dock.unlock', icon: '🚚', label: 'رصيف التحميل', msg: 'الشركات هتبعت عربيات تاخد منك بالجملة 🚚',
    pos: { x: 6.2, z: 9.0 }, requires: [{ id: 'milk.unlock', level: 1 }, { id: 'cashier', level: 1 }], milestone: true,
  },
  {
    id: 'dock.worker', icon: '🦺', label: 'وظّف عامل تحميل', msg: 'عامل التحميل بيحمّل العربيات بدالك 🦺',
    pos: { x: 6.2, z: 12.6 }, requires: [{ id: 'dock.unlock', level: 1 }], milestone: true,
  },
  {
    id: 'dock.size', icon: '📈', label: 'صفقات أكبر', msg: 'الشركات بقت تطلب كميات أكبر 📈',
    pos: { x: 4.1, z: 12.6 }, requires: [{ id: 'dock.unlock', level: 1 }],
  },
  // HR office: an unlockable walled yard west of the farm, with the staff upgrades inside
  {
    id: 'hr.office', icon: '🏢', label: 'مكتب الموظفين', msg: 'فتحت مكتب الموظفين، طوّر عمالك من جوه 🏢',
    pos: { x: -7.6, z: 6.4 }, requires: [{ id: 'eggs.worker', level: 1 }], milestone: true,
  },
  {
    id: 'hr.speed', icon: '⚡', label: 'العمال أسرع', msg: 'العمال بقوا أسرع ⚡',
    pos: { x: -15.0, z: 6.8 }, requires: [{ id: 'hr.office', level: 1 }],
  },
  {
    id: 'hr.capacity', icon: '📦', label: 'العمال يشيلوا أكتر', msg: 'العمال بيشيلوا أكتر 📦',
    pos: { x: -12.9, z: 6.8 }, requires: [{ id: 'hr.office', level: 1 }],
  },
  {
    id: 'hr.cashier', icon: '💨', label: 'كاشير أسرع', msg: 'الكاشير بقى أسرع 💨',
    pos: { x: -12.9, z: 4.8 }, requires: [{ id: 'hr.office', level: 1 }, { id: 'cashier', level: 1 }],
  },
  {
    id: 'maint', icon: '🔧', label: 'صيانة', msg: 'المكن بقى يعطل أقل 🔧',
    pos: { x: -15.0, z: 4.8 }, requires: [{ id: 'hr.office', level: 1 }, { id: 'eggs.machine', level: 1 }],
  },
  {
    id: 'rush.reward', icon: '🎁', label: 'مكافأة الزحمة', msg: 'مكافأة الزحمة زادت 🎁',
    pos: { x: -12.9, z: 8.8 }, requires: [{ id: 'hr.office', level: 1 }],
  },
  {
    id: 'rush.warning', icon: '📣', label: 'إنذار بدري', msg: 'هتعرف بالزحمة بدري ⏰',
    pos: { x: -15.0, z: 8.8 }, requires: [{ id: 'hr.office', level: 1 }],
  },
];

export const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));
