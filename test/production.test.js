// Nov 8 2026 production prep: no demo members, real sign-in (Supabase) with a this-device fallback, SEO files.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const site = fs.existsSync(path.join(__dirname, '..', 'site')) ? path.join(__dirname, '..', 'site') : path.join(__dirname, '..', 'docs');
const read = (p) => fs.readFileSync(path.join(site, p), 'utf8');
const root = path.join(__dirname, '..');

test('no demo members or demo logins anywhere the app runs', () => {
  const app = read('js/app.js');
  for (const s of ['Demo logins', 'data-demo', 'admin123', 'client123', '@bikeads.demo', 'demoDeliver']) assert.ok(!app.includes(s), 'app.js still has ' + s);
  const data = read('js/data.js');
  for (const s of ['@bikeads.demo', 'admin123', 'Moshe Weiss', 'Shmuel Green', 'Yossi Katz', 'Fresh Basket Grocery', 'DS.addTo(']) assert.ok(!data.includes(s), 'data.js still seeds ' + s);
  assert.match(read('js/deliver-seed.js'), /function addSettings/);
});

test('a fresh device starts empty: no members, bookings, money records, stores or drivers', async () => {
  const store = {};
  const win = { localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } };
  const ctx = { window: win, localStorage: win.localStorage, console };
  ctx.window.window = ctx.window; vm.createContext(ctx);
  vm.runInContext(read('js/deliver-seed.js'), ctx); vm.runInContext(read('js/data.js'), ctx);
  const Data = ctx.window.Data; await Data.init();
  for (const c of ['users', 'bookings', 'transactions', 'stores', 'drivers', 'orders', 'bikes']) assert.strictEqual(Data.list(c).length, 0, c);
  assert.strictEqual(Data.list('locations').map((l) => l.name).join(','), 'Williamsburg,Borough Park');
  assert.strictEqual(Data.settings().pricesAreSamples, false, 'real prices, no sample note');
  assert.strictEqual(Data.settings().setupFeePerBike, 150); assert.strictEqual(Data.settings().weeklyPerBike, 75); assert.strictEqual(Data.settings().minBikes, 5);
  assert.strictEqual(Data.mode(), 'device');
});

test('config has clearly named, EMPTY Supabase placeholders and no secret key', () => {
  const ctx = { window: {} }; vm.runInNewContext(read('js/config.js'), ctx);
  assert.strictEqual(ctx.window.SUPABASE.SUPABASE_URL, ''); assert.strictEqual(ctx.window.SUPABASE.SUPABASE_ANON_KEY, '');
  assert.match(ctx.window.SUPABASE.libUrl, /^https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2\.\d+\.\d+\//);
  assert.match(ctx.window.SUPABASE.libIntegrity, /^sha384-/);
  assert.strictEqual(Array.from(ctx.window.SITE.adminEmails).join(','), 'david7578433@gmail.com');
  for (const f of ['js/config.js', 'js/auth.js', 'js/app.js']) assert.ok(!/sb_secret_|eyJhbGciOi/.test(read(f).replace(/\/\*[\s\S]*?\*\//g, '')), f + ' has no secret');
});

test('sign-in screen: email + password and Continue with Google', () => {
  const app = read('js/app.js'), auth = read('js/auth.js');
  for (const s of ['Continue with Google', 'Sign up with Google', 'Google sign-in is not configured yet', 'loginform', 'renderSignup', 'renderForgot', 'renderNewPassword', 'Forgot password?']) assert.ok(app.includes(s), s);
  for (const s of ["signInWithOAuth({ provider: 'google'", 'signInWithPassword', "flowType: 'pkce'", 'mow_ensure_profile', 'mow_bike_holds', 'resetPasswordForEmail', "app: 'mediaonwheels'"]) assert.ok(auth.includes(s), s);
  const html = read('index.html');
  assert.ok(html.indexOf('js/auth.js') > html.indexOf('js/data.js') && html.indexOf('js/auth.js') < html.indexOf('js/app.js'), 'auth.js loads between data.js and app.js');
  assert.match(read('sw.js'), /js\/auth\.js/);
});

test('this-device accounts: salted hash, admin only for the admin email, wrong password refused', async () => {
  const store = {};
  const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const win = { localStorage: ls, location: { origin: 'https://x', pathname: '/' }, SUPABASE: { SUPABASE_URL: '', SUPABASE_ANON_KEY: '' }, SITE: { adminEmails: ['david7578433@gmail.com'] } };
  const ctx = { window: win, localStorage: ls, console, crypto: crypto.webcrypto, TextEncoder, location: win.location };
  win.window = win; vm.createContext(ctx);
  vm.runInContext(read('js/deliver-seed.js'), ctx); vm.runInContext(read('js/data.js'), ctx); vm.runInContext(read('js/auth.js'), ctx);
  ctx.Data = win.Data; const Auth = win.Auth; await win.Data.init(Auth.adapter());
  assert.strictEqual(Auth.remote, false); assert.strictEqual(Auth.googleReady, false);
  const a = (await Auth.signUp({ email: 'David7578433@gmail.com', password: 'pass-1234', name: 'David', company: 'MoW', phone: '' })).user;
  assert.strictEqual(a.role, 'admin'); assert.ok(!('password' in a) && a.passwordHash && a.salt);
  const c = (await Auth.signUp({ email: 'shop@example.com', password: 'pass-5678', name: 'Shop', company: 'Shop', phone: '' })).user;
  assert.strictEqual(c.role, 'client');
  await assert.rejects(Auth.signUp({ email: 'shop@example.com', password: 'x', name: '', company: '', phone: '' }), /already has an account/);
  assert.strictEqual((await Auth.signIn('david7578433@gmail.com', 'pass-1234')).id, a.id);
  await assert.rejects(Auth.signIn('david7578433@gmail.com', 'nope'), /wrong/);
  await assert.rejects(Auth.signIn('admin@bikeads.demo', 'admin123'), /wrong/);
  assert.ok(!store['mow.prod.v2'].includes('pass-1234'), 'no plain password saved');
});

test('database mode (mocked Supabase): loads with RLS-shaped answers, saves only what changed, never sim positions', async () => {
  const db = { settings: [{ id: 'public', data: { weeklyPerBike: 150, setupFeePerBike: 75, version: 1, businessName: 'Media on Wheels' } }],
    records: [{ collection: 'locations', id: 'loc_wburg', data: { name: 'Williamsburg' } }, { collection: 'bikes', id: 'b1', data: { number: '01' } },
      { collection: 'bookings', id: 'bk1', data: { clientId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', status: 'pending', start: '2026-11-10', end: '2026-11-12', bikeIds: ['b1'] }, owner_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }] };
  const log = [];
  const me = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', email: 'shop@example.com', name: 'Shop', company: 'Shop', phone: '', role: 'client' };
  const q = (table) => {
    const st = { table, filters: [] };
    const run = () => {
      if (st.op === 'upsert') { log.push(['upsert', table, st.rows]); return { data: null, error: null }; }
      if (st.op === 'delete') { log.push(['delete', table, st.filters]); return { data: null, error: null }; }
      if (st.op === 'update') { log.push(['update', table, st.patch]); return { data: null, error: null }; }
      if (table === 'mow_settings') return { data: db.settings, error: null };
      if (table === 'mow_profiles') return { data: [me], error: null };
      if (table === 'mow_records') return { data: db.records.filter((r) => st.filters.every(([k, v]) => r[k] === v)), error: null };
      return { data: [], error: null };
    };
    const api = { select() { return api; }, eq(k, v) { st.filters.push([k, v]); return api; }, in(k, v) { st.filters.push([k, v]); return api; },
      upsert(rows) { st.op = 'upsert'; st.rows = rows; return api; }, delete() { st.op = 'delete'; return api; }, update(p) { st.op = 'update'; st.patch = p; return api; },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); } };
    return api;
  };
  const sb = { from: q, rpc: async (fn) => fn === 'mow_ensure_profile' ? { data: [me], error: null } : { data: [{ id: 'other', start_date: '2026-11-11', end_date: '2026-11-20', bike_ids: ['b1'], status: 'approved' }], error: null },
    auth: { onAuthStateChange() {}, getSession: async () => ({ data: { session: { user: { id: me.id, user_metadata: {} } } } }) } };
  const store = {};
  const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const win = { localStorage: ls, location: { origin: 'https://x', pathname: '/', search: '', hash: '' }, history: { replaceState() {} },
    SUPABASE: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-anon-key', google: true }, SITE: { adminEmails: [] }, supabase: { createClient: () => sb } };
  const ctx = { window: win, localStorage: ls, console, crypto: crypto.webcrypto, TextEncoder, location: win.location, history: win.history, URLSearchParams };
  win.window = win; vm.createContext(ctx);
  vm.runInContext(read('js/deliver-seed.js'), ctx); vm.runInContext(read('js/data.js'), ctx); vm.runInContext(read('js/auth.js'), ctx);
  const Data = win.Data, Auth = win.Auth; ctx.Data = Data;
  const u = await Auth.init(); assert.strictEqual(u.role, 'client'); assert.strictEqual(Auth.googleReady, true);
  await Data.init(Auth.adapter()); assert.strictEqual(Data.mode(), 'database');
  assert.strictEqual(Data.list('bookings').length, 2, 'own booking + one anonymous hold');
  const hold = Data.list('bookings').find((b) => b._hold); assert.strictEqual(hold.clientName, ''); assert.ok(Data.busyBikeIds('2026-11-15', '2026-11-16').has('b1'), 'other client hold blocks the bike');
  Data.put('bikes', { id: 'b1', position: { lat: 1, lng: 2, source: 'sim' } }, { silent: true }); await Data.flush('bikes');
  assert.strictEqual(log.length, 0, 'simulated bike moves are not saved');
  await Data.put('bookings', { id: 'bk1', status: 'cancelled' }); await Data.flush('bookings');
  const ups = log.filter((l) => l[0] === 'upsert' && l[1] === 'mow_records');
  assert.ok(ups.length >= 1); assert.strictEqual(ups[0][2].length, 1, 'only the changed booking is sent'); assert.strictEqual(ups[0][2][0].data.status, 'cancelled');
  assert.strictEqual(ups[0][2][0].owner_id, me.id); assert.ok(!log.some((l) => l[0] === 'delete'), 'a client never deletes');
  assert.ok(!log.some((l) => l[1] === 'mow_settings'), 'a client never writes settings');
});

test('schema.sql: mow_ prefixed, additive only, RLS on, David admin, trigger + ensure function', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase', 'schema.sql'), 'utf8');
  const code = sql.replace(/--.*$/gm, '');
  assert.ok(!/\bdrop\b/i.test(code), 'no DROP');
  (code.match(/alter table\s+[\w.]+/gi) || []).forEach((m) => assert.match(m, /public\.mow_/i, m));
  (code.match(/create (?:table|or replace function|policy|index)(?: if not exists)?\s+(?:public\.)?(\w+)/gi) || []).forEach((m) => assert.match(m, /mow_/i, m));
  for (const t of ['mow_profiles', 'mow_settings', 'mow_records', 'mow_admin_emails', 'mow_discounts']) assert.match(code, new RegExp('alter table public\\.' + t + '\\s+enable row level security'), t + ' RLS');
  assert.match(code, /'david7578433@gmail\.com'/); assert.match(code, /create trigger mow_on_auth_user_created after insert on auth\.users/);
  assert.match(code, /function public\.mow_ensure_profile/); assert.match(code, /function public\.mow_check_promo/); assert.match(code, /function public\.mow_bike_holds/);
  assert.ok(fs.existsSync(path.join(root, 'supabase', 'MOVE.md')), 'MOVE.md');
  assert.ok(fs.existsSync(path.join(root, 'PRODUCTION.md')), 'PRODUCTION.md');
});

test('Google search: title, description, canonical, Open Graph, JSON-LD, robots, sitemap, favicon, Search Console placeholder', () => {
  const html = read('index.html');
  assert.match(html, /<title>Media on Wheels/); assert.match(html, /<meta name="description" content="[^"]{60,160}">/);
  for (const s of ['rel="canonical"', 'og:title', 'og:description', 'og:image', 'og:url', 'twitter:card', 'google-site-verification']) assert.ok(html.includes(s), s);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const types = ld['@graph'].map((x) => x['@type']); for (const t of ['LocalBusiness', 'Service', 'WebSite']) assert.ok(types.includes(t), t);
  const txt = JSON.stringify(ld); assert.match(txt, /Williamsburg/); assert.match(txt, /Boro Park/); assert.match(txt, /6 days a week/); assert.match(txt, /Shabbos/);
  assert.match(read('robots.txt'), /Sitemap: https:\/\/.+\/sitemap\.xml/);
  assert.match(read('sitemap.xml'), /<loc>https:\/\/mediaonwheelsnyc\.com\/<\/loc>/); assert.match(html, /<link rel="canonical" href="https:\/\/mediaonwheelsnyc\.com\/">/);
  assert.ok(!fs.existsSync(path.join(site, 'CNAME')), 'no CNAME until the domain DNS exists');
  for (const f of ['favicon.svg', 'favicon.ico', 'media/og-image.jpg']) assert.ok(fs.existsSync(path.join(site, f)), f);
  assert.ok(!/whatsapp|facebook\.com|instagram\.com|twitter\.com\/|google-analytics|googletagmanager/i.test(html), 'no social links or other trackers');
});

test('client booking: minimum 5 bikes, map preview taken off the "Your business" step', () => {
  const c = read('js/client.js');
  assert.match(c, /const MIN_BIKES = \(\) =>/); assert.match(c, /Minimum ' \+ MIN_BIKES\(\) \+ ' bikes/);
  assert.match(c, /count: 5,/); assert.match(c, /wiz\.count <= MIN_BIKES\(\)/); assert.match(c, /A booking is at least ' \+ MIN_BIKES\(\)/);
  assert.ok(!c.includes("rideCard('Your ad riding in Williamsburg')"), 'no ride preview on step 1');
  assert.match(c, /function rideCard/); // kept in the code
  assert.match(read('js/admin.js'), /name="minBikes"/);
});

test('clean client calendar: no holiday labels or list, Shabbos blocked, Hebrew date kept', () => {
  const c = read('js/client.js'), u = read('js/ui.js');
  assert.match(c, /holidays: false, labels: false/); assert.match(c, /\|\| isShabbos\(ds\)/);
  assert.match(u, /ev && o\.labels !== false \?/); assert.match(u, /cal-hd/);
});

test('price step: discounts from the admin price table, 20% deposit now, balance later', async () => {
  const store = {};
  const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const ctx = { window: { localStorage: ls }, localStorage: ls, console }; ctx.window.window = ctx.window; vm.createContext(ctx);
  vm.runInContext(read('js/data.js'), ctx);
  const Data = ctx.window.Data; await Data.init();
  const st = Data.addDays(Data.today(), 30), wk1 = Data.addDays(st, 6), wk4 = Data.addDays(st, 27);
  let q = Data.priceQuote(5, st, wk1);
  assert.strictEqual(q.total, 1125); assert.strictEqual(q.depositPct, 20); assert.strictEqual(q.deposit, 225); assert.strictEqual(q.balance, 900); assert.strictEqual(q.discounts.length, 0);
  Data.put('discounts', { kind: 'bikes', min: 10, pct: 10, active: true });
  Data.put('discounts', { kind: 'bikes', min: 20, pct: 15, active: true });
  Data.put('discounts', { kind: 'weeks', min: 4, pct: 5, active: true, label: 'Long campaign' });
  Data.put('discounts', { kind: 'promo', code: 'SPRING', pct: 10, active: true });
  Data.put('discounts', { kind: 'client', clientEmail: 'shop@example.com', pct: 3, active: true });
  assert.strictEqual(Data.priceQuote(5, st, wk1).discounts.length, 0, '5 bikes, 1 week: no discount');
  q = Data.priceQuote(10, st, wk4); // 10 bikes x 4 weeks: 1500 + 3000 = 4500, 10% + 5% = 15% off
  assert.strictEqual(q.subtotal, 4500); assert.strictEqual(q.discount, 675); assert.strictEqual(q.total, 3825); assert.strictEqual(q.deposit, 765); assert.strictEqual(q.balance, 3060);
  assert.strictEqual(Data.priceQuote(20, st, wk1).discounts[0].pct, 15, 'the biggest bikes discount counts');
  const promo = Data.findPromo('spring'); assert.ok(promo); assert.strictEqual(Data.findPromo('nope'), null);
  q = Data.priceQuote(5, st, wk1, { promo, client: { id: 'x', email: 'Shop@Example.com' } });
  assert.strictEqual(q.discounts.length, 2); assert.strictEqual(q.discount, 146.25); assert.strictEqual(q.total, 978.75);
  Data.saveSettings({ depositPct: 50 }); assert.strictEqual(Data.priceQuote(5, st, wk1).deposit, 562.5);
  const a = read('js/admin.js'), c = read('js/client.js');
  for (const s of ['Price table &amp; discounts', 'data-ddel', 'Promo code', 'One client', 'Mark balance paid', 'Deposit due at booking (%)']) assert.ok(a.includes(s), s);
  for (const s of ['Deposit due now (', 'Balance later', 'Promo code (optional)', 'Pay deposit ', 'Auth.checkPromo']) assert.ok(c.includes(s), s);
});

test('client confirmation and My bookings show the bike count, not bike numbers', () => {
  const c = read('js/client.js');
  assert.ok(!c.includes("' (' + b.bikeIds.map(Data.bikeLabel).join(', ') + ')</dd>'"), 'no numbers on Booking confirmed');
  assert.ok(!c.includes("' bikes: ' + b.bikeIds.map(Data.bikeLabel)"), 'no numbers in My bookings');
  assert.match(c, /'<dt>Bikes<\/dt><dd>' \+ b\.bikeIds\.length \+ '<\/dd>'/);
  assert.match(read('js/admin.js'), /b\.bikeIds\.map\(Data\.bikeLabel\)/, 'admin still sees bike numbers');
});
