/* BikeAds Deliver — DRIVER plugin (phone first): today's route, loading scan,
 * turn-by-turn, proof at the door, shift + the phone as the GPS. */
(function () {
  'use strict';
  const { esc, money, $, $$, toast, modal, closeModal, confirmBox } = UI;
  let mapCtl = null, scanCtl = null, watchId = null, lastFlush = 0;

  function teardown() {
    if (mapCtl) { mapCtl.destroy(); mapCtl = null; }
    if (scanCtl) { try { scanCtl.stop(); } catch (e) { /* already stopped */ } scanCtl = null; }
  }
  const me = (user) => Deliver.driverOf(user);
  const go = (h) => { if (location.hash === h) App.render(); else location.hash = h; };

  /* ---- the phone is the GPS while the shift is on ---- */
  function startGps(d) {
    if (watchId !== null || !navigator.geolocation) return;
    watchId = navigator.geolocation.watchPosition((p) => {
      Deliver.setPosition(d.id, p.coords.latitude, p.coords.longitude, 'phone', Math.round(p.coords.accuracy));
      if (Date.now() - lastFlush > 8000) { lastFlush = Date.now(); Data.flush('drivers'); Deliver.emit(); }
      const el = $('#gps-state'); if (el) el.textContent = 'Phone GPS on · ±' + Math.round(p.coords.accuracy) + ' m';
    }, (err) => {
      const el = $('#gps-state'); if (el) el.textContent = 'Location is off — the map shows a demo position';
      if (err.code === 1) { stopGps(); }
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
  }
  function stopGps() { if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId); watchId = null; }

  function shiftCard(d) {
    if (!d.onShift) {
      return '<section class="card dcard shift-off"><h2>Ready to ride?</h2><p class="muted small">Starting your shift turns on your phone as the GPS, so dispatch sees you on the live map.</p><button class="btn primary wide xl" id="shift-start">Start shift</button></section>';
    }
    const sh = Data.get('shifts', d.shiftId);
    return '<section class="card dcard shift-on"><div class="row-between"><div><b>On shift</b><span class="muted small"> since ' + (sh ? Deliver.fmtTime(new Date(sh.start).getTime()) : '') + '</span><div class="muted small" id="gps-state">' + (watchId !== null ? 'Phone GPS on' : 'Waiting for location…') + '</div></div><button class="btn ghost small-btn" id="shift-end">End shift</button></div></section>';
  }
  function bindShift(root, d, user) {
    const s = $('#shift-start', root);
    if (s) s.addEventListener('click', () => { Deliver.startShift(d.id); startGps(d); toast('Shift started'); App.render(); });
    const e = $('#shift-end', root);
    if (e) e.addEventListener('click', () => {
      const open = Deliver.route(d.id).filter((o) => Deliver.isOpen(o)).length;
      confirmBox('End shift?', open ? open + ' stop(s) are not finished. Dispatch will see them as open.' : 'All done for today. Nice work!', 'End shift', () => { Deliver.endShift(d.id); stopGps(); toast('Shift ended'); App.render(); }, !!open);
    });
  }

  function stopRow(o, next) {
    const sc = (o.scanned || []).length;
    return '<li><a class="stop' + (next ? ' next' : '') + ' st-' + o.status + '" href="#/driver/route/stop/' + o.id + '">' +
      '<span class="seq" style="--c:' + DUI.color(o.driverId) + '">' + (o.status === 'delivered' ? '✓' : o.status === 'failed' ? '✕' : o.seq) + '</span>' +
      '<span class="grow"><b>' + esc(o.customer) + '</b><span class="addr">' + esc(o.address.replace(/, (NY|New York).*$/, '')) + '</span>' +
      '<span class="meta">' + esc(DUI.win(o)) + (DUI.eta(o) ? ' · ETA ' + DUI.eta(o) : '') + ' · ' + sc + '/' + o.bags + ' bags' + (o.amount > 0 ? ' · <b class="collect">' + money(o.amount) + '</b>' : '') + '</span></span>' +
      '<span class="end">' + DUI.chip(o) + '</span></a></li>';
  }

  function renderRoute(root, user, rest) {
    const d = me(user);
    if (!d) { root.innerHTML = '<div class="pad">This login is not linked to a driver. Ask the admin.</div>'; return; }
    if (rest[0] === 'stop' && rest[1]) return renderStop(root, user, d, rest[1]);
    if (rest[0] === 'proof' && rest[1]) return renderProof(root, user, d, rest[1]);
    if (d.onShift) startGps(d);
    const list = Deliver.route(d.id);
    const open = list.filter((o) => Deliver.isOpen(o));
    const toStart = list.filter((o) => ['routed', 'loaded'].includes(o.status));
    const next = Deliver.nextStop(d.id);
    const bagsAll = list.filter((o) => Deliver.isOpen(o)).reduce((a, o) => a + o.bags, 0);
    const bagsIn = list.filter((o) => Deliver.isOpen(o)).reduce((a, o) => a + (o.scanned || []).length, 0);
    let html = '<div class="page narrow">' + shiftCard(d);
    if (!list.length) {
      html += '<section class="card dcard center"><h2>No stops yet</h2><p class="muted">Dispatch builds today\'s routes. This page fills in by itself when your route is ready.</p>' +
        '<button class="btn wide" id="demo-build">Demo: build today\'s routes now</button></section>';
    } else {
      html += '<section class="card dcard"><div class="row-between"><h2>Today · ' + list.length + ' stops</h2><span class="muted small">' + (list.length - open.length) + ' done</span></div>' +
        '<div class="progress" aria-label="' + (list.length - open.length) + ' of ' + list.length + ' done"><i style="width:' + Math.round(100 * (list.length - open.length) / list.length) + '%"></i></div>' +
        (toStart.length ? '<p class="small ' + (bagsIn < bagsAll ? 'warn-text' : 'ok-text') + '">' + bagsIn + ' of ' + bagsAll + ' bags scanned onto your bike.</p><div class="btn-grid two"><a class="btn wide big" href="#/driver/scan">Scan bags</a><button class="btn primary wide big" id="start-route">Start route</button></div>' : '') +
        '</section>';
      if (next) {
        html += '<section class="card dcard nextcard"><div class="muted small">NEXT STOP · ' + next.seq + ' of ' + list.length + '</div><h2 class="big-name">' + esc(next.customer) + '</h2><p class="big-addr">' + esc(next.address) + '</p>' +
          (next.notes ? '<p class="note">📝 ' + esc(next.notes) + '</p>' : '') +
          '<p class="small">' + esc(DUI.win(next)) + (DUI.eta(next) ? ' · ETA ' + DUI.eta(next) : '') + ' · ' + next.bags + ' bag(s) · <b>' + esc(DUI.pay(next)) + '</b></p>' +
          '<div class="btn-grid three"><a class="btn big" href="' + esc(DUI.navUrl(next)) + '" target="_blank" rel="noopener">Navigate</a><a class="btn big" href="tel:' + esc(DUI.phoneDigits(next.phone)) + '">Call</a><a class="btn big" href="sms:' + esc(DUI.phoneDigits(next.phone)) + '">Text</a></div>' +
          '<a class="btn primary wide xl" href="#/driver/route/stop/' + next.id + '">' + (next.status === 'arrived' ? 'At the door → finish' : 'Open stop') + '</a></section>';
      } else if (!open.length) {
        html += '<section class="card dcard center"><h2>All stops done ✓</h2><p class="muted">End your shift when you are back.</p></section>';
      }
      html += '<h2 class="list-h">All stops</h2><ol class="stops">' + list.map((o) => stopRow(o, next && o.id === next.id)).join('') + '</ol>';
    }
    html += '</div>';
    root.innerHTML = html;
    bindShift(root, d, user);
    const b = $('#demo-build', root);
    if (b) b.addEventListener('click', () => { const r = Deliver.buildRoutes(Data.today(), 'demo'); toast(r.ok ? 'Routes built: ' + r.stops + ' stops for ' + r.drivers + ' drivers' : r.msg); App.render(); });
    const sr = $('#start-route', root);
    if (sr) sr.addEventListener('click', () => {
      const go1 = () => { if (!d.onShift) { Deliver.startShift(d.id); startGps(d); } const n = Deliver.startRoute(d.id, d.name); toast(n + ' customers got their arrival time'); App.render(); };
      if (bagsIn < bagsAll) confirmBox('Some bags are not scanned', (bagsAll - bagsIn) + ' bag(s) are not scanned onto your bike yet. Start the route anyway?', 'Start anyway', go1);
      else go1();
    });
  }

  function renderStop(root, user, d, id) {
    const o = Data.get('orders', id);
    if (!o || o.driverId !== d.id) { root.innerHTML = '<div class="pad">Stop not found. <a href="#/driver/route">Back</a></div>'; return; }
    const done = Deliver.DONE.includes(o.status);
    root.innerHTML = '<div class="page narrow"><a class="back" href="#/driver/route">‹ Route</a>' +
      '<section class="card dcard"><div class="row-between"><span class="muted small">STOP ' + o.seq + ' · ' + esc(o.code) + '</span>' + DUI.chip(o) + '</div>' +
      '<h1 class="big-name">' + esc(o.customer) + '</h1><p class="big-addr">' + esc(o.address) + (o.approx ? ' <span class="muted small">(pin approximate)</span>' : '') + '</p>' +
      (o.notes ? '<p class="note">📝 ' + esc(o.notes) + '</p>' : '') +
      '<ul class="dkv"><li><span>Window</span><b>' + esc(DUI.win(o)) + '</b></li>' + (DUI.eta(o) ? '<li><span>ETA</span><b>' + DUI.eta(o) + '</b></li>' : '') +
      '<li><span>Bags</span><b>' + o.bags + ' (' + (o.scanned || []).length + ' scanned)</b></li><li><span>Payment</span><b class="' + (o.amount > 0 ? 'collect' : '') + '">' + esc(DUI.pay(o)) + '</b></li>' +
      '<li><span>Store</span><b>' + esc((Deliver.store(o.storeId) || {}).name || '') + '</b></li></ul>' +
      '<div class="btn-grid three"><a class="btn big" href="' + esc(DUI.navUrl(o)) + '" target="_blank" rel="noopener">Navigate</a><a class="btn big" href="tel:' + esc(DUI.phoneDigits(o.phone)) + '">Call</a><a class="btn big" href="sms:' + esc(DUI.phoneDigits(o.phone)) + '">Text</a></div></section>' +
      (done ? '<section class="card dcard"><h2>Proof</h2>' + DUI.proofHtml(o) + '</section>' :
        '<section class="card dcard">' + (o.status !== 'arrived' ? '<button class="btn wide xl" id="arrived">I\'m here</button>' : '<p class="ok-text small center">You are at the door.</p>') +
        '<a class="btn ok wide xl" href="#/driver/route/proof/' + o.id + '">Delivered ✓</a><button class="btn danger-ghost wide big" id="fail">Couldn\'t deliver</button></section>') +
      '</div>';
    const a = $('#arrived', root);
    if (a) a.addEventListener('click', () => { Deliver.arrive(o, d.name); toast('Marked at the door'); App.render(); });
    const f = $('#fail', root);
    if (f) f.addEventListener('click', () => failSheet(o, d));
  }

  function failSheet(o, d) {
    const reasons = ['No one home', 'Wrong address', 'Customer refused', 'Could not get in', 'Damaged', 'Other'];
    const m = modal('Couldn\'t deliver ' + o.code, '<p class="muted small">Pick a reason. The bags go back to the store and the customer gets a text.</p><div class="btn-grid two">' +
      reasons.map((r) => '<button class="btn big reason" data-r="' + esc(r) + '">' + esc(r) + '</button>').join('') + '</div><label class="form mt">Note (optional)<input class="input" id="fail-note" placeholder="e.g. called twice, no answer"></label>' +
      '<div class="row-end"><button class="btn ghost" data-close>Cancel</button><button class="btn danger" id="fail-ok" disabled>Mark failed</button></div>', { sheet: true, noFocus: true });
    let reason = '';
    $$('.reason', m).forEach((b) => b.addEventListener('click', () => { reason = b.getAttribute('data-r'); $$('.reason', m).forEach((x) => x.classList.toggle('on', x === b)); $('#fail-ok', m).disabled = false; }));
    $('#fail-ok', m).addEventListener('click', () => { Deliver.fail(o, reason, $('#fail-note', m).value.trim(), d.name); closeModal(); toast('Marked failed'); go('#/driver/route'); });
  }

  function renderProof(root, user, d, id) {
    const o = Data.get('orders', id);
    if (!o || o.driverId !== d.id) { root.innerHTML = '<div class="pad">Stop not found.</div>'; return; }
    if (Deliver.DONE.includes(o.status)) { location.replace('#/driver/route/stop/' + o.id); return; }
    const cash = o.amount > 0;
    root.innerHTML = '<div class="page narrow"><a class="back" href="#/driver/route/stop/' + o.id + '">‹ Stop ' + o.seq + '</a><h1>Proof at the door</h1><p class="muted">' + esc(o.customer) + ' · ' + esc(o.code) + '</p>' +
      '<section class="card dcard"><h2>1. Photo</h2><label class="photo-btn"><input type="file" accept="image/*" capture="environment" id="photo-in" class="sr-only"><span id="photo-box" class="photo-box">📷 Take a photo of the bags at the door</span></label></section>' +
      '<section class="card dcard"><div class="row-between"><h2>2. Signature</h2><button class="mini" id="sig-clear">Clear</button></div><canvas id="sig" class="sigpad" aria-label="Sign here with a finger"></canvas><label class="form">Signed by<input class="input" id="sig-name" value="' + esc(o.customer) + '"></label></section>' +
      '<section class="card dcard"><h2>3. Payment</h2>' + (cash ?
        '<p>Collect <b class="collect">' + money(o.amount) + '</b></p><div class="seg-btns" role="group" aria-label="How did they pay"><button class="chip on" data-m="' + (o.payType === 'card' ? 'card' : 'cash') + '">' + (o.payType === 'card' ? 'Card' : 'Cash') + '</button><button class="chip" data-m="' + (o.payType === 'card' ? 'cash' : 'card') + '">' + (o.payType === 'card' ? 'Cash' : 'Card') + '</button><button class="chip" data-m="none">Not paid</button></div><label class="form mt">Amount collected<input class="input big-input" id="amt" type="number" inputmode="decimal" step="0.01" min="0" value="' + o.amount.toFixed(2) + '"></label>' + DUI.connectLater('Card payments at the door need a card reader account. For now, record what was paid.')
        : '<p class="ok-text">Prepaid — nothing to collect.</p>') + '</section>' +
      '<section class="card dcard"><label class="form">Note (optional)<input class="input" id="pnote" placeholder="e.g. left with neighbor in #2"></label><p class="err" id="perr" role="alert"></p><button class="btn ok wide xl" id="finish">Finish delivery</button></section></div>';
    let photo = '', method = cash ? (o.payType === 'card' ? 'card' : 'cash') : 'none';
    const pad = DUI.signaturePad($('#sig', root));
    $('#sig-clear', root).addEventListener('click', () => pad.clear());
    $('#photo-in', root).addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      try { photo = await DUI.photo(f); $('#photo-box', root).innerHTML = '<img src="' + photo + '" alt="Photo at the door"><span class="small">Tap to retake</span>'; }
      catch (err) { toast(err.message); }
    });
    $$('[data-m]', root).forEach((b) => b.addEventListener('click', () => {
      method = b.getAttribute('data-m'); $$('[data-m]', root).forEach((x) => x.classList.toggle('on', x === b));
      const amt = $('#amt', root); if (amt) { amt.disabled = method === 'none'; if (method === 'none') amt.value = '0.00'; else if (+amt.value === 0) amt.value = o.amount.toFixed(2); }
    }));
    $('#finish', root).addEventListener('click', () => {
      if (!photo && pad.isEmpty()) { $('#perr', root).textContent = 'Take a photo or get a signature first.'; return; }
      const btn = $('#finish', root); btn.disabled = true; btn.textContent = 'Saving…';
      const finish = (lat, lng) => {
        const collected = cash && method !== 'none' ? Math.round((+($('#amt', root).value) || 0) * 100) / 100 : 0;
        Deliver.deliver(o, { photo, signature: pad.isEmpty() ? '' : pad.toDataURL(), signedBy: $('#sig-name', root).value.trim(), collected, method: collected ? method : 'none', note: $('#pnote', root).value.trim(), lat, lng }, d.name);
        DUI.beep(true); toast('Delivered ✓'); go('#/driver/route');
      };
      const fallback = () => { const p = (Deliver.driver(d.id) || {}).position; finish(p ? p.lat : o.lat, p ? p.lng : o.lng); };
      if (navigator.geolocation && d.onShift) navigator.geolocation.getCurrentPosition((p) => finish(p.coords.latitude, p.coords.longitude), fallback, { timeout: 4000, maximumAge: 30000 });
      else fallback();
    });
  }

  function renderScan(root, user) {
    const d = me(user);
    if (!d) { root.innerHTML = '<div class="pad">Not a driver login.</div>'; return; }
    const other = Deliver.day(Data.today()).find((o) => o.driverId && o.driverId !== d.id && o.status !== 'new' && Deliver.isOpen(o));
    const first = Deliver.route(d.id)[0];
    root.innerHTML = '<div class="page narrow"><h1>Load your bike</h1><p class="muted">Scan the square code on every bag. A bag that belongs to another driver beeps red.</p>' +
      '<section class="card dcard"><div class="scan-box" id="scan-box"><video id="cam" playsinline muted></video><div class="scan-frame" aria-hidden="true"></div><button class="btn primary big" id="cam-on">Open camera</button></div>' +
      '<div id="scan-result" class="scan-result" role="status" aria-live="assertive"></div>' +
      '<form id="manual" class="form-row"><label class="sr-only" for="code-in">Bag code</label><input class="input big-input" id="code-in" placeholder="Or type the code, e.g. ' + esc(first ? first.code + '-1' : 'BD-1001-1') + '" autocapitalize="characters" autocomplete="off"><button class="btn primary big">Add</button></form></section>' +
      '<div id="bag-wrap"></div></div>';
    const handle = (code) => {
      const r = Deliver.scan(d.id, code, d.name);
      const el = $('#scan-result', root);
      el.className = 'scan-result ' + (r.kind === 'mine' ? 'good' : 'bad');
      el.textContent = r.msg;
      DUI.beep(r.kind === 'mine');
      if (!scanCtl) { const rect = el.getBoundingClientRect(); if (rect.top < 60 || rect.bottom > window.innerHeight - 70) el.scrollIntoView({ block: 'center' }); }
      if (r.kind === 'mine') checklist();
    };
    function checklist() {
      const list = Deliver.route(d.id).filter((o) => ['routed', 'loaded', 'out', 'arrived'].includes(o.status));
      const missing = [];
      list.forEach((o) => Deliver.bags(o).forEach((b) => { if (!(o.scanned || []).includes(b)) missing.push(b); }));
      const total = list.reduce((a, o) => a + o.bags, 0);
      const wrap = $('#bag-wrap', root); if (!wrap) return;
      const wasOpen = wrap.querySelector('details') && wrap.querySelector('details').open;
      wrap.innerHTML = (list.length ? '' : '<section class="card dcard"><p class="muted">No route yet, so there is nothing to load. Dispatch builds the routes.</p></section>') +
        (list.length ? '<section class="card dcard"><div class="row-between"><h2>' + (total - missing.length) + ' of ' + total + ' bags loaded</h2>' + (total && !missing.length ? '<span class="dchip s-delivered">All loaded</span>' : '') + '</div>' +
        '<ol class="bagcheck">' + list.map((o) => '<li><span class="seq" style="--c:' + DUI.color(d.id) + '">' + o.seq + '</span><span class="grow">' + esc(o.customer) + ' <span class="muted small">' + esc(o.code) + '</span></span><b class="' + ((o.scanned || []).length >= o.bags ? 'ok-text' : 'warn-text') + '">' + (o.scanned || []).length + '/' + o.bags + '</b></li>').join('') + '</ol>' +
        (total && !missing.length ? '<a class="btn primary wide big" href="#/driver/route">Back to route → Start</a>' : '') + '</section>' : '') +
        (missing.length || other ? '<details class="card dcard"' + (wasOpen ? ' open' : '') + '><summary>No camera? Tap a code to try it</summary><p class="muted small">Demo only: each button acts like scanning that label.</p><div class="chips">' + missing.slice(0, 12).map((b) => '<button class="chip" data-code="' + b + '">' + b + '</button>').join('') + (other ? '<button class="chip red" data-code="' + other.code + '-1">' + other.code + '-1 (another driver\'s)</button>' : '') + '</div></details>' : '');
      $$('[data-code]', wrap).forEach((b) => b.addEventListener('click', () => handle(b.getAttribute('data-code'))));
    }
    checklist();
    $('#manual', root).addEventListener('submit', (e) => { e.preventDefault(); const v = $('#code-in', root).value.trim(); if (v) handle(v); $('#code-in', root).value = ''; });
    $('#cam-on', root).addEventListener('click', async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('This browser has no camera access. Type the code instead.'); return; }
      try { scanCtl = await DUI.scanner($('#cam', root), handle); $('#cam-on', root).hidden = true; $('#scan-box', root).classList.add('live'); }
      catch (e) { toast('Camera not available: ' + (e.message || e.name) + '. Type the code instead.'); }
    });
  }

  function renderMapTab(root, user) {
    const d = me(user);
    root.innerHTML = '<div class="map-page"><div class="map-bar"><strong>My route</strong><span class="muted small">' + Deliver.route(d.id).length + ' stops</span><button class="btn small-btn" id="reroute">Best order from here</button></div><div id="dmap" class="map"></div></div>';
    mapCtl = DUI.routeMap($('#dmap', root), { driverId: d.id, onStop: (id) => { location.hash = '#/driver/route/stop/' + id; } });
    $('#reroute', root).addEventListener('click', () => { if (Deliver.reroute(d.id)) { toast('Stops re-ordered from where you are'); mapCtl.refit(); } else toast('No open stops'); });
  }

  function renderShift(root, user) {
    const d = me(user);
    const t = Data.today();
    const s = Deliver.summary(t, t).byDriver[d.id] || { delivered: 0, failed: 0, cash: 0, card: 0, pay: 0, open: 0 };
    const shifts = Data.list('shifts').filter((x) => x.driverId === d.id).slice(-5).reverse();
    root.innerHTML = '<div class="page narrow"><h1>My day</h1>' + shiftCard(d) +
      '<div class="stats">' + DUI.stat('Delivered', s.delivered, 'good') + DUI.stat('Failed', s.failed, s.failed ? 'bad' : '') + DUI.stat('Cash to hand in', money(s.cash)) + DUI.stat('Earned today', money(s.pay)) + '</div>' +
      '<section class="card dcard"><h2>Recent shifts</h2>' + (shifts.length ? '<ul class="plain">' + shifts.map((x) => '<li>' + esc(UI.fmtDate(x.date)) + ': ' + Deliver.fmtTime(new Date(x.start).getTime()) + ' – ' + (x.end ? Deliver.fmtTime(new Date(x.end).getTime()) : 'now') + '</li>').join('') + '</ul>' : '<p class="muted">No shifts yet.</p>') + '</section>' +
      '<section class="card dcard"><h2>Bike</h2><p>' + esc(d.vehicle || 'Bike') + (d.bikeId && Data.bike(d.bikeId) ? ' · BikeAds bike #' + esc(Data.bike(d.bikeId).number) + ' (its ad flags ride along)' : '') + '</p></section>' +
      '<section class="card dcard"><h2>Install on your phone</h2><p class="small">iPhone: Share → Add to Home Screen. Android: menu ⋮ → Install app. It opens full-screen and keeps working with no signal; everything you do is saved on the phone.</p></section></div>';
    bindShift(root, d, user);
  }

  window.DriverViews = {
    tabs: [
      { key: 'route', label: 'Route', icon: 'route', render: renderRoute },
      { key: 'scan', label: 'Scan', icon: 'scan', render: renderScan },
      { key: 'map', label: 'Map', icon: 'map', render: renderMapTab },
      { key: 'shift', label: 'My day', icon: 'clock', render: renderShift }
    ],
    teardown,
    resume(user) { const d = me(user); if (d && d.onShift) startGps(d); },
    stopGps
  };
})();
