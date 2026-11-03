/* Client side: pick a location → live map; booking calendar → bikes → 20% deposit; my bookings. */
(function () {
  'use strict';
  const { esc, money, fmtDate, fmtRange, $, $$, toast, modal, closeModal, confirmBox, statusOf, badge, calendarHtml } = UI;

  let mapCtl = null;
  const wiz = { step: 'start', start: null, end: null, bikeIds: [], mode: 'specific', calY: null, calM: null };
  function resetWiz() { Object.assign(wiz, { step: 'start', start: null, end: null, bikeIds: [], mode: 'specific' }); }
  function teardown() { if (mapCtl) { mapCtl.destroy(); mapCtl = null; } }

  /* ================= MAP ================= */
  function renderMap(root, user, params) {
    const locId = params[0];
    const loc = locId && Data.get('locations', locId);
    if (!loc) {
      const locs = Data.list('locations');
      root.innerHTML = '<section class="page"><div class="page-head"><h1>Choose a location</h1></div><p class="muted lead">See where every bike is right now, with its advertiser flags.</p>' +
        '<div class="loc-grid">' + locs.map((l) => {
          const n = Data.list('bikes').filter((b) => b.locationId === l.id).length;
          return '<a class="loc-card" href="#/client/map/' + l.id + '"><span class="loc-pin" aria-hidden="true"></span><span class="loc-name">' + esc(l.name) + '</span><span class="loc-count">' + n + ' bike' + (n === 1 ? '' : 's') + ' on the street</span><span class="loc-go" aria-hidden="true">›</span></a>';
        }).join('') + '</div></section>';
      return;
    }
    root.innerHTML = '<section class="page map-page"><div class="page-head"><a class="back" href="#/client/map">‹ Locations</a><h1>' + esc(loc.name) + '</h1></div>' +
      (TrackerFeed.isLive() ? '' : '<div class="notice small">Demo: bike positions are simulated for now.</div>') +
      UI.mapControlsHtml(false) +
      '<div class="map-layout"><div class="map" id="map" aria-label="Street map of ' + esc(loc.name) + '"></div><aside class="map-side"><h2 class="side-title">Bikes here</h2><div id="bl"></div></aside></div>' +
      '<div class="cta-bar"><a class="btn primary wide" href="#/client/book">Book bikes</a></div></section>';
    const bm = UI.createBikeMap($('#map', root), { userId: user.id, locationId: loc.id, admin: false, onChange: () => list() });
    mapCtl = bm;
    const list = () => { $('#bl', root).innerHTML = UI.bikeListHtml(bm, false); };
    list();
    UI.wireMapControls(root, bm, list);
  }

  /* ================= BOOK ================= */
  function renderBook(root, user) {
    if (wiz.step === 'bikes') return renderPickBikes(root, user);
    if (wiz.step === 'deposit') return renderDeposit(root, user);
    if (wiz.step === 'done') return renderDone(root, user);
    const now = new Date();
    if (wiz.calY === null) { wiz.calY = now.getFullYear(); wiz.calM = now.getMonth(); }
    const total = Data.list('bikes').length;
    const picking = wiz.step === 'end';
    root.innerHTML = '<section class="page"><div class="page-head"><h1>Book bikes</h1></div>' +
      steps(1) +
      '<div class="pick-banner ' + (picking ? 'end' : '') + '">' + (picking ? '<strong>Till what day?</strong> Starting ' + fmtDate(wiz.start) + '. Tap the last day.' + '<div class="quick"><button class="chip" data-q="6">1 week</button><button class="chip" data-q="13">2 weeks</button><button class="chip" data-q="29">30 days</button><button class="chip ghost" id="restart">Change start</button></div>' : '<strong>Tap the day you want to start.</strong> Each day shows how many bikes are free.') + '</div>' +
      '<div class="card cal-card">' + calendarHtml(wiz.calY, wiz.calM, {
        isDisabled: (ds) => ds < Data.today() || (picking && ds < wiz.start),
        rangeStart: wiz.start, rangeEnd: wiz.end || wiz.start,
        cell: (ds) => {
          if (ds < Data.today()) return '';
          const free = Data.freeBikes(ds, ds).length;
          return '<span class="free ' + (free === 0 ? 'none' : free < 5 ? 'low' : '') + '">' + (free === 0 ? 'full' : '<b>' + free + '</b><i> free</i>') + '</span>';
        }
      }) + '<p class="small muted">' + total + ' bikes in the fleet · ' + money(Data.settings().pricePerBikeDay) + ' per bike per day</p></div></section>';
    $$('[data-cal-nav]', root).forEach((b) => b.addEventListener('click', () => { const d = new Date(wiz.calY, wiz.calM + (+b.getAttribute('data-cal-nav')), 1); wiz.calY = d.getFullYear(); wiz.calM = d.getMonth(); App.render(); }));
    const pick = (ds) => {
      if (!picking) {
        const free = Data.freeBikes(ds, ds).length;
        const m = modal(fmtDate(ds, { weekday: 'long', month: 'long', day: 'numeric' }), '<p>' + free + ' of ' + total + ' bikes are free on this day.</p><div class="row-end"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="bookfrom"' + (free ? '' : ' disabled') + '>Book from this day</button></div>', { sheet: true, noFocus: true });
        m.querySelector('#bookfrom').addEventListener('click', () => { closeModal(); wiz.start = ds; wiz.end = null; wiz.step = 'end'; App.render(); });
      } else {
        setEnd(ds);
      }
    };
    $$('.cal-cell[data-date]:not(.disabled)', root).forEach((c) => {
      c.addEventListener('click', () => pick(c.getAttribute('data-date')));
      c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(c.getAttribute('data-date')); } });
    });
    if (picking) {
      $$('[data-q]', root).forEach((b) => b.addEventListener('click', () => setEnd(Data.addDays(wiz.start, +b.getAttribute('data-q')))));
      $('#restart', root).addEventListener('click', () => { resetWiz(); App.render(); });
    }
  }

  function setEnd(ds) {
    wiz.end = ds;
    App.render();
    const free = Data.freeBikes(wiz.start, wiz.end).length;
    const days = Data.days(wiz.start, wiz.end);
    const m = modal('Your dates', '<p class="big-line">' + fmtRange(wiz.start, wiz.end) + '</p><p>' + days + ' day' + (days > 1 ? 's' : '') + ' · <strong>' + free + ' bikes free</strong> for all these days.</p>' +
      '<div class="row-end"><button class="btn ghost" data-close>Change</button><button class="btn primary" id="tobikes"' + (free ? '' : ' disabled') + '>Next: choose bikes</button></div>', { sheet: true, noFocus: true });
    m.querySelector('#tobikes').addEventListener('click', () => { closeModal(); wiz.step = 'bikes'; wiz.bikeIds = []; wiz.mode = 'specific'; App.render(); });
  }

  function steps(n) {
    const names = ['Dates', 'Bikes', 'Deposit'];
    return '<ol class="steps">' + names.map((s, i) => '<li class="' + (i + 1 < n ? 'done' : i + 1 === n ? 'on' : '') + '"><span>' + (i + 1) + '</span>' + s + '</li>').join('') + '</ol>';
  }

  function renderPickBikes(root) {
    const free = Data.freeBikes(wiz.start, wiz.end);
    const freeIds = new Set(free.map((b) => b.id));
    const all = Data.list('bikes').sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
    const sel = new Set(wiz.bikeIds);
    const q = Data.quote(sel.size, wiz.start, wiz.end);
    root.innerHTML = '<section class="page"><div class="page-head"><button class="back" id="back">‹ Dates</button><h1>Choose bikes</h1></div>' + steps(2) +
      '<p class="muted">' + fmtRange(wiz.start, wiz.end) + ' · ' + free.length + ' of ' + all.length + ' bikes free</p>' +
      '<div class="any-row"><button class="any-btn' + (wiz.mode === 'any5' ? ' on' : '') + '" data-any="5"' + (free.length < 5 ? ' disabled' : '') + '><strong>Any 5</strong><span>available bikes</span></button>' +
      '<button class="any-btn' + (wiz.mode === 'any10' ? ' on' : '') + '" data-any="10"' + (free.length < 10 ? ' disabled' : '') + '><strong>Any 10</strong><span>available bikes</span></button></div>' +
      '<p class="or"><span>or pick bike numbers</span></p>' +
      '<div class="bike-grid">' + all.map((b) => {
        const ok = freeIds.has(b.id), loc = Data.get('locations', b.locationId);
        return '<button class="bike-tile' + (sel.has(b.id) ? ' on' : '') + (ok ? '' : ' busy') + '" data-bike="' + b.id + '"' + (ok ? '' : ' disabled') + ' aria-pressed="' + sel.has(b.id) + '"><span class="num">' + esc(b.number) + '</span><span class="small">' + esc(loc ? loc.name : '') + '</span><span class="small">' + (ok ? 'Free' : 'Booked') + '</span></button>';
      }).join('') + '</div>' +
      '<div class="sum-bar"><div><strong>' + sel.size + ' bike' + (sel.size === 1 ? '' : 's') + '</strong> · ' + q.days + ' days · ' + money(q.total) + '</div><button class="btn primary" id="next"' + (sel.size ? '' : ' disabled') + '>Next: deposit</button></div></section>';
    $('#back', root).addEventListener('click', () => { wiz.step = 'start'; wiz.start = null; wiz.end = null; App.render(); });
    $$('[data-any]', root).forEach((b) => b.addEventListener('click', () => {
      const n = +b.getAttribute('data-any');
      wiz.bikeIds = free.sort((a, c) => a.number.localeCompare(c.number, undefined, { numeric: true })).slice(0, n).map((x) => x.id);
      wiz.mode = 'any' + n; App.render(); toast(n + ' free bikes picked for you');
    }));
    $$('[data-bike]', root).forEach((b) => b.addEventListener('click', () => {
      const id = b.getAttribute('data-bike');
      if (sel.has(id)) sel.delete(id); else sel.add(id);
      wiz.bikeIds = Array.from(sel); wiz.mode = 'specific'; App.render();
    }));
    $('#next', root).addEventListener('click', () => { wiz.step = 'deposit'; App.render(); });
  }

  function renderDeposit(root, user) {
    const q = Data.quote(wiz.bikeIds.length, wiz.start, wiz.end);
    root.innerHTML = '<section class="page narrow"><div class="page-head"><button class="back" id="back">‹ Bikes</button><h1>' + q.depositPct + '% deposit</h1></div>' + steps(3) +
      '<div class="card"><dl class="kv wide"><dt>Dates</dt><dd>' + fmtRange(wiz.start, wiz.end) + ' (' + q.days + ' days)</dd>' +
      '<dt>Bikes</dt><dd>' + wiz.bikeIds.length + (wiz.mode !== 'specific' ? ' (any ' + wiz.mode.replace('any', '') + ' available)' : '') + ': ' + wiz.bikeIds.map(Data.bikeLabel).join(', ') + '</dd>' +
      '<dt>Price</dt><dd>' + money(q.pricePerDay) + ' per bike per day</dd><dt>Total</dt><dd>' + money(q.total) + '</dd>' +
      '<dt class="hl">Deposit now (' + q.depositPct + '%)</dt><dd class="hl">' + money(q.deposit) + '</dd><dt>Balance later</dt><dd>' + money(q.total - q.deposit) + '</dd></dl></div>' +
      '<div class="card pay"><h2>Payment</h2><div class="demo-pay"><strong>Demo checkout.</strong> No card is charged and no card details are asked for. In the live version this button opens a secure card payment page.</div>' +
      '<label>Company on the red flag<input class="input" id="company" value="' + esc(user.company || '') + '"></label>' +
      '<label>Note for the admin (optional)<textarea class="input" id="note" rows="2" placeholder="e.g. we prefer bikes near Lee Ave"></textarea></label>' +
      '<button class="btn primary wide big" id="pay">Pay ' + money(q.deposit) + ' deposit (demo) and send request</button></div></section>';
    $('#back', root).addEventListener('click', () => { wiz.step = 'bikes'; App.render(); });
    $('#pay', root).addEventListener('click', () => {
      // re-check availability right before submitting
      const busy = Data.busyBikeIds(wiz.start, wiz.end);
      if (wiz.bikeIds.some((id) => busy.has(id))) { toast('Some bikes were just booked. Please pick again.'); wiz.step = 'bikes'; wiz.bikeIds = []; App.render(); return; }
      const company = $('#company', root).value.trim() || user.company || user.name;
      const rec = Data.put('bookings', {
        clientId: user.id, clientName: user.name, company, start: wiz.start, end: wiz.end, bikeIds: wiz.bikeIds.slice(), mode: wiz.mode,
        pricePerDay: q.pricePerDay, total: q.total, deposit: q.deposit, depositPaid: true, status: 'pending', notes: $('#note', root).value.trim(),
        createdAt: new Date().toISOString(), history: [{ at: new Date().toISOString(), by: user.name, action: 'Requested, demo deposit ' + money(q.deposit) }]
      });
      wiz.step = 'done'; wiz.lastId = rec.id; App.render();
    });
  }

  function renderDone(root) {
    const b = Data.get('bookings', wiz.lastId);
    root.innerHTML = '<section class="page narrow center"><div class="done-mark" aria-hidden="true">✓</div><h1>Request sent</h1>' +
      '<p class="lead">' + (b ? esc(b.company) + ' · ' + fmtRange(b.start, b.end) + ' · ' + b.bikeIds.length + ' bikes' : '') + '</p>' +
      '<p>Status: <span class="badge st-pending">Pending</span> until the admin approves it. You can follow it under My bookings.</p>' +
      '<div class="row-center"><a class="btn primary" href="#/client/bookings" id="tomy">My bookings</a><button class="btn ghost" id="again">Book more</button></div></section>';
    $('#again', root).addEventListener('click', () => { resetWiz(); App.render(); });
    $('#tomy', root).addEventListener('click', () => resetWiz());
  }

  /* ================= MY BOOKINGS ================= */
  function renderMine(root, user) {
    const mine = Data.list('bookings').filter((b) => b.clientId === user.id).sort((a, b) => b.start.localeCompare(a.start));
    root.innerHTML = '<section class="page narrow"><div class="page-head"><h1>My bookings</h1><a class="btn primary" href="#/client/book">+ New</a></div>' +
      (mine.length ? mine.map((b) => '<article class="card my-bk"><div class="bk-title"><strong>' + fmtRange(b.start, b.end) + '</strong> ' + badge(b) + '</div>' +
        '<div class="small">' + b.bikeIds.length + ' bikes: ' + b.bikeIds.map(Data.bikeLabel).join(', ') + '</div>' +
        '<div class="small muted">Total ' + money(b.total) + ' · deposit ' + money(b.deposit) + (b.depositPaid ? ' paid (demo)' : '') + '</div>' +
        (statusOf(b) === 'pending' ? '<div class="row-end"><button class="btn danger-ghost" data-cancel="' + b.id + '">Cancel request</button></div>' : '') + '</article>').join('')
        : '<div class="card center"><p>No bookings yet.</p><a class="btn primary" href="#/client/book">Book bikes</a></div>') + '</section>';
    root.addEventListener('click', (e) => {
      const c = e.target.closest('[data-cancel]');
      if (c) {
        const b = Data.get('bookings', c.getAttribute('data-cancel'));
        confirmBox('Cancel this request?', fmtRange(b.start, b.end) + ', ' + b.bikeIds.length + ' bikes.', 'Cancel request', () => {
          Data.put('bookings', { id: b.id, status: 'cancelled', history: (b.history || []).concat([{ at: new Date().toISOString(), by: user.name, action: 'Cancelled by client' }]) });
          toast('Request cancelled'); App.render();
        }, true);
      }
    });
  }

  window.ClientViews = {
    tabs: [
      { key: 'map', label: 'Map', icon: 'map', render: renderMap },
      { key: 'book', label: 'Book', icon: 'cal', render: renderBook },
      { key: 'bookings', label: 'My bookings', icon: 'list', render: renderMine }
    ],
    teardown, resetWiz
  };
})();
