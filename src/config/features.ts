/**
 * Feature switches. The supermarket (store stage, supermarket-first game, price tags) is closed for now:
 * its tiles and the start screen don't appear, and a save that already built the store gets its store
 * upgrades refunded on load. The code stays (tools/marketcheck and marketpacing switch it on for their
 * checks), so it can come back by flipping this.
 */
export const FEATURES = {
  supermarket: false,
};
