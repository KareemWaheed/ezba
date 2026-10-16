import type { GuestLook } from './looks';

/**
 * The decorations shop (محل الزينة, the 🎨 side button): clothes and hats for the farmer, and decorations for the
 * farm. Bought with money and kept forever, also when the farm is sold for a bigger one. Each decoration on the farm
 * raises every sale price by `decorBonus` (customers like a pretty ezba); clothes and hats are just for looks.
 */
export type HatKind = NonNullable<GuestLook['hat']>['kind'] | 'tarboosh' | 'turban';

export interface OutfitDef {
  id: string; icon: string; name: string; price: number;
  shirt: number; pants: number;
  /** A long robe (جلابية) down to the ankles, in the shirt's color. */
  robe?: boolean;
  tie?: number;
}

export interface HatDef { id: string; icon: string; name: string; price: number; kind: HatKind; color: number }

export type DecorKind = 'flowers' | 'flags' | 'lanterns' | 'lamps' | 'palms' | 'cart' | 'swing' | 'fountain' | 'statue';

export interface DecorDef {
  id: DecorKind; icon: string; name: string; price: number;
  /** Where its pieces stand (one model per spot, facing `rot`). */
  spots: readonly { x: number; z: number; rot?: number }[];
  /** Footprint that turns solid once it's bought (half size around each spot); none = walk-through. */
  solid?: { hx: number; hz: number };
}

export const SHOP = {
  /** Every sale price x (1 + decorBonus x decorations owned). */
  decorBonus: 0.02,
  outfits: [
    { id: 'farmer', icon: '👕', name: 'لبس الفلاح', price: 0, shirt: 0xf6c23e, pants: 0x2f4a7a },
    { id: 'galabeya', icon: '🧥', name: 'جلابية', price: 8000, shirt: 0x8a6a4a, pants: 0x8a6a4a, robe: true },
    { id: 'white', icon: '🤍', name: 'جلابية بيضا', price: 20000, shirt: 0xf4f1e8, pants: 0xf4f1e8, robe: true },
    { id: 'red', icon: '❤️', name: 'تيشيرت أحمر', price: 15000, shirt: 0xd8262c, pants: 0xf4f1e8 },
    { id: 'whiteRed', icon: '🤍', name: 'تيشيرت أبيض', price: 15000, shirt: 0xf6f6f6, pants: 0xd8262c },
    { id: 'suit', icon: '🤵', name: 'بدلة', price: 80000, shirt: 0x24262e, pants: 0x24262e, tie: 0xb3262c },
    { id: 'gold', icon: '✨', name: 'لبس دهب', price: 1_000_000, shirt: 0xf5c542, pants: 0x9a6b10 },
  ] as readonly OutfitDef[],
  hats: [
    { id: 'none', icon: '🙂', name: 'من غير', price: 0, kind: 'cap', color: 0 },
    { id: 'straw', icon: '👒', name: 'برنيطة خوص', price: 1500, kind: 'straw', color: 0xe9c873 },
    { id: 'cap', icon: '🧢', name: 'كاب', price: 3000, kind: 'cap', color: 0x2f6fd6 },
    { id: 'tarboosh', icon: '🎩', name: 'طربوش', price: 12000, kind: 'tarboosh', color: 0xb3262c },
    { id: 'turban', icon: '👳', name: 'عمّة', price: 20000, kind: 'turban', color: 0xf4f1e8 },
    { id: 'chef', icon: '👨‍🍳', name: 'طاقية شيف', price: 30000, kind: 'chef', color: 0xffffff },
    { id: 'flowers', icon: '🌸', name: 'تاج ورد', price: 50000, kind: 'flowerCrown', color: 0 },
    { id: 'crown', icon: '👑', name: 'تاج', price: 500_000, kind: 'crown', color: 0 },
  ] as readonly HatDef[],
  decor: [
    // (flower boxes along the north edge of the event square, clear of where customers come and go)
    { id: 'flowers', icon: '🌷', name: 'أحواض ورد', price: 8000, spots: [{ x: -6.6, z: 14.4 }, { x: -5.0, z: 14.4 }, { x: 5.2, z: 14.4 }, { x: 6.8, z: 14.4 }] },
    { id: 'flags', icon: '🇪🇬', name: 'أعلام', price: 15000, spots: [{ x: -8.9, z: 14.3 }, { x: 8.0, z: 14.3 }] },
    // (a garland over the counter, hanging between the sorters)
    { id: 'lanterns', icon: '🏮', name: 'فوانيس', price: 25000, spots: [{ x: 0, z: 4.0 }] },
    { id: 'lamps', icon: '💡', name: 'عواميد نور', price: 40000, spots: [{ x: -8.9, z: 21.0 }, { x: 8.0, z: 21.0 }, { x: -8.9, z: 27.4 }, { x: 8.0, z: 27.4 }] },
    { id: 'palms', icon: '🌴', name: 'نخل', price: 60000, spots: [{ x: -10.4, z: 15.4 }, { x: -10.4, z: 28.4 }, { x: 9.0, z: 28.6 }, { x: -6.0, z: 30.6 }] },
    { id: 'cart', icon: '🫘', name: 'عربية فول', price: 100000, spots: [{ x: -7.4, z: 16.0, rot: 0.4 }], solid: { hx: 0.8, hz: 0.5 } },
    { id: 'swing', icon: '🎠', name: 'مرجيحة', price: 150000, spots: [{ x: 4.6, z: 29.8 }], solid: { hx: 1.1, hz: 0.4 } },
    { id: 'fountain', icon: '⛲', name: 'نافورة', price: 400000, spots: [{ x: 0.2, z: 29.9 }], solid: { hx: 1.2, hz: 1.2 } },
    { id: 'statue', icon: '🗿', name: 'تمثال فرعوني', price: 1_000_000, spots: [{ x: -4.0, z: 30.2 }], solid: { hx: 0.6, hz: 0.6 } },
  ] as readonly DecorDef[],
} as const;

export const OUTFIT_BY_ID = new Map(SHOP.outfits.map((o) => [o.id, o]));
export const HAT_BY_ID = new Map(SHOP.hats.map((h) => [h.id, h]));
export const DECOR_BY_ID = new Map(SHOP.decor.map((d) => [d.id as string, d]));
