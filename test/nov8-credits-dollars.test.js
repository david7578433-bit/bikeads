// Nov 8 2026 5:15 PM, David: "take it down" (the video credit line on the main page) + money written as "dollars".
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const site = path.join(__dirname, '..', 'docs');
const read = (p) => fs.readFileSync(path.join(site, p), 'utf8');

function loadUI() {
  const doc = { addEventListener() {}, createElement: () => ({}), body: { appendChild() {}, classList: { add() {}, remove() {} } }, querySelector: () => null, querySelectorAll: () => [] };
  const win = { document: doc, matchMedia: () => ({ matches: false }), localStorage: { getItem: () => null, setItem() {} } };
  const ctx = Object.assign({ window: win, console, document: doc }, win); win.window = win; vm.createContext(ctx);
  vm.runInContext(read('js/ui.js'), ctx);
  return win.UI;
}

test('money is written in words: "1,500 dollars", cents only when they matter', () => {
  const { money } = loadUI();
  assert.strictEqual(money(1500), '1,500 dollars');
  assert.strictEqual(money(1500.5), '1,500.50 dollars');
  assert.strictEqual(money(75), '75 dollars');
  assert.strictEqual(money(0), '0 dollars');
  assert.strictEqual(money(-20), '-20 dollars');
  assert.strictEqual(money('2400'), '2,400 dollars');
  assert.strictEqual(money(1499.999), '1,500 dollars');
  assert.doesNotMatch(read('js/ui.js'), /'\$' \+/, 'no dollar sign in the shared formatter');
  assert.doesNotMatch(read('js/home.js'), /'\$' \+/, 'main page prices use the shared formatter');
  assert.doesNotMatch(read('js/admin.js'), /\(\$\)/, 'admin labels say (dollars), not ($)');
});

function loadVideo(saved) {
  const win = { matchMedia: () => ({ matches: false }), indexedDB: null, UI: { esc: (s) => String(s), modal() {} } };
  const ctx = Object.assign({ window: win, console }, win); win.window = win; vm.createContext(ctx);
  win.Data = ctx.Data = { settings: () => saved, saveSettings() {} };
  vm.runInContext(read('js/settings.js'), ctx);
  ctx.SiteSettings = win.SiteSettings; ctx.UI = win.UI;
  vm.runInContext(read('js/homevideo.js'), ctx);
  return win.HomeVideo;
}

test('the video credit is OFF the main page and behind a small "Credits" link in the footer', () => {
  const h = read('js/home.js'), v = read('js/homevideo.js');
  assert.doesNotMatch(h, /id="video-credit"/, 'no credit pill on the hero video');
  assert.doesNotMatch(h, /Main video: <a/, 'no "Main video:" line in the footer');
  assert.match(h, /data-credits>Credits<\/button>/);
  assert.match(h, /HomeVideo\.openCredits\(\)/);
  assert.doesNotMatch(v, /creditEl/, 'mount() no longer writes a credit on the page');
});

test('credit text is an admin setting; the default credit hides with your own video; empty = no Credits link', () => {
  const s = read('js/settings.js');
  assert.match(s, /f\('videoCredit', /); assert.match(s, /f\('videoCreditUrl', /);
  let HV = loadVideo({});
  assert.strictEqual(HV.credit().text, 'Video: the Dronalist, CC BY 3.0, via Wikimedia Commons');
  assert.match(HV.credit().url, /^https:\/\/commons\.wikimedia\.org\//);
  assert.match(HV.creditHtml(), /<a href="https:\/\/commons[^>]+>Video: the Dronalist/);
  HV = loadVideo({ homeVideoMode: 'url', homeVideoUrl: 'https://x.test/v.mp4' });
  assert.strictEqual(HV.credit(), null, 'own video: default credit hides by itself');
  HV = loadVideo({ homeVideoMode: 'url', homeVideoUrl: 'https://x.test/v.mp4', videoCredit: 'Video: Metro Drive / YouTube, CC BY' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(HV.credit())), { text: 'Video: Metro Drive / YouTube, CC BY', url: '' });
  HV = loadVideo({ videoCredit: '' });
  assert.strictEqual(HV.credit(), null, 'admin cleared it');
  assert.strictEqual(HV.creditHtml(), '');
});
