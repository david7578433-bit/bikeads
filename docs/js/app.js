/* Media on Wheels app shell (repo: bikeads): main page, sign-in, routing, header and tabs. */
(function () {
  'use strict';
  const { esc, $, $$, toast, closeModal } = UI;
  const SESSION = 'bikeads.session';
  const ICONS = {
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14"/>',
    bike: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-8h5l3 8M10 8 8 5H6m6 11 3-8"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4m8-4v4"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Zm0 16a2 2 0 0 1 2-2h13v2"/><path d="M9 8h6m-6 4h4"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5"/>',
    scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5V8Z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    chart: '<path d="M4 20V10m6 10V4m6 16v-7m4 7H2"/>',
    money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4m12-4v4"/>'
  };
  const ROLE_LABEL = { admin: 'Admin', client: 'Client', driver: 'Driver', store: 'Store', boss: 'Boss' };
  const DELIVER_ROLES = ['driver', 'store', 'boss'];
  /* The delivery business (driver, store, boss + the admin Deliver tab) is saved in the code behind one switch:
   * FEATURES.delivery in js/config.js (off for now). Off = no delivery pages, roles, logins or mentions. */
  const DELIVERY = !!(window.FEATURES && window.FEATURES.delivery);
  const VIEWAS = 'bikeads.viewas';
  const views = (role) => (!DELIVERY && DELIVER_ROLES.includes(role)) ? undefined : ({ admin: window.AdminViews, client: window.ClientViews, driver: window.DriverViews, store: window.StoreViews, boss: window.BossViews })[role];
  const home = (role) => '#/' + role + '/' + views(role).tabs[0].key;
  const icon = (k) => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICONS[k] + '</svg>';

  let current = null;

  const App = {
    user() { return current; },
    async start() {
      await Data.init();
      const sid = localStorage.getItem(SESSION);
      current = sid ? Data.get('users', sid) : null;
      if (current && !views(current.role)) current = null;
      TrackerFeed.start();
      if (DELIVERY && window.Deliver) Deliver.Live.start();
      if (DELIVERY && current && current.role === 'driver') DriverViews.resume(current);
      window.addEventListener('hashchange', () => { closeModal(); App.render(); });
      window.addEventListener('online', netBanner); window.addEventListener('offline', netBanner);
      App.render();
      registerWorker();
    },
    login(user) { current = user; localStorage.setItem(SESSION, user.id); sessionStorage.removeItem(VIEWAS); location.hash = home(user.role); },
    logout() {
      const back = sessionStorage.getItem(VIEWAS);
      if (back && Data.get('users', back)) { sessionStorage.removeItem(VIEWAS); current = Data.get('users', back); localStorage.setItem(SESSION, current.id); location.hash = DELIVERY ? '#/admin/deliver' : '#/admin'; return; }
      if (window.DriverViews) DriverViews.stopGps();
      current = null; localStorage.removeItem(SESSION); ClientViews.resetWiz(); location.hash = '#/';
    },
    /* Admin: open a plugin exactly as that person sees it; "Back to Admin" returns. */
    viewAs(userId) {
      const u = Data.get('users', userId);
      if (!u || !current || current.role !== 'admin') return;
      sessionStorage.setItem(VIEWAS, current.id);
      current = u; localStorage.setItem(SESSION, u.id);
      if (u.role === 'driver') DriverViews.resume(u);
      location.hash = home(u.role);
    },
    render() {
      ['AdminViews', 'ClientViews', 'DriverViews', 'StoreViews', 'BossViews'].forEach((k) => { if (window[k]) window[k].teardown(); });
      if (window.HomePage) HomePage.teardown();
      if (window.HomeVideo) HomeVideo.teardown();
      const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
      const app = $('#app');
      document.title = (Data.settings().businessName || 'Media on Wheels') + ' · Bike advertising';
      if (current && !views(current.role)) current = null;
      if (parts[0] === 'home') return HomePage.render(app, current); // the open main page, also for logged-in users
      if (!current) {
        if (parts[0] === 'signup') return renderSignup(app);
        if (parts[0] === 'login') return renderLogin(app, parts[1] === 'book');
        return HomePage.render(app, null);
      }
      current = Data.get('users', current.id) || current;
      const role = current.role;
      const V = views(role);
      if (!V) { App.logout(); return; }
      if (DELIVER_ROLES.includes(role)) document.title = (window.Deliver ? Deliver.settings().name : 'Deliver') + ' · ' + ROLE_LABEL[role];
      if (window.Deliver && !Deliver.pluginOn(role)) {
        app.innerHTML = '<main class="auth"><div class="auth-card center">' + brandBlock() + '<h2>The ' + ROLE_LABEL[role] + ' plugin is turned off</h2><p class="muted">The admin turned it off for now. Nothing was deleted.</p><button class="btn primary wide big" id="logout">' + (sessionStorage.getItem(VIEWAS) ? 'Back to Admin' : 'Log out') + '</button></div></main>';
        $('#logout').addEventListener('click', () => App.logout());
        return;
      }
      if (parts[0] !== role) { location.replace(home(role)); return; }
      const tab = V.tabs.find((t) => t.key === parts[1]) || V.tabs[0];
      app.innerHTML = shell(role, V.tabs, tab.key);
      $('#logout').addEventListener('click', () => App.logout());
      netBanner();
      const main = $('#main');
      const root = document.createElement('div');
      root.className = 'view view-' + tab.key;
      main.appendChild(root);
      tab.render(root, current, parts.slice(2));
    }
  };

  function shell(role, tabs, active) {
    const s = Data.settings();
    const nav = tabs.map((t) => {
      const n = t.badge ? t.badge() : 0;
      return '<a href="#/' + role + '/' + t.key + '" class="tab' + (t.key === active ? ' on' : '') + '"' + (t.key === active ? ' aria-current="page"' : '') + '>' + icon(t.icon) + '<span>' + t.label + '</span>' + (n ? '<b class="dotcount" aria-label="' + n + ' waiting">' + n + '</b>' : '') + '</a>';
    }).join('');
    const viewing = sessionStorage.getItem(VIEWAS);
    const dl = DELIVER_ROLES.includes(role);
    const sub = role === 'store' ? (window.Deliver && Deliver.storeOf(current) ? Deliver.storeOf(current).name : current.company) : role === 'client' ? current.company : '';
    return (viewing ? '<div class="viewas">Viewing as ' + esc(current.name) + ' (' + ROLE_LABEL[role] + ')<button class="mini" id="viewas-back">Back to Admin</button></div>' : '') +
      '<div class="netbar" id="netbar" role="status" hidden>No signal — everything you do is saved on this phone.</div>' +
      '<header class="top' + (dl ? ' deliver' : '') + '"><a class="brand" href="#/' + role + '/' + tabs[0].key + '"><span class="logo" aria-hidden="true"><i class="lf r"></i><i class="lf b"></i></span>' + esc(s.businessName || 'Media on Wheels') + (dl ? '<span class="brand-sub">Deliver</span>' : '') + '</a>' +
      '<span class="role-pill ' + role + '">' + ROLE_LABEL[role] + '</span>' +
      '<nav class="tabs desk" aria-label="Main">' + nav + '</nav>' +
      '<div class="who"><span class="who-name">' + esc(current.name) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span><button class="btn ghost small-btn" id="logout">' + (viewing ? 'Back' : 'Log out') + '</button></div></header>' +
      '<main id="main" tabindex="-1"></main>' +
      '<nav class="tabs mob" aria-label="Main">' + nav + '</nav>';
  }

  function brandBlock() {
    return '<div class="auth-brand"><span class="logo big" aria-hidden="true"><i class="lf r"></i><i class="lf b"></i></span><h1>' + esc(Data.settings().businessName || 'Media on Wheels') + '</h1><p>Ads on grocery-delivery bikes in Williamsburg and Boro Park' + (DELIVERY ? ' — and deliveries for local stores.' : '.') + '</p></div>';
  }

  function demoDeliver() {
    const items = [['driver', '🚴 Driver', 'driver@bikeads.demo', 'driver123'], ['store', '🏪 Store', 'store@bikeads.demo', 'store123'], ['boss', '👔 Boss / dispatch', 'boss@bikeads.demo', 'boss123']];
    return '<div class="demo-row">' + items.map(([role, label, email, pw]) => {
      const off = window.Deliver && !Deliver.pluginOn(role);
      return '<button class="demo-btn' + (off ? ' off' : '') + '" data-demo="' + email + '|' + pw + '"><strong>' + label + '</strong><span>' + email + ' · ' + pw + (off ? ' · turned off' : '') + '</span></button>';
    }).join('') + '</div>';
  }

  function netBanner() {
    const el = document.getElementById('netbar');
    if (el) el.hidden = navigator.onLine !== false;
    const b = document.getElementById('viewas-back');
    if (b && !b._bound) { b._bound = true; b.addEventListener('click', () => App.logout()); }
  }

  /* Installable app + works with no signal: a small service worker keeps the app files. */
  function registerWorker() {
    if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
    navigator.serviceWorker.register('sw.js').catch(() => { /* the app still works without it */ });
  }

  /* v4: the main page is an open one-pager (js/home.js). Log in is its own calm page; "Book bikes" lands here
   * with a short note (#/login/book). The v3.1 Williamsburg ad-bike animation now sits in the Videos section. */
  function loginNav() {
    return '<header class="lnav"><a class="brand" href="#/"><span class="logo" aria-hidden="true"><i class="lf r"></i><i class="lf b"></i></span>' + esc(Data.settings().businessName || 'Media on Wheels') + '</a>' +
      '<a class="btn pill white lnav-cta" href="#/">‹ Main page</a></header>';
  }

  function renderLogin(app, booking) {
    const deliverDemo = DELIVERY ? '<p class="demo-group">' + esc(window.Deliver ? Deliver.settings().name : 'Deliver') + '</p>' + demoDeliver() : '';
    app.innerHTML = '<main class="auth home v4 login-page">' + loginNav() + '<div class="lpanel login-panel"><div class="auth-card" id="login">' + brandBlock() +
      (booking ? '<p class="book-hint" id="book-hint">To book bikes, log in or <a href="#/signup">create a free account</a>. It takes a minute.</p>' : '') +
      '<form id="loginform" class="form" novalidate><label>Email<input class="input" type="email" name="email" autocomplete="username" required></label>' +
      '<label>Password<input class="input" type="password" name="password" autocomplete="current-password" required></label>' +
      '<p class="err" id="err" role="alert"></p><button class="btn primary wide big pill">Log in</button></form>' +
      '<p class="center">New advertiser? <a href="#/signup">Create a client account</a></p>' +
      '<details class="demo-box"' + (booking ? ' open' : '') + '><summary>Demo logins</summary><button class="demo-btn" data-demo="admin@bikeads.demo|admin123"><strong>Admin</strong><span>admin@bikeads.demo · admin123' + (DELIVERY ? ' · also runs the delivery side' : '') + '</span></button>' +
      '<button class="demo-btn" data-demo="client@bikeads.demo|client123"><strong>Client</strong><span>client@bikeads.demo · client123</span></button>' + deliverDemo + '</details>' +
      '</div></div></main>';
    const f = $('#loginform');
    const tryLogin = (email, pw) => {
      const u = Data.list('users').find((x) => x.email.toLowerCase() === email.trim().toLowerCase() && x.password === pw);
      if (!u || !views(u.role)) { $('#err').textContent = u ? 'This login is not active right now.' : 'Email or password is wrong.'; return; }
      App.login(u);
    };
    f.addEventListener('submit', (e) => { e.preventDefault(); tryLogin(f.email.value, f.password.value); });
    $$('[data-demo]').forEach((b) => b.addEventListener('click', () => { const [e, p] = b.getAttribute('data-demo').split('|'); f.email.value = e; f.password.value = p; tryLogin(e, p); }));
    if (booking) setTimeout(() => f.email.focus({ preventScroll: true }), 50);
  }

  function renderSignup(app) {
    app.innerHTML = '<main class="auth home v4 login-page">' + loginNav() + '<div class="lpanel login-panel"><div class="auth-card">' + brandBlock() + '<h2>Create a client account</h2>' +
      '<form id="signform" class="form"><label>Your name<input class="input" name="name" required autocomplete="name"></label>' +
      '<label>Company (shown on the red flag)<input class="input" name="company" required autocomplete="organization"></label>' +
      '<label>Phone<input class="input" name="phone" type="tel" autocomplete="tel"></label>' +
      '<label>Email<input class="input" name="email" type="email" required autocomplete="email"></label>' +
      '<label>Password<input class="input" name="password" type="password" minlength="6" required autocomplete="new-password"></label>' +
      '<p class="err" id="err" role="alert"></p><button class="btn primary wide big">Create account</button></form>' +
      '<p class="center"><a href="#/login">‹ Back to log in</a> · <a href="#/">Main page</a></p><p class="small muted center">Demo: accounts are saved in this browser only.</p></div></div></main>';
    const f = $('#signform');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = f.email.value.trim().toLowerCase();
      if (Data.list('users').some((u) => u.email.toLowerCase() === email)) { $('#err').textContent = 'That email already has an account.'; return; }
      const u = Data.put('users', { role: 'client', name: f.name.value.trim(), company: f.company.value.trim(), phone: f.phone.value.trim(), email, password: f.password.value });
      toast('Welcome, ' + u.name.split(' ')[0] + '!');
      App.login(u);
    });
  }

  window.App = App;
  document.addEventListener('DOMContentLoaded', () => App.start());
})();
