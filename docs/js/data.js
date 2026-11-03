/* BikeAds data layer.
 * Every read and write in the app goes through `Data`. v1 keeps everything in this
 * browser (localStorage) via LocalAdapter, so the demo works with no server.
 * To share data between devices, write a RemoteAdapter with the same three methods
 * (loadAll, saveCollection, clearAll) that talks to a real database/API, and pass it
 * to Data.init(). Nothing else in the app has to change.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'bikeads.v1';
  const COLLECTIONS = ['users', 'locations', 'bikes', 'bookings', 'transactions', 'reconciliations',
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

  const uid = (p) => (p || 'id') + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
  const today = () => iso(new Date());

  function seed() {
    const t = today();
    const locations = [
      { id: 'loc_wburg', name: 'Williamsburg', lat: 40.7081, lng: -73.9571, zoom: 15 },
      { id: 'loc_monroe', name: 'Monroe / KJ', lat: 41.3410, lng: -74.1690, zoom: 15 },
      { id: 'loc_bpark', name: 'Borough Park', lat: 40.6337, lng: -73.9965, zoom: 15 },
      { id: 'loc_lakewood', name: 'Lakewood', lat: 40.0821, lng: -74.2097, zoom: 15 },
      { id: 'loc_monsey', name: 'Monsey', lat: 41.1112, lng: -74.0685, zoom: 15 }
    ];
    const advertisers = ['Fresh Basket Grocery', 'QuickMove Movers', 'Bright Smile Dental'];
    const marketers = ['Hudson Media Group', 'Brooklyn Ad Works', 'Hudson Media Group'];
    const users = [
      { id: 'u_admin', role: 'admin', name: 'David Klar', company: 'BikeAds', email: 'admin@bikeads.demo', password: 'admin123' },
      { id: 'u_c1', role: 'client', name: 'Moshe Weiss', company: advertisers[0], email: 'client@bikeads.demo', password: 'client123', phone: '' },
      { id: 'u_c2', role: 'client', name: 'Sara Green', company: advertisers[1], email: 'sara@quickmove.demo', password: 'client123', phone: '' },
      { id: 'u_c3', role: 'client', name: 'Yossi Katz', company: advertisers[2], email: 'yossi@brightsmile.demo', password: 'client123', phone: '' }
    ];
    // 12 bikes: 4 Williamsburg, 4 Monroe/KJ, 2 Borough Park, 1 Lakewood, 1 Monsey
    const plan = ['loc_wburg', 'loc_wburg', 'loc_wburg', 'loc_wburg', 'loc_monroe', 'loc_monroe', 'loc_monroe', 'loc_monroe', 'loc_bpark', 'loc_bpark', 'loc_lakewood', 'loc_monsey'];
    const bikes = plan.map((locId, i) => {
      const loc = locations.find((l) => l.id === locId);
      const a = i % 3;
      const ang = (i * 137) * Math.PI / 180, r = 0.0025 + (i % 4) * 0.0012;
      return {
        id: 'bike_' + pad(i + 1),
        number: String(i + 1).padStart(2, '0'),
        trackerId: '864512040' + String(318200 + i * 37),
        locationId: locId,
        advertiser: advertisers[a],
        marketing: marketers[a],
        notes: '',
        position: { lat: loc.lat + Math.sin(ang) * r, lng: loc.lng + Math.cos(ang) * r * 1.3, at: new Date().toISOString(), source: 'sim' }
      };
    });
    const price = 25;
    const mk = (id, client, start, days, bikeIds, status, mode) => {
      const end = addDays(start, days - 1);
      const total = bikeIds.length * days * price;
      const by = users.find((u) => u.id === client);
      return {
        id, clientId: client, clientName: by.name, company: by.company,
        start, end, bikeIds, mode: mode || 'specific', pricePerDay: price,
        total, deposit: Math.round(total * 0.2 * 100) / 100, depositPaid: true,
        status, notes: '', createdAt: new Date(start + 'T09:00:00').toISOString(),
        history: [{ at: new Date(start + 'T09:00:00').toISOString(), by: by.name, action: 'Requested' }]
          .concat(status === 'pending' ? [] : [{ at: new Date(start + 'T11:00:00').toISOString(), by: 'David Klar', action: status === 'declined' ? 'Declined' : 'Approved' }])
      };
    };
    const bookings = [
      mk('bk_1001', 'u_c1', addDays(t, -40), 14, ['bike_01', 'bike_02', 'bike_03', 'bike_04'], 'completed'),
      mk('bk_1002', 'u_c2', addDays(t, -20), 10, ['bike_05', 'bike_06'], 'completed'),
      mk('bk_1003', 'u_c3', addDays(t, -3), 7, ['bike_09', 'bike_10'], 'approved'),
      mk('bk_1004', 'u_c1', addDays(t, 2), 5, ['bike_01', 'bike_02', 'bike_03', 'bike_04', 'bike_05'], 'approved', 'any5'),
      mk('bk_1005', 'u_c2', addDays(t, 6), 7, ['bike_05', 'bike_06', 'bike_07', 'bike_08'], 'pending'),
      mk('bk_1006', 'u_c3', addDays(t, 12), 3, ['bike_11', 'bike_12'], 'pending')
    ];
    bookings[1].history.push({ at: new Date(addDays(t, -10) + 'T12:00:00').toISOString(), by: 'system', action: 'Completed' });
    bookings[0].history.push({ at: new Date(addDays(t, -26) + 'T12:00:00').toISOString(), by: 'system', action: 'Completed' });
    const tx = (date, description, amount, category, bookingId, reconciled) => ({ id: uid('tx'), date, description, amount, category, bookingId: bookingId || '', reconciled: !!reconciled, createdAt: new Date().toISOString() });
    const transactions = [
      tx(addDays(t, -45), 'Opening deposit', 5000, 'Owner investment', '', true),
      tx(addDays(t, -42), 'GPS trackers x12', -660, 'Equipment', '', true),
      tx(addDays(t, -41), 'Deposit 20% - Fresh Basket Grocery', 280, 'Booking deposit', 'bk_1001', true),
      tx(addDays(t, -38), 'Bike ad frames and printing', -540, 'Printing', '', true),
      tx(addDays(t, -27), 'Balance - Fresh Basket Grocery', 1120, 'Booking payment', 'bk_1001', true),
      tx(addDays(t, -21), 'Deposit 20% - QuickMove Movers', 100, 'Booking deposit', 'bk_1002', true),
      tx(addDays(t, -15), 'Tracker data plans (monthly)', -96, 'Subscriptions', '', true),
      tx(addDays(t, -9), 'Balance - QuickMove Movers', 400, 'Booking payment', 'bk_1002', false),
      tx(addDays(t, -4), 'Deposit 20% - Bright Smile Dental', 70, 'Booking deposit', 'bk_1003', false),
      tx(addDays(t, -2), 'Bike repair - flat tires', -45, 'Maintenance', '', false),
      tx(addDays(t, -1), 'Deposit 20% - Fresh Basket Grocery', 125, 'Booking deposit', 'bk_1004', false)
    ];
    const base = {
      users, locations, bikes, bookings, transactions, reconciliations: [],
      settings: { businessName: 'BikeAds', pricePerBikeDay: price, depositPct: 20, openingBalance: 0, seededAt: new Date().toISOString(), version: 1 }
    };
    addDeliver(base);
    return base;
  }

  /* BikeAds Deliver: add its demo data (stores, drivers, orders...) next to the bike-ad data.
   * Also runs once for a browser that already has v1 data, so nothing there is lost. */
  function addDeliver(st) {
    const DS = (typeof window !== 'undefined' && window.DeliverSeed) || null;
    if (!DS || (st.settings && st.settings.deliver)) return false;
    DS.addTo(st, { uid, iso, addDays, today });
    return true;
  }

  let state = null;
  let adapter = LocalAdapter;
  const listeners = new Set();

  async function persist(name) {
    try { await adapter.saveCollection(name, state); } catch (e) { console.error('save failed', e); if (typeof window !== 'undefined' && window.UI && window.UI.toast) window.UI.toast('Could not save: this device\'s storage is full.'); }
    listeners.forEach((fn) => { try { fn(name); } catch (e) { console.error(e); } });
  }

  const Data = {
    uid, iso, addDays, today,
    async init(customAdapter) {
      if (customAdapter) adapter = customAdapter;
      state = await adapter.loadAll();
      if (!state || !state.settings || state.settings.version !== 1) { state = seed(); await persist('all'); }
      COLLECTIONS.forEach((c) => { if (!Array.isArray(state[c])) state[c] = []; });
      if (addDeliver(state)) await persist('all');
      else if (typeof window !== 'undefined' && window.DeliverSeed && window.DeliverSeed.rollDay(state, { uid, iso, addDays, today })) await persist('all');
      return Data;
    },
    async reset() { await adapter.clearAll(); state = seed(); await persist('all'); },
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
    bike(id) { return Data.get('bikes', id); },
    bikeLabel(id) { const b = Data.get('bikes', id); return b ? '#' + b.number : '?'; }
  };

  window.Data = Data;
  window.BikeAdsSeed = seed;
})();
