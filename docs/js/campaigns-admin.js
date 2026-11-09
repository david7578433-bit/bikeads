/* Media on Wheels — admin: the campaigns of one order (Nov 8 2026 7 PM, David: an agency like Pivot sends one request
 * with GB 5 bikes, GG 5, Lakefront 5). The admin sees each campaign with its bikes, can change which bikes ride for
 * which campaign, and (before approving) decline one campaign; the order's price is worked out again from what is left.
 * Approve / Decline of the WHOLE order stays on the booking row (js/admin.js). */
(function () {
  'use strict';
  const U = () => window.UI;
  const esc = (s) => U().esc(s), money = (n) => U().money(n);

  function hist(b, action) { return (b.history || []).concat([{ at: new Date().toISOString(), by: (App.user() || {}).name || 'Admin', action }]); }
  function save(b, rows, action) {
    const locked = !!b.depositPaid; /* after the deposit is paid the price stays; only bikes may be swapped */
    const patch = locked ? { campaigns: rows, bikeIds: Campaigns.totals(rows).patch.bikeIds } : Campaigns.reprice(b, rows).patch;
    Data.put('bookings', Object.assign({ id: b.id }, patch, { history: hist(b, action) }));
  }

  function open(id) {
    const b = Data.get('bookings', id); if (!b || !Campaigns.isMulti(b)) return;
    const pending = b.status === 'pending', act = Campaigns.active(b);
    const m = U().modal('Campaigns · ' + (b.company || ''), '<div class="camp-admin">' +
      '<p class="small muted">' + b.bikeIds.length + ' bikes in ' + act.length + ' campaign' + (act.length === 1 ? '' : 's') + ' · ' + esc(U().fmtRange(b.start, b.end)) + ' · total ' + esc(money(b.total)) +
      (b.depositPaid ? ' · deposit paid, so the price stays; you can still swap bikes' : '') + '</p>' +
      b.campaigns.map((c) => {
        const off = c.status === 'declined', n = (c.bikeIds || []).length;
        return '<section class="camp-card' + (off ? ' off' : '') + '" data-cid="' + esc(c.id) + '"><div class="camp-top"><b>' + esc(c.name) + '</b><span>' + n + ' bike' + (n === 1 ? '' : 's') + (c.subtotal != null && !off ? ' · ' + esc(money(c.subtotal)) : '') + '</span></div>' +
          '<div class="small muted">' + esc(U().fmtRange(c.start, c.end)) + ' · ' + Data.days(c.start, c.end) + ' days</div>' +
          (c.adText ? '<div class="small campaign-text">' + esc(c.adText) + '</div>' : '') +
          (off ? '<div class="small"><span class="badge st-declined">Declined</span>' + (c.note ? ' ' + esc(c.note) : '') + '</div>' :
            '<div class="chips">' + (c.bikeIds || []).map((x) => '<span class="chip">' + esc(Data.bikeLabel(x)) + '</span>').join('') + '</div>') +
          '<div class="row-end">' + (off ? (pending ? '<button class="btn ghost small-btn" data-c-back="' + esc(c.id) + '">Bring back</button>' : '') :
            '<button class="btn ghost small-btn" data-c-bikes="' + esc(c.id) + '">Change bikes</button>' + (pending && !b.depositPaid && act.length > 1 ? '<button class="btn danger-ghost small-btn" data-c-decline="' + esc(c.id) + '">Decline this campaign</button>' : '')) + '</div>' +
          '<div class="camp-pick" hidden></div></section>';
      }).join('') + '<div class="row-end"><button class="btn primary" data-close>Done</button></div></div>', { noFocus: true });
    m.addEventListener('click', (e) => {
      const bk = e.target.closest('[data-c-bikes]'), de = e.target.closest('[data-c-decline]'), bb = e.target.closest('[data-c-back]');
      if (bk) return pickBikes(m, b.id, bk.getAttribute('data-c-bikes'));
      if (de) {
        const c = b.campaigns.find((x) => x.id === de.getAttribute('data-c-decline'));
        return U().confirmBox('Decline “' + c.name + '”?', 'Its ' + (c.bikeIds || []).length + ' bikes become free and the order price is worked out again. The other campaigns stay.', 'Decline campaign', () => {
          const cur = Data.get('bookings', b.id);
          save(cur, cur.campaigns.map((x) => (x.id === c.id ? Object.assign({}, x, { status: 'declined' }) : x)), 'Campaign declined: ' + c.name);
          U().toast('Campaign declined: ' + c.name); App.render(); open(b.id);
        }, true);
      }
      if (bb) {
        const cur = Data.get('bookings', b.id), c = cur.campaigns.find((x) => x.id === bb.getAttribute('data-c-back'));
        const busy = Data.busyBikeIds(c.start, c.end, cur.id);
        Campaigns.active(cur).forEach((o) => { if (Data.overlaps(c.start, c.end, o.start, o.end)) (o.bikeIds || []).forEach((x) => busy.add(x)); });
        if ((c.bikeIds || []).some((x) => busy.has(x))) { U().toast('Some of its bikes are taken now. Use “Change bikes” after bringing it back.'); }
        save(cur, cur.campaigns.map((x) => (x.id === c.id ? Object.assign({}, x, { status: undefined }) : x)), 'Campaign brought back: ' + c.name);
        U().closeModal(); App.render(); open(b.id);
      }
    });
  }

  /* pick the bikes for one campaign: free on its days (other bookings) and not used by the order's other campaigns on those days */
  function pickBikes(m, bid, cid) {
    const b = Data.get('bookings', bid), c = b.campaigns.find((x) => x.id === cid);
    const host = m.querySelector('[data-cid="' + cid + '"] .camp-pick');
    const busy = Data.busyBikeIds(c.start, c.end, b.id), sib = new Set();
    Campaigns.active(b).forEach((o) => { if (o.id !== c.id && Data.overlaps(c.start, c.end, o.start, o.end)) (o.bikeIds || []).forEach((x) => sib.add(x)); });
    const chosen = new Set(c.bikeIds || []);
    const bikes = Data.list('bikes').filter((x) => x.active !== false || chosen.has(x.id)).sort((x, y) => String(x.number).localeCompare(String(y.number), undefined, { numeric: true }));
    host.hidden = false;
    host.innerHTML = '<div class="bike-pick">' + bikes.map((k) => { const no = busy.has(k.id) || sib.has(k.id);
      return '<label class="pick' + (no ? ' busy' : '') + '"><input type="checkbox" value="' + esc(k.id) + '"' + (chosen.has(k.id) ? ' checked' : '') + (no && !chosen.has(k.id) ? ' disabled' : '') + '><span>#' + esc(k.number) + (busy.has(k.id) ? '<small>booked</small>' : sib.has(k.id) ? '<small>other campaign</small>' : '') + '</span></label>'; }).join('') + '</div>' +
      '<p class="small muted" data-cnt>' + chosen.size + ' picked' + (b.depositPaid ? ' (keep ' + (c.bikeIds || []).length + ': the deposit is paid)' : '') + '</p><div class="row-end"><button class="btn ghost small-btn" data-cp-cancel>Cancel</button><button class="btn primary small-btn" data-cp-save>Save bikes</button></div>';
    host.addEventListener('change', (e) => { if (e.target.type === 'checkbox') { if (e.target.checked) chosen.add(e.target.value); else chosen.delete(e.target.value); host.querySelector('[data-cnt]').textContent = chosen.size + ' picked'; } });
    host.querySelector('[data-cp-cancel]').addEventListener('click', () => { host.hidden = true; host.innerHTML = ''; });
    host.querySelector('[data-cp-save]').addEventListener('click', () => {
      if (!chosen.size) { U().toast('Pick at least one bike'); return; }
      if (b.depositPaid && chosen.size !== (c.bikeIds || []).length) { U().toast('The deposit is paid: keep ' + (c.bikeIds || []).length + ' bikes (swap only).'); return; }
      const cur = Data.get('bookings', bid), ids = Array.from(chosen);
      save(cur, cur.campaigns.map((x) => (x.id === cid ? Object.assign({}, x, { bikeIds: ids, bikes: ids.length }) : x)), 'Bikes for ' + c.name + ': ' + ids.map(Data.bikeLabel).join(', '));
      U().toast('Saved ✓ ' + c.name + ': ' + ids.length + ' bikes'); U().closeModal(); App.render(); open(bid);
    });
  }

  /* Clients list: accounts grouped by company / agency (e.g. Pivot Marketing) */
  function groupByCompany(users) {
    const g = new Map();
    users.forEach((u) => { const name = String(u.company || '').trim(), k = name.toLowerCase() || '~'; if (!g.has(k)) g.set(k, { company: name, users: [] }); g.get(k).users.push(u); });
    return Array.from(g.values()).sort((a, b) => (!a.company ? 1 : !b.company ? -1 : a.company.localeCompare(b.company)));
  }
  window.CampaignsAdmin = { open, pickBikes, groupByCompany };
})();
