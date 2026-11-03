/* BikeAds app shell: sign-in, routing, header and tabs. */
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
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'
  };
  const icon = (k) => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICONS[k] + '</svg>';

  let current = null;

  const App = {
    user() { return current; },
    async start() {
      await Data.init();
      const sid = localStorage.getItem(SESSION);
      current = sid ? Data.get('users', sid) : null;
      TrackerFeed.start();
      window.addEventListener('hashchange', () => { closeModal(); App.render(); });
      App.render();
    },
    login(user) { current = user; localStorage.setItem(SESSION, user.id); location.hash = user.role === 'admin' ? '#/admin/map' : '#/client/map'; },
    logout() { current = null; localStorage.removeItem(SESSION); ClientViews.resetWiz(); location.hash = '#/login'; },
    render() {
      AdminViews.teardown(); ClientViews.teardown();
      const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
      const app = $('#app');
      document.title = (Data.settings().businessName || 'BikeAds') + ' · Bike advertising';
      if (!current) {
        if (parts[0] === 'signup') return renderSignup(app);
        return renderLogin(app);
      }
      const role = current.role;
      const views = role === 'admin' ? AdminViews : ClientViews;
      if (parts[0] !== role) { location.replace('#/' + role + '/' + views.tabs[0].key); return; }
      const tab = views.tabs.find((t) => t.key === parts[1]) || views.tabs[0];
      app.innerHTML = shell(role, views.tabs, tab.key);
      $('#logout').addEventListener('click', () => App.logout());
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
    return '<header class="top"><a class="brand" href="#/' + role + '/' + tabs[0].key + '"><span class="logo" aria-hidden="true"><i class="lf r"></i><i class="lf b"></i></span>' + esc(s.businessName || 'BikeAds') + '</a>' +
      '<span class="role-pill ' + role + '">' + (role === 'admin' ? 'Admin' : 'Client') + '</span>' +
      '<nav class="tabs desk" aria-label="Main">' + nav + '</nav>' +
      '<div class="who"><span class="who-name">' + esc(current.name) + (role === 'client' ? '<small>' + esc(current.company || '') + '</small>' : '') + '</span><button class="btn ghost small-btn" id="logout">Log out</button></div></header>' +
      '<main id="main" tabindex="-1"></main>' +
      '<nav class="tabs mob" aria-label="Main">' + nav + '</nav>';
  }

  function brandBlock() {
    return '<div class="auth-brand"><span class="logo big" aria-hidden="true"><i class="lf r"></i><i class="lf b"></i></span><h1>' + esc(Data.settings().businessName || 'BikeAds') + '</h1><p>Ads on bikes, live on the map.</p></div>';
  }

  function renderLogin(app) {
    app.innerHTML = '<main class="auth"><div class="auth-card">' + brandBlock() +
      '<form id="loginform" class="form" novalidate><label>Email<input class="input" type="email" name="email" autocomplete="username" required></label>' +
      '<label>Password<input class="input" type="password" name="password" autocomplete="current-password" required></label>' +
      '<p class="err" id="err" role="alert"></p><button class="btn primary wide big">Log in</button></form>' +
      '<div class="demo-box"><h2>Demo logins</h2><button class="demo-btn" data-demo="admin@bikeads.demo|admin123"><strong>Admin</strong><span>admin@bikeads.demo · admin123</span></button>' +
      '<button class="demo-btn" data-demo="client@bikeads.demo|client123"><strong>Client</strong><span>client@bikeads.demo · client123</span></button></div>' +
      '<p class="center">New advertiser? <a href="#/signup">Create a client account</a></p></div></main>';
    const f = $('#loginform');
    const tryLogin = (email, pw) => {
      const u = Data.list('users').find((x) => x.email.toLowerCase() === email.trim().toLowerCase() && x.password === pw);
      if (!u) { $('#err').textContent = 'Email or password is wrong.'; return; }
      App.login(u);
    };
    f.addEventListener('submit', (e) => { e.preventDefault(); tryLogin(f.email.value, f.password.value); });
    $$('[data-demo]').forEach((b) => b.addEventListener('click', () => { const [e, p] = b.getAttribute('data-demo').split('|'); f.email.value = e; f.password.value = p; tryLogin(e, p); }));
  }

  function renderSignup(app) {
    app.innerHTML = '<main class="auth"><div class="auth-card">' + brandBlock() + '<h2>Create a client account</h2>' +
      '<form id="signform" class="form"><label>Your name<input class="input" name="name" required autocomplete="name"></label>' +
      '<label>Company (shown on the red flag)<input class="input" name="company" required autocomplete="organization"></label>' +
      '<label>Phone<input class="input" name="phone" type="tel" autocomplete="tel"></label>' +
      '<label>Email<input class="input" name="email" type="email" required autocomplete="email"></label>' +
      '<label>Password<input class="input" name="password" type="password" minlength="6" required autocomplete="new-password"></label>' +
      '<p class="err" id="err" role="alert"></p><button class="btn primary wide big">Create account</button></form>' +
      '<p class="center"><a href="#/login">‹ Back to log in</a></p><p class="small muted center">Demo: accounts are saved in this browser only.</p></div></main>';
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
