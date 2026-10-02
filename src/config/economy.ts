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
    /**
     * Average seconds between arrivals with one lane (arrivals are rate-driven, never stock-driven).
     * Each extra open lane multiplies the arrival rate by (1 + perLane).
     */
    interval: 2.4,
    perLane: 0.8,
    /** Random +/- fraction applied to each arrival gap. */
    intervalJitter: 0.3,
    /** Max customers waiting per lane; arrivals pause while every lane is full. */
    queueMax: 4,
    walkSpeed: 2.6,
    /** Seconds between a customer taking two items off the counter. */
    takeInterval: 0.22,
    /** Order size: 1..min(qtyMax, qtyBase + producers * qtyPerProducer), per product. */
    qty: {
      egg: { base: 2, perProducer: 0.5, max: 6 },
      milk: { base: 1, perProducer: 1, max: 4 },
    },
  },

  /** How close the player must stand to a lane's checkout spot to serve it (covers about two lanes). */
  serveRadius: 1.9,

  /**
   * Staff. By design they're good but worse than the player: smaller stacks, slower service,
   * and they work faster while the player is nearby.
   */
  staff: {
    worker: {
      /** Carry capacity at HR level 0 (player starts at 4). */
      capacity: 3,
      speed: 3.0,
      /** Seconds per item when loading/unloading (player: 0.09). */
      transferInterval: 0.16,
      /** Leave the pile with a partial stack after waiting this long. */
      maxWait: 2.5,
    },
    cashier: {
      /** Cashier serves this many times slower than the player (still 1.25x slower at max HR level). */
      slowFactor: 2.0,
    },
    /** While the player is within this radius, staff get +boost speed. */
    boostRadius: 3.5,
    boost: 0.3,
  },

  /** Conveyor belts from a pile straight onto its counter slot. */
  machines: {
    belt: {
      /** Seconds between items at level 1; each further level divides it by speedUp. */
      interval: 1.4,
      speedUp: 1.35,
      /** Travel time along the belt. */
      travel: 2.2,
    },
  },

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
    /** Egg workers: +1 worker per level. */
    'eggs.worker': { base: 600, growth: 6, max: 2, step: 1 },
    /** Egg belt: level 1 builds it, later levels speed it up. */
    'eggs.machine': { base: 6000, growth: 2.2, max: 4, step: 1 },
    /** Open another checkout lane (+1 lane per level; 1 lane at the start). */
    'shop.lanes': { base: 3500, growth: 2.4, max: 2, step: 1 },
    /** Hire a cashier (+1 per level, never more than the open lanes). */
    cashier: { base: 2500, growth: 2.2, max: 3, step: 1 },
    /** Build the HR office (opens the walled HR yard). */
    'hr.office': { base: 1000, growth: 1, max: 1, step: 1 },
    /** HR office: worker speed +step per level. */
    'hr.speed': { base: 900, growth: 1.8, max: 5, step: 0.15 },
    /** HR office: worker capacity +step per level. */
    'hr.capacity': { base: 1100, growth: 1.9, max: 4, step: 2 },
    /** HR office: cashier service speed; divides the slow factor by (1 + step * level). */
    'hr.cashier': { base: 1400, growth: 1.8, max: 4, step: 0.15 },
  },

  /** Paying into an upgrade tile. */
  tiles: {
    /** Drain rate = max(minRate, cost * costFraction) coins per second while standing on a tile. */
    costFraction: 0.9,
    minRate: 12,
    /** Standing within this distance of a tile pays into it. */
    radius: 0.95,
    /** Only pays while the player is (nearly) standing still, so running across a tile doesn't drain money. */
    maxPaySpeed: 1.5,
    /** A tile that appeared under the player only arms after they move this far away. */
    armDistance: 1.1,
  },

  offline: {
    /** Max time away that earns money (s). */
    capSeconds: 2 * 60 * 60,
    /** Fraction of what staff/machines would have earned that the player actually gets for time away. */
    efficiency: 0.3,
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
