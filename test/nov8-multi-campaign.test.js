// Nov 8 2026 7:00 PM, David (voice note): a marketing company ("Pivot") sends ONE request with several campaigns —
// "five bikes for GB, five bikes for GG, five for Lakefront … You can make a few campaigns in the main campaign".
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const site = path.join(root, 'docs');
const read = (p) => fs.readFileSync(path.join(site, p), 'utf8');

async function boot() {
  const store = {};
  const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const win = { localStorage: ls };
  const ctx = { window: win, localStorage: ls, console, Date, Math, JSON, setTimeout, clearTimeout, Promise };
  win.window = win; vm.createContext(ctx);
  vm.runInContext(read('js/data.js'), ctx);
  vm.runInContext('var Data = window.Data;', ctx);
  vm.runInContext(read('js/settings.js'), ctx);
  vm.runInContext('var SiteSettings = window.SiteSettings;', ctx);
  win.UI = { fmtRange: (a, b) => a + ' – ' + b, fmtDate: (d) => d, esc: (s) => String(s), money: (n) => n + ' dollars' };
  vm.runInContext('var UI = window.UI;', ctx);
  vm.runInContext(read('js/campaigns.js'), ctx);
  const Data = win.Data; await Data.init();
  for (let i = 1; i <= 20; i++) Data.put('bikes', { id: 'b' + i, number: String(i), locationId: 'loc_wburg', active: true });
  return { win, ctx, Data, C: win.Campaigns };
}
const D0 = '2027-01-03', D6 = '2027-01-09';
const pivot = (C, d1, d2) => C.resolve([{ id: 'g1', name: 'GB', bikes: 5 }, { id: 'g2', name: 'GG', bikes: 5 }, { id: 'g3', name: 'Lakefront', bikes: 5 }], d1 || D0, d2 || D6);

test('Pivot: GB 5 + GG 5 + Lakefront 5 = 15 bikes; each campaign priced on its own, minimum counts the whole order', async () => {
  const { Data, C } = await boot();
  const L = pivot(C);
  assert.strictEqual(C.total(L), 15); assert.strictEqual(C.summary(L), 'GB 5, GG 5, Lakefront 5');
  const ok = C.check(L, {}); assert.ok(ok.ok, ok.errors.join(' | '));
  const q = Data.priceQuoteMulti(L, {});
  assert.deepStrictEqual(q.campaigns.map((l) => [l.name, l.bikes, l.setup, l.weekly, l.subtotal]), [['GB', 5, 750, 375, 1125], ['GG', 5, 750, 375, 1125], ['Lakefront', 5, 750, 375, 1125]]);
  assert.strictEqual(q.bikes, 15); assert.strictEqual(q.subtotal, 3375); assert.strictEqual(q.total, 3375); assert.strictEqual(q.deposit, 675); assert.strictEqual(q.balance, 2700);
  // the same as one booking of 15 bikes when the dates are the same
  assert.strictEqual(Data.priceQuote(15, D0, D6).total, q.total);
  // small campaigns are fine; the whole order still needs the minimum (5)
  assert.ok(C.check(C.resolve([{ name: 'A', bikes: 2 }, { name: 'B', bikes: 3 }], D0, D6), {}).ok, '2 + 3 = 5 is OK');
  assert.match(C.check(C.resolve([{ name: 'A', bikes: 2 }, { name: 'B', bikes: 2 }], D0, D6), {}).errors.join(' '), /at least 5 bikes in total \(you have 4\)/);
  assert.match(C.check(C.resolve([{ name: 'A', bikes: 0 }, { name: 'B', bikes: 6 }], D0, D6), {}).errors.join(' '), /A: at least 1 bike/);
  // admin: "Minimum applies to: each campaign"
  await Data.saveSettings({ minBikesApplies: 'campaign' });
  assert.match(C.check(C.resolve([{ name: 'A', bikes: 2 }, { name: 'B', bikes: 5 }], D0, D6), {}).errors.join(' '), /A: at least 5 bikes per campaign/);
  await Data.saveSettings({ minBikesApplies: 'order' });
});

test('availability: bikes added up per DAY across campaigns; different dates per campaign reuse bikes on other days', async () => {
  const { Data, C } = await boot();
  const tooMany = C.resolve([{ name: 'GB', bikes: 15 }, { name: 'GG', bikes: 10 }], D0, D6);
  const r = C.check(tooMany, {}); assert.ok(!r.ok); assert.match(r.errors[0], /only 20 bikes are free, and your campaigns need 25 that day/);
  // GB in week 1, GG in week 2: 15 + 15 is fine (never more than 15 on one day), the same bikes can ride both
  const own = [{ id: 'a', name: 'GB', bikes: 15, start: '2027-01-03', end: '2027-01-09' }, { id: 'b', name: 'GG', bikes: 15, start: '2027-01-10', end: '2027-01-16' }];
  assert.ok(C.check(own, {}).ok); const as = C.assign(own, {}); assert.ok(as.ok); assert.deepStrictEqual(as.ids[0], as.ids[1]);
  // overlapping days add up
  const over = [{ id: 'a', name: 'GB', bikes: 15, start: '2027-01-03', end: '2027-01-09' }, { id: 'b', name: 'GG', bikes: 10, start: '2027-01-08', end: '2027-01-16' }];
  assert.match(C.check(over, {}).errors[0], /2027-01-08 only 20 bikes are free, and your campaigns need 25/);
  // resolve(): own dates only when "Different dates" is on
  const rs = C.resolve([{ name: '', bikes: 3, own: true, start: '2027-02-01', end: '2027-02-07' }, { name: 'X', bikes: 3, own: false, start: '2027-05-01', end: '2027-05-02' }], D0, D6);
  assert.deepStrictEqual(rs.map((c) => [c.name, c.start, c.end]), [['Campaign 1', '2027-02-01', '2027-02-07'], ['X', D0, D6]]);
});

test('a saved order holds each campaign\'s bikes only on its own days; a declined campaign holds nothing', async () => {
  const { Data, C } = await boot();
  const rows = [{ id: 'a', name: 'GB', start: '2027-01-03', end: '2027-01-09', bikeIds: ['b1', 'b2'] }, { id: 'b', name: 'GG', start: '2027-01-10', end: '2027-01-16', bikeIds: ['b3'] }];
  const t = C.totals(rows, {});
  Data.put('bookings', Object.assign({ id: 'bk_p', status: 'pending', company: 'Pivot Marketing', mode: 'campaigns' }, t.patch));
  const b = Data.get('bookings', 'bk_p');
  assert.deepStrictEqual([b.start, b.end, b.bikeIds.join()], ['2027-01-03', '2027-01-16', 'b1,b2,b3']);
  assert.strictEqual(Array.from(Data.busyBikeIds('2027-01-04', '2027-01-04')).sort().join(), 'b1,b2');
  assert.strictEqual(Array.from(Data.busyBikeIds('2027-01-12', '2027-01-12')).join(), 'b3');
  // decline GG before approving: b3 is free again and the price is worked out again
  const before = b.total;
  const re = C.reprice(b, b.campaigns.map((c) => (c.id === 'b' ? Object.assign({}, c, { status: 'declined' }) : c)));
  Data.put('bookings', Object.assign({ id: 'bk_p' }, re.patch));
  const b2 = Data.get('bookings', 'bk_p');
  assert.strictEqual(Data.busyBikeIds('2027-01-12', '2027-01-12').size, 0);
  assert.ok(b2.total < before); assert.strictEqual(b2.bikeIds.join(), 'b1,b2'); assert.strictEqual(b2.end, '2027-01-09');
  assert.strictEqual(C.active(b2).length, 1); assert.strictEqual(b2.campaigns.length, 2, 'the declined campaign stays on the record');
  // clashes are checked campaign by campaign
  Data.put('bookings', { id: 'bk_o', status: 'approved', start: '2027-01-12', end: '2027-01-12', bikeIds: ['b3'] });
  assert.strictEqual(Data.clashes(Data.get('bookings', 'bk_p')).length, 0);
  Data.put('bookings', { id: 'bk_o2', status: 'approved', start: '2027-01-05', end: '2027-01-05', bikeIds: ['b2'] });
  assert.strictEqual(Data.clashes(Data.get('bookings', 'bk_p')).map((x) => x.id).join(), 'bk_o2');
  // a booking without campaigns works as before
  Data.put('bookings', { id: 'bk_s', status: 'pending', start: '2027-03-01', end: '2027-03-07', bikeIds: ['b9'] });
  assert.ok(Data.busyBikeIds('2027-03-03', '2027-03-03').has('b9'));
});

test('pop-up: "You requested 15 bikes in 3 campaigns (GB 5, GG 5, Lakefront 5) for …"; emails list the campaigns', async () => {
  const { win, ctx, Data, C } = await boot();
  const L = pivot(C); const as = C.assign(L, {});
  const t = C.totals(L.map((c, i) => Object.assign({}, c, { bikeIds: as.ids[i] })), {});
  const b = Data.put('bookings', Object.assign({ id: 'bk_x', status: 'pending', company: 'Pivot Marketing', clientName: 'Moshe', contactEmail: 'pivot@example.com' }, t.patch));
  assert.strictEqual(C.popupText(b), 'You requested 15 bikes in 3 campaigns (GB 5, GG 5, Lakefront 5) for 2027-01-03 – 2027-01-09. We will review it and confirm soon.');
  win.SITE = { adminEmails: ['david7578433@gmail.com'] }; win.Auth = { remote: false };
  vm.runInContext('var SITE = window.SITE, Auth = window.Auth, Campaigns = window.Campaigns;', ctx);
  vm.runInContext(read('js/mailer.js'), ctx);
  const m = win.Mailer.compose('requested', b);
  assert.match(m.text, /Campaigns:\n• GB: 5 bikes, 2027-01-03 – 2027-01-09, 1,125 dollars\n• GG: 5 bikes/);
  assert.ok(!/Campaigns:/.test(win.Mailer.compose('invoice', b).text), 'the invoice email lists them in its own lines');
  assert.ok(!/Campaigns:/.test(win.Mailer.compose('requested', { id: 'one', bikeIds: [1, 2, 3, 4, 5], start: D0, end: D6 }).text), 'one-campaign request: no list');
});

test('client form: "+ Add another campaign" (simple look stays the default), rows with name, bikes, different dates, description', () => {
  const c = read('js/client.js');
  assert.match(c, /id="mc-add1">\+ Add another campaign<\/button>/);
  assert.match(c, /Campaigns\.enabled\(\) && !wiz\.payFor/);
  for (const k of ['name', 'bikes', 'own', 'start', 'end', 'adText']) assert.match(c, new RegExp('data-mc="' + k + '"'), k);
  assert.match(c, /Different dates for this campaign/); assert.match(c, /data-mc-del=/); assert.match(c, /Campaign \/ brand name/);
  assert.match(c, /const MULTI = \(\) => !!\(window\.Campaigns && wiz\.campaigns && wiz\.campaigns\.length > 1 && !wiz\.payFor\)/);
  assert.match(c, /if \(MULTI\(\)\) return renderPriceMulti\(root\);/); assert.match(c, /function priceTableMulti\(q\)/);
  assert.match(c, /if \(MULTI\(\)\) return placeMulti\(user, pay, action, paid, note\);/);
  assert.match(c, /mode: 'campaigns'/); assert.match(c, /Campaigns\.popupText\(b\)/);
  assert.match(c, /e\.g\. Fresh Basket Grocery, or an agency like Pivot Marketing/);
  assert.match(read('js/settings.js'), /e\.g\. Fresh Basket Grocery, or an agency like Pivot Marketing/);
});

test('admin: campaigns on the booking, approve the whole order, per-campaign decline + bikes, invoice lines, clients by company', () => {
  const a = read('js/admin.js'), ca = read('js/campaigns-admin.js'), am = read('js/admin-menu.js');
  assert.match(a, /Campaigns\.listHtml\(b, \{ bikes: true, money \}\)/); assert.match(a, /data-camps=/);
  assert.match(a, /Approve the whole order\?/); assert.match(a, /const clash = Data\.clashes\(b\);/);
  assert.match(ca, /Decline this campaign/); assert.match(ca, /Change bikes/); assert.match(ca, /function groupByCompany\(users\)/);
  assert.match(am, /\['Campaign: ' \+ c\.name, /, 'invoice: one line per campaign');
  assert.match(am, /CampaignsAdmin\.groupByCompany\(users\)/); assert.match(am, /campaigns: ' \+ esc\(camps\.join/);
  assert.match(read('js/client.js'), /Campaigns\.listHtml\(b, \{ money \}\)/, 'My bookings + confirmation show the campaigns');
});

test('admin settings: "Allow multiple campaigns per request" (on) and "Minimum bikes applies to" (whole order)', async () => {
  const { win } = await boot();
  const S = win.SiteSettings;
  assert.strictEqual(S.get('multiCampaign'), true); assert.strictEqual(S.get('minBikesApplies'), 'order');
  const form = S.SECTIONS.find((s) => s.key === 'form');
  assert.ok(form.fields.some((f) => f.k === 'multiCampaign')); assert.ok(form.fields.some((f) => f.k === 'minBikesApplies'));
  assert.ok(S.SECTIONS.find((s) => s.key === 'messages').fields.some((f) => f.k === 'msgRequestPopupMulti'));
  await S.set('multiCampaign', false); assert.strictEqual(win.Campaigns.enabled(), false); await S.set('multiCampaign', undefined); assert.strictEqual(win.Campaigns.enabled(), true);
});

test('Supabase: idempotent migration (campaign holds per day, per-campaign view with RLS), schema.sql, files cached', () => {
  const m = fs.readFileSync(path.join(root, 'supabase/migrations/20261109_multi_campaign.sql'), 'utf8');
  assert.match(m, /create or replace function public\.mow_bike_holds\(\)/); assert.match(m, /coalesce\(c->>'status', ''\) <> 'declined'/);
  assert.match(m, /r\.id \|\| '#' \|\| coalesce\(c->>'id', ''\)/);
  assert.match(m, /create or replace view public\.mow_booking_campaigns with \(security_invoker = true\)/);
  assert.match(m, /revoke all on public\.mow_booking_campaigns from public, anon;/); assert.match(m, /create index if not exists mow_records_campaigns_idx/);
  assert.ok(!/drop table|truncate|delete from/i.test(m), 'nothing is deleted');
  assert.match(fs.readFileSync(path.join(root, 'supabase/schema.sql'), 'utf8'), /mow_booking_campaigns/);
  assert.match(read('js/auth.js'), /String\(h\.id\)\.split\('#'\)\[0\]/, 'own order not counted twice as a hold');
  const html = read('index.html'), sw = read('sw.js');
  assert.match(html, /js\/campaigns\.js\?v=18/); assert.match(html, /js\/campaigns-admin\.js\?v=18/); assert.match(html, /campaigns\.css\?v=18/);
  assert.match(sw, /'bikeads-v18'/); for (const f of ['js/campaigns.js', 'js/campaigns-admin.js', 'campaigns.css']) assert.ok(sw.includes('"' + f + '"'), f);
  assert.ok(html.indexOf('js/campaigns.js') < html.indexOf('js/mailer.js') && html.indexOf('js/campaigns.js') < html.indexOf('js/client.js'));
  for (const f of ['js/campaigns.js', 'js/campaigns-admin.js', 'campaigns.css']) assert.ok(!/\$\d/.test(read(f)), f + ': money as dollars');
});
