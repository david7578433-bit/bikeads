/* BikeAds Deliver — the delivery business logic shared by the Driver, Store, Boss
 * and Admin plugins. Everything is read and written through Data (js/data.js),
 * so the same "connect a shared database later" swap covers deliveries too. */
(function () {
  'use strict';
  const C = window.DeliverCore;

  const STATUS = {
    new: 'New', routed: 'Planned', loaded: 'Loaded', out: 'On the way', arrived: 'At the door', delivered: 'Delivered', failed: 'Failed'
  };
  const OPEN = ['new', 'routed', 'loaded', 'out', 'arrived'];
  const DONE = ['delivered', 'failed'];
  const listeners = new Set();
  const fmtTime = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const at = (date, hhmm) => (hhmm ? new Date(date + 'T' + hhmm + ':00').getTime() : null);
  const nowIso = () => new Date().toISOString();
  const r2 = (n) => Math.round(n * 100) / 100;

  const D = {
    STATUS, OPEN, DONE, fmtTime, at,
    settings() { return Data.settings().deliver || {}; },
    save(patch) { const s = Object.assign({}, D.settings(), patch); return Data.saveSettings({ deliver: s }); },
    pluginOn(role) { const p = D.settings().plugins || {}; return role === 'admin' || role === 'client' || p[role] !== false; },
    store(id) { return Data.get('stores', id); },
    driver(id) { return Data.get('drivers', id); },
    stores(all) { return Data.list('stores').filter((s) => all || s.active !== false); },
    drivers(all) { return Data.list('drivers').filter((d) => all || d.active !== false); },
    driverOf(user) { return user && user.driverId ? D.driver(user.driverId) : null; },
    storeOf(user) { return user && user.storeId ? D.store(user.storeId) : null; },
    orders() { return Data.list('orders'); },
    day(date, storeId) { return D.orders().filter((o) => o.date === date && (!storeId || o.storeId === storeId)); },
    between(from, to, storeId) { return D.orders().filter((o) => o.date >= from && o.date <= to && (!storeId || o.storeId === storeId)); },
    isOpen(o) { return OPEN.includes(o.status); },
    bags(o) { return Array.from({ length: o.bags || 1 }, (_, i) => o.code + '-' + (i + 1)); },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit() { listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); },

    log(o, by, text, patch) {
      const cur = Data.get('orders', o.id) || o;
      const events = (cur.events || []).concat([{ at: nowIso(), by: by || 'system', text }]);
      return Data.put('orders', Object.assign({ id: o.id, events }, patch || {}));
    },

    nextCode() {
      const n = D.orders().reduce((m, o) => Math.max(m, parseInt(String(o.code).replace(/\D/g, ''), 10) || 0), 1000);
      return 'BD-' + (n + 1);
    },
    addOrder(storeId, f, by) {
      const code = D.nextCode();
      const o = {
        id: 'ord_' + code.replace(/\D/g, '') + '_' + Math.random().toString(36).slice(2, 5), code, storeId, date: f.date || Data.today(), ref: f.ref || '',
        customer: f.customer || '', address: f.address || '', phone: f.phone || '', bags: Math.max(1, +f.bags || 1),
        amount: r2(Math.max(0, +f.amount || 0)), payType: +f.amount > 0 ? (f.payType || 'cash') : 'prepaid', notes: f.notes || '',
        windowStart: f.windowStart || '', windowEnd: f.windowEnd || '',
        lat: f.lat, lng: f.lng, approx: !!f.approx, status: 'new', driverId: '', seq: 0, eta: null, scanned: [],
        events: [{ at: nowIso(), by: by || 'store', text: f.source ? 'Order added by the store (' + f.source + ')' : 'Order added by the store' }],
        createdAt: nowIso()
      };
      return Data.put('orders', o);
    },

    /* ---- where is an address? Free OpenStreetMap search (Nominatim), one request per second;
     * if it can't be found, the pin goes next to the store and is marked "approximate". ---- */
    _geoQ: Promise.resolve(),
    geocode(address, storeId) {
      const store = D.store(storeId) || D.stores()[0];
      const near = () => ({ lat: store.lat + (Math.random() - 0.5) * 0.006, lng: store.lng + (Math.random() - 0.5) * 0.008, approx: true });
      const job = D._geoQ.then(async () => {
        if (typeof fetch !== 'function' || (typeof navigator !== 'undefined' && navigator.onLine === false)) return near();
        const tries = [address];
        const noNum = address.replace(/^\s*\d+[a-z]?\s+/i, '');
        if (noNum !== address) tries.push(noNum);
        if (/\bmonroe\b/i.test(address)) tries.push(noNum.replace(/\bmonroe\b/i, 'Kiryas Joel'));
        try {
          for (const q0 of tries) {
            const q = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' + encodeURIComponent(q0);
            const ctl = typeof AbortController === 'function' ? new AbortController() : null;
            const tm = setTimeout(() => ctl && ctl.abort(), 6000);
            const res = await fetch(q, { headers: { Accept: 'application/json' }, signal: ctl ? ctl.signal : undefined });
            clearTimeout(tm);
            const j = await res.json();
            await new Promise((r) => setTimeout(r, 1100));
            if (j && j[0]) {
              const p = { lat: +j[0].lat, lng: +j[0].lon, approx: q0 !== address };
              if (C.dist(p, store) < 40000) return p;      // more than 40 km from the store: probably the wrong town
            }
          }
        } catch (e) { /* offline or blocked: fall through */ }
        return near();
      });
      D._geoQ = job.catch(() => null);
      return job;
    },

    /* ---- routes ---- */
    depot(area) {
      const s = D.stores().filter((x) => x.locationId === area);
      if (s.length) return C.centroid(s);
      const loc = Data.get('locations', area);
      return loc ? { lat: loc.lat, lng: loc.lng } : null;
    },
    etaOpts(date) {
      const s = D.settings(), st = at(date, s.routeStart || '12:30');
      return { start: date === Data.today() ? Math.max(Date.now(), st) : st, speedKmh: s.speedKmh, minutesPerStop: s.minutesPerStop, detour: s.detour };
    },
    available(date) { return D.drivers().filter((d) => d.offDate !== date); },
    route(driverId, date) {
      return D.orders().filter((o) => o.driverId === driverId && o.date === (date || Data.today()) && o.status !== 'new').sort((a, b) => a.seq - b.seq);
    },
    buildRoutes(date, by) {
      date = date || Data.today();
      const team = D.available(date);
      const pending = D.day(date).filter((o) => o.status === 'new' || o.status === 'routed');
      if (!team.length) return { ok: false, msg: 'No drivers are working today.' };
      if (!pending.length) return { ok: false, msg: 'No orders waiting for a route.' };
      const areaOf = (o) => { const s = D.store(o.storeId); return s ? s.locationId : 'x'; };
      const depots = {};
      pending.forEach((o) => { depots[areaOf(o)] = D.depot(areaOf(o)); });
      const res = C.buildRoutes(
        pending.map((o) => ({ id: o.id, lat: o.lat, lng: o.lng, area: areaOf(o), pinnedDriverId: o.pinnedDriverId, earliest: at(o.date, o.windowStart) || 0, latest: at(o.date, o.windowEnd) || 0 })),
        team.map((d) => ({ id: d.id, area: d.locationId })), depots, D.etaOpts(date));
      let meters = 0, used = 0;
      Object.keys(res).forEach((driverId) => {
        const ids = res[driverId];
        if (!ids.length) return;
        used++;
        const kept = D.route(driverId, date).filter((o) => !['new', 'routed'].includes(o.status));
        ids.forEach((id, i) => {
          const o = Data.get('orders', id);
          const changed = o.driverId !== driverId || o.status !== 'routed';
          Data.put('orders', { id, driverId, seq: kept.length + i + 1, status: 'routed', events: changed ? (o.events || []).concat([{ at: nowIso(), by: by || 'dispatch', text: 'Planned for ' + D.driver(driverId).name }]) : o.events }, { silent: true });
        });
        meters += D.recompute(driverId, date, true);
      });
      Data.flush('orders'); D.emit();
      return { ok: true, stops: pending.length, drivers: used, km: Math.round(meters / 100) / 10 };
    },
    /* Re-time the stops of one route; returns its length in metres. */
    recompute(driverId, date, silent) {
      date = date || Data.today();
      const s = D.settings(), list = D.route(driverId, date);
      const open = list.filter((o) => D.isOpen(o));
      const drv = D.driver(driverId);
      const first = list[0] && D.store(list[0].storeId);
      const depot = first ? D.depot(first.locationId) : (drv && drv.position) || { lat: 0, lng: 0 };
      const started = list.some((o) => ['out', 'arrived'].includes(o.status) || DONE.includes(o.status));
      const from = started && drv && drv.position ? drv.position : depot;
      let start = Math.max(Date.now(), at(date, s.routeStart || '12:30'));
      if (date !== Data.today()) start = at(date, s.routeStart || '12:30');
      const times = C.etas(from, open.map((o) => ({ lat: o.lat, lng: o.lng, earliest: at(o.date, o.windowStart) })), { start, speedKmh: s.speedKmh, minutesPerStop: s.minutesPerStop, detour: s.detour });
      open.forEach((o, i) => Data.put('orders', { id: o.id, eta: Math.round(times[i]) }, { silent: true }));
      if (!silent) { Data.flush('orders'); D.emit(); }
      return C.pathLength(depot, list, list.map((_, i) => i)) * (s.detour || 1.35);
    },
    renumber(driverId, date, ids) {
      ids.forEach((id, i) => Data.put('orders', { id, seq: i + 1 }, { silent: true }));
      D.recompute(driverId, date, true);
    },
    /* Move a stop to another driver (or another place in the same route). */
    moveStop(orderId, toDriverId, index, by) {
      const o = Data.get('orders', orderId); if (!o) return;
      const date = o.date, fromId = o.driverId;
      const target = D.route(toDriverId, date).filter((x) => x.id !== orderId);
      let pos = index;
      if (pos === undefined || pos === null || pos < 0) {        // cheapest place to insert it (never before a finished stop)
        const pts = target.map((x) => ({ lat: x.lat, lng: x.lng }));
        const st0 = D.store((target[0] || o).storeId);
        const depot = (st0 && D.depot(st0.locationId)) || o;
        let minI = target.findIndex((x) => D.isOpen(x)); if (minI < 0) minI = target.length;
        let best = target.length, bestCost = Infinity;
        for (let i = minI; i <= target.length; i++) {
          const a = i === 0 ? depot : pts[i - 1], b = pts[i];
          const cost = C.dist(a, o) + (b ? C.dist(o, b) - C.dist(a, b) : 0);
          if (cost < bestCost) { bestCost = cost; best = i; }
        }
        pos = best;
      }
      target.splice(Math.min(pos, target.length), 0, o);
      const keepStatus = ['loaded', 'out', 'arrived'].includes(o.status) && fromId === toDriverId ? o.status : 'routed';
      Data.put('orders', { id: orderId, driverId: toDriverId, pinnedDriverId: toDriverId, status: keepStatus, scanned: fromId === toDriverId ? o.scanned : [] }, { silent: true });
      if (fromId !== toDriverId) D.log(o, by || 'dispatch', 'Moved to ' + D.driver(toDriverId).name + "'s route");
      D.renumber(toDriverId, date, target.map((x) => x.id));
      if (fromId && fromId !== toDriverId) D.renumber(fromId, date, D.route(fromId, date).filter((x) => x.id !== orderId).map((x) => x.id));
      Data.flush('orders'); D.emit();
    },
    unassign(orderId, by) {
      const o = Data.get('orders', orderId); if (!o) return;
      const fromId = o.driverId;
      Data.put('orders', { id: orderId, driverId: '', pinnedDriverId: '', status: 'new', seq: 0, eta: null, scanned: [] }, { silent: true });
      D.log(o, by || 'dispatch', 'Taken off the route');
      if (fromId) D.renumber(fromId, o.date, D.route(fromId, o.date).map((x) => x.id));
      Data.flush('orders'); D.emit();
    },
    /* Re-plan the stops a driver has not done yet, from where the driver is now. */
    reroute(driverId, date) {
      date = date || Data.today();
      const list = D.route(driverId, date);
      const done = list.filter((o) => !D.isOpen(o)), open = list.filter((o) => D.isOpen(o));
      const drv = D.driver(driverId);
      const from = (drv && drv.position) || (open[0] && D.depot(D.store(open[0].storeId).locationId));
      if (!open.length || !from) return false;
      const ord = C.bestOrder(from, open.map((o) => ({ lat: o.lat, lng: o.lng, earliest: at(o.date, o.windowStart) || 0, latest: at(o.date, o.windowEnd) || 0 })), D.etaOpts(date));
      D.renumber(driverId, date, done.map((o) => o.id).concat(ord.map((i) => open[i].id)));
      Data.flush('orders'); D.emit();
      return true;
    },
    late(o) {
      if (!o.windowEnd) return false;
      const end = at(o.date, o.windowEnd);
      if (o.status === 'delivered') return o.proof && new Date(o.proof.at).getTime() > end + 5 * 60000;
      if (o.status === 'failed') return false;
      return (o.eta && o.eta > end) || (Date.now() > end && o.date <= Data.today());
    },

    /* ---- customer texts: written and logged; nothing is sent until a texting number is connected ---- */
    text(o, kind, extra) {
      const s = D.settings(), store = D.store(o.storeId) || {}, drv = D.driver(o.driverId) || {};
      const tpl = (s.templates || {})[kind];
      if (!tpl || !o.phone) return null;
      const vars = Object.assign({
        customer: o.customer || 'there', store: store.name || 'the store', code: o.code,
        driver: String(drv.name || 'our driver').split(' ')[0], eta: o.eta ? fmtTime(o.eta) : 'soon',
        minutes: o.eta ? Math.max(1, Math.round((o.eta - Date.now()) / 60000)) : 10, time: fmtTime(Date.now()), reason: (o.failReason || '').toLowerCase()
      }, extra || {});
      const entry = { id: Data.uid('sms'), at: nowIso(), orderId: o.id, to: o.phone, kind, text: C.fill(tpl, vars), status: s.textingNumber ? 'queued' : 'would send' };
      Data.put('smslog', entry);
      return entry;
    },

    /* ---- driver actions ---- */
    parseBag(raw) {
      const s = String(raw || '').trim().toUpperCase().replace(/^BKD:/, '').replace(/\s+/g, '');
      const m = s.match(/^(BD-?\d+)(?:-(\d+))?$/);
      if (!m) return null;
      const code = m[1].replace(/^BD-?/, 'BD-');
      const o = D.orders().find((x) => x.code === code);
      return o ? { order: o, bag: m[2] ? +m[2] : 1, label: code + '-' + (m[2] || 1) } : null;
    },
    scan(driverId, raw, by) {
      const hit = D.parseBag(raw);
      if (!hit) return { kind: 'unknown', msg: 'Not a BikeAds Deliver label: ' + raw };
      const o = hit.order;
      if (hit.bag > (o.bags || 1)) return { kind: 'unknown', order: o, msg: 'Order ' + o.code + ' has only ' + o.bags + ' bag(s).' };
      if (DONE.includes(o.status)) return { kind: 'done', order: o, msg: o.code + ' is already ' + STATUS[o.status].toLowerCase() + '.' };
      if (!o.driverId || o.status === 'new') return { kind: 'unrouted', order: o, msg: o.code + ' is not on any route yet. Leave it at the store and tell dispatch.' };
      if (o.driverId !== driverId) {
        const other = D.driver(o.driverId);
        return { kind: 'other', order: o, msg: 'STOP — bag ' + hit.label + ' belongs to ' + (other ? other.name : 'another driver') + "'s route. Put it back." };
      }
      const scanned = Array.from(new Set((o.scanned || []).concat([hit.label])));
      const all = D.bags(o).every((b) => scanned.includes(b));
      const patch = { scanned };
      if (all && o.status === 'routed') patch.status = 'loaded';
      const n = D.log(o, by, 'Bag ' + hit.label + ' scanned onto the bike', patch);
      D.emit();
      return { kind: 'mine', order: n, label: hit.label, complete: all, msg: 'Bag ' + hit.label + ' ✓ ' + scanned.length + ' of ' + o.bags + ' for stop ' + o.seq };
    },
    startRoute(driverId, by) {
      const date = Data.today();
      const list = D.route(driverId, date).filter((o) => ['routed', 'loaded'].includes(o.status));
      list.forEach((o) => Data.put('orders', { id: o.id, status: 'out', events: (o.events || []).concat([{ at: nowIso(), by, text: 'Out for delivery' }]) }, { silent: true }));
      D.recompute(driverId, date, true);
      Data.flush('orders');
      D.route(driverId, date).filter((o) => o.status === 'out').forEach((o) => D.text(o, 'onTheWay'));
      D.emit();
      return list.length;
    },
    nextStop(driverId, date) { return D.route(driverId, date || Data.today()).find((o) => D.isOpen(o) && o.status !== 'new'); },
    afterStop(o) {
      D.recompute(o.driverId, o.date);
      const nx = D.nextStop(o.driverId, o.date);
      if (nx && nx.status === 'out') D.text(nx, 'nextStop');
      D.emit();
    },
    arrive(o, by) { D.log(o, by, 'Arrived at the door', { status: 'arrived', arrivedAt: nowIso() }); D.emit(); },
    /* Photos are the heaviest thing kept on the phone: past 3.5 MB, drop door photos older than a week (signatures stay). */
    trimPhotos() {
      try {
        if (typeof localStorage === 'undefined' || (localStorage.getItem('bikeads.v1') || '').length < 3500000) return 0;
        const cut = Data.addDays(Data.today(), -7); let n = 0;
        D.orders().forEach((o) => { if (o.date < cut && o.proof && o.proof.photo && o.proof.photo.startsWith('data:image/jpeg')) { Data.put('orders', { id: o.id, proof: Object.assign({}, o.proof, { photo: '', photoTrimmed: true }) }, { silent: true }); n++; } });
        return n;
      } catch (e) { return 0; }
    },
    deliver(o, proof, by) {
      D.trimPhotos();
      const n = D.log(o, by, 'Delivered' + (proof.collected ? ' — collected ' + proof.method + ' ' + proof.collected.toFixed(2) : ''), { status: 'delivered', proof: Object.assign({ at: nowIso(), by }, proof) });
      D.text(n, 'delivered');
      D.afterStop(n);
      return n;
    },
    fail(o, reason, note, by) {
      const n = D.log(o, by, 'Failed: ' + reason + (note ? ' — ' + note : ''), { status: 'failed', failReason: reason, failNote: note || '', failedAt: nowIso() });
      D.text(n, 'failed');
      D.afterStop(n);
      return n;
    },

    /* ---- shifts and the driver's phone as the GPS ---- */
    startShift(driverId) {
      const sh = Data.put('shifts', { driverId, start: nowIso(), end: '', date: Data.today() });
      Data.put('drivers', { id: driverId, onShift: true, shiftId: sh.id, shiftDate: Data.today() });
      D.emit(); return sh;
    },
    endShift(driverId) {
      const d = D.driver(driverId);
      if (d && d.shiftId) Data.put('shifts', { id: d.shiftId, end: nowIso() });
      Data.put('drivers', { id: driverId, onShift: false, shiftId: '' });
      if (d && d.bikeId) { const b = Data.bike(d.bikeId); if (b && b.position) Data.put('bikes', { id: b.id, position: Object.assign({}, b.position, { source: 'sim' }) }); }
      D.emit();
    },
    setPosition(driverId, lat, lng, source, acc) {
      const pos = { lat, lng, at: nowIso(), source: source || 'phone', acc: acc || null };
      Data.put('drivers', { id: driverId, position: pos }, { silent: true });
      const d = D.driver(driverId);
      if (d && d.bikeId && Data.bike(d.bikeId)) Data.put('bikes', { id: d.bikeId, position: pos }, { silent: true });
    },

    /* ---- money ---- */
    priceFor(store) { const s = D.settings(); return store && store.pricePerDelivery != null && store.pricePerDelivery !== '' ? +store.pricePerDelivery : +s.pricePerDelivery || 0; },
    charge(o) {
      const s = D.settings(), store = D.store(o.storeId);
      if (o.status === 'delivered') return r2(D.priceFor(store) + Math.max(0, (o.bags || 1) - (+s.bagsIncluded || 0)) * (+s.extraBagPrice || 0));
      if (o.status === 'failed') return r2(+s.failedCharge || 0);
      return 0;
    },
    pay(o) {
      const s = D.settings(), d = D.driver(o.driverId);
      if (o.status === 'delivered') return r2(d && d.payPerStop != null ? +d.payPerStop : +s.driverPayPerStop || 0);
      if (o.status === 'failed') return r2(+s.driverPayFailed || 0);
      return 0;
    },
    summary(from, to) {
      const list = D.between(from, to);
      const byDriver = {}, byStore = {};
      const t = { orders: list.length, delivered: 0, failed: 0, open: 0, late: 0, cash: 0, card: 0, charges: 0, pay: 0 };
      list.forEach((o) => {
        const dk = o.driverId || '_none', sk = o.storeId;
        const d = byDriver[dk] = byDriver[dk] || { delivered: 0, failed: 0, open: 0, late: 0, cash: 0, card: 0, pay: 0, stops: 0 };
        const s = byStore[sk] = byStore[sk] || { orders: 0, delivered: 0, failed: 0, open: 0, late: 0, cash: 0, card: 0, charges: 0 };
        s.orders++; if (o.driverId) d.stops++;
        const cash = o.proof && o.proof.method === 'cash' ? +o.proof.collected || 0 : 0;
        const card = o.proof && o.proof.method === 'card' ? +o.proof.collected || 0 : 0;
        if (o.status === 'delivered') { d.delivered++; s.delivered++; t.delivered++; }
        else if (o.status === 'failed') { d.failed++; s.failed++; t.failed++; }
        else { d.open++; s.open++; t.open++; }
        if (D.late(o)) { d.late++; s.late++; t.late++; }
        d.cash += cash; d.card += card; s.cash += cash; s.card += card; t.cash += cash; t.card += card;
        const ch = D.charge(o), p = D.pay(o);
        s.charges += ch; t.charges += ch; d.pay += p; t.pay += p;
      });
      return { from, to, byDriver, byStore, totals: t, list };
    },
    unbilled(storeId) { return D.orders().filter((o) => o.storeId === storeId && DONE.includes(o.status) && !o.invoiceId); },
    createInvoice(storeId, by) {
      const list = D.unbilled(storeId).sort((a, b) => (a.date < b.date ? -1 : 1));
      if (!list.length) return null;
      const n = Data.list('invoices').length + 1;
      const inv = Data.put('invoices', {
        no: 'INV-' + new Date().getFullYear() + '-' + String(n).padStart(3, '0'), storeId, from: list[0].date, to: list[list.length - 1].date,
        orderIds: list.map((o) => o.id), delivered: list.filter((o) => o.status === 'delivered').length, failed: list.filter((o) => o.status === 'failed').length,
        total: r2(list.reduce((a, o) => a + D.charge(o), 0)), status: 'open', createdAt: nowIso(), createdBy: by || ''
      });
      list.forEach((o) => Data.put('orders', { id: o.id, invoiceId: inv.id }, { silent: true }));
      Data.flush('orders');
      return inv;
    },
    markInvoicePaid(id, by) {
      const inv = Data.get('invoices', id); if (!inv || inv.status === 'paid') return;
      const store = D.store(inv.storeId);
      const tx = Data.put('transactions', { date: Data.today(), description: 'Deliveries ' + inv.no + ' - ' + (store ? store.name : ''), amount: inv.total, category: 'Delivery income', bookingId: '', reconciled: false, createdAt: nowIso() });
      Data.put('invoices', { id, status: 'paid', paidAt: nowIso(), txId: tx.id, paidBy: by || '' });
    },
    unpaid(driverId) { return D.orders().filter((o) => o.driverId === driverId && DONE.includes(o.status) && !o.payoutId); },
    payDriver(driverId, by) {
      const list = D.unpaid(driverId), d = D.driver(driverId);
      const amount = r2(list.reduce((a, o) => a + D.pay(o), 0));
      if (!list.length || !amount) return null;
      const tx = Data.put('transactions', { date: Data.today(), description: 'Driver pay - ' + d.name + ' (' + list.length + ' stops)', amount: -amount, category: 'Driver pay', bookingId: '', reconciled: false, createdAt: nowIso() });
      const p = Data.put('payouts', { driverId, amount, orderIds: list.map((o) => o.id), at: nowIso(), by: by || '', txId: tx.id });
      list.forEach((o) => Data.put('orders', { id: o.id, payoutId: p.id }, { silent: true }));
      Data.flush('orders');
      return p;
    }
  };

  /* ---- demo motion: a driver on shift with no fresh phone GPS rides toward the next stop ---- */
  const Live = {
    timer: null,
    start() {
      if (Live.timer) return;
      Live.timer = setInterval(Live.tick, 3000);
    },
    tick() {
      let moved = false;
      const today = Data.today();
      D.drivers().forEach((d) => {
        if (!d.onShift) return;
        const p = d.position;
        if (p && p.source === 'phone' && Date.now() - new Date(p.at) < 90000) return; // the real phone is reporting
        const nx = D.route(d.id, today).find((o) => ['out', 'arrived'].includes(o.status));
        const first = D.route(d.id, today)[0];
        const home = first ? D.depot(D.store(first.storeId).locationId) : D.depot(d.locationId);
        let cur = p || home;
        if (!cur) return;
        const goal = nx ? nx : null;
        if (!goal || nx.status === 'arrived') { if (!p) { D.setPosition(d.id, cur.lat, cur.lng, 'route'); moved = true; } return; }
        const dm = C.dist(cur, goal);
        const step = 22;
        if (dm < 15) return;
        const f = Math.min(1, step / dm);
        D.setPosition(d.id, cur.lat + (goal.lat - cur.lat) * f, cur.lng + (goal.lng - cur.lng) * f, 'route');
        moved = true;
      });
      if (moved) { Data.flush('drivers'); D.emit(); if (window.TrackerFeed) TrackerFeed.subscribers.forEach((fn) => fn()); }
    }
  };
  D.Live = Live;

  window.Deliver = D;
})();
