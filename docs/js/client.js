/* Client side (v3): 1 Details & area → 2 Dates (English + Hebrew calendar) & number of bikes → 3 Price
 * (printing & setup + weekly charge) → 4 Card payment (demo) → confirmation; plus My bookings.
 * The live map is admin-only (David, Nov 3 2026), so clients have no map view. */
(function () {
  'use strict';
  const { esc, money, fmtDate, fmtRange, $, $$, toast, confirmBox, statusOf, badge, calendarHtml } = UI;

  let ride = null;
  /* Nov 8 2026 (client, via David): a booking is at least 5 bikes. Admin can change it in settings.minBikes; the admin's own booking editor has no minimum. */
  const MIN_BIKES = () => Math.max(1, Math.round(+((window.Data && Data.settings && Data.settings().minBikes) || 5)));
  const MAX_BIKES = () => Math.max(MIN_BIKES(), Math.round(+((window.SiteSettings && SiteSettings.get('maxBikes')) || 500))); /* Admin → Pricing (default 500, only a typing guard) */
  const SSET = (k, d) => (window.SiteSettings ? SiteSettings.get(k) : d); /* Nov 8 2026: admin menu settings */
  const clampCount = (n) => Math.max(MIN_BIKES(), Math.min(MAX_BIKES(), Math.round(+n) || MIN_BIKES()));
  /* Nov 8 2026: discounts (admin price table) + promo code for this booking */
  let me = null;
  const quoteOpts = () => ({ promo: wiz.promo || null, client: me ? { id: me.id, email: me.email } : null });
  const quote = () => (wiz.payFor && Data.get('bookings', wiz.payFor) ? bookingQuote(Data.get('bookings', wiz.payFor)) : Data.priceQuote(wiz.count, wiz.start, wiz.end, quoteOpts()));
  /* Nov 8 2026 (David 5:13 PM: "he is not booking it. He is only requesting it"): a request first, the deposit after approval. */
  const REQ = () => SSET('requestFirst', true) !== false;
  const bookingQuote = (b) => ({ bikes: b.bikeIds.length, total: b.total, deposit: b.deposit, balance: b.balance, depositPct: b.depositPct, days: Data.days(b.start, b.end), weeks: b.weeks });
  const minNote = () => '<p class="small muted min-note">Minimum ' + MIN_BIKES() + ' bikes</p>';
  const blank = () => ({ step: 'details', start: null, end: null, count: 5, promo: null, bikeIds: [], specific: false, mode: 'count', area: '', areaNote: '', biz: null, lastId: null, payFor: null });
  const wiz = Object.assign(blank(), { calY: null, calM: null });
  function resetWiz() { const y = wiz.calY, m = wiz.calM; Object.assign(wiz, blank(), { calY: y, calM: m }); }
  function teardown() { if (ride) { ride.destroy(); ride = null; } }

  function steps4(n) {
    const names = ['Details', 'Dates & bikes', 'Price', REQ() ? 'Request' : 'Payment'];
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
    teardown(); me = user;
    if (wiz.step === 'dates' || wiz.step === 'start' || wiz.step === 'end') return renderDates(root, user);
    if (wiz.step === 'price') return renderPrice(root, user);
    if (wiz.step === 'pay') return renderPay(root, user);
    if (wiz.step === 'done') return renderDone(root, user);
    return renderDetails(root, user);
  }

  /* ---- step 1: business details + area ---- */
  function formField(id) {
    const D = { company: ['Business / company name (shown on the ads)', 'e.g. Fresh Basket Grocery', true], email: ['Email address', '', true], phone: ['Phone number', '(845) 555-0123', true], campaign: ['Campaign description', "What's the campaign about? (optional)", false] }[id];
    return window.SiteSettings ? SiteSettings.field(id) : { show: true, required: D[2], label: D[0], help: D[1] };
  }
  function box(id, open, inner) {
    const F = formField(id); if (!F.show) return '';
    const attrs = (F.required ? ' required' : '') + (F.help ? ' placeholder="' + esc(F.help) + '"' : '');
    return '<label>' + esc(F.label) + open + attrs + (inner != null ? '>' + inner + '</textarea>' : '>') + '</label>';
  }
  function renderDetails(root, user) {
    const b = bizOf(user);
    root.innerHTML = '<section class="page narrow"><div class="page-head"><h1>' + (REQ() ? 'Request ad bikes' : 'Book ad bikes') + '</h1></div>' + steps4(1) +
      '<form class="card form" id="det" novalidate><h2>Your business</h2>' +
      /* Nov 8 2026 (client Shimon): step 1 asks ONLY business / company name, email, phone and (3:58 PM) an optional campaign description. The area, streets and old ad-text questions were taken off. */
      /* Nov 8 2026 (admin menu → Booking form): each box can be shown/hidden, required or not, with its own label and help text. */
      box('company', '<input class="input" name="company" autocomplete="organization" value="' + esc(b.company) + '"') +
      box('email', '<input class="input" name="email" type="email" autocomplete="email" value="' + esc(b.email) + '"') +
      box('phone', '<input class="input" name="phone" type="tel" inputmode="tel" autocomplete="tel" value="' + esc(b.phone) + '"') +
      box('campaign', '<textarea class="input" name="campaign" rows="3" maxlength="600"', esc(b.adText || '')) +
      '<p class="err" id="det-err" role="alert"></p>' +
      '<div class="flow-actions"><span class="small muted">Step 1 of 4</span><button class="btn primary big" type="submit">Next: dates & bikes ›</button></div></form>' +
      /* Nov 8 2026: the client asked to take the "Your ad riding in Williamsburg" preview off this step (rideCard kept in the code).
       * Admin → Switches → "Bike map card on booking step 1" can bring it back (off by default). */
      (SSET('show.bookingMap', false) === true ? rideCard('Your ad, riding in ' + (window.SiteSettings ? SiteSettings.areasText() : 'Williamsburg')) : '') +
      '</section>';
    const f = $('#det', root);
    const val = (n) => (f[n] ? f[n].value.trim() : null);
    const save = () => {
      const v = { company: val('company'), phone: val('phone'), email: val('email'), adText: val('campaign') };
      Object.keys(v).forEach((k) => { if (v[k] !== null) b[k] = v[k]; }); /* a hidden box keeps the account's value */
      if (!b.company) b.company = (user && (user.company || user.name)) || '';
      wiz.area = ''; wiz.areaNote = ''; /* no longer asked */
    };
    if ($('#ride', root)) mountRide(root); /* only when the admin switched the bike card back on */
    if (f.company) f.company.addEventListener('input', () => { b.company = f.company.value.trim(); updRide(); });
    f.addEventListener('submit', (e) => {
      e.preventDefault(); save();
      const err = $('#det-err', root);
      const need = (id) => formField(id).show && formField(id).required;
      if (need('company') && !b.company) { err.textContent = 'Please type the business name.'; f.company.focus(); return; }
      if ((need('email') || (f.email && f.email.value.trim())) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email || '')) { err.textContent = 'Please type a good email address.'; f.email.focus(); return; }
      if ((need('phone') || (f.phone && f.phone.value.trim())) && String(b.phone || '').replace(/\D/g, '').length < 7) { err.textContent = 'Please type the phone number.'; f.phone.focus(); return; }
      if (need('campaign') && !b.adText) { err.textContent = 'Please describe the campaign.'; f.campaign.focus(); return; }
      go('dates');
    });
  }

  /* ---- step 2: dates (English + Hebrew calendar) + number of bikes ---- */
  function renderDates(root, user) {
    const now = new Date();
    if (wiz.calY === null) { wiz.calY = now.getFullYear(); wiz.calM = now.getMonth(); }
    const picking = wiz.start && !wiz.end;
    const free = freeFor();
    const fleet = Data.list('bikes').filter((x) => x.active !== false).length; /* inactive bikes (admin) are not offered */
    if (wiz.specific) wiz.count = wiz.bikeIds.length;
    if (!wiz.specific) wiz.count = clampCount(wiz.count);
    const J = window.JCal && JCal.ready ? JCal : null;
    const heOf = (ds) => (J ? ' <span class="he" lang="he">' + esc(J.day(ds).heFull) + '</span>' : '');
    /* Nov 8 2026 (client): clean calendar — free bikes + small Hebrew date; a holiday is only a tiny dot + one small line (UI.calendarHtml); Shabbos blocked. */
    const isShabbos = (ds) => (J ? !!J.day(ds).shabbos : new Date(ds + 'T12:00:00').getDay() === 6);
    const shab = SSET('shabbosNoteOn', true) !== false ? ' ' + esc(SSET('shabbosNote', 'The bikes do not ride on Shabbos.')) : '';
    const earliest = window.SiteSettings ? SiteSettings.earliest() : Data.today();
    const blocked = (ds) => !!(window.SiteSettings && SiteSettings.blocked(ds)); /* Admin → Calendar & days: blocked days + lead time */
    const wk = wiz.start && wiz.end ? Data.weeks(wiz.start, wiz.end) : 0, wMin = Math.max(1, +SSET('weeksMin', 1) || 1), wMax = Math.max(wMin, +SSET('weeksMax', 52) || 52);
    const weeksBad = wk && (wk < wMin || wk > wMax);
    const banner = !wiz.start ? '<strong>Tap the first day.</strong> Each day shows how many bikes are free.' + shab :
      picking ? '<strong>Now tap the last day.</strong> Starting ' + esc(fmtDate(wiz.start)) + '.<div class="quick"><button type="button" class="chip" data-q="6">1 week</button><button type="button" class="chip" data-q="13">2 weeks</button><button type="button" class="chip" data-q="27">4 weeks</button></div>' :
      '<strong>Dates picked.</strong> Tap a day to start over.';
    let sel = '';
    if (wiz.start && wiz.end) {
      const days = Data.days(wiz.start, wiz.end), weeks = Data.weeks(wiz.start, wiz.end);
      sel = '<div class="sel-sum"><strong>' + esc(fmtRange(wiz.start, wiz.end)) + '</strong><span>' + days + ' day' + (days > 1 ? 's' : '') + ' · billed as ' + weeks + ' week' + (weeks > 1 ? 's' : '') + '</span>' +
        (J ? '<span class="he" lang="he">' + esc(J.day(wiz.start).heFull) + ' – ' + esc(J.day(wiz.end).heFull) + '</span>' : '') + '</div>';
    }
    const all = Data.list('bikes').filter((x) => x.active !== false).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
    const freeIds = new Set(free.map((x) => x.id));
    const chosen = new Set(wiz.bikeIds);
    root.innerHTML = '<section class="page"><div class="page-head"><button class="back" id="back">‹ Details</button><h1>Dates & bikes</h1></div>' + steps4(2) +
      '<div class="pick-banner ' + (picking ? 'end' : '') + '">' + banner + '</div>' +
      '<div class="card cal-card">' + calendarHtml(wiz.calY, wiz.calM, {
        isDisabled: (ds) => ds < earliest || (picking && ds < wiz.start) || isShabbos(ds) || blocked(ds),
        rangeStart: wiz.start, rangeEnd: wiz.end || wiz.start, holidays: false, labels: false, dots: SSET('holidayDots', true) !== false,
        cell: (ds) => {
          if (ds < earliest || isShabbos(ds)) return '';
          if (blocked(ds)) return '<span class="free none">closed</span>';
          const n = Data.freeBikes(ds, ds).length;
          return '<span class="free ' + (n === 0 ? 'none' : n < 5 ? 'low' : '') + '">' + (n === 0 ? 'full' : '<b>' + n + '</b><i> free</i>') + '</span>';
        }
      }) + '</div>' +
      '<section class="card"><h2>How many bikes?</h2>' + sel +
      '<div class="bike-row" style="margin-top:.7rem"><div><strong>' + (wiz.specific ? 'Bikes you picked' : 'Number of bikes') + '</strong><div class="small muted">' + (wiz.start && wiz.end ? free.length + ' of ' + fleet + ' bikes free for these dates' : fleet + ' bikes in the fleet · pick dates to see what is free') + '</div></div>' +
      '<div class="stepper" role="group" aria-label="Number of bikes"><button type="button" id="minus" aria-label="One bike less"' + (wiz.count <= MIN_BIKES() || wiz.specific ? ' disabled' : '') + '>−</button><input id="cnt" type="number" inputmode="numeric" min="' + MIN_BIKES() + '" max="' + MAX_BIKES() + '" step="1" value="' + wiz.count + '" aria-label="Number of bikes"' + (wiz.specific ? ' disabled' : '') + '><button type="button" id="plus" aria-label="One bike more"' + (wiz.count >= MAX_BIKES() || wiz.specific ? ' disabled' : '') + '>+</button></div></div>' + /* Nov 8 2026 (David): no "Minimum 5 bikes" line; the minus button simply stops at 5 */
      (weeksBad ? '<p class="err" id="weeks-bad">A booking is ' + (wMin === wMax ? wMin : 'from ' + wMin + ' to ' + wMax) + ' week' + (wMax > 1 ? 's' : '') + ' long. Please pick other dates.</p>' : '') +
      (wiz.specific && wiz.bikeIds.length < MIN_BIKES() ? '<p class="err">Please pick at least ' + MIN_BIKES() + ' bikes (you picked ' + wiz.bikeIds.length + ').</p>' : '') +
      (wiz.start && wiz.end && free.length && free.length < MIN_BIKES() ? '<p class="err">Only ' + free.length + ' bikes are free on these days, and a booking is at least ' + MIN_BIKES() + ' bikes. Please try other dates.</p>' : '') +
      (wiz.start && wiz.end && !wiz.specific && free.length >= MIN_BIKES() && wiz.count > free.length ? '<p class="err" id="too-many">Only ' + free.length + ' bikes are free on these days. Please pick ' + free.length + ' or fewer, or other dates.</p>' : '') +
      '<details class="mt"' + (wiz.specific ? ' open' : '') + '><summary class="small" style="cursor:pointer;font-weight:650">Pick specific bike numbers (optional)</summary>' +
      '<div class="bike-grid" style="margin-top:.6rem">' + all.map((x) => {
        const ok = freeIds.has(x.id), loc = Data.get('locations', x.locationId);
        return '<button type="button" class="bike-tile' + (chosen.has(x.id) ? ' on' : '') + (ok ? '' : ' busy') + '" data-bike="' + x.id + '"' + (ok ? '' : ' disabled') + ' aria-pressed="' + chosen.has(x.id) + '"><span class="num">' + esc(x.number) + '</span><span class="small">' + esc(loc ? loc.name : '') + '</span><span class="small">' + (ok ? 'Free' : 'Booked') + '</span></button>';
      }).join('') + '</div>' + (wiz.specific ? '<button type="button" class="btn ghost small-btn" id="clearpick" style="margin-top:.5rem">Clear, just give me any free bikes</button>' : '') + '</details>' +
      '<div class="flow-actions"><button type="button" class="btn ghost" id="back2">‹ Back</button><button type="button" class="btn primary big" id="confirm"' + (wiz.start && wiz.end && !weeksBad && wiz.count >= MIN_BIKES() && free.length >= MIN_BIKES() && wiz.count <= free.length ? '' : ' disabled') + '>' + (REQ() ? 'Next: see the price ›' : 'Confirm booking ›') + '</button></div>' +
      (wiz.start && wiz.end && !free.length ? (Data.list('bikes').length ? '<p class="err">No bikes are free for all of these days. Try other dates.</p>' : '<p class="err">Our bikes are being set up in the system right now, so they cannot be booked online yet. Please check back soon.</p>') : '') + '</section>' +
      /* Nov 8 2026 (David: "Take down this map"): the "More bikes, more streets" bike animation is off this step (rideCard kept in the code) */
      '</section>';
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
    /* Nov 8 2026 (David: "What if I want ten?"): + always goes up (6, 7 … 10 and more), the number can be typed, and − stops at the minimum.
     * If more bikes are asked for than are free on the picked days, a short note says so and Confirm waits. */
    const setCount = (n) => { wiz.count = clampCount(n); App.render(); };
    $('#minus', root).addEventListener('click', () => setCount(wiz.count - 1));
    $('#plus', root).addEventListener('click', () => setCount(wiz.count + 1));
    const cnt = $('#cnt', root);
    cnt.addEventListener('change', () => setCount(parseInt(cnt.value, 10)));
    cnt.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); setCount(parseInt(cnt.value, 10)); } });
    $$('[data-bike]', root).forEach((b) => b.addEventListener('click', () => {
      const id = b.getAttribute('data-bike');
      const s = new Set(wiz.bikeIds); if (s.has(id)) s.delete(id); else s.add(id);
      wiz.bikeIds = Array.from(s); wiz.specific = wiz.bikeIds.length > 0; if (!wiz.specific) wiz.count = clampCount(wiz.count); App.render();
    }));
    const cp = $('#clearpick', root); if (cp) cp.addEventListener('click', () => { wiz.bikeIds = []; wiz.specific = false; App.render(); });
    $('#confirm', root).addEventListener('click', () => go('price'));
  }

  function priceTable(q) {
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
    return '<table class="price-table"><tbody>' +
      '<tr><td>Printing & setup<span class="calc">' + plural(q.bikes, 'bike') + ' × ' + money(q.setupEach) + ' one-time fee</span></td><td class="amt">' + money(q.setup) + '</td></tr>' +
      '<tr><td>Weekly charge<span class="calc">' + plural(q.bikes, 'bike') + ' × ' + money(q.weeklyEach) + ' a week × ' + plural(q.weeks, 'week') + '</span></td><td class="amt">' + money(q.weekly) + '</td></tr>' +
      '<tr class="sub"><td>Subtotal</td><td class="amt">' + money(q.subtotal) + '</td></tr>' +
      (q.discounts || []).map((x) => '<tr class="disc"><td>Discount: ' + esc(x.label) + '<span class="calc">' + x.pct + '% off</span></td><td class="amt">−' + money(x.amount) + '</td></tr>').join('') +
      '<tr class="total"><td>Total</td><td class="amt" id="grand">' + money(q.total) + '</td></tr>' +
      '<tr class="dep"><td><strong>' + (REQ() && !wiz.payFor ? 'Deposit after we approve' : 'Deposit due now') + ' (' + q.depositPct + '%)</strong></td><td class="amt"><strong>' + money(q.deposit) + '</strong></td></tr>' +
      '<tr class="bal"><td>Balance later<span class="calc">paid before the ads start; we confirm the date with you</span></td><td class="amt">' + money(q.balance) + '</td></tr></tbody></table>';
  }
  const sampleNote = () => Data.settings().pricesAreSamples ? '<div class="sample-note" role="note"><span aria-hidden="true">ℹ️</span><span><strong>Sample prices.</strong> The real printing, setup and weekly prices will be set by Media on Wheels.</span></div>' : '';

  /* ---- step 3: price summary ---- */
  function renderPrice(root) {
    if (!wiz.start || !wiz.end) return go('dates');
    const free = freeFor();
    if (wiz.specific) wiz.count = wiz.bikeIds.length;
    if (wiz.count < MIN_BIKES() || free.length < MIN_BIKES()) return go('dates'); /* minimum 5 bikes */
    if (!wiz.specific) { wiz.count = clampCount(wiz.count); if (wiz.count > free.length) return go('dates'); } /* more bikes than are free: back to the dates step, which says so */
    const q = quote();
    const J = window.JCal && JCal.ready ? JCal : null;
    const promoBox = '<form class="promo" id="promo" novalidate><label>Promo code (optional)<span class="promo-row"><input class="input" name="code" autocomplete="off" value="' + esc(wiz.promo ? wiz.promo.code || '' : '') + '"><button class="btn" type="submit">' + (wiz.promo ? 'Change' : 'Apply') + '</button></span></label><p class="small" id="promo-msg" role="status">' + (wiz.promo ? '✓ ' + esc(wiz.promo.label || 'Promo code') + ': ' + (+wiz.promo.pct) + '% off' : '') + '</p></form>';
    root.innerHTML = '<section class="page narrow"><div class="page-head"><button class="back" id="back">‹ Dates & bikes</button><h1>Your price</h1></div>' + steps4(3) +
      '<div class="card"><div class="sel-sum"><strong>' + esc(wiz.biz ? wiz.biz.company : '') + '</strong>' + (areaName() ? '<span>' + esc(areaName()) + '</span>' : '') + (wiz.biz && wiz.biz.adText ? '<span class="campaign-line">Campaign: ' + esc(wiz.biz.adText) + '</span>' : '') + '<span>' + esc(fmtRange(wiz.start, wiz.end)) + ' · ' + q.days + ' days</span>' +
      (J ? '<span class="he" lang="he">' + esc(J.day(wiz.start).heFull) + ' – ' + esc(J.day(wiz.end).heFull) + '</span>' : '') + '</div>' +
      '<div class="bike-row" style="margin:.9rem 0 .3rem"><div><strong>Bikes</strong><div class="small muted">' + (wiz.specific ? 'Bikes ' + wiz.bikeIds.map(Data.bikeLabel).join(', ') : 'Up to ' + free.length + ' free for these dates') + '</div></div>' +
      '<div class="stepper" role="group" aria-label="Number of bikes"><button type="button" id="minus" aria-label="One bike less"' + (q.bikes <= MIN_BIKES() || wiz.specific ? ' disabled' : '') + '>−</button><output id="cnt" aria-live="polite">' + q.bikes + '</output><button type="button" id="plus" aria-label="One bike more"' + (q.bikes >= free.length || wiz.specific ? ' disabled' : '') + '>+</button></div></div>' +
      '<div id="ptab">' + priceTable(q) + '</div>' + promoBox + sampleNote() +
      '<div class="flow-actions"><button type="button" class="btn ghost" id="back2">‹ Back</button><button type="button" class="btn primary big" id="next">' + (REQ() ? 'Send request ›' : 'Next: payment ›') + '</button></div></div></section>';
    const upd = (n) => {
      wiz.count = Math.min(free.length, clampCount(n));
      const nq = quote();
      $('#cnt', root).textContent = wiz.count; $('#ptab', root).innerHTML = priceTable(nq);
      $('#minus', root).disabled = wiz.count <= MIN_BIKES(); $('#plus', root).disabled = wiz.count >= free.length;
    };
    $('#minus', root).addEventListener('click', () => upd(wiz.count - 1));
    $('#plus', root).addEventListener('click', () => upd(wiz.count + 1));
    $('#back', root).addEventListener('click', () => go('dates'));
    $('#back2', root).addEventListener('click', () => go('dates'));
    $('#next', root).addEventListener('click', () => (REQ() ? sendRequest(me) : go('pay')));
    $('#promo', root).addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = e.target.code.value.trim(), msg = $('#promo-msg', root);
      if (!code) { wiz.promo = null; App.render(); return; }
      msg.textContent = 'Checking…';
      let rule = null;
      try { rule = window.Auth && Auth.remote ? await Auth.checkPromo(code) : Data.findPromo(code); } catch (ex) { rule = null; }
      if (!rule) { wiz.promo = null; msg.textContent = 'That code is not valid.'; $('#ptab', root).innerHTML = priceTable(quote()); return; }
      wiz.promo = Object.assign({}, rule, { code: rule.code || code }); App.render();
    });
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
      if (wiz.payFor) { /* paying the deposit of an approved request */
        const b = Data.get('bookings', wiz.payFor), now = new Date().toISOString();
        Data.put('bookings', { id: b.id, payment: Object.assign({ amount: b.deposit, at: now }, pay), depositPaid: !!paid, notes: note || b.notes || '', history: (b.history || []).concat([{ at: now, by: user.name, action: action.replace('{amount}', money(b.deposit) + ' deposit') }]) });
        if (paid && b.status === 'approved' && !Data.list('transactions').some((t) => t.bookingId === b.id && t.category === 'Booking deposit'))
          Data.put('transactions', { date: Data.today(), description: (pay.brand || 'Payment') + ' (demo) - deposit - ' + b.company, amount: b.deposit, category: 'Booking deposit', bookingId: b.id, reconciled: false, createdAt: now });
        return Data.get('bookings', b.id);
      }
      // pick the bikes: the ones chosen, else free bikes in the chosen area first
      const free = Data.freeBikes(wiz.start, wiz.end);
      let ids;
      if ((wiz.specific ? wiz.bikeIds.length : wiz.count) < MIN_BIKES()) { toast('A booking is at least ' + MIN_BIKES() + ' bikes.'); go('dates'); return null; }
      if (wiz.specific) {
        const busy = Data.busyBikeIds(wiz.start, wiz.end);
        if (wiz.bikeIds.some((id) => busy.has(id))) { toast('Some bikes were just booked. Please pick again.'); wiz.bikeIds = []; wiz.specific = false; go('dates'); return null; }
        ids = wiz.bikeIds.slice();
      } else {
        if (free.length < wiz.count) { toast('Only ' + free.length + ' bikes are free now. Please check the count.'); go('dates'); return null; }
        const num = (a, b) => a.number.localeCompare(b.number, undefined, { numeric: true });
        ids = free.filter((x) => x.locationId === wiz.area).sort(num).concat(free.filter((x) => x.locationId !== wiz.area).sort(num)).slice(0, wiz.count).map((x) => x.id);
      }
      const qq = Data.priceQuote(ids.length, wiz.start, wiz.end, quoteOpts());
      const b = wiz.biz || {};
      const now = new Date().toISOString();
      const rec = Data.put('bookings', {
        clientId: user.id, clientName: b.contact || user.name, company: b.company || user.company || user.name,
        contactPhone: b.phone || '', contactEmail: b.email || '', adText: b.adText || '',
        areaId: wiz.area || '', areaName: areaName(), areaNote: wiz.areaNote || '',
        start: wiz.start, end: wiz.end, bikeIds: ids, mode: wiz.specific ? 'specific' : 'count',
        pricePerDay: Math.round(qq.weeklyEach / 7 * 100) / 100, weeks: qq.weeks, setupFeePerBike: qq.setupEach, weeklyPerBike: qq.weeklyEach,
        setupTotal: qq.setup, weeklyTotal: qq.weekly, subtotal: qq.subtotal, discounts: qq.discounts, discount: qq.discount, promoCode: wiz.promo ? wiz.promo.code || '' : '',
        total: qq.total, depositPct: qq.depositPct, deposit: qq.deposit, depositPaid: !!paid, balance: qq.balance, balancePaid: false,
        payment: Object.assign({ amount: qq.deposit, at: now }, pay),
        status: 'pending', notes: note || '', createdAt: now,
        history: [{ at: now, by: b.contact || user.name, action: action.replace('{amount}', money(qq.deposit) + ' deposit') }]
      });
      return rec;
  }

  /* Request first (default): the booking is saved as "Requested" with nothing paid; the deposit is paid after approval. */
  async function sendRequest(user) {
    const rec = placeBooking(user, { method: 'request' }, 'Request sent (nothing paid yet; deposit after approval)', false, '');
    if (!rec) return;
    Data.put('bookings', { id: rec.id, requestOnly: true, payment: null });
    wiz.lastId = rec.id;
    const b = Data.get('bookings', rec.id);
    if (window.Mailer) { Mailer.send('requested', b); Mailer.send('newRequest', b); }
    go('done');
    const text = window.SiteSettings ? SiteSettings.text('msgRequestPopup').replace(/\{bikes\}/g, b.bikeIds.length).replace(/\{dates\}/g, fmtRange(b.start, b.end)) : 'You requested ' + b.bikeIds.length + ' bikes.';
    const m = UI.modal('Request sent', '<div class="req-pop center"><div class="done-mark" aria-hidden="true">✓</div><p class="lead" id="req-pop-text">' + esc(text) + '</p><div class="row-center"><button class="btn primary" data-close>OK</button></div></div>', { noFocus: true });
    m.parentNode.classList.add('req-pop-wrap');
  }
  /* After approval: pay the deposit for that booking (My bookings → Pay deposit). */
  function payFor(id) {
    const b = Data.get('bookings', id); if (!b) return;
    Object.assign(wiz, { payFor: id, start: b.start, end: b.end, count: b.bikeIds.length, specific: false, biz: { company: b.company, email: b.contactEmail, phone: b.contactPhone, adText: b.adText } });
    wiz.step = 'pay'; location.hash = '#/client/book'; App.render(); window.scrollTo(0, 0);
  }

  function renderPay(root, user) {
    if (!wiz.start || !wiz.end) return go('dates');
    const q = quote();
    const PM = payMethods(), s = Data.settings();
    if (!PM.some((m) => m[0] === wiz.pay)) wiz.pay = PM.length ? PM[0][0] : 'card';
    if (!wiz.zelleRef) wiz.zelleRef = 'MOW-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const sum = '<table class="price-table"><tbody><tr><td>' + q.bikes + ' bike' + (q.bikes === 1 ? '' : 's') + ' · ' + esc(fmtRange(wiz.start, wiz.end)) + '<span class="calc">Total ' + money(q.total) + ' · balance later ' + money(q.balance) + '</span></td><td class="amt">' + money(q.total) + '</td></tr>' +
      '<tr class="dep"><td><strong>Deposit due now (' + q.depositPct + '%)</strong></td><td class="amt"><strong>' + money(q.deposit) + '</strong></td></tr></tbody></table>';
    const walletDemo = '<p class="demo-note">Demo — nothing is charged. Real Google Pay and Apple Pay connect once a payment account is set up.</p>';
    root.innerHTML = '<section class="page narrow"><div class="page-head"><button class="back" id="back">‹ Price</button><h1>Payment</h1></div>' + steps4(4) +
      '<div class="card pay-methods"><h2>How would you like to pay?</h2><div class="pm-grid" role="radiogroup" aria-label="Payment method">' +
      PM.map(([k, label, ico]) => '<button type="button" class="pm-tile' + (k === wiz.pay ? ' on' : '') + '" role="radio" aria-checked="' + (k === wiz.pay) + '" data-pm="' + k + '"><span class="pm-ico pm-' + k + '" aria-hidden="true">' + ico + '</span><span>' + label + '</span></button>').join('') + '</div></div>' +
      '<div class="card pm-panel" data-panel="gpay"' + (wiz.pay === 'gpay' ? '' : ' hidden') + '><h2>Google Pay</h2><p class="muted">Pay with a card saved in your Google account.</p>' + sum + '<button type="button" class="btn wide big pill wallet-btn" data-wallet="gpay">Pay with Google Pay</button>' + walletDemo + '</div>' +
      '<div class="card pm-panel" data-panel="applepay"' + (wiz.pay === 'applepay' ? '' : ' hidden') + '><h2>Apple Pay</h2><p class="muted">Pay with a card in your Apple Wallet.</p>' + sum + '<button type="button" class="btn wide big pill wallet-btn" data-wallet="applepay">Pay with Apple Pay</button>' + walletDemo + '</div>' +
      '<div class="card pm-panel" data-panel="zelle"' + (wiz.pay === 'zelle' ? '' : ' hidden') + '><h2>Zelle</h2>' +
      '<ol class="zelle-steps"><li>Open Zelle in your bank app.</li><li>Send the deposit, <b>' + money(q.deposit) + '</b>, to <b>' + esc(s.zelleName || s.businessName || 'Media on Wheels') + '</b>' + (s.zelleContact ? ' · <b>' + esc(s.zelleContact) + '</b>' : ' <span class="muted">(Zelle email or phone is added in Settings)</span>') + '.</li><li>In the Zelle note, write <b class="zref">' + esc(wiz.zelleRef) + '</b>.</li></ol>' + sum +
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
      sum +
      '<button class="btn primary wide big" type="submit" id="pay">Pay deposit ' + money(q.deposit) + '</button>' +
      '<p class="demo-note">Demo — real card processing connects once the payment account is set up. Nothing is charged, and the card number is not saved.</p></form></div></section>';
    $('#back', root).addEventListener('click', () => { if (wiz.payFor) { resetWiz(); location.hash = '#/client/bookings'; } else go('price'); });
    $$('[data-pm]', root).forEach((t) => t.addEventListener('click', () => {
      wiz.pay = t.getAttribute('data-pm');
      $$('[data-pm]', root).forEach((x) => { const on = x === t; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
      $$('[data-panel]', root).forEach((p) => { p.hidden = p.getAttribute('data-panel') !== wiz.pay; });
    }));
    $$('[data-wallet]', root).forEach((btn) => btn.addEventListener('click', () => {
      const k = btn.getAttribute('data-wallet'), name = k === 'gpay' ? 'Google Pay' : 'Apple Pay';
      const m = UI.modal(name + ' (demo)', '<div class="wallet-sheet"><p class="muted">Pay ' + esc(s.businessName || 'Media on Wheels') + '</p><p class="ws-amt">' + money(q.deposit) + '</p>' +
        '<p class="small muted">Deposit (' + q.depositPct + '%) · ' + q.bikes + ' bike' + (q.bikes === 1 ? '' : 's') + ' · ' + esc(fmtRange(wiz.start, wiz.end)) + '</p>' +
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
    const isReq = !!(b && b.requestOnly && !b.depositPaid && !(b.payment && b.payment.method));
    const J = window.JCal && JCal.ready ? JCal : null;
    root.innerHTML = '<section class="page narrow center"><div class="done-mark" aria-hidden="true">✓</div><h1>' + esc(isReq ? SSET('msgRequestTitle', 'Request sent') : SSET('msgDoneTitle', 'Booking confirmed')) + '</h1>' +
      '<p class="lead">' + esc(window.SiteSettings ? SiteSettings.text(isReq ? 'msgRequest' : b && b.payment && b.payment.method === 'zelle' ? 'msgDoneZelle' : 'msgDone') : 'Thank you! Your booking is sent.') + '</p>' +      (b ? '<div class="card confirm-card"><dl class="kv wide"><dt>Booking #</dt><dd>' + 'BK-' + esc(String(b.id).slice(-6).toUpperCase()) + '</dd>' +
        '<dt>Business</dt><dd>' + esc(b.company) + '</dd>' + (b.areaName || b.areaNote ? '<dt>Area</dt><dd>' + esc(b.areaName || '') + (b.areaNote ? ' · ' + esc(b.areaNote) : '') + '</dd>' : '') +
        (b.adText ? '<dt>Campaign</dt><dd class="campaign-text">' + esc(b.adText) + '</dd>' : '') +
        '<dt>Dates</dt><dd>' + esc(fmtRange(b.start, b.end)) + (J ? '<br><span class="he" lang="he">' + esc(J.day(b.start).heFull) + ' – ' + esc(J.day(b.end).heFull) + '</span>' : '') + '</dd>' +
        '<dt>Bikes</dt><dd>' + b.bikeIds.length + '</dd>' + /* Nov 8 2026 (client): count only, no bike numbers (admin still sees them) */
        '<dt>Printing & setup</dt><dd>' + money(b.setupTotal) + '</dd><dt>Weekly (' + b.weeks + ' wk)</dt><dd>' + money(b.weeklyTotal) + '</dd>' +
        (b.discount ? '<dt>Discount</dt><dd>−' + money(b.discount) + '</dd>' : '') + '<dt>Total</dt><dd>' + money(b.total) + '</dd>' +
        '<dt class="hl">' + (b.depositPaid ? 'Deposit paid' : isReq ? 'Deposit after approval' : 'Deposit to pay') + (b.depositPct != null ? ' (' + b.depositPct + '%)' : '') + '</dt><dd class="hl">' + money(b.deposit != null ? b.deposit : b.total) + '</dd>' +
        (b.balance != null ? '<dt>Balance later</dt><dd>' + money(b.balance) + (b.balancePaid ? ' · paid' : '') + '</dd>' : '') + (isReq ? '' : '<dt>Payment</dt><dd>' + payDesc(b) + '</dd>') +
        '<dt>Status</dt><dd>' + (b.status === 'approved' ? '<span class="badge st-approved">Approved</span>' : '<span class="badge st-pending">' + (isReq ? 'Requested' : 'Pending') + '</span> ' + esc(window.SiteSettings ? SiteSettings.text('msgPending') : 'until ' + (Data.settings().businessName || 'Media on Wheels') + ' approves it')) + '</dd></dl></div>' : '') +
      '<div class="row-center"><a class="btn primary" href="#/client/bookings" id="tomy">My bookings</a><button class="btn ghost" id="again">' + (isReq ? 'Request more' : 'Book more') + '</button></div>' +
      /* Nov 8 2026 (David): ask for feedback on the site and on our service after a booking */
      '<div class="card fb-ask"><h2>How did we do?</h2><p class="muted small">Tell us about the website and our service. It takes a few seconds.</p><button type="button" class="btn ghost pill" id="fbafter" data-feedback="booking" data-booking="' + esc(b ? b.id : '') + '">Leave feedback</button></div></section>';
    $('#again', root).addEventListener('click', () => { resetWiz(); App.render(); });
    $('#tomy', root).addEventListener('click', () => resetWiz());
  }

  /* ================= MY BOOKINGS ================= */
  function payLine(b) {
    if (b.balance != null) return 'Total ' + money(b.total) + ' · deposit ' + money(b.deposit) + (b.depositPaid ? ' paid' : b.payment && b.payment.method === 'zelle' ? ' (awaiting Zelle)' : ' due') + ' · balance ' + money(b.balance) + (b.balancePaid ? ' paid' : ' due');
    if (b.payment && b.payment.method === 'zelle') return 'Total ' + money(b.total) + ' · ' + payDesc(b);
    if (b.payment && (b.payment.last4 || b.payment.brand)) return 'Total ' + money(b.total) + ' · paid by ' + payDesc(b);
    return 'Total ' + money(b.total) + ' · deposit ' + money(b.deposit) + (b.depositPaid ? ' paid (demo)' : '');
  }
  function renderMine(root, user) {
    teardown();
    const mine = Data.list('bookings').filter((b) => b.clientId === user.id).sort((a, b) => b.start.localeCompare(a.start));
    root.innerHTML = '<section class="page narrow"><div class="page-head"><h1>My bookings</h1><a class="btn primary" href="#/client/book" id="newbk">+ New</a></div>' +
      (mine.length ? mine.map((b) => '<article class="card my-bk"><div class="bk-title"><strong>' + fmtRange(b.start, b.end) + '</strong> ' + (b.requestOnly && statusOf(b) === 'pending' ? '<span class="badge st-pending">Requested</span>' : badge(b)) + '</div>' +
        '<div class="small">' + b.bikeIds.length + ' bike' + (b.bikeIds.length === 1 ? '' : 's') + (b.areaName ? ' · ' + esc(b.areaName) : '') + '</div>' +
        (b.adText ? '<div class="small campaign-text">Campaign: ' + esc(b.adText) + '</div>' : '') +
        (b.setupTotal != null ? '<div class="small muted">Printing & setup ' + money(b.setupTotal) + ' · weekly ' + money(b.weeklyTotal) + '</div>' : '') +
        '<div class="small muted">' + payLine(b) + '</div>' +
        (b.adminNote && (b.status === 'approved' || b.status === 'declined') ? '<div class="small">Note from us: ' + esc(b.adminNote) + '</div>' : '') +
        (b.requestOnly && b.status === 'approved' && !b.depositPaid && !(b.payment && b.payment.method === 'zelle') ? '<div class="row-end"><button class="btn primary" data-paydep="' + b.id + '">Pay deposit ' + money(b.deposit) + ' ›</button></div>' : '') +
        (statusOf(b) === 'pending' ? '<div class="row-end"><button class="btn danger-ghost" data-cancel="' + b.id + '">Cancel request</button></div>' : '') + '</article>').join('')
        : '<div class="card center"><p>No bookings yet.</p><a class="btn primary" href="#/client/book">' + (REQ() ? 'Request bikes' : 'Book bikes') + '</a></div>') + '</section>';
    const nb = $('#newbk', root); if (nb) nb.addEventListener('click', () => resetWiz());
    root.addEventListener('click', (e) => {
      const pd = e.target.closest('[data-paydep]'); if (pd) { payFor(pd.getAttribute('data-paydep')); return; }
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
    PAY_METHODS, payFor, sendRequest,
    tabs: [
      { key: 'book', get label() { return REQ() ? 'Request bikes' : 'Book'; }, icon: 'cal', render: renderBook },
      { key: 'bookings', label: 'My bookings', icon: 'list', render: renderMine }
    ],
    teardown, resetWiz
  };
})();
