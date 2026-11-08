const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const site = fs.existsSync(path.join(__dirname, '..', 'site')) ? path.join(__dirname, '..', 'site') : path.join(__dirname, '..', 'docs');
const read = (p) => fs.readFileSync(path.join(site, p), 'utf8');

// v4 (Nov 4 2026, David): calm light look, open main page, "Media on Wheels", delivery saved behind a switch
test('v4 light look is loaded last, with a local OFL serif font', () => {
  const html = read('index.html'), css = read('light.css');
  assert.ok(html.indexOf('light.css') > html.indexOf('theme.css'), 'light.css loads after theme.css');
  assert.match(css, /font-family: 'DM Serif Display'/);
  for (const f of ['dm-serif-display-latin-400-normal.woff2', 'dm-serif-display-latin-ext-400-normal.woff2', 'OFL-DMSerifDisplay.txt']) assert.ok(fs.existsSync(path.join(site, 'fonts', f)), f);
  assert.ok(!/fonts\.googleapis|fonts\.gstatic|https?:\/\//.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'no remote assets in light.css');
  assert.match(css, /border-radius: 999px/); assert.match(css, /\.dock\b/); assert.match(css, /\.lpanel/);
  for (const f of ['light.css', 'js/config.js', 'js/home.js']) assert.match(read('sw.js'), new RegExp(f.replace('.', '\\.')));
});

test('v4 main page is an open one-pager with every section, samples marked', () => {
  const home = read('js/home.js');
  for (const s of ['hero-video', 'What we do', 'How it works', 'Prices', 'Videos', 'How many people see us', 'What businesses say', 'Why ', 'Our story', 'Ready to put your ad on the street?',
    'Book bikes', 'See prices', 'statsSample', 'reviewsSample', 'storySample', 'sample-tag', 'Main page content', 'setupFeePerBike', 'weeklyPerBike', 'hero-ride', 'dock']) assert.ok(home.includes(s), s);
  const app = read('js/app.js');
  assert.match(app, /HomePage\.render\(app, null\)/, 'logged-out visitors land on the main page, not a login wall');
  for (const s of ['Demo logins', 'admin@bikeads.demo', 'client@bikeads.demo', 'driver@bikeads.demo', 'store@bikeads.demo', 'boss@bikeads.demo']) assert.ok(!app.includes(s), 'removed Nov 8 2026: ' + s);
  for (const s of ['loginform', 'Create a client account', 'renderSignup']) assert.ok(app.includes(s), s);
  assert.match(read('js/admin.js'), /HomePage\.renderAdmin/); assert.match(read('js/admin.js'), /HomeVideo\.renderAdmin/);
  assert.match(read('js/bikeride.js'), /opts\.bg/);
});

test('v4 main page video: real footage with credit, ≤4 MB, upload kept in IndexedDB', () => {
  const hv = read('js/homevideo.js');
  assert.match(hv, /CC BY 3\.0/); assert.match(hv, /indexedDB/); assert.ok(hv.includes('video\\/(mp4|webm)')); assert.match(hv, /prefers-reduced-motion/);
  for (const f of ['hero-williamsburg.mp4', 'hero-williamsburg-phone.mp4', 'hero-poster.jpg']) assert.ok(fs.existsSync(path.join(site, 'media', f)), f);
  assert.ok(fs.statSync(path.join(site, 'media', 'hero-williamsburg.mp4')).size <= 4 * 1048576, 'hero video ≤ 4 MB');
});

test('brand is Media on Wheels on visible pages', () => {
  const html = read('index.html');
  assert.match(html, /<title>Media on Wheels/); assert.ok(!/BikeAds/.test(html.replace(/<!--[\s\S]*?-->/g, '')), 'no BikeAds in index.html');
  assert.match(read('manifest.webmanifest'), /"name": "Media on Wheels"/);
  assert.match(read('js/data.js'), /businessName: 'Media on Wheels'/);
  for (const f of ['js/home.js', 'js/client.js']) assert.ok(!/'BikeAds'|BikeAds approves|Note for BikeAds/.test(read(f)), f);
});

test('delivery business is saved but OFF behind FEATURES.delivery', () => {
  const ctx = { window: {} }; vm.runInNewContext(read('js/config.js'), ctx);
  assert.strictEqual(ctx.window.FEATURES.delivery, false, 'delivery is off by default');
  const html = read('index.html');
  assert.ok(html.indexOf('js/config.js') < html.indexOf('js/app.js') && html.indexOf('js/config.js') < html.indexOf('js/platform.js'), 'config loads first');
  for (const f of ['js/driver.js', 'js/store.js', 'js/boss.js', 'js/platform.js', 'js/deliver.js', 'js/deliver-ui.js', 'js/deliver-core.js', 'js/deliver-seed.js']) assert.ok(html.includes(f) && fs.existsSync(path.join(site, f)), f + ' still in the code');
  assert.match(read('js/platform.js'), /if \(!\(window\.FEATURES && FEATURES\.delivery\)\) return;/);
  const app = read('js/app.js');
  assert.match(app, /const DELIVERY = !!\(window\.FEATURES && window\.FEATURES\.delivery\)/);
  assert.match(app, /!DELIVERY && DELIVER_ROLES\.includes\(role\)/);
  assert.match(app, /DELIVERY \? ' — and deliveries for local stores\.'/);
  assert.ok(!/driver|dispatch|deliver(?!y bikes|ing groceries| groceries)/i.test(read('js/home.js').replace(/grocery-delivery/gi, '').replace(/\/\*[\s\S]*?\*\//g, '')), 'main page has no delivery-business words');
});

test('v4.1 payment step: card, Google Pay, Apple Pay, Zelle (demo), switchable in Settings', () => {
  const client = read('js/client.js'), admin = read('js/admin.js');
  for (const s of ["['gpay', 'Google Pay'", "['applepay', 'Apple Pay'", "['zelle', 'Zelle'", 'Pay with Google Pay', 'Pay with Apple Pay', 'I\\\'ve sent it', 'Awaiting Zelle confirmation', 'placeBooking', 'Card number']) assert.ok(client.includes(s), s);
  for (const s of ['Payment methods', 'zelleContact', 'Mark Zelle paid', 'data-zelle-paid', 'payMethods']) assert.ok(admin.includes(s), s);
});

test('v4 adds no social links, no women imagery, no other analytics', () => {
  for (const f of ['light.css', 'js/app.js', 'js/home.js', 'js/config.js', 'index.html']) {
    const s = read(f);
    assert.ok(!/wa\.me|whatsapp|facebook\.com|instagram\.com|google-analytics|gtag\(|<img/i.test(s), f);
  }
});
