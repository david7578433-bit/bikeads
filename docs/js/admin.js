/* Admin side: Map, Bikes & trackers, Bookings (calendar + list), Bookkeeping, Settings. */
(function () {
  'use strict';
  const { esc, money, fmtDate, fmtRange, ago, $, $$, toast, modal, closeModal, confirmBox, statusOf, badge, calendarHtml } = UI;

  let mapCtl = null;
  const view = { mapLoc: localStorage.getItem('bikeads.admin.mapLoc') || 'loc_wburg', bkMode: 'calendar', bkFilter: 'all', bkSearch: '', calY: null, calM: null, txSearch: '', txCat: '', txState: 'all' };

  function teardown() { if (mapCtl) { mapCtl.destroy(); mapCtl = null; } }

  function simNotice() {
    return TrackerFeed.isLive() ? '' : '<div class="notice"><strong>Demo positions.</strong> Bikes move on a simulator until your GPS trackers are connected. You can also drag a bike to place it by hand.</div>';
  }

  /* ================= MAP ================= */
  function renderMap(root, user) {
    const locs = Data.list('locations');
    if (view.mapLoc !== 'all' && !locs.find((l) => l.id === view.mapLoc)) view.mapLoc = locs[0] ? locs[0].id : 'all';
    root.innerHTML = '<section class="page map-page">' +
      '<div class="page-head"><h1>Live map</h1><div class="head-tools">' +
      '<label class="sr-only" for="locsel">Location</label><select id="locsel" class="select">' +
      '<option value="all"' + (view.mapLoc === 'all' ? ' selected' : '') + '>All locations</option>' +
      locs.map((l) => '<option value="' + l.id + '"' + (l.id === view.mapLoc ? ' selected' : '') + '>' + esc(l.name) + '</option>').join('') +
      '</select><button class="btn ghost" id="manage-locs">Locations</button>' +
      '<label class="switch"><input type="checkbox" id="dragmode"> <span>Move bikes</span></label></div></div>' +
      simNotice() + UI.mapControlsHtml(true) +
      '<div class="map-layout"><div class="map" id="map" aria-label="Street map with bikes"></div><aside class="map-side"><h2 class="side-title">Bikes here</h2><div id="bl"></div></aside></div></section>';
    const bm = UI.createBikeMap($('#map', root), { userId: user.id, locationId: view.mapLoc, admin: true, onEditBike: (id) => editBike(id, () => { bm.refresh(); list(); }), onChange: () => list() });
    mapCtl = bm;
    const list = () => { $('#bl', root).innerHTML = UI.bikeListHtml(bm, true); };
    list();
    UI.wireMapControls(root, bm, list);
    root.addEventListener('click', (e) => { const eb = e.target.closest('[data-edit-bike]'); if (eb) editBike(eb.getAttribute('data-edit-bike'), () => { bm.refresh(); list(); }); });
    $('#locsel', root).addEventListener('change', (e) => { view.mapLoc = e.target.value; localStorage.setItem('bikeads.admin.mapLoc', view.mapLoc); bm.setLocation(view.mapLoc); list(); });
    $('#dragmode', root).addEventListener('change', (e) => { bm.setDrag(e.target.checked); toast(e.target.checked ? 'Drag any bike to place it by hand' : 'Bikes locked'); });
    $('#manage-locs', root).addEventListener('click', () => manageLocations(bm, () => App.render()));
  }

  function manageLocations(bm, done) {
    const draw = () => {
      const locs = Data.list('locations');
      const m = modal('Locations', '<p class="muted">These are the areas you and your clients pick from. To add one, move the map to the area first, then tap "Add at map centre".</p>' +
        '<ul class="plain-list">' + locs.map((l) => '<li><input class="input" data-loc-name="' + l.id + '" value="' + esc(l.name) + '" aria-label="Location name"><span class="muted small">' + Data.list('bikes').filter((b) => b.locationId === l.id).length + ' bikes</span><button class="mini" data-loc-del="' + l.id + '">Delete</button></li>').join('') + '</ul>' +
        '<div class="form-row"><input class="input" id="newloc" placeholder="New location name, e.g. Crown Heights"><button class="btn primary" id="addloc">Add at map centre</button></div>' +
        '<div class="row-end"><button class="btn primary" id="savelocs">Save names</button></div>');
      m.querySelector('#addloc').addEventListener('click', () => {
        const name = m.querySelector('#newloc').value.trim(); if (!name) { toast('Type a name first'); return; }
        const c = bm.center(); Data.put('locations', { name, lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5), zoom: Math.max(14, bm.zoom()) }); toast('Location added'); draw();
      });
      m.querySelector('#savelocs').addEventListener('click', () => {
        $$('[data-loc-name]', m).forEach((i) => Data.put('locations', { id: i.getAttribute('data-loc-name'), name: i.value.trim() || 'Unnamed' }));
        closeModal(); toast('Saved'); done();
      });
      $$('[data-loc-del]', m).forEach((btn) => btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-loc-del');
        if (Data.list('bikes').some((b) => b.locationId === id)) { toast('Move its bikes to another location first'); return; }
        Data.remove('locations', id); draw();
      }));
    };
    draw();
  }

  /* ================= BIKES & TRACKERS ================= */
  function renderBikes(root) {
    const bikes = Data.list('bikes').sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
    const locs = Data.list('locations');
    root.innerHTML = '<section class="page"><div class="page-head"><h1>Bikes &amp; trackers</h1><button class="btn primary" id="addbike">+ Add tracker</button></div>' +
      simNotice() +
      '<div class="cards">' + bikes.map((b) => {
        const loc = locs.find((l) => l.id === b.locationId);
        return '<article class="card bike-card"><div class="bike-top"><span class="num big">' + esc(b.number) + '</span><div><h3>Bike #' + esc(b.number) + '</h3><div class="muted small">Tracker ' + esc(b.trackerId) + '</div></div></div>' +
          '<dl class="kv"><dt>Location</dt><dd>' + esc(loc ? loc.name : '—') + '</dd>' +
          '<dt><span class="sw red"></span> Advertiser</dt><dd>' + esc(b.advertiser || '—') + '</dd>' +
          '<dt><span class="sw blue"></span> Marketing</dt><dd>' + esc(b.marketing || '—') + '</dd>' +
          '<dt>Last position</dt><dd>' + (b.position ? (b.position.source === 'manual' ? 'by hand' : b.position.source === 'live' ? 'live GPS' : 'simulated') + ', ' + ago(b.position.at) : 'none yet') + '</dd></dl>' +
          '<div class="row-end"><button class="btn ghost" data-del="' + b.id + '">Delete</button><button class="btn" data-edit="' + b.id + '">Edit</button></div></article>';
      }).join('') + '</div>' +
      '<div class="card info"><h2>Connecting your real trackers</h2><p>Each bike is matched to its GPS tracker by the tracker ID (usually the IMEI printed on the device or its box). Once we know the tracker brand, live positions replace the simulator automatically — nothing else changes.</p></div></section>';
    $('#addbike', root).addEventListener('click', () => editBike(null, () => App.render()));
    root.addEventListener('click', (e) => {
      const ed = e.target.closest('[data-edit]'); if (ed) editBike(ed.getAttribute('data-edit'), () => App.render());
      const del = e.target.closest('[data-del]');
      if (del) {
        const b = Data.bike(del.getAttribute('data-del'));
        confirmBox('Delete bike #' + b.number + '?', 'The tracker is removed from the map. Past bookings keep their record.', 'Delete', () => { Data.remove('bikes', b.id); toast('Bike deleted'); App.render(); }, true);
      }
    });
  }

  function editBike(id, done) {
    const b = id ? Data.bike(id) : null;
    const locs = Data.list('locations');
    const nextNum = String(Data.list('bikes').reduce((m, x) => Math.max(m, parseInt(x.number, 10) || 0), 0) + 1).padStart(2, '0');
    const advertisers = Array.from(new Set(Data.list('bikes').map((x) => x.advertiser).concat(Data.list('users').filter((u) => u.role === 'client').map((u) => u.company)).filter(Boolean)));
    const marketers = Array.from(new Set(Data.list('bikes').map((x) => x.marketing).filter(Boolean)));
    const m = modal(b ? 'Edit bike #' + b.number : 'Add a tracker', '<form id="bikeform" class="form">' +
      '<label>Tracker ID (IMEI)<input class="input" name="trackerId" required inputmode="numeric" value="' + esc(b ? b.trackerId : '') + '" placeholder="e.g. 864512040318200"></label>' +
      '<label>Bike number<input class="input" name="number" required value="' + esc(b ? b.number : nextNum) + '"></label>' +
      '<label>Location<select class="select" name="locationId">' + locs.map((l) => '<option value="' + l.id + '"' + (b && b.locationId === l.id ? ' selected' : '') + '>' + esc(l.name) + '</option>').join('') + '</select></label>' +
      '<label><span><span class="sw red"></span> Red flag: advertising company</span><input class="input" name="advertiser" list="dl-adv" value="' + esc(b ? b.advertiser : '') + '"></label>' +
      '<label><span><span class="sw blue"></span> Blue flag: marketing company</span><input class="input" name="marketing" list="dl-mkt" value="' + esc(b ? b.marketing : '') + '"></label>' +
      '<label>Notes<textarea class="input" name="notes" rows="2">' + esc(b ? b.notes : '') + '</textarea></label>' +
      '<datalist id="dl-adv">' + advertisers.map((a) => '<option value="' + esc(a) + '">').join('') + '</datalist>' +
      '<datalist id="dl-mkt">' + marketers.map((a) => '<option value="' + esc(a) + '">').join('') + '</datalist>' +
      '<div class="row-end"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary" type="submit">' + (b ? 'Save' : 'Add bike') + '</button></div></form>');
    m.querySelector('#bikeform').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      Object.keys(fd).forEach((k) => { fd[k] = String(fd[k]).trim(); });
      const clash = Data.list('bikes').find((x) => x.id !== (b && b.id) && (x.trackerId === fd.trackerId || x.number === fd.number));
      if (clash) { toast(clash.trackerId === fd.trackerId ? 'That tracker ID is already on bike #' + clash.number : 'Bike number already used'); return; }
      const rec = Object.assign({}, b ? { id: b.id } : {}, fd);
      const loc = Data.get('locations', fd.locationId);
      if (!b || !b.position || b.locationId !== fd.locationId) rec.position = { lat: loc.lat + (Math.random() - 0.5) * 0.004, lng: loc.lng + (Math.random() - 0.5) * 0.005, at: new Date().toISOString(), source: 'sim' };
      Data.put('bikes', rec);
      closeModal(); toast(b ? 'Bike saved' : 'Tracker added as bike #' + fd.number); done && done();
    });
  }

  /* ================= BOOKINGS ================= */
  function renderBookings(root) {
    const now = new Date();
    if (view.calY === null) { view.calY = now.getFullYear(); view.calM = now.getMonth(); }
    const pending = Data.list('bookings').filter((b) => b.status === 'pending');
    root.innerHTML = '<section class="page"><div class="page-head"><h1>Bookings</h1><div class="head-tools">' +
      '<div class="seg" role="tablist"><button role="tab" class="' + (view.bkMode === 'calendar' ? 'on' : '') + '" data-mode="calendar" aria-selected="' + (view.bkMode === 'calendar') + '">Calendar</button><button role="tab" class="' + (view.bkMode === 'list' ? 'on' : '') + '" data-mode="list" aria-selected="' + (view.bkMode === 'list') + '">List</button></div>' +
      '<button class="btn primary" id="addbk">+ Add booking</button></div></div>' +
      (pending.length ? '<div class="card pending-box"><h2>' + pending.length + ' request' + (pending.length > 1 ? 's' : '') + ' waiting for you</h2>' + pending.sort((a, b) => a.start.localeCompare(b.start)).map(bookingRow).join('') + '</div>' : '<div class="card muted">No requests waiting. New client requests show up here.</div>') +
      '<div id="bkbody"></div></section>';
    const body = $('#bkbody', root);
    if (view.bkMode === 'calendar') drawCal(body); else drawList(body);
    root.addEventListener('click', onBookingClick);
    $('#addbk', root).addEventListener('click', () => editBooking(null));
    $$('[data-mode]', root).forEach((b) => b.addEventListener('click', () => { view.bkMode = b.getAttribute('data-mode'); App.render(); }));
  }

  function bookingRow(b) {
    const s = statusOf(b);
    return '<div class="bk-row"><div class="bk-main"><div class="bk-title"><strong>' + esc(b.company) + '</strong> ' + badge(b) + '</div>' +
      '<div class="small">' + fmtRange(b.start, b.end) + ' · ' + Data.days(b.start, b.end) + ' days · ' + b.bikeIds.length + ' bikes (' + b.bikeIds.map(Data.bikeLabel).join(', ') + ')' + (b.mode === 'count' ? ' · client asked for ' + b.bikeIds.length + ' bikes' : b.mode !== 'specific' ? ' · asked for any ' + b.mode.replace('any', '') : '') + '</div>' +
      (b.balance != null ? '<div class="small muted">' + esc(b.clientName) + ' · total ' + money(b.total) + (b.discount ? ' (discount −' + money(b.discount) + ')' : '') +
        ' · deposit ' + money(b.deposit) + (b.depositPaid ? ' <b>paid</b>' : b.payment && b.payment.method === 'zelle' ? ' · Zelle, note ' + esc(b.payment.ref || '') + ' · <b class="zelle-wait">awaiting Zelle confirmation</b>' : ' due') +
        ' · balance ' + money(b.balance) + (b.balancePaid ? ' <b>paid</b>' : ' <b class="zelle-wait">due</b>') + '</div>' :
      '<div class="small muted">' + esc(b.clientName) + ' · total ' + money(b.total) + (b.payment && b.payment.method === 'zelle' ? ' · Zelle, note ' + esc(b.payment.ref || '') + (b.depositPaid ? ' · <b>paid</b>' : ' · <b class="zelle-wait">awaiting Zelle confirmation</b>') : b.payment && b.payment.last4 ? ' · paid in full by ' + esc(b.payment.brand) + ' •••• ' + esc(b.payment.last4) + ' (demo)' : b.payment && b.payment.brand ? ' · paid in full with ' + esc(b.payment.brand) + ' (demo)' : ' · deposit ' + money(b.deposit) + (b.depositPaid ? ' paid (demo)' : ' not paid')) + '</div>') +
      (b.setupTotal != null ? '<div class="small muted">Printing &amp; setup ' + money(b.setupTotal) + ' · weekly ' + money(b.weeklyTotal) + ' (' + b.weeks + ' wk)' + (b.areaName ? ' · area: ' + esc(b.areaName) : '') + (b.areaNote ? ' (' + esc(b.areaNote) + ')' : '') + (b.contactPhone ? ' · ' + esc(b.contactPhone) : '') + (b.contactEmail ? ' · ' + esc(b.contactEmail) : '') + '</div>' : '') + '</div>' +
      '<div class="bk-actions">' + (b.payment && b.payment.method === 'zelle' && !b.depositPaid ? '<button class="btn ok" data-zelle-paid="' + b.id + '">Mark Zelle paid</button>' : '') +
      (b.balance > 0 && b.depositPaid && !b.balancePaid && (s === 'approved' || s === 'active' || s === 'completed' || b.status === 'approved') ? '<button class="btn ok" data-balance-paid="' + b.id + '">Mark balance paid</button>' : '') + (s === 'pending' ? '<button class="btn ok" data-approve="' + b.id + '">✓ Approve</button><button class="btn danger-ghost" data-decline="' + b.id + '">✕ Decline</button>' : '') +
      '<button class="btn ghost" data-open="' + b.id + '">Edit</button></div></div>';
  }

  function drawCal(body) {
    const bks = Data.list('bookings').filter((b) => b.status !== 'cancelled');
    body.innerHTML = '<div class="card cal-card admin-cal">' + calendarHtml(view.calY, view.calM, {
      cell: (ds) => {
        const on = bks.filter((b) => ds >= b.start && ds <= b.end);
        if (!on.length) return '';
        const shown = on.slice(0, 3).map((b) => '<button class="cal-chip st-' + statusOf(b) + '" data-open="' + b.id + '" title="' + esc(b.company) + '"><span class="cn-long">' + esc(b.company.split(' ')[0]) + ' · </span>' + b.bikeIds.length + '<span class="cn-long"> bikes</span></button>').join('');
        return '<div class="cal-chips">' + shown + (on.length > 3 ? '<span class="small muted">+' + (on.length - 3) + '</span>' : '') + '</div>';
      }
    }) + '<div class="legend"><span class="badge st-pending">Pending</span><span class="badge st-approved">Approved</span><span class="badge st-completed">Completed</span><span class="badge st-declined">Declined</span><span class="muted small">Tap a booking to open it, or an empty day to add one.</span></div></div>';
    $$('[data-cal-nav]', body).forEach((b) => b.addEventListener('click', () => { const d = new Date(view.calY, view.calM + (+b.getAttribute('data-cal-nav')), 1); view.calY = d.getFullYear(); view.calM = d.getMonth(); drawCal(body); }));
    $$('.cal-cell[data-date]', body).forEach((c) => c.addEventListener('click', (e) => { if (e.target.closest('[data-open]')) return; editBooking(null, c.getAttribute('data-date')); }));
  }

  function drawList(body) {
    const t = Data.today();
    let list = Data.list('bookings');
    const f = view.bkFilter;
    list = list.filter((b) => {
      const s = statusOf(b);
      if (f === 'upcoming') return (s === 'approved' || s === 'pending') && b.end >= t;
      if (f === 'past') return b.end < t;
      if (f !== 'all') return s === f;
      return true;
    });
    if (view.bkSearch) { const q = view.bkSearch.toLowerCase(); list = list.filter((b) => (b.company + ' ' + b.clientName + ' ' + b.bikeIds.map(Data.bikeLabel).join(' ') + ' ' + b.id).toLowerCase().includes(q)); }
    list.sort((a, b) => b.start.localeCompare(a.start));
    const filters = [['all', 'All'], ['pending', 'Pending'], ['upcoming', 'Upcoming'], ['past', 'Past'], ['declined', 'Declined']];
    body.innerHTML = '<div class="card"><div class="filters"><div class="seg wrap">' + filters.map(([k, l]) => '<button class="' + (f === k ? 'on' : '') + '" data-bkf="' + k + '">' + l + '</button>').join('') + '</div>' +
      '<input class="input search" id="bksearch" type="search" placeholder="Search company, client, bike…" value="' + esc(view.bkSearch) + '"></div>' +
      (list.length ? list.map(bookingRow).join('') : '<p class="muted pad">No bookings match.</p>') + '</div>';
    $$('[data-bkf]', body).forEach((b) => b.addEventListener('click', () => { view.bkFilter = b.getAttribute('data-bkf'); drawList(body); }));
    const s = $('#bksearch', body);
    s.addEventListener('input', () => { view.bkSearch = s.value; clearTimeout(s._t); s._t = setTimeout(() => { drawList(body); const n = $('#bksearch', body); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); });
  }

  function onBookingClick(e) {
    const ap = e.target.closest('[data-approve]'); if (ap) { approve(ap.getAttribute('data-approve')); return; }
    const de = e.target.closest('[data-decline]'); if (de) { decline(de.getAttribute('data-decline')); return; }
    const zp = e.target.closest('[data-zelle-paid]'); if (zp) { zellePaid(zp.getAttribute('data-zelle-paid')); return; }
    const bp = e.target.closest('[data-balance-paid]'); if (bp) { balancePaid(bp.getAttribute('data-balance-paid')); return; }
    const op = e.target.closest('[data-open]'); if (op) { e.stopPropagation(); editBooking(op.getAttribute('data-open')); }
  }

  function addHistory(b, action) { return (b.history || []).concat([{ at: new Date().toISOString(), by: App.user().name, action }]); }

  /* v4.1: a Zelle booking waits until the admin sees the money and marks it paid. */
  function zellePaid(id) {
    const b = Data.get('bookings', id); if (!b) return;
    const amt = b.balance != null ? b.deposit : b.total; /* Nov 8 2026: the client pays a deposit first */
    confirmBox('Zelle received?', 'Mark ' + money(amt) + ' from ' + esc(b.company) + ' (note ' + esc((b.payment && b.payment.ref) || '') + ') as paid?', 'Mark paid', () => {
      Data.put('bookings', { id, depositPaid: true, payment: Object.assign({}, b.payment, { status: 'paid', paidAt: new Date().toISOString() }), history: addHistory(b, 'Zelle payment received, marked paid') });
      if (b.status === 'approved' && !Data.list('transactions').some((t) => t.bookingId === id && t.category === 'Booking payment')) Data.put('transactions', { date: Data.today(), description: 'Zelle ' + ((b.payment && b.payment.ref) || '') + ' - ' + b.company, amount: amt, category: b.balance != null ? 'Booking deposit' : 'Booking payment', bookingId: id, reconciled: false, createdAt: new Date().toISOString() });
      toast('Marked paid'); App.render();
    });
  }

  /* Nov 8 2026: the balance (total minus the deposit) is paid later; the admin marks it paid and it goes into the books. */
  function balancePaid(id) {
    const b = Data.get('bookings', id); if (!b) return;
    confirmBox('Balance received?', 'Mark the balance of ' + money(b.balance) + ' from ' + esc(b.company) + ' as paid?', 'Mark paid', () => {
      Data.put('bookings', { id, balancePaid: true, balancePaidAt: new Date().toISOString(), history: addHistory(b, 'Balance ' + money(b.balance) + ' received, marked paid') });
      if (!Data.list('transactions').some((t) => t.bookingId === id && t.category === 'Booking balance')) Data.put('transactions', { date: Data.today(), description: 'Balance - ' + b.company, amount: b.balance, category: 'Booking balance', bookingId: id, reconciled: false, createdAt: new Date().toISOString() });
      toast('Balance marked paid'); App.render();
    });
  }

  function approve(id) {
    const b = Data.get('bookings', id);
    const clash = Data.list('bookings').filter((o) => o.id !== id && o.status === 'approved' && Data.overlaps(b.start, b.end, o.start, o.end) && o.bikeIds.some((x) => b.bikeIds.includes(x)));
    const go = () => {
      Data.put('bookings', { id, status: 'approved', history: addHistory(b, 'Approved') });
      let note = 'Booking approved';
      if (b.depositPaid && !Data.list('transactions').some((t) => t.bookingId === id && t.category === 'Booking deposit')) {
        Data.put('transactions', { date: Data.today(), description: (b.payment && b.payment.last4 ? 'Card payment (demo) ' + b.payment.brand + ' ' + b.payment.last4 + ' - ' : b.payment && b.payment.brand ? b.payment.brand + ' payment ' + (b.payment.ref ? b.payment.ref + ' ' : '(demo) ') + '- ' : 'Deposit ' + Data.settings().depositPct + '% - ') + b.company, amount: b.deposit, category: 'Booking deposit', bookingId: id, reconciled: false, createdAt: new Date().toISOString() });
        note += ' · deposit added to the books';
      }
      toast(note); App.render();
    };
    if (clash.length) confirmBox('Bikes already booked', 'Some of these bikes are already approved for ' + clash.map((c) => c.company).join(', ') + ' on overlapping days. Approve anyway?', 'Approve anyway', go);
    else go();
  }
  function decline(id) {
    const b = Data.get('bookings', id);
    confirmBox('Decline this request?', b.company + ', ' + fmtRange(b.start, b.end) + ', ' + b.bikeIds.length + ' bikes. The bikes become free again.', 'Decline', () => {
      Data.put('bookings', { id, status: 'declined', history: addHistory(b, 'Declined') }); toast('Request declined'); App.render();
    }, true);
  }

  function editBooking(id, startDate) {
    const b = id ? Data.get('bookings', id) : null;
    const clients = Data.list('users').filter((u) => u.role === 'client');
    const st = b ? b.start : (startDate || Data.today());
    const en = b ? b.end : st;
    const m = modal(b ? 'Booking · ' + b.company : 'Add a booking', '<form id="bkform" class="form">' +
      '<label>Client<select class="select" name="clientId"><option value="">— Walk-in / other —</option>' + clients.map((c) => '<option value="' + c.id + '"' + (b && b.clientId === c.id ? ' selected' : '') + '>' + esc(c.company + ' (' + c.name + ')') + '</option>').join('') + '</select></label>' +
      '<label>Company (red flag name)<input class="input" name="company" required value="' + esc(b ? b.company : '') + '"></label>' +
      '<div class="two"><label>From<input class="input" type="date" name="start" required value="' + st + '"></label><label>Till<input class="input" type="date" name="end" required value="' + en + '"></label></div>' +
      '<fieldset><legend>Bikes</legend><div class="bike-pick" id="bkpick"></div></fieldset>' +
      '<div class="two"><label>Status<select class="select" name="status">' + ['pending', 'approved', 'declined', 'completed', 'cancelled'].map((s) => '<option value="' + s + '"' + ((b ? b.status : 'approved') === s ? ' selected' : '') + '>' + UI.STATUS_LABEL[s] + '</option>').join('') + '</select></label>' +
      '<label>Price per bike per day ($)<input class="input" type="number" step="0.01" min="0" name="pricePerDay" value="' + (b ? b.pricePerDay : Data.settings().pricePerBikeDay) + '"></label></div>' +
      '<div class="two"><label>Total ($)<input class="input" type="number" step="0.01" min="0" name="total" value="' + (b ? b.total : 0) + '"></label><label>Deposit ($)<input class="input" type="number" step="0.01" min="0" name="deposit" value="' + (b ? b.deposit : 0) + '"></label></div>' +
      '<button type="button" class="btn ghost small-btn" id="recalc">Recalculate total and ' + Data.settings().depositPct + '% deposit</button>' +
      '<label class="check"><input type="checkbox" name="depositPaid"' + (b && b.depositPaid ? ' checked' : '') + '> Deposit received</label>' +
      '<label>Notes<textarea class="input" name="notes" rows="2">' + esc(b ? b.notes : '') + '</textarea></label>' +
      (b ? '<details class="history"><summary>History (' + (b.history || []).length + ')</summary><ul>' + (b.history || []).map((h) => '<li>' + fmtDate(h.at, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' · ' + esc(h.action) + ' · ' + esc(h.by) + '</li>').join('') + '</ul></details>' : '') +
      '<div class="row-end">' + (b ? '<button type="button" class="btn danger-ghost" id="delbk">Delete</button>' : '') + '<button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary" type="submit">Save</button></div></form>');
    const form = m.querySelector('#bkform');
    const chosen = new Set(b ? b.bikeIds : []);
    const drawPick = () => {
      const s = form.start.value, e = form.end.value;
      const busy = s && e ? Data.busyBikeIds(s, e, b && b.id) : new Set();
      m.querySelector('#bkpick').innerHTML = Data.list('bikes').sort((x, y) => x.number.localeCompare(y.number, undefined, { numeric: true })).map((k) =>
        '<label class="pick' + (busy.has(k.id) ? ' busy' : '') + '"><input type="checkbox" value="' + k.id + '"' + (chosen.has(k.id) ? ' checked' : '') + '><span>#' + esc(k.number) + (busy.has(k.id) ? '<small>booked</small>' : '') + '</span></label>').join('');
    };
    drawPick();
    form.clientId.addEventListener('change', () => { const c = clients.find((x) => x.id === form.clientId.value); if (c) form.company.value = c.company; });
    form.start.addEventListener('change', () => { if (form.end.value < form.start.value) form.end.value = form.start.value; drawPick(); });
    form.end.addEventListener('change', drawPick);
    m.querySelector('#bkpick').addEventListener('change', (e) => { if (e.target.checked) chosen.add(e.target.value); else chosen.delete(e.target.value); });
    m.querySelector('#recalc').addEventListener('click', () => {
      const days = Data.days(form.start.value, form.end.value);
      const total = Math.round(chosen.size * days * (+form.pricePerDay.value || 0) * 100) / 100;
      form.total.value = total; form.deposit.value = Math.round(total * Data.settings().depositPct) / 100;
    });
    if (b) m.querySelector('#delbk').addEventListener('click', () => confirmBox('Delete this booking?', 'This removes it from history too. To keep a record, set the status to Cancelled instead.', 'Delete', () => { Data.remove('bookings', b.id); toast('Booking deleted'); App.render(); }, true));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (form.end.value < form.start.value) { toast('"Till" must be on or after "From"'); return; }
      if (!chosen.size) { toast('Pick at least one bike'); return; }
      const c = clients.find((x) => x.id === form.clientId.value);
      const rec = {
        clientId: form.clientId.value, clientName: c ? c.name : (b ? b.clientName : 'Added by admin'), company: form.company.value.trim(),
        start: form.start.value, end: form.end.value, bikeIds: Array.from(chosen), status: form.status.value,
        pricePerDay: +form.pricePerDay.value || 0, total: +form.total.value || 0, deposit: +form.deposit.value || 0,
        depositPaid: form.depositPaid.checked, notes: form.notes.value
      };
      if (b) { rec.id = b.id; rec.history = addHistory(b, 'Edited by admin' + (b.status !== rec.status ? ' (status → ' + UI.STATUS_LABEL[rec.status] + ')' : '')); }
      else { rec.mode = 'specific'; rec.createdAt = new Date().toISOString(); rec.history = addHistory({}, 'Added by admin'); }
      Data.put('bookings', rec); closeModal(); toast('Booking saved'); App.render();
    });
  }

  /* ================= BOOKKEEPING ================= */
  const CATS = ['Booking deposit', 'Booking payment', 'Delivery income', 'Driver pay', 'Owner investment', 'Equipment', 'Printing', 'Maintenance', 'Subscriptions', 'Insurance', 'Marketing', 'Bank fees', 'Other']
    /* delivery-only categories show only when the delivery module is on (js/config.js) */
    .filter((c) => (window.FEATURES && FEATURES.delivery) || !['Delivery income', 'Driver pay'].includes(c));

  function balances() {
    const s = Data.settings();
    const tx = Data.list('transactions');
    const bank = tx.reduce((a, t) => a + t.amount, s.openingBalance || 0);
    const cleared = tx.filter((t) => t.reconciled).reduce((a, t) => a + t.amount, s.openingBalance || 0);
    const ym = Data.today().slice(0, 7);
    const mIn = tx.filter((t) => t.date.startsWith(ym) && t.amount > 0).reduce((a, t) => a + t.amount, 0);
    const mOut = tx.filter((t) => t.date.startsWith(ym) && t.amount < 0).reduce((a, t) => a + t.amount, 0);
    return { bank, cleared, mIn, mOut, open: tx.filter((t) => !t.reconciled).length };
  }

  function renderBooks(root) {
    const s = Data.settings();
    const bal = balances();
    const all = Data.list('transactions').sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
    let run = s.openingBalance || 0;
    const withRun = all.map((t) => { run += t.amount; return Object.assign({ run }, t); });
    let rows = withRun.slice().reverse();
    if (view.txSearch) { const q = view.txSearch.toLowerCase(); rows = rows.filter((t) => (t.description + ' ' + t.category + ' ' + t.amount).toLowerCase().includes(q)); }
    if (view.txCat) rows = rows.filter((t) => t.category === view.txCat);
    if (view.txState === 'open') rows = rows.filter((t) => !t.reconciled);
    if (view.txState === 'done') rows = rows.filter((t) => t.reconciled);
    const cats = Array.from(new Set(CATS.concat(all.map((t) => t.category))));
    root.innerHTML = '<section class="page"><div class="page-head"><h1>Bookkeeping</h1><div class="head-tools"><button class="btn ghost" id="reconcile">Reconcile</button><button class="btn ghost" id="csv">Export CSV</button><button class="btn primary" id="addtx">+ Transaction</button></div></div>' +
      '<div class="stats"><div class="stat"><span>Bank balance</span><strong>' + money(bal.bank) + '</strong></div><div class="stat"><span>Reconciled balance</span><strong>' + money(bal.cleared) + '</strong></div>' +
      '<div class="stat"><span>Money in this month</span><strong class="pos">' + money(bal.mIn) + '</strong></div><div class="stat"><span>Money out this month</span><strong class="neg">' + money(bal.mOut) + '</strong></div></div>' +
      '<div class="card"><div class="filters"><input class="input search" id="txsearch" type="search" placeholder="Search transactions…" value="' + esc(view.txSearch) + '">' +
      '<select class="select" id="txcat"><option value="">All categories</option>' + cats.map((c) => '<option' + (c === view.txCat ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select>' +
      '<div class="seg"><button data-txs="all" class="' + (view.txState === 'all' ? 'on' : '') + '">All</button><button data-txs="open" class="' + (view.txState === 'open' ? 'on' : '') + '">Not reconciled (' + bal.open + ')</button><button data-txs="done" class="' + (view.txState === 'done' ? 'on' : '') + '">Reconciled</button></div></div>' +
      '<div class="table-wrap"><table class="tx"><thead><tr><th>Date</th><th>Description</th><th class="r">In</th><th class="r">Out</th><th class="r">Balance</th><th class="c">Rec.</th><th></th></tr></thead><tbody>' +
      (rows.length ? rows.map((t) => '<tr><td class="nowrap">' + fmtDate(t.date, { month: 'short', day: 'numeric', year: '2-digit' }) + '</td><td><div>' + esc(t.description) + '</div><div class="small muted">' + esc(t.category) + (t.bookingId ? ' · booking ' + esc((Data.get('bookings', t.bookingId) || {}).company || t.bookingId) : '') + '</div></td>' +
        '<td class="r pos">' + (t.amount > 0 ? money(t.amount) : '') + '</td><td class="r neg">' + (t.amount < 0 ? money(-t.amount) : '') + '</td><td class="r nowrap">' + money(t.run) + '</td>' +
        '<td class="c"><input type="checkbox" data-rec="' + t.id + '"' + (t.reconciled ? ' checked' : '') + ' aria-label="Reconciled"></td><td><button class="mini" data-tx="' + t.id + '">Edit</button></td></tr>').join('') : '<tr><td colspan="7" class="muted">No transactions match.</td></tr>') +
      '</tbody></table></div><p class="small muted">Opening balance ' + money(s.openingBalance || 0) + ' (change it in Settings). Tick "Rec." when a transaction appears on your bank statement.</p></div>' +
      reconHistory() + '</section>';
    $('#addtx', root).addEventListener('click', () => editTx(null));
    $('#csv', root).addEventListener('click', () => exportCsv(withRun));
    $('#reconcile', root).addEventListener('click', reconcile);
    const se = $('#txsearch', root);
    se.addEventListener('input', () => { view.txSearch = se.value; clearTimeout(se._t); se._t = setTimeout(() => { App.render(); const n = $('#txsearch'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 300); });
    $('#txcat', root).addEventListener('change', (e) => { view.txCat = e.target.value; App.render(); });
    $$('[data-txs]', root).forEach((b) => b.addEventListener('click', () => { view.txState = b.getAttribute('data-txs'); App.render(); }));
    root.addEventListener('change', (e) => { const r = e.target.closest('[data-rec]'); if (r) { Data.put('transactions', { id: r.getAttribute('data-rec'), reconciled: r.checked }); App.render(); } });
    root.addEventListener('click', (e) => { const t = e.target.closest('[data-tx]'); if (t) editTx(t.getAttribute('data-tx')); });
  }

  function reconHistory() {
    const r = Data.list('reconciliations').sort((a, b) => b.date.localeCompare(a.date));
    if (!r.length) return '';
    return '<div class="card"><h2>Past reconciliations</h2><ul class="plain-list">' + r.map((x) => '<li><span>Statement ' + fmtDate(x.date, { month: 'short', day: 'numeric', year: 'numeric' }) + '</span><strong>' + money(x.balance) + '</strong><span class="small muted">' + x.count + ' transactions · done ' + fmtDate(x.at) + '</span></li>').join('') + '</ul></div>';
  }

  function editTx(id) {
    const t = id ? Data.get('transactions', id) : null;
    const bks = Data.list('bookings').filter((b) => b.status !== 'declined').sort((a, b) => b.start.localeCompare(a.start));
    const m = modal(t ? 'Edit transaction' : 'New transaction', '<form id="txform" class="form">' +
      '<div class="seg big" role="radiogroup"><label><input type="radio" name="dir" value="in"' + (!t || t.amount >= 0 ? ' checked' : '') + '> Money in</label><label><input type="radio" name="dir" value="out"' + (t && t.amount < 0 ? ' checked' : '') + '> Money out</label></div>' +
      '<div class="two"><label>Date<input class="input" type="date" name="date" required value="' + (t ? t.date : Data.today()) + '"></label><label>Amount ($)<input class="input" type="number" step="0.01" min="0" name="amount" required inputmode="decimal" value="' + (t ? Math.abs(t.amount) : '') + '"></label></div>' +
      '<label>Description<input class="input" name="description" required value="' + esc(t ? t.description : '') + '" placeholder="e.g. Deposit from Fresh Basket"></label>' +
      '<label>Category<input class="input" name="category" list="dl-cat" value="' + esc(t ? t.category : '') + '"><datalist id="dl-cat">' + CATS.map((c) => '<option value="' + esc(c) + '">').join('') + '</datalist></label>' +
      '<label>Linked booking (optional)<select class="select" name="bookingId"><option value="">None</option>' + bks.map((b) => '<option value="' + b.id + '"' + (t && t.bookingId === b.id ? ' selected' : '') + '>' + esc(b.company + ' · ' + fmtRange(b.start, b.end)) + '</option>').join('') + '</select></label>' +
      '<label class="check"><input type="checkbox" name="reconciled"' + (t && t.reconciled ? ' checked' : '') + '> On the bank statement (reconciled)</label>' +
      '<div class="row-end">' + (t ? '<button type="button" class="btn danger-ghost" id="deltx">Delete</button>' : '') + '<button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">Save</button></div></form>');
    const f = m.querySelector('#txform');
    if (t) m.querySelector('#deltx').addEventListener('click', () => confirmBox('Delete transaction?', t.description, 'Delete', () => { Data.remove('transactions', t.id); toast('Deleted'); App.render(); }, true));
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const amt = Math.abs(+f.amount.value || 0) * (f.dir.value === 'out' ? -1 : 1);
      Data.put('transactions', Object.assign(t ? { id: t.id } : { createdAt: new Date().toISOString() }, { date: f.date.value, amount: Math.round(amt * 100) / 100, description: f.description.value.trim(), category: f.category.value.trim() || 'Other', bookingId: f.bookingId.value, reconciled: f.reconciled.checked }));
      closeModal(); toast('Saved'); App.render();
    });
  }

  function reconcile() {
    const s = Data.settings();
    const m = modal('Reconcile with your bank statement', '<form id="recform" class="form"><p class="muted">Enter the date and ending balance from your bank statement, then tick every transaction that is on it. When the difference is 0.00 you are reconciled.</p>' +
      '<div class="two"><label>Statement date<input class="input" type="date" name="date" value="' + Data.today() + '"></label><label>Statement ending balance ($)<input class="input" type="number" step="0.01" name="bal" inputmode="decimal" placeholder="0.00"></label></div>' +
      '<div id="reclist" class="rec-list"></div><div class="rec-sum" id="recsum"></div>' +
      '<div class="row-end"><button type="button" class="btn ghost" data-close>Close</button><button class="btn primary" id="recdone" disabled>Finish reconciliation</button></div></form>');
    const f = m.querySelector('#recform');
    const ticked = new Set(Data.list('transactions').filter((t) => t.reconciled).map((t) => t.id));
    const draw = () => {
      const upto = f.date.value;
      const tx = Data.list('transactions').filter((t) => t.date <= upto).sort((a, b) => a.date.localeCompare(b.date));
      m.querySelector('#reclist').innerHTML = tx.map((t) => '<label class="rec-item"><input type="checkbox" value="' + t.id + '"' + (ticked.has(t.id) ? ' checked' : '') + '><span class="grow">' + fmtDate(t.date, { month: 'short', day: 'numeric' }) + ' · ' + esc(t.description) + '</span><span class="' + (t.amount < 0 ? 'neg' : 'pos') + '">' + money(t.amount) + '</span></label>').join('') || '<p class="muted">No transactions up to this date.</p>';
      sum();
    };
    const sum = () => {
      const cleared = Data.list('transactions').filter((t) => ticked.has(t.id) && t.date <= f.date.value).reduce((a, t) => a + t.amount, s.openingBalance || 0);
      const stmt = f.bal.value === '' ? null : +f.bal.value;
      const diff = stmt === null ? null : Math.round((stmt - cleared) * 100) / 100;
      m.querySelector('#recsum').innerHTML = '<div><span>Ticked (cleared) balance</span><strong>' + money(cleared) + '</strong></div><div><span>Statement balance</span><strong>' + (stmt === null ? '—' : money(stmt)) + '</strong></div><div class="' + (diff === 0 ? 'ok-line' : 'warn-line') + '"><span>Difference</span><strong>' + (diff === null ? '—' : money(diff)) + '</strong></div>';
      m.querySelector('#recdone').disabled = diff !== 0;
    };
    f.date.addEventListener('change', draw); f.bal.addEventListener('input', sum);
    m.querySelector('#reclist').addEventListener('change', (e) => { if (e.target.checked) ticked.add(e.target.value); else ticked.delete(e.target.value); sum(); });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const upto = f.date.value;
      let count = 0;
      Data.list('transactions').forEach((t) => { if (t.date <= upto) { const r = ticked.has(t.id); if (r) count++; if (r !== t.reconciled) Data.put('transactions', { id: t.id, reconciled: r }); } });
      Data.put('reconciliations', { date: upto, balance: +f.bal.value, count, at: new Date().toISOString() });
      closeModal(); toast('Reconciled to ' + money(+f.bal.value)); App.render();
    });
    draw();
  }

  function exportCsv(rows) {
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const lines = [['Date', 'Description', 'Category', 'Amount', 'Running balance', 'Reconciled', 'Booking'].map(q).join(',')]
      .concat(rows.map((t) => [t.date, t.description, t.category, t.amount.toFixed(2), t.run.toFixed(2), t.reconciled ? 'yes' : 'no', t.bookingId ? ((Data.get('bookings', t.bookingId) || {}).company || t.bookingId) : ''].map(q).join(',')));
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'media-on-wheels-transactions-' + Data.today() + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast('CSV downloaded');
  }

  /* ================= SETTINGS ================= */
  function payAdmin(host) {
    const s = Data.settings(), on = s.payMethods || {};
    const L = (window.ClientViews && ClientViews.PAY_METHODS) || [['card', 'Card'], ['gpay', 'Google Pay'], ['applepay', 'Apple Pay'], ['zelle', 'Zelle']];
    host.innerHTML = '<h2>Payment methods</h2><p class="muted">What clients can choose on the payment step. All are demo for now: nothing is charged.</p>' +
      '<form id="pm-form" class="form"><div class="pm-switches">' + L.map((m) => '<label class="check"><input type="checkbox" name="pm_' + m[0] + '"' + (on[m[0]] !== false ? ' checked' : '') + '> ' + m[1] + '</label>').join('') + '</div>' +
      '<div class="two"><label>Zelle: name people send to<input class="input" name="zelleName" value="' + esc(s.zelleName || '') + '" placeholder="' + esc(s.businessName || 'Media on Wheels') + '"></label>' +
      '<label>Zelle: email or phone<input class="input" name="zelleContact" value="' + esc(s.zelleContact || '') + '" placeholder="the email or phone on your Zelle"></label></div>' +
      '<p class="small muted">Zelle bookings show “Awaiting Zelle confirmation” in Bookings until you tap “Mark Zelle paid”. Google Pay and Apple Pay need a payment account (for example Stripe) to take real money.</p>' +
      '<div class="row-end"><button class="btn primary">Save payment methods</button></div></form>';
    host.querySelector('#pm-form').addEventListener('submit', (e) => {
      e.preventDefault(); const f = e.target, pm = {};
      L.forEach((m) => { pm[m[0]] = f['pm_' + m[0]].checked; });
      if (!Object.values(pm).some(Boolean)) { toast('Keep at least one way to pay'); return; }
      Data.saveSettings({ payMethods: pm, zelleName: f.zelleName.value.trim(), zelleContact: f.zelleContact.value.trim() });
      toast('Payment methods saved');
    });
  }


  /* ================= PRICE TABLE: DISCOUNTS (Nov 8 2026, David) =================
   * Rules the booking price step uses live: by number of bikes, by number of weeks, a promo code, or one client.
   * Saved in the collection 'discounts' (database table mow_discounts when the database is connected). */
  const DKINDS = [['bikes', 'Number of bikes'], ['weeks', 'Number of weeks'], ['promo', 'Promo code'], ['client', 'One client']];
  function discountsAdmin(host) {
    const s = Data.settings();
    const rules = Data.list('discounts').sort((a, b) => DKINDS.findIndex((k) => k[0] === a.kind) - DKINDS.findIndex((k) => k[0] === b.kind) || (+a.min || 0) - (+b.min || 0));
    const clients = Data.list('users').filter((u) => u.role === 'client');
    const cond = (r) => r.kind === 'bikes' ? (+r.min) + '+ bikes' : r.kind === 'weeks' ? (+r.min) + '+ weeks' : r.kind === 'promo' ? 'code ' + esc(r.code || '') : esc(r.clientEmail || (Data.get('users', r.clientId) || {}).email || '');
    const ex = s.setupFeePerBike != null ? Data.priceQuote(10, Data.today(), Data.addDays(Data.today(), 27)) : null;
    host.innerHTML = '<h2>Price table &amp; discounts</h2>' +
      '<table class="price-table admin-prices"><tbody><tr><td>Printing &amp; setup, per bike (one time)</td><td class="amt">' + money(s.setupFeePerBike) + '</td></tr>' +
      '<tr><td>Weekly charge, per bike per week</td><td class="amt">' + money(s.weeklyPerBike) + '</td></tr>' +
      '<tr><td>Deposit due at booking</td><td class="amt">' + (s.depositPct == null ? 20 : s.depositPct) + '%</td></tr>' +
      '<tr><td>Minimum bikes per booking</td><td class="amt">' + (s.minBikes || 5) + '</td></tr></tbody></table>' +
      '<p class="small muted">Change these prices in the form above. Discounts below are taken off the subtotal on the client\'s price page. For each type the biggest matching discount counts; different types add up (at most 90% off).</p>' +
      (rules.length ? '<ul class="disc-list">' + rules.map((r) =>
        '<li class="disc-item' + (r.active === false ? ' off' : '') + '"><div><strong>' + esc(r.label || (DKINDS.find((k) => k[0] === r.kind) || [0, r.kind])[1]) + '</strong>' +
        '<span class="small muted">' + cond(r) + ' · <b>' + (+r.pct) + '% off</b>' + (r.active === false ? ' · off' : '') + '</span></div>' +
        '<div class="disc-actions"><button class="btn ghost small-btn" data-dedit="' + r.id + '">Edit</button><button class="btn danger-ghost small-btn" data-ddel="' + r.id + '">Delete</button></div></li>').join('') + '</ul>' : '<p class="muted">No discounts yet.</p>') +
      (ex ? '<p class="small muted">Example: 10 bikes for 4 weeks = ' + money(ex.subtotal) + (ex.discount ? ' − ' + money(ex.discount) + ' discount = ' + money(ex.total) : '') + ', deposit now ' + money(ex.deposit) + '.</p>' : '') +
      '<div class="row-end"><button class="btn" id="dadd">+ Add discount</button></div>';
    const edit = (id) => {
      const r = id ? Data.get('discounts', id) : { kind: 'bikes', min: 10, pct: 10, active: true };
      const m = UI.modal(id ? 'Edit discount' : 'New discount', '<form class="form" id="df">' +
        '<label>Type<select class="input" name="kind">' + DKINDS.map(([k, l]) => '<option value="' + k + '"' + (r.kind === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
        '<label data-for="bikes weeks">From how many (bikes / weeks)<input class="input" type="number" min="1" step="1" name="min" value="' + (+r.min || 1) + '"></label>' +
        '<label data-for="promo">Promo code<input class="input" name="code" autocomplete="off" value="' + esc(r.code || '') + '"></label>' +
        '<label data-for="client">Client<select class="input" name="clientId"><option value="">Pick a client…</option>' + clients.map((u) => '<option value="' + esc(u.id) + '"' + (r.clientId === u.id ? ' selected' : '') + '>' + esc((u.company || u.name) + ' · ' + u.email) + '</option>').join('') + '</select></label>' +
        '<label data-for="client">…or client email<input class="input" type="email" name="clientEmail" value="' + esc(r.clientEmail || '') + '"></label>' +
        '<label>Percent off<input class="input" type="number" min="1" max="90" step="0.5" name="pct" value="' + (+r.pct || 10) + '" required></label>' +
        '<label>Name shown to the client (optional)<input class="input" name="label" value="' + esc(r.label || '') + '" placeholder="e.g. Big campaign discount"></label>' +
        '<label class="check"><input type="checkbox" name="active"' + (r.active === false ? '' : ' checked') + '> On</label>' +
        '<p class="err" id="derr" role="alert"></p><div class="row-end"><button class="btn primary">Save discount</button></div></form>');
      const f = m.querySelector('#df');
      const show = () => m.querySelectorAll('[data-for]').forEach((l) => { l.style.display = l.getAttribute('data-for').split(' ').includes(f.kind.value) ? '' : 'none'; });
      f.kind.addEventListener('change', show); show();
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const kind = f.kind.value, pct = +f.pct.value;
        if (!(pct > 0 && pct <= 90)) { m.querySelector('#derr').textContent = 'Percent off must be between 1 and 90.'; return; }
        const rec = { id: id || undefined, kind, pct, label: f.label.value.trim(), active: f.active.checked, min: null, code: '', clientId: '', clientEmail: '' };
        if (kind === 'bikes' || kind === 'weeks') rec.min = Math.max(1, Math.round(+f.min.value || 1));
        if (kind === 'promo') { rec.code = f.code.value.trim().toUpperCase(); if (!rec.code) { m.querySelector('#derr').textContent = 'Type the promo code.'; return; }
          if (Data.list('discounts').some((x) => x.kind === 'promo' && x.id !== id && String(x.code).toUpperCase() === rec.code)) { m.querySelector('#derr').textContent = 'That code already exists.'; return; } }
        if (kind === 'client') { rec.clientId = f.clientId.value; const u = Data.get('users', rec.clientId); rec.clientEmail = (f.clientEmail.value.trim() || (u && u.email) || '').toLowerCase(); if (!rec.clientId && !rec.clientEmail) { m.querySelector('#derr').textContent = 'Pick a client or type the email.'; return; } }
        Data.put('discounts', rec); UI.closeModal(); toast('Discount saved'); discountsAdmin(host);
      });
    };
    $('#dadd', host).addEventListener('click', () => edit(null));
    $$('[data-dedit]', host).forEach((b) => b.addEventListener('click', () => edit(b.getAttribute('data-dedit'))));
    $$('[data-ddel]', host).forEach((b) => b.addEventListener('click', () => confirmBox('Delete this discount?', 'Bookings already made keep their price.', 'Delete', () => { Data.remove('discounts', b.getAttribute('data-ddel')); toast('Discount deleted'); discountsAdmin(host); }, true)));
  }

  function renderSettings(root) {
    const s = Data.settings();
    root.innerHTML = '<section class="page narrow"><div class="page-head"><h1>Settings</h1></div>' +
      '<form class="card form" id="setform"><h2>Business &amp; prices</h2>' +
      '<label>Business name<input class="input" name="businessName" value="' + esc(s.businessName) + '"></label>' +
      '<div class="two"><label>Price per bike per day ($)<input class="input" type="number" step="0.01" min="0" name="pricePerBikeDay" value="' + s.pricePerBikeDay + '"></label>' +
      '<label>Deposit due at booking (%)<input class="input" type="number" step="1" min="0" max="100" name="depositPct" value="' + (s.depositPct == null ? 20 : s.depositPct) + '"></label></div>' +
      '<label>Bank opening balance ($)<input class="input" type="number" step="0.01" name="openingBalance" value="' + (s.openingBalance || 0) + '"></label>' +
      '<h2 style="margin-top:.6rem">Client checkout prices</h2>' +
      (s.pricesAreSamples ? '<div class="sample-note" role="note"><span aria-hidden="true">ℹ️</span><span><strong>These are sample prices.</strong> Type your real prices and save; clients see them on the price page.</span></div>' : '') +
      '<div class="two"><label>Printing &amp; setup, per bike, one time ($)<input class="input" type="number" step="0.01" min="0" name="setupFeePerBike" value="' + (s.setupFeePerBike != null ? s.setupFeePerBike : 150) + '"></label>' +
      '<label>Weekly charge, per bike per week ($)<input class="input" type="number" step="0.01" min="0" name="weeklyPerBike" value="' + (s.weeklyPerBike != null ? s.weeklyPerBike : 75) + '"></label>' +
      '<label>Minimum bikes per client booking<input class="input" type="number" step="1" min="1" name="minBikes" value="' + (s.minBikes || 5) + '"></label></div>' +
      '<label class="check"><input type="checkbox" name="pricesAreSamples"' + (s.pricesAreSamples ? ' checked' : '') + '> Still sample prices (shows a "sample prices" note to clients)</label>' +
      '<div class="row-end"><button class="btn primary">Save settings</button></div></form>' +
      '<div class="card" id="discounts-card"></div>' +
      '<div class="card" id="paymethods-card"></div>' +
      '<div class="card" id="homevideo-card"></div>' +
      '<div class="card" id="homecontent-card"></div>' +
      '<div class="card"><h2>GPS trackers</h2><p>Status: <strong>' + (TrackerFeed.isLive() ? 'Live' : 'Simulator (demo positions)') + '</strong></p><p class="muted">When you tell us the tracker brand (or the app you use to see them), we connect its live feed here. Each bike is matched by its tracker ID.</p></div>' +
      '<div class="card" id="store-card"><h2>Where the data is saved</h2>' + (Data.mode() === 'database' ? '<p><strong>Shared database (connected).</strong> Every phone and computer sees the same accounts, bikes, bookings and money records.</p>' : '<p><strong>This browser only (test mode).</strong> The shared database is not connected yet, so each phone or computer has its own copy. It switches on when the Supabase keys are added to js/config.js.</p><button class="btn danger-ghost" id="reset">Clear this browser\'s copy</button>') + '</div></section>';
    discountsAdmin($('#discounts-card', root)); // Nov 8 2026: price table discounts
    payAdmin($('#paymethods-card', root)); // v4.1: card / Google Pay / Apple Pay / Zelle
    if (window.HomeVideo) HomeVideo.renderAdmin($('#homevideo-card', root)); // v4: main page video upload
    if (window.HomePage) HomePage.renderAdmin($('#homecontent-card', root)); // v4: main page stats, reviews, story, contact
    $('#setform', root).addEventListener('submit', (e) => {
      e.preventDefault(); const f = e.target;
      const priceChanged = +f.setupFeePerBike.value !== +s.setupFeePerBike || +f.weeklyPerBike.value !== +s.weeklyPerBike;
      Data.saveSettings({ businessName: f.businessName.value.trim() || 'Media on Wheels', pricePerBikeDay: +f.pricePerBikeDay.value || 0, depositPct: Math.min(100, Math.max(0, +f.depositPct.value || 0)), openingBalance: +f.openingBalance.value || 0,
        setupFeePerBike: Math.max(0, +f.setupFeePerBike.value || 0), weeklyPerBike: Math.max(0, +f.weeklyPerBike.value || 0), minBikes: Math.max(1, Math.round(+f.minBikes.value || 5)), pricesAreSamples: priceChanged && s.pricesAreSamples ? false : f.pricesAreSamples.checked });
      toast('Settings saved'); App.render();
    });
    const rs = $('#reset', root); /* this-browser mode only; the shared database is never wiped from a browser */
    if (rs) rs.addEventListener('click', () => confirmBox('Clear this browser\'s copy?', 'All accounts, bikes, bookings and money records saved in THIS browser are removed. It starts empty again.', 'Clear', async () => { await Data.reset(); toast('Cleared'); App.logout(); }, true));
  }

  window.AdminViews = {
    tabs: [
      { key: 'map', label: 'Map', icon: 'map', render: renderMap },
      { key: 'bikes', label: 'Bikes', icon: 'bike', render: renderBikes },
      { key: 'bookings', label: 'Bookings', icon: 'cal', render: renderBookings, badge: () => Data.list('bookings').filter((b) => b.status === 'pending').length },
      { key: 'books', label: 'Books', icon: 'book', render: renderBooks },
      { key: 'settings', label: 'Settings', icon: 'gear', render: renderSettings }
    ],
    teardown
  };
})();
