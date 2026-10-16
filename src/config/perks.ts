/**
 * Perks of a bigger ezba (مزايا العزبة): every sale of the farm (config/legacy.ts) gives `pointsPerLegacy`
 * points, spent one per level on permanent perks that every new farm starts with. Points can be taken back and
 * spent again at any time, so each new farm can be played differently. Effects are read by the sim systems
 * through SimWorld.perk().
 */
export type PerkId = 'walk' | 'carry' | 'staff' | 'discount' | 'events' | 'golden' | 'away' | 'head';

export interface PerkDef {
  id: PerkId;
  icon: string;
  name: string;
  /** What one level does (shown under the name). */
  desc: string;
  max: number;
  /** Effect per level (the meaning depends on the perk, see the comments). */
  step: number;
}

export const PERKS = {
  pointsPerLegacy: 2,
  list: [
    /** Player running speed +step per level. */
    { id: 'walk', icon: '👟', name: 'رجلين خفيفة', desc: 'بتجري أسرع 8%', max: 3, step: 0.08 },
    /** +step carry capacity per level. */
    { id: 'carry', icon: '🎒', name: 'ضهر قوي', desc: 'بتشيل 3 حاجات زيادة', max: 3, step: 3 },
    /** Workers, mechanics and feeders walk step faster per level. */
    { id: 'staff', icon: '👷', name: 'عمال شاطرين', desc: 'العمال أسرع 10%', max: 3, step: 0.1 },
    /** Every upgrade costs step less per level. */
    { id: 'discount', icon: '🏷️', name: 'فصال', desc: 'الترقيات أرخص 6%', max: 3, step: 0.06 },
    /** Event rewards +step per level. */
    { id: 'events', icon: '🎉', name: 'نجم الأحداث', desc: 'جوايز الأحداث أكبر 25%', max: 3, step: 0.25 },
    /** Golden animals come step more often and pay step more per level. */
    { id: 'golden', icon: '✨', name: 'إيد دهب', desc: 'الحيوانات الدهب أكتر وجايزتها أكبر 25%', max: 3, step: 0.25 },
    /** Time away pays step more of what the farm made (ECONOMY.offline.efficiency + step x level). */
    { id: 'away', icon: '🧔', name: 'ناظر أمين', desc: 'فلوس الغياب أكتر', max: 3, step: 0.05 },
    /** A new farm starts with step x level more money (on top of the legacy start money). */
    { id: 'head', icon: '💰', name: 'رأس مال', desc: 'العزبة الجاية تبدأ بفلوس أكتر', max: 3, step: 4000 },
  ] as readonly PerkDef[],
} as const;

export const PERK_BY_ID = new Map(PERKS.list.map((p) => [p.id, p]));
