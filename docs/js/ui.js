/* Shared UI helpers: escaping, modals, toasts, the bike map and the month calendar. */
(function () {
  'use strict';

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /* Money is written in words (David's rule, Nov 8 2026): "1,500 dollars", or "1,500.50 dollars" when there are cents. */
  const money = (n) => {
    const v = Number(n) || 0, a = Math.abs(v), c = Math.round(a * 100) % 100 ? 2 : 0;
    return (v < 0 ? '-' : '') + a.toLocaleString('en-US', { minimumFractionDigits: c, maximumFractionDigits: c }) + ' dollars';
  };
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const fmtDate = (s, opts) => { if (!s) return ''; const d = new Date(s.length > 10 ? s : s + 'T12:00:00'); return d.toLocaleDateString('en-US', opts || { weekday: 'short', month: 'short', day: 'numeric' }); };
  const fmtRange = (a, b) => a === b ? fmtDate(a) : fmtDate(a, { month: 'short', day: 'numeric' }) + ' – ' + fmtDate(b, { month: 'short', day: 'numeric', year: 'numeric' });
  const ago = (isoStr) => {
    if (!isoStr) return 'never';
    const s = Math.max(0, (Date.now() - new Date(isoStr)) / 1000);
    if (s < 60) return Math.round(s) + 's ago';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return fmtDate(isoStr);
  };
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function statusOf(b) {
    if (b.status === 'approved' && b.end < Data.today()) return 'completed';
    return b.status;
  }
  const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', declined: 'Declined', completed: 'Completed', cancelled: 'Cancelled' };
  const badge = (b) => { const s = statusOf(b); return '<span class="badge st-' + s + '">' + STATUS_LABEL[s] + '</span>'; };

  /* ---------- toast ---------- */
  function toast(msg) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show');
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  /* ---------- modal ---------- */
  function modal(title, bodyHtml, opts) {
    opts = opts || {};
    closeModal();
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap' + (opts.sheet ? ' sheet' : '');
    wrap.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
      '<div class="modal-head"><h2 id="modal-title">' + esc(title) + '</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>' +
      '<div class="modal-body">' + bodyHtml + '</div></div>';
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) closeModal(); });
    document.body.appendChild(wrap);
    document.body.classList.add('modal-open');
    const first = wrap.querySelector('input, select, textarea, button:not([data-close])');
    if (first && !opts.noFocus) setTimeout(() => first.focus(), 30);
    return wrap.querySelector('.modal');
  }
  function closeModal() {
    $$('.modal-wrap').forEach((m) => m.remove());
    document.body.classList.remove('modal-open');
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  function confirmBox(title, text, okLabel, onOk, danger) {
    const m = modal(title, '<p>' + esc(text) + '</p><div class="row-end"><button class="btn ghost" data-close>Cancel</button><button class="btn ' + (danger ? 'danger' : 'primary') + '" data-ok>' + esc(okLabel) + '</button></div>', { noFocus: true });
    m.querySelector('[data-ok]').addEventListener('click', () => { closeModal(); onOk(); });
  }

  /* ---------- flags view state (per user, per device) ---------- */
  function flagStore(userId) {
    const key = 'bikeads.flags.' + userId;
    let st = {};
    try { st = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { st = {}; }
    const save = () => localStorage.setItem(key, JSON.stringify(st));
    return {
      get(bikeId) { return Object.assign({ red: true, blue: true }, st[bikeId] || {}); },
      set(bikeId, color, up) { st[bikeId] = Object.assign(this.get(bikeId), { [color]: up }); save(); },
      setAll(bikeIds, color, up) { bikeIds.forEach((id) => { const f = this.get(id); if (color === 'red' || color === 'both') f.red = up; if (color === 'blue' || color === 'both') f.blue = up; st[id] = f; }); save(); }
    };
  }

  /* ---------- the bike map ---------- */
  function bikeIconHtml(b, f) {
    return '<div class="bk' + (b.position && b.position.source === 'manual' ? ' manual' : '') + '">' +
      '<span class="pole"></span>' +
      '<span class="flag red ' + (f.red ? 'up' : 'down') + '" data-flag="red" title="Advertiser: ' + esc(b.advertiser || '—') + '"><span>' + esc(b.advertiser || 'No advertiser') + '</span></span>' +
      '<span class="flag blue ' + (f.blue ? 'up' : 'down') + '" data-flag="blue" title="Marketing: ' + esc(b.marketing || '—') + '"><span>' + esc(b.marketing || 'No marketing co.') + '</span></span>' +
      '<span class="dot">' + esc(b.number) + '</span></div>';
  }

  function createBikeMap(el, opts) {
    const flags = flagStore(opts.userId);
    const map = L.map(el, { zoomControl: true, attributionControl: true, tap: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, referrerPolicy: 'origin', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    const markers = {};
    let locationId = opts.locationId;
    let dragMode = false;
    let popup = null;
    function openPopup(bikeId) {
      const b = Data.bike(bikeId); if (!b) return;
      popup = L.popup({ offset: [0, -14], autoPan: true }).setLatLng([b.position.lat, b.position.lng]).setContent(popupHtml(b));
      popup._bikeId = bikeId; popup._sig = '';
      popup.openOn(map);
    }

    const bikesHere = () => Data.list('bikes').filter((b) => b.position && (!locationId || locationId === 'all' || b.locationId === locationId));

    function iconFor(b) {
      return L.divIcon({ className: 'bike-icon', html: bikeIconHtml(b, flags.get(b.id)), iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -14] });
    }
    function popupHtml(b) {
      const f = flags.get(b.id), loc = Data.get('locations', b.locationId);
      return '<div class="pop"><strong>Bike #' + esc(b.number) + '</strong><div class="muted small">' + esc(loc ? loc.name : '') + ' · ' + (b.trackerId ? 'tracker ' + esc(b.trackerId) : 'no tracker yet') + '</div>' +
        '<div class="pop-row"><span class="sw red"></span><span class="grow">' + esc(b.advertiser || '—') + '</span><button class="mini" data-pop-toggle="red" data-bike="' + b.id + '">' + (f.red ? 'Down ▼' : 'Up ▲') + '</button></div>' +
        '<div class="pop-row"><span class="sw blue"></span><span class="grow">' + esc(b.marketing || '—') + '</span><button class="mini" data-pop-toggle="blue" data-bike="' + b.id + '">' + (f.blue ? 'Down ▼' : 'Up ▲') + '</button></div>' +
        '<div class="muted small">' + (b.position.source === 'manual' ? 'Placed by hand' : b.position.source === 'live' ? 'Live GPS' : b.position.source === 'phone' ? 'Delivery driver · phone GPS' : b.position.source === 'route' ? 'Delivery driver · on route (demo)' : 'Simulated position') + ' · ' + ago(b.position.at) + '</div>' +
        (opts.admin ? '<div class="pop-actions"><button class="mini" data-pop-edit="' + b.id + '">Edit flags / bike</button>' + (b.position.source === 'manual' ? '<button class="mini" data-pop-release="' + b.id + '">Back to tracker</button>' : '') + '</div>' : '') +
        '</div>';
    }

    function sync(fit) {
      const list = bikesHere();
      const seen = new Set();
      list.forEach((b) => {
        seen.add(b.id);
        const ll = [b.position.lat, b.position.lng];
        let m = markers[b.id];
        if (!m) {
          m = L.marker(ll, { icon: iconFor(b), draggable: dragMode, riseOnHover: true, keyboard: true, title: 'Bike ' + b.number });
          m.on('click', (e) => {
            const t = e.originalEvent && e.originalEvent.target;
            const flagEl = t && t.closest && t.closest('[data-flag]');
            if (flagEl) { toggle(b.id, flagEl.getAttribute('data-flag')); return; }
            openPopup(b.id);
          });
          m.on('dragend', () => { const p = m.getLatLng(); TrackerFeed.setManual(b.id, p.lat, p.lng); if (opts.onChange) opts.onChange(); });
          m.addTo(map); markers[b.id] = m; m._sig = '';
        } else {
          m.setLatLng(ll);
        }
        const f = flags.get(b.id);
        const sig = [b.number, b.advertiser, b.marketing, f.red, f.blue, b.position.source].join('|');
        if (m._sig !== sig) { m.setIcon(iconFor(b)); m._sig = sig; if (m.dragging) { dragMode ? m.dragging.enable() : m.dragging.disable(); } }
        if (popup && popup._bikeId === b.id && map.hasLayer(popup)) {
          popup.setLatLng(ll);
          const psig = sig + '|' + Math.floor(Date.now() / 30000);
          if (popup._sig !== psig) { popup.setContent(popupHtml(b)); popup._sig = psig; }
        }
      });
      Object.keys(markers).forEach((id) => { if (!seen.has(id)) { map.removeLayer(markers[id]); delete markers[id]; } });
      if (fit) fitView();
    }
    function fitView() {
      const loc = Data.get('locations', locationId);
      if (loc) { map.setView([loc.lat, loc.lng], loc.zoom || 15); return; }
      const pts = bikesHere().map((b) => [b.position.lat, b.position.lng]);
      if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 }); else map.setView([40.9, -74.1], 9);
    }
    function toggle(bikeId, color) {
      const f = flags.get(bikeId); flags.set(bikeId, color, !f[color]); sync(); if (opts.onChange) opts.onChange();
    }
    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-pop-toggle]');
      if (t) { const id = t.getAttribute('data-bike'); toggle(id, t.getAttribute('data-pop-toggle')); if (popup) { popup.setContent(popupHtml(Data.bike(id))); } return; }
      const ed = e.target.closest('[data-pop-edit]');
      if (ed && opts.onEditBike) { opts.onEditBike(ed.getAttribute('data-pop-edit')); return; }
      const rel = e.target.closest('[data-pop-release]');
      if (rel) { TrackerFeed.release(rel.getAttribute('data-pop-release')); map.closePopup(); sync(); toast('Bike follows its tracker again'); }
    });

    const off = TrackerFeed.onUpdate(() => sync());
    sync(true);
    setTimeout(() => map.invalidateSize(), 60);

    return {
      map, flags,
      setLocation(id) { locationId = id; sync(true); },
      refresh() { sync(); },
      bikes: bikesHere,
      setAll(color, up) { flags.setAll(bikesHere().map((b) => b.id), color, up); sync(); if (opts.onChange) opts.onChange(); },
      toggle,
      focus(bikeId) { const m = markers[bikeId]; if (m) { map.setView(m.getLatLng(), Math.max(map.getZoom(), 16)); openPopup(bikeId); } },
      setDrag(on) { dragMode = on; Object.values(markers).forEach((m) => { if (m.dragging) on ? m.dragging.enable() : m.dragging.disable(); }); },
      center() { return map.getCenter(); },
      zoom() { return map.getZoom(); },
      destroy() { off(); map.remove(); }
    };
  }

  /* Map toolbar + bike list shared by admin and client map screens */
  function mapControlsHtml(admin) {
    return '<div class="flagbar" role="group" aria-label="Flags">' +
      '<span class="flagbar-label">All flags</span>' +
      '<button class="chip" data-all="both" data-up="1">▲ Up</button><button class="chip" data-all="both" data-up="0">▼ Down</button>' +
      '<span class="sep"></span>' +
      '<button class="chip red" data-all="red" data-up="1">Red ▲</button><button class="chip red" data-all="red" data-up="0">Red ▼</button>' +
      '<button class="chip blue" data-all="blue" data-up="1">Blue ▲</button><button class="chip blue" data-all="blue" data-up="0">Blue ▼</button>' +
      '</div>';
  }
  function bikeListHtml(bm, admin) {
    const list = bm.bikes().sort((a, b) => a.number.localeCompare(b.number));
    if (!list.length) return '<p class="muted pad">No bikes in this location yet.</p>';
    return '<ul class="bikelist">' + list.map((b) => {
      const f = bm.flags.get(b.id);
      return '<li><button class="bl-main" data-focus="' + b.id + '"><span class="num">' + esc(b.number) + '</span><span class="bl-txt"><span class="t-red">' + esc(b.advertiser || '—') + '</span><span class="t-blue">' + esc(b.marketing || '—') + '</span></span></button>' +
        '<button class="flagtog red ' + (f.red ? 'on' : '') + '" data-tog="red" data-bike="' + b.id + '" aria-pressed="' + f.red + '" aria-label="Red flag bike ' + esc(b.number) + '">' + (f.red ? '▲' : '▼') + '</button>' +
        '<button class="flagtog blue ' + (f.blue ? 'on' : '') + '" data-tog="blue" data-bike="' + b.id + '" aria-pressed="' + f.blue + '" aria-label="Blue flag bike ' + esc(b.number) + '">' + (f.blue ? '▲' : '▼') + '</button>' +
        (admin ? '<button class="mini" data-edit-bike="' + b.id + '">Edit</button>' : '') + '</li>';
    }).join('') + '</ul>';
  }
  function wireMapControls(root, bm, rerenderList) {
    root.addEventListener('click', (e) => {
      const a = e.target.closest('[data-all]');
      if (a) { bm.setAll(a.getAttribute('data-all'), a.getAttribute('data-up') === '1'); rerenderList(); return; }
      const t = e.target.closest('[data-tog]');
      if (t) { bm.toggle(t.getAttribute('data-bike'), t.getAttribute('data-tog')); rerenderList(); return; }
      const fo = e.target.closest('[data-focus]');
      if (fo) { bm.focus(fo.getAttribute('data-focus')); const mapEl = root.querySelector('.map'); if (mapEl && window.innerWidth < 900) mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    });
  }

  /* ---------- month calendar (v3: English + Hebrew/Yiddish dates, Yom Tov, Shabbos) ---------- */
  const DOW_HE = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש״ק'];
  /* the day's holiday that gets the small dot: Yom Tov, Chol Hamoed, Chanukah/Purim, fasts, Rosh Chodesh, Erev Yom Tov (not parsha / minor days) */
  const HOL_KINDS = ['yt', 'chm', 'fest', 'fast', 'rc', 'erev'];
  function holOf(jd) { return (jd && (jd.events || []).find((e) => HOL_KINDS.includes(e.kind))) || null; }
  function calendarHtml(year, month, o) {
    o = o || {};
    const J = window.JCal && window.JCal.ready ? window.JCal : null;
    const first = new Date(year, month, 1);
    const startDow = first.getDay();
    const daysIn = new Date(year, month + 1, 0).getDate();
    const heLabel = J ? J.monthLabel(year, month) : '';
    let html = '<div class="cal-head"><button class="icon-btn" data-cal-nav="-1" aria-label="Previous month">‹</button><h3><span>' + MONTHS[month] + ' ' + year + '</span>' + (heLabel ? '<span class="cal-he" lang="he">' + esc(heLabel) + '</span>' : '') + '</h3><button class="icon-btn" data-cal-nav="1" aria-label="Next month">›</button></div>';
    html += '<div class="cal-grid" role="grid">' + DOW.map((d, i) => '<div class="cal-dow' + (i === 6 ? ' shab' : '') + '">' + (i === 6 ? 'Shabbos' : d) + (J ? '<small lang="he">' + DOW_HE[i] + '</small>' : '') + '</div>').join('');
    for (let i = 0; i < startDow; i++) html += '<div class="cal-cell empty"></div>';
    const t = Data.today();
    for (let d = 1; d <= daysIn; d++) {
      const ds = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const dis = o.isDisabled ? o.isDisabled(ds) : false;
      const inRange = o.rangeStart && ds >= o.rangeStart && ds <= (o.rangeEnd || o.rangeStart);
      const jd = J ? J.day(ds) : null;
      const ev = jd && jd.events[0];
      const hev = o.dots === false ? null : holOf(jd); /* Nov 8 2026 (David): a normal calendar, a holiday is only a tiny dot on its day (Admin → Calendar can hide it) */
      const cls = ['cal-cell', ds === t ? 'today' : '', dis ? 'disabled' : '', inRange ? 'in-range' : '', ds === o.rangeStart ? 'range-start' : '', ds === o.rangeEnd ? 'range-end' : '', ds < t ? 'past' : '',
        jd && jd.shabbos ? 'shab' : '', hev ? 'hol-day' : ''].join(' ');
      let title = '';
      if (jd) title = jd.heFull + ' · ' + jd.enHeb + (jd.shabbos ? ' · Shabbos' + (jd.parsha ? ' ' + jd.parsha.en.replace(/^Parshas /, '') : '') : '') + jd.events.map((e) => ' · ' + e.en).join('');
      const hd = jd ? '<span class="cal-hd" lang="he">' + esc(jd.heDay) + ((jd.hebDayNum === 1 || d === 1) ? ' <span class="hm">' + esc(jd.heMonth) + '</span>' : '') + '</span>' : '';
      const hol = hev ? '<span class="cal-dot" aria-hidden="true"></span>' : '';
      html += '<div class="' + cls + '" role="gridcell" data-date="' + ds + '"' + (title ? ' title="' + esc(title) + '" aria-label="' + esc(MONTHS[month] + ' ' + d + ', ' + title) + '"' : '') + (dis ? ' aria-disabled="true"' : ' tabindex="0"') + '><span class="cal-top"><span class="cal-num">' + d + '</span>' + hd + '</span>' + (o.cell ? o.cell(ds) : '') + hol + '</div>';
    }
    html += '</div>';
    /* Nov 8 2026 (David: "a normal calendar … a small 'Today is a holiday', no big rush"): no holiday legend or list any more.
     * One small line only: the picked day (o.rangeStart) or else today, when it is a holiday. */
    if (J && o.dots !== false) {
      const inMonth = (ds) => ds && ds.slice(0, 7) === year + '-' + String(month + 1).padStart(2, '0');
      const pickEv = o.rangeStart ? holOf(J.day(o.rangeStart)) : null;
      const todayEv = inMonth(t) ? holOf(J.day(t)) : null;
      if (pickEv) html += '<p class="cal-note"><span class="cal-dot" aria-hidden="true"></span>This day is a holiday (' + esc(pickEv.en) + ')</p>';
      else if (!o.rangeStart && todayEv) html += '<p class="cal-note"><span class="cal-dot" aria-hidden="true"></span>Today is a holiday (' + esc(todayEv.en) + ')</p>';
    }
    return html;
  }

  window.UI = { DOW_HE, esc, money, fmtDate, fmtRange, ago, $, $$, toast, modal, closeModal, confirmBox, statusOf, badge, STATUS_LABEL, createBikeMap, mapControlsHtml, bikeListHtml, wireMapControls, calendarHtml, holOf, MONTHS, flagStore };
})();
