/* Client side (v3): 1 Details & area → 2 Dates (English + Hebrew calendar) & number of bikes → 3 Price
 * (printing & setup + weekly charge) → 4 Card payment (demo) → confirmation; plus My bookings.
 * The live map is admin-only (David, Nov 3 2026), so clients have no map view. */
(function () {
  'use strict';
  const { esc, money, fmtDate, fmtRange, $, $$, toast, confirmBox, statusOf, badge, calendarHtml } = UI;

  let ride = null;
  const blank = () => ({ step: 'details', start: null, end: null, count: 3, bikeIds: [], specific: false, mode: 'count', area: '', areaNote: '', biz: null, lastId: null });
  const wiz = Object.assign(blank(), { calY: null, calM: null });
  function resetWiz() { const y = wiz.calY, m = wiz.calM; Object.assign(wiz, blank(), { calY: y, calM: m }); }
  function teardown() { if (ride) { ride.destroy(); ride = null; } }

  function steps4(n) {
    const names = ['Details', 'Dates & bikes', 'Price', 'Payment'];
    return '<ol class="steps4" aria-label="Booking steps">' + names.map((s, i) => '<li class="' + (i + 1 < n ? 'done' : i + 1 === n ? 'on' : '') + '"' + (i + 1 === n ? ' aria-current="step"' : '') + '><span><b>' + (i + 1) + '</b>' + s + '</span></li>').join('') + '</ol>';
  }
  function go(step) { wiz.step = step; App.render(); window.scrollTo(0, 0); }
  function bizOf(user) {
    if (!wiz.biz) wiz.biz = { company: user.company || '', contact: user.name || '', phone: user.phone || '', email: user.email || '', adText: '' };
    return wiz.biz;
  }
  function areaName() { const l = wiz.area && Data.get('locations', wiz.area); return l ? l.name : (wiz.areaNote || ''); }
  function freeFor() { return wiz.start && wiz.end ? Data.freeBikes(wiz.start, wiz.end) : Data.list('bikes'); }

  function rideCard(title) {
    return '<section class="card ride-card" aria-label="Your ad bikes riding in Williamsburg"><div class="ride-head"><h2>' + esc(title) + '</h2><span class="ride-count" id="ride-n"></span></div>' +
      '<div class="ride-wrap" id="ride"></div><div class="ride-foot"><span>Preview animation, not a live map.</span><span>Streets © OpenStreetMap contributors</span></div></section>';
  }
  function mountRide(root) {
    const host = $('#ride', root); if (!host || !window.BikeRide) return;
    ride = BikeRide.mount(host, { count: wiz.count, label: (wiz.biz && wiz.biz.company) || '' });
    updRide();
  }
  function updRide() {
    if (ride) ride.set(wiz.count, (wiz.biz && wiz.biz.company) || '');
    const n = document.getElementById('ride-n'); if (n) n.textContent = wiz.count + ' bike' + (wiz.count === 1 ? '' : 's') + ' riding';
  }

  /* ================= BOOK ================= */
  function renderBook(root, user) {
    teardown();
    if (wiz.step === 'dates' || wiz.step === 'start' || wiz.step === 'end') return renderDates(root, user);
    if (wiz.step === 'price') return renderPrice(root, user);
    if (wiz.step === 'pay') return renderPay(root, user);
    if (wiz.step === 'done') return renderDone(root, user);
    return renderDetails(root, user);
  }

  /* ---- step 1: business details + area ---- */
  function renderDetails(root, user) {
    const b = bizOf(user);
    const locs = Data.list('locations');
    root.innerHTML = '<section class="page narrow"><div class="page-head"><h1>Book ad bikes</h1></div>' + steps4(1) +
      '<form class="card form" id="det" novalidate><h2>Your business</h2>' +
      '<label>Business name (shown on the ads)<input class="input" name="company" required autocomplete="organization" value="' + esc(b.company) + '" placeholder="e.g. Fresh Basket Grocery"></label>' +
      '<div class="two"><label>Contact name<input class="input" name="contact" autocomplete="name" value="' + esc(b.contact) + '"></label>' +
      '<label>Phone<input class="input" name="phone" type="tel" inputmode="tel" autocomplete="tel" value="' + esc(b.phone) + '" placeholder="(845) 555-0123"></label></div>' +
      '<label>Email<input class="input" name="email" type="email" autocomplete="email" value="' + esc(b.email) + '"></label>' +
      '<fieldset><legend>Where should the bikes ride?</legend><div class="area-grid">' + locs.map((l) => {
        const n = Data.list('bikes').filter((x) => x.locationId === l.id).length;
        return '<label class="area-opt"><input type="radio" name="area" value="' + l.id + '"' + (wiz.area === l.id ? ' checked' : '') + '>' + esc(l.name) + '<small>' + n + ' bike' + (n === 1 ? '' : 's') + ' based here</small></label>';
      }).join('') + '</div>' +
      '<label style="margin-top:.6rem">Streets or blocks you want (optional) <span class="lbl-note">e.g. Lee Ave from Division to Rutledge</span><input class="input" name="areaNote" value="' + esc(wiz.areaNote) + '"></label></fieldset>' +
      '<label>What the ad says (optional)<textarea class="input" name="adText" rows="2" placeholder="e.g. Fresh Basket — open Motzei Shabbos till 1am">' + esc(b.adText) + '</textarea></label>' +
      '<p class="err" id="det-err" role="alert"></p>' +
      '<div class="flow-actions"><span class="small muted">Step 1 of 4</span><button class="btn primary big" type="submit">Next: dates & bikes ›</button></div></form>' +
      rideCard('Your ad riding in Williamsburg') + '</section>';
    const f = $('#det', root);
    const save = () => {
      Object.assign(b, { company: f.company.value.trim(), contact: f.contact.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(), adText: f.adText.value.trim() });
      const a = f.querySelector('input[name=area]:checked'); wiz.area = a ? a.value : ''; wiz.areaNote = f.areaNote.value.trim();
    };
    f.company.addEventListener('input', () => { b.company = f.company.value.trim(); updRide(); });
    f.addEventListener('submit', (e) => {
      e.preventDefault(); save();
      const err = $('#det-err', root);
      if (!b.company) { err.textContent = 'Please type the business name.'; f.company.focus(); return; }
      if (!wiz.area && !wiz.areaNote) { err.textContent = 'Please pick where the bikes should ride.'; return; }
      go('dates');
    });
    mountRide(root);
  }

  /* ---- step 2: dates (English + Hebrew calendar) + number of bikes ---- */
  function renderDates(root, user) {
    const now = new Date();
    if (wiz.calY === null) { wiz.calY = now.getFullYear(); wiz.calM = now.getMonth(); }
    const picking = wiz.start && !wiz.end;
    const free = freeFor();
    const fleet = Data.list('bikes').length;
    if (wiz.specific) wiz.count = wiz.bikeIds.length;
    if (!wiz.specific) wiz.count = Math.max(1, Math.min(wiz.count || 1, free.length || 1));
    const J = window.JCal && JCal.ready ? JCal : null;
    const heOf = (ds) => (J ? ' <span class="he" lang="he">' + esc(J.day(ds).heFull) + '</span>' : '');
    const banner = !wiz.start ? '<strong>Tap the first day.</strong> Each day shows how many bikes are free, with the Hebrew date and Yom Tov.' :
      picking ? '<strong>Now tap the last day.</strong> Starting ' + esc(fmtDate(wiz.start)) + '.<div class="quick"><button type="button" class="chip" data-q="6">1 week</button><button type="button" class="chip" data-q="13">2 weeks</button><button type="button" class="chip" data-q="27">4 weeks</button></div>' :
      '<strong>Dates picked.</strong> Tap a day to start over.';
    let sel = '';
    if (wiz.start && wiz.end) {
      const days = Data.days(wiz.start, wiz.end), weeks = Data.weeks(wiz.start, wiz.end);
      sel = '<div class="sel-sum"><strong>' + esc(fmtRange(wiz.start, wiz.end)) + '</strong><span>' + days + ' day' + (days > 1 ? 's' : '') + ' · billed as ' + weeks + ' week' + (weeks > 1 ? 's' : '') + '</span>' +
        (J ? '<span class="he" lang="he">' + esc(J.day(wiz.start).heFull) + ' – ' + esc(J.day(wiz.end).heFull) + '</span>' : '') + '</div>';
    }
    const all = Data.list('bikes').sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
    const freeIds = new Set(free.map((x) => x.id));
    const chosen = new Set(wiz.bikeIds);
    root.innerHTML = '<section class="page"><div class="page-head"><button class="back" id="back">‹ Details</button><h1>Dates & bikes</h1></div>' + steps4(2) +
      '<div class="pick-banner ' + (picking ? 'end' : '') + '">' + banner + '</div>' +
      '<div class="card cal-card">' + calendarHtml(wiz.calY, wiz.calM, {
        isDisabled: (ds) => ds < Data.today() || (picking && ds < wiz.start),
        rangeStart: wiz.start, rangeEnd: wiz.end || wiz.start,
        cell: (ds) => {
          if (ds < Data.today()) return '';
          const n = Data.freeBikes(ds, ds).length;
          return '<span class="free ' + (n === 0 ? 'none' : n < 5 ? 'low' : '') + '">' + (n === 0 ? 'full' : '<b>' + n + '</b><i> free</i>') + '</span>';
        }
      }) + '</div>' +
      '<section class="card"><h2>How many bikes?</h2>' + sel +
      '<div class="bike-row" style="margin-top:.7rem"><div><strong>' + (wiz.specific ? 'Bikes you picked' : 'Number of bikes') + '</strong><div class="small muted">' + (wiz.start && wiz.end ? free.length + ' of ' + fleet + ' bikes free for these dates' : fleet + ' bikes in the fleet · pick dates to see what is free') + '</div></div>' +
      '<div class="stepper" role="group" aria-label="Number of bikes"><button type="button" id="minus" aria-label="One bike less"' + (wiz.count <= 1 || wiz.specific ? ' disabled' : '') + '>−</button><output id="cnt" aria-live="polite">' + wiz.count + '</output><button type="button" id="plus" aria-label="One bike more"' + (wiz.count >= free.length || wiz.specific ? ' disabled' : '') + '>+</button></div></div>' +
      '<details class="mt"' + (wiz.specific ? ' open' : '') + '><summary class="small" style="cursor:pointer;font-weight:650">Pick specific bike numbers (optional)</summary>' +
      '<div class="bike-grid" style="margin-top:.6rem">' + all.map((x) => {
        const ok = freeIds.has(x.id), loc = Data.get('locations', x.locationId);
        return '<button type="button" class="bike-tile' + (chosen.has(x.id) ? ' on' : '') + (ok ? '' : ' busy') + '" data-bike="' + x.id + '"' + (ok ? '' : ' disabled') + ' aria-pressed="' + chosen.has(x.id) + '"><span class="num">' + esc(x.number) + '</span><span class="small">' + esc(loc ? loc.name : '') + '</span><span class="small">' + (ok ? 'Free' : 'Booked') + '</span></button>';
      }).join('') + '</div>' + (wiz.specific ? '<button type="button" class="btn ghost small-btn" id="clearpick" style="margin-top:.5rem">Clear, just give me any free bikes</button>' : '') + '</details>' +
      '<div class="flow-actions"><button type="button" class="btn ghost" id="back2">‹ Back</button><button type="button" class="btn primary big" id="confirm"' + (wiz.start && wiz.end && wiz.count > 0 && free.length ? '' : ' disabled') + '>Confirm booking ›</button></div>' +
      (wiz.start && wiz.end && !free.length ? '<p class="err">No bikes are free for all of these days. Try other dates.</p>' : '') + '</section>' +
      rideCard('More bikes, more streets') + '</section>';
    $('#back', root).addEventListener('click', () => go('details'));
    $('#back2', root).addEventListener('click', () => go('details'));
    $$('[data-cal-nav]', root).forEach((b) => b.addEventListener('click', () => { const d = new Date(wiz.calY, wiz.calM + (+b.getAttribute('data-cal-nav')), 1); wiz.calY = d.getFullYear(); wiz.calM = d.getMonth(); App.render(); }));
    const pick = (ds) => {
      if (!wiz.start || wiz.end) { wiz.start = ds; wiz.end = null; }
      else if (ds >= wiz.start) wiz.end = ds;
      wiz.bikeIds = wiz.bikeIds.filter((id) => !wiz.end || Data.freeBikes(wiz.start, wiz.end).some((x) => x.id === id));
      if (wiz.specific && !wiz.bikeIds.length) wiz.specific = false;
      App.render();
    };
    $$('.cal-cell[data-date]:not(.disabled)', root).forEach((c) => {
      c.addEventListener('click', () => pick(c.getAttribute('data-date')));
      c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(c.getAttribute('data-date')); } });
    });
    $$('[data-q]', root).forEach((b) => b.addEventListener('click', () => { wiz.end = Data.addDays(wiz.start, +b.getAttribute('data-q')); App.render(); }));
    const setCount = (n) => { wiz.count = Math.max(1, Math.min(free.length || 1, n)); $('#cnt', root).textContent = wiz.count; $('#minus', root).disabled = wiz.count <= 1; $('#plus', root).disabled = wiz.count >= free.length; updRide(); };
    $('#minus', root).addEventListener('click', () => setCount(wiz.count - 1));
    $('#plus', root).addEventListener('click', () => setCount(wiz.count + 1));
    $$('[data-bike]', root).forEach((b) => b.addEventListener('click', () => {
      const id = b.getAttribute('data-bike');
      const s = new Set(wiz.bikeIds); if (s.has(id)) s.delete(id); else s.add(id);
      wiz.bikeIds = Array.from(s); wiz.specific = wiz.bikeIds.length > 0; if (!wiz.specific) wiz.count = Math.max(1, wiz.count); App.render();
    }));
    const cp = $('#clearpick', root); if (cp) cp.addEventListener('click', () => { wiz.bikeIds = []; wiz.specific = false; App.render(); });
    $('#confirm', root).addEventListener('click', () => go('price'));
    mountRide(root);
  }

  function priceTable(q) {
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
    return '<table class="price-table"><tbody>' +
      '<tr><td>Printing & setup<span class="calc">' + plural(q.bikes, 'bike') + ' × ' + money(q.setupEach) + ' one-time fee</span></td><td class="amt">' + money(q.setup) + '</td></tr>' +
      '<tr><td>Weekly charge<span class="calc">' + plural(q.bikes, 'bike') + ' × ' + money(q.weeklyEach) + ' a week × ' + plural(q.weeks, 'week') + ' (' + money(q.weeklyPerWeek) + ' a week)</span></td><td class="amt">' + money(q.weekly) + '</td></tr>' +
      '<tr class="sub"><td>Subtotal</td><td class="amt">' + money(q.total) + '</td></tr>' +
      '<tr class="total"><td>Total</td><td class="amt" id="grand">' + money(q.total) + '</td></tr></tbody></table>';
  }
  const sampleNote = () => Data.settings().pricesAreSamples ? '<div class="sample-note" role="note"><span aria-hidden="true">ℹ️</span><span><strong>Sample prices.</strong> The real printing, setup and weekly prices will be set by BikeAds.</span></div>' : '';

  /* ---- step 3: price summary ---- */
  function renderPrice(root) {
    if (!wiz.start || !wiz.end) return go('dates');
    const free = freeFor();
    if (wiz.specific) wiz.count = wiz.bikeIds.length;
    wiz.count = Math.max(1, Math.min(wiz.count, free.length || 1));
    const q = Data.priceQuote(wiz.count, wiz.start, wiz.end);
    const J = window.JCal && JCal.ready ? JCal : null;
    root.innerHTML = '<section class="page narrow"><div class="page-head"><button class="back" id="back">‹ Dates & bikes</button><h1>Your price</h1></div>' + steps4(3) +
      '<div class="card"><div class="sel-sum"><strong>' + esc(wiz.biz ? wiz.biz.company : '') + '</strong><span>' + esc(areaName()) + '</span><span>' + esc(fmtRange(wiz.start, wiz.end)) + ' · ' + q.days + ' days</span>' +
      (J ? '<span class="he" lang="he">' + esc(J.day(wiz.start).heFull) + ' – ' + esc(J.day(wiz.end).heFull) + '</span>' : '') + '</div>' +
      '<div class="bike-row" style="margin:.9rem 0 .3rem"><div><strong>Bikes</strong><div class="small muted">' + (wiz.specific ? 'Bikes ' + wiz.bikeIds.map(Data.bikeLabel).join(', ') : 'Up to ' + free.length + ' free for these dates') + '</div></div>' +
      '<div class="stepper" role="group" aria-label="Number of bikes"><button type="button" id="minus" aria-label="One bike less"' + (q.bikes <= 1 || wiz.specific ? ' disabled' : '') + '>−</button><output id="cnt" aria-live="polite">' + q.bikes + '</output><button type="button" id="plus" aria-label="One bike more"' + (q.bikes >= free.length || wiz.specific ? ' disabled' : '') + '>+</button></div></div>' +
      '<div id="ptab">' + priceTable(q) + '</div>' + sampleNote() +
      '<div class="flow-actions"><button type="button" class="btn ghost" id="back2">‹ Back</button><button type="button" class="btn primary big" id="next">Next: payment ›</button></div></div></section>';
    const upd = (n) => {
      wiz.count = Math.max(1, Math.min(free.length || 1, n));
      const nq = Data.priceQuote(wiz.count, wiz.start, wiz.end);
      $('#cnt', root).textContent = wiz.count; $('#ptab', root).innerHTML = priceTable(nq);
      $('#minus', root).disabled = wiz.count <= 1; $('#plus', root).disabled = wiz.count >= free.length;
    };
    $('#minus', root).addEventListener('click', () => upd(wiz.count - 1));
    $('#plus', root).addEventListener('click', () => upd(wiz.count + 1));
    $('#back', root).addEventListener('click', () => go('dates'));
    $('#back2', root).addEventListener('click', () => go('dates'));
    $('#next', root).addEventListener('click', () => go('pay'));
  }

  /* ---- step 4: card payment (DEMO: nothing is charged, the card number is never stored) ---- */
  const digits = (s) => String(s || '').replace(/\D/g, '');
  function brandOf(n) {
    if (/^3[47]/.test(n)) return 'Amex';
    if (/^4/.test(n)) return 'Visa';
    if (/^(5[1-5]|2[2-7])/.test(n)) return 'Mastercard';
    if (/^(6011|65|64[4-9])/.test(n)) return 'Discover';
    return '';
  }
  function luhn(n) { let s = 0, alt = false; for (let i = n.length - 1; i >= 0; i--) { let d = +n[i]; if (alt) { d *= 2; if (d > 9) d -= 9; } s += d; alt = !alt; } return n.length >= 13 && s % 10 === 0; }
  function fmtCard(n) { const d = digits(n).slice(0, 19); if (brandOf(d) === 'Amex') return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(' '); return d.replace(/(\d{4})(?=\d)/g, '$1 '); }
  function expOk(v) {
    const m = String(v).match(/^(\d{2})\s*\/\s*(\d{2})$/); if (!m) return false;
    const mm = +m[1], yy = 2000 + +m[2]; if (mm < 1 || mm > 12) return false;
    const now = new Date(); return yy > now.getFullYear() || (yy === now.getFullYear() && mm >= now.getMonth() + 1);
  }

  /* v4.1 (David, Nov 4): more ways to pay — card, Google Pay, Apple Pay (Wallet), Zelle. All demo; each can be
   * turned off in Admin → Settings → Payment methods. */
  const PAY_METHODS = [['card', 'Card', '💳'], ['gpay', 'Google Pay', '<b>G</b>'], ['applepay', 'Apple Pay', '<b>Pay</b>'], ['zelle', 'Zelle', '<b>Z</b>']];
  function payMethods() { const on = Data.settings().payMethods || {}; const l = PAY_METHODS.filter((m) => on[m[0]] !== false); return l.length ? l : PAY_METHODS.slice(0, 1); }
  function payDesc(b) {
    const p = b.payment || {};
    if (p.method === 'zelle') return 'Zelle · note ' + esc(p.ref || '') + (b.depositPaid ? ' · paid' : ' · awaiting Zelle confirmation');
    if (p.last4) return esc(p.brand) + ' •••• ' + esc(p.last4) + ' (demo)';
    if (p.brand) return esc(p.brand) + ' (demo)';
    return '';
  }

  /* v4.1: one place that books the bikes, for every payment method (card, Google Pay, Apple Pay, Zelle). */
  function placeBooking(user, pay, action, paid, note) {
      // pick the bikes: the ones chosen, else free bikes in the chosen area first
      const free = Data.freeBikes(wiz.start, wiz.end);
      let ids;
      if (wiz.specific) {
        const busy = Data.busyBikeIds(wiz.start, wiz.end);
        if (wiz.bikeIds.some((id) => busy.has(id))) { toast('Some bikes were just booked. Please pick again.'); wiz.bikeIds = []; wiz.specific = false; go('dates'); return null; }
        ids = wiz.bikeIds.slice();
      } else {
        if (free.length < wiz.count) { toast('Only ' + free.length + ' bikes are free now. Please check the count.'); go('dates'); return null; }
        const num = (a, b) => a.number.localeCompare(b.number, undefined, { numeric: true });
        ids = free.filter((x) => x.locationId === wiz.area).sort(num).concat(free.filter((x) => x.locationId !== wiz.area).sort(num)).slice(0, wiz.count).map((x) => x.id);
      }
      const qq = Data.priceQuote(ids.length, wiz.start, wiz.end);
      const b = wiz.biz || {};
      const now = new Date().toISOString();
      const rec = Data.put('bookings', {
        clientId: user.id, clientName: b.contact || user.name, company: b.company || user.company || user.name,
        contactPhone: b.phone || '', contactEmail: b.email || '', adText: b.adText || '',
        areaId: wiz.area || '', areaName: areaName(), areaNote: wiz.areaNote || '',
        start: wiz.start, end: wiz.end, bikeIds: ids, mode: wiz.specific ? 'specific' : 'count',
        pricePerDay: Math.round(qq.weeklyEach / 7 * 100) / 100, weeks: qq.weeks, setupFeePerBike: qq.setupEach, weeklyPerBike: qq.weeklyEach,
        setupTotal: qq.setup, weeklyTotal: qq.weekly, total: qq.total, deposit: qq.total, depositPaid: !!paid,
        payment: Object.assign({ amount: qq.total, at: now }, pay),
        status: 'pending', notes: note || '', createdAt: now,
        history: [{ at: now, by: b.contact || user.name, action: action.replace('{amount}', money(qq.total)) }]
      });
      return rec;
  }

  function renderPay(root, user) {
    if (!wiz.start || !wiz.end) return go('dates');
    const q = Data.priceQuote(wiz.count, wiz.start, wiz.end);
    const PM = payMethods(), s = Data.settings();
    if (!PM.some((m) => m[0] === wiz.pay)) wiz.pay = PM.length ? PM[0][0] : 'card';
    if (!wiz.zelleRef) wiz.zelleRef = 'MOW-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const sum = '<table class="price-table"><tbody><tr><td>' + q.bikes + ' bike' + (q.bikes === 1 ? '' : 's') + ' · ' + esc(fmtRange(wiz.start, wiz.end)) + '</td><td class="amt">' + money(q.total) + '</td></tr></tbody></table>';
    const walletDemo = '<p class="demo-note">Demo — nothing is charged. Real Google Pay and Apple Pay connect once a payment account is set up.</p>';
    root.innerHTML = '<section class="page narrow"><div class="page-head"><button class="back" id="back">‹ Price</button><h1>Payment</h1></div>' + steps4(4) +
      '<div class="card pay-methods"><h2>How would you like to pay?</h2><div class="pm-grid" role="radiogroup" aria-label="Payment method">' +
      PM.map(([k, label, ico]) => '<button type="button" class="pm-tile' + (k === wiz.pay ? ' on' : '') + '" role="radio" aria-checked="' + (k === wiz.pay) + '" data-pm="' + k + '"><span class="pm-ico pm-' + k + '" aria-hidden="true">' + ico + '</span><span>' + label + '</span></button>').join('') + '</div></div>' +
      '<div class="card pm-panel" data-panel="gpay"' + (wiz.pay === 'gpay' ? '' : ' hidden') + '><h2>Google Pay</h2><p class="muted">Pay with a card saved in your Google account.</p>' + sum + '<button type="button" class="btn wide big pill wallet-btn" data-wallet="gpay">Pay with Google Pay</button>' + walletDemo + '</div>' +
      '<div class="card pm-panel" data-panel="applepay"' + (wiz.pay === 'applepay' ? '' : ' hidden') + '><h2>Apple Pay</h2><p class="muted">Pay with a card in your Apple Wallet.</p>' + sum + '<button type="button" class="btn wide big pill wallet-btn" data-wallet="applepay">Pay with Apple Pay</button>' + walletDemo + '</div>' +
      '<div class="card pm-panel" data-panel="zelle"' + (wiz.pay === 'zelle' ? '' : ' hidden') + '><h2>Zelle</h2>' +
      '<ol class="zelle-steps"><li>Open Zelle in your bank app.</li><li>Send <b>' + money(q.total) + '</b> to <b>' + esc(s.zelleName || s.businessName || 'Media on Wheels') + '</b>' + (s.zelleContact ? ' · <b>' + esc(s.zelleContact) + '</b>' : ' <span class="muted">(Zelle email or phone is added in Settings)</span>') + '.</li><li>In the Zelle note, write <b class="zref">' + esc(wiz.zelleRef) + '</b>.</li></ol>' + sum +
      '<button type="button" class="btn primary wide big pill" id="zelle-sent">I\'ve sent it</button><p class="demo-note">Your booking waits as “Awaiting Zelle confirmation” until we see the money and mark it paid.</p></div>' +
      '<div class="card pm-panel" data-panel="card"' + (wiz.pay === 'card' ? '' : ' hidden') + '><div class="row-between"><h2>Card details</h2><span class="lock"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>Secure checkout</span></div>' +
      '<div class="paycard" aria-hidden="true"><div class="pc-top"><span>' + esc(Data.settings().businessName || 'Media on Wheels') + '</span><span id="pc-brand">CARD</span></div><div class="pc-num" id="pc-num">•••• •••• •••• ••••</div><div class="pc-bot"><span id="pc-name">NAME ON CARD</span><span id="pc-exp">MM/YY</span></div></div>' +
      '<form class="form cc-form" id="cc" novalidate autocomplete="on">' +
      '<label>Name on card<input class="input" name="ccname" autocomplete="cc-name" required placeholder="Full name"><span class="fe" id="e-name"></span></label>' +
      '<label>Card number<input class="input" name="ccnum" inputmode="numeric" autocomplete="cc-number" required placeholder="1234 5678 9012 3456" maxlength="23"><span class="fe" id="e-num"></span></label>' +
      '<div class="three"><label>Expiry<input class="input" name="ccexp" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/YY" maxlength="5"><span class="fe" id="e-exp"></span></label>' +
      '<label>CVC<input class="input" name="cccvc" inputmode="numeric" autocomplete="cc-csc" placeholder="123" maxlength="4"><span class="fe" id="e-cvc"></span></label>' +
      '<label>ZIP<input class="input" name="cczip" inputmode="numeric" autocomplete="postal-code" placeholder="10950" maxlength="10"><span class="fe" id="e-zip"></span></label></div>' +
      '<label>Note for ' + esc(Data.settings().businessName || 'Media on Wheels') + ' (optional)<textarea class="input" name="note" rows="2" placeholder="e.g. please start the bikes on Lee Ave"></textarea></label>' +
      '<table class="price-table"><tbody><tr><td>' + q.bikes + ' bike' + (q.bikes === 1 ? '' : 's') + ' · ' + esc(fmtRange(wiz.start, wiz.end)) + '<span class="calc">Printing & setup ' + money(q.setup) + ' + weekly ' + money(q.weekly) + '</span></td><td class="amt">' + money(q.total) + '</td></tr></tbody></table>' +
      '<button class="btn primary wide big" type="submit" id="pay">Pay ' + money(q.total) + '</button>' +
      '<p class="demo-note">Demo — real card processing connects once the payment account is set up. Nothing is charged, and the card number is not saved.</p></form></div></section>';
    $('#back', root).addEventListener('click', () => go('price'));
    $$('[data-pm]', root).forEach((t) => t.addEventListener('click', () => {
      wiz.pay = t.getAttribute('data-pm');
      $$('[data-pm]', root).forEach((x) => { const on = x === t; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
      $$('[data-panel]', root).forEach((p) => { p.hidden = p.getAttribute('data-panel') !== wiz.pay; });
    }));
    $$('[data-wallet]', root).forEach((btn) => btn.addEventListener('click', () => {
      const k = btn.getAttribute('data-wallet'), name = k === 'gpay' ? 'Google Pay' : 'Apple Pay';
      const m = UI.modal(name + ' (demo)', '<div class="wallet-sheet"><p class="muted">Pay ' + esc(s.businessName || 'Media on Wheels') + '</p><p class="ws-amt">' + money(q.total) + '</p>' +
        '<p class="small muted">' + q.bikes + ' bike' + (q.bikes === 1 ? '' : 's') + ' · ' + esc(fmtRange(wiz.start, wiz.end)) + '</p>' +
        '<button class="btn primary wide big pill" id="ws-ok">Confirm with ' + name + '</button><p class="demo-note">Demo sheet. No money moves.</p></div>');
      m.querySelector('#ws-ok').addEventListener('click', () => {
        const rec = placeBooking(user, { method: k, brand: name, demo: true }, 'Requested and paid {amount} with ' + name + ' (demo)', true, f.note.value.trim());
        UI.closeModal(); if (rec) { wiz.lastId = rec.id; go('done'); }
      });
    }));
    const zs = $('#zelle-sent', root);
    if (zs) zs.addEventListener('click', () => {
      const rec = placeBooking(user, { method: 'zelle', brand: 'Zelle', ref: wiz.zelleRef, status: 'awaiting', demo: true }, 'Requested; says {amount} was sent by Zelle, note ' + wiz.zelleRef + ' (awaiting Zelle confirmation)', false, f.note.value.trim());
      if (rec) { wiz.lastId = rec.id; wiz.zelleRef = null; go('done'); }
    });
    const f = $('#cc', root);
    const show = () => {
      const n = digits(f.ccnum.value);
      $('#pc-num', root).textContent = n ? fmtCard(n) : '•••• •••• •••• ••••';
      $('#pc-brand', root).textContent = brandOf(n) || 'CARD';
      $('#pc-name', root).textContent = f.ccname.value.trim() || 'NAME ON CARD';
      $('#pc-exp', root).textContent = f.ccexp.value || 'MM/YY';
    };
    f.ccnum.addEventListener('input', () => { const pos = f.ccnum.value.length; f.ccnum.value = fmtCard(f.ccnum.value); if (pos >= f.ccnum.value.length) f.ccnum.setSelectionRange(f.ccnum.value.length, f.ccnum.value.length); show(); });
    f.ccexp.addEventListener('input', (e) => { let d = digits(f.ccexp.value).slice(0, 4); if (d.length === 1 && +d > 1) d = '0' + d; f.ccexp.value = d.length > 2 || (d.length === 2 && e.inputType !== 'deleteContentBackward') ? d.slice(0, 2) + '/' + d.slice(2) : d; show(); });
    f.cccvc.addEventListener('input', () => { f.cccvc.value = digits(f.cccvc.value).slice(0, 4); });
    f.cczip.addEventListener('input', () => { f.cczip.value = f.cczip.value.replace(/[^\d-]/g, '').slice(0, 10); });
    f.ccname.addEventListener('input', show);
    [['ccname', 'e-name'], ['ccnum', 'e-num'], ['ccexp', 'e-exp'], ['cccvc', 'e-cvc'], ['cczip', 'e-zip']].forEach(([n, id]) => f[n].addEventListener('input', () => { if (f[n].classList.contains('bad')) { f[n].classList.remove('bad'); f[n].removeAttribute('aria-invalid'); $('#' + id, root).textContent = ''; } }));
    const setErr = (inp, id, msg) => { $('#' + id, root).textContent = msg || ''; inp.classList.toggle('bad', !!msg); inp.setAttribute('aria-invalid', msg ? 'true' : 'false'); return !msg; };
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = digits(f.ccnum.value), brand = brandOf(n);
      let ok = true;
      ok = setErr(f.ccname, 'e-name', f.ccname.value.trim().length < 2 ? 'Type the name on the card' : '') && ok;
      ok = setErr(f.ccnum, 'e-num', !luhn(n) ? 'This card number doesn\'t look right' : '') && ok;
      ok = setErr(f.ccexp, 'e-exp', !expOk(f.ccexp.value) ? 'MM/YY, not expired' : '') && ok;
      ok = setErr(f.cccvc, 'e-cvc', !(brand === 'Amex' ? /^\d{4}$/ : /^\d{3}$/).test(f.cccvc.value) ? (brand === 'Amex' ? '4 digits' : '3 digits') : '') && ok;
      ok = setErr(f.cczip, 'e-zip', !/^\d{5}(-\d{4})?$/.test(f.cczip.value) ? '5-digit ZIP' : '') && ok;
      if (!ok) { const bad = f.querySelector('.bad'); if (bad) bad.focus(); return; }
      const last4 = n.slice(-4);
      const rec = placeBooking(user, { method: 'card', brand: brand || 'Card', last4, demo: true }, 'Requested and paid {amount} by ' + (brand || 'card') + ' ending ' + last4 + ' (demo)', true, f.note.value.trim());
      if (!rec) return;
      f.reset();
      wiz.lastId = rec.id; go('done');
    });
  }

  function renderDone(root) {
    const b = Data.get('bookings', wiz.lastId);
    const J = window.JCal && JCal.ready ? JCal : null;
    root.innerHTML = '<section class="page narrow center"><div class="done-mark" aria-hidden="true">✓</div><h1>Booking confirmed</h1>' +
      '<p class="lead">' + (b && b.payment && b.payment.method === 'zelle' ? 'Thank you! Your booking is sent. It shows as “Awaiting Zelle confirmation” until we see your Zelle payment.' : 'Thank you! Your payment went through (demo) and your booking is sent to ' + esc(Data.settings().businessName || 'Media on Wheels') + '.') + '</p>' +
      (b ? '<div class="card confirm-card"><dl class="kv wide"><dt>Booking #</dt><dd>' + 'BK-' + esc(String(b.id).slice(-6).toUpperCase()) + '</dd>' +
        '<dt>Business</dt><dd>' + esc(b.company) + '</dd><dt>Area</dt><dd>' + esc(b.areaName || '') + (b.areaNote ? ' · ' + esc(b.areaNote) : '') + '</dd>' +
        '<dt>Dates</dt><dd>' + esc(fmtRange(b.start, b.end)) + (J ? '<br><span class="he" lang="he">' + esc(J.day(b.start).heFull) + ' – ' + esc(J.day(b.end).heFull) + '</span>' : '') + '</dd>' +
        '<dt>Bikes</dt><dd>' + b.bikeIds.length + ' (' + b.bikeIds.map(Data.bikeLabel).join(', ') + ')</dd>' +
        '<dt>Printing & setup</dt><dd>' + money(b.setupTotal) + '</dd><dt>Weekly (' + b.weeks + ' wk)</dt><dd>' + money(b.weeklyTotal) + '</dd>' +
        '<dt class="hl">' + (b.depositPaid ? 'Paid' : 'To pay') + '</dt><dd class="hl">' + money(b.total) + '</dd><dt>Payment</dt><dd>' + payDesc(b) + '</dd>' +
        '<dt>Status</dt><dd><span class="badge st-pending">Pending</span> until ' + esc(Data.settings().businessName || 'Media on Wheels') + ' approves it</dd></dl></div>' : '') +
      '<div class="row-center"><a class="btn primary" href="#/client/bookings" id="tomy">My bookings</a><button class="btn ghost" id="again">Book more</button></div></section>';
    $('#again', root).addEventListener('click', () => { resetWiz(); App.render(); });
    $('#tomy', root).addEventListener('click', () => resetWiz());
  }

  /* ================= MY BOOKINGS ================= */
  function payLine(b) {
    if (b.payment && b.payment.method === 'zelle') return 'Total ' + money(b.total) + ' · ' + payDesc(b);
    if (b.payment && (b.payment.last4 || b.payment.brand)) return 'Total ' + money(b.total) + ' · paid by ' + payDesc(b);
    return 'Total ' + money(b.total) + ' · deposit ' + money(b.deposit) + (b.depositPaid ? ' paid (demo)' : '');
  }
  function renderMine(root, user) {
    teardown();
    const mine = Data.list('bookings').filter((b) => b.clientId === user.id).sort((a, b) => b.start.localeCompare(a.start));
    root.innerHTML = '<section class="page narrow"><div class="page-head"><h1>My bookings</h1><a class="btn primary" href="#/client/book" id="newbk">+ New</a></div>' +
      (mine.length ? mine.map((b) => '<article class="card my-bk"><div class="bk-title"><strong>' + fmtRange(b.start, b.end) + '</strong> ' + badge(b) + '</div>' +
        '<div class="small">' + b.bikeIds.length + ' bikes: ' + b.bikeIds.map(Data.bikeLabel).join(', ') + (b.areaName ? ' · ' + esc(b.areaName) : '') + '</div>' +
        (b.setupTotal != null ? '<div class="small muted">Printing & setup ' + money(b.setupTotal) + ' · weekly ' + money(b.weeklyTotal) + '</div>' : '') +
        '<div class="small muted">' + payLine(b) + '</div>' +
        (statusOf(b) === 'pending' ? '<div class="row-end"><button class="btn danger-ghost" data-cancel="' + b.id + '">Cancel request</button></div>' : '') + '</article>').join('')
        : '<div class="card center"><p>No bookings yet.</p><a class="btn primary" href="#/client/book">Book bikes</a></div>') + '</section>';
    const nb = $('#newbk', root); if (nb) nb.addEventListener('click', () => resetWiz());
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
    PAY_METHODS,
    tabs: [
      { key: 'book', label: 'Book', icon: 'cal', render: renderBook },
      { key: 'bookings', label: 'My bookings', icon: 'list', render: renderMine }
    ],
    teardown, resetWiz
  };
})();
