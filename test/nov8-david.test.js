// Nov 8 2026, David (4:37–4:48 PM PT): normal calendar, "Leave feedback", "Request a call", and the 6 follow-ups
// (bike stepper, no "Client" badge, booking map card off, tracker optional, Book bikes only when signed in, Videos off).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const site = fs.existsSync(path.join(__dirname, '..', 'site')) ? path.join(__dirname, '..', 'site') : path.join(__dirname, '..', 'docs');
const read = (p) => fs.readFileSync(path.join(site, p), 'utf8');
const root = path.join(__dirname, '..');

function loadCal(today) {
  const win = { Data: { today: () => today } };
  const doc = { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
  const ctx = { window: win, document: doc, console, Date, Math, JSON, Intl };
  win.window = win; win.document = doc; vm.createContext(ctx);
  vm.runInContext('var Data = window.Data;', ctx);
  vm.runInContext(read('vendor/hebcal/hebcal.min.js') + '\n;window.hebcal = hebcal;', ctx);
  vm.runInContext(read('js/jcal.js'), ctx);
  vm.runInContext(read('js/ui.js'), ctx);
  return win;
}

test('calendar is a normal calendar: no holiday list or legend, a tiny dot on holidays, one small line', () => {
  const w = loadCal('2026-11-08');
  const J = w.JCal, UI = w.UI;
  const rc = ['2026-11-10', '2026-11-11'].filter((d) => J.day(d).events.some((e) => e.kind === 'rc'));
  assert.ok(rc.length >= 1, 'Rosh Chodesh Kislev is in November 2026');
  for (const opts of [{}, { holidays: false, labels: false }]) {
    const html = UI.calendarHtml(2026, 10, opts);
    assert.ok(!/hol-list|cal-legend|class="cal-hol/.test(html), 'no holiday list, legend or big labels');
    const dots = (html.match(/<span class="cal-dot"/g) || []).length;
    assert.ok(dots >= rc.length && dots <= 6, 'a few tiny dots, got ' + dots);
    const cell = html.slice(html.indexOf('data-date="' + rc[0] + '"'), html.indexOf('data-date="' + rc[0] + '"') + 900);
    assert.match(cell.slice(0, cell.indexOf('</div>')), /cal-dot/, 'the Rosh Chodesh day has the dot');
    assert.ok(!/Today is a holiday|This day is a holiday/.test(html), 'Nov 8 is not a holiday: no line');
  }
  const picked = UI.calendarHtml(2026, 10, { rangeStart: rc[0], rangeEnd: rc[0] });
  assert.match(picked, /<p class="cal-note">.*This day is a holiday \(Rosh Chodesh/);
  assert.strictEqual((picked.match(/cal-note/g) || []).length, 1, 'one small line only');
  const onHoliday = loadCal(rc[0]).UI.calendarHtml(2026, 10, {});
  assert.match(onHoliday, /Today is a holiday \(Rosh Chodesh/);
  // Shabbos and the free-bike counts are unchanged (client.js)
  const c = read('js/client.js'); assert.match(c, /\|\| isShabbos\(ds\)/); assert.match(c, /Data\.freeBikes\(ds, ds\)/);
});

test('"Leave feedback": website stars + comment AND our service stars + comment, optional name/email, saved, admin reads it', async () => {
  const f = read('js/feedback.js'), html = read('index.html'), sw = read('sw.js');
  assert.match(html, /js\/feedback\.js\?v=(1[5-9]|[2-9]\d)/); assert.match(sw, /"js\/feedback\.js"/);
  for (const s of ['Leave feedback', 'The website', 'Our service', 'How good are we?', "starsInput('site'", "starsInput('service'", 'name="siteComment"', 'name="serviceComment"', 'Your name (optional)', 'Email (optional)']) assert.ok(f.includes(s), s);
  assert.match(f, /for \(let i = 5; i >= 1; i--\)/, 'stars 1 to 5');
  // this-device mode: saved in the feedback collection
  const store = {};
  const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const ctx = { window: { localStorage: ls }, localStorage: ls, console }; ctx.window.window = ctx.window; vm.createContext(ctx);
  vm.runInContext(read('js/data.js'), ctx);
  const Data = ctx.window.Data; await Data.init();
  assert.strictEqual(Data.list('feedback').length, 0); assert.strictEqual(Data.list('callRequests').length, 0);
  // the module itself, with a tiny UI / Auth stand-in
  const win = ctx.window; win.UI = { esc: (s) => String(s), $: () => null, $$: () => [], toast() {}, modal() {}, closeModal() {} };
  win.Auth = { remote: false }; win.document = { addEventListener() {} }; ctx.document = win.document; ctx.UI = win.UI; ctx.Auth = win.Auth; ctx.Data = Data;
  vm.runInContext(f, ctx);
  await win.Inbox.sendFeedback({ siteStars: 4, siteComment: 'Easy', serviceStars: 5, serviceComment: 'Great', name: 'A', email: '', createdAt: new Date().toISOString() });
  await win.Inbox.sendCallRequest({ name: 'Moshe', phone: '718 555 0100', bestTime: 'after 2', note: '', called: false, createdAt: new Date().toISOString() });
  assert.strictEqual(Data.list('feedback').length, 1); assert.strictEqual(Data.list('feedback')[0].serviceStars, 5);
  assert.strictEqual(win.Inbox.waiting(), 1);
  const id = Data.list('callRequests')[0].id; await win.Inbox.setCalled(id, true);
  assert.strictEqual(Data.get('callRequests', id).called, true); assert.strictEqual(win.Inbox.waiting(), 0);
  assert.ok(JSON.parse(store['mow.prod.v2']).feedback.length === 1, 'kept in this browser');
  // admin Inbox tab with both lists; no public display
  const admin = read('js/admin.js'); assert.match(admin, /key: 'inbox', label: 'Inbox'/); assert.match(f, /Call requests/); assert.match(f, /Mark called/); assert.match(f, /never shown on the website/);
  assert.ok(!read('js/home.js').includes("Data.list('feedback')"), 'feedback is never shown on the main page');
});

test('"Request a call": name + phone required, best time + note optional; buttons on the main page, contact area, footer, client pages, after a booking', () => {
  const f = read('js/feedback.js'), home = read('js/home.js'), app = read('js/app.js'), client = read('js/client.js');
  for (const s of ['Request a call', 'Your name', 'Phone number', 'Best time to call (optional)', 'Short note (optional)', 'Please type your phone number.']) assert.ok(f.includes(s), s);
  /* Nov 8 2026 5:13 PM (David): "Take down 'Request a Call.' Put 'Contact Us'… also an option to request the call" — the call-back form stays, behind Contact us */
  assert.match(home, /lnav-call" data-contact="home-header"/); assert.match(home, /data-contact="home-contact"/); assert.match(home, /data-contact="home-footer"/); assert.match(home, /data-feedback="home"/);
  assert.match(f, /function openContact\(/); assert.match(f, /Request a call back/); assert.match(f, /openCallRequest\(\{ source: \(opts\.source \|\| 'site'\) \+ '-contact' \}\)/);
  assert.ok(!/>Request a call<\/button>/.test(home), 'no "Request a call" button on the main page');
  assert.match(app, /role === 'client' && window\.Inbox/); assert.match(client, /data-feedback="booking"/);
  assert.ok(!/sms:|fetch\(/.test(f), 'nothing sends texts; mailto/tel links only open the phone\'s own apps');
});

test('database: mow_feedback and mow_call_requests with RLS — anyone inserts, only the admin reads (and marks called)', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase', 'schema.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.mow_feedback/); assert.match(sql, /create table if not exists public\.mow_call_requests/);
  assert.match(sql, /alter table public\.mow_feedback\s+enable row level security/); assert.match(sql, /alter table public\.mow_call_requests enable row level security/);
  assert.match(sql, /mow_feedback_insert on public\.mow_feedback for insert to anon, authenticated/);
  assert.match(sql, /mow_feedback_admin_read on public\.mow_feedback for select to authenticated using \(public\.mow_is_admin\(\)\)/);
  assert.match(sql, /mow_call_requests_admin_update on public\.mow_call_requests for update to authenticated using \(public\.mow_is_admin\(\)\)/);
  assert.ok(!/for select to anon[^;]*mow_(feedback|call_requests)|mow_(feedback|call_requests)[^;]*for select to anon/.test(sql), 'visitors cannot read them');
  assert.match(sql, /grant insert on public\.mow_feedback to anon, authenticated;/);
  assert.ok(!/grant select[^;]*mow_feedback to anon/.test(sql));
  const auth = read('js/auth.js');
  assert.match(auth, /from\('mow_feedback'\)\.insert/); assert.match(auth, /from\('mow_call_requests'\)\.insert/); assert.match(auth, /from\('mow_call_requests'\)\.update/);
  assert.match(auth, /profile\.role === 'admin'\) \{ \/\* Nov 8 2026/);
});

test('bike stepper: no "Minimum 5 bikes" line, + goes up to 10 and more, the number can be typed, − stops at the minimum', () => {
  const c = read('js/client.js');
  const dates = c.slice(c.indexOf('function renderDates'), c.indexOf('function priceTable'));
  assert.ok(!dates.includes('minNote()'), 'no minimum line on the dates step');
  assert.ok(!c.slice(c.indexOf('function renderPrice'), c.indexOf('/* ---- step 4')).includes('minNote()'), 'none on the price step');
  assert.match(dates, /<input id="cnt" type="number" inputmode="numeric"/);
  assert.match(dates, /id="plus" aria-label="One bike more"' \+ \(wiz\.count >= MAX_BIKES/);
  assert.match(dates, /id="minus" aria-label="One bike less"' \+ \(wiz\.count <= MIN_BIKES\(\)/);
  assert.match(dates, /wiz\.count <= free\.length \? '' : ' disabled'/, 'Confirm waits when more bikes are asked for than are free');
  const ctx = { window: { Data: { settings: () => ({ minBikes: 5 }) } } }; vm.createContext(ctx);
  const clamp = vm.runInContext('(function(){ const Data = window.Data; ' + c.match(/const MIN_BIKES = [^\n]*\n/)[0] + c.match(/const MAX_BIKES = [^\n]*\n/)[0] + c.match(/const clampCount = [^\n]*\n/)[0] + 'return clampCount; })()', ctx);
  assert.strictEqual(clamp(10), 10); assert.strictEqual(clamp(3), 5); assert.strictEqual(clamp(''), 5); assert.strictEqual(clamp(6), 6);
  assert.match(read('light.css'), /\.stepper button:not\(:disabled\) \{ background: var\(--ink\); color: #fff; \}/);
});

test('header: no "Client" badge (Admin keeps it); booking map card off; Home link for signed-in clients', () => {
  const app = read('js/app.js'), c = read('js/client.js');
  assert.match(app, /role === 'client' \? '' : '<span class="role-pill/); assert.match(app, /href="#\/home" id="gohome">Home</);
  const dates = c.slice(c.indexOf('function renderDates'), c.indexOf('function priceTable'));
  /* the card is off; since the Nov 8 admin menu it comes back only through Admin → Switches (default off) */
  assert.ok(!dates.includes("rideCard(") && !dates.includes('mountRide(root)'), 'no "More bikes, more streets" map card');
  const det = c.slice(c.indexOf('function renderDetails'), c.indexOf('function renderDates'));
  assert.ok(!/[^?] rideCard\(/.test(det), 'step 1: no card');
  assert.match(det, /SSET\('show\.bookingMap', false\) === true \? rideCard\(/, 'only behind the admin switch');
  assert.match(read('js/settings.js'), /f\('show\.bookingMap',[^\n]{0,140}?'toggle', false,/, 'switch is off by default');
});

test('tracker is optional: a bike saves with no tracker ID and shows "No tracker yet"', () => {
  const a = read('js/admin.js'), t = read('js/trackers.js');
  assert.match(a, /Tracker ID \(IMEI\) \(optional\)<input class="input" name="trackerId" inputmode/);
  assert.ok(!/name="trackerId" required/.test(a));
  assert.match(a, /\(fd\.trackerId && x\.trackerId === fd\.trackerId\)/, 'two bikes without trackers do not clash');
  assert.match(a, /'No tracker yet'/); assert.match(read('js/ui.js'), /'no tracker yet'/);
  assert.match(t, /if \(b\.trackerId\) byTracker\[b\.trackerId\] = b;/);
});

test('main page: "Book bikes" only when signed in (Create an account when signed out), Videos section off', () => {
  const h = read('js/home.js');
  const render = h.slice(h.indexOf('render(app, user) {'), h.indexOf('teardown() {'));
  assert.ok(!render.includes('videos(c)'), 'no Videos section'); assert.ok(!h.includes('data-jump="videos"'), 'no Videos link');
  assert.ok(!/href="#\/login\/book" data-book>Book bikes/.test(h), 'no Book bikes for visitors');
  // run bookOrJoin
  const src = '(' + h.match(/function bookOrJoin\(user, cls, short\) \{[\s\S]*?\n  \}/)[0] + ')';
  const fn = vm.runInContext(src, vm.createContext({ window: {} }));
  /* Nov 8 2026 5:13 PM (David): a client REQUESTS bikes; the old "Book bikes" label comes back if Admin turns "request first" off */
  assert.match(fn(null, 'btn'), /href="#\/signup">Create an account</); assert.match(fn({ role: 'client' }, 'btn'), /href="#\/client\/book" data-book>Request bikes</);
  const old = vm.runInContext(src, vm.createContext({ window: { SiteSettings: { get: () => false } }, SiteSettings: { get: () => false } }));
  assert.match(old({ role: 'client' }, 'btn'), /data-book>Book bikes</);
  assert.match(read('js/app.js'), /if \(parts\[0\] === 'client'\) return renderLogin\(app, true\);/);
});
