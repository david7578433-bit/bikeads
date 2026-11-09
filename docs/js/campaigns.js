/* Media on Wheels — several campaigns in ONE request (David, Nov 8 2026 7:00 PM, voice note):
 * "a marketing company has five campaigns … let's name his name is Pivot … he makes five bikes for GB, five bikes for GG,
 *  five for Lakefront … you don't need to have only any 10 bikes. You can make a few campaigns in the main campaign".
 * A booking (order) may carry b.campaigns = [{ id, name, bikes, start, end, own, adText, bikeIds, setup, weekly, weeks,
 * days, subtotal, status }]. Each campaign can be small (1 bike or more); the minimum bikes (Admin → Pricing) counts the
 * whole order unless Admin → Booking form says "each campaign". Bikes are held per campaign, only on its own days.
 * A booking without campaigns works exactly as before. */
(function () {
  'use strict';
  const SS = (k, d) => { const v = window.SiteSettings ? SiteSettings.get(k) : undefined; return v === undefined || v === null ? d : v; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const range = (a, b) => (window.UI && UI.fmtRange ? UI.fmtRange(a, b) : a + ' – ' + b);
  const addDays = (ds, n) => { const d = new Date(ds + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

  const Campaigns = {
    /* Admin → Booking form switches */
    enabled() { return SS('multiCampaign', true) !== false; },
    minEach() { return SS('minBikesApplies', 'order') === 'campaign'; },
    minBikes() { return Math.max(1, Math.round(+((window.Data && Data.settings && Data.settings().minBikes) || 5))); },
    maxBikes() { return Math.max(Campaigns.minBikes(), Math.round(+SS('maxBikes', 500) || 500)); },
    /* the smallest number one campaign may have */
    rowMin() { return Campaigns.minEach() ? Campaigns.minBikes() : 1; },
    newId() { return 'c' + Math.random().toString(36).slice(2, 8); },
    row(o) { return Object.assign({ id: Campaigns.newId(), name: '', bikes: Campaigns.rowMin(), own: false, start: null, end: null, adText: '' }, o || {}); },

    isMulti(b) { return !!(b && Array.isArray(b.campaigns) && b.campaigns.length); },
    active(b) { return Campaigns.isMulti(b) ? b.campaigns.filter((c) => c && c.status !== 'declined') : []; },
    /* rows with their real dates: "own" dates, else the order's dates */
    resolve(rows, start, end) {
      return (rows || []).map((c, i) => Object.assign({}, c, { name: String(c.name || '').trim() || 'Campaign ' + (i + 1), bikes: Math.max(0, Math.round(+c.bikes) || 0),
        start: c.own && c.start ? c.start : start, end: c.own && c.end ? c.end : end }));
    },
    word(n) { return n + ' campaign' + (n === 1 ? '' : 's'); },
    total(list) { return (list || []).reduce((a, c) => a + (Math.round(+c.bikes) || 0), 0); },
    span(list) {
      const s = (list || []).map((c) => c.start).filter(Boolean).sort(), e = (list || []).map((c) => c.end).filter(Boolean).sort();
      return { start: s[0] || null, end: e[e.length - 1] || null };
    },
    sameDates(list) { return (list || []).every((c) => c.start === list[0].start && c.end === list[0].end); },
    /* "GB 5, GG 5, Lakefront 5" */
    summary(list) { return (list || []).map((c) => (c.name || 'Campaign') + ' ' + (Math.round(+c.bikes) || (c.bikeIds || []).length || 0)).join(', '); },
    datesText(list) { const sp = Campaigns.span(list); return sp.start ? range(sp.start, sp.end) : ''; },

    /* Is the order OK? Checks names, counts, the minimum, own dates, and that enough bikes are free on EVERY day
     * (all campaigns riding that day added together). opts: { earliest, weeksMin, weeksMax, exceptBookingId } */
    check(list, opts) {
      opts = opts || {};
      const errs = [], min = Campaigns.minBikes(), total = Campaigns.total(list);
      if (!list || !list.length) return { ok: false, errors: ['Add a campaign.'], total: 0 };
      list.forEach((c, i) => {
        const nm = c.name || 'Campaign ' + (i + 1);
        if (!(c.bikes >= Campaigns.rowMin())) errs.push(Campaigns.minEach() ? nm + ': at least ' + min + ' bikes per campaign.' : nm + ': at least 1 bike.');
        if (!c.start || !c.end) errs.push(nm + ': pick the dates.');
        else {
          if (c.end < c.start) errs.push(nm + ': the last day is before the first day.');
          if (opts.earliest && c.start < opts.earliest) errs.push(nm + ': starts too soon (first day you can pick is ' + (window.UI ? UI.fmtDate(opts.earliest) : opts.earliest) + ').');
          if (window.Data && c.end >= c.start) { const w = Data.weeks(c.start, c.end); if ((opts.weeksMin && w < opts.weeksMin) || (opts.weeksMax && w > opts.weeksMax)) errs.push(nm + ': a campaign is ' + (opts.weeksMin === opts.weeksMax ? opts.weeksMin : opts.weeksMin + ' to ' + opts.weeksMax) + ' weeks long.'); }
        }
      });
      if (!Campaigns.minEach() && total < min) errs.push('An order is at least ' + min + ' bikes in total (you have ' + total + ').');
      if (total > Campaigns.maxBikes()) errs.push('At most ' + Campaigns.maxBikes() + ' bikes in one order.');
      let short = null;
      if (!errs.length && window.Data) {
        const sp = Campaigns.span(list);
        for (let d = sp.start, k = 0; d <= sp.end && k < 400; d = addDays(d, 1), k++) {
          const need = list.reduce((a, c) => a + (c.start <= d && d <= c.end ? c.bikes : 0), 0);
          if (!need) continue;
          const free = Data.freeBikes(d, d, opts.exceptBookingId).length;
          if (need > free) { short = { day: d, need, free }; break; }
        }
        if (short) errs.push('On ' + (window.UI ? UI.fmtDate(short.day) : short.day) + ' only ' + short.free + ' bikes are free, and your campaigns need ' + short.need + ' that day. Please lower a number or change dates.');
        else if (!Campaigns.assign(list, opts).ok) errs.push('Not enough of the same bikes are free for all the days. Please lower a number or change dates.');
      }
      return { ok: !errs.length, errors: errs, total, short };
    },

    /* Give each campaign its bikes: free on ALL of that campaign's days and not used by an earlier campaign of the same
     * order on an overlapping day. Bikes in the chosen area come first. Returns { ok, ids: [[…], …], failed } */
    assign(list, opts) {
      opts = opts || {};
      const out = [], num = (a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true });
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const taken = new Set();
        for (let j = 0; j < i; j++) if (Data.overlaps(c.start, c.end, list[j].start, list[j].end)) (out[j] || []).forEach((x) => taken.add(x));
        const free = Data.freeBikes(c.start, c.end, opts.exceptBookingId).filter((x) => !taken.has(x.id));
        const keep = (c.bikeIds || []).filter((id) => free.some((x) => x.id === id)); /* bikes it already has stay */
        const rest = free.filter((x) => !keep.includes(x.id));
        const pick = keep.concat(rest.filter((x) => x.locationId === opts.area).sort(num).concat(rest.filter((x) => x.locationId !== opts.area).sort(num)).map((x) => x.id)).slice(0, c.bikes);
        if (pick.length < c.bikes) return { ok: false, failed: i, ids: out };
        out.push(pick);
      }
      return { ok: true, ids: out };
    },

    /* The money + bikes fields of an order, from its campaigns (used when it is made and when the admin changes a
     * campaign). rows = campaigns with bikeIds; declined ones are kept on the record but not charged. */
    totals(rows, opts) {
      const act = rows.filter((c) => c.status !== 'declined');
      const q = Data.priceQuoteMulti(act.map((c) => ({ id: c.id, name: c.name, bikes: (c.bikeIds || []).length || c.bikes, start: c.start, end: c.end })), opts);
      const byId = {}; q.campaigns.forEach((l) => { byId[l.id] = l; });
      const campaigns = rows.map((c) => { const l = byId[c.id]; return l ? Object.assign({}, c, { bikes: l.bikes, days: l.days, weeks: l.weeks, setup: l.setup, weekly: l.weekly, subtotal: l.subtotal }) : c; });
      const ids = []; act.forEach((c) => (c.bikeIds || []).forEach((x) => { if (!ids.includes(x)) ids.push(x); }));
      return { q, patch: { campaigns, bikeIds: ids, start: q.start, end: q.end, weeks: q.weeks, setupFeePerBike: q.setupEach, weeklyPerBike: q.weeklyEach,
        pricePerDay: Math.round(q.weeklyEach / 7 * 100) / 100, setupTotal: q.setup, weeklyTotal: q.weekly, subtotal: q.subtotal, discounts: q.discounts,
        discount: q.discount, total: q.total, depositPct: q.depositPct, deposit: q.deposit, balance: q.balance } };
    },
    /* re-price a saved order with its own promo code / client discount (after a campaign is declined or its bikes change) */
    reprice(b, rows) {
      const promo = (b.discounts || []).find((d) => d.kind === 'promo');
      return Campaigns.totals(rows, { promo: promo ? { kind: 'promo', pct: promo.pct, label: promo.label, code: b.promoCode || '', active: true } : null,
        client: { id: b.clientId, email: b.contactEmail } });
    },

    /* Pop-up text after a request */
    popupText(b) {
      const list = Campaigns.active(b);
      const tpl = SS('msgRequestPopupMulti', 'You requested {bikes} bikes in {count} campaigns ({campaigns}) for {dates}. We will review it and confirm soon.');
      const biz = (window.Data && Data.settings().businessName) || 'Media on Wheels';
      return String(tpl).replace(/\{bikes\}/g, (b.bikeIds || []).length).replace(/\{count\}/g, list.length).replace(/\{campaigns\}/g, Campaigns.summary(list))
        .replace(/\{dates\}/g, range(b.start, b.end)).replace(/\{business\}/g, biz);
    },
    /* plain lines (emails, invoice email): "GB: 5 bikes, Nov 10 – Nov 16, 975 dollars" */
    lines(b, money) {
      return Campaigns.active(b).map((c) => (c.name || 'Campaign') + ': ' + ((c.bikeIds || []).length || c.bikes) + ' bikes, ' + range(c.start, c.end) + (money && c.subtotal != null ? ', ' + money(c.subtotal) : '') + (c.adText ? ' (' + c.adText + ')' : ''));
    },
    /* HTML list for My bookings / confirmation / admin. opts: { bikes: show bike numbers, money } */
    listHtml(b, opts) {
      opts = opts || {};
      const same = Campaigns.sameDates(Campaigns.active(b));
      return '<ul class="camp-list">' + b.campaigns.map((c) => {
        const n = (c.bikeIds || []).length || c.bikes, off = c.status === 'declined';
        return '<li class="camp-item' + (off ? ' off' : '') + '"><div class="camp-top"><b>' + esc(c.name || 'Campaign') + '</b><span>' + n + ' bike' + (n === 1 ? '' : 's') + (opts.money && c.subtotal != null && !off ? ' · ' + esc(opts.money(c.subtotal)) : '') + '</span></div>' +
          ((!same || off || opts.dates) ? '<div class="small muted">' + esc(range(c.start, c.end)) + '</div>' : '') +
          (opts.bikes && (c.bikeIds || []).length && !off ? '<div class="small">Bikes ' + esc(c.bikeIds.map(Data.bikeLabel).join(', ')) + '</div>' : '') +
          (c.adText ? '<div class="small campaign-text">' + esc(c.adText) + '</div>' : '') +
          (off ? '<div class="small"><span class="badge st-declined">Declined</span>' + (c.note ? ' ' + esc(c.note) : '') + '</div>' : '') + '</li>';
      }).join('') + '</ul>';
    }
  };
  window.Campaigns = Campaigns;
})();
