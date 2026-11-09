// Nov 8 2026 5:13 PM, David: booking = REQUEST (approve first), emails + invoice, "Contact us" instead of "Request a call".
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const site = path.join(__dirname, '..', 'docs');
const read = (p) => fs.readFileSync(path.join(site, p), 'utf8');

test('A) a client sends a REQUEST: nothing paid, pop-up "You requested N bikes", deposit only after approval', () => {
  const c = read('js/client.js'), a = read('js/admin.js'), s = read('js/settings.js');
  assert.match(s, /f\('requestFirst', [^\n]*'toggle', true/, 'request first is ON by default');
  assert.match(c, /async function sendRequest\(user\)/); assert.match(c, /placeBooking\(user, \{ method: 'request' \}, 'Request sent \(nothing paid yet; deposit after approval\)', false/);
  assert.match(c, /requestOnly: true/); assert.match(c, /Send request ›/); assert.match(c, /msgRequestPopup/);
  assert.match(s, /You requested \{bikes\} bikes for \{dates\}\. We will review it and confirm soon\./);
  assert.match(c, /data-paydep=/, 'My bookings: Pay deposit after approval'); assert.match(c, /function payFor\(id\)/);
  assert.match(c, /if \(wiz\.payFor\) \{ \/\* paying the deposit of an approved request \*\//);
  assert.match(a, /function noteBox\(/, 'approve / decline with an optional note');
  assert.match(a, /Mailer\.send\('approved'/); assert.match(a, /Mailer\.send\('declined'/);
  assert.match(c, /Mailer\.send\('requested', b\); Mailer\.send\('newRequest', b\);/);
  assert.match(c, /Next: payment ›/, 'the old pay-now flow is kept behind the switch');
});

test('B) emails: templates with placeholders, honest "not sent — email not connected" when no mail account', async () => {
  const win = { SiteSettings: { get: (k) => ({ 'email.requested.subject': 'Your bike request was received', 'email.requested.body': 'Hi {name}, {bikes} bikes, {dates}, total {total}.', emailOn: true }[k]) },
    Data: { settings: () => ({ businessName: 'Media on Wheels' }), get: () => null, put() {} }, UI: { fmtRange: (a, b) => a + ' – ' + b }, SITE: { adminEmails: ['david7578433@gmail.com'] }, Auth: { remote: false } };
  const ctx = Object.assign({ window: win, console }, win); win.window = win; vm.createContext(ctx);
  vm.runInContext(read('js/mailer.js'), ctx);
  const M = win.Mailer;
  const b = { id: 'x', clientName: 'Yoel', company: 'Shop', bikeIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], start: '2026-11-15', end: '2026-11-21', total: 1500, deposit: 300, balance: 1200, contactEmail: 'yoel@example.com' };
  const m = M.compose('requested', b);
  assert.strictEqual(m.to, 'yoel@example.com'); assert.strictEqual(m.subject, 'Your bike request was received');
  assert.strictEqual(m.text, 'Hi Yoel, 10 bikes, 2026-11-15 – 2026-11-21, total 1,500 dollars.');
  const r = await M.send('requested', b);
  assert.deepStrictEqual({ ok: r.ok, status: r.status }, { ok: false, status: 'not sent — email not connected' });
  const s = read('js/settings.js');
  for (const k of ['requested', 'newRequest', 'approved', 'declined', 'invoice', 'test']) { assert.match(s, new RegExp("'email\\." + k + "\\.subject'")); assert.match(s, new RegExp("'email\\." + k + "\\.body'")); }
  assert.match(s, /emailFromName/); assert.match(s, /emailReplyTo/);
});

test('B) the email function: secrets only on Supabase, clients can only email themselves / the admin', () => {
  const fn = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'mow-send-email', 'index.ts'), 'utf8');
  assert.match(fn, /Deno\.env\.get/); assert.match(fn, /RESEND_API_KEY/); assert.match(fn, /SMTP_HOST/);
  assert.match(fn, /if \(!isAdmin\) \{/); assert.match(fn, /kind === "requested"\) to = String\(who\.user\.email/); assert.match(fn, /email not connected/);
  assert.ok(!/re_[A-Za-z0-9]{20,}|sb_secret_|service_role/.test(fn), 'no key in the code');
});

test('B) invoice: number, date, business, setup, bikes × weeks, discount/promo, deposit, balance due — in dollars; print + email', () => {
  const m = read('js/admin-menu.js'), a = read('js/admin.js'), css = read('admin.css');
  assert.match(m, /function renderInvoice\(/); assert.match(m, /'INV-' \+ Data\.today\(\)\.slice\(0, 4\)/);
  for (const s of ['Printing & setup', 'Weekly charge', 'Discount: ', 'Deposit (', 'Balance due', 'Bill to:', 'Print / Save as PDF', 'Email to client']) assert.ok(m.includes(s), s);
  assert.match(a, /href="#\/admin\/invoice\/' \+ esc\(b\.id\) \+ '" data-invoice=/);
  assert.match(css, /@media print/);
  assert.match(read('js/mailer.js'), /' dollars'/);
});

test('C) Contact us: phone (tap to call), email (tap to email) from admin settings, and Request a call back', () => {
  const f = read('js/feedback.js'), h = read('js/home.js');
  assert.match(f, /href="tel:/); assert.match(f, /href="mailto:/); assert.match(f, /contactPhone/); assert.match(f, /contactEmail/);
  assert.match(f, /data-contact>Contact us</); assert.match(h, /data-contact="home-header"/);
  assert.match(f, /function openCallRequest\(/, 'the call-back form is kept'); assert.match(read('js/admin-menu.js'), /Inbox\.renderAdmin/, 'Inbox stays');
});
