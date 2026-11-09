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
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6l2-8Z"/>',
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
  const PAGE_TITLE = document.title; /* the search-engine title from index.html, kept on the open pages */

  const App = {
    user() { return current; },
    async start() {
      /* Nov 8 2026: sign-in goes through Auth (js/auth.js): the shared Supabase database when its keys are set in
       * js/config.js, otherwise this browser only. No demo members or demo logins any more. */
      let dbUser = null;
      try { dbUser = await Auth.init(() => { current = null; App.render(); }); }
      catch (e) { console.error(e); toast(Auth.friendly(e)); }
      try { await Data.init(Auth.adapter()); }
      catch (e) { console.error(e); toast('Could not reach the database: ' + Auth.friendly(e)); await Data.init(window.DataLocalAdapter); }
      if (Auth.remote) current = dbUser ? (Data.get('users', dbUser.id) || dbUser) : null;
      else { const sid = localStorage.getItem(SESSION); current = sid ? Data.get('users', sid) : null; }
      if (current && !views(current.role)) current = null;
      if (current && current.role === 'admin') Data.saveStartIfNew().catch((e) => console.error(e));
      TrackerFeed.start();
      if (DELIVERY && window.Deliver) Deliver.Live.start();
      if (DELIVERY && current && current.role === 'driver') DriverViews.resume(current);
      window.addEventListener('hashchange', () => { closeModal(); App.render(); });
      window.addEventListener('online', netBanner); window.addEventListener('offline', netBanner);
      App.render();
      registerWorker();
    },
    login(user) {
      current = user; if (!Auth.remote) localStorage.setItem(SESSION, user.id); sessionStorage.removeItem(VIEWAS);
      if (user.role === 'admin') Data.saveStartIfNew().catch((e) => console.error(e));
      const go = home(user.role); if (location.hash === go) App.render(); else location.hash = go;
    },
    async logout() {
      const back = sessionStorage.getItem(VIEWAS);
      if (back && Data.get('users', back)) { sessionStorage.removeItem(VIEWAS); current = Data.get('users', back); if (!Auth.remote) localStorage.setItem(SESSION, current.id); location.hash = DELIVERY ? '#/admin/deliver' : '#/admin'; return; }
      if (window.DriverViews) DriverViews.stopGps();
      current = null; localStorage.removeItem(SESSION); ClientViews.resetWiz();
      await Auth.signOut();
      if (location.hash === '#/') App.render(); else location.hash = '#/';
    },
    /* Admin: open a plugin exactly as that person sees it; "Back to Admin" returns. */
    viewAs(userId) {
      const u = Data.get('users', userId);
      if (!u || !current || current.role !== 'admin') return;
      sessionStorage.setItem(VIEWAS, current.id);
      current = u; if (!Auth.remote) localStorage.setItem(SESSION, u.id);
      if (u.role === 'driver') DriverViews.resume(u);
      location.hash = home(u.role);
    },
    render() {
      ['AdminViews', 'ClientViews', 'DriverViews', 'StoreViews', 'BossViews'].forEach((k) => { if (window[k]) window[k].teardown(); });
      if (window.HomePage) HomePage.teardown();
      if (window.HomeVideo) HomeVideo.teardown();
      const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
      const app = $('#app');
      document.title = current ? (Data.settings().businessName || 'Media on Wheels') + ' · ' + (ROLE_LABEL[current.role] || 'Account') : PAGE_TITLE;
      if (current && !views(current.role)) current = null;
      if (parts[0] === 'home') return HomePage.render(app, current); // the open main page, also for logged-in users
      if (parts[0] === 'newpassword' && Auth.remote) return renderNewPassword(app);
      if (!current) {
        if (parts[0] === 'signup') return renderSignup(app);
        if (parts[0] === 'login') return renderLogin(app, parts[1] === 'book');
        if (parts[0] === 'forgot') return renderForgot(app);
        if (parts[0] === 'client') return renderLogin(app, true); /* Nov 8 2026: booking needs an account — a signed-out visitor on a booking link gets sign in / create account */
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
      /* Nov 8 2026 (David): "Leave feedback" and "Request a call" at the bottom of every client page */
      if (role === 'client' && window.Inbox && !root.querySelector('[data-feedback]')) main.insertAdjacentHTML('beforeend', '<footer class="app-foot">' + Inbox.buttonsHtml() + '</footer>');
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
      (role === 'client' ? '' : '<span class="role-pill ' + role + '">' + ROLE_LABEL[role] + '</span>') + /* Nov 8 2026 (David): no "Client" badge; Admin keeps its badge */
      '<nav class="tabs desk" aria-label="Main">' + nav + '</nav>' +
      '<div class="who">' + (role === 'client' ? '<a class="btn ghost small-btn" href="#/home" id="gohome">Home</a>' : '') + /* Nov 8 2026: signed-in clients can open the main page */ '<span class="who-name">' + esc(current.name) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span><button class="btn ghost small-btn" id="logout">' + (viewing ? 'Back' : 'Log out') + '</button></div></header>' +
      '<main id="main" tabindex="-1"></main>' +
      '<nav class="tabs mob" aria-label="Main">' + nav + '</nav>';
  }

  function brandBlock() {
    return '<div class="auth-brand"><span class="logo big" aria-hidden="true"><i class="lf r"></i><i class="lf b"></i></span><h1>' + esc(Data.settings().businessName || 'Media on Wheels') + '</h1><p>Ads on grocery-delivery bikes in Williamsburg and Boro Park' + (DELIVERY ? ' — and deliveries for local stores.' : '.') + '</p></div>';
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

  const GOOGLE_G = '<svg class="g-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.2-13.5-10l-7.8 6C6.6 42.6 14.6 48 24 48z"/></svg>';

  /* "Continue with Google": live once the database keys are set; before that the button says it is not set up yet. */
  function googleButton(label) {
    const ready = Auth.googleReady;
    return '<button type="button" class="btn google wide big pill" id="google"' + (ready ? '' : ' aria-describedby="google-note"') + '>' + GOOGLE_G + '<span>' + label + '</span></button>' +
      (ready ? '' : '<p class="small muted center" id="google-note">Google sign-in is not configured yet. It turns on when the database is connected.</p>') +
      '<div class="or" aria-hidden="true"><span>or</span></div>';
  }
  function bindGoogle(errEl) {
    const b = $('#google'); if (!b) return;
    b.addEventListener('click', async () => {
      if (!Auth.googleReady) { errEl.textContent = 'Google sign-in is not configured yet. Please use email and password for now.'; return; }
      b.disabled = true; errEl.textContent = '';
      try { await Auth.google(); } catch (e) { errEl.textContent = e.message; b.disabled = false; }
    });
  }
  /* A plain line about where accounts are saved, shown only while the database is not connected. */
  function storeNote() {
    return Auth.remote ? '' : '<p class="small muted center store-note">The shared database is not connected yet: for now accounts are saved in this browser only.</p>';
  }
  function busy(btn, on, text) { btn.disabled = on; if (text) btn.textContent = text; }

  function renderLogin(app, booking) {
    app.innerHTML = '<main class="auth home v4 login-page">' + loginNav() + '<div class="lpanel login-panel"><div class="auth-card" id="login">' + brandBlock() +
      (booking ? '<p class="book-hint" id="book-hint">To book bikes, log in or <a href="#/signup">create a free account</a>. It takes a minute.</p>' : '') +
      googleButton('Continue with Google') +
      '<form id="loginform" class="form" novalidate><label>Email<input class="input" type="email" name="email" autocomplete="username" required></label>' +
      '<label>Password<input class="input" type="password" name="password" autocomplete="current-password" required></label>' +
      '<p class="err" id="err" role="alert"></p><button class="btn primary wide big pill" id="loginbtn">Log in</button></form>' +
      '<p class="center small"><a href="#/forgot">Forgot password?</a></p>' +
      '<p class="center">New advertiser? <a href="#/signup">Create a client account</a></p>' + storeNote() +
      '</div></div></main>';
    const f = $('#loginform'), err = $('#err'), btn = $('#loginbtn');
    bindGoogle(err);
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); err.textContent = '';
      if (!f.email.value.trim() || !f.password.value) { err.textContent = 'Please type your email and password.'; return; }
      busy(btn, true, 'Logging in…');
      try {
        const u = await Auth.signIn(f.email.value, f.password.value);
        if (!views(u.role)) { err.textContent = 'This login is not active right now.'; busy(btn, false, 'Log in'); return; }
        App.login(u);
      } catch (ex) { err.textContent = ex.message; busy(btn, false, 'Log in'); }
    });
    if (booking) setTimeout(() => f.email.focus({ preventScroll: true }), 50);
  }

  function renderSignup(app) {
    app.innerHTML = '<main class="auth home v4 login-page">' + loginNav() + '<div class="lpanel login-panel"><div class="auth-card">' + brandBlock() + '<h2>Create a client account</h2>' +
      googleButton('Sign up with Google') +
      '<form id="signform" class="form"><label>Your name<input class="input" name="name" required autocomplete="name"></label>' +
      '<label>Company (shown on the red flag)<input class="input" name="company" required autocomplete="organization"></label>' +
      '<label>Phone<input class="input" name="phone" type="tel" autocomplete="tel"></label>' +
      '<label>Email<input class="input" name="email" type="email" required autocomplete="email"></label>' +
      '<label>Password<input class="input" name="password" type="password" minlength="8" required autocomplete="new-password"></label>' +
      '<p class="err" id="err" role="alert"></p><button class="btn primary wide big" id="signbtn">Create account</button></form>' +
      '<p class="center"><a href="#/login">‹ Back to log in</a> · <a href="#/">Main page</a></p>' + storeNote() + '</div></div></main>';
    const f = $('#signform'), err = $('#err'), btn = $('#signbtn');
    bindGoogle(err);
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); err.textContent = '';
      if (f.password.value.length < 8) { err.textContent = 'Please use a password of at least 8 characters.'; return; }
      busy(btn, true, 'Creating account…');
      try {
        const r = await Auth.signUp({ name: f.name.value.trim(), company: f.company.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim().toLowerCase(), password: f.password.value });
        if (r.confirm) {
          $('.auth-card').innerHTML = brandBlock() + '<h2>Check your email</h2><p>We sent a link to <b>' + esc(f.email.value.trim()) + '</b>. Open it to confirm your account, then log in.</p><a class="btn primary wide big pill" href="#/login">Go to log in</a>';
          return;
        }
        toast('Welcome, ' + (r.user.name || '').split(' ')[0] + '!');
        App.login(r.user);
      } catch (ex) { err.textContent = ex.message; busy(btn, false, 'Create account'); }
    });
  }

  function renderForgot(app) {
    app.innerHTML = '<main class="auth home v4 login-page">' + loginNav() + '<div class="lpanel login-panel"><div class="auth-card">' + brandBlock() + '<h2>Forgot your password?</h2>' +
      '<p class="muted">Type your email. We will send you a link to choose a new password.</p>' +
      '<form id="forgotform" class="form"><label>Email<input class="input" name="email" type="email" required autocomplete="email"></label>' +
      '<p class="err" id="err" role="alert"></p><button class="btn primary wide big pill" id="fbtn">Send the link</button></form>' +
      '<p class="center"><a href="#/login">‹ Back to log in</a></p></div></div></main>';
    const f = $('#forgotform'), err = $('#err'), btn = $('#fbtn');
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); err.textContent = ''; busy(btn, true, 'Sending…');
      try { await Auth.resetPassword(f.email.value); $('.auth-card').innerHTML = brandBlock() + '<h2>Check your email</h2><p>If there is an account for that email, a link to choose a new password is on its way.</p><a class="btn primary wide big pill" href="#/login">Back to log in</a>'; }
      catch (ex) { err.textContent = ex.message; busy(btn, false, 'Send the link'); }
    });
  }

  function renderNewPassword(app) {
    app.innerHTML = '<main class="auth home v4 login-page">' + loginNav() + '<div class="lpanel login-panel"><div class="auth-card">' + brandBlock() + '<h2>Choose a new password</h2>' +
      '<form id="npform" class="form"><label>New password<input class="input" name="password" type="password" minlength="8" required autocomplete="new-password"></label>' +
      '<p class="err" id="err" role="alert"></p><button class="btn primary wide big pill" id="npbtn">Save password</button></form></div></div></main>';
    const f = $('#npform'), err = $('#err'), btn = $('#npbtn');
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); err.textContent = '';
      if (f.password.value.length < 8) { err.textContent = 'Please use at least 8 characters.'; return; }
      busy(btn, true, 'Saving…');
      try { const u = await Auth.setNewPassword(f.password.value); toast('Password saved'); App.login(u); }
      catch (ex) { err.textContent = ex.message; busy(btn, false, 'Save password'); }
    });
  }

  window.App = App;
  document.addEventListener('DOMContentLoaded', () => App.start());
})();
