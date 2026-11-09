/* Media on Wheels — emails (David, Nov 8 2026 5:13 PM: "when someone books a bike … you get an email 'Your bike is requested'",
 * "Build the invoice option to send the invoice. I need to connect the email").
 * The site never holds an email password. It asks the Supabase Edge Function "mow-send-email" (supabase/functions/) to send;
 * the function reads the mail account (Resend key or SMTP, e.g. a Gmail app password) from its own secrets.
 * Until that is set up every email is kept on the booking as "not sent — email not connected" and the site works as before. */
(function () {
  'use strict';
  const S = (k) => (window.SiteSettings ? SiteSettings.get(k) : '');
  const money = (n) => Math.round((+n || 0) * 100 % 100) ? (+n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' dollars' : Math.round(+n || 0).toLocaleString('en-US') + ' dollars';
  const KINDS = { requested: 'Request received (to the client)', newRequest: 'New request (to you)', approved: 'Approved (to the client)', declined: 'Declined (to the client)', invoice: 'Invoice (to the client)', test: 'Test email' };
  const NOT_CONNECTED = 'not sent — email not connected';

  function fill(text, b, extra) {
    const v = Object.assign({
      business: (Data.settings().businessName || 'Media on Wheels'),
      name: b ? (b.clientName || b.company || '') : '', company: b ? b.company || '' : '',
      bikes: b ? String((b.bikeIds || []).length) : '', dates: b ? UI.fmtRange(b.start, b.end) : '',
      total: b ? money(b.total) : '', deposit: b ? money(b.deposit) : '', balance: b ? money(b.balance) : '',
      note: b ? (b.adminNote || '') : '', invoice: b ? (b.invoiceNo || '') : '', link: (window.SITE && SITE.url) || ''
    }, extra || {});
    return String(text || '').replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  }
  function recipient(kind, b) {
    if (kind === 'newRequest' || kind === 'test') return String(S('emailAdminTo') || (window.SITE && SITE.adminEmails && SITE.adminEmails[0]) || '').trim();
    return String((b && (b.contactEmail || b.email)) || ((Data.get('users', b && b.clientId) || {}).email) || '').trim();
  }
  function compose(kind, b, extra) {
    const subject = fill(S('email.' + kind + '.subject'), b, extra), text = fill(S('email.' + kind + '.body'), b, extra) + (extra && extra.append ? '\n\n' + extra.append : '');
    return { to: recipient(kind, b), subject, text, fromName: S('emailFromName') || Data.settings().businessName || 'Media on Wheels', replyTo: S('emailReplyTo') || '' };
  }
  let lastStatus = null; /* null = not tried yet; 'ok' = sent once; otherwise the reason */
  async function deliver(msg, kind) {
    if (S('emailOn') === false) return { ok: false, status: 'not sent — emails are turned off' };
    if (!msg.to) return { ok: false, status: 'not sent — no email address' };
    if (!(window.Auth && Auth.remote && Auth.invoke)) { lastStatus = NOT_CONNECTED; return { ok: false, status: NOT_CONNECTED }; }
    try {
      const r = await Auth.invoke('mow-send-email', Object.assign({ kind }, msg));
      if (r && r.ok) { lastStatus = 'ok'; return { ok: true, status: 'sent' }; }
      lastStatus = (r && r.error) ? 'not sent — ' + r.error : NOT_CONNECTED; return { ok: false, status: lastStatus };
    } catch (e) { lastStatus = NOT_CONNECTED; return { ok: false, status: NOT_CONNECTED }; }
  }
  /* Send one email about a booking; the result is written on the booking (b.emails) so the admin can see it. */
  async function send(kind, b, extra) {
    const msg = compose(kind, b, extra);
    const res = await deliver(msg, kind);
    if (b && b.id && Data.get('bookings', b.id)) {
      const cur = Data.get('bookings', b.id);
      Data.put('bookings', { id: b.id, emails: (cur.emails || []).concat([{ kind, to: msg.to, subject: msg.subject, at: new Date().toISOString(), status: res.status }]).slice(-20) });
    }
    return res;
  }
  const Mailer = {
    KINDS, NOT_CONNECTED, fill, compose, send,
    status() { return lastStatus; },
    connected() { return lastStatus === 'ok'; },
    async test() { return deliver(compose('test', null, {}), 'test'); },
    money
  };
  window.Mailer = Mailer;
})();
