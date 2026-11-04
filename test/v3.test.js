const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const site = fs.existsSync(path.join(__dirname, '..', 'site')) ? path.join(__dirname, '..', 'site') : path.join(__dirname, '..', 'docs');
const read = (p) => fs.readFileSync(path.join(site, p), 'utf8');

test('v3 typography: OFL fonts self-hosted and used', () => {
  const css = read('theme.css'), html = read('index.html');
  assert.match(html, /theme\.css/);
  assert.match(css, /font-family: 'Plus Jakarta Sans'/); assert.match(css, /font-family: 'Heebo'/);
  for (const f of ['plus-jakarta-sans-latin-wght-normal.woff2', 'heebo-hebrew-wght-normal.woff2', 'OFL-Heebo.txt', 'OFL-PlusJakartaSans.txt']) assert.ok(fs.existsSync(path.join(site, 'fonts', f)), f);
  assert.ok(!/fonts\.googleapis|fonts\.gstatic/.test(css + html), 'fonts are local');
});

test('v3 client: no map tab, four-step booking, demo card that keeps only last 4', () => {
  const client = read('js/client.js');
  const tabs = client.slice(client.indexOf('window.ClientViews'));
  assert.ok(!/key: 'map'/.test(tabs), 'client has no map tab');
  assert.ok(!/createBikeMap|renderMap/.test(client), 'no map code in client');
  for (const s of ['Details', 'Dates & bikes', 'Price', 'Payment', 'Confirm booking', 'Next: payment', 'Booking confirmed']) assert.ok(client.includes(s), s);
  assert.match(client, /Demo — real card processing connects once the payment account is set up/);
  assert.match(client, /last4/); assert.ok(!/cardNumber:|number: n[,\s]/.test(client), 'full card number is not stored');
  assert.match(client, /luhn/);
  const admin = read('js/admin.js'); assert.match(admin, /key: 'map'|'map'/); assert.match(admin, /setupFeePerBike/); assert.match(admin, /weeklyPerBike/);
});

function load(files, extra) {
  const store = {};
  const win = {};
  const ctx = Object.assign({ window: win, localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } }, console, Date, Math, JSON, Intl }, extra || {});
  vm.createContext(ctx);
  files.forEach((f) => vm.runInContext(read(f) + (f.includes('hebcal') ? '\n;window.hebcal = hebcal;' : ''), ctx));
  return ctx.window;
}

test('v3 price math: printing & setup per bike + weekly per bike per week, sample prices', async () => {
  const { Data } = load(['js/data.js']);
  await Data.init();
  const s = Data.settings();
  assert.strictEqual(s.setupFeePerBike, 75); assert.strictEqual(s.weeklyPerBike, 150); assert.strictEqual(s.pricesAreSamples, true);
  const st = Data.addDays(Data.today(), 30), en = Data.addDays(st, 13);
  const q = Data.priceQuote(10, st, en);
  assert.strictEqual(q.weeks, 2); assert.strictEqual(q.setup, 750); assert.strictEqual(q.weekly, 3000); assert.strictEqual(q.total, 3750);
  assert.strictEqual(Data.priceQuote(1, st, Data.addDays(st, 7)).weeks, 2); // 8 days bill as 2 weeks
  assert.strictEqual(Data.priceQuote(1, st, st).weeks, 1);
});

test('v3 calendar: Hebrew dates and Yom Tov from hebcal', () => {
  const w = load(['vendor/hebcal/hebcal.min.js', 'js/jcal.js']);
  const J = w.JCal;
  assert.ok(J.ready);
  const d = J.day('2026-11-04');
  assert.strictEqual(d.heFull, 'כ״ד חשון תשפ״ז');
  const sukkos = J.day('2026-09-26'); assert.ok(sukkos.events.some((e) => e.kind === 'yt' && /Sukkos/.test(e.en)));
  const chm = J.day('2026-09-28'); assert.ok(chm.events.some((e) => e.kind === 'chm'));
  const ch = J.monthRows(2026, 11); assert.ok(ch.some((r) => r.key === 'chanukah' && r.from === '2026-12-04' && r.to === '2026-12-12'));
  assert.ok(J.monthRows(2027, 2).some((r) => r.en === 'Purim'));
  assert.ok(J.monthRows(2026, 11).some((r) => r.kind === 'fast'));
  assert.ok(J.day('2026-11-07').shabbos && J.day('2026-11-07').parsha);
  assert.strictEqual(J.monthLabel(2026, 10), 'חשון – כסלו תשפ״ז');
});

test('v3 promo animation assets exist and credit OpenStreetMap', () => {
  const streets = read('js/williamsburg-streets.js'), html = read('index.html'), client = read('js/client.js');
  assert.match(streets, /OpenStreetMap/); assert.match(streets, /Lee Avenue/); assert.match(streets, /Bedford Avenue/); assert.match(streets, /Division Avenue/);
  assert.match(html, /bikeride\.js/); assert.match(client, /OpenStreetMap contributors/);
  assert.match(read('js/bikeride.js'), /prefers-reduced-motion/);
});

test('v3.1 main page hero: Williamsburg animation, sample ads, Book bikes button', () => {
  // v4: the main page moved to js/home.js; the ad-bike animation now sits in its Videos section
  const app = read('js/home.js'), css = read('theme.css'), ride = read('js/bikeride.js');
  for (const s of ['Your ad, riding every street', 'Book bikes', 'Your Ad Here', 'hero-ride', 'OpenStreetMap']) assert.ok(app.includes(s), s);
  assert.match(app, /ride\.destroy\(\)/);
  assert.match(ride, /opts\.labels/); assert.match(ride, /prefers-reduced-motion/);
  assert.match(css, /\.home-hero/);
});
