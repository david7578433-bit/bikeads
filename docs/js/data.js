/* Media on Wheels data layer (repo: bikeads).
 * Every read and write in the app goes through `Data`. Two adapters with the same three methods
 * (loadAll, saveCollection, clearAll):
 *  - LocalAdapter (below): this browser only (localStorage). Used while the Supabase keys in js/config.js are empty.
 *  - Auth.adapter (js/auth.js): the shared Supabase database (tables mow_*, supabase/schema.sql), used once the keys are set.
 * Production start (Nov 8 2026, David: "take down all test members"): NO demo members, logins, bookings,
 * transactions, stores or drivers are seeded any more. A new database / device starts empty except the two
 * service areas and the settings (real prices: 150 dollars printing & setup per bike, 75 dollars per bike per week).
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'mow.prod.v2'; /* was 'bikeads.v1' (demo data, left untouched in old browsers, no longer read) */
  const COLLECTIONS = ['users', 'locations', 'bikes', 'bookings', 'transactions', 'reconciliations',
    /* Nov 8 2026: price discounts (admin price table) */ 'discounts',
    /* BikeAds Deliver plugin */ 'stores', 'drivers', 'orders', 'smslog', 'shifts', 'invoices', 'payouts'];

  const LocalAdapter = {
    async loadAll() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
      catch (e) { return null; }
    },
    async saveCollection(name, all) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    },
    async clearAll() { localStorage.removeItem(STORAGE_KEY); }
  };

  /* Example shape of a shared-database adapter (not active in v1):
  const RemoteAdapter = {
    async loadAll() { return (await fetch('/api/all')).json(); },
    async saveCollection(name, all) {
      await fetch('/api/' + name, { method: 'PUT', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(all[name]) });
    },
    async clearAll() { await fetch('/api/reset', { method: 'POST' }); }
  };
  */

  /* Client checkout prices. REAL prices since Nov 8 2026 (client, via David): printing & setup 150 dollars per bike one time,
   * 75 dollars per bike per week (they were swapped sample numbers before). Admin → Settings changes them.
   * (Name SAMPLE_PRICES kept for older code.) Example: 5 bikes x 1 week = 750 + 375 = 1,125. */
  const PRICES = { setupFeePerBike: 150, weeklyPerBike: 75 };
  const SAMPLE_PRICES = PRICES;

  const uid = (p) => (p || 'id') + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
  const today = () => iso(new Date());

  /* Settings every new database / device starts with. Prices are SAMPLE numbers until David sets real ones. */
  function defaultSettings() {
    return { businessName: 'Media on Wheels', pricePerBikeDay: 25, depositPct: 20, openingBalance: 0, seededAt: new Date().toISOString(), version: 1,
      setupFeePerBike: PRICES.setupFeePerBike, weeklyPerBike: PRICES.weeklyPerBike, pricesAreSamples: false, minBikes: 5 };
  }
  /* The two service areas (Williamsburg and Boro Park). No members, bikes, bookings or money records: those are real data
   * the admin and the clients add. (The old demo set with fake clients/drivers/stores was removed on Nov 8 2026.) */
  function defaultLocations() {
    return [
      { id: 'loc_wburg', name: 'Williamsburg', lat: 40.7081, lng: -73.9571, zoom: 15 },
      { id: 'loc_bpark', name: 'Borough Park', lat: 40.6337, lng: -73.9965, zoom: 15 }
    ];
  }
  function seed() {
    const base = { users: [], locations: defaultLocations(), bikes: [], bookings: [], transactions: [], reconciliations: [], settings: defaultSettings(), discounts: [] };
    addDeliver(base);
    return base;
  }

  /* BikeAds Deliver (behind FEATURES.delivery): add only its settings and empty lists — no demo stores, drivers,
   * orders or logins any more (DeliverSeed.addTo with the old demo set is still in the code, unused). */
  function addDeliver(st) {
    const DS = (typeof window !== 'undefined' && window.DeliverSeed) || null;
    if (!DS || !st.settings || st.settings.deliver) return false;
    DS.addSettings(st, { uid, iso, addDays, today });
    return true;
  }

  let state = null;
  let newDatabase = false;
  let adapter = LocalAdapter;
  const listeners = new Set();

  async function persist(name) {
    try { await adapter.saveCollection(name, state); } catch (e) {
      console.error('save failed', e);
      if (typeof window !== 'undefined' && window.UI && window.UI.toast) window.UI.toast(adapter === LocalAdapter ? 'Could not save: this device\'s storage is full.' : 'Could not save to the database: ' + ((e && e.message) || 'no connection') + '. Please try again.');
    }
    listeners.forEach((fn) => { try { fn(name); } catch (e) { console.error(e); } });
  }

  const Data = {
    uid, iso, addDays, today,
    async init(customAdapter) {
      if (customAdapter) adapter = customAdapter;
      state = await adapter.loadAll();
      newDatabase = false;
      const fresh = !state || !state.settings || state.settings.version !== 1;
      if (fresh && adapter === LocalAdapter) { state = seed(); await persist('all'); }
      else if (fresh) { /* database: fill what the database does not have yet, in memory (the admin's first sign-in stores it) */
        newDatabase = true;
        state = state || {}; state.settings = Object.assign(defaultSettings(), state.settings || {}, { version: 1 });
        if (!Array.isArray(state.locations) || !state.locations.length) state.locations = defaultLocations();
      }
      COLLECTIONS.forEach((c) => { if (!Array.isArray(state[c])) state[c] = []; });
      if (state.settings.setupFeePerBike == null || state.settings.weeklyPerBike == null) {
        state.settings.setupFeePerBike = state.settings.setupFeePerBike == null ? SAMPLE_PRICES.setupFeePerBike : state.settings.setupFeePerBike;
        state.settings.weeklyPerBike = state.settings.weeklyPerBike == null ? SAMPLE_PRICES.weeklyPerBike : state.settings.weeklyPerBike;
        if (state.settings.pricesAreSamples == null) state.settings.pricesAreSamples = false;
        if (adapter === LocalAdapter) await persist('settings');
      }
      if (!state.settings.businessName || state.settings.businessName === 'BikeAds') state.settings.businessName = 'Media on Wheels';
      if (addDeliver(state) && adapter === LocalAdapter) await persist('all');
      return Data;
    },
    /* Which store is in use: 'database' (shared Supabase) or 'device' (this browser only). */
    mode() { return adapter === LocalAdapter ? 'device' : 'database'; },
    /* Database mode: the admin's first sign-in on an empty database stores the starting settings and service areas. */
    async saveStartIfNew() { if (!newDatabase || adapter === LocalAdapter) return false; newDatabase = false; await adapter.saveCollection('all', state); return true; },
    /* This-device mode only: clear this browser's copy back to the empty production start. */
    async reset() { if (adapter !== LocalAdapter) return; await adapter.clearAll(); state = seed(); await persist('all'); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    settings() { return state.settings; },
    saveSettings(patch) { Object.assign(state.settings, patch); return persist('settings'); },
    list(name) { return state[name].slice(); },
    get(name, id) { return state[name].find((r) => r.id === id) || null; },
    put(name, rec, opts) {
      if (!rec.id) rec.id = uid(name.slice(0, 3));
      const i = state[name].findIndex((r) => r.id === rec.id);
      if (i >= 0) state[name][i] = Object.assign({}, state[name][i], rec); else state[name].push(rec);
      if (!(opts && opts.silent)) persist(name);
      return this.get(name, rec.id);
    },
    flush(name) { return adapter.saveCollection(name || 'all', state); },
    remove(name, id) { state[name] = state[name].filter((r) => r.id !== id); return persist(name); },

    /* ---- domain helpers ---- */
    overlaps(aStart, aEnd, bStart, bEnd) { return aStart <= bEnd && bStart <= aEnd; },
    holdsBikes(b) { return b.status === 'approved' || b.status === 'pending'; },
    busyBikeIds(start, end, exceptBookingId) {
      const busy = new Set();
      state.bookings.forEach((b) => {
        if (b.id === exceptBookingId || !Data.holdsBikes(b)) return;
        if (Data.overlaps(start, end, b.start, b.end)) b.bikeIds.forEach((id) => busy.add(id));
      });
      return busy;
    },
    freeBikes(start, end, exceptBookingId) {
      const busy = Data.busyBikeIds(start, end, exceptBookingId);
      return state.bikes.filter((b) => !busy.has(b.id));
    },
    days(start, end) { return Math.round((new Date(end + 'T12:00:00') - new Date(start + 'T12:00:00')) / 86400000) + 1; },
    quote(nBikes, start, end) {
      const s = state.settings, days = Data.days(start, end);
      const total = Math.round(nBikes * days * s.pricePerBikeDay * 100) / 100;
      const deposit = Math.round(total * (s.depositPct / 100) * 100) / 100;
      return { days, total, deposit, pricePerDay: s.pricePerBikeDay, depositPct: s.depositPct };
    },
    /* v3 checkout: printing & setup (one time, per bike) + weekly charge (per bike per week). */
    weeks(start, end) { return Math.max(1, Math.ceil(Data.days(start, end) / 7)); },
    /* Checkout price (Nov 8 2026): printing & setup (one time, per bike) + weekly charge (per bike per week),
     * minus discounts from the admin price table (Admin → Settings → Prices & discounts), then the deposit due now
     * (settings.depositPct, default 20%) and the balance due later.
     * Discount rules (collection 'discounts'): { kind: 'bikes'|'weeks'|'promo'|'client', min, code, clientId, clientEmail, pct, label, active }.
     * For each kind the best matching rule counts; the percents add up (capped at 90%) and apply to the subtotal.
     * opts: { promo: rule already checked (from Data.findPromo or the database), client: { id, email } } */
    priceQuote(nBikes, start, end, opts) {
      opts = opts || {};
      const s = state.settings, n = Math.max(0, nBikes | 0);
      const days = Data.days(start, end), weeks = Data.weeks(start, end);
      const setupEach = +s.setupFeePerBike || 0, weeklyEach = +s.weeklyPerBike || 0;
      const r2 = (x) => Math.round(x * 100) / 100;
      const setup = r2(n * setupEach), weekly = r2(n * weeklyEach * weeks), subtotal = r2(setup + weekly);
      const rules = (state.discounts || []).filter((r) => r && r.active !== false && +r.pct > 0);
      const best = (list) => list.sort((a, b) => (+b.pct) - (+a.pct))[0] || null;
      const cl = opts.client || {};
      const picks = [
        best(rules.filter((r) => r.kind === 'bikes' && n >= (+r.min || 0))),
        best(rules.filter((r) => r.kind === 'weeks' && weeks >= (+r.min || 0))),
        best(rules.filter((r) => r.kind === 'client' && ((cl.id && r.clientId === cl.id) || (cl.email && r.clientEmail && r.clientEmail.toLowerCase() === String(cl.email).toLowerCase())))),
        opts.promo && opts.promo.active !== false && +opts.promo.pct > 0 ? opts.promo : null
      ].filter(Boolean);
      let pctSum = 0;
      const discounts = picks.map((r) => {
        const pct = Math.max(0, Math.min(90 - pctSum, +r.pct)); pctSum += pct;
        const label = r.label || (r.kind === 'bikes' ? (+r.min) + '+ bikes' : r.kind === 'weeks' ? (+r.min) + '+ weeks' : r.kind === 'promo' ? 'Promo code ' + (r.code || '') : 'Your client discount');
        return { id: r.id, kind: r.kind, label, pct, amount: r2(subtotal * pct / 100) };
      }).filter((x) => x.pct > 0);
      const discount = r2(discounts.reduce((a, x) => a + x.amount, 0));
      const total = r2(subtotal - discount);
      const depositPct = Math.max(0, Math.min(100, s.depositPct == null ? 20 : +s.depositPct));
      const deposit = r2(total * depositPct / 100);
      return { bikes: n, days, weeks, setupEach, weeklyEach, setup, weeklyPerWeek: r2(n * weeklyEach), weekly, subtotal, discounts, discount, total,
        depositPct, deposit, balance: r2(total - deposit), samples: !!s.pricesAreSamples };
    },
    /* This-device mode: find an active promo code rule (in database mode the database checks codes: Auth.checkPromo). */
    findPromo(code) {
      const c = String(code || '').trim().toLowerCase(); if (!c) return null;
      return (state.discounts || []).find((r) => r.kind === 'promo' && r.active !== false && String(r.code || '').trim().toLowerCase() === c) || null;
    },
    SAMPLE_PRICES,
    bike(id) { return Data.get('bikes', id); },
    bikeLabel(id) { const b = Data.get('bikes', id); return b ? '#' + b.number : '?'; }
  };

  window.Data = Data;
  window.BikeAdsSeed = seed;
  window.DataLocalAdapter = LocalAdapter;
})();
