// Nov 9 2026, David ("yes", Nov 8 10:42 PM PT): main page hero = Boro Park street drive (Metro Drive, CC BY), no women in it.
// Credit stays behind the footer's "Credits" link, not on the main page. Old Williamsburg drone files are kept.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const site = path.join(__dirname, '..', 'docs');
const read = (p) => fs.readFileSync(path.join(site, p), 'utf8');

function loadVideo(saved) {
  const win = { matchMedia: () => ({ matches: false }), indexedDB: null, UI: { esc: (s) => String(s), modal() {} } };
  const ctx = Object.assign({ window: win, console }, win); win.window = win; vm.createContext(ctx);
  win.Data = ctx.Data = { settings: () => saved, saveSettings() {} };
  vm.runInContext(read('js/settings.js'), ctx);
  ctx.SiteSettings = win.SiteSettings; ctx.UI = win.UI;
  vm.runInContext(read('js/homevideo.js'), ctx);
  return win.HomeVideo;
}

test('hero video default is the Boro Park street drive, small files, old drone files kept', () => {
  const HV = loadVideo({});
  assert.strictEqual(HV.DEFAULT.src, 'media/hero-boropark.mp4');
  assert.strictEqual(HV.DEFAULT.phone, 'media/hero-boropark-phone.mp4');
  assert.strictEqual(HV.DEFAULT.poster, 'media/hero-poster-boropark.jpg');
  for (const f of ['hero-boropark.mp4', 'hero-boropark-phone.mp4', 'hero-poster-boropark.jpg', 'hero-williamsburg.mp4', 'hero-williamsburg-phone.mp4', 'hero-poster.jpg'])
    assert.ok(fs.existsSync(path.join(site, 'media', f)), f);
  assert.ok(fs.statSync(path.join(site, 'media', 'hero-boropark.mp4')).size <= 2.5 * 1048576, 'hero video ≤ 2.5 MB');
  assert.ok(fs.statSync(path.join(site, 'media', 'hero-boropark-phone.mp4')).size <= 1048576, 'phone video ≤ 1 MB');
  assert.strictEqual(HV.WBURG_DRONE.src, 'media/hero-williamsburg.mp4', 'previous default kept');
  const v = read('js/homevideo.js');
  for (const a of ['muted', 'loop', 'playsinline', 'autoplay']) assert.match(v, new RegExp(a), a);
  assert.match(v, /prefers-reduced-motion/, 'reduced motion keeps the poster');
  assert.ok(read('sw.js').includes('"media/hero-poster-boropark.jpg"'), 'new poster cached for offline');
});

test('hero credit: Metro Drive / YouTube, CC BY, behind the footer Credits link only', () => {
  const HV = loadVideo({});
  assert.deepStrictEqual(JSON.parse(JSON.stringify(HV.credit())), { text: 'Street video: Metro Drive / YouTube, CC BY', url: 'https://www.youtube.com/watch?v=7AW62YT1bG0' });
  assert.match(HV.creditHtml(), /href="https:\/\/www\.youtube\.com\/watch\?v=7AW62YT1bG0"/);
  const s = read('js/settings.js');
  assert.match(s, /VIDEO_CREDIT = 'Street video: Metro Drive \/ YouTube, CC BY'/);
  assert.match(s, /VIDEO_CREDIT_URL = 'https:\/\/www\.youtube\.com\/watch\?v=7AW62YT1bG0'/);
  const h = read('js/home.js');
  assert.doesNotMatch(h, /Metro Drive/, 'no credit text on the main page itself');
  assert.match(h, /HomeVideo\.openCredits\(\)/);
  assert.strictEqual(loadVideo({ homeVideoMode: 'url', homeVideoUrl: 'https://x.test/v.mp4' }).credit(), null, 'own video hides the default credit');
});
