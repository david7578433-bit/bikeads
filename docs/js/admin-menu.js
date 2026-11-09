/* Media on Wheels — the Admin menu (David, Nov 8 2026: "build me an admin menu that's comfortable, nice, user-friendly,
 * and where I can do everything"). Desktop: a side menu. Phone: a bottom bar (Dashboard, Bookings, Inbox, Bikes, Menu)
 * and a Menu drawer with every section and a search box that finds any setting. Every older admin page is kept inside
 * (Live map, Money/books, Classic settings); nothing was removed. */
(function () {
  'use strict';
  const { esc, money, fmtDate, $, $$, toast, modal, closeModal, confirmBox, statusOf, badge } = UI;
  const P = () => (window.AdminViews && AdminViews.parts) || {};
  const SS = () => window.SiteSettings;

  const ICON = {
    home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
    brush: '<path d="M14 4l6 6-8.5 8.5a3 3 0 0 1-4.2 0l-1.8-1.8a3 3 0 0 1 0-4.2L14 4Z"/><path d="M4 20c1.5 0 3-.5 3-2"/>',
    form: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    chat: '<path d="M4 5h16v11H8l-4 4V5Z"/>',
    toggle: '<rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="16" cy="12" r="3"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'
  };

  /* ---------- sections ---------- */
  function settingsPage(key) {
    return (root, user, rest) => {
      const sec = SS().SECTIONS.find((s) => s.key === key);
      root.innerHTML = '<section class="page narrow adm-page"><div class="page-head"><h1>' + esc(sec.title) + '</h1></div><p class="muted adm-intro">' + esc(sec.intro || '') + '</p><div id="set-host" class="set-host"></div></section>';
      const parts = {
        '@discounts': (el) => P().discountsAdmin && P().discountsAdmin(el),
        '@paymethods': (el) => P().payAdmin && P().payAdmin(el),
        '@homevideo': (el) => (window.HomeVideo ? HomeVideo.renderAdmin(el) : el.remove()),
        '@homecontent': (el) => (window.HomePage ? HomePage.renderAdmin(el) : el.remove())
      };
      AdminForms.renderFields($('#set-host', root), sec, parts, rest && rest[0] ? decodeURIComponent(rest[0]) : '');
    };
  }

  const SECTIONS = [
    { key: 'dashboard', label: 'Dashboard', icon: 'home', group: 'Overview', render: renderDashboard },
    { key: 'bookings', label: 'Bookings', icon: 'cal', group: 'Work', render: (r) => P().renderBookings(r), badge: () => Data.list('bookings').filter((b) => b.status === 'pending').length },
    { key: 'bikes', label: 'Bikes', icon: 'bike', group: 'Work', render: renderBikesPlus },
    { key: 'clients', label: 'Clients', icon: 'users', group: 'Work', render: renderClients },
    { key: 'inbox', label: 'Inbox', icon: 'inbox', group: 'Work', render: (r) => Inbox.renderAdmin(r), badge: () => (window.Inbox ? Inbox.waiting() : 0) },
    { key: 'map', label: 'Live map', icon: 'map', group: 'Work', render: (r, u) => P().renderMap(r, u) },
    { key: 'books', label: 'Money & books', icon: 'book', group: 'Work', render: (r) => P().renderBooks(r) },
    { key: 'pricing', label: 'Pricing', icon: 'money', group: 'Settings', render: settingsPage('pricing') },
    { key: 'calendar', label: 'Calendar & days', icon: 'clock', group: 'Settings', render: settingsPage('calendar') },
    { key: 'content', label: 'Site content', icon: 'list', group: 'Settings', render: settingsPage('content') },
    { key: 'appearance', label: 'Appearance', icon: 'brush', group: 'Settings', render: settingsPage('appearance') },
    { key: 'form', label: 'Booking form', icon: 'form', group: 'Settings', render: settingsPage('form') },
    { key: 'messages', label: 'Messages', icon: 'chat', group: 'Settings', render: settingsPage('messages') },
    { key: 'switches', label: 'Switches', icon: 'toggle', group: 'Settings', render: settingsPage('switches') },
    { key: 'seo', label: 'Google & sharing', icon: 'search', group: 'Settings', render: settingsPage('seo') },
    { key: 'account', label: 'Admins & backup', icon: 'shield', group: 'Admin', render: renderAccount },
    { key: 'settings', label: 'Classic settings page', icon: 'gear', group: 'Admin', render: (r) => P().renderSettings(r) }
  ];
  const BOTTOM = ['dashboard', 'bookings', 'inbox', 'bikes'];

  /* ---------- the frame: side menu (desktop), bottom bar + Menu drawer (phone) ---------- */
  function navLink(role, t, active, cls) {
    const n = t.badge ? t.badge() : 0;
    return '<a href="#/' + role + '/' + t.key + '" class="' + cls + (t.key === active ? ' on' : '') + '"' + (t.key === active ? ' aria-current="page"' : '') + '>' + App.icon(t.icon || 'gear') + '<span>' + esc(t.label) + '</span>' + (n ? '<b class="dotcount" aria-label="' + n + ' waiting">' + n + '</b>' : '') + '</a>';
  }
  function groups(tabs) {
    const out = [];
    tabs.forEach((t) => { const g = t.group || 'More'; let x = out.find((o) => o.g === g); if (!x) { x = { g, list: [] }; out.push(x); } x.list.push(t); });
    return out;
  }
  function shell(role, tabs, active, current, top) {
    const side = groups(tabs).map((g) => '<div class="adm-group"><h2>' + esc(g.g) + '</h2>' + g.list.map((t) => navLink(role, t, active, 'adm-link')).join('') + '</div>').join('');
    const bottom = BOTTOM.map((k) => tabs.find((t) => t.key === k)).filter(Boolean).map((t) => navLink(role, t, active, 'tab')).join('') +
      '<button type="button" class="tab' + (BOTTOM.includes(active) ? '' : ' on') + '" id="adm-menu-btn" aria-haspopup="dialog" aria-controls="adm-drawer">' + App.icon('menu') + '<span>Menu</span></button>';
    return top + '<div class="adm-wrap"><aside class="adm-side" aria-label="Admin menu"><label class="adm-search"><span class="sr-only">Find a setting</span>' + App.icon('search') + '<input type="search" id="adm-q-side" placeholder="Find a setting…" autocomplete="off"></label><div class="adm-results" id="adm-r-side" hidden></div>' + side + '</aside>' +
      '<main id="main" tabindex="-1" class="adm-main"></main></div>' +
      '<nav class="tabs mob adm-bottom" aria-label="Admin">' + bottom + '</nav>';
  }
  function results(q, role) {
    q = q.trim().toLowerCase(); if (!q) return '';
    const hits = [];
    SECTIONS.forEach((s) => { if (s.label.toLowerCase().includes(q)) hits.push({ href: '#/' + role + '/' + s.key, t: s.label, sub: s.group }); });
    SS().SECTIONS.forEach((s) => s.fields.forEach((d) => {
      if ((d.label + ' ' + (d.help || '')).toLowerCase().includes(q)) hits.push({ href: '#/' + role + '/' + s.key + (d.k[0] === '@' ? '' : '/' + encodeURIComponent(d.k)), t: d.label, sub: s.title });
    }));
    [['zelle', 'pricing', 'Payment methods / Zelle'], ['promo', 'pricing', 'Promo codes'], ['discount', 'pricing', 'Discounts'], ['video', 'content', 'Main video'], ['stats', 'content', 'Numbers (stats)'], ['review', 'content', 'Reviews'], ['story', 'content', 'Our story'],
      ['admin', 'account', 'Admins'], ['backup', 'account', 'Backup / export'], ['export', 'bookings', 'Export bookings (CSV)'], ['call', 'inbox', 'Call requests'], ['feedback', 'inbox', 'Feedback'], ['area', 'bikes', 'Areas'], ['tracker', 'bikes', 'Trackers'], ['balance', 'books', 'Bank balance']]
      .forEach(([w, k, t]) => { if (w.includes(q) || q.includes(w)) hits.push({ href: '#/' + role + '/' + k, t, sub: (SECTIONS.find((s) => s.key === k) || {}).label }); });
    const seen = new Set();
    const list = hits.filter((h) => !seen.has(h.href + h.t) && seen.add(h.href + h.t)).slice(0, 12);
    return list.length ? list.map((h) => '<a class="adm-hit" href="' + h.href + '"><b>' + esc(h.t) + '</b><span>' + esc(h.sub || '') + '</span></a>').join('') : '<p class="muted small pad">Nothing found for “' + esc(q) + '”.</p>';
  }
  function wireSearch(input, out, role) {
    if (!input) return;
    input.addEventListener('input', () => { out.innerHTML = results(input.value, role); out.hidden = !input.value.trim(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const a = out.querySelector('a'); if (a) { location.hash = a.getAttribute('href'); closeDrawer(); } } });
  }
  function openDrawer(role, tabs, active) {
    closeDrawer();
    const d = document.createElement('div');
    d.className = 'adm-drawer-wrap'; d.id = 'adm-drawer';
    d.innerHTML = '<div class="adm-drawer" role="dialog" aria-modal="true" aria-label="Admin menu"><div class="adm-dhead"><h2>Admin menu</h2><button class="icon-btn" data-dclose aria-label="Close menu">✕</button></div>' +
      '<label class="adm-search big"><span class="sr-only">Find a setting</span>' + App.icon('search') + '<input type="search" id="adm-q" placeholder="Find a setting… (price, color, Shabbos)" autocomplete="off"></label><div class="adm-results" id="adm-r" hidden></div>' +
      groups(tabs).map((g) => '<div class="adm-group"><h3>' + esc(g.g) + '</h3><div class="adm-grid">' + g.list.map((t) => navLink(role, t, active, 'adm-tile')).join('') + '</div></div>').join('') + '</div>';
    document.body.appendChild(d); document.body.classList.add('modal-open');
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-dclose]') || e.target.closest('a')) closeDrawer(); });
    wireSearch($('#adm-q', d), $('#adm-r', d), role);
    setTimeout(() => { const b = $('[data-dclose]', d); if (b) b.focus(); }, 30);
  }
  function closeDrawer() { const d = $('#adm-drawer'); if (d) { d.remove(); document.body.classList.remove('modal-open'); } }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
  window.addEventListener('hashchange', closeDrawer);
  let lastActive = null;
  function wire(role, tabs, active) {
    const deep = /^#\/admin\/[^/]+\/./.test(location.hash);
    if (active !== lastActive && !deep) window.scrollTo(0, 0); /* a new section opens at its top */
    lastActive = active;
    const b = $('#adm-menu-btn'); if (b) b.addEventListener('click', () => openDrawer(role, tabs, active));
    wireSearch($('#adm-q-side'), $('#adm-r-side'), role);
  }

  /* ---------- Dashboard ---------- */
  function renderDashboard(root, user) {
    const t = Data.today(), bk = Data.list('bookings');
    const live = (b) => b.status !== 'declined' && b.status !== 'cancelled';
    const today = bk.filter((b) => live(b) && b.start <= t && b.end >= t);
    const newToday = bk.filter((b) => String(b.createdAt || '').slice(0, 10) === t);
    const pending = bk.filter((b) => b.status === 'pending');
    const month = t.slice(0, 7);
    const paid = (b) => (b.depositPaid ? +b.deposit || 0 : 0) + (b.balancePaid ? +b.balance || 0 : 0) + (b.payment && (b.payment.last4 || (b.payment.brand && b.payment.method !== 'zelle')) && !b.depositPaid ? +b.total || 0 : 0);
    const booked = bk.filter((b) => live(b) && String(b.createdAt || b.start).slice(0, 7) === month).reduce((a, b) => a + (+b.total || 0), 0);
    const tx = Data.list('transactions').filter((x) => String(x.date).slice(0, 7) === month && +x.amount > 0).reduce((a, x) => a + (+x.amount || 0), 0);
    const bikes = Data.list('bikes'), active = bikes.filter((b) => b.active !== false);
    const busy = Data.busyBikeIds ? Data.busyBikeIds(t, t) : new Set();
    const calls = Data.list('callRequests').filter((c) => !c.called);
    const week = Data.addDays(t, -7);
    const fb = Data.list('feedback').filter((f) => String(f.createdAt || '').slice(0, 10) >= week);
    const card = (n, l, href, sub) => '<a class="dash-card" href="' + href + '"><b>' + n + '</b><span>' + esc(l) + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</a>';
    const dollars = (n) => esc(Math.round(+n || 0).toLocaleString('en-US')) + ' <i>dollars</i>';
    root.innerHTML = '<section class="page adm-page"><div class="page-head"><h1>Dashboard</h1><span class="muted">' + esc(fmtDate(t)) + '</span></div>' +
      (Data.mode() === 'device' ? '<div class="notice small"><strong>Saved on this device.</strong> Settings and data are kept in this browser until the shared database is connected.</div>' : '') +
      '<div class="dash-grid">' +
      card(today.length, 'bookings riding today', '#/admin/bookings', newToday.length ? newToday.length + ' new today' : '') +
      card(pending.length, 'waiting for approval', '#/admin/bookings', pending.length ? 'tap to approve' : 'all done') +
      card(dollars(booked), 'booked this month', '#/admin/books', tx ? 'money in: ' + esc(Math.round(tx).toLocaleString('en-US')) + ' dollars' : '') +
      card(active.length + '<i> / ' + bikes.length + '</i>', 'active bikes', '#/admin/bikes', bikes.length ? (active.length - [...busy].filter((id) => active.some((b) => b.id === id)).length) + ' free today' : 'add your bikes') +
      card(calls.length, 'call requests to call back', '#/admin/inbox', '') +
      card(fb.length, 'feedback this week', '#/admin/inbox', '') +
      '</div>' +
      '<div class="card"><h2>Quick links</h2><div class="quick-links">' +
      [['bikes', '+ Add a bike'], ['bookings', 'All bookings'], ['pricing', 'Change prices'], ['calendar', 'Block a day'], ['content', 'Edit main page'], ['appearance', 'Colors & logo'], ['switches', 'Turn sections on/off'], ['account', 'Backup']]
        .map(([k, l]) => '<a class="btn ghost" href="#/admin/' + k + '">' + esc(l) + '</a>').join('') +
      '<a class="btn ghost" href="#/home">See the site</a></div></div>' +
      (pending.length ? '<div class="card"><h2>Waiting for you</h2><ul class="dash-list">' + pending.slice(0, 5).map((b) => '<li><a href="#/admin/bookings"><b>' + esc(b.company || b.clientName || 'Booking') + '</b><span>' + esc(UI.fmtRange(b.start, b.end)) + ' · ' + (b.bikeIds || []).length + ' bikes · ' + esc(money(b.total)) + '</span></a></li>').join('') + '</ul></div>' : '') +
      '</section>';
  }

  /* ---------- Clients ---------- */
  function renderClients(root) {
    let q = '';
    const me = App.user();
    const draw = () => {
      const users = Data.list('users').filter((u) => u.role === 'client' || u.role === 'admin')
        .filter((u) => !q || (u.name + ' ' + u.company + ' ' + u.email + ' ' + u.phone).toLowerCase().includes(q))
        .sort((a, b) => (a.role === b.role ? String(a.name).localeCompare(String(b.name)) : a.role === 'admin' ? -1 : 1));
      const nb = (u) => Data.list('bookings').filter((b) => b.clientId === u.id).length;
      $('#cl-list', root).innerHTML = users.length ? users.map((u) => '<li class="cl-item' + (u.disabled ? ' off' : '') + '"><div><b>' + esc(u.name || u.email) + '</b>' + (u.role === 'admin' ? ' <span class="role-pill admin">Admin</span>' : '') + (u.disabled ? ' <span class="badge st-declined">Turned off</span>' : '') +
        '<span class="small muted">' + esc([u.company, u.email, u.phone].filter(Boolean).join(' · ')) + '</span><span class="small muted">' + nb(u) + ' booking' + (nb(u) === 1 ? '' : 's') + (u.createdAt ? ' · joined ' + esc(fmtDate(String(u.createdAt).slice(0, 10))) : '') + '</span></div>' +
        '<div class="cl-actions"><button class="btn ghost small-btn" data-cview="' + esc(u.id) + '">View</button>' +
        (u.id === (me && me.id) ? '<span class="small muted">You</span>' : (u.role === 'admin' ? '<button class="btn ghost small-btn" data-crole="' + esc(u.id) + '">Remove admin</button>' : '<button class="btn ghost small-btn" data-crole="' + esc(u.id) + '">Make admin</button>') +
          '<button class="btn ' + (u.disabled ? 'ghost' : 'danger-ghost') + ' small-btn" data-cdis="' + esc(u.id) + '">' + (u.disabled ? 'Turn on' : 'Turn off') + '</button>') + '</div></li>').join('') : '<li class="muted pad">No accounts yet. When a client creates an account, it shows here.</li>';
    };
    root.innerHTML = '<section class="page adm-page"><div class="page-head"><h1>Clients</h1></div>' +
      '<div class="card"><input class="input search" type="search" id="cl-q" placeholder="Search name, company, email, phone…" aria-label="Search clients"><ul class="cl-list" id="cl-list"></ul></div></section>';
    draw();
    $('#cl-q', root).addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); draw(); });
    root.addEventListener('click', (e) => {
      const v = e.target.closest('[data-cview]'), r = e.target.closest('[data-crole]'), d = e.target.closest('[data-cdis]');
      if (v) return viewClient(v.getAttribute('data-cview'));
      if (r) { const u = Data.get('users', r.getAttribute('data-crole')); const mk = u.role !== 'admin';
        return confirmBox(mk ? 'Make ' + (u.name || u.email) + ' an admin?' : 'Remove admin from ' + (u.name || u.email) + '?', mk ? 'They will see this whole admin menu and can change everything.' : 'They become a normal client again.', mk ? 'Make admin' : 'Remove admin', async () => { Data.put('users', { id: u.id, role: mk ? 'admin' : 'client' }); await saved('users'); draw(); }, !mk); }
      if (d) { const u = Data.get('users', d.getAttribute('data-cdis')); const off = !u.disabled;
        return confirmBox(off ? 'Turn off ' + (u.name || u.email) + '?' : 'Turn ' + (u.name || u.email) + ' on again?', off ? 'They cannot sign in or book until you turn the account on again. Nothing is deleted.' : 'They can sign in and book again.', off ? 'Turn off' : 'Turn on', async () => { Data.put('users', { id: u.id, disabled: off }); await saved('users'); draw(); }, off); }
    });
  }
  async function saved(name) { try { await Data.flush(name); toast('Saved ✓'); } catch (e) { console.error(e); toast('Not saved: ' + (Auth.friendly ? Auth.friendly(e) : e.message)); } }
  function viewClient(id) {
    const u = Data.get('users', id); if (!u) return;
    const bks = Data.list('bookings').filter((b) => b.clientId === u.id).sort((a, b) => (a.start < b.start ? 1 : -1));
    modal(u.name || u.email, '<dl class="kv"><dt>Company</dt><dd>' + esc(u.company || '—') + '</dd><dt>Email</dt><dd>' + esc(u.email || '—') + '</dd><dt>Phone</dt><dd>' + esc(u.phone || '—') + '</dd><dt>Role</dt><dd>' + (u.role === 'admin' ? 'Admin' : 'Client') + (u.disabled ? ' (turned off)' : '') + '</dd></dl>' +
      '<h3>Bookings</h3>' + (bks.length ? '<ul class="dash-list">' + bks.map((b) => '<li><span><b>' + esc(UI.fmtRange(b.start, b.end)) + '</b> ' + badge(b) + '<span>' + (b.bikeIds || []).length + ' bikes · ' + esc(money(b.total)) + '</span></span></li>').join('') + '</ul>' : '<p class="muted">No bookings yet.</p>') +
      '<div class="row-end"><button class="btn ghost" data-close>Close</button></div>');
  }

  /* ---------- Admins & backup ---------- */
  const BACKUP = ['users', 'locations', 'bikes', 'bookings', 'transactions', 'reconciliations', 'discounts', 'feedback', 'callRequests'];
  function renderAccount(root) {
    const admins = Data.list('users').filter((u) => u.role === 'admin');
    const s = Data.settings();
    root.innerHTML = '<section class="page narrow adm-page"><div class="page-head"><h1>Admins &amp; backup</h1></div>' +
      '<div class="card"><h2>Admins</h2><ul class="cl-list">' + (admins.length ? admins.map((u) => '<li class="cl-item"><div><b>' + esc(u.name || u.email) + '</b><span class="small muted">' + esc(u.email || '') + '</span></div></li>').join('') : '<li class="muted">No admin accounts yet.</li>') + '</ul>' +
      '<p class="small muted">To add an admin: they create an account on the site first, then open <a href="#/admin/clients">Clients</a> and tap “Make admin”. ' + esc((window.SITE && SITE.adminEmails || []).join(', ')) + ' is always admin.</p></div>' +
      '<div class="card"><h2>Backup</h2><p class="muted">Download everything (settings, bikes, bookings, money records, discounts, inbox, accounts) as one file. Keep it somewhere safe.</p>' +
      '<div class="row-end"><button class="btn primary" id="bk-export">Download backup (JSON)</button></div>' +
      '<h3>Restore from a backup</h3><p class="small muted">Adds the backup\'s records and settings back. Records with the same ID are replaced; nothing else is deleted.</p>' +
      '<label class="btn ghost set-upload">Choose backup file…<input type="file" id="bk-import" accept="application/json,.json" hidden></label></div>' +
      '<div class="card"><h2>Where things are saved</h2><p class="muted">' + (Data.mode() === 'device' ? 'On this device (this browser). Connect the shared database to have the same data on every phone.' : 'In the shared database. Every admin sees the same data.') + '</p>' +
      (s.settingsUpdatedAt ? '<p class="small muted">Last settings change: ' + esc(new Date(s.settingsUpdatedAt).toLocaleString()) + (s.settingsUpdatedBy ? ' by ' + esc(s.settingsUpdatedBy) : '') + '</p>' : '') + '</div></section>';
    $('#bk-export', root).addEventListener('click', () => {
      const out = { app: 'Media on Wheels', version: 1, exportedAt: new Date().toISOString(), mode: Data.mode(), settings: Data.settings() };
      BACKUP.forEach((n) => { try { out[n] = Data.list(n); } catch (e) { out[n] = []; } });
      const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'media-on-wheels-backup-' + Data.today() + '.json';
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      toast('Backup downloaded');
    });
    $('#bk-import', root).addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0]; if (!file) return;
      let data; try { data = JSON.parse(await file.text()); } catch (err) { toast('That file is not a Media on Wheels backup'); return; }
      if (!data || data.app !== 'Media on Wheels') { toast('That file is not a Media on Wheels backup'); return; }
      const n = BACKUP.reduce((a, k) => a + (Array.isArray(data[k]) ? data[k].length : 0), 0);
      confirmBox('Restore this backup?', 'From ' + (data.exportedAt ? new Date(data.exportedAt).toLocaleString() : 'unknown date') + ': settings and ' + n + ' records. Records with the same ID are replaced.', 'Restore', async () => {
        try {
          if (data.settings && typeof data.settings === 'object') await Data.saveSettings(data.settings);
          BACKUP.forEach((k) => { if (Array.isArray(data[k])) data[k].forEach((r) => { if (r && r.id) Data.put(k, r); }); });
          await Data.flush('all'); SS().apply(); toast('Backup restored ✓'); App.render();
        } catch (err) { console.error(err); toast('Restore stopped: ' + (Auth.friendly ? Auth.friendly(err) : err.message)); }
      });
    });
  }


  /* ---------- Bikes: add many at once + select several (David, 5:03 PM: "should be able to add 15 bikes") ---------- */
  function renderBikesPlus(root) {
    P().renderBikes(root);
    const tools = $('.page-head .head-tools', root);
    if (tools) tools.insertAdjacentHTML('afterbegin', '<button class="btn" id="addmany">+ Add many bikes</button>');
    const cards = $$('.bike-card', root);
    cards.forEach((c) => { const ed = c.querySelector('[data-edit]'); if (!ed) return; c.insertAdjacentHTML('afterbegin', '<label class="bike-pick"><input type="checkbox" data-pick="' + esc(ed.getAttribute('data-edit')) + '"><span class="sr-only">Select bike</span></label>'); });
    if (cards.length) {
      const locs = Data.list('locations');
      const bar = '<div class="card bulk-bar" id="bulk"><label class="check"><input type="checkbox" id="pickall"> Select all</label><span class="muted small" id="bulk-n">0 selected</span>' +
        '<div class="bulk-actions"><button class="btn ghost small-btn" data-bulk="on" disabled>Make active</button><button class="btn ghost small-btn" data-bulk="off" disabled>Make inactive</button>' +
        '<label class="sr-only" for="bulk-area">Area</label><select class="select small-sel" id="bulk-area" disabled><option value="">Set area…</option>' + locs.map((l) => '<option value="' + esc(l.id) + '">' + esc(l.name) + '</option>').join('') + '</select>' +
        '<button class="btn danger-ghost small-btn" data-bulk="del" disabled>Delete</button></div></div>';
      const list = $('.cards', root); if (list) list.insertAdjacentHTML('beforebegin', bar);
    }
    const picked = () => $$('[data-pick]:checked', root).map((x) => x.getAttribute('data-pick'));
    const sync = () => { const n = picked().length; const el = $('#bulk-n', root); if (el) el.textContent = n + ' selected'; $$('[data-bulk], #bulk-area', root).forEach((b) => { b.disabled = !n; }); };
    root.addEventListener('change', (e) => {
      if (e.target.id === 'pickall') { $$('[data-pick]', root).forEach((x) => { x.checked = e.target.checked; }); sync(); }
      else if (e.target.hasAttribute('data-pick')) sync();
      else if (e.target.id === 'bulk-area' && e.target.value) {
        const ids = picked(), loc = Data.get('locations', e.target.value);
        confirmBox('Move ' + ids.length + ' bike' + (ids.length > 1 ? 's' : '') + ' to ' + loc.name + '?', 'Their map point moves to that area.', 'Move', async () => { ids.forEach((id) => Data.put('bikes', { id, locationId: loc.id, position: { lat: loc.lat + (Math.random() - 0.5) * 0.004, lng: loc.lng + (Math.random() - 0.5) * 0.005, at: new Date().toISOString(), source: 'sim' } }, { silent: true })); await saved('bikes'); App.render(); });
        e.target.value = '';
      }
    });
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-bulk]'); if (!b) return;
      const ids = picked(), k = b.getAttribute('data-bulk'), n = ids.length + ' bike' + (ids.length > 1 ? 's' : '');
      if (k === 'del') return confirmBox('Delete ' + n + '?', 'They come off the site and the map. Past bookings keep their record.', 'Delete ' + n, async () => { ids.forEach((id) => Data.remove('bikes', id)); await saved('bikes'); App.render(); }, true);
      ids.forEach((id) => Data.put('bikes', { id, active: k === 'on' }, { silent: true })); saved('bikes').then(() => App.render());
    });
    const am = $('#addmany', root); if (am) am.addEventListener('click', addMany);
  }
  function addMany() {
    const locs = Data.list('locations'), bikes = Data.list('bikes');
    const next = bikes.reduce((m, x) => Math.max(m, parseInt(String(x.number).replace(/\D/g, ''), 10) || 0), 0) + 1;
    const m = modal('Add many bikes', '<form class="form" id="amf"><div class="two"><label>How many bikes<input class="input" type="number" inputmode="numeric" name="count" min="1" max="300" value="15" required></label>' +
      '<label>Start at number<input class="input" type="number" inputmode="numeric" name="start" min="1" value="' + next + '"></label></div>' +
      '<label>Name in front (optional)<input class="input" name="prefix" value="Bike" placeholder="Bike"></label>' +
      '<label>Area<select class="select" name="loc">' + locs.map((l) => '<option value="' + esc(l.id) + '">' + esc(l.name) + '</option>').join('') + '</select></label>' +
      '<p class="notice small" id="am-prev" role="status"></p><p class="small muted">No tracker number needed. You can edit each bike later (tracker, notes, route).</p>' +
      '<div class="row-end"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary" type="submit" id="am-go">Add bikes</button></div></form>');
    const f = m.querySelector('#amf');
    const plan = () => {
      const n = Math.max(0, Math.min(300, Math.round(+f.count.value || 0))), s = Math.max(1, Math.round(+f.start.value || 1));
      const pre = f.prefix.value.trim(), used = new Set(Data.list('bikes').map((b) => String(b.number)));
      const nums = []; for (let i = 0; i < n; i++) nums.push(pre && pre.toLowerCase() !== 'bike' ? pre + ' ' + (s + i) : String(s + i));
      const clash = nums.filter((x) => used.has(x));
      return { n, nums, clash, label: (x) => (pre && pre.toLowerCase() !== 'bike' ? x : (pre || 'Bike') + ' ' + x) };
    };
    const show = () => { const p = plan(); $('#am-prev', m).textContent = p.n ? 'This will add ' + p.n + ' bike' + (p.n > 1 ? 's' : '') + ': ' + p.label(p.nums[0]) + (p.n > 1 ? ' … ' + p.label(p.nums[p.n - 1]) : '') + '.' + (p.clash.length ? ' ' + p.clash.length + ' of these numbers already exist and will be skipped.' : '') : 'Type how many bikes.'; $('#am-go', m).textContent = p.n ? 'Add ' + p.n + ' bikes' : 'Add bikes'; };
    f.addEventListener('input', show); show();
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const p = plan(); if (!p.n) return;
      const loc = Data.get('locations', f.loc.value) || locs[0];
      const add = p.nums.filter((x) => !p.clash.includes(x));
      add.forEach((num) => Data.put('bikes', { number: num, trackerId: '', locationId: loc ? loc.id : '', advertiser: '', marketing: '', notes: '', route: '', active: true,
        position: loc ? { lat: loc.lat + (Math.random() - 0.5) * 0.004, lng: loc.lng + (Math.random() - 0.5) * 0.005, at: new Date().toISOString(), source: 'sim' } : null }, { silent: true }));
      closeModal(); await saved('bikes'); toast(add.length + ' bikes added ✓'); App.render();
    });
  }

  /* ---------- Areas (service areas the bikes belong to) ---------- */
  function manageAreas(done) {
    const draw = () => {
      const locs = Data.list('locations');
      const m = modal('Areas', '<p class="muted">The areas your bikes ride in.</p><ul class="plain-list">' + locs.map((l) => '<li><input class="input" data-area="' + l.id + '" value="' + esc(l.name) + '" aria-label="Area name"><span class="muted small">' + Data.list('bikes').filter((b) => b.locationId === l.id).length + ' bikes</span><button class="mini" data-area-del="' + l.id + '" aria-label="Remove ' + esc(l.name) + '">✕</button></li>').join('') + '</ul>' +
        '<div class="form-row"><input class="input" id="newarea" placeholder="New area, e.g. Crown Heights"><button class="btn" id="addarea">Add</button></div><div class="row-end"><button class="btn primary" id="savearea">Save</button></div>');
      m.querySelector('#addarea').addEventListener('click', () => { const name = m.querySelector('#newarea').value.trim(); if (!name) { toast('Type a name first'); return; } const c = locs[0] || { lat: 40.7081, lng: -73.9571 }; Data.put('locations', { name, lat: c.lat, lng: c.lng, zoom: 15 }); toast('Area added (move its map point on the Live map)'); draw(); });
      m.querySelector('#savearea').addEventListener('click', () => { $$('[data-area]', m).forEach((i) => Data.put('locations', { id: i.getAttribute('data-area'), name: i.value.trim() || 'Unnamed' })); closeModal(); toast('Saved ✓'); if (done) done(); });
      $$('[data-area-del]', m).forEach((b) => b.addEventListener('click', () => { const id = b.getAttribute('data-area-del'); if (Data.list('bikes').some((x) => x.locationId === id)) { toast('Move its bikes to another area first'); return; } confirmBox('Remove this area?', 'No bikes are in it.', 'Remove', () => { Data.remove('locations', id); draw(); }, true); }));
    };
    draw();
  }

  /* Replace the admin tabs with the menu sections (platform.js may add the Deliver tab before "settings" afterwards). */
  if (window.AdminViews) AdminViews.tabs = SECTIONS.slice();
  window.AdminMenu = { ICON, SECTIONS, addMany, renderBikesPlus, BOTTOM, shell, wire, openDrawer, closeDrawer, results, manageAreas, renderDashboard, renderClients, renderAccount };
})();
