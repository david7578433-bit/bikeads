
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const site = fs.existsSync(path.join(__dirname, '..', 'site')) ? path.join(__dirname, '..', 'site') : path.join(__dirname, '..', 'docs');
const read = (p) => fs.readFileSync(path.join(site, p), 'utf8');
const Core = require(path.join(site, 'js', 'deliver-core.js'));
const Fixture = require('./fixtures/demo-data.js'); // the old demo set, for logic tests only (the site no longer seeds it)

async function world() {
  const store = {};
  const ctx = vm.createContext({ localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } }, console, Date, Math, JSON, setTimeout, clearTimeout, setInterval, clearInterval, Promise });
  ctx.window = ctx;
  for (const f of ['js/deliver-core.js', 'js/deliver-seed.js', 'js/data.js', 'js/deliver.js']) vm.runInContext(read(f), ctx, { filename: f });
  Fixture.use(ctx);
  await ctx.Data.init();
  return ctx;
}

test('the four plugins are wired into the page and the login', () => {
  const html = read('index.html');
  for (const f of ['js/deliver-core.js', 'js/deliver-seed.js', 'js/deliver.js', 'js/deliver-ui.js', 'js/driver.js', 'js/store.js', 'js/boss.js', 'js/platform.js', 'vendor/qrcode/qrcode.js']) assert.ok(html.includes(f), f);
  assert.match(html, /manifest\.webmanifest/);
  const app = read('js/app.js');
  for (const s of ['viewAs', 'serviceWorker', 'DELIVER_ROLES']) assert.ok(app.includes(s), s);
  assert.ok(!/@bikeads\.demo/.test(app), 'no demo logins on the login page (Nov 8 2026)');
  assert.ok(read('js/platform.js').includes('BikeAds Deliver')); // v4: the delivery side keeps its own name, behind FEATURES.delivery
  assert.ok(fs.existsSync(path.join(site, 'sw.js')) && fs.existsSync(path.join(site, 'icons/icon-512.png')) && fs.existsSync(path.join(site, 'vendor/jsqr/jsQR.js')) && fs.existsSync(path.join(site, 'vendor/xlsx/xlsx.mini.min.js')));
  const man = JSON.parse(read('manifest.webmanifest'));
  assert.strictEqual(man.display, 'standalone');
  assert.ok(!/scanovator/i.test(html + app + read('js/platform.js') + read('js/driver.js')), 'no competitor name');
  assert.match(read('js/driver.js'), /capture="environment"/);
  assert.match(read('js/driver.js'), /watchPosition/);
  assert.match(read('js/deliver-ui.js'), /BarcodeDetector/);
  assert.match(read('js/platform.js'), /Connect later/);
});

test('demo fixture (tests only): 2 stores, 3 drivers, 25 orders today with logins', async () => {
  const w = await world();
  const D = w.Data;
  assert.strictEqual(D.list('bikes').length, 12);
  assert.ok(D.list('bookings').length >= 5);
  assert.strictEqual(D.list('stores').length, 2);
  assert.strictEqual(D.list('drivers').length, 3);
  const today = D.list('orders').filter((o) => o.date === D.today());
  assert.strictEqual(today.length, 25);
  assert.ok(today.every((o) => o.status === 'new' && o.lat && o.lng && o.address));
  for (const e of ['admin@bikeads.demo', 'client@bikeads.demo', 'driver@bikeads.demo', 'store@bikeads.demo', 'boss@bikeads.demo']) assert.ok(D.list('users').some((u) => u.email === e), e);
  assert.ok(D.list('orders').some((o) => o.status === 'delivered' && o.proof && o.proof.signature));
});

test('an old browser keeps its data; delivery settings are added, but no demo stores/drivers/orders (Nov 8 2026)', async () => {
  const store = {};
  const ctx = vm.createContext({ localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } }, console, Date, Math, JSON });
  ctx.window = ctx;
  vm.runInContext(read('js/data.js'), ctx);           // bike ads only: no delivery seed loaded
  await ctx.Data.init();
  ctx.Data.put('bikes', { id: 'bike_01', number: '01', notes: 'kept' });
  await ctx.Data.flush('all');
  const ctx2 = vm.createContext({ localStorage: ctx.localStorage, console, Date, Math, JSON });
  ctx2.window = ctx2;
  for (const f of ['js/deliver-core.js', 'js/deliver-seed.js', 'js/data.js']) vm.runInContext(read(f), ctx2);
  await ctx2.Data.init();
  assert.strictEqual(ctx2.Data.get('bikes', 'bike_01').notes, 'kept');
  assert.ok(ctx2.Data.settings().deliver && ctx2.Data.settings().deliver.pricePerDelivery > 0, 'delivery settings added');
  for (const c of ['stores', 'drivers', 'orders', 'users']) assert.strictEqual(ctx2.Data.list(c).length, 0, 'no demo ' + c);
});

test('build routes: every stop assigned, areas kept apart, 2-opt never longer', async () => {
  const w = await world();
  const r = w.Deliver.buildRoutes(w.Data.today(), 'test');
  assert.ok(r.ok);
  assert.strictEqual(r.stops, 25);
  const today = w.Data.list('orders').filter((o) => o.date === w.Data.today());
  assert.ok(today.every((o) => o.status === 'routed' && o.driverId && o.seq > 0 && o.eta));
  assert.ok(today.filter((o) => o.storeId === 'st_kj').every((o) => ['dr_1', 'dr_2'].includes(o.driverId)));
  assert.ok(today.filter((o) => o.storeId === 'st_wb').every((o) => o.driverId === 'dr_3'));
  const n1 = today.filter((o) => o.driverId === 'dr_1').length, n2 = today.filter((o) => o.driverId === 'dr_2').length;
  assert.ok(Math.abs(n1 - n2) <= 1, 'balanced ' + n1 + '/' + n2);
  const pts = today.filter((o) => o.storeId === 'st_wb'), start = { lat: 40.7041, lng: -73.9578 };
  const nn = Core.nearestNeighbor(start, pts), opt = Core.twoOpt(start, pts, nn);
  assert.ok(Core.pathLength(start, pts, opt) <= Core.pathLength(start, pts, nn) + 0.01);
});

test('driver flow: scan warns on another driver\'s bag, deliver with proof, texts logged, money into books', async () => {
  const w = await world();
  const { Deliver, Data } = w;
  Deliver.buildRoutes(Data.today(), 'test');
  const mine = Deliver.route('dr_3');
  const other = Deliver.route('dr_1')[0];
  assert.strictEqual(Deliver.scan('dr_3', 'BKD:' + other.code + '-1').kind, 'other');
  assert.strictEqual(Deliver.scan('dr_3', 'nonsense').kind, 'unknown');
  const o = mine[0];
  Deliver.bags(o).forEach((b) => assert.strictEqual(Deliver.scan('dr_3', 'BKD:' + b).kind, 'mine'));
  assert.strictEqual(Data.get('orders', o.id).status, 'loaded');
  Deliver.startShift('dr_3');
  const n = Deliver.startRoute('dr_3', 'Avrum Fish');
  assert.strictEqual(n, mine.length);
  assert.ok(Data.list('smslog').filter((s) => s.kind === 'onTheWay' && s.status === 'would send').length >= mine.length);
  Deliver.setPosition('dr_3', 40.705, -73.96, 'phone', 8);
  assert.strictEqual(Data.bike('bike_01').position.source, 'phone');
  Deliver.deliver(Data.get('orders', o.id), { photo: 'data:image/jpeg;base64,xx', signature: 'data:image/png;base64,yy', collected: 50, method: 'cash' }, 'Avrum Fish');
  const done = Data.get('orders', o.id);
  assert.strictEqual(done.status, 'delivered');
  assert.ok(done.proof.photo && done.proof.signature);
  Deliver.fail(Data.get('orders', mine[1].id), 'No one home', '', 'Avrum Fish');
  const s = Deliver.summary(Data.today(), Data.today());
  assert.strictEqual(s.byDriver.dr_3.delivered, 1);
  assert.strictEqual(s.byDriver.dr_3.failed, 1);
  assert.strictEqual(s.byDriver.dr_3.cash, 50);
  const inv = Deliver.createInvoice('st_wb', 'test');
  assert.ok(inv && inv.total > 0);
  Deliver.markInvoicePaid(inv.id);
  assert.ok(Data.list('transactions').some((t) => t.category === 'Delivery income' && t.amount === inv.total));
  const p = Deliver.payDriver('dr_3');
  assert.ok(p && Data.list('transactions').some((t) => t.category === 'Driver pay' && t.amount === -p.amount));
  Deliver.moveStop(mine[2].id, 'dr_1', null, 'test');
  assert.strictEqual(Data.get('orders', mine[2].id).driverId, 'dr_1');
  assert.ok(Deliver.route('dr_1').some((x) => x.id === mine[2].id));
});

test('store upload: CSV and pasted Excel rows become orders', () => {
  const csv = 'Customer,Address,Phone,Bags,Amount,Notes,Window\n"Friedman, M.","22 Garfield Rd, Monroe, NY",845-555-0177,2,"$64.50",Side door,2-4pm\nFried,175 Wilson St,718-555-0188,3,0,,4-6pm\n';
  const a = Core.rowsToOrders(Core.parseTable(csv)).orders;
  assert.strictEqual(a.length, 2);
  assert.strictEqual(a[0].customer, 'Friedman, M.');
  assert.strictEqual(a[0].amount, 64.5);
  assert.strictEqual(a[0].windowStart, '14:00');
  assert.strictEqual(a[0].windowEnd, '16:00');
  const tsv = 'Name\tStreet\tCity\tBoxes\n Weiss\t9 Mountain Rd\tMonroe\t4\n';
  const b = Core.rowsToOrders(Core.parseTable(tsv)).orders;
  assert.strictEqual(b[0].address, '9 Mountain Rd, Monroe');
  assert.strictEqual(b[0].bags, 4);
  assert.strictEqual(Core.fill('Hi {customer}, ETA {eta}', { customer: 'M.', eta: '3:40 PM' }), 'Hi M., ETA 3:40 PM');
});

test('next day: DeliverSeed.rollDay still rolls untouched demo orders over (fixture only; the site no longer runs it)', async () => {
  const w = await world();
  const D = w.Data, y = D.addDays(D.today(), -1);
  const st = Fixture.build(w);
  st.orders.filter((o) => o.date === D.today()).forEach((o) => { o.date = y; });
  st.settings.deliver.demoDay = y;
  assert.ok(w.DeliverSeed.rollDay(st, { uid: D.uid, iso: D.iso, addDays: D.addDays, today: D.today }));
  assert.strictEqual(st.orders.filter((o) => o.date === D.today()).length, 25);
  assert.strictEqual(st.orders.filter((o) => o.date === y && o.status === 'new').length, 0);
  assert.ok(st.orders.some((o) => o.status === 'delivered'), 'history kept');
});
