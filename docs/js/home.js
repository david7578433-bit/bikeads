/* Media on Wheels v4 — the open main page (no login needed) and its editor in Admin → Settings.
 * Order: video + headline → What we do → How it works → Prices → Reach (Videos section taken off Nov 8 2026) → Feedback → Why us → Our story → Contact / Book.
 * Numbers, reviews and the story start as clearly marked SAMPLES; the owner replaces them in
 * Admin → Settings → "Main page content". Nothing on this page is presented as a real fact until he does. */
(function () {
  'use strict';
  const { esc, $, $$, toast } = UI;
  const money = (n) => (Number(n) % 1 ? UI.money(n) : '$' + Math.round(Number(n) || 0).toLocaleString('en-US'));

  const DEFAULTS = {
    headline: 'Your ad, riding every street',
    subline: 'We put your business on the grocery-delivery bikes of Williamsburg and Boro Park. Seen all day, on every block.',
    stats: [
      { value: '10 hrs', label: 'on the street every day' },
      { value: '25,000+', label: 'people pass the bikes each week' },
      { value: '300+', label: 'street blocks covered' },
      { value: '2', label: 'neighborhoods: Williamsburg & Boro Park' }
    ],
    statsSample: true,
    reviews: [
      { quote: 'We put our name on five bikes for a month. Customers told us they saw us on Lee Avenue.', name: 'Yossi K.', company: 'Corner Bakery' },
      { quote: 'Easy to book, the price was clear before we paid, and the bikes really ride all day.', name: 'Moshe W.', company: 'Main St Hardware' },
      { quote: 'For our clients it is a new way to be seen in the neighborhood, and simple to plan around Yom Tov.', name: 'Chaim B.', company: 'Brand Line Marketing' }
    ],
    reviewsSample: true,
    story: 'Every day, grocery-delivery bikes ride up and down Williamsburg and Boro Park. They go down every block and stop at every door, and everybody sees them. We saw that each of these bikes can carry a message. Media on Wheels puts local businesses on those bikes, so their name rides through the neighborhood all day long.',
    storySample: true,
    contactPhone: '',
    contactEmail: '',
    videos: []
  };

  function content() {
    const c = Object.assign({}, DEFAULTS, Data.settings().homeContent || {});
    ['stats', 'reviews', 'videos'].forEach((k) => { if (!Array.isArray(c[k])) c[k] = DEFAULTS[k]; });
    return c;
  }
  const brand = () => Data.settings().businessName || 'Media on Wheels';
  const sample = (on, what) => on ? '<span class="sample-tag" title="Sample — the owner will replace it with the real ' + what + '">Sample</span>' : '';
  const okVideo = (u) => /^https:\/\/[^\s"'<>]+\.(mp4|webm)(\?[^\s"'<>]*)?$/i.test(String(u || '').trim());
  const okHttps = (u) => /^https:\/\/[^\s"'<>]+$/i.test(String(u || '').trim());
  const smooth = () => (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
  const logo = '<span class="logo" aria-hidden="true"><i class="lf r"></i><i class="lf b"></i></span>';

  let ride = null, io = null;
  const ADS = ['Your Ad Here', 'Media on Wheels', 'Fresh Basket', 'Your Ad Here', 'Corner Bakery', 'Sunny Deli', 'Main St Hardware', 'Your Shop', 'Green Grocer', 'Your Ad Here'];

  function nav(user) {
    const right = user ? '<a class="btn primary pill lnav-cta" href="#/' + user.role + '">My account</a>' : '<a class="btn primary pill lnav-cta" href="#/login">Log in</a>';
    return '<header class="lnav"><a class="brand" href="#/" data-jump="top">' + logo + esc(brand()) + '</a>' +
      '<nav class="lnav-links" aria-label="Main page"><a href="#what" data-jump="what">What we do</a><a href="#prices" data-jump="prices">Prices</a><a href="#feedback" data-jump="feedback">Feedback</a><a href="#contact" data-jump="contact">Contact</a></nav>' +
      '<button type="button" class="btn ghost pill lnav-call" data-contact="home-header" aria-label="Contact us"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/></svg><span class="lc-t">Contact us</span></button>' + right + '</header>';
  }

  function hero(c, user) {
    return '<section class="home-hero" id="top" aria-labelledby="hero-h"><div class="hero-video">' +
      '<video id="hero-video" muted loop playsinline aria-hidden="true" tabindex="-1" poster="' + esc(posterUrl()) + '"></video><div class="hero-fade" aria-hidden="true"></div>' +
      '<div class="hero-copy"><span class="hero-kicker">' + esc((window.SiteSettings && (SiteSettings.get('heroKicker') || SiteSettings.areasText())) || 'Williamsburg & Boro Park') + '</span>' +
      '<h1 id="hero-h">' + esc(c.headline) + '</h1><p>' + esc(c.subline) + '</p>' +
      '<div class="hero-cta">' + bookOrJoin(user, 'btn primary big pill') + '<a class="btn big pill white" href="#prices" data-jump="prices">See prices</a></div></div>' +
      '<span class="video-credit" id="video-credit" hidden></span></div></section>';
  }

  /* Nov 8 2026 (David): "Only if you are signed in can you press Book Bikes". Signed out: "Create an account" instead. */
  function bookOrJoin(user, cls, short) {
    if (!user) return '<a class="' + cls + '" href="#/signup">' + (short ? 'Create account' : 'Create an account') + '</a>';
    return '<a class="' + cls + '" href="#/' + (user.role === 'client' ? 'client/book' : user.role) + '" data-book>' + (window.SiteSettings && SiteSettings.get('requestFirst') === false ? 'Book bikes' : 'Request bikes') + '</a>'; /* Nov 8 2026 5:13 PM: a request first */
  }

  function head(id, h, p) { return '<div class="sec-head"><h2 id="' + id + '-h">' + h + '</h2>' + (p ? '<p>' + p + '</p>' : '') + '</div>'; }

  function what() {
    const items = [['🚲', 'Ads on grocery bikes', 'Your sign rides on the bikes that deliver groceries to homes every day.'],
      ['📍', 'Williamsburg &amp; Boro Park', 'The bikes ride the busy local streets, block after block.'],
      ['👀', 'Seen all day', 'From morning to evening, people on the street see your name again and again.']];
    return '<section class="sec" id="what" aria-labelledby="what-h">' + head('what', 'What we do', 'Simple outdoor advertising that moves through the neighborhood.') +
      '<div class="grid3">' + items.map(([i, h, p]) => '<div class="tile"><span class="tile-ico" aria-hidden="true">' + i + '</span><h3>' + h + '</h3><p>' + p + '</p></div>').join('') + '</div></section>';
  }

  const posterUrl = () => { const p = window.SiteSettings && String(SiteSettings.get('heroPoster') || '').trim(); return p && okHttps(p) ? p : HomeVideo.DEFAULT.poster; };
  function how() {
    if (window.SiteSettings) { /* Nov 8 2026: Admin → Site content → "How it works" steps */
      const st = SiteSettings.get('howSteps').filter((x) => x && (x.title || x.text));
      return '<section class="sec" id="how" aria-labelledby="how-h">' + head('how', 'How it works', st.length === 3 ? 'Three steps, all online.' : 'All online.') +
        '<div class="grid3">' + st.map((x, i) => '<div class="tile"><span class="how-n">' + (i + 1) + '</span><h3>' + esc(x.title) + '</h3><p>' + esc(x.text) + '</p></div>').join('') + '</div></section>';
    }
    const steps = [['1', 'Pick area &amp; dates', 'Choose where the bikes ride and the days, on a calendar with English and Hebrew dates.'],
      ['2', 'See your price', 'Printing &amp; setup and the weekly charge, added up before you pay.'],
      ['3', 'Your ad rides', 'We print your sign and the bikes carry it up and down the streets.']];
    return '<section class="sec" id="how" aria-labelledby="how-h">' + head('how', 'How it works', 'Three steps, all online.') +
      '<div class="grid3">' + steps.map(([n, h, p]) => '<div class="tile"><span class="how-n">' + n + '</span><h3>' + h + '</h3><p>' + p + '</p></div>').join('') + '</div></section>';
  }

  function prices(user) {
    const s = Data.settings();
    const setup = +s.setupFeePerBike || 0, weekly = +s.weeklyPerBike || 0;
    const ex = 5 * setup + 5 * weekly * 4;
    return '<section class="sec" id="prices" aria-labelledby="prices-h">' + head('prices', 'Prices', 'Clear prices, shown before you pay.') +
      (s.pricesAreSamples ? '<p class="sec-note">' + sample(true, 'prices') + ' These are sample prices until the real ones are set.</p>' : '') +
      '<div class="grid3 prices">' +
      '<div class="tile price"><span class="price-k">Printing &amp; setup</span><span class="price-v">' + money(setup) + '</span><span class="price-u">per bike, one time</span></div>' +
      '<div class="tile price"><span class="price-k">Weekly</span><span class="price-v">' + money(weekly) + '</span><span class="price-u">per bike, per week</span></div>' +
      '<div class="tile price ex"><span class="price-k">Example</span><span class="price-v">' + money(ex) + '</span><span class="price-u">5 bikes for 4 weeks, all in</span></div></div>' +
      '<div class="sec-cta">' + bookOrJoin(user, 'btn primary big pill') + '</div></section>';
  }

  function videos(c) {
    const extra = c.videos.filter((v) => okHttps(v.url));
    return '<section class="sec" id="videos" aria-labelledby="videos-h">' + head('videos', 'Videos', 'The streets our bikes ride, and how your ad looks on them.') +
      '<div class="grid2 vids">' +
      '<figure class="vid"><div class="vid-box"><video controls muted playsinline preload="none" poster="' + HomeVideo.DEFAULT.poster + '" src="' + HomeVideo.DEFAULT.phone + '"></video></div><figcaption><b>Williamsburg from above</b><span>Real footage · ' + esc(HomeVideo.DEFAULT.credit) + '</span></figcaption></figure>' +
      '<figure class="vid"><div class="vid-box ride-box"><div class="hero-ride" id="hero-ride"></div></div><figcaption><b>See your ad ride</b><span>Bikes with sample ads on the real streets of Williamsburg · Streets © OpenStreetMap contributors</span></figcaption></figure>' +
      extra.map((v) => '<figure class="vid"><div class="vid-box">' + (okVideo(v.url) ? '<video controls muted playsinline preload="metadata" src="' + esc(v.url.trim()) + '"></video>' : '<a class="vid-link" href="' + esc(v.url.trim()) + '" target="_blank" rel="noopener">▶ Watch</a>') + '</div><figcaption><b>' + esc(v.title || 'Video') + '</b></figcaption></figure>').join('') +
      '</div></section>';
  }

  function reach(c) {
    return '<section class="sec" id="reach" aria-labelledby="reach-h">' + head('reach', 'How many people see us', c.statsSample ? sample(true, 'numbers') + ' Sample numbers, to be replaced with real counts.' : 'Our bikes are on the street every day.') +
      '<div class="grid4">' + c.stats.filter((x) => x.value || x.label).map((x) => '<div class="tile stat"><span class="stat-v">' + esc(x.value) + '</span><span class="stat-l">' + esc(x.label) + '</span></div>').join('') + '</div></section>';
  }

  function feedback(c) {
    return '<section class="sec" id="feedback" aria-labelledby="feedback-h">' + head('feedback', 'What businesses say', c.reviewsSample ? sample(true, 'reviews') + ' Sample reviews. Real ones from customers and marketing companies go here.' : 'From businesses and marketing companies that ride with us.') +
      '<div class="grid3">' + c.reviews.filter((r) => r.quote).map((r) => '<figure class="tile quote"><blockquote>“' + esc(r.quote) + '”</blockquote><figcaption><b>' + esc(r.name) + '</b>' + (r.company ? '<span>' + esc(r.company) + '</span>' : '') + '</figcaption></figure>').join('') + '</div></section>';
  }

  function why() {
    const items = [['Seen where your customers live', 'The bikes ride the streets of Williamsburg and Boro Park, right past homes and stores.'],
      ['Price before you pay', 'Printing &amp; setup plus a weekly charge, added up for you.'],
      ['Book in minutes', 'Pick dates on a calendar with English and Hebrew dates, Shabbos and Yom Tov marked.'],
      ['You choose how many bikes', 'Start with one bike or put your name on many.']];
    return '<section class="sec" id="why" aria-labelledby="why-h">' + head('why', 'Why ' + esc(brand()), '') +
      '<div class="grid2 why">' + items.map(([h, p]) => '<div class="tile"><span class="why-dot" aria-hidden="true"></span><h3>' + h + '</h3><p>' + p + '</p></div>').join('') + '</div></section>';
  }

  function story(c) {
    return '<section class="sec story" id="story" aria-labelledby="story-h">' + head('story', 'Our story', '') +
      '<div class="tile story-card">' + (c.storySample ? '<p class="sec-note">' + sample(true, 'story') + ' A sample story, to be replaced with the real one.</p>' : '') +
      esc(c.story).split(/\n\s*\n/).map((p) => '<p>' + p + '</p>').join('') + '</div></section>';
  }

  /* Nov 8 2026: questions & answers (Admin → Site content → FAQ; Admin → Switches can hide it) */
  function faq() {
    const items = window.SiteSettings ? SiteSettings.get('faq').filter((x) => x && x.q && x.a) : [];
    if (!items.length) return '';
    return '<section class="sec" id="faq" aria-labelledby="faq-h">' + head('faq', 'Questions & answers', '') +
      '<div class="faq-list">' + items.map((x) => '<details class="tile faq-item"><summary>' + esc(x.q) + '</summary><p>' + esc(x.a) + '</p></details>').join('') + '</div></section>';
  }

  function contact(c, user) {
    const lines = [];
    if (c.contactPhone) lines.push('<a class="btn big pill white" href="tel:' + esc(c.contactPhone.replace(/[^\d+]/g, '')) + '">Call ' + esc(c.contactPhone) + '</a>');
    if (c.contactEmail) lines.push('<a class="btn big pill white" href="mailto:' + esc(c.contactEmail) + '">' + esc(c.contactEmail) + '</a>');
    const addr = window.SiteSettings ? String(SiteSettings.get('contactAddress') || '').trim() : '';
    if (addr) lines.push('<span class="contact-addr">' + esc(addr) + '</span>');
    return '<section class="sec book-sec" id="contact" aria-labelledby="contact-h"><div class="book-panel">' +
      '<h2 id="contact-h">Ready to put your ad on the street?</h2><p>Pick your dates and bikes, see the price, and send your request online.</p>' +
      '<div class="hero-cta center">' + (!user || user.role === 'admin' ? (user ? bookOrJoin(user, 'btn primary big pill') : '') + '<a class="btn big pill ' + (user ? 'white' : 'primary') + '" href="#/signup">Create an account</a>' : bookOrJoin(user, 'btn primary big pill')) + '</div>' +
      (lines.length ? '<div class="contact-lines">' + lines.join('') + '</div>' : '') +
      /* Nov 8 2026 (David): Request a call + Leave feedback */
      '<div class="contact-more"><button type="button" class="btn big pill white" data-contact="home-contact">Contact us</button><button type="button" class="btn big pill white" data-feedback="home">Leave feedback</button></div></div></section>';
  }

  function foot() {
    const ft = window.SiteSettings ? String(SiteSettings.get('footerText') || '').trim() : '';
    return '<footer class="lfoot"><span>' + logo + esc(brand()) + '</span>' + (ft ? '<span class="lfoot-text">' + esc(ft) + '</span>' : '') + '<span class="muted small">Main video: <a href="' + HomeVideo.DEFAULT.creditUrl + '" target="_blank" rel="noopener">' + esc(HomeVideo.DEFAULT.credit) + '</a></span><span class="lfoot-links"><button type="button" class="linkish" data-feedback="home">Leave feedback</button><button type="button" class="linkish" data-contact="home-footer">Contact us</button><a href="#/login">Log in</a></span></footer>';
  }

  function dock(user) {
    return '<nav class="dock" aria-label="Quick links">' + bookOrJoin(user, 'dock-btn d-blue', true) +
      '<a class="dock-btn d-sun" href="#prices" data-jump="prices">Prices</a><a class="dock-btn d-rose" href="#contact" data-jump="contact">Contact</a></nav>';
  }

  const HomePage = {
    DEFAULTS, content,
    render(app, user) {
      const c = content();
      document.title = (window.SiteSettings && SiteSettings.pageTitle) || (brand() + ' · Ads on grocery-delivery bikes in Williamsburg & Boro Park'); /* Admin → Google & sharing */
      app.innerHTML = '<main class="auth home v4 mow">' + nav(user) + '<div class="lpanel">' + hero(c, user) + what() + how() + prices(user) + /* Nov 8 2026 (David: "take this down"): no Videos section */ reach(c) + feedback(c) + why() + story(c) + faq() + contact(c, user) + '</div>' + foot() + dock(user) + '</main>';
      if (window.HomeVideo) HomeVideo.mount($('#hero-video'), $('#video-credit'));
      $$('[data-jump]', app).forEach((l) => l.addEventListener('click', (e) => {
        const t = document.getElementById(l.getAttribute('data-jump')); if (!t) return;
        e.preventDefault(); t.scrollIntoView({ behavior: smooth(), block: 'start' });
      }));
      // the ad-bike animation starts only when its card scrolls into view (keeps the first paint fast)
      const host = $('#hero-ride');
      const start = () => {
        if (ride || !host || !window.BikeRide) return;
        const phone = window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
        ride = BikeRide.mount(host, { count: phone ? 7 : 10, labels: ADS, seed: 23, speed: phone ? 1.3 : 1.5, maxDpr: phone ? 1.5 : 2, bikeScale: 1.0, bg: '#f2f7fd' });
      };
      if (!host) return; /* the Videos section (with the ad-bike animation) is off the page since Nov 8 2026 */
      if ('IntersectionObserver' in window) { io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { start(); io.disconnect(); io = null; } }, { rootMargin: '200px' }); io.observe(host); } else start();
    },
    teardown() { if (io) { io.disconnect(); io = null; } if (ride) { ride.destroy(); ride = null; } },

    /* Admin → Settings → "Main page content" */
    renderAdmin(host) {
      if (!host) return;
      const c = content();
      const stats = [0, 1, 2, 3].map((i) => c.stats[i] || { value: '', label: '' });
      const reviews = [0, 1, 2].map((i) => c.reviews[i] || { quote: '', name: '', company: '' });
      const vids = [0, 1, 2].map((i) => c.videos[i] || { title: '', url: '' });
      host.innerHTML = '<h2>Main page content</h2><p class="muted">What visitors read on the main page. Numbers, reviews and the story start as <b>samples</b>; type the real ones and untick “sample”.</p>' +
        '<p><a class="btn ghost pill" href="#/home" target="_blank" rel="noopener">Open the main page</a></p>' +
        '<form id="hc-form" class="form hc">' +
        '<h3>Top of the page</h3><label>Headline<input class="input" name="headline" maxlength="90" value="' + esc(c.headline) + '"></label>' +
        '<label>Line under the headline<textarea class="input" name="subline" rows="2" maxlength="220">' + esc(c.subline) + '</textarea></label>' +
        '<h3>How many people see us</h3>' + stats.map((x, i) => '<div class="two"><label>Number ' + (i + 1) + '<input class="input" name="sv' + i + '" value="' + esc(x.value) + '"></label><label>What it counts<input class="input" name="sl' + i + '" value="' + esc(x.label) + '"></label></div>').join('') +
        '<label class="check"><input type="checkbox" name="statsSample"' + (c.statsSample ? ' checked' : '') + '> These are still sample numbers</label>' +
        '<h3>Feedback</h3>' + reviews.map((r, i) => '<fieldset class="hc-rev"><legend>Review ' + (i + 1) + '</legend><label>What they said<textarea class="input" name="rq' + i + '" rows="2">' + esc(r.quote) + '</textarea></label><div class="two"><label>Name<input class="input" name="rn' + i + '" value="' + esc(r.name) + '"></label><label>Company<input class="input" name="rc' + i + '" value="' + esc(r.company) + '"></label></div></fieldset>').join('') +
        '<label class="check"><input type="checkbox" name="reviewsSample"' + (c.reviewsSample ? ' checked' : '') + '> These are still sample reviews</label>' +
        '<h3>Our story</h3><label>Story (leave an empty line between paragraphs)<textarea class="input" name="story" rows="6">' + esc(c.story) + '</textarea></label>' +
        '<label class="check"><input type="checkbox" name="storySample"' + (c.storySample ? ' checked' : '') + '> This is still a sample story</label>' +
        '<h3>Contact</h3><div class="two"><label>Phone (optional)<input class="input" name="contactPhone" type="tel" value="' + esc(c.contactPhone) + '"></label><label>Email (optional)<input class="input" name="contactEmail" type="email" value="' + esc(c.contactEmail) + '"></label></div>' +
        '<h3>More videos (optional)</h3><p class="muted small">Links to more videos for the Videos section (https, an .mp4/.webm file plays right on the page).</p>' +
        vids.map((v, i) => '<div class="two"><label>Title<input class="input" name="vt' + i + '" value="' + esc(v.title) + '"></label><label>Link<input class="input" name="vu' + i + '" type="url" inputmode="url" value="' + esc(v.url) + '"></label></div>').join('') +
        '<p class="err" id="hc-err" role="alert"></p>' +
        '<div class="row-end"><button type="button" class="btn ghost" id="hc-reset">Back to samples</button><button class="btn primary">Save main page</button></div></form>';
      const f = host.querySelector('#hc-form');
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = (n) => f[n].value.trim();
        const videosOut = [0, 1, 2].map((i) => ({ title: v('vt' + i), url: v('vu' + i) })).filter((x) => x.url);
        if (videosOut.some((x) => !okHttps(x.url))) { host.querySelector('#hc-err').textContent = 'Video links must start with https://'; return; }
        Data.saveSettings({ homeContent: {
          headline: v('headline') || DEFAULTS.headline, subline: v('subline'),
          stats: [0, 1, 2, 3].map((i) => ({ value: v('sv' + i), label: v('sl' + i) })), statsSample: f.statsSample.checked,
          reviews: [0, 1, 2].map((i) => ({ quote: v('rq' + i), name: v('rn' + i), company: v('rc' + i) })), reviewsSample: f.reviewsSample.checked,
          story: v('story'), storySample: f.storySample.checked, contactPhone: v('contactPhone'), contactEmail: v('contactEmail'), videos: videosOut } });
        toast('Main page saved');
      });
      host.querySelector('#hc-reset').addEventListener('click', () => { Data.saveSettings({ homeContent: null }); toast('Main page back to the samples'); HomePage.renderAdmin(host); });
    }
  };
  window.HomePage = HomePage;
})();
