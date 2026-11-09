/* Media on Wheels — every admin setting in one place (Nov 8 2026, David: "an admin menu … where I can do everything").
 * SiteSettings.SECTIONS describes each setting (label, help, type, default). Values live in the ONE settings object the
 * site already keeps (Data.settings(): this device, or the shared Supabase table mow_settings when its keys are set).
 * SiteSettings.get(key) = the saved value or the default. SiteSettings.apply() puts colors, fonts, logo, switches,
 * the maintenance banner and SEO texts on the page right away. Nothing here sends email or SMS. */
(function () {
  'use strict';

  const AREAS = ['Williamsburg', 'Boro Park'];
  const BRAND = '#2f62a8';
  const PRESETS = [['Calm blue', '#2f62a8'], ['Navy', '#1e3a8a'], ['Indigo', '#4f46e5'], ['Green', '#15803d'], ['Teal', '#0f766e'], ['Red', '#b91c1c'], ['Orange', '#c2410c'], ['Gold', '#a16207'], ['Charcoal', '#334155']];
  /* Only fonts that are free (SIL Open Font License) and already saved in docs/fonts, plus the phone's own font. */
  const FONTS_BODY = [['Plus Jakarta Sans', 'Plus Jakarta Sans (OFL)'], ['Heebo', 'Heebo (OFL)'], ['system', "The phone's own font"]];
  const FONTS_HEAD = [['DM Serif Display', 'DM Serif Display (OFL)'], ['Plus Jakarta Sans', 'Plus Jakarta Sans (OFL)'], ['Heebo', 'Heebo (OFL)']];
  const FIELDS4 = [['company', 'Business / company name (shown on the ads)', 'e.g. Fresh Basket Grocery', true],
    ['email', 'Email address', '', true], ['phone', 'Phone number', '(845) 555-0123', true],
    ['campaign', 'Campaign description', "What's the campaign about? (optional)", false]];

  const f = (k, label, type, def, more) => Object.assign({ k, label, type, def }, more || {});
  const SECTIONS = [
    { key: 'pricing', title: 'Pricing', icon: 'money', intro: 'What clients pay. Changes show on the price step and the main page right away.', fields: [
      f('setupFeePerBike', 'Printing & setup, per bike (one time)', 'number', 150, { suffix: 'dollars', min: 0, step: 1, live: true }),
      f('weeklyPerBike', 'Weekly charge, per bike per week', 'number', 75, { suffix: 'dollars', min: 0, step: 1, live: true }),
      f('depositPct', 'Deposit paid when booking', 'number', 20, { suffix: '%', min: 0, max: 100, step: 1, live: true }),
      f('minBikes', 'Minimum bikes per booking', 'number', 5, { suffix: 'bikes', min: 1, step: 1, live: true, help: 'The minus button stops here.' }),
      f('maxBikes', 'Most bikes in one booking', 'number', 500, { suffix: 'bikes', min: 1, step: 1, live: true }),
      f('weeksMin', 'Shortest booking', 'number', 1, { suffix: 'weeks', min: 1, step: 1, live: true }),
      f('weeksMax', 'Longest booking', 'number', 52, { suffix: 'weeks', min: 1, step: 1, live: true }),
      f('pricesAreSamples', 'Still sample prices (shows a "sample prices" note)', 'toggle', false, { live: true }),
      f('pricePerBikeDay', "Admin's own booking editor: price per bike per day", 'number', 25, { suffix: 'dollars', min: 0, step: 1, live: true }),
      { k: '@discounts', type: 'part', label: 'Discounts and promo codes' },
      { k: '@paymethods', type: 'part', label: 'Payment methods (Card, Google Pay, Apple Pay, Zelle)' }
    ] },
    { key: 'calendar', title: 'Calendar & days', icon: 'cal', intro: 'The booking calendar. The bikes ride 6 days a week: Shabbos is always closed.', fields: [
      f('shabbosNoteOn', 'Show the Shabbos line above the calendar', 'toggle', true, { live: true }),
      f('shabbosNote', 'Shabbos line text', 'text', 'The bikes do not ride on Shabbos.', { live: true }),
      f('holidayDots', 'Show the small holiday dot and "This day is a holiday" line', 'toggle', true, { live: true }),
      f('leadDays', 'Booking lead time (earliest start, days from today)', 'number', 0, { suffix: 'days', min: 0, max: 90, step: 1, live: true, help: '0 = a client can start today.' }),
      f('blockedDates', 'Blocked days (no bookings on these days)', 'dates', [], { live: true })
    ] },
    { key: 'content', title: 'Site content', icon: 'list', intro: 'All the words on the main page. Changes show on the site right away.', fields: [
      f('businessName', 'Business name', 'text', 'Media on Wheels', { live: true }),
      f('tagline', 'Tagline (under the name on the sign-in page)', 'text', 'Ads on grocery-delivery bikes in Williamsburg and Boro Park.', { live: true }),
      f('heroKicker', 'Small line above the headline', 'text', '', { live: true, help: 'Empty = the service areas, e.g. "Williamsburg & Boro Park".' }),
      f('homeContent.headline', 'Main headline', 'text', 'Your ad, riding every street', { live: true }),
      f('homeContent.subline', 'Text under the headline', 'textarea', 'We put your business on the grocery-delivery bikes of Williamsburg and Boro Park. Seen all day, on every block.', { live: true }),
      { k: '@homevideo', type: 'part', label: 'Main video (upload or link)' },
      f('heroPoster', 'Picture shown before the video plays (https link, optional)', 'url', '', { live: true, help: 'No pictures of women (tznius).' }),
      f('howSteps', '"How it works" steps', 'items', [
        { title: 'Pick your dates', text: 'Choose the days and how many bikes, on a calendar with English and Hebrew dates.' },
        { title: 'See your price', text: 'Printing & setup and the weekly charge, added up before you pay.' },
        { title: 'Your ad rides', text: 'We print your sign and the bikes carry it up and down the streets.' }], { item: [['title', 'Title'], ['text', 'Text', 'textarea']], live: true }),
      f('faq', 'Questions & answers (FAQ)', 'items', [
        { q: 'Do the bikes ride on Shabbos?', a: 'No. The bikes ride 6 days a week, Sunday to Friday.' },
        { q: 'How long can I book?', a: 'By the week. Pick the first and last day on the calendar; the price is shown before you pay.' },
        { q: 'When do I pay?', a: 'A deposit when you book, and the rest later.' }], { item: [['q', 'Question'], ['a', 'Answer', 'textarea']], live: true }),
      f('serviceAreas', 'Service areas', 'list', AREAS.slice(), { live: true, placeholder: 'e.g. Crown Heights' }),
      f('homeContent.contactPhone', 'Contact phone', 'text', '', { live: true }),
      f('homeContent.contactEmail', 'Contact email', 'text', '', { live: true }),
      f('contactAddress', 'Contact address', 'text', '', { live: true }),
      f('footerText', 'Footer text', 'text', '', { live: true, help: 'A short line at the bottom of the main page.' }),
      { k: '@homecontent', type: 'part', label: 'Numbers, reviews and our story (SAMPLE labels)' }
    ] },
    { key: 'appearance', title: 'Appearance', icon: 'brush', intro: 'Colors, logo and fonts. Free (OFL) fonts only.', fields: [
      f('brandColor', 'Brand color', 'color', BRAND, { presets: PRESETS, live: true }),
      f('logoUrl', 'Logo', 'image', '', { live: true, help: 'Upload a small PNG/JPG/SVG (under 150 KB) or paste an https link. Empty = the built-in logo.' }),
      f('fontBody', 'Text font', 'select', 'Plus Jakarta Sans', { options: FONTS_BODY, live: true }),
      f('fontHeading', 'Headline font', 'select', 'DM Serif Display', { options: FONTS_HEAD, live: true }),
      f('themeMode', 'Light or dark', 'select', 'light', { options: [['light', 'Light'], ['dark', 'Dark']], live: true })
    ] },
    { key: 'form', title: 'Booking form', icon: 'form', intro: 'Step 1 of booking. Turn each box on or off, make it required, change its words.', fields: [
      f('requestFirst', 'Clients send a REQUEST first and pay the deposit only after you approve', 'toggle', true, { live: true, help: 'Off = the old way: the client pays the deposit right away and the booking waits for approval.' })].concat(
      FIELDS4.reduce((a, [id, label, ph, req]) => a.concat([
        f('formFields.' + id + '.show', label + ': show', 'toggle', true, { live: true, group: label }),
        f('formFields.' + id + '.required', label + ': required', 'toggle', req, { live: true, group: label }),
        f('formFields.' + id + '.label', label + ': label', 'text', label, { live: true, group: label }),
        f('formFields.' + id + '.help', label + ': help text (inside the box)', 'text', ph, { live: true, group: label })
      ]), [])) },
    { key: 'messages', title: 'Messages', icon: 'chat', intro: 'Texts people see on the site. Nothing is sent by email or SMS. {business} = the business name.', fields: [
      f('msgRequestPopup', 'Pop-up after a request ({bikes}, {dates})', 'text', 'You requested {bikes} bikes for {dates}. We will review it and confirm soon.', { live: true }),
      f('msgRequestTitle', 'Request sent: title', 'text', 'Request sent', { live: true }),
      f('msgRequest', 'Request sent: message', 'textarea', 'Thank you! This is a request, not a booking yet. {business} will review it and confirm. You pay the deposit after it is approved.', { live: true }),
      f('msgDoneTitle', 'Booking done: title', 'text', 'Booking confirmed', { live: true }),
      f('msgDone', 'Booking done: message (card, Google Pay, Apple Pay)', 'textarea', 'Thank you! Your deposit went through (demo) and your booking is sent to {business}.', { live: true }),
      f('msgDoneZelle', 'Booking done: message (Zelle)', 'textarea', 'Thank you! Your booking is sent. It shows as “Awaiting Zelle confirmation” until we see your Zelle payment.', { live: true }),
      f('msgPending', 'Status line under a new booking', 'text', 'until {business} approves it', { live: true }),
      f('msgFeedbackThanks', 'After "Leave feedback"', 'text', 'Thank you for your feedback!', { live: true }),
      f('msgCallThanks', 'After "Request a call back" ({phone} = their number)', 'text', 'We got your request and will call you at {phone}.', { live: true })
    ] },
    { key: 'switches', title: 'Switches', icon: 'toggle', intro: 'Turn parts of the site on and off. Nothing is deleted.', fields: [
      f('show.what', 'Main page: "What we do"', 'toggle', true, { live: true }),
      f('show.how', 'Main page: "How it works"', 'toggle', true, { live: true }),
      f('show.prices', 'Main page: Prices', 'toggle', true, { live: true }),
      f('show.reach', 'Main page: numbers (stats)', 'toggle', true, { live: true }),
      f('show.feedback', 'Main page: reviews (testimonials)', 'toggle', true, { live: true }),
      f('show.why', 'Main page: "Why us"', 'toggle', true, { live: true }),
      f('show.story', 'Main page: "Our story"', 'toggle', true, { live: true }),
      f('show.faq', 'Main page: questions & answers', 'toggle', true, { live: true }),
      f('show.feedbackButton', '"Leave feedback" buttons', 'toggle', true, { live: true }),
      f('show.callButton', '"Contact us" buttons (phone, email, request a call back)', 'toggle', true, { live: true }),
      f('show.bookingMap', 'Bike animation card on the booking page ("More bikes, more streets")', 'toggle', false, { live: true }),
      f('maintenanceOn', 'Maintenance banner at the top of the site', 'toggle', false, { live: true }),
      f('maintenanceText', 'Maintenance banner text', 'text', 'We are updating the site. Some things may be slow for a little while.', { live: true }),
      f('featureDelivery', 'Future delivery business (drivers, stores, dispatch)', 'toggle', false, { help: 'Keep OFF for now. Takes effect the next time the site is opened.' })
    ] },
    { key: 'email', title: 'Email', icon: 'mail', intro: 'Emails to clients and to you. They go out once your email is connected (see the box below). Placeholders: {name} {company} {bikes} {dates} {total} {deposit} {balance} {invoice} {note} {business}.', fields: [
      { k: '@emailstatus', type: 'part', label: 'Email connection' },
      f('emailOn', 'Send emails', 'toggle', true, { live: true }),
      f('emailFromName', 'From name', 'text', 'Media on Wheels', { live: true }),
      f('emailReplyTo', 'Reply-to address (where clients\' answers go)', 'text', '', { live: true, help: 'e.g. your Gmail address.' }),
      f('emailAdminTo', 'Send "new request" emails to', 'text', 'david7578433@gmail.com', { live: true }),
      f('email.requested.subject', 'Request received: subject', 'text', 'Your bike request was received', { live: true, group: 'Request received (to the client)' }),
      f('email.requested.body', 'Request received: text', 'textarea', 'Hi {name},\n\nThank you! We got your request for {bikes} bikes, {dates}. Total {total}.\nThis is a request, not a booking yet. We will review it and confirm soon. You pay the deposit ({deposit}) after we approve it.\n\n{business}', { live: true, group: 'Request received (to the client)' }),
      f('email.newRequest.subject', 'New request: subject', 'text', 'New bike request: {company}, {bikes} bikes', { live: true, group: 'New request (to you)' }),
      f('email.newRequest.body', 'New request: text', 'textarea', '{company} ({name}) asked for {bikes} bikes, {dates}. Total {total}.\nOpen Admin → Bookings to approve or decline.', { live: true, group: 'New request (to you)' }),
      f('email.approved.subject', 'Approved: subject', 'text', 'Your bike request is approved', { live: true, group: 'Approved (to the client)' }),
      f('email.approved.body', 'Approved: text', 'textarea', 'Hi {name},\n\nGood news: your request for {bikes} bikes, {dates}, is approved.\nPlease sign in and pay the deposit of {deposit} under My bookings. Balance later: {balance}.\n{note}\n\n{business}', { live: true, group: 'Approved (to the client)' }),
      f('email.declined.subject', 'Declined: subject', 'text', 'About your bike request', { live: true, group: 'Declined (to the client)' }),
      f('email.declined.body', 'Declined: text', 'textarea', 'Hi {name},\n\nSorry, we cannot take your request for {bikes} bikes, {dates}.\n{note}\nPlease contact us to find other dates.\n\n{business}', { live: true, group: 'Declined (to the client)' }),
      f('email.invoice.subject', 'Invoice: subject', 'text', 'Invoice {invoice} from {business}', { live: true, group: 'Invoice (to the client)' }),
      f('email.invoice.body', 'Invoice: text (the invoice lines are added below it)', 'textarea', 'Hi {name},\n\nHere is your invoice {invoice} for {bikes} bikes, {dates}.', { live: true, group: 'Invoice (to the client)' }),
      f('email.test.subject', 'Test email: subject', 'text', 'Test email from {business}', { live: true, group: 'Test email' }),
      f('email.test.body', 'Test email: text', 'textarea', 'If you can read this, the website can send emails.', { live: true, group: 'Test email' })
    ] },
    { key: 'seo', title: 'Google & sharing', icon: 'search', intro: 'How the site shows on Google and in shared links. The address stays mediaonwheelsnyc.com.', fields: [
      f('seoTitle', 'Page title (Google headline)', 'text', 'Media on Wheels · Ads on grocery-delivery bikes in Williamsburg & Boro Park', { live: true, max: 70 }),
      f('seoDescription', 'Description (Google text)', 'textarea', 'Put your business ad on the grocery-delivery bikes of Williamsburg and Boro Park, Brooklyn. The bikes ride 6 days a week. See prices and book bikes online.', { live: true, max: 160 }),
      f('shareImage', 'Share picture (https link, 1200×630)', 'url', 'https://david7578433-bit.github.io/bikeads/media/og-image.jpg', { live: true, help: 'No pictures of women (tznius).' })
    ] }
  ];
  const BY_KEY = {};
  SECTIONS.forEach((s) => s.fields.forEach((x) => { if (x.k[0] !== '@') BY_KEY[x.k] = Object.assign({ section: s.key }, x); }));

  const clone = (v) => (v == null || typeof v !== 'object') ? v : JSON.parse(JSON.stringify(v));
  const S = () => (window.Data && Data.settings ? Data.settings() : {}) || {};
  function readPath(o, path) { return path.split('.').reduce((a, p) => (a && typeof a === 'object' ? a[p] : undefined), o); }
  function patchFor(path, value) {
    const parts = path.split('.');
    if (parts.length === 1) return { [path]: value };
    const top = clone(S()[parts[0]]) || {};
    let o = top;
    for (let i = 1; i < parts.length - 1; i++) { if (!o[parts[i]] || typeof o[parts[i]] !== 'object') o[parts[i]] = {}; o = o[parts[i]]; }
    if (value === undefined) delete o[parts[parts.length - 1]]; else o[parts[parts.length - 1]] = value;
    return { [parts[0]]: top };
  }

  const SiteSettings = {
    SECTIONS, BY_KEY, PRESETS, AREAS,
    def(key) { const d = BY_KEY[key]; return d ? clone(d.def) : undefined; },
    has(key) { const v = readPath(S(), key); return v !== undefined && v !== null && !(typeof v === 'string' && v === '' && BY_KEY[key] && BY_KEY[key].def !== ''); },
    get(key) {
      const v = readPath(S(), key);
      const d = BY_KEY[key];
      if (v === undefined || v === null) return d ? clone(d.def) : undefined;
      if (d && d.type === 'number') { const n = +v; return isFinite(n) ? n : clone(d.def); }
      if (d && (d.type === 'items' || d.type === 'list' || d.type === 'dates') && !Array.isArray(v)) return clone(d.def);
      return v;
    },
    /* text with {business} filled in */
    text(key) { return String(SiteSettings.get(key) == null ? '' : SiteSettings.get(key)).replace(/\{business\}/g, S().businessName || 'Media on Wheels'); },
    on(key) { return SiteSettings.get(key) !== false; },
    isDefault(key) { return JSON.stringify(SiteSettings.get(key)) === JSON.stringify(SiteSettings.def(key)); },
    /* Save one setting (undefined = back to the default). Returns the previous value (for Undo). */
    async set(key, value) {
      const prev = clone(readPath(S(), key));
      const d = BY_KEY[key];
      if (d && d.type === 'number' && value !== undefined) {
        let n = +value; if (!isFinite(n)) n = +d.def;
        if (d.min != null) n = Math.max(d.min, n); if (d.max != null) n = Math.min(d.max, n);
        value = n;
      }
      const patch = patchFor(key, value);
      patch.settingsUpdatedAt = new Date().toISOString();
      const who = window.App && App.user && App.user();
      if (who) patch.settingsUpdatedBy = who.email || who.name || '';
      await Data.saveSettings(patch);
      SiteSettings.apply();
      return prev;
    },
    reset(key) { return SiteSettings.set(key, undefined); },
    areas() { const a = SiteSettings.get('serviceAreas').map((x) => String(x || '').trim()).filter(Boolean); return a.length ? a : AREAS.slice(); },
    areasText() { const a = SiteSettings.areas(); return a.length > 1 ? a.slice(0, -1).join(', ') + ' & ' + a[a.length - 1] : a[0]; },
    blocked(ds) { return SiteSettings.get('blockedDates').some((x) => (x && (x.date || x)) === ds); },
    blockedNote(ds) { const x = SiteSettings.get('blockedDates').find((y) => (y && (y.date || y)) === ds); return x && x.note ? x.note : ''; },
    earliest() { const n = Math.max(0, Math.round(+SiteSettings.get('leadDays') || 0)); return n ? Data.addDays(Data.today(), n) : Data.today(); },
    field(id) { /* booking-form box: { show, required, label, help } */
      const g = (p) => SiteSettings.get('formFields.' + id + '.' + p);
      return { show: g('show') !== false, required: !!g('required'), label: g('label') || BY_KEY['formFields.' + id + '.label'].def, help: g('help') == null ? '' : g('help') };
    },
    shades(hex) {
      const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim()); if (!m) return null;
      const n = parseInt(m[1], 16), rgb = [n >> 16, (n >> 8) & 255, n & 255];
      const mix = (t, w) => '#' + rgb.map((c) => Math.round(c + (t - c) * w).toString(16).padStart(2, '0')).join('');
      return { brand: '#' + m[1].toLowerCase(), ink: mix(0, .38), bg: mix(255, .88), line: mix(255, .74), soft: mix(255, .95) };
    },
    /* Put the settings on the page now. */
    apply() {
      if (typeof document === 'undefined') return;
      const de = document.documentElement, get = SiteSettings.get;
      const sh = SiteSettings.shades(get('brandColor')) || SiteSettings.shades(BRAND);
      const fb = get('fontBody'), fh = get('fontHeading');
      const fam = (x) => x === 'system' ? "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif" : "'" + x + "', 'Heebo', system-ui, sans-serif";
      const logo = String(get('logoUrl') || '');
      const okLogo = /^(https:\/\/[^\s"'<>()]+|data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+)$/.test(logo);
      let css = 'html:root{--brand:' + sh.brand + ';--accent:' + sh.brand + ';--brand-ink:' + sh.ink + ';--brand-bg:' + sh.bg + ';--brand-line:' + sh.line + ';--brand-soft:' + sh.soft + ';' +
        (fb !== 'Plus Jakarta Sans' ? '--font:' + fam(fb) + ';' : '') + (fh !== 'DM Serif Display' ? '--serif:' + fam(fh) + ';' : '') + '}';
      if (okLogo) css += 'html .logo{background:transparent url("' + logo + '") center/contain no-repeat!important}html .logo .lf{display:none!important}';
      let st = document.getElementById('mow-settings-style');
      if (!st) { st = document.createElement('style'); st.id = 'mow-settings-style'; (document.head || de).appendChild(st); }
      st.textContent = css;
      de.classList.toggle('mow-dark', get('themeMode') === 'dark');
      ['what', 'how', 'prices', 'reach', 'feedback', 'why', 'story', 'faq'].forEach((k) => de.classList.toggle('hide-sec-' + k, get('show.' + k) === false));
      de.classList.toggle('hide-fb-btn', get('show.feedbackButton') === false);
      de.classList.toggle('hide-call-btn', get('show.callButton') === false);
      /* maintenance banner */
      let mb = document.getElementById('mow-maint');
      if (get('maintenanceOn') === true) {
        if (!mb) { mb = document.createElement('div'); mb.id = 'mow-maint'; mb.className = 'mow-maint'; mb.setAttribute('role', 'status'); document.body.insertBefore(mb, document.body.firstChild); }
        mb.textContent = String(get('maintenanceText') || '');
      } else if (mb) mb.remove();
      /* SEO texts (the canonical address mediaonwheelsnyc.com is never changed here) */
      const meta = (sel, v) => { const m = document.querySelector(sel); if (m && v) m.setAttribute('content', v); };
      const t = String(get('seoTitle') || ''), d = String(get('seoDescription') || ''), img = String(get('shareImage') || '');
      if (t) SiteSettings.pageTitle = t;
      meta('meta[name="description"]', d); meta('meta[property="og:description"]', d); meta('meta[name="twitter:description"]', d);
      meta('meta[property="og:title"]', t); meta('meta[name="twitter:title"]', t);
      if (/^https:\/\//.test(img)) { meta('meta[property="og:image"]', img); meta('meta[name="twitter:image"]', img); }
      meta('meta[name="theme-color"]', get('themeMode') === 'dark' ? '#0f141c' : '#ffffff');
      /* the delivery switch is read by js/config.js when the site opens */
      try { localStorage.setItem('mow.features', JSON.stringify({ delivery: get('featureDelivery') === true })); } catch (e) { /* private mode */ }
    }
  };
  window.SiteSettings = SiteSettings;
})();
