const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const site = fs.existsSync(path.join(__dirname, '..', 'site')) ? path.join(__dirname, '..', 'site') : path.join(__dirname, '..', 'docs');
const read = (p) => fs.readFileSync(path.join(site, p), 'utf8');

test('index.html has title, viewport and only local assets that exist', () => {
  const html = read('index.html');
  assert.match(html, /<title>[^<]*BikeAds[^<]*<\/title>/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1/);
  const refs = [...html.matchAll(/(?:src|href)="([^"#?]+)(?:\?[^"]*)?"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 8);
  for (const r of refs) {
    assert.ok(!/^https?:/.test(r), 'remote asset: ' + r);
    assert.ok(fs.existsSync(path.join(site, r)), 'missing file: ' + r);
  }
  assert.ok(!/<script>/.test(html), 'no inline scripts');
  assert.ok(!/onclick=/i.test(html));
});

test('no placeholders, no social links, no analytics', () => {
  for (const f of ['index.html', 'styles.css', 'js/app.js', 'js/admin.js', 'js/client.js', 'js/ui.js', 'js/data.js', 'js/trackers.js']) {
    const s = read(f);
    assert.ok(!/lorem ipsum|TODO|FIXME|\{\{/i.test(s), 'placeholder in ' + f);
    assert.ok(!/wa\.me|whatsapp|facebook\.com|instagram\.com|google-analytics|gtag\(/i.test(s), 'social/analytics in ' + f);
  }
});

test('core features are present in the app code', () => {
  const ui = read('js/ui.js'), admin = read('js/admin.js'), client = read('js/client.js'), app = read('js/app.js');
  assert.match(ui, /flag red/); assert.match(ui, /flag blue/);
  assert.match(ui, /tile\.openstreetmap\.org/);
  assert.match(admin, /Add tracker/); assert.match(admin, /Approve/); assert.match(admin, /Decline/);
  assert.match(admin, /Calendar/); assert.match(admin, /List/); assert.match(admin, /Reconcile/); assert.match(admin, /Export CSV/);
  assert.match(client, /Choose a location/); assert.match(client, /Till what day\?/); assert.match(client, /Any 5/); assert.match(client, /Any 10/); assert.match(client, /deposit/);
  assert.match(app, /admin@bikeads\.demo/); assert.match(app, /client@bikeads\.demo/); assert.match(app, /Create a client account/);
});

function loadData() {
  const store = {};
  const ctx = { window: {}, localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } }, console, Date, Math, JSON };
  vm.createContext(ctx);
  vm.runInContext(read('js/data.js'), ctx);
  return ctx.window.Data;
}

test('seed data: 12 bikes, 3 advertisers, bookings and transactions', async () => {
  const Data = loadData();
  await Data.init();
  assert.strictEqual(Data.list('bikes').length, 12);
  assert.strictEqual(new Set(Data.list('bikes').map((b) => b.advertiser)).size, 3);
  assert.ok(Data.list('bookings').length >= 5);
  assert.ok(Data.list('transactions').length >= 8);
  assert.ok(Data.list('bikes').every((b) => /^\d{15}$/.test(b.trackerId)));
});

test('availability and 20% deposit math', async () => {
  const Data = loadData();
  await Data.init();
  const s = Data.addDays(Data.today(), 60), e = Data.addDays(s, 6);
  assert.strictEqual(Data.freeBikes(s, e).length, 12);
  const q = Data.quote(5, s, e);
  assert.strictEqual(q.days, 7);
  assert.strictEqual(q.total, 5 * 7 * 25);
  assert.strictEqual(q.deposit, q.total * 0.2);
  Data.put('bookings', { clientId: 'u_c1', clientName: 'x', company: 'x', start: s, end: e, bikeIds: ['bike_01', 'bike_02'], status: 'pending', history: [] });
  assert.strictEqual(Data.freeBikes(Data.addDays(s, 3), Data.addDays(s, 3)).length, 10);
  assert.strictEqual(Data.freeBikes(Data.addDays(e, 1), Data.addDays(e, 2)).length, 12);
});
