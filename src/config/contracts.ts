import type { ProductId } from './economy';

/**
 * Companies that send trucks to the loading dock, as data. Add one here (name, color, what they buy).
 * Real names on purpose (personal game).
 */
export interface CompanyDef {
  id: string;
  name: string;
  /** Truck/body color and sign color. */
  color: number;
  wants: readonly ProductId[];
  /** How often they're picked. */
  weight: number;
}

export const COMPANIES: readonly CompanyDef[] = [
  { id: 'juhayna', name: 'جهينة', color: 0x1b8f3a, wants: ['milk'], weight: 3 },
  { id: 'carrefour', name: 'كارفور', color: 0x1e5bc6, wants: ['egg', 'milk'], weight: 3 },
  { id: 'marriott', name: 'فندق ماريوت', color: 0x8b1d2c, wants: ['egg'], weight: 2 },
  { id: 'edita', name: 'إيديتا', color: 0xe30613, wants: ['egg'], weight: 2 },
  { id: 'army', name: 'القوات المسلحة', color: 0x556b2f, wants: ['egg', 'milk'], weight: 1 },
];

export const CONTRACTS = {
  /** Seconds between trucks (after one leaves). */
  gapMin: 45,
  gapMax: 90,
  /** Seconds a truck takes to drive in / out. */
  drive: 6,
  /** Standing supply run: truck takes whatever is loaded before it leaves. */
  standing: { window: 90, perProduct: 30, priceMult: 1.5 },
  /** Rush order: fixed amount by a deadline; pays more plus a bonus, but only if complete. */
  rush: { chance: 0.3, window: 150, perProduct: 40, priceMult: 2.2, bonusMult: 0.5 },
  /** Trust 0..5 per company: price x (1 + priceStep x trust), order size x (1 + sizeStep x trust). */
  trustMax: 5,
  priceStep: 0.1,
  sizeStep: 0.15,
  /** Trust change: +up when a run is >= fillGood full or a rush order completes, -down on a failed rush. */
  fillGood: 0.8,
  up: 0.5,
  down: 1,
};
