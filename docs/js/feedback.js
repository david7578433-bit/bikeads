/* Media on Wheels — "Leave feedback" and "Request a call" (David, Nov 8 2026, 4:37 PM:
 * "Add the 'Leave feedback' button. So it should be feedback on the site and also feedback on how good we are. Add the request to call").
 * Anyone can send them (also visitors who are not signed in). Only the admin sees them: Admin → Inbox.
 * Saved like everything else: this browser only while the database keys are empty (collections feedback, callRequests),
 * otherwise the database tables mow_feedback and mow_call_requests (supabase/schema.sql). Nothing is shown publicly,
 * and nothing sends an email or a text. */
(function () {
  'use strict';
  const { esc, $, $$, toast, modal, closeModal } = UI;
  const user = () => (window.App && App.user && App.user()) || null;
  const when = (iso) => { try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };
  const STAR_WORD = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

  function starsInput(name, label) {
    let h = '<fieldset class="stars-set"><legend>' + label + '</legend><div class="stars" role="radiogroup" aria-label="' + esc(label) + '">';
    for (let i = 5; i >= 1; i--) h += '<input type="radio" id="' + name + i + '" name="' + name + '" value="' + i + '"><label for="' + name + i + '" title="' + i + ' of 5 · ' + STAR_WORD[i] + '"><span aria-hidden="true">★</span><span class="sr-only">' + i + ' of 5</span></label>';
    return h + '</div><span class="stars-word small muted" data-word="' + name + '"></span></fieldset>';
  }
  const starsText = (n) => (n ? '<span class="stars-show" aria-label="' + n + ' of 5">' + '★'.repeat(n) + '<i>' + '★'.repeat(5 - n) + '</i></span>' : '<span class="muted small">no stars</span>');

  /* ---------- Leave feedback ---------- */
  function openFeedback(opts) {
    opts = opts || {};
    const u = user();
    const m = modal('Leave feedback', '<form id="fbform" class="form fb-form" novalidate>' +
      '<p class="muted small">Two quick questions. Only ' + esc(Data.settings().businessName || 'Media on Wheels') + ' reads this.</p>' +
      '<section class="fb-part"><h3>The website</h3>' + starsInput('site', 'How easy is the website to use?') +
      '<label>Anything about the website? (optional)<textarea class="input" name="siteComment" rows="2" maxlength="1000"></textarea></label></section>' +
      '<section class="fb-part"><h3>Our service</h3>' + starsInput('service', 'How good are we?') +
      '<label>Tell us how we did (optional)<textarea class="input" name="serviceComment" rows="2" maxlength="1000"></textarea></label></section>' +
      '<div class="two"><label>Your name (optional)<input class="input" name="name" maxlength="120" autocomplete="name" value="' + esc(u ? u.name || '' : '') + '"></label>' +
      '<label>Email (optional)<input class="input" name="email" type="email" maxlength="200" autocomplete="email" value="' + esc(u ? u.email || '' : '') + '"></label></div>' +
      '<p class="err" id="fb-err" role="alert"></p>' +
      '<div class="row-end"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary" id="fbsend">Send feedback</button></div></form>', { noFocus: true });
    const f = $('#fbform', m);
    $$('.stars input', f).forEach((r) => r.addEventListener('change', () => { const w = $('[data-word="' + r.name + '"]', f); if (w) w.textContent = r.value + ' of 5 · ' + STAR_WORD[+r.value]; }));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = (n) => { const x = f.querySelector('input[name="' + n + '"]:checked'); return x ? +x.value : null; };
      const rec = { siteStars: val('site'), siteComment: f.siteComment.value.trim(), serviceStars: val('service'), serviceComment: f.serviceComment.value.trim(),
        name: f.name.value.trim(), email: f.email.value.trim(), source: opts.source || 'site', bookingId: opts.bookingId || '', userId: u ? u.id : '', createdAt: new Date().toISOString() };
      const err = $('#fb-err', f);
      if (!rec.siteStars && !rec.serviceStars && !rec.siteComment && !rec.serviceComment) { err.textContent = 'Please tap some stars or write a few words.'; return; }
      if (rec.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rec.email)) { err.textContent = 'That email does not look right (or leave it empty).'; f.email.focus(); return; }
      const btn = $('#fbsend', f); btn.disabled = true;
      try { await Inbox.sendFeedback(rec); }
      catch (x) { btn.disabled = false; err.textContent = 'Could not send: ' + ((x && x.message) || 'please try again') + '.'; return; }
      thanks(m, 'Thank you for your feedback!', 'It helps us make the website and our service better.');
    });
    return m;
  }

  /* ---------- Request a call ---------- */
  function openCallRequest(opts) {
    opts = opts || {};
    const u = user();
    const m = modal('Request a call', '<form id="crform" class="form cr-form" novalidate>' +
      '<p class="muted small">Leave your number and we will call you back.</p>' +
      '<label>Your name<input class="input" name="name" required maxlength="120" autocomplete="name" value="' + esc(u ? u.name || '' : '') + '"></label>' +
      '<label>Phone number<input class="input" name="phone" type="tel" inputmode="tel" required maxlength="40" autocomplete="tel" placeholder="(845) 555-0123" value="' + esc(u ? u.phone || '' : '') + '"></label>' +
      '<label>Best time to call (optional)<input class="input" name="bestTime" maxlength="120" placeholder="e.g. weekdays after 2 PM"></label>' +
      '<label>Short note (optional)<textarea class="input" name="note" rows="2" maxlength="500" placeholder="What would you like to talk about?"></textarea></label>' +
      '<p class="err" id="cr-err" role="alert"></p>' +
      '<div class="row-end"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary" id="crsend">Request a call</button></div></form>', { noFocus: true });
    const f = $('#crform', m);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rec = { name: f.name.value.trim(), phone: f.phone.value.trim(), bestTime: f.bestTime.value.trim(), note: f.note.value.trim(), userId: u ? u.id : '', called: false, calledAt: null, source: opts.source || 'site', createdAt: new Date().toISOString() };
      const err = $('#cr-err', f);
      if (!rec.name) { err.textContent = 'Please type your name.'; f.name.focus(); return; }
      if (rec.phone.replace(/\D/g, '').length < 7) { err.textContent = 'Please type your phone number.'; f.phone.focus(); return; }
      const btn = $('#crsend', f); btn.disabled = true;
      try { await Inbox.sendCallRequest(rec); }
      catch (x) { btn.disabled = false; err.textContent = 'Could not send: ' + ((x && x.message) || 'please try again') + '.'; return; }
      thanks(m, 'Thank you, ' + rec.name.split(' ')[0] + '!', 'We got your request and will call you at ' + rec.phone + (rec.bestTime ? ' (' + rec.bestTime + ')' : '') + '.');
    });
    return m;
  }

  function thanks(m, h, p) {
    const body = $('.modal-body', m) || m;
    body.innerHTML = '<div class="fb-thanks center"><div class="done-mark" aria-hidden="true">✓</div><h3>' + esc(h) + '</h3><p class="muted">' + esc(p) + '</p><div class="row-center"><button class="btn primary" data-close>Close</button></div></div>';
  }

  /* the two buttons, for any page */
  function buttonsHtml(cls) {
    return '<span class="fb-btns ' + (cls || '') + '"><button type="button" class="btn ghost pill fb-btn" data-feedback>Leave feedback</button><button type="button" class="btn ghost pill fb-btn" data-callreq>Request a call</button></span>';
  }
  /* one listener for every [data-feedback] / [data-callreq] button on the site */
  document.addEventListener('click', (e) => {
    const fb = e.target.closest('[data-feedback]');
    if (fb) { e.preventDefault(); openFeedback({ source: fb.getAttribute('data-feedback') || 'site', bookingId: fb.getAttribute('data-booking') || '' }); return; }
    const cr = e.target.closest('[data-callreq]');
    if (cr) { e.preventDefault(); openCallRequest({ source: cr.getAttribute('data-callreq') || 'site' }); }
  });

  /* ---------- saving ---------- */
  const Inbox = {
    async sendFeedback(rec) {
      if (Auth.remote) return Auth.sendFeedback(rec);
      Data.put('feedback', rec); await Data.flush('feedback');
    },
    async sendCallRequest(rec) {
      if (Auth.remote) return Auth.sendCallRequest(rec);
      Data.put('callRequests', rec); await Data.flush('callRequests');
    },
    async setCalled(id, called) {
      if (Auth.remote) await Auth.setCalled(id, called);
      Data.put('callRequests', { id, called: !!called, calledAt: called ? new Date().toISOString() : null });
    },
    waiting() { return Data.list('callRequests').filter((c) => !c.called).length; },

    /* ---------- Admin → Inbox: Call requests + Feedback ---------- */
    renderAdmin(root) {
      const newest = (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      const calls = Data.list('callRequests').sort((a, b) => (a.called === b.called ? newest(a, b) : a.called ? 1 : -1));
      const fbs = Data.list('feedback').sort(newest);
      const avg = (k) => { const xs = fbs.map((x) => x[k]).filter((n) => n >= 1); return xs.length ? (xs.reduce((s, n) => s + n, 0) / xs.length).toFixed(1) + ' ★ from ' + xs.length : '—'; };
      root.innerHTML = '<section class="page narrow"><div class="page-head"><h1>Inbox</h1></div>' +
        '<section class="card" id="calls-card"><h2>Call requests' + (Inbox.waiting() ? ' <span class="badge st-pending">' + Inbox.waiting() + ' to call</span>' : '') + '</h2>' +
        (calls.length ? '<ul class="inbox-list">' + calls.map((c) => '<li class="inbox-row' + (c.called ? ' done' : '') + '"><div class="ib-main"><strong>' + esc(c.name) + '</strong> <a href="tel:' + esc(String(c.phone).replace(/[^\d+]/g, '')) + '">' + esc(c.phone) + '</a>' +
          '<div class="small muted">' + esc(when(c.createdAt)) + (c.bestTime ? ' · best time: ' + esc(c.bestTime) : '') + (c.called && c.calledAt ? ' · called ' + esc(when(c.calledAt)) : '') + '</div>' +
          (c.note ? '<div class="small campaign-text">' + esc(c.note) + '</div>' : '') + '</div>' +
          '<label class="check ib-called"><input type="checkbox" data-called="' + esc(c.id) + '"' + (c.called ? ' checked' : '') + '> <span>Mark called</span></label></li>').join('') + '</ul>' : '<p class="muted">No call requests yet. When someone taps “Request a call”, it shows up here.</p>') + '</section>' +
        '<section class="card" id="feedback-card"><h2>Feedback</h2>' +
        (fbs.length ? '<p class="small muted">Website: ' + avg('siteStars') + ' · Our service: ' + avg('serviceStars') + '</p><ul class="inbox-list">' + fbs.map((x) => '<li class="inbox-row fb-row"><div class="ib-main">' +
          '<div class="fb-line"><b>Website</b> ' + starsText(x.siteStars) + '</div>' + (x.siteComment ? '<div class="small campaign-text">' + esc(x.siteComment) + '</div>' : '') +
          '<div class="fb-line"><b>Our service</b> ' + starsText(x.serviceStars) + '</div>' + (x.serviceComment ? '<div class="small campaign-text">' + esc(x.serviceComment) + '</div>' : '') +
          '<div class="small muted">' + esc(when(x.createdAt)) + (x.name ? ' · ' + esc(x.name) : '') + (x.email ? ' · <a href="mailto:' + esc(x.email) + '">' + esc(x.email) + '</a>' : '') + (x.source === 'booking' ? ' · after a booking' : '') + '</div>' +
          '</div></li>').join('') + '</ul>' : '<p class="muted">No feedback yet. When someone taps “Leave feedback”, it shows up here. It is never shown on the website.</p>') + '</section></section>';
      $$('[data-called]', root).forEach((cb) => cb.addEventListener('change', async () => {
        cb.disabled = true;
        try { await Inbox.setCalled(cb.getAttribute('data-called'), cb.checked); toast(cb.checked ? 'Marked called' : 'Marked not called yet'); }
        catch (x) { cb.checked = !cb.checked; toast('Could not save: ' + ((x && x.message) || 'please try again')); }
        App.render();
      }));
    },
    openFeedback, openCallRequest, buttonsHtml
  };
  window.Inbox = Inbox;
})();
