/* Media on Wheels — REFERRALS (David, Nov 8 2026 7:00 PM: "Also, maybe add the option of referrals").
 * Every client account has its own referral code and share link (My account → "Refer a business"; copy button only).
 * A NEW client who signs up (or types the code in the promo box) gets a discount on their FIRST order; when that first
 * order is approved (or its deposit is paid — admin setting), the client who referred them gets a reward on their NEXT
 * order, taken off automatically and shown on the price summary, pop-up, My bookings and the invoice.
 * Admin → Referrals: on/off (default ON), the new client's discount and the reward (percent or dollars, 10% each by
 * default), every referral (who referred whom, status, reward used) and manual changes.
 * Storage: collection 'referrals' (this device) or the database table mow_referrals (supabase/schema.sql): a client sees
 * only their own rows; clients claim a code and mark a reward used through database functions; the admin sees all. */
(function () {
  'use strict';
  const SS = (k, d) => { const v = window.SiteSettings ? SiteSettings.get(k) : undefined; return v == null ? d : v; };
  const U = () => window.UI || {};
  const esc = (s) => (U().esc ? U().esc(s) : String(s == null ? '' : s));
  const money = (n) => (U().money ? U().money(n) : n + ' dollars');
  const nm = (x) => String(x || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const digits = (x) => String(x || '').replace(/\D/g, '');
  const OPEN = (b) => !!b && b.status !== 'declined' && b.status !== 'cancelled';
  const REF_KEY = 'mow.ref';
  const STATUS = { joined: 'Signed up', requested: 'First order sent', earned: 'Reward ready', used: 'Reward used', cancelled: 'Cancelled' };
  const remote = () => !!(window.Auth && Auth.remote);
  const valText = (type, v) => (type === 'fixed' ? money(+v || 0) : (+v || 0) + '%');

  const Referrals = {
    STATUS, REF_KEY,
    on() { return SS('refOn', true) !== false; },
    settings() {
      return { newType: SS('refNewType', 'pct') === 'fixed' ? 'fixed' : 'pct', newValue: Math.max(0, +SS('refNewValue', 10) || 0),
        rewardType: SS('refRewardType', 'pct') === 'fixed' ? 'fixed' : 'pct', rewardValue: Math.max(0, +SS('refRewardValue', 10) || 0),
        when: SS('refWhen', 'approved') === 'deposit' ? 'deposit' : 'approved' };
    },
    valText,
    /* ---------- codes and links ---------- */
    makeCode(user, taken) {
      const base = String((user && (user.company || user.name)) || 'MOW').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'MOW';
      const used = new Set((taken || []).map((x) => String(x || '').toUpperCase()));
      for (let i = 0; i < 200; i++) { const c = base + '-' + String(Math.floor(1000 + Math.random() * 9000)); if (!used.has(c)) return c; }
      return base + '-' + Date.now().toString(36).toUpperCase();
    },
    /* this client's own code (this device: made the first time it is needed; database: made by the database) */
    codeOf(user) {
      if (!user) return '';
      const u = Data.get('users', user.id) || user;
      if (u.refCode) return u.refCode;
      if (remote()) return '';
      const code = Referrals.makeCode(u, Data.list('users').map((x) => x.refCode));
      Data.put('users', { id: u.id, refCode: code });
      return code;
    },
    link(code) {
      const loc = (typeof location !== 'undefined' && location) || { origin: 'https://mediaonwheels-preview.sites.tab.bot', pathname: '/' };
      return loc.origin + loc.pathname + '?ref=' + encodeURIComponent(code) + '#/signup';
    },
    /* a visitor who opened a share link: keep the code until they sign up */
    capture() {
      try {
        const q = new URLSearchParams(location.search).get('ref');
        if (q && /^[A-Za-z0-9-]{3,24}$/.test(q)) localStorage.setItem(REF_KEY, q.toUpperCase());
      } catch (e) { /* no storage */ }
    },
    pending() { try { return localStorage.getItem(REF_KEY) || ''; } catch (e) { return ''; } },
    setPending(code) { try { if (code) localStorage.setItem(REF_KEY, String(code).trim().toUpperCase()); else localStorage.removeItem(REF_KEY); } catch (e) { /* */ } },
    ownerOf(code) { const c = nm(code); return c ? Data.list('users').find((u) => nm(u.refCode) === c) || null : null; },
    asReferred(user) { return user ? Data.list('referrals').find((r) => r.referredId === user.id && r.status !== 'cancelled') || null : null; },
    asReferrer(user) { return user ? Data.list('referrals').filter((r) => r.referrerId === user.id) : []; },
    isNewClient(user) { return !!user && !Data.list('bookings').some((b) => b.clientId === user.id && OPEN(b)); },
    /* the same person or business may not refer itself */
    isSelf(owner, user) {
      if (!owner || !user) return false;
      if (owner.id === user.id) return true;
      if (owner.email && user.email && nm(owner.email) === nm(user.email)) return true;
      if (nm(owner.company) && nm(owner.company) === nm(user.company)) return true;
      const a = digits(owner.phone), b = digits(user.phone);
      return a.length >= 7 && a === b;
    },
    words(reason) {
      return ({ notfound: 'That code is not valid.', self: 'That is your own referral code. Share it with another business.', already: 'You already used a referral code.',
        notnew: 'Referral codes are for new clients (first order only).', off: 'Referrals are turned off right now.', signin: 'Please log in first.' })[reason] || 'That code is not valid.';
    },
    /* use a referral code (sign-up link, sign-up box or the promo box). Returns { ok, reason, referral } */
    async claim(user, code) {
      code = String(code || '').trim().toUpperCase();
      if (!user) return { ok: false, reason: 'signin' };
      if (!code) return { ok: false, reason: 'notfound' };
      if (remote()) {
        const r = await Auth.claimReferral(code);
        if (r && r.ok) Referrals.setPending('');
        return r;
      }
      if (!Referrals.on()) return { ok: false, reason: 'off' };
      const owner = Referrals.ownerOf(code);
      if (!owner) return { ok: false, reason: 'notfound' };
      if (Referrals.isSelf(owner, user)) return { ok: false, reason: 'self' };
      const had = Referrals.asReferred(user);
      if (had) return had.code && nm(had.code) === nm(code) ? { ok: true, reason: 'already', referral: had } : { ok: false, reason: 'already' };
      if (!Referrals.isNewClient(user)) return { ok: false, reason: 'notnew' };
      const st = Referrals.settings();
      const rec = Data.put('referrals', { code: owner.refCode, referrerId: owner.id, referrerName: owner.company || owner.name || owner.email, referredId: user.id,
        referredName: user.company || user.name || user.email, status: 'joined', newType: st.newType, newValue: st.newValue, rewardType: st.rewardType, rewardValue: st.rewardValue,
        firstBookingId: '', rewardBookingId: '', createdAt: new Date().toISOString() });
      Referrals.setPending('');
      return { ok: true, referral: rec };
    },
    /* after sign-in: a code from a share link or the sign-up box is used automatically (new clients only) */
    async autoClaim(user) {
      const code = Referrals.pending();
      if (!code || !user || user.role !== 'client') return null;
      if (Referrals.asReferred(user) || !Referrals.isNewClient(user)) { Referrals.setPending(''); return null; }
      try {
        const r = await Referrals.claim(user, code);
        if (r && (r.ok || ['self', 'notfound', 'already', 'notnew'].includes(r.reason))) Referrals.setPending('');
        return r;
      } catch (e) { console.error(e); return null; }
    },
    /* ---------- the discounts the price step adds by itself ---------- */
    newClientRule(user) {
      const r = Referrals.asReferred(user);
      if (!r || r.status !== 'joined' || r.firstBookingId || !Referrals.on() || !(+r.newValue > 0)) return null;
      return { id: r.id, kind: 'referral', amountType: r.newType === 'fixed' ? 'fixed' : 'pct', pct: r.newType === 'fixed' ? 0 : +r.newValue, amount: r.newType === 'fixed' ? +r.newValue : 0,
        label: 'Referral discount, first order' + (r.referrerName ? ' (referred by ' + r.referrerName + ')' : ''), active: true };
    },
    rewardsReady(user) {
      return Referrals.asReferrer(user).filter((r) => r.status === 'earned' && !r.rewardBookingId && +r.rewardValue > 0).sort((a, b) => String(a.earnedAt || a.createdAt).localeCompare(String(b.earnedAt || b.createdAt)));
    },
    /* one reward per order (the oldest one first) */
    rewardRule(user) {
      const r = Referrals.rewardsReady(user)[0]; if (!r) return null;
      return { id: r.id, kind: 'reward', amountType: r.rewardType === 'fixed' ? 'fixed' : 'pct', pct: r.rewardType === 'fixed' ? 0 : +r.rewardValue, amount: r.rewardType === 'fixed' ? +r.rewardValue : 0,
        label: 'Referral reward' + (r.referredName ? ' (thank you for referring ' + r.referredName + ')' : ''), active: true };
    },
    extraRules(user) { return user ? [Referrals.newClientRule(user), Referrals.rewardRule(user)].filter(Boolean) : []; },
    /* a new order was saved: its referral discount / reward is now taken */
    async afterPlace(rec, user) {
      if (!rec) return;
      const used = (rec.discounts || []).filter((d) => d.kind === 'referral' || d.kind === 'reward');
      if (!used.length) return;
      if (remote()) { try { await Auth.referralMark(rec.id); } catch (e) { console.error(e); } return; }
      const now = new Date().toISOString();
      used.forEach((d) => {
        const r = Data.get('referrals', d.id); if (!r) return;
        if (d.kind === 'referral' && r.referredId === user.id) Data.put('referrals', { id: r.id, status: 'requested', firstBookingId: rec.id, requestedAt: now });
        if (d.kind === 'reward' && r.referrerId === user.id) Data.put('referrals', { id: r.id, status: 'used', rewardBookingId: rec.id, usedAt: now });
      });
    },
    earnedBy(b, when) { return !!b && (when === 'deposit' ? !!b.depositPaid : (b.status === 'approved' || b.status === 'completed' || !!b.depositPaid)); },
    /* Keep the statuses in step with the orders (this device, or the admin in database mode; the database does the
     * same by itself in a trigger): first order approved → reward ready; first order declined / cancelled → the new
     * client's discount is free again; the reward's order declined / cancelled → the reward is ready again. */
    sync() {
      try { Data.list('referrals'); } catch (e) { return 0; } /* not loaded yet */
      const when = Referrals.settings().when, now = new Date().toISOString(), st = Referrals.settings();
      let changed = 0;
      Data.list('referrals').forEach((r) => {
        const patch = {};
        const fb = r.firstBookingId ? Data.get('bookings', r.firstBookingId) : null;
        if ((r.status === 'joined' || r.status === 'requested') && fb) {
          if (Referrals.earnedBy(fb, when)) Object.assign(patch, { status: 'earned', earnedAt: now }, r.rewardValue == null ? { rewardType: st.rewardType, rewardValue: st.rewardValue } : {});
          else if (!OPEN(fb)) Object.assign(patch, { status: 'joined', firstBookingId: '' });
        }
        const rb = r.rewardBookingId ? Data.get('bookings', r.rewardBookingId) : null;
        if (rb && !OPEN(rb)) Object.assign(patch, { status: 'earned', rewardBookingId: '', usedAt: '' });
        if (Object.keys(patch).length) { Data.put('referrals', Object.assign({ id: r.id }, patch), { silent: true }); changed++; }
      });
      if (changed) Data.flush('referrals').catch((e) => console.error(e));
      return changed;
    },
    canSync() { const u = window.App && App.user && App.user(); return !remote() || !!(u && u.role === 'admin'); },

    /* ---------- client: My account → "Refer a business" ---------- */
    cardHtml(user) {
      if (!Referrals.on() && !Referrals.asReferrer(user).length) return '';
      const code = Referrals.codeOf(user), st = Referrals.settings(), mine = Referrals.asReferrer(user);
      const ready = mine.filter((r) => r.status === 'earned' && !r.rewardBookingId), usedN = mine.filter((r) => r.status === 'used').length;
      const row = (r) => '<li class="ref-item"><div><b>' + esc(r.referredName || 'A business') + '</b><span class="small muted">' +
        (r.status === 'earned' ? esc(valText(r.rewardType, r.rewardValue)) + ' off your next order' : r.status === 'used' ? 'Used on order BK-' + esc(String(r.rewardBookingId || '').slice(-6).toUpperCase()) : r.status === 'cancelled' ? 'No reward' : 'Your reward comes when their first order is ' + (Referrals.settings().when === 'deposit' ? 'paid' : 'approved')) + '</span></div>' +
        '<span class="badge ' + (r.status === 'earned' ? 'st-approved' : r.status === 'used' ? 'st-completed' : r.status === 'cancelled' ? 'st-declined' : 'st-pending') + '">' + esc(STATUS[r.status] || r.status) + '</span></li>';
      const by = Referrals.asReferred(user), nc = Referrals.newClientRule(user);
      return '<div class="card ref-card" id="ref-card"><h2>Refer a business</h2>' +
        (Referrals.on() ? '<p class="muted">A business you refer gets <b>' + esc(valText(st.newType, st.newValue)) + ' off</b> their first order. When their first order is ' + (st.when === 'deposit' ? 'paid' : 'approved') + ', you get <b>' + esc(valText(st.rewardType, st.rewardValue)) + ' off</b> your next order.</p>' : '<p class="muted">Referrals are paused right now. Rewards you already earned still count.</p>') +
        (code ? '<div class="ref-code"><span class="small muted">Your code</span><b id="ref-code">' + esc(code) + '</b></div>' +
          '<label class="ref-link-l">Your link<span class="ref-row"><input class="input" id="ref-link" readonly value="' + esc(Referrals.link(code)) + '"><button type="button" class="btn primary" id="ref-copy">Copy link</button></span></label>' +
          '<p class="small muted" id="ref-copied" role="status"></p>'
          : '<p class="small muted">Your code is being made. Please open this page again in a minute.</p>') +
        '<h3>Rewards</h3><p class="small">' + (ready.length ? '<b>' + ready.length + ' reward' + (ready.length === 1 ? '' : 's') + ' ready</b>: taken off your next order by itself.' : 'No reward ready yet.') + (usedN ? ' ' + usedN + ' used.' : '') + '</p>' +
        (mine.length ? '<ul class="ref-list">' + mine.map(row).join('') + '</ul>' : '<p class="small muted">Nobody used your code yet.</p>') +
        (by ? '<p class="small ref-by">You were referred by <b>' + esc(by.referrerName || 'another business') + '</b>' + (nc ? ': ' + esc(valText(by.newType, by.newValue)) + ' off your first order.' : '.') + '</p>' : '') + '</div>';
    },
    wireCard(root) {
      const btn = root.querySelector('#ref-copy'); if (!btn) return;
      btn.addEventListener('click', async () => {
        const inp = root.querySelector('#ref-link'), out = root.querySelector('#ref-copied');
        let ok = false;
        try { await navigator.clipboard.writeText(inp.value); ok = true; } catch (e) { try { inp.select(); ok = document.execCommand('copy'); } catch (e2) { ok = false; } }
        out.textContent = ok ? 'Link copied ✓' : 'Select the link and copy it.';
        btn.textContent = ok ? 'Copied ✓' : 'Copy link';
        setTimeout(() => { btn.textContent = 'Copy link'; }, 2500);
      });
    },

    /* ---------- admin: Referrals list + manual changes ---------- */
    renderAdmin(host) {
      if (Referrals.canSync()) Referrals.sync();
      const users = Data.list('users');
      const name = (id, fb) => { const u = users.find((x) => x.id === id); return u ? (u.company || u.name || u.email) : (fb || '—'); };
      const list = Data.list('referrals').sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      const cnt = (s) => list.filter((r) => r.status === s).length;
      host.innerHTML = '<h2>Referrals</h2>' +
        '<p class="small muted">' + list.length + ' referral' + (list.length === 1 ? '' : 's') + ' · ' + cnt('earned') + ' reward' + (cnt('earned') === 1 ? '' : 's') + ' ready · ' + cnt('used') + ' used</p>' +
        (list.length ? '<ul class="disc-list ref-admin-list">' + list.map((r) => '<li class="disc-item' + (r.status === 'cancelled' ? ' off' : '') + '"><div><strong>' + esc(name(r.referrerId, r.referrerName)) + ' → ' + esc(name(r.referredId, r.referredName)) + '</strong>' +
          '<span class="small muted">' + esc(STATUS[r.status] || r.status) + ' · code ' + esc(r.code || '—') + ' · new client ' + esc(valText(r.newType, r.newValue)) + ' off · reward ' + esc(valText(r.rewardType, r.rewardValue)) +
          (r.firstBookingId ? ' · first order BK-' + esc(String(r.firstBookingId).slice(-6).toUpperCase()) : '') + (r.rewardBookingId ? ' · reward used on BK-' + esc(String(r.rewardBookingId).slice(-6).toUpperCase()) : '') +
          (r.createdAt ? ' · ' + esc(U().fmtDate ? U().fmtDate(String(r.createdAt).slice(0, 10)) : String(r.createdAt).slice(0, 10)) : '') + (r.note ? ' · ' + esc(r.note) : '') + '</span></div>' +
          '<div class="disc-actions"><button class="btn ghost small-btn" data-redit="' + esc(r.id) + '">Change</button><button class="btn danger-ghost small-btn" data-rdel="' + esc(r.id) + '">Delete</button></div></li>').join('') + '</ul>'
          : '<p class="muted">No referrals yet. Each client has a code and link under My account.</p>') +
        '<div class="row-end"><button class="btn" id="radd">+ Add a referral by hand</button></div>';
      const redraw = () => Referrals.renderAdmin(host);
      host.querySelector('#radd').addEventListener('click', () => Referrals.editAdmin(null, redraw));
      host.querySelectorAll('[data-redit]').forEach((b) => b.addEventListener('click', () => Referrals.editAdmin(b.getAttribute('data-redit'), redraw)));
      host.querySelectorAll('[data-rdel]').forEach((b) => b.addEventListener('click', () => U().confirmBox('Delete this referral?', 'Orders already made keep their price.', 'Delete', () => { Data.remove('referrals', b.getAttribute('data-rdel')); U().toast('Referral deleted'); redraw(); }, true)));
    },
    editAdmin(id, after) {
      const st = Referrals.settings();
      const r = id ? Data.get('referrals', id) : { status: 'joined', newType: st.newType, newValue: st.newValue, rewardType: st.rewardType, rewardValue: st.rewardValue };
      const clients = Data.list('users').filter((u) => u.role === 'client');
      const opt = (sel) => '<option value="">Pick a client…</option>' + clients.map((u) => '<option value="' + esc(u.id) + '"' + (sel === u.id ? ' selected' : '') + '>' + esc((u.company || u.name) + ' · ' + u.email) + '</option>').join('');
      const typ = (n, v) => '<select class="input" name="' + n + '"><option value="pct"' + (v !== 'fixed' ? ' selected' : '') + '>Percent off</option><option value="fixed"' + (v === 'fixed' ? ' selected' : '') + '>Dollars off</option></select>';
      const m = U().modal(id ? 'Change referral' : 'Add a referral', '<form class="form" id="rf">' +
        '<label>Referred by (gets the reward)<select class="input" name="referrerId"' + (id ? ' disabled' : '') + '>' + opt(r.referrerId) + '</select></label>' +
        '<label>New client (gets the first-order discount)<select class="input" name="referredId"' + (id ? ' disabled' : '') + '>' + opt(r.referredId) + '</select></label>' +
        '<label>Status<select class="input" name="status">' + Object.keys(STATUS).map((k) => '<option value="' + k + '"' + (r.status === k ? ' selected' : '') + '>' + STATUS[k] + '</option>').join('') + '</select></label>' +
        '<div class="two"><label>New client discount' + typ('newType', r.newType) + '</label><label>Amount<input class="input" type="number" min="0" step="0.5" name="newValue" value="' + (+r.newValue || 0) + '"></label></div>' +
        '<div class="two"><label>Reward for the referrer' + typ('rewardType', r.rewardType) + '</label><label>Amount<input class="input" type="number" min="0" step="0.5" name="rewardValue" value="' + (+r.rewardValue || 0) + '"></label></div>' +
        (r.rewardBookingId ? '<label class="check"><input type="checkbox" name="unuse"> Give the reward back (it was used on BK-' + esc(String(r.rewardBookingId).slice(-6).toUpperCase()) + ')</label>' : '') +
        '<label>Note (only you see it)<input class="input" name="note" value="' + esc(r.note || '') + '"></label>' +
        '<p class="err" id="rerr" role="alert"></p><div class="row-end"><button class="btn primary">Save</button></div></form>');
      const f = m.querySelector('#rf');
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const err = (t) => { m.querySelector('#rerr').textContent = t; };
        const nt = f.newType.value, rt = f.rewardType.value, nv = Math.max(0, +f.newValue.value || 0), rv = Math.max(0, +f.rewardValue.value || 0);
        if ((nt === 'pct' && nv > 90) || (rt === 'pct' && rv > 90)) return err('A percent can be at most 90.');
        const rec = { id: id || undefined, status: f.status.value, newType: nt, newValue: nv, rewardType: rt, rewardValue: rv, note: f.note.value.trim() };
        if (!id) {
          const a = Data.get('users', f.referrerId.value), b = Data.get('users', f.referredId.value);
          if (!a || !b) return err('Pick both clients.');
          if (Referrals.isSelf(a, b)) return err('A business cannot refer itself.');
          if (Referrals.asReferred(b)) return err((b.company || b.name) + ' already has a referral.');
          Object.assign(rec, { code: Referrals.codeOf(a), referrerId: a.id, referrerName: a.company || a.name || a.email, referredId: b.id, referredName: b.company || b.name || b.email, firstBookingId: '', rewardBookingId: '', createdAt: new Date().toISOString(), manual: true });
        }
        if (f.unuse && f.unuse.checked) Object.assign(rec, { rewardBookingId: '', usedAt: '', status: rec.status === 'used' ? 'earned' : rec.status });
        if (rec.status === 'earned' && !(r.earnedAt)) rec.earnedAt = new Date().toISOString();
        Data.put('referrals', rec); U().closeModal(); U().toast('Saved ✓'); if (after) after();
      });
    }
  };

  if (typeof window !== 'undefined') {
    window.Referrals = Referrals;
    if (window.Data && Data.onChange) Data.onChange((name) => { if (name === 'bookings' && Referrals.canSync()) { try { Referrals.sync(); } catch (e) { console.error(e); } } });
  }
})();
