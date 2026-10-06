/**
 * Feature switches. supermarket: the store stage, the supermarket-first game and price tags. Switched off,
 * its tiles and the start screen don't appear and a save that already built the store gets its store
 * upgrades refunded on load (tools/marketcheck covers that; it and marketpacing switch it on for their checks).
 */
export const FEATURES = {
  supermarket: true,
};
