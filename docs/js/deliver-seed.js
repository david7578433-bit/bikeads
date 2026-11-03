/* BikeAds Deliver — demo data: 2 stores, 3 drivers, a boss, today's ~25 orders,
 * and a few past days of delivered orders (with proof) for history and invoices.
 * Data.init() calls DeliverSeed.addTo() once; it only adds, never removes. */
(function () {
  'use strict';

  const KJ = [["14 Forest Rd, Monroe, NY 10950", 41.338764, -74.171452], ["7 Bakertown Rd, Monroe, NY 10950", 41.331762, -74.163008], ["22 Garfield Rd, Monroe, NY 10950", 41.341112, -74.168796], ["3 Dinev Rd, Monroe, NY 10950", 41.33753, -74.158534], ["9 Mountain Rd, Monroe, NY 10950", 41.34777, -74.169482], ["31 Acres Rd, Monroe, NY 10950", 41.344211, -74.163113], ["5 Quickway Rd, Monroe, NY 10950", 41.33561, -74.171621], ["12 Satmar Dr, Monroe, NY 10950", 41.344856, -74.167097], ["18 Lizensk Blvd, Monroe, NY 10950", 41.344556, -74.169897], ["4 Seven Springs Rd, Monroe, NY 10950", 41.351189, -74.172795], ["27 Schunnemunk Rd, Monroe, NY 10950", 41.343321, -74.17191], ["8 Prag Blvd, Monroe, NY 10950", 41.334729, -74.166689], ["16 Raywood Dr, Monroe, NY 10950", 41.34452, -74.177622], ["11 Hayes Ct, Monroe, NY 10950", 41.344366, -74.165465]];
  const WB = [["152 Lee Ave, Brooklyn, NY 11211", 40.7031495, -73.9573333], ["98 Division Ave, Brooklyn, NY 11211", 40.7075033, -73.9639716], ["210 Ross St, Brooklyn, NY 11211", 40.7065062, -73.9588788], ["175 Wilson St, Brooklyn, NY 11211", 40.7066902, -73.9605854], ["60 Rodney St, Brooklyn, NY 11249", 40.7024271, -73.9638135], ["255 Keap St, Brooklyn, NY 11211", 40.7072615, -73.9557946], ["133 Hooper St, Brooklyn, NY 11211", 40.7038351, -73.95915], ["170 Hewes St, Brooklyn, NY 11211", 40.7033591, -73.9576022], ["480 Marcy Ave, Brooklyn, NY 11206", 40.6986963, -73.9499795], ["95 Wallabout St, Brooklyn, NY 11249", 40.69966, -73.958012], ["66 Heyward St, Brooklyn, NY 11206", 40.7009112, -73.9571102], ["120 Rutledge St, Brooklyn, NY 11211", 40.7014641, -73.9577552], ["40 Penn St, Brooklyn, NY 11249", 40.7005964, -73.9606529], ["128 Taylor St, Brooklyn, NY 11211", 40.7054076, -73.9637094], ["560 Bedford Ave, Brooklyn, NY 11249", 40.704542, -73.961722], ["185 Clymer St, Brooklyn, NY 11211", 40.7074342, -73.9625066]];
  const KJ_NAMES = ['M. Friedman', 'Y. Schwartz', 'C. Gross', 'A. Weiss', 'S. Landau', 'B. Teitelbaum', 'R. Hirsch', 'L. Brach', 'D. Lowy', 'Z. Klein', 'E. Rosenberg', 'J. Meisels', 'P. Grunwald', 'H. Waldman'];
  const WB_NAMES = ['N. Kohn', 'M. Spitzer', 'T. Gottlieb', 'S. Herskovic', 'Y. Fried', 'A. Wieder', 'G. Halberstam', 'K. Lefkowitz', 'B. Stern', 'R. Feldman', 'Y. Mermelstein', 'C. Deutsch', 'M. Jacobowitz', 'S. Goldberger', 'L. Rubin', 'D. Neuman'];
  const NOTES = ['', 'Ring bell twice', '', 'Side door, not front', 'Call when downstairs', '', 'Leave with neighbor in #2 if not home', '', 'Elevator is slow — 4th floor', 'Fragile: eggs on top', '', 'Basement entrance'];
  const WINDOWS = [['12:00', '14:00'], ['13:00', '15:00'], ['14:00', '16:00'], ['15:00', '17:00'], ['16:00', '18:00'], ['17:00', '19:00']];

  /* Drawn demo "photo" and signature, so past deliveries show what proof looks like. */
  const DEMO_PHOTO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240"><rect width="320" height="240" fill="#d9d4cc"/><rect x="110" y="30" width="100" height="190" rx="4" fill="#7c5a3c"/><circle cx="195" cy="128" r="5" fill="#e3c27a"/><rect x="40" y="165" width="70" height="55" fill="#c79a5b" stroke="#8a6232" stroke-width="3"/><path d="M40 182h70" stroke="#8a6232" stroke-width="3"/><rect x="225" y="178" width="60" height="42" fill="#f4f1ea" stroke="#9ca3af" stroke-width="3"/><rect x="0" y="220" width="320" height="20" fill="#9a958d"/><text x="160" y="18" font-family="Arial" font-size="12" fill="#6b7280" text-anchor="middle">demo photo</text></svg>');
  function demoSignature(seed) {
    let x = 20, y = 60, d = 'M' + x + ' ' + y;
    for (let i = 0; i < 9; i++) {
      const nx = x + 18 + ((seed * (i + 3)) % 9), ny = 30 + ((seed * 7 + i * 13) % 50);
      d += ' Q' + (x + 6) + ' ' + (ny - 25) + ' ' + nx + ' ' + ny; x = nx;
    }
    return 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="260" height="100" viewBox="0 0 260 100"><path d="' + d + '" fill="none" stroke="#111827" stroke-width="3" stroke-linecap="round"/><path d="M15 88h230" stroke="#cbd5e1"/></svg>');
  }

  /* Delivery windows for today's sample orders start an hour from now, so the demo always looks live. */
  function freshWindows() {
    const now = new Date();
    let s = Math.min(Math.max(now.getHours() + 1, 9), 21);
    const hh = (x) => String(Math.min(x, 23)).padStart(2, '0') + ':00';
    return [[s, s + 5], [s, s + 5], [s, s + 3], [s, s + 5], [s + 2, s + 5], [s, s + 5]].map(([a, b]) => [hh(Math.min(a, 22)), hh(Math.max(b, Math.min(a, 22) + 1))]);
  }

  function todayOrders(st, h, stores) {
    const t = h.today(), wins = freshWindows(), out = [];
    let code = st.orders.reduce((m, o) => Math.max(m, parseInt(String(o.code).replace(/\D/g, ''), 10) || 0), 1000) + 1;
    const mk = (store, i, a, names, areaCode) => {
      const w = wins[i % wins.length], cash = i % 3 === 0, card = i % 5 === 1;
      const amount = cash || card ? Math.round((38 + ((i * 37) % 160)) * 100 + ((i * 29) % 100)) / 100 : 0;
      out.push({
        id: 'ord_' + code + '_' + t.replace(/-/g, ''), code: 'BD-' + (code++), storeId: store.id, date: t, demo: true,
        ref: 'R-' + (55000 + i * 17 + code % 97), customer: names[i % names.length], address: a[0], lat: a[1], lng: a[2], approx: false,
        phone: '(' + areaCode + ') 555-01' + String(50 + (i % 49)).padStart(2, '0'), bags: 1 + ((i * 3) % 4), amount,
        payType: cash ? 'cash' : card ? 'card' : 'prepaid', notes: NOTES[i % NOTES.length], windowStart: w[0], windowEnd: w[1],
        status: 'new', driverId: '', seq: 0, eta: null, scanned: [],
        events: [{ at: new Date().toISOString(), by: store.contact, text: 'Order added by the store' }], createdAt: new Date().toISOString()
      });
    };
    KJ.forEach((a, i) => mk(stores[0], i, a, KJ_NAMES, '845'));
    WB.slice(0, 11).forEach((a, i) => mk(stores[1], i, a, WB_NAMES, '718'));
    return out;
  }

  /* A new day in the demo: yesterday's untouched sample orders go away and 25 fresh ones arrive. */
  function rollDay(st, h) {
    const d = st.settings && st.settings.deliver;
    if (!d || d.demoDay === h.today()) return false;
    const stores = ['st_kj', 'st_wb'].map((id) => st.stores.find((s) => s.id === id));
    if (stores.some((s) => !s)) return false;
    st.orders = st.orders.filter((o) => !(o.demo && o.date < h.today() && o.status === 'new'));
    if (!st.orders.some((o) => o.date === h.today())) todayOrders(st, h, stores).forEach((o) => st.orders.push(o));
    st.drivers.forEach((x) => { if (x.onShift && x.shiftDate && x.shiftDate !== h.today()) x.onShift = false; });
    d.demoDay = h.today();
    return true;
  }

  function addTo(st, h) {
    const t = h.today();
    ['stores', 'drivers', 'orders', 'smslog', 'shifts', 'invoices', 'payouts'].forEach((c) => { if (!Array.isArray(st[c])) st[c] = []; });
    st.settings.deliver = {
      name: 'BikeAds Deliver',
      plugins: { driver: true, store: true, boss: true },
      pricePerDelivery: 7, bagsIncluded: 3, extraBagPrice: 1, failedCharge: 3,
      driverPayPerStop: 4, driverPayFailed: 2,
      speedKmh: 14, minutesPerStop: 4, detour: 1.35, routeStart: '12:30',
      textingNumber: '',
      templates: {
        onTheWay: 'Hi {customer}, your {store} order ({code}) is on the way with {driver}. Arriving around {eta}.',
        nextStop: '{driver} is coming to you next with your {store} order. About {minutes} min.',
        delivered: 'Delivered: your {store} order {code} was left at {time}. Thank you!',
        failed: 'We could not deliver your {store} order {code} ({reason}). The store will call you to set a new time.'
      },
      seededAt: new Date().toISOString()
    };

    const stores = [
      { id: 'st_kj', name: 'Bakertown Fresh Market', address: '2 Bakertown Rd, Monroe, NY 10950', lat: 41.3326, lng: -74.1641, locationId: 'loc_monroe', phone: '(845) 555-0110', contact: 'Mendy Berger', pricePerDelivery: 6, active: true },
      { id: 'st_wb', name: 'Lee Ave Grocery', address: '190 Lee Ave, Brooklyn, NY 11211', lat: 40.7041, lng: -73.9578, locationId: 'loc_wburg', phone: '(718) 555-0120', contact: 'Lipa Rosen', pricePerDelivery: 7, active: true }
    ];
    const drivers = [
      { id: 'dr_1', name: 'Yoel Stern', phone: '(845) 555-0141', locationId: 'loc_monroe', bikeId: 'bike_05', vehicle: 'E-bike with cargo box', payPerStop: 4, active: true, onShift: false },
      { id: 'dr_2', name: 'Shimon Gold', phone: '(845) 555-0142', locationId: 'loc_monroe', bikeId: 'bike_06', vehicle: 'E-bike with cargo box', payPerStop: 4, active: true, onShift: false },
      { id: 'dr_3', name: 'Avrum Fish', phone: '(718) 555-0143', locationId: 'loc_wburg', bikeId: 'bike_01', vehicle: 'Cargo bike', payPerStop: 4, active: true, onShift: false }
    ];
    const users = [
      { id: 'u_boss', role: 'boss', name: 'Shloime Klein', company: 'BikeAds Deliver', email: 'boss@bikeads.demo', password: 'boss123' },
      { id: 'u_store1', role: 'store', name: 'Mendy Berger', company: stores[0].name, storeId: 'st_kj', email: 'store@bikeads.demo', password: 'store123' },
      { id: 'u_store2', role: 'store', name: 'Lipa Rosen', company: stores[1].name, storeId: 'st_wb', email: 'store2@bikeads.demo', password: 'store123' },
      { id: 'u_dr1', role: 'driver', name: 'Yoel Stern', driverId: 'dr_1', email: 'driver@bikeads.demo', password: 'driver123' },
      { id: 'u_dr2', role: 'driver', name: 'Shimon Gold', driverId: 'dr_2', email: 'driver2@bikeads.demo', password: 'driver123' },
      { id: 'u_dr3', role: 'driver', name: 'Avrum Fish', driverId: 'dr_3', email: 'driver3@bikeads.demo', password: 'driver123' }
    ];
    drivers.forEach((d) => { d.userId = users.find((u) => u.driverId === d.id).id; });
    users.forEach((u) => { if (!st.users.some((x) => x.email === u.email || x.id === u.id)) st.users.push(u); });
    stores.forEach((s) => { if (!st.stores.some((x) => x.id === s.id)) st.stores.push(s); });
    drivers.forEach((d) => { if (!st.drivers.some((x) => x.id === d.id)) st.drivers.push(d); });

    let code = 1001;
    const mkOrder = (store, i, addr, names, date, k) => {
      const w = WINDOWS[(i + k) % WINDOWS.length];
      const cash = (i + k) % 3 === 0, card = (i + k) % 5 === 1;
      const amount = cash || card ? Math.round((38 + ((i * 37 + k * 11) % 160)) * 100 + ((i * 29) % 100)) / 100 : 0;
      const areaCode = store.id === 'st_kj' ? '845' : '718';
      return {
        id: 'ord_' + code, code: 'BD-' + (code++), storeId: store.id, date,
        ref: 'R-' + (55000 + i * 17 + k * 101),
        customer: names[(i + k) % names.length], address: addr[0], lat: addr[1], lng: addr[2], approx: false,
        phone: '(' + areaCode + ') 555-01' + String(50 + ((i + k) % 49)).padStart(2, '0'),
        bags: 1 + ((i * 3 + k) % 4), amount, payType: cash ? 'cash' : card ? 'card' : 'prepaid',
        notes: NOTES[(i + k) % NOTES.length], windowStart: w[0], windowEnd: w[1],
        status: 'new', driverId: '', seq: 0, eta: null, scanned: [],
        events: [{ at: new Date(date + 'T09:' + String(10 + (i % 40)).padStart(2, '0') + ':00').toISOString(), by: store.contact, text: 'Order added by the store' }],
        createdAt: new Date(date + 'T09:00:00').toISOString()
      };
    };

    /* Past days (skip Shabbos), delivered with proof, so history, invoices and pay have data. */
    const past = [];
    for (let back = 1, made = 0; made < 5 && back < 12; back++) {
      const date = h.addDays(t, -back);
      if (new Date(date + 'T12:00:00').getDay() === 6) continue;
      made++;
      [[stores[0], KJ, KJ_NAMES, ['dr_1', 'dr_2']], [stores[1], WB, WB_NAMES, ['dr_3']]].forEach(([store, addrs, names, team]) => {
        for (let i = 0; i < 6; i++) {
          const o = mkOrder(store, i, addrs[(i * 5 + back * 3) % addrs.length], names, date, back);
          const failed = (i + back) % 11 === 0;
          const driverId = team[i % team.length], driver = drivers.find((d) => d.id === driverId);
          const doneAt = new Date(date + 'T' + String(13 + Math.floor(i / 2)).padStart(2, '0') + ':' + String((i * 17 + back * 7) % 60).padStart(2, '0') + ':00');
          o.driverId = driverId; o.seq = i + 1; o.eta = doneAt.getTime() - 5 * 60000;
          o.scanned = Array.from({ length: o.bags }, (_, n) => o.code + '-' + (n + 1));
          if (failed) {
            o.status = 'failed'; o.failReason = 'No one home';
            o.events.push({ at: doneAt.toISOString(), by: driver.name, text: 'Failed: No one home' });
          } else {
            o.status = 'delivered';
            o.proof = { at: doneAt.toISOString(), by: driver.name, photo: DEMO_PHOTO, signature: demoSignature(i + back * 3), signedBy: o.customer, collected: o.payType === 'prepaid' ? 0 : o.amount, method: o.payType === 'prepaid' ? 'none' : o.payType, lat: o.lat, lng: o.lng, note: '' };
            o.events.push({ at: doneAt.toISOString(), by: driver.name, text: 'Delivered' });
          }
          past.push(o);
        }
      });
    }

    /* Today: 14 orders for the Monroe store, 11 for the Williamsburg store, waiting for routes. */
    past.forEach((o) => { if (!st.orders.some((x) => x.id === o.id)) st.orders.push(o); });
    todayOrders(st, h, stores).forEach((o) => st.orders.push(o));
    st.settings.deliver.demoDay = t;

    /* A few "would send" texts from the last day, so the log is not empty. */
    past.filter((o) => o.status === 'delivered').slice(-3).forEach((o) => {
      const s = stores.find((x) => x.id === o.storeId);
      st.smslog.push({ id: h.uid('sms'), at: o.proof.at, orderId: o.id, to: o.phone, kind: 'delivered', status: 'would send',
        text: 'Delivered: your ' + s.name + ' order ' + o.code + ' was left at ' + new Date(o.proof.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + '. Thank you!' });
    });
    if (!st.transactions.some((x) => x.category === 'Delivery income')) {
      st.transactions.push({ id: h.uid('tx'), date: h.addDays(t, -6), description: 'Cargo boxes for 3 delivery bikes', amount: -210, category: 'Equipment', bookingId: '', reconciled: false, createdAt: new Date().toISOString() });
    }
    return st;
  }

  window.DeliverSeed = { addTo, rollDay, DEMO_PHOTO, demoSignature };
})();
