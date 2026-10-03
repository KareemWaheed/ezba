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

  /** Raw products: sale price per item at the shop counter. */
  products: {
    egg: { price: 2 },
    milk: { price: 4 },
  },

  /** Field crops (stage 4): sale price per bundle at the grain stall. */
  crops: {
    corn: { price: 5 },
    wheat: { price: 9 },
  },

  /** Crop fields (stage 4): walk through with a tool to cut every stalk in reach. */
  field: {
    /** Grid spacing of the stalks. */
    spacing: 0.6,
    /** Stalks that make one carried bundle. */
    stalksPerBundle: 3,
    /** Seconds until a cut stalk is grown again (divided by 1 + field.regrow step x level). */
    regrow: { corn: 30, wheat: 40 },
    /** Cutting reach of the hand sickle; field.tool adds its step per level. */
    toolRadius: 0.9,
    /** Chance a regrown stalk is golden; cutting it pays goldenReward x price growth. */
    goldenChance: 0.015,
    goldenReward: 60,
    /** Seconds between two bundles sold at the stall. */
    sellInterval: 0.06,
    /** North of this z is farmland: owned vehicles carry the player there (parked south of it). */
    farmlandZ: -9.95,
    /** Vehicles: speed multiplier and extra cutting reach; the combine fills its own hopper. */
    tractor: { speedMult: 1.4, reach: 0.9, radius: 0.9 },
    combine: { speedMult: 1.55, reach: 1.9, hopper: 60, radius: 1.2 },
    /** Hired drivers: NPC tractors mowing a plot back and forth, unloading at the stall. */
    driver: { speed: 3.2, reach: 1.5, hopper: 24, unloadInterval: 0.12 },
  },

  /**
   * Market prices rise as the farm grows: every upgrade bought adds this much to all sale prices
   * (eggs, milk, dishes, contracts, rewards). Keeps big upgrades reachable as costs climb.
   */
  market: { growthPerUpgrade: 0.02 },

  /** Café dishes (made on the stove from raw products, see config/recipes.ts): price per dish. */
  dishes: {
    omelette: { price: 18 },
    coffee: { price: 10 },
  },

  /** Farm café. */
  cafe: {
    /** Café customers per minute per table (x rating; breakfast rush multiplies it). */
    perTable: 1.2,
    /** Dishes per order: 1..maxDishes. */
    maxDishes: 3,
    /** Patience while waiting in line or for a free clean table. */
    patience: 80,
    /** Seconds a customer sits and eats. */
    eatTime: 7,
    /** Seconds the player stands at a dirty table to clean it (cleaners take cleanerSlow x longer). */
    cleanTime: 1.0,
    cleanerSlow: 2.2,
    cleanerSpeed: 2.6,
    /** Raw items the stove can hold per product, and dishes waiting in its output tray. */
    stoveInputMax: 24,
    stoveOutputMax: 8,
    /** Nicer tables: café prices x (1 + step x level) and patience +20% per level. */
    niceStep: 0.2,
    /** Café counter visual stack cap. */
    counterVisualMax: 8,
    /** Dishes per kind on the café counter before the kitchen conveyors pause (machines then fill and stop taking eggs/milk). */
    counterMax: 12,
    /** Café cash register serves this many times slower than the player. */
    waiterSlow: 2.0,
    /** Kitchen helpers may take raw items from the shop counter's surplus, leaving this many for shop customers. */
    counterReserve: 12,
    /** Kitchen helpers carry more than farm workers (long walk to the café); HR capacity adds on top. */
    helperCapacity: 6,
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
    cow: { interval: 6.0, start: 1, wanderSpeed: 0.6 },
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
     * Demand follows the farm, never the stock on the counter: customers per minute are set so they
     * want about `demandRatio` of what the animals produce (base rate, no trough boost), plus
     * `perMinute`. Each extra open lane adds (1 + perLane); rating and rushes multiply it too.
     * Feeding boosts and bigger farms therefore create a surplus that contracts can absorb later.
     */
    perMinute: 2,
    demandRatio: 0.85,
    perLane: 0.25,
    /** Random +/- fraction applied to each arrival gap. */
    intervalJitter: 0.3,
    /** Max customers waiting per lane; arrivals pause while every lane is full. */
    queueMax: 4,
    walkSpeed: 2.6,
    /** Seconds between a customer taking two items off the counter. */
    takeInterval: 0.22,
    /** Chance a customer orders two products (once two are on sale), and how much smaller each line is. */
    mixedChance: 0.35,
    mixedScale: 0.6,
    /** Order size: 1..min(qtyMax, qtyBase + producers * qtyPerProducer), per product. */
    qty: {
      egg: { base: 2, perProducer: 0.5, max: 6 },
      milk: { base: 1, perProducer: 1, max: 4 },
    },
  },

  /** How close the player must stand to a lane's checkout spot to serve it (covers about two lanes). */
  serveRadius: 1.9,

  /** Patience and mood. Patience drains while waiting in line and pauses while being served. */
  patience: {
    /** Seconds a normal customer will wait. */
    normal: 45,
    /** New-farm grace: extra patience that fades out linearly over the first `earlyUpgrades` purchases. */
    early: 60,
    earlyUpgrades: 12,
    /** Mood thresholds (fraction of patience left): above `happy` = 😊, above `bored` = 😐, else 😠. */
    happy: 0.6,
    bored: 0.3,
  },

  /** Rewards only the player earns (staff never get tips or combos). */
  tips: {
    /** A service counts as fast if the customer still had at least this much patience left. */
    fastAbove: 0.6,
    /** Tip = order value x rate x (rating / 3). */
    rate: 0.08,
    /** Each fast service in a row adds this much to the order value (x combo, capped). */
    comboStep: 0.015,
    comboMax: 10,
    /** The combo resets if the player doesn't finish a fast service within this many seconds. */
    comboTimeout: 25,
  },

  /**
   * Farm rating, 1..5 stars, from recent customers who arrived while the app was open.
   * Gentle on purpose: fewer customers at low rating means easier service, so it recovers.
   */
  rating: {
    start: 3,
    /** How far each customer moves the rating toward their score (0..1). */
    weight: 0.06,
    /** Customer scores mapped to stars as 1 + 4 x score. */
    scoreFast: 1, scoreNormal: 0.75, scoreAngry: 0,
    /** Arrival rate multiplier = arrivalBase + arrivalPerStar x rating (1 star 0.85x, 5 stars 1.25x). */
    arrivalBase: 0.75,
    arrivalPerStar: 0.1,
  },

  /** Rush events (active play only): a warned burst of customers, often skewed to one product. */
  rush: {
    /** Seconds of active play between rushes. */
    gapMin: 240,
    gapMax: 420,
    /** Warning countdown before the rush (rush.warning upgrade adds more). */
    warning: 5,
    /** Burst length and arrival multiplier. */
    duration: 40,
    arrivalMult: 3,
    /** Chance a rush customer orders the rush's featured product. */
    skew: 0.75,
    /** Bonus for a rush with no angry customers: flat + share of the rush's sales (rush.reward raises the share). */
    bonusFlat: 100,
    bonusShare: 0.5,
    /** Rushes start once the player has bought this many upgrades. */
    minUpgrades: 8,
  },

  vip: {
    /** Chance an arriving customer is a VIP (active play only). */
    chance: 0.04,
    minUpgrades: 10,
    /** VIPs order bigger, wait longer and pay this many times the price. Only the player can serve them. */
    qtyMult: 1.5,
    patienceMult: 1.6,
    payMult: 4,
  },

  /** Machines jam now and then; only the player can fix them by standing next to them. */
  breakdowns: {
    /** Mean seconds of running between jams for one machine (maint upgrade multiplies it). */
    mean: 420,
    /** Seconds the player must stand next to a jammed machine. */
    fixTime: 2,
    fixRadius: 1.6,
  },

  /** Golden animal: escapes into the yard now and then; catch it before it runs off. */
  golden: {
    gapMin: 420,
    gapMax: 780,
    /** Seconds it stays before running off. */
    lifetime: 25,
    catchRadius: 1.0,
    /** Reward = seconds of that station's full production value, paid in cash. */
    rewardSeconds: 45,
    minUpgrades: 8,
  },

  /** Feeding troughs: the player refills them; a full trough doubles that station's production. */
  feed: {
    /** Seconds the boost lasts after a refill. */
    duration: 150,
    mult: 2,
    /** Stand at the trough this long to refill (only when it's below `refillBelow`). */
    refillTime: 1,
    refillBelow: 0.25,
    radius: 1.1,
  },

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
      /**
       * Seconds between items at level 1; each further level divides it by speedUp.
       * Must beat a worker (~0.8-1.8 items/s depending on HR upgrades): 2/s at level 1, ~5/s at level 4.
       */
      interval: 0.5,
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
    'eggs.worker': { base: 750, growth: 5, max: 2, step: 1 },
    /** Egg belt: level 1 builds it, later levels speed it up. */
    'eggs.machine': { base: 1000, growth: 3, max: 4, step: 1 },
    /** Open the cow pen (single level): milk station starts with producers.cow.start cows. */
    'milk.unlock': { base: 3800, growth: 1, max: 1, step: 1 },
    /** Bigger coop: fence moves out, +step chickens allowed per level. */
    'eggs.expand': { base: 5000, growth: 3.5, max: 2, step: 6 },
    /** Bigger cow pen: fence moves out, +step cows allowed per level. */
    'milk.expand': { base: 14000, growth: 3.2, max: 2, step: 4 },
    /** +1 cow per level. */
    'milk.animals': { base: 350, growth: 1.6, max: 6, step: 1 },
    /** Milk workers: +1 worker per level. */
    'milk.worker': { base: 2500, growth: 3, max: 2, step: 1 },
    /** Milk belt: level 1 builds it, later levels speed it up. */
    'milk.machine': { base: 6000, growth: 3, max: 4, step: 1 },
    /** Maintenance: breakdowns.mean x (1 + step x level). Never reaches zero breakdowns. */
    maint: { base: 3000, growth: 2, max: 4, step: 0.6 },
    /** Rush bonus share +step per level. */
    'rush.reward': { base: 2500, growth: 2, max: 4, step: 0.25 },
    /** Rush warning +step seconds per level. */
    'rush.warning': { base: 1500, growth: 2, max: 3, step: 3 },
    /** Open the farm café: stove, café counter and the first tables. */
    'cafe.unlock': { base: 9000, growth: 1, max: 1, step: 1 },
    /** +1 café table per level (2 at unlock). */
    'cafe.tables': { base: 2500, growth: 1.8, max: 4, step: 1 },
    /** Nicer tables: café prices and patience up. */
    'cafe.nice': { base: 8000, growth: 2.5, max: 2, step: 1 },
    /** Kitchen machines (stove + coffee) work faster: time / (1 + step x level). */
    'cafe.stove': { base: 3000, growth: 2, max: 4, step: 0.4 },
    /** Extra kitchen helpers (the café opens with one) carrying eggs/milk to the stove. */
    'cafe.helper': { base: 30000, growth: 3, max: 2, step: 1 },
    /** Café cashier at the café counter. */
    'cafe.waiter': { base: 160000, growth: 1, max: 1, step: 1 },
    /** Cleaners clear dirty tables (+1 per level). */
    'cafe.cleaner': { base: 15000, growth: 3, max: 2, step: 1 },
    /** Loading dock: company trucks with supply contracts. */
    'dock.unlock': { base: 7000, growth: 1, max: 1, step: 1 },
    /** Dock workers load trucks from the shop counter's surplus (+1 per level). */
    'dock.worker': { base: 18000, growth: 3, max: 2, step: 1 },
    /** Bigger trucks / bigger deals: contract sizes x (1 + step x level). */
    'dock.size': { base: 12000, growth: 2.4, max: 3, step: 0.4 },
    /** Open the corn field (stage 4) north of the pens, with the grain stall. */
    'field.unlock': { base: 25000, growth: 1, max: 1, step: 1 },
    /** Wider cutting reach: radius + step per level (sickle -> bigger blades -> double blades). */
    'field.tool': { base: 4000, growth: 2.2, max: 5, step: 0.3 },
    /** Open the wheat field next to the corn (pricier crop). */
    'field.wheat': { base: 60000, growth: 1, max: 1, step: 1 },
    /** Tractor with a cutter: you drive it in the fields (faster, wider path). */
    'field.tractor': { base: 90000, growth: 1, max: 1, step: 1 },
    /** Combine harvester: very wide path, bundles go into its hopper (unloads at the stall). */
    'field.combine': { base: 300000, growth: 1, max: 1, step: 1 },
    /** Hired tractor drivers (+1 per level): they harvest on their own, also during time away. */
    'field.driver': { base: 60000, growth: 2.2, max: 3, step: 1 },
    /** Bigger engine: vehicles drive faster, x (1 + step x level). */
    'field.engine': { base: 20000, growth: 2.3, max: 3, step: 0.12 },
    /** Fertilizer: crops regrow faster, time / (1 + step x level). */
    'field.regrow': { base: 6000, growth: 2.2, max: 4, step: 0.15 },
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

/** Raw products (from animals). */
export type ProductId = keyof typeof ECONOMY.products;
/** Café dishes. */
export type DishId = keyof typeof ECONOMY.dishes;
/** Field crops (cut, carried as bundles, sold at the grain stall). */
export type CropId = keyof typeof ECONOMY.crops;
/** Anything that can be carried. */
export type ItemId = ProductId | DishId | CropId;

export const PRODUCT_IDS = Object.keys(ECONOMY.products) as ProductId[];
export const DISH_IDS = Object.keys(ECONOMY.dishes) as DishId[];
export const CROP_IDS = Object.keys(ECONOMY.crops) as CropId[];
export const ITEM_IDS: ItemId[] = [...PRODUCT_IDS, ...DISH_IDS, ...CROP_IDS];

export function priceOf(item: ItemId): number {
  if (item in ECONOMY.products) return ECONOMY.products[item as ProductId].price;
  if (item in ECONOMY.crops) return ECONOMY.crops[item as CropId].price;
  return ECONOMY.dishes[item as DishId].price;
}
export type ProducerKind = keyof typeof ECONOMY.producers;
export type UpgradeId = keyof typeof ECONOMY.upgrades;
