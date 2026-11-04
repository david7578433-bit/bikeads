/* Media on Wheels: feature switches.
 * delivery — the separate DELIVERY business (drivers, stores, boss/dispatch, delivery orders, tracking,
 *   customer texts, invoices). Saved in the code, OFF for now (David, Nov 4 2026): no delivery pages, tabs,
 *   roles, demo logins or mentions show while this is false. Set it to true to bring all of it back.
 *   Nothing is deleted either way. */
window.FEATURES = Object.freeze({
  delivery: false
});
