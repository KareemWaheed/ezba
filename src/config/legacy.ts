/**
 * "A bigger ezba" (prestige): once every milestone on the farm is bought, the player can sell the
 * farm and start over with a permanent bonus. Each level raises every sale price and the starting
 * money; the customer album, daily tasks and lifetime stats carry over.
 */
export const LEGACY = {
  /** Every sale price x (1 + priceStep x level). */
  priceStep: 0.25,
  /** Money a new farm starts with, per level. */
  startMoney: 1500,
  /** Title per level (index = level; the last one repeats with stars). */
  titles: ['فلاح', 'صاحب عزبة', 'كبير البلد', 'العمدة', 'الباشا'],
} as const;

export function legacyTitle(level: number): string {
  const t = LEGACY.titles, last = t.length - 1;
  return level <= last ? t[level] : `${t[last]} ${'⭐'.repeat(Math.min(5, level - last))}`;
}
