/* BikeAds Deliver — BOSS plugin (the delivery business owner / dispatcher):
 * live dispatch map, one-click routes, move stops between drivers, problems,
 * end-of-day summary, store prices, invoices and driver pay (into Books). */
(function () {
  'use strict';
  const { esc, money, fmtDate, $, $$, toast, modal, closeModal, confirmBox } = UI;
  let mapCtl = null, bikeLayer = null, offBikes = null;
  const view = { area: null, date: null, showBikes: false, eod: null };
  function teardown() { if (offBikes) { offBikes(); offBikes = null; } if (mapCtl) { mapCtl.destroy(); mapCtl = null; } bikeLayer = null; }
  const areas = () => { const ids = Array.from(new Set(Deliver.stores().map((s) => s.locationId))); return ids.map((id) => Data.get('locations', id)).filter(Boolean); };
  const inArea = (o) => !view.area || (Deliver.store(o.storeId) || {}).locationId === view.area;

  function drawBikes() {
    if (!mapCtl) return;
    if (bikeLayer) bikeLayer.clearLayers(); else bikeLayer = L.layerGroup().addTo(mapCtl.map);
    if (!view.showBikes) return;
    Data.list('bikes').forEach((b) => {
      if (!b.position || (view.area && b.locationId !== view.area)) return;
      L.marker([b.position.lat, b.position.lng], { icon: L.divIcon({ className: 'd-ico', html: '<div class="d-bike">' + esc(b.number) + '</div>', iconSize: [24, 24], iconAnchor: [12, 12] }), zIndexOffset: -100 })
        .bindPopup('<strong>Ad bike #' + esc(b.number) + '</strong><div class="small muted">' + esc(b.advertiser || '') + ' · tracker ' + esc(b.trackerId) + '</div>').addTo(bikeLayer);
    });
  }

  function renderDispatch(root, user) {
    const t = Data.today();
    if (view.area === null) view.area = DUI.busiestArea(t);
    const all = Deliver.day(t).filter(inArea);
    const c = (st) => all.filter((o) => st.includes(o.status)).length;
    const late = all.filter((o) => Deliver.late(o) && Deliver.isOpen(o));
    const failed = all.filter((o) => o.status === 'failed');
    const fresh = Deliver.day(t).filter((o) => o.status === 'new').length;
    const waiting = fresh + Deliver.day(t).filter((o) => o.status === 'routed').length;
    const team = Deliver.drivers().filter((d) => !view.area || d.locationId === view.area);
    root.innerHTML = '<div class="page wide"><div class="page-head"><div><h1>Dispatch</h1><p class="muted">' + esc(fmtDate(t, { weekday: 'long', month: 'long', day: 'numeric' })) + '</p></div>' +
      '<div class="head-actions"><button class="btn primary big" id="build"' + (waiting ? '' : ' disabled') + '>⚡ ' + (fresh ? 'Build routes (' + fresh + ' new stops)' : 'Re-plan routes') + '</button></div></div>' +
      '<div class="chips mb"><button class="chip' + (!view.area ? ' on' : '') + '" data-area="">All areas</button>' + areas().map((a) => '<button class="chip' + (view.area === a.id ? ' on' : '') + '" data-area="' + a.id + '">' + esc(a.name) + '</button>').join('') +
      '<label class="chip ghost"><input type="checkbox" id="showbikes"' + (view.showBikes ? ' checked' : '') + '> Show ad bikes</label></div>' +
      '<div class="stats">' + DUI.stat('Orders today', all.length) + DUI.stat('Not on a route', c(['new']), c(['new']) ? 'warn' : '') + DUI.stat('On the way', c(['out', 'arrived'])) + DUI.stat('Delivered', c(['delivered']), 'good') + DUI.stat('Late', late.length, late.length ? 'bad' : '') + DUI.stat('Failed', failed.length, failed.length ? 'bad' : '') + '</div>' +
      '<div class="dispatch"><div id="bmap" class="map dispatch-map"></div><aside class="dispatch-side">' +
      '<section class="card"><h2>Drivers</h2><ul class="drivers">' + team.map((d) => {
        const r = Deliver.route(d.id, t), done = r.filter((o) => !Deliver.isOpen(o)).length, nx = Deliver.nextStop(d.id, t);
        const off = d.offDate === t;
        return '<li><span class="ddot" style="--c:' + DUI.color(d.id) + '">' + esc(DUI.initials(d.name)) + '</span><span class="grow"><b>' + esc(d.name) + '</b><span class="meta">' + (off ? 'Off today' : (d.onShift ? 'On shift' + (d.position && d.position.source === 'phone' ? ' · phone GPS' : '') : 'Not started')) + ' · ' + done + '/' + r.length + ' stops' + (nx && nx.eta ? ' · next ' + esc(nx.customer) + ' ' + Deliver.fmtTime(nx.eta) : '') + '</span>' +
          '<div class="progress thin"><i style="width:' + (r.length ? Math.round(100 * done / r.length) : 0) + '%;background:' + DUI.color(d.id) + '"></i></div></span>' +
          '<span class="end col"><button class="mini" data-off="' + d.id + '">' + (off ? 'Working' : 'Off today') + '</button>' + (r.length ? '<button class="mini" data-reroute="' + d.id + '">Re-plan</button>' : '') + '</span></li>';
      }).join('') + '</ul><a class="btn wide" href="#/boss/routes">Edit routes (move stops)</a></section>' +
      '<section class="card"><h2>Needs attention</h2>' + (late.length + failed.length ? '<ul class="olist">' + late.concat(failed).map((o) => '<li><button class="orow" data-order="' + o.id + '"><span class="grow"><b>' + esc(o.customer) + '</b> <span class="muted small">' + esc(o.code) + '</span><span class="meta">' + esc((Deliver.driver(o.driverId) || {}).name || 'No driver') + ' · ' + esc(DUI.win(o)) + (DUI.eta(o) ? ' · ETA ' + DUI.eta(o) : '') + (o.failReason ? ' · ' + esc(o.failReason) : '') + '</span></span><span class="end">' + DUI.chip(o) + '</span></button></li>').join('') + '</ul>' : '<p class="muted">Nothing late or failed. 👍</p>') + '</section>' +
      '</aside></div></div>';
    $('#build', root).addEventListener('click', () => {
      const r = Deliver.buildRoutes(t, user.name);
      if (!r.ok) { toast(r.msg); return; }
      toast('Routes built: ' + r.stops + ' stops for ' + r.drivers + ' drivers, about ' + r.km + ' km');
      App.render();
    });
    $$('[data-area]', root).forEach((b) => b.addEventListener('click', () => { view.area = b.getAttribute('data-area'); App.render(); }));
    $('#showbikes', root).addEventListener('change', (e) => { view.showBikes = e.target.checked; drawBikes(); });
    $$('[data-off]', root).forEach((b) => b.addEventListener('click', () => { const d = Deliver.driver(b.getAttribute('data-off')); Data.put('drivers', { id: d.id, offDate: d.offDate === t ? '' : t }); App.render(); }));
    $$('[data-reroute]', root).forEach((b) => b.addEventListener('click', () => { Deliver.reroute(b.getAttribute('data-reroute')); toast('Remaining stops re-planned'); App.render(); }));
    $$('[data-order]', root).forEach((b) => b.addEventListener('click', () => stopModal(b.getAttribute('data-order'))));
    mapCtl = DUI.routeMap($('#bmap', root), { area: view.area, onStop: (id) => stopModal(id) });
    drawBikes();
    offBikes = TrackerFeed.onUpdate(() => drawBikes());
  }

  function stopModal(id) {
    const o = Data.get('orders', id);
    const opts = Deliver.drivers().map((d) => '<option value="' + d.id + '"' + (d.id === o.driverId ? ' selected' : '') + '>' + esc(d.name) + '</option>').join('');
    const extra = Deliver.isOpen(o) ? '<div class="form-row mt"><label class="grow">Driver<select class="select" id="mv">' + (o.driverId ? '' : '<option value="">— not on a route —</option>') + opts + '</select></label><button class="btn primary" id="mv-ok">Move</button>' + (o.driverId ? '<button class="btn ghost" id="unas">Take off route</button>' : '') + '</div>' +
      '<p class="small mt">' + (o.approx ? '<span class="warn-text">Pin is approximate.</span> ' : '') + '<button class="mini" id="fixpin">Fix pin on the map</button></p>' :
      (o.status === 'failed' ? '<div class="row-end mt"><button class="btn primary" id="retry">Try again tomorrow</button></div>' : '');
    const m = DUI.orderModal(o, extra);
    const mv = m.querySelector('#mv-ok');
    if (mv) mv.addEventListener('click', () => { const to = m.querySelector('#mv').value; if (!to) return; Deliver.moveStop(o.id, to, null, 'dispatch'); closeModal(); toast('Moved to ' + Deliver.driver(to).name); App.render(); });
    const un = m.querySelector('#unas');
    if (un) un.addEventListener('click', () => { Deliver.unassign(o.id, 'dispatch'); closeModal(); App.render(); });
    const fp = m.querySelector('#fixpin');
    if (fp) fp.addEventListener('click', () => DUI.fixPin(o, () => App.render()));
    const rt = m.querySelector('#retry');
    if (rt) rt.addEventListener('click', () => { retryTomorrow(o); closeModal(); App.render(); });
  }
  function retryTomorrow(o) {
    const n = Deliver.addOrder(o.storeId, Object.assign({}, o, { date: Data.addDays(o.date, 1), notes: ('Second try (' + o.code + ' failed: ' + (o.failReason || '') + '). ' + (o.notes || '')).trim(), source: 'second try' }), 'dispatch');
    Deliver.log(o, 'dispatch', 'New try booked as ' + n.code, { retryOf: '', retryCode: n.code });
    toast('Booked again for tomorrow as ' + n.code);
  }

  function renderRoutes(root, user) {
    const t = view.date || Data.today();
    const team = Deliver.drivers().filter((d) => !view.area || d.locationId === view.area);
    const unrouted = Deliver.day(t).filter((o) => o.status === 'new' && inArea(o));
    const col = (title, color, list, driverId) => '<section class="card rcol" data-drop="' + (driverId || '') + '"><div class="row-between"><h2><span class="ddot sm" style="--c:' + color + '"></span> ' + esc(title) + '</h2><span class="muted small">' + list.length + ' stops</span></div>' +
      (driverId && list.length ? '<button class="mini" data-best="' + driverId + '">Best order</button>' : '') +
      '<ol class="rlist">' + list.map((o, i) => '<li draggable="' + (Deliver.isOpen(o) ? 'true' : 'false') + '" data-id="' + o.id + '" class="rstop st-' + o.status + '"><span class="seq" style="--c:' + color + '">' + (driverId ? o.seq : '•') + '</span><span class="grow"><b>' + esc(o.customer) + '</b><span class="meta">' + esc(o.address.split(',')[0]) + ' · ' + esc(DUI.win(o)) + (DUI.eta(o) ? ' · ' + DUI.eta(o) : '') + '</span></span>' +
        (Deliver.isOpen(o) ? '<span class="end col">' + (driverId ? '<span class="updown"><button class="mini" data-up="' + o.id + '" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>▲</button><button class="mini" data-down="' + o.id + '" aria-label="Move down"' + (i === list.length - 1 ? ' disabled' : '') + '>▼</button></span>' : '') +
          '<select class="select mini-sel" data-move="' + o.id + '" aria-label="Move to driver"><option value="">Move to…</option>' + Deliver.drivers().filter((d) => d.id !== driverId).map((d) => '<option value="' + d.id + '">' + esc(d.name) + '</option>').join('') + (driverId ? '<option value="_off">Take off route</option>' : '') + '</select></span>' : '<span class="end">' + DUI.chip(o) + '</span>') + '</li>').join('') +
      (list.length ? '' : '<li class="muted small empty">Drop stops here</li>') + '</ol></section>';
    root.innerHTML = '<div class="page wide"><div class="page-head"><div><h1>Routes</h1><p class="muted">Drag a stop to another driver (computer), or use “Move to…” (phone). ▲▼ changes the order.</p></div><div class="head-actions"><input type="date" class="input inline-date" id="rdate" value="' + t + '" aria-label="Day"><button class="btn primary" id="build2">⚡ Build routes</button></div></div>' +
      '<div class="rcols">' + (unrouted.length ? col('Not on a route', '#6b7280', unrouted, '') : '') + team.map((d) => col(d.name + (d.offDate === t ? ' (off)' : ''), DUI.color(d.id), Deliver.route(d.id, t), d.id)).join('') + '</div></div>';
    $('#rdate', root).addEventListener('change', (e) => { view.date = e.target.value; App.render(); });
    $('#build2', root).addEventListener('click', () => { const r = Deliver.buildRoutes(t, user.name); toast(r.ok ? 'Routes built: ' + r.stops + ' stops, about ' + r.km + ' km' : r.msg); App.render(); });
    $$('[data-best]', root).forEach((b) => b.addEventListener('click', () => { Deliver.reroute(b.getAttribute('data-best'), t); toast('Best order set'); App.render(); }));
    $$('[data-move]', root).forEach((s) => s.addEventListener('change', () => { const to = s.value, id = s.getAttribute('data-move'); if (!to) return; if (to === '_off') Deliver.unassign(id, user.name); else Deliver.moveStop(id, to, null, user.name); App.render(); }));
    const shift = (id, dir) => {
      const o = Data.get('orders', id), list = Deliver.route(o.driverId, o.date).map((x) => x.id), i = list.indexOf(id), j = i + dir;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]]; Deliver.renumber(o.driverId, o.date, list); Data.flush('orders'); Deliver.emit(); App.render();
    };
    $$('[data-up]', root).forEach((b) => b.addEventListener('click', () => shift(b.getAttribute('data-up'), -1)));
    $$('[data-down]', root).forEach((b) => b.addEventListener('click', () => shift(b.getAttribute('data-down'), 1)));
    let dragId = null;
    $$('.rstop[draggable="true"]', root).forEach((li) => {
      li.addEventListener('dragstart', (e) => { dragId = li.getAttribute('data-id'); e.dataTransfer.setData('text/plain', dragId); li.classList.add('dragging'); });
      li.addEventListener('dragend', () => li.classList.remove('dragging'));
    });
    $$('[data-drop]', root).forEach((colEl) => {
      colEl.addEventListener('dragover', (e) => { e.preventDefault(); colEl.classList.add('over'); });
      colEl.addEventListener('dragleave', () => colEl.classList.remove('over'));
      colEl.addEventListener('drop', (e) => {
        e.preventDefault(); colEl.classList.remove('over');
        const id = e.dataTransfer.getData('text/plain') || dragId, to = colEl.getAttribute('data-drop');
        if (!id) return;
        if (!to) { Deliver.unassign(id, user.name); App.render(); return; }
        const items = $$('.rstop', colEl); let idx = items.length;
        for (let i = 0; i < items.length; i++) { const r = items[i].getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { idx = i; break; } }
        const o = Data.get('orders', id);
        if (o.driverId === to) { const cur = Deliver.route(to, o.date).map((x) => x.id); const from = cur.indexOf(id); if (from < idx) idx--; }
        Deliver.moveStop(id, to, idx, user.name); toast('Moved to ' + Deliver.driver(to).name); App.render();
      });
    });
  }

  function renderDay(root, user) {
    const d = view.eod || Data.today();
    const s = Deliver.summary(d, d);
    const drivers = Object.keys(s.byDriver).filter((k) => k !== '_none');
    const failed = s.list.filter((o) => o.status === 'failed');
    root.innerHTML = '<div class="page"><div class="page-head"><div><h1>End of day</h1><p class="muted">' + esc(fmtDate(d, { weekday: 'long', month: 'long', day: 'numeric' })) + '</p></div><div class="head-actions"><input type="date" class="input inline-date" id="edate" value="' + d + '" aria-label="Day"><button class="btn" id="eod-csv">Export CSV</button></div></div>' +
      '<div class="stats">' + DUI.stat('Orders', s.totals.orders) + DUI.stat('Delivered', s.totals.delivered, 'good') + DUI.stat('Failed', s.totals.failed, s.totals.failed ? 'bad' : '') + DUI.stat('Still open', s.totals.open, s.totals.open ? 'warn' : '') + DUI.stat('Cash collected', money(s.totals.cash)) + DUI.stat('Card collected', money(s.totals.card)) + DUI.stat('Charges to stores', money(s.totals.charges)) + DUI.stat('Driver pay', money(s.totals.pay)) + '</div>' +
      '<section class="card"><h2>Per driver</h2><div class="dtw"><table class="tbl"><thead><tr><th>Driver</th><th class="nr">Stops</th><th class="nr">Delivered</th><th class="nr">Failed</th><th class="nr">Late</th><th class="nr">Cash to hand in</th><th class="nr">Card</th><th class="nr">Pay</th></tr></thead><tbody>' +
      (drivers.length ? drivers.map((id) => { const r = s.byDriver[id], dr = Deliver.driver(id); return '<tr><td><span class="ddot sm" style="--c:' + DUI.color(id) + '"></span> ' + esc(dr ? dr.name : id) + '</td><td class="nr">' + r.stops + '</td><td class="nr">' + r.delivered + '</td><td class="nr">' + r.failed + '</td><td class="nr">' + r.late + '</td><td class="nr">' + money(r.cash) + '</td><td class="nr">' + money(r.card) + '</td><td class="nr">' + money(r.pay) + '</td></tr>'; }).join('') : '<tr><td colspan="8" class="muted">No routes this day.</td></tr>') +
      '</tbody></table></div></section>' +
      '<section class="card"><h2>Per store</h2><div class="dtw"><table class="tbl"><thead><tr><th>Store</th><th class="nr">Orders</th><th class="nr">Delivered</th><th class="nr">Failed</th><th class="nr">Cash for the store</th><th class="nr">Card</th><th class="nr">Our charge</th></tr></thead><tbody>' +
      Object.keys(s.byStore).map((id) => { const r = s.byStore[id], st = Deliver.store(id); return '<tr><td>' + esc(st ? st.name : id) + '</td><td class="nr">' + r.orders + '</td><td class="nr">' + r.delivered + '</td><td class="nr">' + r.failed + '</td><td class="nr">' + money(r.cash) + '</td><td class="nr">' + money(r.card) + '</td><td class="nr">' + money(r.charges) + '</td></tr>'; }).join('') +
      '</tbody></table></div></section>' +
      (failed.length ? '<section class="card"><h2>Failed — book a second try</h2><ul class="olist">' + failed.map((o) => '<li><div class="orow"><span class="grow"><b>' + esc(o.customer) + '</b> <span class="muted small">' + esc(o.code) + '</span><span class="meta">' + esc(o.address) + ' · ' + esc(o.failReason || '') + (o.retryCode ? ' · rebooked as ' + esc(o.retryCode) : '') + '</span></span><span class="end">' + (o.retryCode ? '<span class="dchip s-routed">Rebooked</span>' : '<button class="mini" data-retry="' + o.id + '">Try again tomorrow</button>') + '</span></div></li>').join('') + '</ul></section>' : '') +
      '<p class="muted small">Money for the stores (cash collected) is theirs to receive; our charges go on their invoices under Money.</p></div>';
    $('#edate', root).addEventListener('change', (e) => { view.eod = e.target.value; App.render(); });
    $$('[data-retry]', root).forEach((b) => b.addEventListener('click', () => { retryTomorrow(Data.get('orders', b.getAttribute('data-retry'))); App.render(); }));
    $('#eod-csv', root).addEventListener('click', () => {
      const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const rows = [['Order', 'Store', 'Customer', 'Address', 'Driver', 'Stop', 'Status', 'Time', 'Collected', 'Method', 'Charge', 'Driver pay']].concat(s.list.map((o) => [o.code, (Deliver.store(o.storeId) || {}).name, o.customer, o.address, (Deliver.driver(o.driverId) || {}).name || '', o.seq || '', Deliver.STATUS[o.status], o.proof ? new Date(o.proof.at).toLocaleTimeString('en-US') : '', o.proof ? o.proof.collected : '', o.proof ? o.proof.method : '', Deliver.charge(o), Deliver.pay(o)]));
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(q).join(',')).join('\n')], { type: 'text/csv' })); a.download = 'end-of-day-' + d + '.csv'; document.body.appendChild(a); a.click(); a.remove();
    });
  }

  function renderMoney(root, user) {
    const st = Deliver.settings();
    const stores = Deliver.stores(true), drivers = Deliver.drivers(true);
    const invs = Data.list('invoices').slice().reverse();
    root.innerHTML = '<div class="page"><h1>Money</h1>' +
      '<section class="card"><h2>Invoices to stores</h2><div class="dtw"><table class="tbl"><thead><tr><th>Store</th><th class="nr">Price / delivery</th><th class="nr">Not billed</th><th class="nr">Amount</th><th></th></tr></thead><tbody>' +
      stores.map((s) => { const u = Deliver.unbilled(s.id); return '<tr><td>' + esc(s.name) + '</td><td class="nr"><input class="input num-in" type="number" step="0.5" min="0" data-price="' + s.id + '" value="' + Deliver.priceFor(s) + '" aria-label="Price per delivery for ' + esc(s.name) + '"></td><td class="nr">' + u.length + '</td><td class="nr">' + money(u.reduce((a, o) => a + Deliver.charge(o), 0)) + '</td><td><button class="mini" data-inv="' + s.id + '"' + (u.length ? '' : ' disabled') + '>Create invoice</button></td></tr>'; }).join('') +
      '</tbody></table></div>' +
      (invs.length ? '<h3 class="mt">Sent invoices</h3><ul class="olist">' + invs.map((i) => '<li><div class="orow"><span class="grow"><b>' + esc(i.no) + '</b> · ' + esc((Deliver.store(i.storeId) || {}).name || '') + '<span class="meta">' + esc(fmtDate(i.from, { month: 'short', day: 'numeric' })) + ' – ' + esc(fmtDate(i.to, { month: 'short', day: 'numeric' })) + ' · ' + i.delivered + ' delivered, ' + i.failed + ' failed</span></span><span class="end"><b>' + money(i.total) + '</b> ' + (i.status === 'paid' ? '<span class="dchip s-delivered">Paid · in Books</span>' : '<button class="mini" data-paid="' + i.id + '">Mark paid</button>') + ' <button class="mini" data-view="' + i.id + '">View</button></span></div></li>').join('') + '</ul>' : '') + '</section>' +
      '<section class="card"><h2>Driver pay</h2><div class="dtw"><table class="tbl"><thead><tr><th>Driver</th><th class="nr">Pay / stop</th><th class="nr">Unpaid stops</th><th class="nr">Owed</th><th></th></tr></thead><tbody>' +
      drivers.map((d) => { const u = Deliver.unpaid(d.id); return '<tr><td>' + esc(d.name) + '</td><td class="nr"><input class="input num-in" type="number" step="0.5" min="0" data-dpay="' + d.id + '" value="' + (d.payPerStop != null ? d.payPerStop : st.driverPayPerStop) + '" aria-label="Pay per stop for ' + esc(d.name) + '"></td><td class="nr">' + u.length + '</td><td class="nr">' + money(u.reduce((a, o) => a + Deliver.pay(o), 0)) + '</td><td><button class="mini" data-pay="' + d.id + '"' + (u.length ? '' : ' disabled') + '>Pay &amp; record</button></td></tr>'; }).join('') +
      '</tbody></table></div><p class="muted small">Failed attempts pay ' + money(st.driverPayFailed || 0) + '. Paid amounts are written into the bookkeeping (Admin → Books) as “Driver pay”; paid invoices as “Delivery income”.</p></section>' +
      '<section class="card"><h2>Charges</h2><form id="chg" class="form"><div class="two"><label>Default price per delivery<input class="input" type="number" step="0.5" min="0" name="pricePerDelivery" value="' + st.pricePerDelivery + '"></label><label>Bags included<input class="input" type="number" min="0" name="bagsIncluded" value="' + st.bagsIncluded + '"></label></div>' +
      '<div class="two"><label>Each extra bag<input class="input" type="number" step="0.5" min="0" name="extraBagPrice" value="' + st.extraBagPrice + '"></label><label>Failed attempt (charged to store)<input class="input" type="number" step="0.5" min="0" name="failedCharge" value="' + st.failedCharge + '"></label></div>' +
      '<div class="two"><label>Driver pay per failed stop<input class="input" type="number" step="0.5" min="0" name="driverPayFailed" value="' + st.driverPayFailed + '"></label><label>Default driver pay per stop<input class="input" type="number" step="0.5" min="0" name="driverPayPerStop" value="' + st.driverPayPerStop + '"></label></div>' +
      '<button class="btn primary">Save charges</button></form></section>' + DUI.connectLater('Stores paying invoices online, and paying drivers by bank, need a payments account.') + '</div>';
    $$('[data-price]', root).forEach((i) => i.addEventListener('change', () => { Data.put('stores', { id: i.getAttribute('data-price'), pricePerDelivery: +i.value }); toast('Price saved'); App.render(); }));
    $$('[data-dpay]', root).forEach((i) => i.addEventListener('change', () => { Data.put('drivers', { id: i.getAttribute('data-dpay'), payPerStop: +i.value }); toast('Pay saved'); App.render(); }));
    $$('[data-inv]', root).forEach((b) => b.addEventListener('click', () => { const inv = Deliver.createInvoice(b.getAttribute('data-inv'), user.name); if (inv) { toast('Invoice ' + inv.no + ' created: ' + money(inv.total)); App.render(); } }));
    $$('[data-paid]', root).forEach((b) => b.addEventListener('click', () => { Deliver.markInvoicePaid(b.getAttribute('data-paid'), user.name); toast('Marked paid and added to Books'); App.render(); }));
    $$('[data-view]', root).forEach((b) => b.addEventListener('click', () => StoreViews.invoiceModal(Data.get('invoices', b.getAttribute('data-view')))));
    $$('[data-pay]', root).forEach((b) => b.addEventListener('click', () => { const d = Deliver.driver(b.getAttribute('data-pay')); const amt = Deliver.unpaid(d.id).reduce((a, o) => a + Deliver.pay(o), 0); confirmBox('Pay ' + d.name + '?', 'Record ' + money(amt) + ' as paid to ' + d.name + ' in the books.', 'Record payment', () => { Deliver.payDriver(d.id, user.name); toast('Recorded in Books'); App.render(); }); }));
    $('#chg', root).addEventListener('submit', (e) => { e.preventDefault(); const f = e.target, p = {}; ['pricePerDelivery', 'bagsIncluded', 'extraBagPrice', 'failedCharge', 'driverPayFailed', 'driverPayPerStop'].forEach((k) => { p[k] = +f[k].value || 0; }); Deliver.save(p); toast('Charges saved'); App.render(); });
  }

  window.BossViews = {
    tabs: [
      { key: 'dispatch', label: 'Dispatch', icon: 'map', render: renderDispatch, badge: () => Deliver.day(Data.today()).filter((o) => o.status === 'new').length },
      { key: 'routes', label: 'Routes', icon: 'route', render: renderRoutes },
      { key: 'day', label: 'End of day', icon: 'chart', render: renderDay },
      { key: 'money', label: 'Money', icon: 'money', render: renderMoney }
    ],
    teardown
  };
})();
