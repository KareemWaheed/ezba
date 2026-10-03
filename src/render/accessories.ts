import type * as THREE from 'three';
import type { GuestLook } from '../config/looks';
import { PRIM, merge, part } from './geo';

const { box, sph, cyl, cone } = PRIM;

/**
 * Build accessory geometry from look data (body-space, same coordinates as character.ts).
 * Cached by look object so every guest/crowd member shares geometry.
 */
const BODY_CACHE = new Map<object, THREE.BufferGeometry | null>();
const HAND_CACHE = new Map<object, THREE.BufferGeometry | null>();

type HatLook = NonNullable<GuestLook['hat']>;

export function hatGeo(h: HatLook): THREE.BufferGeometry[] {
  switch (h.kind) {
    case 'cap': return [part(cyl, h.color, 0, 1.66, -0.02, 0, 0, 0, 0.27, 0.1, 0.27), part(box, h.color, 0, 1.63, 0.24, 0, 0, 0, 0.3, 0.03, 0.18)];
    case 'beret': return [part(sph, h.color, -0.04, 1.68, -0.03, 0, 0, 0.25, 0.3, 0.1, 0.28)];
    case 'crown': return [part(cyl, 0xf5c542, 0, 1.78, -0.03, 0, 0, 0, 0.2, 0.14, 0.2), ...[0, 1, 2, 3, 4].map((i) => part(cone, 0xf5c542, Math.cos((i / 5) * Math.PI * 2) * 0.16, 1.9, -0.03 + Math.sin((i / 5) * Math.PI * 2) * 0.16, 0, 0, 0, 0.05, 0.12, 0.05))];
    case 'veil': return [part(sph, h.color, 0, 1.55, -0.12, 0, 0, 0, 0.32, 0.4, 0.3), part(box, h.color, 0, 1.15, -0.25, 0, 0, 0, 0.5, 0.6, 0.05)];
    case 'flowerCrown': return [0, 1, 2, 3, 4, 5].map((i) => part(sph, i % 2 ? 0xf28c38 : 0xd96aa7, Math.cos((i / 6) * Math.PI * 2) * 0.24, 1.66, Math.sin((i / 6) * Math.PI * 2) * 0.24, 0, 0, 0, 0.06, 0.06, 0.06));
    // wide-brim farmer's straw hat
    case 'straw': return [part(cyl, h.color, 0, 1.64, -0.02, 0, 0, 0, 0.46, 0.03, 0.46), part(cyl, h.color, 0, 1.72, -0.02, 0, 0, 0, 0.24, 0.16, 0.24), part(cyl, 0x8a5a32, 0, 1.68, -0.02, 0, 0, 0, 0.25, 0.04, 0.25)];
    // tall white chef's toque
    case 'chef': return [part(cyl, h.color, 0, 1.7, -0.03, 0, 0, 0, 0.25, 0.12, 0.25), part(sph, h.color, 0, 1.86, -0.03, 0, 0, 0, 0.3, 0.2, 0.3)];
    // builder's hard hat with a brim
    case 'hardhat': return [part(sph, h.color, 0, 1.64, -0.02, 0, 0, 0, 0.29, 0.2, 0.29), part(cyl, h.color, 0, 1.62, 0.02, 0, 0, 0, 0.33, 0.025, 0.36)];
  }
}

/** Body accessories: big hair, beard, hat, tie, sash. Null if none. */
export function bodyAccessories(look: Partial<GuestLook>): THREE.BufferGeometry | null {
  if (BODY_CACHE.has(look)) return BODY_CACHE.get(look)!;
  const p: THREE.BufferGeometry[] = [];
  if (look.bigHair && look.hair !== undefined) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      p.push(part(sph, look.hair, Math.cos(a) * 0.2, 1.58 + Math.sin(a * 2) * 0.03, Math.sin(a) * 0.17 - 0.05, 0, 0, 0, 0.14, 0.14, 0.14));
    }
    p.push(part(sph, look.hair, 0, 1.66, -0.04, 0, 0, 0, 0.26, 0.16, 0.25));
  }
  if (look.beard !== undefined) p.push(part(sph, look.beard, 0, 1.3, 0.13, 0, 0, 0, 0.2, 0.14, 0.13));
  if (look.hat) p.push(...hatGeo(look.hat));
  if (look.tie !== undefined) p.push(part(box, look.tie, 0, 1.0, 0.25, 0, 0, 0, 0.07, 0.3, 0.03), part(box, 0xffffff, 0, 1.12, 0.24, 0, 0, 0, 0.16, 0.12, 0.02));
  if (look.glasses !== undefined) p.push(part(box, look.glasses, 0, 1.46, 0.24, 0, 0, 0, 0.3, 0.07, 0.03), part(box, 0x223344, -0.08, 1.45, 0.26, 0, 0, 0, 0.1, 0.06, 0.01), part(box, 0x223344, 0.08, 1.45, 0.26, 0, 0, 0, 0.1, 0.06, 0.01));
  if (look.sash !== undefined) p.push(part(box, look.sash, 0, 0.95, 0.24, 0, 0, 0.7, 0.1, 0.7, 0.03));
  const g = p.length ? merge(p) : null;
  BODY_CACHE.set(look, g);
  return g;
}

/** Hand prop (attached to the right arm, which hangs from the shoulder). */
export function handProp(look: Partial<GuestLook>): THREE.BufferGeometry | null {
  if (HAND_CACHE.has(look)) return HAND_CACHE.get(look)!;
  let g: THREE.BufferGeometry | null = null;
  switch (look.holds) {
    case 'phone': g = merge([part(box, 0x111111, 0, -0.5, 0.08, 0, 0, 0, 0.08, 0.16, 0.02), part(box, 0x6fc3ff, 0, -0.5, 0.092, 0, 0, 0, 0.065, 0.13, 0.005)]); break;
    case 'ball': g = merge([part(sph, 0xffffff, 0, -0.55, 0.1, 0, 0, 0, 0.13, 0.13, 0.13), part(sph, 0x222222, 0.06, -0.5, 0.2, 0, 0, 0, 0.04, 0.04, 0.03)]); break;
    case 'flower': g = merge([part(cyl, 0x3e8e3a, 0, -0.55, 0.08, 0, 0, 0, 0.02, 0.3, 0.02), part(sph, 0xe8554e, 0, -0.4, 0.08, 0, 0, 0, 0.07, 0.07, 0.07)]); break;
    case 'baton': g = merge([part(cyl, 0x5a3a22, 0, -0.5, 0.1, Math.PI / 2, 0, 0, 0.025, 0.4, 0.025), part(sph, 0xd9b44a, 0, -0.5, 0.3, 0, 0, 0, 0.04, 0.04, 0.04)]); break;
    default: g = null;
  }
  HAND_CACHE.set(look, g);
  return g;
}
