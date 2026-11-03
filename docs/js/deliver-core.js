/* BikeAds Deliver — pure helpers (no DOM): distances, route building, ETAs,
 * table parsing for store uploads, and text templates. Runs in the browser
 * (window.DeliverCore) and in Node for the tests (module.exports).
 */
(function (root) {
  'use strict';

  const R = 6371000;
  const rad = (d) => d * Math.PI / 180;
  function dist(a, b) {
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /* Length of an open path: start -> pts[order[0]] -> pts[order[1]] ... */
  function pathLength(start, pts, order) {
    let d = 0, prev = start;
    order.forEach((i) => { d += dist(prev, pts[i]); prev = pts[i]; });
    return d;
  }

  function nearestNeighbor(start, pts) {
    const left = pts.map((_, i) => i), order = [];
    let cur = start;
    while (left.length) {
      let best = 0, bd = Infinity;
      left.forEach((i, k) => { const d = dist(cur, pts[i]); if (d < bd) { bd = d; best = k; } });
      const i = left.splice(best, 1)[0];
      order.push(i); cur = pts[i];
    }
    return order;
  }

  /* 2-opt on an open path that starts at `start` (the store) and ends at the last stop. */
  function twoOpt(start, pts, order, maxRounds) {
    let best = order.slice(), improved = true, rounds = 0;
    const node = (k) => (k < 0 ? start : pts[best[k]]);
    while (improved && rounds < (maxRounds || 50)) {
      improved = false; rounds++;
      for (let i = 0; i < best.length - 1; i++) {
        for (let j = i + 1; j < best.length; j++) {
          const a = node(i - 1), b = node(i), c = node(j), d = j + 1 < best.length ? node(j + 1) : null;
          const before = dist(a, b) + (d ? dist(c, d) : 0);
          const after = dist(a, c) + (d ? dist(b, d) : 0);
          if (after + 0.01 < before) {
            best = best.slice(0, i).concat(best.slice(i, j + 1).reverse(), best.slice(j + 1));
            improved = true;
          }
        }
      }
    }
    return best;
  }

  function optimize(start, pts) {
    if (pts.length < 2) return pts.map((_, i) => i);
    return twoOpt(start, pts, nearestNeighbor(start, pts));
  }

  /* Same, but customers with an earlier delivery window come first: stops are grouped by
   * window start (earliest group first) and each group is ordered by distance. */
  function optimizeTimed(start, pts) {
    if (!pts.some((p) => p.earliest)) return optimize(start, pts);
    const groups = {};
    pts.forEach((p, i) => { const k = p.earliest || 0; (groups[k] = groups[k] || []).push(i); });
    const out = []; let cur = start;
    Object.keys(groups).map(Number).sort((a, b) => a - b).forEach((k) => {
      const idx = groups[k], sub = idx.map((i) => pts[i]);
      optimize(cur, sub).forEach((j) => out.push(idx[j]));
      cur = pts[out[out.length - 1]];
    });
    return out;
  }

  /* Pick the better of the shortest order and the window-first order: fewest late stops,
   * then the earliest finish. opts are the ETA options (start time, speed...). */
  function bestOrder(start, pts, opts) {
    const cands = [optimize(start, pts)];
    if (pts.some((p) => p.earliest || p.latest)) cands.push(optimizeTimed(start, pts));
    if (!opts || !opts.start) return cands[0];
    let best = null, bestScore = Infinity;
    cands.forEach((ord) => {
      const t = etas(start, ord.map((i) => pts[i]), opts);
      const late = ord.filter((i, k) => pts[i].latest && t[k] > pts[i].latest).length;
      const score = late * 1e13 + (t[t.length - 1] || 0);
      if (score < bestScore) { bestScore = score; best = ord; }
    });
    return best;
  }

  /* Split stops among k drivers: sweep by angle around the depot, cut where the
   * biggest angular gap is, then cut into k runs of nearly equal size. */
  function sweepSplit(depot, pts, k) {
    const idx = pts.map((_, i) => i);
    if (k <= 1 || pts.length <= 1) return [idx];
    const ang = (p) => Math.atan2(p.lat - depot.lat, (p.lng - depot.lng) * Math.cos(rad(depot.lat)));
    idx.sort((a, b) => ang(pts[a]) - ang(pts[b]));
    let gapAt = 0, gap = -1;
    for (let i = 0; i < idx.length; i++) {
      const a = ang(pts[idx[i]]), b = ang(pts[idx[(i + 1) % idx.length]]);
      let g = b - a; if (g <= 0) g += Math.PI * 2;
      if (g > gap) { gap = g; gapAt = (i + 1) % idx.length; }
    }
    const ring = idx.slice(gapAt).concat(idx.slice(0, gapAt));
    const groups = [];
    const n = ring.length;
    for (let g = 0; g < k; g++) groups.push(ring.slice(Math.round(g * n / k), Math.round((g + 1) * n / k)));
    return groups.filter((g) => g.length);
  }

  /* Build routes.
   * stops:   [{ id, lat, lng, area, pinnedDriverId? }]
   * drivers: [{ id, area }]  (only the drivers working today)
   * depots:  { area: {lat, lng} }  (where the bags are picked up)
   * Returns { driverId: [stopId, ...] } in delivery order. */
  function buildRoutes(stops, drivers, depots, etaOpts) {
    const out = {};
    drivers.forEach((d) => { out[d.id] = []; });
    if (!drivers.length) return out;
    const areas = {};
    stops.forEach((s) => { (areas[s.area] = areas[s.area] || []).push(s); });
    const load = (id) => out[id].length;
    Object.keys(areas).forEach((area) => {
      const list = areas[area];
      let team = drivers.filter((d) => d.area === area);
      if (!team.length) {
        const spare = drivers.slice().sort((a, b) => load(a.id) - load(b.id))[0];
        team = [spare];
      }
      const depot = depots[area] || centroid(list);
      const pinned = list.filter((s) => s.pinnedDriverId && out[s.pinnedDriverId]);
      const free = list.filter((s) => !(s.pinnedDriverId && out[s.pinnedDriverId]));
      pinned.forEach((s) => out[s.pinnedDriverId].push(s));
      sweepSplit(depot, free, team.length).forEach((g, i) => { g.forEach((k) => out[team[i].id].push(free[k])); });
    });
    Object.keys(out).forEach((id) => {
      const list = out[id];
      if (!list.length) { out[id] = []; return; }
      const depot = depots[list[0].area] || centroid(list);
      out[id] = bestOrder(depot, list, etaOpts).map((i) => list[i].id);
    });
    return out;
  }

  function centroid(pts) {
    const n = pts.length || 1;
    return { lat: pts.reduce((a, p) => a + p.lat, 0) / n, lng: pts.reduce((a, p) => a + p.lng, 0) / n };
  }

  /* ETA for each stop, in ms since epoch.
   * opts: { start: ms, speedKmh, minutesPerStop, detour } */
  function etas(depot, stops, opts) {
    const speed = (opts.speedKmh || 14) * 1000 / 3600; // m/s
    const detour = opts.detour || 1.35, stopMs = (opts.minutesPerStop || 4) * 60000;
    let t = opts.start, prev = depot;
    return stops.map((s) => {
      t += dist(prev, s) * detour / speed * 1000;
      if (s.earliest && t < s.earliest) t = s.earliest;   // early: wait for the customer's window
      const eta = t;
      t += stopMs; prev = s;
      return eta;
    });
  }

  /* ---- tables pasted from Excel / CSV files ---- */
  function parseTable(text) {
    text = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const first = text.split('\n')[0] || '';
    const delim = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"' && cell === '') q = true;
      else if (ch === delim) { row.push(cell.trim()); cell = ''; }
      else if (ch === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell.trim()); rows.push(row); }
    return rows.filter((r) => r.some((c) => c !== ''));
  }

  const FIELDS = {
    customer: /^(customer|name|client|full ?name|customer ?name)$/i,
    address: /^(address|street|addr|delivery ?address|ship ?to)$/i,
    city: /^(city|town|area)$/i,
    phone: /^(phone|tel|telephone|mobile|cell|phone ?number)$/i,
    bags: /^(bags?|boxes|box(es)?|packages?|pieces|qty|count|bags ?\/ ?boxes)$/i,
    amount: /^(amount|collect|cod|amount ?to ?collect|due|balance|total)$/i,
    notes: /^(notes?|comments?|instructions?|remarks?)$/i,
    window: /^(window|time|delivery ?time|delivery ?window|slot)$/i,
    order: /^(order|order ?#|order ?no\.?|order ?number|ref|invoice|receipt)$/i
  };
  function guessColumns(header) {
    const map = {};
    header.forEach((h, i) => {
      const k = String(h || '').trim().replace(/[_]+/g, ' ');
      Object.keys(FIELDS).forEach((f) => { if (map[f] === undefined && FIELDS[f].test(k)) map[f] = i; });
    });
    return map;
  }
  function rowsToOrders(rows) {
    if (!rows.length) return { orders: [], columns: {} };
    let columns = guessColumns(rows[0]);
    let body = rows.slice(1);
    if (columns.address === undefined) {        // no header row: assume customer, address, phone, bags, amount, notes
      columns = { customer: 0, address: 1, phone: 2, bags: 3, amount: 4, notes: 5 };
      body = rows;
    }
    const get = (r, f) => (columns[f] === undefined ? '' : String(r[columns[f]] == null ? '' : r[columns[f]]).trim());
    const orders = body.map((r) => {
      const win = parseWindow(get(r, 'window'));
      const city = get(r, 'city');
      const address = get(r, 'address');
      return {
        ref: get(r, 'order'),
        customer: get(r, 'customer'),
        address: city && address && !address.toLowerCase().includes(city.toLowerCase()) ? address + ', ' + city : address,
        phone: get(r, 'phone'),
        bags: Math.max(1, parseInt(get(r, 'bags'), 10) || 1),
        amount: Math.max(0, parseFloat(get(r, 'amount').replace(/[^0-9.]/g, '')) || 0),
        notes: get(r, 'notes'),
        windowStart: win[0], windowEnd: win[1]
      };
    }).filter((o) => o.address);
    return { orders, columns };
  }
  function to24(t) {
    const m = String(t).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/i);
    if (!m) return '';
    let h = +m[1]; const min = m[2] || '00', ap = (m[3] || '').toLowerCase();
    if (ap.startsWith('p') && h < 12) h += 12;
    if (ap.startsWith('a') && h === 12) h = 0;
    if (!ap && h >= 1 && h <= 7) h += 12; // "3-5" means afternoon for a grocery delivery
    return String(h).padStart(2, '0') + ':' + min;
  }
  function parseWindow(s) {
    const parts = String(s || '').split(/\s*(?:-|–|to)\s*/i).filter(Boolean);
    if (parts.length !== 2) return ['', ''];
    return [to24(parts[0]), to24(parts[1])];
  }

  function fill(tpl, vars) {
    return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
  }

  const api = { dist, pathLength, nearestNeighbor, twoOpt, optimize, optimizeTimed, bestOrder, sweepSplit, buildRoutes, centroid, etas, parseTable, guessColumns, rowsToOrders, parseWindow, fill };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DeliverCore = api;
})(typeof window !== 'undefined' ? window : this);
