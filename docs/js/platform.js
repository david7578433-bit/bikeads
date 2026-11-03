/* BikeAds Deliver — ADMIN plugin (David, platform owner). Adds a "Deliver" tab to the
 * existing admin: overview of everything, stores, drivers, users and roles, prices and
 * settings, plugins on/off, customer text templates + log, and the "connect later" list. */
(function () {
  'use strict';
  const { esc, money, fmtDate, ago, $, $$, toast, modal, closeModal, confirmBox } = UI;
  let mapCtl = null;
  const view = { status: '', store: '', area: null };
  const SECTIONS = [['overview', 'Overview'], ['orders', 'All orders'], ['stores', 'Stores'], ['drivers', 'Drivers'], ['users', 'Users & roles'], ['settings', 'Prices & settings'], ['plugins', 'Plugins'], ['texts', 'Customer texts'], ['connect', 'Connect later']];
  function teardown() { if (mapCtl) { mapCtl.destroy(); mapCtl = null; } }
  const ROLE = { admin: 'Admin', client: 'Ad client', boss: 'Boss / dispatcher', store: 'Store', driver: 'Driver' };

  function render(root, user, rest) {
    const sec = SECTIONS.some((s) => s[0] === rest[0]) ? rest[0] : 'overview';
    root.innerHTML = '<div class="page wide"><div class="page-head"><div><h1>' + esc(Deliver.settings().name || 'BikeAds Deliver') + '</h1><p class="muted">Delivery plugins: Driver, Store, Boss and this Admin page.</p></div></div>' + DUI.sectionNav(SECTIONS, sec, '#/admin/deliver/') + '<div id="psec"></div></div>';
    const el = $('#psec', root);
    ({ overview, orders, stores, drivers, users, settings, plugins, texts, connect })[sec](el, user);
  }

  function overview(el, user) {
    const t = Data.today(), s = Deliver.summary(t, t);
    if (!view.area) view.area = DUI.busiestArea(t);
    const wk = Deliver.summary(Data.addDays(t, -6), t);
    el.innerHTML = '<div class="stats">' + DUI.stat('Orders today', s.totals.orders) + DUI.stat('Delivered', s.totals.delivered, 'good') + DUI.stat('Failed', s.totals.failed, s.totals.failed ? 'bad' : '') + DUI.stat('Late', s.totals.late, s.totals.late ? 'bad' : '') + DUI.stat('Charges, 7 days', money(wk.totals.charges)) + DUI.stat('Driver pay, 7 days', money(wk.totals.pay)) + '</div>' +
      '<div class="split"><section class="card map-card"><div class="row-between mb"><h2>Live map</h2><div class="chips">' + Array.from(new Set(Deliver.stores().map((x) => x.locationId))).map((id) => Data.get('locations', id)).filter(Boolean).map((l) => '<button class="chip' + (view.area === l.id ? ' on' : '') + '" data-marea="' + l.id + '">' + esc(l.name) + '</button>').join('') + '</div></div><div id="amap" class="map small-map"></div></section>' +
      '<section class="card"><h2>Open a plugin</h2><p class="muted small">See exactly what each person sees. A bar at the top brings you back.</p><div class="btn-grid two">' +
      [['u_boss', '👔 Boss / dispatch'], ['u_store1', '🏪 Store (Monroe)'], ['u_store2', '🏪 Store (Williamsburg)'], ['u_dr1', '🚴 Driver Yoel'], ['u_dr2', '🚴 Driver Shimon'], ['u_dr3', '🚴 Driver Avrum']].filter(([id]) => Data.get('users', id)).map(([id, l]) => '<button class="btn big" data-as="' + id + '">' + l + '</button>').join('') +
      '</div><h3 class="mt">Plugins</h3><ul class="plain">' + ['driver', 'store', 'boss'].map((p) => '<li>' + (Deliver.pluginOn(p) ? '🟢' : '⚪') + ' ' + esc(ROLE[p]) + ' plugin ' + (Deliver.pluginOn(p) ? 'on' : 'off') + '</li>').join('') + '</ul><a href="#/admin/deliver/plugins" class="small">Change</a>' +
      '<h3 class="mt">Today per store</h3><ul class="plain">' + Deliver.stores(true).map((st) => { const r = s.byStore[st.id] || { orders: 0, delivered: 0 }; return '<li>' + esc(st.name) + ': ' + r.delivered + ' of ' + r.orders + ' delivered</li>'; }).join('') + '</ul></section></div>';
    $$('[data-as]', el).forEach((b) => b.addEventListener('click', () => App.viewAs(b.getAttribute('data-as'))));
    $$('[data-marea]', el).forEach((b) => b.addEventListener('click', () => { view.area = b.getAttribute('data-marea'); App.render(); }));
    mapCtl = DUI.routeMap($('#amap', el), { area: view.area, onStop: (id) => DUI.orderModal(Data.get('orders', id)) });
  }

  function orders(el) {
    const list = Deliver.orders().filter((o) => (!view.status || o.status === view.status) && (!view.store || o.storeId === view.store)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.code < b.code ? 1 : -1)).slice(0, 200);
    el.innerHTML = '<div class="form-row"><select class="select" id="fst"><option value="">All stores</option>' + Deliver.stores(true).map((s) => '<option value="' + s.id + '"' + (view.store === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select><select class="select" id="fss"><option value="">Every status</option>' + Object.keys(Deliver.STATUS).map((k) => '<option value="' + k + '"' + (view.status === k ? ' selected' : '') + '>' + Deliver.STATUS[k] + '</option>').join('') + '</select></div>' +
      '<section class="card"><div class="dtw"><table class="tbl click"><thead><tr><th>Date</th><th>Order</th><th>Store</th><th>Customer</th><th>Driver</th><th>Status</th><th>Proof</th></tr></thead><tbody>' +
      list.map((o) => '<tr data-o="' + o.id + '" tabindex="0"><td>' + esc(fmtDate(o.date, { month: 'short', day: 'numeric' })) + '</td><td>' + esc(o.code) + '</td><td>' + esc((Deliver.store(o.storeId) || {}).name || '') + '</td><td>' + esc(o.customer) + '<div class="muted small">' + esc(o.address) + '</div></td><td>' + esc((Deliver.driver(o.driverId) || {}).name || '—') + '</td><td>' + DUI.chip(o) + '</td><td>' + (o.proof ? (o.proof.photo ? '📷 ' : '') + (o.proof.signature ? '✍️ ' : '') + (o.proof.collected ? money(o.proof.collected) : '') : '') + '</td></tr>').join('') +
      '</tbody></table></div>' + (list.length >= 200 ? '<p class="muted small">Showing the newest 200.</p>' : '') + '</section>';
    $('#fst', el).addEventListener('change', (e) => { view.store = e.target.value; App.render(); });
    $('#fss', el).addEventListener('change', (e) => { view.status = e.target.value; App.render(); });
    $$('[data-o]', el).forEach((tr) => { const open = () => { const o = Data.get('orders', tr.getAttribute('data-o')); const m = DUI.orderModal(o, '<p class="mt"><button class="mini" id="fp">Fix pin on the map</button></p>'); m.querySelector('#fp').addEventListener('click', () => DUI.fixPin(o)); }; tr.addEventListener('click', open); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); }); });
  }

  const areaOpts = (sel) => Data.list('locations').map((l) => '<option value="' + l.id + '"' + (l.id === sel ? ' selected' : '') + '>' + esc(l.name) + '</option>').join('');
  function loginFor(kind, key, val) { return Data.list('users').find((u) => u.role === kind && u[key] === val); }

  function stores(el, user) {
    el.innerHTML = '<div class="row-end"><button class="btn primary" id="add-store">+ Add store</button></div><div class="cards">' + Deliver.stores(true).map((s) => {
      const lg = loginFor('store', 'storeId', s.id);
      return '<section class="card"><div class="row-between"><h2>' + esc(s.name) + '</h2><span class="dchip ' + (s.active !== false ? 's-delivered' : 's-new') + '">' + (s.active !== false ? 'Active' : 'Paused') + '</span></div><ul class="dkv"><li><span>Address</span><b>' + esc(s.address) + '</b></li><li><span>Area</span><b>' + esc((Data.get('locations', s.locationId) || {}).name || '') + '</b></li><li><span>Contact</span><b>' + esc(s.contact || '') + ' · ' + esc(s.phone || '') + '</b></li><li><span>Price / delivery</span><b>' + money(Deliver.priceFor(s)) + '</b></li><li><span>Login</span><b>' + (lg ? esc(lg.email) : 'none') + '</b></li></ul><div class="row-end"><button class="btn small-btn" data-edit="' + s.id + '">Edit</button></div></section>';
    }).join('') + '</div>';
    $('#add-store', el).addEventListener('click', () => storeForm(null, user));
    $$('[data-edit]', el).forEach((b) => b.addEventListener('click', () => storeForm(Deliver.store(b.getAttribute('data-edit')), user)));
  }
  function storeForm(s, user) {
    const lg = s ? loginFor('store', 'storeId', s.id) : null;
    const m = modal(s ? 'Edit store' : 'Add store', '<form class="form" id="sf"><label>Store name<input class="input" name="name" required value="' + esc(s ? s.name : '') + '"></label><label>Address (pickup)<input class="input" name="address" required value="' + esc(s ? s.address : '') + '"></label>' +
      '<div class="two"><label>Area<select class="select" name="locationId">' + areaOpts(s ? s.locationId : 'loc_monroe') + '</select></label><label>Price per delivery<input class="input" type="number" step="0.5" min="0" name="price" value="' + (s ? Deliver.priceFor(s) : Deliver.settings().pricePerDelivery) + '"></label></div>' +
      '<div class="two"><label>Contact person<input class="input" name="contact" value="' + esc(s ? s.contact || '' : '') + '"></label><label>Phone<input class="input" type="tel" name="phone" value="' + esc(s ? s.phone || '' : '') + '"></label></div>' +
      '<fieldset><legend>Store login</legend><div class="two"><label>Email<input class="input" type="email" name="email" value="' + esc(lg ? lg.email : '') + '"></label><label>Password<input class="input" name="password" value="' + esc(lg ? lg.password : '') + '"></label></div></fieldset>' +
      '<label class="check"><input type="checkbox" name="active"' + (!s || s.active !== false ? ' checked' : '') + '> Active</label><p class="err" id="serr"></p><div class="row-end"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">Save</button></div></form>');
    $('#sf', m).addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      const email = f.email.value.trim().toLowerCase();
      if (email && Data.list('users').some((u) => u.email.toLowerCase() === email && (!lg || u.id !== lg.id))) { $('#serr', m).textContent = 'That email is already used.'; return; }
      let pos = s ? { lat: s.lat, lng: s.lng } : null;
      if (!s || s.address !== f.address.value.trim()) {
        const loc = Data.get('locations', f.locationId.value);
        const g = await Deliver.geocode(f.address.value.trim(), (Deliver.stores()[0] || {}).id);
        pos = g.approx && loc ? { lat: loc.lat, lng: loc.lng } : { lat: g.lat, lng: g.lng };
      }
      const rec = Data.put('stores', { id: s ? s.id : undefined, name: f.name.value.trim(), address: f.address.value.trim(), locationId: f.locationId.value, pricePerDelivery: +f.price.value, contact: f.contact.value.trim(), phone: f.phone.value.trim(), active: f.active.checked, lat: pos.lat, lng: pos.lng });
      if (email) Data.put('users', { id: lg ? lg.id : undefined, role: 'store', storeId: rec.id, name: f.contact.value.trim() || rec.name, company: rec.name, email, password: f.password.value || 'store123' });
      closeModal(); toast('Store saved'); App.render();
    });
  }

  function drivers(el, user) {
    const t = Data.today();
    el.innerHTML = '<div class="row-end"><button class="btn primary" id="add-dr">+ Add driver</button></div><div class="cards">' + Deliver.drivers(true).map((d) => {
      const lg = loginFor('driver', 'driverId', d.id), b = d.bikeId ? Data.bike(d.bikeId) : null;
      return '<section class="card"><div class="row-between"><h2><span class="ddot sm" style="--c:' + DUI.color(d.id) + '"></span> ' + esc(d.name) + '</h2><span class="dchip ' + (d.onShift ? 's-out' : d.active !== false ? 's-routed' : 's-new') + '">' + (d.onShift ? 'On shift' : d.active !== false ? 'Active' : 'Paused') + '</span></div><ul class="dkv"><li><span>Phone</span><b>' + esc(d.phone || '') + '</b></li><li><span>Area</span><b>' + esc((Data.get('locations', d.locationId) || {}).name || '') + '</b></li><li><span>Bike</span><b>' + esc(d.vehicle || '') + (b ? ' · ad bike #' + esc(b.number) : '') + '</b></li><li><span>GPS</span><b>' + (d.position ? (d.position.source === 'phone' ? 'Phone GPS · ' : 'Demo · ') + ago(d.position.at) : 'Not yet') + '</b></li><li><span>Pay / stop</span><b>' + money(d.payPerStop != null ? d.payPerStop : Deliver.settings().driverPayPerStop) + '</b></li><li><span>Today</span><b>' + Deliver.route(d.id, t).length + ' stops</b></li><li><span>Login</span><b>' + (lg ? esc(lg.email) : 'none') + '</b></li></ul><div class="row-end"><button class="btn small-btn" data-edit="' + d.id + '">Edit</button></div></section>';
    }).join('') + '</div>';
    $('#add-dr', el).addEventListener('click', () => driverForm(null));
    $$('[data-edit]', el).forEach((b) => b.addEventListener('click', () => driverForm(Deliver.driver(b.getAttribute('data-edit')))));
  }
  function driverForm(d) {
    const lg = d ? loginFor('driver', 'driverId', d.id) : null;
    const bikes = Data.list('bikes');
    const m = modal(d ? 'Edit driver' : 'Add driver', '<form class="form" id="df"><label>Name<input class="input" name="name" required value="' + esc(d ? d.name : '') + '"></label>' +
      '<div class="two"><label>Phone<input class="input" type="tel" name="phone" value="' + esc(d ? d.phone || '' : '') + '"></label><label>Area<select class="select" name="locationId">' + areaOpts(d ? d.locationId : 'loc_monroe') + '</select></label></div>' +
      '<div class="two"><label>Vehicle<input class="input" name="vehicle" value="' + esc(d ? d.vehicle || '' : 'E-bike with cargo box') + '"></label><label>Rides ad bike<select class="select" name="bikeId"><option value="">— none —</option>' + bikes.map((b) => '<option value="' + b.id + '"' + (d && d.bikeId === b.id ? ' selected' : '') + '>#' + esc(b.number) + ' · ' + esc(b.trackerId) + '</option>').join('') + '</select></label></div>' +
      '<label>Pay per stop<input class="input" type="number" step="0.5" min="0" name="pay" value="' + (d && d.payPerStop != null ? d.payPerStop : Deliver.settings().driverPayPerStop) + '"></label>' +
      '<fieldset><legend>Driver login</legend><div class="two"><label>Email<input class="input" type="email" name="email" value="' + esc(lg ? lg.email : '') + '"></label><label>Password<input class="input" name="password" value="' + esc(lg ? lg.password : '') + '"></label></div></fieldset>' +
      '<label class="check"><input type="checkbox" name="active"' + (!d || d.active !== false ? ' checked' : '') + '> Active</label><p class="err" id="derr"></p><div class="row-end"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">Save</button></div></form>');
    $('#df', m).addEventListener('submit', (e) => {
      e.preventDefault(); const f = e.target, email = f.email.value.trim().toLowerCase();
      if (email && Data.list('users').some((u) => u.email.toLowerCase() === email && (!lg || u.id !== lg.id))) { $('#derr', m).textContent = 'That email is already used.'; return; }
      const rec = Data.put('drivers', { id: d ? d.id : undefined, name: f.name.value.trim(), phone: f.phone.value.trim(), locationId: f.locationId.value, vehicle: f.vehicle.value.trim(), bikeId: f.bikeId.value, payPerStop: +f.pay.value, active: f.active.checked, onShift: d ? d.onShift : false });
      if (email) { const u = Data.put('users', { id: lg ? lg.id : undefined, role: 'driver', driverId: rec.id, name: rec.name, email, password: f.password.value || 'driver123' }); Data.put('drivers', { id: rec.id, userId: u.id }); }
      closeModal(); toast('Driver saved'); App.render();
    });
  }

  function users(el, user) {
    const all = Data.list('users');
    el.innerHTML = '<div class="row-end"><button class="btn primary" id="add-user">+ Add user</button></div><section class="card"><div class="dtw"><table class="tbl"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Linked to</th><th></th></tr></thead><tbody>' +
      all.map((u) => '<tr><td>' + esc(u.name) + '<div class="muted small">' + esc(u.company || '') + '</div></td><td>' + esc(u.email) + '</td><td><select class="select" data-role="' + u.id + '"' + (u.id === user.id ? ' disabled' : '') + '>' + Object.keys(ROLE).map((r) => '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + ROLE[r] + '</option>').join('') + '</select></td>' +
        '<td>' + (u.role === 'store' ? '<select class="select" data-link-store="' + u.id + '"><option value="">— pick store —</option>' + Deliver.stores(true).map((s) => '<option value="' + s.id + '"' + (u.storeId === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select>' : u.role === 'driver' ? '<select class="select" data-link-driver="' + u.id + '"><option value="">— pick driver —</option>' + Deliver.drivers(true).map((d) => '<option value="' + d.id + '"' + (u.driverId === d.id ? ' selected' : '') + '>' + esc(d.name) + '</option>').join('') + '</select>' : '—') + '</td>' +
        '<td class="nowrap"><button class="mini" data-pw="' + u.id + '">Password</button>' + (u.id !== user.id ? ' <button class="mini" data-as="' + u.id + '">Open as</button> <button class="mini danger-text" data-del="' + u.id + '">Remove</button>' : '') + '</td></tr>').join('') +
      '</tbody></table></div><p class="muted small">Demo: logins live in this browser. Real logins come with the shared database (see Connect later).</p></section>';
    $$('[data-role]', el).forEach((s) => s.addEventListener('change', () => { Data.put('users', { id: s.getAttribute('data-role'), role: s.value }); toast('Role changed'); App.render(); }));
    $$('[data-link-store]', el).forEach((s) => s.addEventListener('change', () => { Data.put('users', { id: s.getAttribute('data-link-store'), storeId: s.value }); toast('Linked'); }));
    $$('[data-link-driver]', el).forEach((s) => s.addEventListener('change', () => { Data.put('users', { id: s.getAttribute('data-link-driver'), driverId: s.value }); toast('Linked'); }));
    $$('[data-as]', el).forEach((b) => b.addEventListener('click', () => App.viewAs(b.getAttribute('data-as'))));
    $$('[data-del]', el).forEach((b) => b.addEventListener('click', () => { const u = Data.get('users', b.getAttribute('data-del')); confirmBox('Remove ' + u.name + '?', 'Their login stops working. Their orders and history stay.', 'Remove', () => { Data.remove('users', u.id); App.render(); }, true); }));
    $$('[data-pw]', el).forEach((b) => b.addEventListener('click', () => { const u = Data.get('users', b.getAttribute('data-pw')); const m = modal('Password for ' + u.name, '<form class="form" id="pw"><label>New password<input class="input" name="pw" minlength="6" required></label><div class="row-end"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">Save</button></div></form>'); $('#pw', m).addEventListener('submit', (e) => { e.preventDefault(); Data.put('users', { id: u.id, password: e.target.pw.value }); closeModal(); toast('Password changed'); }); }));
    $('#add-user', el).addEventListener('click', () => {
      const m = modal('Add user', '<form class="form" id="uf"><label>Name<input class="input" name="name" required></label><label>Email<input class="input" type="email" name="email" required></label><label>Password<input class="input" name="pw" minlength="6" required value="welcome1"></label><label>Role<select class="select" name="role">' + Object.keys(ROLE).map((r) => '<option value="' + r + '">' + ROLE[r] + '</option>').join('') + '</select></label><p class="err" id="uerr"></p><div class="row-end"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">Add</button></div></form>');
      $('#uf', m).addEventListener('submit', (e) => { e.preventDefault(); const f = e.target, email = f.email.value.trim().toLowerCase(); if (Data.list('users').some((u) => u.email.toLowerCase() === email)) { $('#uerr', m).textContent = 'That email is already used.'; return; } Data.put('users', { name: f.name.value.trim(), email, password: f.pw.value, role: f.role.value, company: f.role.value === 'boss' ? 'BikeAds Deliver' : '' }); closeModal(); toast('User added. Link stores/drivers in the table.'); App.render(); });
    });
  }

  function settings(el) {
    const s = Deliver.settings();
    el.innerHTML = '<section class="card narrow-card"><form id="sf" class="form"><label>Name of the delivery side<input class="input" name="name" value="' + esc(s.name || 'BikeAds Deliver') + '"></label>' +
      '<h3>Prices</h3><div class="two"><label>Default price per delivery<input class="input" type="number" step="0.5" min="0" name="pricePerDelivery" value="' + s.pricePerDelivery + '"></label><label>Bags included<input class="input" type="number" min="0" name="bagsIncluded" value="' + s.bagsIncluded + '"></label></div>' +
      '<div class="two"><label>Each extra bag<input class="input" type="number" step="0.5" min="0" name="extraBagPrice" value="' + s.extraBagPrice + '"></label><label>Failed attempt charge<input class="input" type="number" step="0.5" min="0" name="failedCharge" value="' + s.failedCharge + '"></label></div>' +
      '<div class="two"><label>Driver pay per stop<input class="input" type="number" step="0.5" min="0" name="driverPayPerStop" value="' + s.driverPayPerStop + '"></label><label>Driver pay per failed stop<input class="input" type="number" step="0.5" min="0" name="driverPayFailed" value="' + s.driverPayFailed + '"></label></div>' +
      '<h3>Routing</h3><div class="two"><label>Bike speed (km/h)<input class="input" type="number" min="5" max="40" name="speedKmh" value="' + s.speedKmh + '"></label><label>Minutes at each door<input class="input" type="number" min="1" max="20" name="minutesPerStop" value="' + s.minutesPerStop + '"></label></div>' +
      '<div class="two"><label>Routes start at<input class="input" type="time" name="routeStart" value="' + esc(s.routeStart || '12:30') + '"></label><label>Street detour factor<input class="input" type="number" step="0.05" min="1" max="2" name="detour" value="' + s.detour + '"></label></div>' +
      '<p class="muted small">Routes use straight-line distance × the detour factor (works with no internet and no paid map key). A street-routing service can be plugged in later.</p><button class="btn primary">Save</button></form></section>';
    $('#sf', el).addEventListener('submit', (e) => {
      e.preventDefault(); const f = e.target, p = { name: f.name.value.trim() || 'BikeAds Deliver', routeStart: f.routeStart.value || '12:30' };
      ['pricePerDelivery', 'bagsIncluded', 'extraBagPrice', 'failedCharge', 'driverPayPerStop', 'driverPayFailed', 'speedKmh', 'minutesPerStop', 'detour'].forEach((k) => { p[k] = +f[k].value || 0; });
      Deliver.save(p); toast('Saved'); App.render();
    });
  }

  function plugins(el) {
    const s = Deliver.settings(), p = s.plugins || {};
    const row = (k, icon, title, text) => '<li class="plug"><span class="plug-ico">' + icon + '</span><span class="grow"><b>' + title + '</b><span class="meta">' + text + '</span></span><label class="switch"><input type="checkbox" data-plug="' + k + '"' + (p[k] !== false ? ' checked' : '') + '><span aria-hidden="true"></span><span class="sr-only">' + title + ' on</span></label></li>';
    el.innerHTML = '<section class="card narrow-card"><p class="muted small">Turn a plugin off and its logins see a “turned off” page. Nothing is deleted.</p><ul class="plugs">' +
      row('driver', '🚴', 'Driver', 'Phone app: route, scan bags, navigate, photo + signature, cash, shift, phone GPS.') +
      row('store', '🏪', 'Store', 'Add orders (form, Excel/CSV), bag labels with QR, live status, proof, history, billing.') +
      row('boss', '👔', 'Boss / dispatch', 'Live map, one-click routes, move stops, late/failed, end of day, invoices, driver pay.') +
      '<li class="plug"><span class="plug-ico">⚙️</span><span class="grow"><b>Admin</b><span class="meta">This page. Always on.</span></span><span class="dchip s-delivered">On</span></li>' +
      '<li class="plug"><span class="plug-ico">🚩</span><span class="grow"><b>Bike ads (Admin + Client)</b><span class="meta">The original BikeAds: map with flags, bookings, books. Always on.</span></span><span class="dchip s-delivered">On</span></li></ul></section>';
    $$('[data-plug]', el).forEach((c) => c.addEventListener('change', () => { const np = Object.assign({}, Deliver.settings().plugins, { [c.getAttribute('data-plug')]: c.checked }); Deliver.save({ plugins: np }); toast((c.checked ? 'Turned on: ' : 'Turned off: ') + c.getAttribute('data-plug')); }));
  }

  function texts(el) {
    const s = Deliver.settings(), tp = s.templates || {};
    const log = Data.list('smslog').slice().reverse().slice(0, 80);
    const L = { onTheWay: 'When the driver starts the route', nextStop: 'When they are the next stop', delivered: 'When delivered', failed: 'When it could not be delivered' };
    el.innerHTML = '<div class="notice warn">No texts are sent yet. Every text is written and kept in the log below as “would send”. ' + DUI.connectLater('Connect a texting number and these go out for real.') + '</div>' +
      '<div class="split"><section class="card"><h2>Templates</h2><form id="tf" class="form">' + Object.keys(L).map((k) => '<label>' + L[k] + '<textarea class="input" name="' + k + '" rows="3">' + esc(tp[k] || '') + '</textarea></label>').join('') +
      '<p class="muted small">Fill-ins: {customer} {store} {code} {driver} {eta} {minutes} {time} {reason}</p><button class="btn primary">Save templates</button></form></section>' +
      '<section class="card"><h2>Log (' + Data.list('smslog').length + ')</h2>' + (log.length ? '<ul class="smslist">' + log.map((x) => { const o = Data.get('orders', x.orderId); return '<li><div class="muted small">' + esc(new Date(x.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) + ' · to ' + esc(x.to) + (o ? ' · ' + esc(o.code) : '') + ' · <b>' + esc(x.status) + '</b></div>' + esc(x.text) + '</li>'; }).join('') + '</ul>' : '<p class="muted">Nothing yet.</p>') + '</section></div>';
    $('#tf', el).addEventListener('submit', (e) => { e.preventDefault(); const f = e.target, t = {}; Object.keys(L).forEach((k) => { t[k] = f[k].value.trim(); }); Deliver.save({ templates: t }); toast('Templates saved'); });
  }

  function connect(el) {
    const items = [
      ['🧾', 'Store register / POS import', 'Orders flow in by themselves from each store\'s register instead of typing or uploading.', 'Which register each store uses (brand/name) and an export or API login from the store.'],
      ['💬', 'Customer text messages', 'The ETA, next-stop, delivered and failed texts go out for real.', 'A texting number (small monthly cost) and your OK on the wording.'],
      ['📍', 'Real GPS trackers', 'Bikes show where they really are. Drivers\' phones already work as GPS.', 'Tracker brand/app + each tracker\'s ID (IMEI).'],
      ['💳', 'Payments', 'Card at the door, stores paying invoices online, ad deposits.', 'A Stripe account (or the card reader the drivers will carry).'],
      ['🗄️', 'Shared database + real logins', 'Everyone sees the same live data on every phone (today each device keeps its own copy).', 'Your OK to set up a shared database; real emails for each store, driver and boss.'],
      ['🗺️', 'Street routing', 'Routes follow real streets and one-way rules instead of straight lines.', 'Optional: a free/paid routing service account if straight-line routes are not good enough.']
    ];
    el.innerHTML = '<p class="muted">Everything below works as a demo today. Each line says what is needed to make it real.</p><div class="cards">' +
      items.map(([i, t, what, need]) => '<section class="card"><h2>' + i + ' ' + esc(t) + ' <span class="cl-tag">Connect later</span></h2><p>' + esc(what) + '</p><p class="small"><b>Needed from David:</b> ' + esc(need) + '</p><p class="small muted">Status: not connected</p></section>').join('') + '</div>';
  }

  /* add the tab to the existing admin, before Settings */
  const tab = { key: 'deliver', label: 'Deliver', icon: 'box', render, badge: () => (typeof Deliver !== 'undefined' ? Deliver.day(Data.today()).filter((o) => o.status === 'failed').length : 0) };
  const i = AdminViews.tabs.findIndex((t) => t.key === 'settings');
  AdminViews.tabs.splice(i < 0 ? AdminViews.tabs.length : i, 0, tab);
  const oldTeardown = AdminViews.teardown;
  AdminViews.teardown = function () { oldTeardown(); teardown(); };
})();
