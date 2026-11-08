/* TEST FIXTURE ONLY (not shipped in docs/): the old demo data set that the site seeded until Nov 8 2026
 * (fake clients, bookings, transactions, 12 bikes, and — through DeliverSeed.addTo — demo stores, drivers, orders
 * and logins). The live site no longer seeds any of it ("take down all test members", David, Nov 8 2026);
 * the logic tests still use it so the booking, money and delivery code keeps being checked against a full set.
 * use(ctx): call after js/data.js (and js/deliver-seed.js) ran in the vm context, before Data.init(). */
const KEY = 'mow.prod.v2';
const SRC = function (Data, DS) {
  const { uid, iso, addDays, today, SAMPLE_PRICES } = Data;
  const pad = (n) => String(n).padStart(2, '0');
  function addDeliver(st) { if (!DS || (st.settings && st.settings.deliver)) return false; DS.addTo(st, { uid, iso, addDays, today }); return true; }
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
      { id: 'u_admin', role: 'admin', name: 'David Klar', company: 'Media on Wheels', email: 'admin@bikeads.demo', password: 'admin123' },
      { id: 'u_c1', role: 'client', name: 'Moshe Weiss', company: advertisers[0], email: 'client@bikeads.demo', password: 'client123', phone: '' },
      { id: 'u_c2', role: 'client', name: 'Shmuel Green', company: advertisers[1], email: 'sara@quickmove.demo', password: 'client123', phone: '' },
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
      settings: { businessName: 'Media on Wheels', pricePerBikeDay: price, depositPct: 20, openingBalance: 0, seededAt: new Date().toISOString(), version: 1, setupFeePerBike: SAMPLE_PRICES.setupFeePerBike, weeklyPerBike: SAMPLE_PRICES.weeklyPerBike, pricesAreSamples: true }
    };
    addDeliver(base);
    return base;
  }

  return seed();
};
function build(ctx) {
  const w = ctx.window || ctx;
  return SRC(w.Data, w.DeliverSeed || null);
}
function use(ctx) {
  const st = build(ctx);
  ctx.localStorage.setItem(KEY, JSON.stringify(st));
  return st;
}
module.exports = { use, build, KEY };
