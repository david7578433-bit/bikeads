/* Media on Wheels sign-in + shared database (Nov 8 2026).
 * Two modes, picked by js/config.js:
 *  - DATABASE mode (SUPABASE_URL and SUPABASE_ANON_KEY set): Supabase Auth (email + password, "Continue with Google")
 *    and the shared Supabase database (tables mow_*, see supabase/schema.sql), protected by Row Level Security:
 *    clients see only their own account and bookings; the admin sees everything.
 *  - THIS-DEVICE mode (keys empty): accounts and data are kept in this browser only, so nothing breaks before the
 *    keys arrive. Passwords are stored as a salted hash, never as plain text. Admin = an email in SITE.adminEmails.
 * Everything else in the app keeps calling Data.* and App.* exactly as before.
 */
(function () {
  'use strict';
  const CFG = window.SUPABASE || {};
  const REMOTE = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  const ADMIN_EMAILS = ((window.SITE && window.SITE.adminEmails) || []).map((e) => String(e).toLowerCase());
  const RECORDS = ['locations', 'bikes', 'bookings', 'transactions', 'reconciliations', 'stores', 'drivers', 'orders', 'smslog', 'shifts', 'invoices', 'payouts'];
  const PRIVATE_SETTINGS = ['openingBalance']; /* settings only the admin may read (money) */
  let sb = null;
  let profile = null; /* the signed-in user's mow_profiles row, as an app user object */

  /* ---------- small helpers ---------- */
  const siteUrl = () => location.origin + location.pathname;
  const clean = (o) => JSON.parse(JSON.stringify(o == null ? null : o));
  const toUser = (p) => p && ({ id: p.id, role: p.role || 'client', name: p.name || (p.email || '').split('@')[0], company: p.company || '', phone: p.phone || '', email: p.email || '', createdAt: p.created_at });
  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  function friendly(err) {
    const m = String((err && (err.message || err.error_description)) || err || '');
    if (/invalid login credentials/i.test(m)) return 'Email or password is wrong.';
    if (/email not confirmed/i.test(m)) return 'Please confirm your email first: open the link we sent you, then log in.';
    if (/already registered|already been registered|user already exists/i.test(m)) return 'That email already has an account. Log in instead.';
    if (/password should be at least|weak password/i.test(m)) return 'Please use a longer password (at least 8 characters).';
    if (/provider is not enabled|unsupported provider/i.test(m)) return 'Google sign-in is not turned on in the database yet.';
    if (/rate limit|too many/i.test(m)) return 'Too many tries. Please wait a minute and try again.';
    if (/failed to fetch|network/i.test(m)) return 'No connection to the database. Check your internet and try again.';
    return m || 'Something went wrong. Please try again.';
  }

  function loadLib() {
    return new Promise((resolve, reject) => {
      if (window.supabase && window.supabase.createClient) return resolve();
      const s = document.createElement('script');
      s.src = CFG.libUrl; if (CFG.libIntegrity) { s.integrity = CFG.libIntegrity; s.crossOrigin = 'anonymous'; }
      s.onload = () => resolve(); s.onerror = () => reject(new Error('Could not load the sign-in library. Check your internet.'));
      document.head.appendChild(s);
    });
  }

  /* ---------- the shared-database adapter (same 3 methods as LocalAdapter in data.js) ---------- */
  const snap = {}; /* last saved copy of every row, per collection, to send only what changed */
  const key = (rec) => JSON.stringify(rec);
  const forSave = (name, rec) => {
    const r = clean(rec);
    if (name === 'bikes' && r.position && r.position.source === 'sim') delete r.position; /* simulator moves are not saved */
    if (name === 'bookings') delete r._hold;
    return r;
  };
  const uuidLike = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
  let queue = Promise.resolve();

  const RemoteAdapter = {
    async loadAll() {
      const st = { users: [], settings: null };
      RECORDS.forEach((c) => { st[c] = []; snap[c] = new Map(); });
      snap.users = new Map(); snap.settings = { public: null, private: null };
      const set = await sb.from('mow_settings').select('id,data');
      if (set.error) throw set.error;
      const pub = (set.data || []).find((r) => r.id === 'public'), prv = (set.data || []).find((r) => r.id === 'private');
      if (pub || prv) st.settings = Object.assign({}, pub && pub.data, prv && prv.data);
      snap.settings = { public: pub ? key(pub.data) : null, private: prv ? key(prv.data) : null };
      if (!profile) { /* visitors: only the public settings (prices, main page texts) and the service areas */
        const locs = await sb.from('mow_records').select('id,data').eq('collection', 'locations');
        if (!locs.error) (locs.data || []).forEach((r) => st.locations.push(Object.assign({}, r.data, { id: r.id })));
        return st;
      }
      const [pr, rec, dis] = await Promise.all([sb.from('mow_profiles').select('*'), sb.from('mow_records').select('collection,id,data'), sb.from('mow_discounts').select('*')]);
      if (pr.error) throw pr.error; if (rec.error) throw rec.error;
      st.discounts = []; snap.discounts = new Map();
      if (!dis.error) (dis.data || []).forEach((d) => { const r = fromDiscount(d); st.discounts.push(r); snap.discounts.set(r.id, key(r)); });
      (pr.data || []).forEach((p) => { const u = toUser(p); st.users.push(u); snap.users.set(u.id, key(u)); });
      (rec.data || []).forEach((r) => {
        if (!st[r.collection]) return;
        const row = Object.assign({}, r.data, { id: r.id });
        st[r.collection].push(row); snap[r.collection].set(r.id, key(forSave(r.collection, row)));
      });
      if (profile.role !== 'admin') { /* other clients' bookings: only which bikes are taken on which days, no names */
        const holds = await sb.rpc('mow_bike_holds');
        if (!holds.error) (holds.data || []).forEach((h) => {
          if (st.bookings.some((b) => b.id === h.id)) return;
          st.bookings.push({ id: h.id, _hold: true, clientId: '', clientName: '', company: '', start: h.start_date, end: h.end_date, bikeIds: h.bike_ids || [], status: h.status, history: [] });
        });
      }
      return st;
    },
    saveCollection(name, all) { queue = queue.then(() => save(name, all)); return queue; },
    async clearAll() { /* the shared database is never wiped from a browser */ }
  };

  /* Discounts (admin price table) live in their own table, mow_discounts (promo codes are not readable by clients). */
  const fromDiscount = (d) => ({ id: d.id, kind: d.kind, min: d.min_count, code: d.code || '', clientId: d.client_id || '', clientEmail: d.client_email || '', pct: +d.pct, label: d.label || '', active: d.active !== false });
  const toDiscount = (r) => ({ id: r.id, kind: r.kind, min_count: r.min == null ? null : Math.round(+r.min), code: r.code || null, client_id: uuidLike(r.clientId) ? r.clientId : null, client_email: (r.clientEmail || '').toLowerCase() || null, pct: +r.pct, label: r.label || '', active: r.active !== false });
  async function saveDiscounts(list) {
    const before = snap.discounts || (snap.discounts = new Map()), seen = new Set(), rows = [];
    (list || []).forEach((r) => { if (!r || !r.id) return; seen.add(r.id); const k = key(fromDiscount(toDiscount(r))); if (before.get(r.id) !== k) rows.push([toDiscount(r), k]); });
    if (rows.length) { const res = await sb.from('mow_discounts').upsert(rows.map((x) => x[0]), { onConflict: 'id' }); if (res.error) throw res.error; rows.forEach(([r, k]) => before.set(r.id, k)); }
    const gone = Array.from(before.keys()).filter((id) => !seen.has(id));
    if (gone.length) { const res = await sb.from('mow_discounts').delete().in('id', gone); if (res.error) throw res.error; gone.forEach((id) => before.delete(id)); }
  }

  async function save(name, all) {
    if (!sb || !profile) return;
    const admin = profile.role === 'admin';
    const names = name === 'all' ? ['settings', 'users', 'discounts'].concat(RECORDS) : [name];
    for (const n of names) {
      if (n === 'settings') { if (admin) await saveSettings(all.settings); continue; }
      if (n === 'discounts') { if (admin) await saveDiscounts(all.discounts); continue; }
      if (n === 'users') { await saveUsers(all.users || [], admin); continue; }
      if (!RECORDS.includes(n) || !Array.isArray(all[n])) continue;
      const before = snap[n] || (snap[n] = new Map());
      const rows = [], seen = new Set();
      all[n].forEach((rec) => {
        if (!rec || !rec.id || rec._hold) return;
        seen.add(rec.id);
        const data = forSave(n, rec), k = key(data);
        if (before.get(rec.id) === k) return;
        if (!admin && n !== 'bookings') return; /* clients only write their own bookings (the database checks this too) */
        const owner = n === 'bookings' ? (uuidLike(rec.clientId) ? rec.clientId : (admin ? null : profile.id)) : null;
        rows.push({ collection: n, id: rec.id, data, owner_id: owner, _k: k });
      });
      if (rows.length) {
        const res = await sb.from('mow_records').upsert(rows.map(({ _k, ...r }) => r), { onConflict: 'collection,id' });
        if (res.error) throw res.error;
        rows.forEach((r) => before.set(r.id, r._k));
      }
      if (admin) {
        const gone = Array.from(before.keys()).filter((id) => !seen.has(id));
        if (gone.length) {
          const res = await sb.from('mow_records').delete().eq('collection', n).in('id', gone);
          if (res.error) throw res.error;
          gone.forEach((id) => before.delete(id));
        }
      }
    }
  }
  async function saveSettings(s) {
    const pub = clean(s || {}), prv = {};
    PRIVATE_SETTINGS.forEach((k) => { if (k in pub) { prv[k] = pub[k]; delete pub[k]; } });
    for (const [id, data] of [['public', pub], ['private', prv]]) {
      const k = key(data); if (snap.settings[id] === k) continue;
      const res = await sb.from('mow_settings').upsert({ id, data }, { onConflict: 'id' });
      if (res.error) throw res.error; snap.settings[id] = k;
    }
  }
  async function saveUsers(users, admin) {
    for (const u of users) {
      if (!uuidLike(u.id)) continue; /* a login can only be made by signing up (or a Supabase invite), not from here */
      const k = key(u); if (snap.users.get(u.id) === k) continue;
      if (!admin && u.id !== profile.id) continue;
      const patch = { name: u.name || '', company: u.company || '', phone: u.phone || '' };
      if (admin) patch.role = u.role;
      const res = await sb.from('mow_profiles').update(patch).eq('id', u.id);
      if (res.error) throw res.error; snap.users.set(u.id, k);
    }
  }

  /* ---------- this-device accounts ---------- */
  const Local = {
    async signIn(email, password) {
      email = email.trim().toLowerCase();
      const u = Data.list('users').find((x) => (x.email || '').toLowerCase() === email);
      if (!u) throw new Error('Email or password is wrong.');
      const ok = u.passwordHash ? (await sha256(u.salt + '|' + password)) === u.passwordHash : (u.password != null && u.password === password);
      if (!ok) throw new Error('Email or password is wrong.');
      return u;
    },
    async signUp({ email, password, name, company, phone }) {
      email = email.trim().toLowerCase();
      if (Data.list('users').some((u) => (u.email || '').toLowerCase() === email)) throw new Error('That email already has an account. Log in instead.');
      const salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
      const role = ADMIN_EMAILS.includes(email) ? 'admin' : 'client';
      const u = Data.put('users', { role, name, company, phone, email, salt, passwordHash: await sha256(salt + '|' + password), createdAt: new Date().toISOString() });
      await Data.flush('users');
      return { user: u };
    }
  };

  /* ---------- public API used by app.js ---------- */
  const Auth = {
    remote: REMOTE,
    googleReady: REMOTE && CFG.google !== false,
    adapter() { return REMOTE ? RemoteAdapter : window.DataLocalAdapter; },
    /* Start: in database mode load supabase-js, finish a Google / email-link sign-in if the URL carries one,
     * and read the signed-in user's profile (created on first sign-in). */
    async init(onSignedOut) {
      if (!REMOTE) return null;
      await loadLib();
      sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'mow-auth' } });
      sb.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') location.hash = '#/newpassword';
        if (event === 'SIGNED_OUT' && profile) { profile = null; if (onSignedOut) onSignedOut(); }
      });
      const { data } = await sb.auth.getSession();
      if (/[?&](code|error)=/.test(location.search)) { /* tidy the address bar after the Google / email redirect */
        const err = new URLSearchParams(location.search).get('error_description');
        history.replaceState(null, '', location.pathname + (location.hash || ''));
        if (err && window.UI) setTimeout(() => UI.toast(friendly(err)), 300);
      }
      if (data && data.session) await Auth.loadProfile(data.session.user);
      return profile ? toUser(profile) : null;
    },
    async loadProfile(user, extra) {
      const meta = (user && user.user_metadata) || {};
      const res = await sb.rpc('mow_ensure_profile', { p_name: (extra && extra.name) || meta.name || meta.full_name || '', p_company: (extra && extra.company) || meta.company || '', p_phone: (extra && extra.phone) || meta.phone || '' });
      if (res.error) throw res.error;
      profile = toUser(Array.isArray(res.data) ? res.data[0] : res.data);
      return profile;
    },
    async signIn(email, password) {
      if (!REMOTE) return Local.signIn(email, password);
      const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(friendly(error));
      await Auth.loadProfile(data.user);
      await Data.init(RemoteAdapter);
      return Data.get('users', profile.id) || profile;
    },
    /* Returns { user } when signed in now, or { confirm: true } when the database wants the email confirmed first. */
    async signUp(info) {
      if (!REMOTE) return Local.signUp(info);
      const { data, error } = await sb.auth.signUp({ email: info.email.trim(), password: info.password,
        options: { emailRedirectTo: siteUrl(), data: { app: 'mediaonwheels', name: info.name, company: info.company, phone: info.phone } } });
      if (error) throw new Error(friendly(error));
      if (!data.session) return { confirm: true };
      await Auth.loadProfile(data.user, info);
      await Data.init(RemoteAdapter);
      return { user: Data.get('users', profile.id) || profile };
    },
    async google() {
      if (!REMOTE) throw new Error('Google sign-in turns on once the database is connected.');
      const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: siteUrl(), queryParams: { prompt: 'select_account' } } });
      if (error) throw new Error(friendly(error));
    },
    async resetPassword(email) {
      if (!REMOTE) throw new Error('Password reset by email works once the database is connected. For now, ask the admin.');
      const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: siteUrl() });
      if (error) throw new Error(friendly(error));
    },
    async setNewPassword(pw) {
      const { data, error } = await sb.auth.updateUser({ password: pw });
      if (error) throw new Error(friendly(error));
      await Auth.loadProfile(data.user); await Data.init(RemoteAdapter);
      return Data.get('users', profile.id) || profile;
    },
    async signOut() {
      const had = profile; profile = null;
      if (REMOTE && sb && had) { try { await sb.auth.signOut(); } catch (e) { /* signed out here anyway */ } await Data.init(RemoteAdapter); }
    },
    async refresh() { if (REMOTE && sb) await Data.init(RemoteAdapter); },
    /* A promo code is checked by the database (clients cannot read the list of codes). Returns the rule or null. */
    async checkPromo(code) {
      if (!REMOTE) return Data.findPromo(code);
      const res = await sb.rpc('mow_check_promo', { p_code: String(code || '').trim() });
      if (res.error) throw new Error(friendly(res.error));
      const row = Array.isArray(res.data) ? res.data[0] : res.data;
      return row ? fromDiscount(row) : null;
    },
    friendly
  };
  window.Auth = Auth;
})();
