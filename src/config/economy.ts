/**
 * ALL balance and feel numbers live here. Times are in seconds, distances in world units (~1 m),
 * money in coins. Sections are added milestone by milestone.
 */
export const ECONOMY = {
  /** Player movement feel and carrying. */
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
    /** Items the player can carry at the start. */
    capacity: 4,
    /** Seconds between picking up two items from a pile. */
    pickInterval: 0.09,
    /** Seconds between dropping two items onto a counter. */
    dropInterval: 0.09,
  },

  /** Sale price per item. */
  products: {
    egg: { price: 3 },
    milk: { price: 7 },
  },

  /** Animals / machines that generate items into a pickup pile. */
  producers: {
    chicken: {
      /** Seconds per item per animal. */
      interval: 5.0,
      /** Animals at the start of the stage. */
      start: 2,
      /** Wander speed (visual only, but simulated deterministically). */
      wanderSpeed: 0.9,
    },
    cow: { interval: 5.0, start: 1, wanderSpeed: 0.6 },
  },

  /** Pickup piles next to producers. Producers pause when their pile is full. */
  pile: {
    max: 24,
    /** Flight time of a new item from the animal to the pile. */
    flyTime: 0.55,
  },

  /** Sell counters: storage is unlimited by design; pressure comes from service speed. */
  counter: {
    /** Items drawn before the stack stops growing and shows an "x120" label instead. */
    visualMax: 12,
  },

  customers: {
    /** Average seconds between arrivals (arrivals are rate-driven, never stock-driven). */
    interval: 2.2,
    /** Random +/- fraction applied to each arrival gap. */
    intervalJitter: 0.3,
    /** Max customers waiting in line; arrivals pause while the line is full. */
    queueMax: 5,
    walkSpeed: 2.6,
    /** Seconds between a customer taking two items off the counter. */
    takeInterval: 0.22,
    /** Order size: 1..min(qtyMax, qtyBase + producers * qtyPerProducer), per product. */
    qty: {
      egg: { base: 2, perProducer: 0.5, max: 6 },
      milk: { base: 1, perProducer: 1, max: 4 },
    },
  },

  /** How close the player must stand to the counter for customers to be served (no cashier). */
  serveRadius: 2.9,

  /**
   * Upgrade tracks. Buying level n+1 costs round(base * growth^n). `max` = number of levels.
   * `step` = effect per level (meaning depends on the track).
   */
  upgrades: {
    /** +1 chicken per level. */
    'eggs.animals': { base: 40, growth: 1.55, max: 8, step: 1 },
    /** +step carry capacity per level. */
    'player.capacity': { base: 60, growth: 1.7, max: 6, step: 2 },
    /** +step running speed multiplier per level. */
    'player.speed': { base: 120, growth: 1.8, max: 4, step: 0.08 },
  },

  /** Paying into an upgrade tile. */
  tiles: {
    /** Drain rate = max(minRate, cost * costFraction) coins per second while standing on a tile. */
    costFraction: 0.9,
    minRate: 12,
    /** Standing within this distance of a tile pays into it. */
    radius: 0.95,
    /** A tile that appeared under the player only arms after they move this far away. */
    armDistance: 1.1,
  },

  offline: {
    /** Max time away that earns money (s). */
    capSeconds: 2 * 60 * 60,
    /** Minimum time away before the welcome-back popup shows (s). */
    minSeconds: 30,
  },

  save: {
    /** Autosave interval (s). Also saves on tab hide / page hide. */
    autosaveEvery: 3,
  },
} as const;

export type ProductId = keyof typeof ECONOMY.products;
export type ProducerKind = keyof typeof ECONOMY.producers;
export type UpgradeId = keyof typeof ECONOMY.upgrades;
