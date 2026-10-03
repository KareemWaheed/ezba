/**
 * Looks for special characters, as data. Add a guest or a crowd here, then reference it from
 * config/scenarios.ts by key; no code changes needed.
 */

/** A special guest's appearance. Colors are hex; optional parts are drawn only if set. */
export interface GuestLook {
  shirt: number;
  pants: number;
  skin: number;
  hair: number;
  /** Bigger curly hair (e.g. Salah). */
  bigHair?: boolean;
  beard?: number;
  /** Something on the head. */
  hat?: { kind: 'cap' | 'beret' | 'crown' | 'veil' | 'flowerCrown' | 'straw' | 'chef' | 'hardhat'; color: number };
  /** Necktie / bow tie color. */
  tie?: number;
  /** Sunglasses frame color. */
  glasses?: number;
  /** Sash across the chest (e.g. bride/groom, general). */
  sash?: number;
  /** Jersey number drawn on a small badge above the head next to the name. */
  number?: number;
  /** Prop held in hand. */
  holds?: 'phone' | 'ball' | 'flower' | 'baton';
  /** Followers' clothes (guards, bride, cameraman...). */
  entourage?: { shirt: number; pants: number; skin: number; hair: number; hat?: GuestLook['hat'] };
}

export const GUEST_LOOKS = {
  president: {
    shirt: 0x1f2a44, pants: 0x1f2a44, skin: 0xd9a074, hair: 0x9a9a9a, tie: 0xc8102e,
    entourage: { shirt: 0x111111, pants: 0x111111, skin: 0xc8916a, hair: 0x111111 },
  },
  salah: {
    shirt: 0xc8102e, pants: 0xc8102e, skin: 0xa86d45, hair: 0x1a1a1a, bigHair: true, beard: 0x1a1a1a, number: 11, holds: 'ball',
    entourage: { shirt: 0x333333, pants: 0x333333, skin: 0xd9a074, hair: 0x2a2a2a },
  },
  messi: {
    shirt: 0x75aadb, pants: 0x1a1a1a, skin: 0xf1c7a0, hair: 0x5a3a22, beard: 0x5a3a22, number: 10, holds: 'ball',
    entourage: { shirt: 0x333333, pants: 0x333333, skin: 0xf1c7a0, hair: 0x2a2a2a },
  },
  general: {
    shirt: 0x556b2f, pants: 0x556b2f, skin: 0xc8916a, hair: 0x2a2a2a, hat: { kind: 'beret', color: 0x8b1a1a }, sash: 0xd9b44a, holds: 'baton',
    entourage: { shirt: 0x6b7a45, pants: 0x4b5a35, skin: 0xc8916a, hair: 0x2a2a2a, hat: { kind: 'cap', color: 0x4b5a35 } },
  },
  groom: {
    shirt: 0x111111, pants: 0x111111, skin: 0xd9a074, hair: 0x1a1a1a, tie: 0xffffff, sash: 0xd96aa7, holds: 'flower',
    entourage: { shirt: 0xffffff, pants: 0xffffff, skin: 0xf1c7a0, hair: 0x3b2414, hat: { kind: 'veil', color: 0xffffff } },
  },
  macron: {
    shirt: 0x1f2a44, pants: 0x1f2a44, skin: 0xf1c7a0, hair: 0x6b4a2a, tie: 0x0055a4,
    entourage: { shirt: 0x111111, pants: 0x111111, skin: 0xf1c7a0, hair: 0x3b2414 },
  },
  trump: {
    shirt: 0x1f2a44, pants: 0x1f2a44, skin: 0xf2b98a, hair: 0xf2cf6a, bigHair: true, tie: 0xc8102e,
    entourage: { shirt: 0x111111, pants: 0x111111, skin: 0xf1c7a0, hair: 0x2a2a2a },
  },
  amrdiab: {
    shirt: 0xffffff, pants: 0x2e3b5a, skin: 0xd9a074, hair: 0x1a1a1a, glasses: 0x111111, holds: 'phone',
    entourage: { shirt: 0x111111, pants: 0x111111, skin: 0xc8916a, hair: 0x111111 },
  },
  tourguide: {
    shirt: 0xf2b33d, pants: 0x5a4632, skin: 0xd9a074, hair: 0x3b2414, hat: { kind: 'cap', color: 0xe8554e }, holds: 'flower',
    entourage: { shirt: 0xffffff, pants: 0x2e2e2e, skin: 0xf1d9b8, hair: 0x111111, hat: { kind: 'cap', color: 0xffffff } },
  },
  influencer: {
    shirt: 0xff6fb5, pants: 0x2e2e2e, skin: 0xf1c7a0, hair: 0xe0b04a, hat: { kind: 'cap', color: 0x111111 }, holds: 'phone',
    entourage: { shirt: 0x444444, pants: 0x222222, skin: 0xd9a074, hair: 0x1d1d1d },
  },
} satisfies Record<string, GuestLook>;

export type GuestLookId = keyof typeof GUEST_LOOKS;

/** A themed crowd: each member picks random clothes from these palettes. */
export interface CrowdLook {
  shirts: readonly number[];
  pants: readonly number[];
  hat?: GuestLook['hat'];
}

export const CROWD_LOOKS = {
  fanRed: { shirts: [0xc8102e, 0xe0303a, 0xffffff], pants: [0xc8102e, 0x222222] },
  fanBlue: { shirts: [0x75aadb, 0xffffff, 0x9fc6ea], pants: [0x1a1a1a, 0x2e3b5a] },
  camo: { shirts: [0x556b2f, 0x6b7a45, 0x4b5a35], pants: [0x4b5a35, 0x3b4a2a], hat: { kind: 'cap', color: 0x4b5a35 } },
  wedding: { shirts: [0xd96aa7, 0xf2b33d, 0x8e6cc4, 0x2fb59a, 0xffffff], pants: [0x222222, 0x3b2a4a] },
  press: { shirts: [0x2e2e2e, 0x445566, 0xdddddd], pants: [0x222222, 0x333333] },
  concert: { shirts: [0xffffff, 0x111111, 0xd96aa7, 0x4a90d9], pants: [0x2e3b5a, 0x111111] },
  tourists: { shirts: [0xffffff, 0xf2b33d, 0x6cb6e0, 0xe8554e], pants: [0x2e2e2e, 0xf3e6c8], hat: { kind: 'cap', color: 0xffffff } },
} satisfies Record<string, CrowdLook>;

export type CrowdStyle = keyof typeof CROWD_LOOKS;

/**
 * Flags as data: stripes (top-to-bottom or left-to-right) plus an optional canton or emblem.
 * Add a country here and reference it from a scenario's `flag`.
 */
export interface FlagDef {
  stripes: readonly number[];
  vertical?: boolean;
  /** Small rectangle in the top-left corner (e.g. the US stars field). */
  canton?: number;
  /** Simple centered emblem: a disc (or crescent) in this color. */
  emblem?: { color: number; shape: 'disc' | 'crescent' | 'eagle' };
}

export const FLAGS = {
  egypt: { stripes: [0xce1126, 0xffffff, 0x000000], emblem: { color: 0xc09300, shape: 'eagle' } },
  france: { stripes: [0x0055a4, 0xffffff, 0xef4135], vertical: true },
  usa: { stripes: [0xb22234, 0xffffff, 0xb22234, 0xffffff, 0xb22234, 0xffffff, 0xb22234], canton: 0x3c3b6e },
  saudi: { stripes: [0x006c35], emblem: { color: 0xffffff, shape: 'disc' } },
  turkey: { stripes: [0xe30a17], emblem: { color: 0xffffff, shape: 'crescent' } },
  japan: { stripes: [0xffffff], emblem: { color: 0xbc002d, shape: 'disc' } },
  military: { stripes: [0x4b5a35, 0x6b7a45, 0x4b5a35] },
  wedding: { stripes: [0xffffff, 0xd96aa7, 0xffffff] },
} satisfies Record<string, FlagDef>;

export type FlagId = keyof typeof FLAGS;
