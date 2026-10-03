import type * as THREE from 'three';
import type { ItemId, ProducerKind } from '../config/economy';
import type { FieldCrop } from '../config/fields';
import { PRIM, Q4, merge, part } from './geo';

const { box, sph, sphLo, cyl, cylLo, cone } = PRIM;

export type ItemKind = ItemId | 'bill';

/** Low-poly item models (one merged geometry each). */
export const ITEM_GEO: Record<ItemKind, THREE.BufferGeometry> = {
  egg: merge([
    part(box, 0xc98a4b, 0, 0.13, 0, 0, 0, 0, 0.62, 0.26, 0.62),
    part(box, 0xa86b33, 0, 0.265, 0, 0, 0, 0, 0.5, 0.02, 0.5),
    ...Q4.map(([a, b]) => part(sphLo, 0xfff8ea, a * 0.14, 0.36, b * 0.14, 0, 0, 0, 0.13, 0.16, 0.13)),
  ]),
  milk: merge([
    part(box, 0x4aa3df, 0, 0.11, 0, 0, 0, 0, 0.62, 0.22, 0.62),
    ...Q4.map(([a, b]) => part(cylLo, 0xffffff, a * 0.15, 0.4, b * 0.15, 0, 0, 0, 0.1, 0.38, 0.1)),
    ...Q4.map(([a, b]) => part(cylLo, 0x2b6cb0, a * 0.15, 0.62, b * 0.15, 0, 0, 0, 0.07, 0.07, 0.07)),
  ]),
  omelette: merge([
    part(cyl, 0xffffff, 0, 0.04, 0, 0, 0, 0, 0.3, 0.06, 0.3),
    part(cyl, 0xf6d24a, 0, 0.09, 0, 0, 0, 0, 0.22, 0.05, 0.16),
    part(sphLo, 0xffffff, 0.04, 0.12, 0.02, 0, 0, 0, 0.07, 0.03, 0.07),
    part(sphLo, 0xf2a73b, 0.04, 0.14, 0.02, 0, 0, 0, 0.035, 0.025, 0.035),
  ]),
  coffee: merge([
    part(box, 0xc98a4b, 0, 0.03, 0, 0, 0, 0, 0.5, 0.06, 0.34),
    part(cylLo, 0xd8eef7, -0.1, 0.2, 0, 0, 0, 0, 0.09, 0.28, 0.09),
    part(cylLo, 0xd8eef7, 0.1, 0.2, 0, 0, 0, 0, 0.09, 0.28, 0.09),
    part(cylLo, 0xffffff, -0.1, 0.32, 0, 0, 0, 0, 0.08, 0.04, 0.08),
    part(cylLo, 0xffffff, 0.1, 0.32, 0, 0, 0, 0, 0.08, 0.04, 0.08),
  ]),
  // round layer cake on a plate: sponge, cream band, strawberries on top
  cake: merge([
    part(cyl, 0xffffff, 0, 0.03, 0, 0, 0, 0, 0.34, 0.05, 0.34),
    part(cyl, 0xe0a060, 0, 0.13, 0, 0, 0, 0, 0.27, 0.16, 0.27),
    part(cyl, 0xfff3e0, 0, 0.23, 0, 0, 0, 0, 0.28, 0.05, 0.28),
    ...[0, 1, 2, 3].map((i) => part(sphLo, 0xe8354a, Math.cos(i * 1.57) * 0.15, 0.28, Math.sin(i * 1.57) * 0.15, 0, 0, 0, 0.05, 0.05, 0.05)),
  ]),
  // cheese sandwich on a paper tray: bread, cheese slice peeking out, bread
  cheese: merge([
    part(box, 0xf3efe3, 0, 0.02, 0, 0, 0, 0, 0.5, 0.04, 0.34),
    part(box, 0xe8b860, 0, 0.08, 0, 0, 0, 0, 0.42, 0.07, 0.28),
    part(box, 0xf6d24a, 0.02, 0.13, 0.02, 0, 0, 0, 0.44, 0.03, 0.3),
    part(box, 0xe8b860, 0, 0.18, 0, 0, 0, 0, 0.42, 0.07, 0.28),
  ]),
  // three cobs in green husks, tied with straw
  corn: merge([
    ...[-0.15, 0, 0.15].map((x) => part(cylLo, 0x6fae3a, x, 0.12, 0, Math.PI / 2, 0, 0, 0.09, 0.56, 0.09)),
    ...[-0.15, 0, 0.15].map((x) => part(cylLo, 0xf6cf3a, x, 0.14, 0.2, Math.PI / 2, 0, 0, 0.075, 0.18, 0.075)),
    part(box, 0xc79a4a, 0, 0.12, -0.05, 0, 0, 0, 0.5, 0.2, 0.06),
  ]),
  // golden sheaf lying down, tied in the middle
  wheat: merge([
    part(cylLo, 0xe2b955, 0, 0.13, 0, Math.PI / 2, 0, 0, 0.17, 0.6, 0.13),
    part(cylLo, 0xc9962e, 0, 0.15, 0.36, Math.PI / 2, 0, 0, 0.2, 0.16, 0.15),
    part(box, 0x8a5a32, 0, 0.13, -0.02, 0, 0, 0, 0.38, 0.3, 0.06),
  ]),
  bill: merge([
    part(box, 0x4dbb4f, 0, 0.05, 0, 0, 0, 0, 0.56, 0.1, 0.3),
    part(box, 0x8fe58a, 0, 0.051, 0, 0, 0, 0, 0.3, 0.104, 0.16),
  ]),
};

/** Stacking height of one item. */
export const ITEM_H: Record<ItemKind, number> = { egg: 0.44, milk: 0.66, omelette: 0.17, coffee: 0.36, cake: 0.32, cheese: 0.22, corn: 0.24, wheat: 0.28, bill: 0.11 };

export const ITEM_ICON: Record<ItemId, string> = { egg: '🥚', milk: '🥛', omelette: '🍳', coffee: '☕', cake: '🍰', cheese: '🥪', corn: '🌽', wheat: '🌾' };

/** Standing crop stalks (one instance per stalk; scaled down to a stub when cut). */
export const STALK_GEO: Record<FieldCrop, THREE.BufferGeometry> = {
  corn: merge([
    part(cylLo, 0x5f9e35, 0, 0.55, 0, 0, 0, 0, 0.05, 1.1, 0.05),
    part(box, 0x6fb83f, 0.12, 0.6, 0, 0, 0, -0.7, 0.3, 0.03, 0.08),
    part(box, 0x6fb83f, -0.12, 0.8, 0.02, 0, 0, 0.7, 0.3, 0.03, 0.08),
    part(cylLo, 0xf6cf3a, 0.07, 0.78, 0.05, 0, 0, -0.35, 0.06, 0.2, 0.06),
    part(cone, 0xd9c36a, 0, 1.18, 0, 0, 0, 0, 0.06, 0.16, 0.06),
  ]),
  wheat: merge([
    ...[[-0.07, 0], [0.07, 0.03], [0, -0.07]].flatMap(([x, z]) => [
      part(cylLo, 0xd8b04a, x, 0.4, z, 0, 0, 0, 0.025, 0.8, 0.025),
      part(sphLo, 0xe8c35c, x, 0.86, z, 0, 0, 0, 0.05, 0.13, 0.05),
    ]),
  ]),
};

export const ANIMAL_GEO: Record<ProducerKind, THREE.BufferGeometry> = {
  chicken: merge([
    part(sph, 0xffffff, 0, 0.32, 0, 0, 0, 0, 0.28, 0.26, 0.34),
    part(sph, 0xffffff, 0, 0.6, 0.2, 0, 0, 0, 0.15, 0.16, 0.15),
    part(box, 0xe0393e, 0, 0.78, 0.2, 0, 0, 0, 0.05, 0.1, 0.15),
    part(cone, 0xf2a73b, 0, 0.58, 0.38, Math.PI / 2, 0, 0, 0.05, 0.12, 0.05),
    part(box, 0xf2a73b, -0.08, 0.06, 0, 0, 0, 0, 0.04, 0.14, 0.04),
    part(box, 0xf2a73b, 0.08, 0.06, 0, 0, 0, 0, 0.04, 0.14, 0.04),
    part(sph, 0xeeeeee, 0, 0.42, -0.3, -0.5, 0, 0, 0.12, 0.16, 0.08),
    part(sph, 0x222222, -0.08, 0.63, 0.32, 0, 0, 0, 0.025, 0.03, 0.025),
    part(sph, 0x222222, 0.08, 0.63, 0.32, 0, 0, 0, 0.025, 0.03, 0.025),
  ]),
  cow: merge([
    part(box, 0xffffff, 0, 0.95, 0, 0, 0, 0, 0.9, 0.75, 1.5),
    part(box, 0x2b2b2b, 0.452, 1.0, 0.2, 0, 0, 0, 0.02, 0.4, 0.5),
    part(box, 0x2b2b2b, -0.452, 0.9, -0.35, 0, 0, 0, 0.02, 0.35, 0.45),
    part(box, 0x2b2b2b, 0, 1.326, -0.2, 0, 0, 0, 0.5, 0.02, 0.4),
    part(box, 0xffffff, 0, 1.28, 0.95, 0, 0, 0, 0.55, 0.5, 0.55),
    part(box, 0xf3a6b0, 0, 1.12, 1.25, 0, 0, 0, 0.5, 0.25, 0.12),
    part(cone, 0xf2e6c8, -0.2, 1.6, 0.9, 0, 0, 0.3, 0.06, 0.18, 0.06),
    part(cone, 0xf2e6c8, 0.2, 1.6, 0.9, 0, 0, -0.3, 0.06, 0.18, 0.06),
    part(sph, 0x222222, -0.15, 1.38, 1.23, 0, 0, 0, 0.04, 0.05, 0.04),
    part(sph, 0x222222, 0.15, 1.38, 1.23, 0, 0, 0, 0.04, 0.05, 0.04),
    ...Q4.map(([a, b]) => part(box, 0xffffff, a * 0.3, 0.3, b * 0.55, 0, 0, 0, 0.18, 0.6, 0.18)),
    part(box, 0x2b2b2b, 0, 0.85, -0.8, 0.3, 0, 0, 0.06, 0.5, 0.06),
  ]),
};

export const ANIMAL_SHADOW: Record<ProducerKind, number> = { chicken: 0.35, cow: 0.8 };

/** Item flight scale when flying from an animal into its pile. */
export const FLY_SCALE = 0.7;
