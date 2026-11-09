// Nov 8 2026 7:00 PM, David (voice notes): "this organization get a discount, so we give this organization a promo code"
// and "Also, maybe add the option of referrals". Company promo codes (PIVOT10 only for Pivot Marketing), dollars off,
// some campaigns only, usage limit; referrals (new client 10% off the first order, the referrer 10% off the next one).
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
  const ctx = { window: win, localStorage: ls, console, Date, Math, JSON, setTimeout, clearTimeout, Promise, URLSearchParams };
  win.window = win; vm.createContext(ctx);
  vm.runInContext(read('js/data.js'), ctx);
  vm.runInContext('var Data = window.Data;', ctx);
  vm.runInContext(read('js/settings.js'), ctx);
  vm.runInContext('var SiteSettings = window.SiteSettings;', ctx);
  win.UI = { fmtRange: (a, b) => a + ' – ' + b, fmtDate: (d) => d, esc: (s) => String(s), money: (n) => n + ' dollars' };
  vm.runInContext('var UI = window.UI;', ctx);
  vm.runInContext(read('js/campaigns.js'), ctx);
  vm.runInContext(read('js/referrals.js'), ctx);
  const Data = win.Data; await Data.init();
  for (let i = 1; i <= 30; i++) Data.put('bikes', { id: 'b' + i, number: String(i), locationId: 'loc_wburg', active: true });
  const user = (id, company, email, phone) => Data.put('users', { id, role: 'client', name: company + ' owner', company, email, phone: phone || '' });
  const pivot = user('u_pivot', 'Pivot Marketing', 'p@pivot.test', '7185550002');
  const other = user('u_other', 'Brooklyn Ads Agency', 'o@bka.test', '7185550003');
  return { win, ctx, Data, C: win.Campaigns, Ref: win.Referrals, pivot, other, user };
}
const D0 = '2027-01-03', D6 = '2027-01-09';
const three = (C) => C.resolve([{ id: 'g1', name: 'GB', bikes: 5 }, { id: 'g2', name: 'GG', bikes: 5 }, { id: 'g3', name: 'Lakefront', bikes: 5 }], D0, D6);
const order = (Data, C, u, q, extra) => Data.put('bookings', Object.assign({ clientId: u.id, company: u.company, status: 'pending', start: D0, end: D6, bikeIds: [], campaigns: [], mode: 'campaigns',
  discounts: q.discounts, discount: q.discount, total: q.total, deposit: q.deposit }, extra || {}));

test('PIVOT10 is only for Pivot Marketing: 10% off the whole GB 5 + GG 5 + Lakefront 5 order', async () => {
  const { Data, C, pivot, other } = await boot();
  Data.put('discounts', { id: 'd_pivot', kind: 'promo', code: 'PIVOT10', pct: 10, amountType: 'pct', applies: 'order', companyId: pivot.id, company: 'Pivot Marketing', active: true });
  const ok = Data.checkPromo('pivot10', pivot); assert.ok(ok.rule, 'Pivot can use it');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(Data.checkPromo('PIVOT10', other))), { rule: null, reason: 'company' });
  assert.strictEqual(Data.checkPromo('PIVOT10', null).reason, 'company');
  // another account of the same company (same company name) may use it
  const p2 = Data.put('users', { id: 'u_p2', role: 'client', company: '  pivot   marketing ', email: 'x@pivot.test' });
  assert.ok(Data.checkPromo('PIVOT10', p2).rule);
  const q = Data.priceQuoteMulti(three(C), { promo: ok.rule });
  assert.strictEqual(q.subtotal, 3375); assert.strictEqual(q.discount, 337.5); assert.strictEqual(q.total, 3037.5); assert.strictEqual(q.deposit, 607.5);
  assert.strictEqual(q.discounts.length, 1); assert.strictEqual(q.discounts[0].label, 'Promo code PIVOT10'); assert.strictEqual(Data.discText(q.discounts[0], (n) => n + ' dollars'), '10% off');
  assert.ok(!('campaignLines' in q));
  // the invoice / My bookings read the saved lines
  const b = order(Data, C, pivot, q, { promoCode: 'PIVOT10' });
  assert.strictEqual(b.discounts[0].amount, 337.5);
});

test('promo codes: dollars off, only some campaigns, usage limit, end date; old percent codes unchanged', async () => {
  const { Data, C, pivot, other } = await boot();
  const L = three(C);
  const fixed = { id: 'f', kind: 'promo', code: 'SAVE100', amountType: 'fixed', amount: 100, pct: 0, active: true };
  let q = Data.priceQuoteMulti(L, { promo: fixed });
  assert.strictEqual(q.discount, 100); assert.strictEqual(q.total, 3275); assert.strictEqual(Data.discText(q.discounts[0], (n) => n + ' dollars'), '100 dollars off');
  const gb = { id: 's', kind: 'promo', code: 'GB10', pct: 10, applies: 'campaigns', campaignNames: ['gb'], active: true };
  q = Data.priceQuoteMulti(L, { promo: gb });
  assert.strictEqual(q.discount, 112.5); assert.deepStrictEqual(JSON.parse(JSON.stringify(q.discounts[0].scope)), ['GB']); assert.strictEqual(Data.discText(q.discounts[0]), '10% off GB');
  // a code for other campaigns takes nothing off
  q = Data.priceQuoteMulti(L, { promo: Object.assign({}, gb, { campaignNames: 'Shoprite' }) }); assert.strictEqual(q.discount, 0);
  // never below zero
  q = Data.priceQuote(5, D0, D6, { promo: Object.assign({}, fixed, { amount: 99999 }) }); assert.strictEqual(q.total, 0);
  // old-style percent code: same result as before (1,125 for 5 bikes x 1 week, 10% = 112.50)
  Data.put('discounts', { id: 'old', kind: 'promo', code: 'OLD10', pct: 10, active: true });
  const old = Data.findPromo('old10'); assert.ok(old); q = Data.priceQuote(5, D0, D6, { promo: old });
  assert.strictEqual(q.total, 1012.5); assert.strictEqual(q.discounts[0].pct, 10);
  assert.ok(Data.checkPromo('OLD10', other).rule, 'a code with no company is for everyone');
  // usage limit
  Data.put('discounts', { id: 'lim', kind: 'promo', code: 'ONCE', pct: 5, maxUses: 1, active: true });
  assert.ok(Data.checkPromo('ONCE', pivot).rule);
  Data.put('bookings', { clientId: pivot.id, status: 'pending', promoCode: 'ONCE', start: D0, end: D6, bikeIds: [] });
  assert.strictEqual(Data.checkPromo('ONCE', other).reason, 'used');
  Data.put('bookings', { id: Data.list('bookings')[0].id, status: 'declined' });
  assert.ok(Data.checkPromo('ONCE', other).rule, 'a declined order gives the use back');
  // end date
  Data.put('discounts', { id: 'exp', kind: 'promo', code: 'GONE', pct: 5, expires: '2020-01-01', active: true });
  assert.strictEqual(Data.checkPromo('GONE', pivot).reason, 'expired');
  assert.strictEqual(Data.checkPromo('NOPE', pivot).reason, 'notfound');
  // bikes / weeks discounts still add with a promo code
  Data.put('discounts', { id: 'big', kind: 'bikes', min: 15, pct: 5, active: true });
  q = Data.priceQuoteMulti(L, { promo: Data.checkPromo('OLD10', pivot).rule });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(q.discounts.map((d) => [d.kind, d.pct]))), [['bikes', 5], ['promo', 10]]); assert.strictEqual(q.discount, 506.25);
});

test('re-pricing an order (a campaign declined) keeps the company code it used', async () => {
  const { Data, C, pivot } = await boot();
  const rule = { id: 'd_pivot', kind: 'promo', code: 'PIVOT10', pct: 10, companyId: pivot.id, active: true };
  const rows = three(C).map((c, i) => Object.assign({}, c, { bikeIds: ['b' + (i * 5 + 1), 'b' + (i * 5 + 2), 'b' + (i * 5 + 3), 'b' + (i * 5 + 4), 'b' + (i * 5 + 5)] }));
  const t = C.totals(rows, { promo: rule });
  const b = Data.put('bookings', Object.assign({ clientId: pivot.id, status: 'pending', promoCode: 'PIVOT10', ruleSnap: { promo: rule, extra: [] } }, t.patch));
  rows[2].status = 'declined';
  const r = C.reprice(b, rows);
  assert.strictEqual(r.q.subtotal, 2250); assert.strictEqual(r.q.discount, 225); assert.strictEqual(r.q.total, 2025);
});

test('referrals: A shares, B (new) gets 10% off the first order, after approval A gets 10% off the next order', async () => {
  const { Data, C, Ref, user } = await boot();
  assert.strictEqual(Ref.on(), true);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(Ref.settings())), { newType: 'pct', newValue: 10, rewardType: 'pct', rewardValue: 10, when: 'approved' });
  const A = user('u_a', 'Fresh Basket', 'a@fresh.test', '7185550001'), B = user('u_b', 'Corner Bakery', 'b@bakery.test', '7185550004');
  const code = Ref.codeOf(A); assert.match(code, /^FRESHB-\d{4}$/); assert.strictEqual(Ref.codeOf(A), code, 'the code stays the same');
  assert.match(Ref.link(code), /\?ref=FRESHB-\d{4}#\/signup$/);
  assert.strictEqual((await Ref.claim(A, code)).reason, 'self');
  const twin = user('u_twin', 'fresh  basket', 'twin@x.test'); assert.strictEqual((await Ref.claim(twin, code)).reason, 'self', 'same company name = self');
  assert.strictEqual((await Ref.claim(B, 'NOPE-1')).reason, 'notfound');
  const c = await Ref.claim(B, code.toLowerCase()); assert.ok(c.ok); assert.strictEqual(c.referral.status, 'joined');
  assert.strictEqual((await Ref.claim(B, Ref.codeOf(user('u_z', 'Sunny Deli', 'z@x.test')))).reason, 'already');
  // B's first order: 10% off by itself
  const ex = Ref.extraRules(B); assert.strictEqual(ex.length, 1); assert.strictEqual(ex[0].kind, 'referral');
  const qB = Data.priceQuote(5, D0, D6, { extra: ex });
  assert.strictEqual(qB.discount, 112.5); assert.strictEqual(qB.total, 1012.5); assert.match(qB.discounts[0].label, /Referral discount, first order \(referred by Fresh Basket\)/);
  assert.strictEqual(Ref.rewardRule(A), null, 'nothing for A yet');
  const bB = order(Data, C, B, qB, { mode: 'count' });
  await Ref.afterPlace(bB, B);
  assert.strictEqual(Data.list('referrals')[0].status, 'requested'); assert.strictEqual(Data.list('referrals')[0].firstBookingId, bB.id);
  assert.strictEqual(Ref.extraRules(B).length, 0, 'only the first order');
  // the admin approves B's order -> A's reward is ready
  Data.put('bookings', { id: bB.id, status: 'approved' }); Ref.sync();
  assert.strictEqual(Data.list('referrals')[0].status, 'earned');
  const rw = Ref.rewardRule(A); assert.ok(rw); assert.strictEqual(rw.kind, 'reward'); assert.match(rw.label, /thank you for referring Corner Bakery/);
  const qA = Data.priceQuoteMulti(three(C), { extra: Ref.extraRules(A) });
  assert.strictEqual(qA.discount, 337.5); assert.strictEqual(qA.discounts[0].kind, 'reward');
  const bA = order(Data, C, A, qA);
  await Ref.afterPlace(bA, A);
  assert.strictEqual(Data.list('referrals')[0].status, 'used'); assert.strictEqual(Ref.rewardRule(A), null, 'used once');
  // A's order declined -> the reward is back
  Data.put('bookings', { id: bA.id, status: 'declined' }); Ref.sync();
  assert.strictEqual(Data.list('referrals')[0].status, 'earned'); assert.ok(Ref.rewardRule(A));
});

test('referrals: a client with orders is not new; a cancelled first order frees the discount; admin values + off switch', async () => {
  const { Data, C, Ref, user, pivot } = await boot();
  const A = user('u_a', 'Fresh Basket', 'a@fresh.test'), B = user('u_b', 'Corner Bakery', 'b@bakery.test');
  Data.put('bookings', { clientId: pivot.id, status: 'approved', start: D0, end: D6, bikeIds: [] });
  assert.strictEqual((await Ref.claim(pivot, Ref.codeOf(A))).reason, 'notnew');
  Data.saveSettings({ refNewType: 'fixed', refNewValue: 50, refRewardValue: 15 });
  await Ref.claim(B, Ref.codeOf(A));
  const r = Data.list('referrals')[0]; assert.strictEqual(r.newType, 'fixed'); assert.strictEqual(r.newValue, 50); assert.strictEqual(r.rewardValue, 15);
  const q = Data.priceQuote(5, D0, D6, { extra: Ref.extraRules(B) }); assert.strictEqual(q.discount, 50); assert.strictEqual(Data.discText(q.discounts[0], (n) => n + ' dollars'), '50 dollars off');
  const b = order(Data, C, B, q); await Ref.afterPlace(b, B);
  Data.put('bookings', { id: b.id, status: 'cancelled' }); Ref.sync();
  assert.strictEqual(Data.list('referrals')[0].status, 'joined'); assert.ok(Ref.newClientRule(B), 'discount free again');
  Data.saveSettings({ refOn: false });
  assert.strictEqual(Ref.newClientRule(B), null); assert.strictEqual((await Ref.claim(user('u_c', 'Sunny Deli', 'c@x.test'), Ref.codeOf(A))).reason, 'off');
});

test('referrals: share link fills the sign-up box; "deposit paid" setting', async () => {
  const { Data, C, Ref, user } = await boot();
  const A = user('u_a', 'Fresh Basket', 'a@fresh.test'), B = user('u_b', 'Corner Bakery', 'b@bakery.test');
  Ref.setPending(Ref.codeOf(A)); assert.strictEqual(Ref.pending(), Ref.codeOf(A));
  B.role = 'client'; const r = await Ref.autoClaim(B); assert.ok(r && r.ok); assert.strictEqual(Ref.pending(), '', 'used once');
  Data.saveSettings({ refWhen: 'deposit' });
  const q = Data.priceQuote(5, D0, D6, { extra: Ref.extraRules(B) }); const b = order(Data, C, B, q); await Ref.afterPlace(b, B);
  Data.put('bookings', { id: b.id, status: 'approved' }); Ref.sync(); assert.strictEqual(Data.list('referrals')[0].status, 'requested', 'waits for the deposit');
  Data.put('bookings', { id: b.id, depositPaid: true }); Ref.sync(); assert.strictEqual(Data.list('referrals')[0].status, 'earned');
});

test('site wiring: Referrals admin section, My account card (copy only, no social share), Give promo code, files, cache', () => {
  const html = read('index.html'), sw = read('sw.js'), ref = read('js/referrals.js'), menu = read('js/admin-menu.js'), adm = read('js/admin.js'), cl = read('js/client.js'), app = read('js/app.js'), set = read('js/settings.js'), auth = read('js/auth.js');
  assert.match(html, /js\/referrals\.js\?v=\d+/); assert.ok(sw.includes('"js/referrals.js"'));
  const v = html.match(/js\/referrals\.js\?v=(\d+)/)[1]; assert.ok(+v >= 19); assert.ok(sw.includes("'bikeads-v" + v + "'"));
  assert.match(menu, /key: 'referrals', label: 'Referrals'/); assert.match(menu, /'@referrals'/); assert.match(menu, /data-cpromo/); assert.match(menu, /Give promo code/);
  assert.match(set, /key: 'referrals'/); for (const k of ['refOn', 'refNewType', 'refNewValue', 'refRewardType', 'refRewardValue', 'refWhen']) assert.ok(set.includes("'" + k + "'"), k);
  assert.match(adm, /function editDiscount/); for (const s of ['Dollars off', 'Only some campaigns', 'Only for this company', 'How many times it can be used']) assert.ok(adm.includes(s), s);
  assert.match(cl, /key: 'account', label: 'My account'/); assert.match(cl, /Promo or referral code/); assert.match(cl, /This code is for another company/);
  assert.match(ref, /Refer a business/); assert.match(ref, /Copy link/);
  assert.ok(!/whatsapp|wa\.me|facebook|twitter|telegram/i.test(ref), 'no social share buttons');
  assert.ok(!/\$\d/.test(ref), 'money as dollars');
  assert.match(app, /Referral code \(optional\)/); assert.match(app, /Referrals\.capture\(\)/);
  for (const s of ['mow_promo_check', 'mow_claim_referral', 'mow_referral_mark', "from('mow_referrals')"]) assert.ok(auth.includes(s), s);
});

test('database: migration + schema.sql carry company codes and referrals with RLS', () => {
  const mig = fs.readFileSync(path.join(root, 'supabase/migrations/20261109_promo_referrals.sql'), 'utf8');
  const schema = fs.readFileSync(path.join(root, 'supabase/schema.sql'), 'utf8');
  for (const s of ['add column if not exists company_id', 'add column if not exists max_uses', 'add column if not exists amount_type', 'add column if not exists campaign_names',
    'create table if not exists public.mow_referrals', 'alter table public.mow_referrals enable row level security', 'referrer_id = auth.uid() or referred_id = auth.uid() or public.mow_is_admin()',
    'function public.mow_promo_check', 'function public.mow_claim_referral', 'function public.mow_referral_mark', 'mow_records_referrals', 'mow_profiles_refcode', "'self'", "'company'", 'revoke all on public.mow_referrals from anon']) {
    assert.ok(mig.includes(s), 'migration: ' + s); assert.ok(schema.includes(s), 'schema: ' + s);
  }
  assert.ok(!/service_role|sb_secret/i.test(mig));
});
