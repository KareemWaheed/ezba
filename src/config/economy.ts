/**
 * ALL balance and feel numbers live here. Times are in seconds, distances in world units (~1 m),
 * money in coins. Sections are added milestone by milestone.
 */
export const ECONOMY = {
  /** Player movement feel. */
  player: {
    /** Top running speed (units/s). */
    speed: 5.2,
    /** Collision radius against fences/counters. */
    radius: 0.4,
    /** How fast velocity reaches the joystick target while moving (higher = snappier). */
    accel: 32,
    /** How fast velocity drops to zero when the stick is released. */
    decel: 45,
    /** Turning rate toward the move direction (higher = faster turn). */
    turnRate: 31,
    /** Joystick dead zone (0..1 of full deflection). */
    deadZone: 0.12,
  },
} as const;
