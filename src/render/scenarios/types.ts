import type * as THREE from 'three';
import type { SimWorld } from '../../sim/world';
import type { Renderer } from '../renderer';

/** Draws one mechanic's own things (strays, ball, checklist route...). Built at event start, disposed at the end. */
export interface MechanicView {
  sync(sim: SimWorld, dt: number): void;
  dispose(): void;
}

export type MechanicViewFactory = (scene: THREE.Scene, view: Renderer) => MechanicView;
