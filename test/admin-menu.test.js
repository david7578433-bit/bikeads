// Nov 8 2026, David: "build me an admin menu that's comfortable, nice, user-friendly, and where I can do everything".
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const site = path.join(__dirname, '..', 'docs');
const read = (p) => fs.readFileSync(path.join(site, p), 'utf8');

function boot() {
  const store = {};
  const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const win = { localStorage };
  const ctx = { window: win, localStorage, console, Date, Math, JSON, setTimeout, clearTimeout, Promise };
  win.window = win; vm.createContext(ctx);
  vm.runInContext(read('js/data.js'), ctx);
  vm.runInContext('var Data = window.Data;', ctx);
  vm.runInContext(read('js/settings.js'), ctx);
  return { win, ctx, store };
}

test('admin menu: every section David asked for is in the menu, older pages kept', () => {
  const m = read('js/admin-menu.js');
  for (const k of ['dashboard', 'bookings', 'bikes', 'clients', 'inbox', 'pricing', 'calendar', 'content', 'appearance', 'form', 'messages', 'switches', 'seo', 'email', 'invoice', 'account', 'map', 'books', 'settings'])
    assert.match(m, new RegExp("key: '" + k + "'"), k);
  assert.match(m, /const BOTTOM = \['dashboard', 'bookings', 'inbox', 'bikes'\]/, 'phone bottom bar + Menu');
  assert.match(m, /Find a setting/, 'search box');
  const html = read('index.html');
  for (const f of ['js/settings.js', 'js/admin-forms.js', 'js/admin-menu.js', 'js/mailer.js', 'admin.css']) assert.match(html, new RegExp(f.replace('.', '\\.') + '\\?v=1[6-9]'), f);
  assert.ok(html.indexOf('js/admin-menu.js') > html.indexOf('js/admin.js') && html.indexOf('js/admin-menu.js') < html.indexOf('js/platform.js'), 'menu loads after admin.js, before the Deliver plugin');
  assert.ok(html.indexOf('js/settings.js') > html.indexOf('js/data.js'));
  assert.match(read('sw.js'), /bikeads-v1[6-9]/);
  assert.match(read('sw.js'), /"js\/admin-menu\.js"/);
});

test('settings: defaults match today\'s real prices and rules', async () => {
  const { win } = boot();
  await win.Data.init(win.DataLocalAdapter);
  const S = win.SiteSettings;
  assert.strictEqual(S.get('setupFeePerBike'), 150); assert.strictEqual(S.get('weeklyPerBike'), 75);
  assert.strictEqual(S.get('depositPct'), 20); assert.strictEqual(S.get('minBikes'), 5);
  assert.strictEqual(S.get('featureDelivery'), false, 'delivery business stays OFF');
  assert.strictEqual(S.get('show.bookingMap'), false, 'booking map card stays off');
  assert.deepStrictEqual(Array.from(S.areas()), ['Williamsburg', 'Boro Park']);
  const fonts = S.SECTIONS.find((s) => s.key === 'appearance').fields.filter((f) => f.type === 'select' && /font/i.test(f.k));
  fonts.forEach((f) => f.options.forEach(([v]) => assert.ok(['Plus Jakarta Sans', 'Heebo', 'DM Serif Display', 'system'].includes(v), 'free/OFL font only: ' + v)));
  const all = JSON.stringify(S.SECTIONS);
  assert.ok(!/whatsapp|facebook|instagram/i.test(all), 'no WhatsApp/social links');
  assert.match(all, /mediaonwheelsnyc\.com/, 'canonical address named, not editable');
});

test('changing the weekly price in the admin menu changes the client price summary', async () => {
  const { win } = boot();
  await win.Data.init(win.DataLocalAdapter);
  const D = win.Data, S = win.SiteSettings;
  const start = '2026-11-15', end = D.addDays(start, 6);
  assert.strictEqual(D.priceQuote(10, start, end).weekly, 750);
  const prev = await S.set('weeklyPerBike', 90);
  assert.strictEqual(prev, 75, 'returns the old value for Undo');
  const q = D.priceQuote(10, start, end);
  assert.strictEqual(q.weekly, 900); assert.strictEqual(q.total, 2400); assert.strictEqual(q.deposit, 480);
  await S.set('depositPct', 250); assert.strictEqual(S.get('depositPct'), 100, 'clamped to 100%');
  await S.reset('depositPct'); assert.strictEqual(S.get('depositPct'), 20, 'reset to default');
  await S.set('homeContent.headline', 'New headline');
  assert.strictEqual(D.settings().homeContent.headline, 'New headline', 'nested text saved inside homeContent');
  assert.ok(D.settings().settingsUpdatedAt, 'change time recorded');
});

test('promo codes can expire; blocked days and lead time; inactive bikes are not offered', async () => {
  const { win } = boot();
  await win.Data.init(win.DataLocalAdapter);
  const D = win.Data, S = win.SiteSettings;
  D.put('discounts', { kind: 'promo', code: 'OLD', pct: 10, active: true, expires: '2020-01-01' });
  D.put('discounts', { kind: 'promo', code: 'NEW', pct: 10, active: true, expires: '2099-01-01' });
  assert.strictEqual(D.findPromo('old'), null, 'expired code refused');
  assert.ok(D.findPromo('new'), 'code before its end date works');
  await S.set('blockedDates', [{ date: '2026-12-01', note: 'x' }]);
  assert.ok(S.blocked('2026-12-01')); assert.ok(!S.blocked('2026-12-02'));
  await S.set('leadDays', 2); assert.strictEqual(S.earliest(), D.addDays(D.today(), 2));
  D.put('bikes', { number: '1', locationId: 'loc_wburg' }); const b2 = D.put('bikes', { number: '2', locationId: 'loc_wburg', active: false });
  const free = D.freeBikes('2026-12-02', '2026-12-08').map((b) => b.number);
  assert.deepStrictEqual(Array.from(free), ['1'], 'inactive bike #2 is not offered');
  assert.ok(b2);
});

test('the site reads the settings: client form, calendar, messages, main page, colors', () => {
  const c = read('js/client.js'), h = read('js/home.js'), a = read('js/app.js'), s = read('js/settings.js');
  assert.match(c, /SiteSettings\.field\(id\)/, 'booking form boxes');
  assert.match(c, /SiteSettings\.blocked\(ds\)/); assert.match(c, /SiteSettings\.earliest\(\)/); assert.match(c, /SSET\('weeksMin'/);
  assert.match(c, /SiteSettings\.text\(isReq \? 'msgRequest' : b && b\.payment && b\.payment\.method === 'zelle' \? 'msgDoneZelle' : 'msgDone'\)/);
  assert.match(h, /SiteSettings\.get\('howSteps'\)/); assert.match(h, /function faq\(\)/); assert.match(h, /footerText/);
  assert.match(a, /SiteSettings\.apply\(\)/);
  assert.match(s, /--brand:/); assert.match(s, /mow-dark/); assert.match(s, /hide-sec-/); assert.match(s, /mow-maint/);
  assert.match(read('admin.css'), /html\.hide-sec-reach #reach/);
  assert.match(read('js/config.js'), /mow\.features/, 'delivery switch read when the site opens');
});

test('bikes: add many at once (15), select several, active/inactive, tracker still optional', () => {
  const m = read('js/admin-menu.js'), a = read('js/admin.js');
  assert.match(m, /Add many bikes/); assert.match(m, /This will add ' \+ p\.n \+ ' bike/); assert.match(m, /trackerId: ''/);
  for (const k of ['data-bulk="on"', 'data-bulk="off"', 'data-bulk="del"', 'bulk-area']) assert.ok(m.includes(k), k);
  assert.match(a, /Active \(clients can book this bike\)/); assert.match(a, /Tracker ID \(IMEI\) \(optional\)/);
});

test('database: migration is idempotent, touches only mow_ objects, no secrets in the repo', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261108_admin_menu.sql'), 'utf8');
  assert.match(sql, /add column if not exists updated_by/); assert.match(sql, /add column if not exists expires_on/); assert.match(sql, /add column if not exists disabled/);
  assert.match(sql, /create or replace view public\.mow_settings_public with \(security_invoker = true\)/);
  const code = sql.replace(/--[^\n]*/g, '');
  const names = code.match(/(?:create (?:or replace )?(?:table|view|function|trigger)|alter table)\s+(?:if not exists\s+)?(?:public\.)?[a-z_]+(?=[\s(])/gi) || [];
  assert.ok(names.length >= 6, 'found ' + names.length);
  names.forEach((n) => assert.match(n, /mow_/i, n));
  for (const f of ['js/config.js', 'js/settings.js', 'js/admin-menu.js', 'js/admin-forms.js']) assert.ok(!/sb_secret_|service_role|eyJhbGciOi/.test(read(f).replace(/\/\*[\s\S]*?\*\//g, '')), f);
});
