import * as THREE from 'three';

// Match the r128 prototype's look: hex colors are used as-is (no sRGB->linear conversion).
// Must run before any THREE.Color is created, so main.ts imports this first.
THREE.ColorManagement.enabled = false;
