/* BikeAds Deliver — STORE plugin: add orders (form, paste from Excel, CSV/Excel file),
 * print bag labels, watch each order live with its proof, history and charges. */
(function () {
  'use strict';
  const { esc, money, fmtDate, $, $$, toast, modal, closeModal, confirmBox } = UI;
  let mapCtl = null;
  const view = { date: null, range: 'week' };
  function teardown() { if (mapCtl) { mapCtl.destroy(); mapCtl = null; } }
  const mine = (user) => Deliver.storeOf(user);

  function orderRow(o) {
    const d = Deliver.driver(o.driverId);
    const thumb = o.proof && o.proof.photo ? '<img class="thumb" src="' + esc(o.proof.photo) + '" alt="">' : '';
    return '<li><button class="orow" data-order="' + o.id + '">' + thumb +
      '<span class="grow"><b>' + esc(o.customer) + '</b> <span class="muted small">' + esc(o.code) + (o.ref ? ' · ' + esc(o.ref) : '') + '</span>' +
      '<span class="addr">' + esc(o.address) + '</span>' +
      '<span class="meta">' + o.bags + ' bag(s) · ' + esc(DUI.win(o)) + (o.amount > 0 ? ' · collect ' + money(o.amount) : '') + (d && o.status !== 'new' ? ' · ' + esc(d.name.split(' ')[0]) + (DUI.eta(o) ? ' ETA ' + DUI.eta(o) : '') : '') + '</span></span>' +
      '<span class="end">' + DUI.chip(o) + '</span></button></li>';
  }
  function bindOrders(root, user) {
    $$('[data-order]', root).forEach((b) => b.addEventListener('click', () => openOrder(b.getAttribute('data-order'), user)));
  }
  function openOrder(id, user) {
    const o = Data.get('orders', id);
    const m = DUI.orderModal(o, '<div class="row-end mt"><button class="btn" data-lbl>Print label' + (o.bags > 1 ? 's' : '') + '</button>' + (o.status === 'new' ? '<button class="btn danger-ghost" data-del>Cancel order</button>' : '') + '</div>');
    m.querySelector('[data-lbl]').addEventListener('click', () => { closeModal(); DUI.printLabels([o]); });
    const del = m.querySelector('[data-del]');
    if (del) del.addEventListener('click', () => { closeModal(); confirmBox('Cancel ' + o.code + '?', 'The order is removed before any driver gets it.', 'Cancel order', () => { Data.remove('orders', o.id); toast('Order cancelled'); App.render(); }, true); });
  }

  function renderToday(root, user) {
    const s = mine(user);
    if (!s) { root.innerHTML = '<div class="pad">This login is not linked to a store. Ask the admin.</div>'; return; }
    const date = view.date || Data.today();
    const list = Deliver.day(date, s.id).sort((a, b) => (a.status === 'new') - (b.status === 'new') || (a.windowStart || '').localeCompare(b.windowStart || '') || a.code.localeCompare(b.code));
    const c = (st) => list.filter((o) => st.includes(o.status)).length;
    root.innerHTML = '<div class="page"><div class="page-head"><div><h1>' + esc(s.name) + '</h1><p class="muted">Deliveries for <input type="date" class="input inline-date" id="sdate" value="' + date + '" aria-label="Day"></p></div>' +
      '<div class="head-actions"><a class="btn primary" href="#/store/add">+ Add orders</a><button class="btn" id="print-all"' + (list.length ? '' : ' disabled') + '>Print labels</button></div></div>' +
      '<div class="stats">' + DUI.stat('Orders', list.length) + DUI.stat('Waiting', c(['new', 'routed', 'loaded'])) + DUI.stat('On the way', c(['out', 'arrived'])) + DUI.stat('Delivered', c(['delivered']), 'good') + DUI.stat('Failed', c(['failed']), c(['failed']) ? 'bad' : '') + '</div>' +
      '<div class="split"><section class="card"><h2>Orders</h2>' + (list.length ? '<ul class="olist">' + list.map(orderRow).join('') + '</ul>' : '<p class="muted">No orders for this day yet. <a href="#/store/add">Add some</a>.</p>') + '</section>' +
      '<section class="card map-card"><h2>Live map</h2><div id="smap" class="map small-map"></div><p class="muted small">Your orders and the drivers carrying them. Tap a pin for details.</p></section></div></div>';
    $('#sdate', root).addEventListener('change', (e) => { view.date = e.target.value; App.render(); });
    $('#print-all', root).addEventListener('click', () => DUI.printLabels(list.filter((o) => Deliver.isOpen(o))));
    bindOrders(root, user);
    mapCtl = DUI.routeMap($('#smap', root), { storeId: s.id, date, onStop: (id) => openOrder(id, user) });
  }

  const WINDOWS = [['', '', 'Any time'], ['12:00', '14:00'], ['13:00', '15:00'], ['14:00', '16:00'], ['15:00', '17:00'], ['16:00', '18:00'], ['17:00', '19:00'], ['18:00', '20:00']];
  function renderAdd(root, user) {
    const s = mine(user);
    if (!s) { root.innerHTML = '<div class="pad">Not a store login.</div>'; return; }
    const t = Data.today(), tm = Data.addDays(t, 1);
    root.innerHTML = '<div class="page"><a class="back" href="#/store/today">‹ Today</a><h1>Add orders</h1>' +
      '<div class="split"><section class="card"><h2>One order</h2><form id="oform" class="form">' +
      '<label>Customer name<input class="input" name="customer" required autocomplete="off"></label>' +
      '<label>Address<input class="input" name="address" required placeholder="Street, town" autocomplete="off"></label>' +
      '<div class="two"><label>Phone<input class="input" name="phone" type="tel" inputmode="tel"></label><label>Bags / boxes<input class="input" name="bags" type="number" min="1" value="1" inputmode="numeric"></label></div>' +
      '<div class="two"><label>Amount to collect<input class="input" name="amount" type="number" step="0.01" min="0" value="0" inputmode="decimal"></label><label>Pays by<select class="select" name="payType"><option value="cash">Cash</option><option value="card">Card</option></select></label></div>' +
      '<div class="two"><label>Day<select class="select" name="date"><option value="' + t + '">Today</option><option value="' + tm + '">Tomorrow</option></select></label><label>Delivery window<select class="select" name="win">' + WINDOWS.map((w, i) => '<option value="' + i + '">' + (w[2] || DUI.fmt12(w[0]) + '–' + DUI.fmt12(w[1])) + '</option>').join('') + '</select></label></div>' +
      '<label>Register / receipt # (optional)<input class="input" name="ref"></label>' +
      '<label>Notes for the driver<textarea class="input" name="notes" placeholder="e.g. side door, call when downstairs"></textarea></label>' +
      '<p class="err" id="oerr" role="alert"></p><button class="btn primary wide big">Save order</button></form></section>' +
      '<section class="card"><h2>Many orders at once</h2><p class="muted small">Upload a CSV or Excel file, or copy the rows in Excel and paste them here. First row = column names: Customer, Address, Phone, Bags, Amount, Notes, Window (e.g. 2-4pm).</p>' +
      '<label class="file-btn btn">Choose file (.csv, .xlsx)<input type="file" id="file" accept=".csv,.txt,.tsv,.xlsx,.xls" class="sr-only"></label> <button class="btn ghost" id="sample">Download a sample file</button>' +
      '<label class="form mt">…or paste here<textarea class="input" id="paste" rows="5" placeholder="Customer&#9;Address&#9;Phone&#9;Bags&#9;Amount"></textarea></label>' +
      '<div id="preview"></div>' + DUI.connectLater('Orders can flow in straight from your register (POS) once it is connected.') + '</section></div></div>';
    const f = $('#oform', root);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!f.customer.value.trim() || !f.address.value.trim()) { $('#oerr', root).textContent = 'Name and address are needed.'; return; }
      const btn = f.querySelector('button.primary'); btn.disabled = true; btn.textContent = 'Finding the address…';
      const w = WINDOWS[+f.win.value];
      const g = await Deliver.geocode(f.address.value.trim(), s.id);
      const o = Deliver.addOrder(s.id, { customer: f.customer.value.trim(), address: f.address.value.trim(), phone: f.phone.value.trim(), bags: f.bags.value, amount: f.amount.value, payType: f.payType.value, date: f.date.value, windowStart: w[0], windowEnd: w[1], ref: f.ref.value.trim(), notes: f.notes.value.trim(), lat: g.lat, lng: g.lng, approx: g.approx }, user.name);
      toast('Saved ' + o.code + (g.approx ? ' (pin approximate)' : ''));
      const m = modal('Order ' + o.code + ' saved', '<p>' + esc(o.customer) + ', ' + esc(o.address) + '</p>' + (g.approx ? '<p class="warn-text small">The map pin for this address is approximate (street or store area). Dispatch can drag it to the right door.</p>' : '') + '<div class="row-end"><button class="btn ghost" data-close>Add another</button><button class="btn primary" data-lbl>Print ' + o.bags + ' label' + (o.bags > 1 ? 's' : '') + '</button></div>', { noFocus: true });
      m.querySelector('[data-lbl]').addEventListener('click', () => { closeModal(); DUI.printLabels([o]); });
      f.reset(); btn.disabled = false; btn.textContent = 'Save order';
    });
    $('#sample', root).addEventListener('click', () => {
      const csv = 'Customer,Address,Phone,Bags,Amount,Notes,Window\n"M. Friedman","22 Garfield Rd, Monroe, NY 10950","(845) 555-0177",2,64.50,"Side door",2-4pm\n"Y. Fried","175 Wilson St, Brooklyn, NY 11211","(718) 555-0188",3,0,"",4-6pm\n';
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'orders-sample.csv'; document.body.appendChild(a); a.click(); a.remove();
    });
    const showRows = (rows, source) => preview(root, s, user, rows, source);
    $('#paste', root).addEventListener('input', (e) => { const v = e.target.value; if (v.trim()) showRows(DeliverCore.parseTable(v), 'pasted'); else $('#preview', root).innerHTML = ''; });
    $('#file', root).addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0]; if (!file) return;
      try {
        if (/\.xlsx?$/i.test(file.name)) {
          await DUI.loadScript('vendor/xlsx/xlsx.mini.min.js');
          const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
          const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
          showRows(rows.filter((r) => r.some((c) => String(c).trim() !== '')), file.name);
        } else showRows(DeliverCore.parseTable(await file.text()), file.name);
      } catch (err) { toast('Could not read that file: ' + err.message); }
    });
  }

  function preview(root, s, user, rows, source) {
    const res = DeliverCore.rowsToOrders(rows);
    const el = $('#preview', root);
    if (!res.orders.length) { el.innerHTML = '<p class="err">No rows with an address found. Check that there is an "Address" column.</p>'; return; }
    el.innerHTML = '<h3 class="mt">' + res.orders.length + ' order(s) ready</h3><div class="dtw"><table class="tbl"><thead><tr><th>Customer</th><th>Address</th><th>Phone</th><th>Bags</th><th>Collect</th><th>Window</th></tr></thead><tbody>' +
      res.orders.map((o) => '<tr><td>' + esc(o.customer) + '</td><td>' + esc(o.address) + '</td><td>' + esc(o.phone) + '</td><td>' + o.bags + '</td><td>' + (o.amount ? money(o.amount) : '—') + '</td><td>' + (o.windowStart ? DUI.fmt12(o.windowStart) + '–' + DUI.fmt12(o.windowEnd) : 'Any') + '</td></tr>').join('') +
      '</tbody></table></div><div class="row-end"><select class="select" id="imp-date"><option value="' + Data.today() + '">For today</option><option value="' + Data.addDays(Data.today(), 1) + '">For tomorrow</option></select><button class="btn primary" id="imp">Import ' + res.orders.length + ' orders</button></div><p class="muted small" id="imp-state"></p>';
    $('#imp', el).addEventListener('click', async () => {
      const btn = $('#imp', el); btn.disabled = true;
      const date = $('#imp-date', el).value, made = [];
      for (let i = 0; i < res.orders.length; i++) {
        $('#imp-state', el).textContent = 'Finding addresses on the map… ' + (i + 1) + ' of ' + res.orders.length;
        const r = res.orders[i];
        const g = await Deliver.geocode(r.address, s.id);
        made.push(Deliver.addOrder(s.id, Object.assign({}, r, { date, lat: g.lat, lng: g.lng, approx: g.approx, source: source }), user.name));
      }
      const approx = made.filter((o) => o.approx).length;
      $('#imp-state', el).textContent = '';
      const m = modal('Imported ' + made.length + ' orders', '<p>They are in the list for ' + esc(fmtDate(date)) + '. Dispatch will put them on routes.</p>' + (approx ? '<p class="warn-text small">' + approx + ' address(es) have an approximate pin; dispatch can drag them to the right door.</p>' : '') + '<div class="row-end"><button class="btn ghost" data-close>Done</button><button class="btn primary" data-lbl>Print labels</button></div>', { noFocus: true });
      m.querySelector('[data-lbl]').addEventListener('click', () => { closeModal(); DUI.printLabels(made); });
      m.querySelector('[data-close]').addEventListener('click', () => { view.date = date; location.hash = '#/store/today'; });
    });
  }

  function rangeOf(r) {
    const t = Data.today(), d = new Date(t + 'T12:00:00');
    if (r === 'today') return [t, t];
    if (r === 'week') return [Data.addDays(t, -d.getDay()), t];
    if (r === 'month') return [t.slice(0, 8) + '01', t];
    return [Data.addDays(t, -29), t];
  }
  function renderHistory(root, user) {
    const s = mine(user);
    const [from, to] = rangeOf(view.range);
    const list = Deliver.between(from, to, s.id).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.code.localeCompare(b.code)));
    const days = {};
    list.forEach((o) => { (days[o.date] = days[o.date] || []).push(o); });
    const sum = Deliver.summary(from, to).byStore[s.id] || { orders: 0, delivered: 0, failed: 0, charges: 0, cash: 0 };
    root.innerHTML = '<div class="page"><div class="page-head"><h1>History</h1><div class="chips">' + [['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['30', 'Last 30 days']].map(([k, l]) => '<button class="chip' + (view.range === k ? ' on' : '') + '" data-range="' + k + '">' + l + '</button>').join('') + '</div></div>' +
      '<div class="stats">' + DUI.stat('Orders', sum.orders) + DUI.stat('Delivered', sum.delivered, 'good') + DUI.stat('Failed', sum.failed, sum.failed ? 'bad' : '') + DUI.stat('Delivery charges', money(sum.charges)) + '</div>' +
      Object.keys(days).map((day) => { const L = days[day]; return '<section class="card"><div class="row-between"><h2>' + esc(fmtDate(day, { weekday: 'long', month: 'short', day: 'numeric' })) + '</h2><span class="muted small">' + L.filter((o) => o.status === 'delivered').length + ' delivered · ' + L.filter((o) => o.status === 'failed').length + ' failed</span></div><ul class="olist">' + L.map(orderRow).join('') + '</ul></section>'; }).join('') +
      (list.length ? '<div class="row-end"><button class="btn" id="csv">Export CSV</button></div>' : '<p class="muted">No orders in this range.</p>') + '</div>';
    $$('[data-range]', root).forEach((b) => b.addEventListener('click', () => { view.range = b.getAttribute('data-range'); App.render(); }));
    bindOrders(root, user);
    const c = $('#csv', root);
    if (c) c.addEventListener('click', () => {
      const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const rows = [['Date', 'Order', 'Receipt', 'Customer', 'Address', 'Bags', 'Status', 'Delivered at', 'Driver', 'Collected', 'Method', 'Charge']].concat(list.map((o) => [o.date, o.code, o.ref, o.customer, o.address, o.bags, Deliver.STATUS[o.status], o.proof ? new Date(o.proof.at).toLocaleTimeString('en-US') : '', (Deliver.driver(o.driverId) || {}).name || '', o.proof ? o.proof.collected : '', o.proof ? o.proof.method : '', Deliver.charge(o)]));
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(q).join(',')).join('\n')], { type: 'text/csv' })); a.download = 'deliveries-' + from + '-to-' + to + '.csv'; document.body.appendChild(a); a.click(); a.remove();
    });
  }

  function renderBilling(root, user) {
    const s = mine(user);
    const st = Deliver.settings();
    const unb = Deliver.unbilled(s.id);
    const invs = Data.list('invoices').filter((i) => i.storeId === s.id).reverse();
    const cash = Deliver.orders().filter((o) => o.storeId === s.id && o.proof && o.proof.method === 'cash' && o.date >= Data.addDays(Data.today(), -6)).reduce((a, o) => a + (+o.proof.collected || 0), 0);
    root.innerHTML = '<div class="page narrow"><h1>Billing</h1>' +
      '<section class="card"><h2>Your price</h2><ul class="dkv"><li><span>Per delivery</span><b>' + money(Deliver.priceFor(s)) + '</b></li><li><span>Bags included</span><b>' + (st.bagsIncluded || 0) + ', then ' + money(st.extraBagPrice || 0) + ' per extra bag</b></li><li><span>Failed attempt</span><b>' + money(st.failedCharge || 0) + '</b></li></ul></section>' +
      '<div class="stats">' + DUI.stat('Not billed yet', money(unb.reduce((a, o) => a + Deliver.charge(o), 0))) + DUI.stat('Open invoices', money(invs.filter((i) => i.status === 'open').reduce((a, i) => a + i.total, 0))) + DUI.stat('Cash drivers collected for you (7 days)', money(cash)) + '</div>' +
      '<section class="card"><h2>Invoices</h2>' + (invs.length ? '<ul class="olist">' + invs.map((i) => '<li><button class="orow" data-inv="' + i.id + '"><span class="grow"><b>' + esc(i.no) + '</b><span class="meta">' + esc(fmtDate(i.from, { month: 'short', day: 'numeric' })) + ' – ' + esc(fmtDate(i.to, { month: 'short', day: 'numeric' })) + ' · ' + i.delivered + ' delivered, ' + i.failed + ' failed</span></span><span class="end"><b>' + money(i.total) + '</b> <span class="dchip ' + (i.status === 'paid' ? 's-delivered' : 's-routed') + '">' + (i.status === 'paid' ? 'Paid' : 'Open') + '</span></span></button></li>').join('') + '</ul>' : '<p class="muted">No invoices yet. The delivery company sends them.</p>') + '</section>' +
      DUI.connectLater('Paying invoices by card or bank needs a payments account.') + '</div>';
    $$('[data-inv]', root).forEach((b) => b.addEventListener('click', () => invoiceModal(Data.get('invoices', b.getAttribute('data-inv')))));
  }
  function invoiceModal(inv) {
    const s = Deliver.store(inv.storeId);
    const lines = inv.orderIds.map((id) => Data.get('orders', id)).filter(Boolean);
    modal('Invoice ' + inv.no, '<p><b>' + esc(Deliver.settings().name || 'BikeAds Deliver') + '</b> → ' + esc(s ? s.name : '') + '</p><p class="muted small">' + esc(fmtDate(inv.from)) + ' – ' + esc(fmtDate(inv.to)) + '</p>' +
      '<div class="dtw"><table class="tbl"><thead><tr><th>Date</th><th>Order</th><th>Customer</th><th>Status</th><th class="nr">Charge</th></tr></thead><tbody>' + lines.map((o) => '<tr><td>' + esc(fmtDate(o.date, { month: 'short', day: 'numeric' })) + '</td><td>' + esc(o.code) + '</td><td>' + esc(o.customer) + '</td><td>' + Deliver.STATUS[o.status] + '</td><td class="nr">' + money(Deliver.charge(o)) + '</td></tr>').join('') +
      '</tbody><tfoot><tr><td colspan="4"><b>Total</b></td><td class="nr"><b>' + money(inv.total) + '</b></td></tr></tfoot></table></div><p class="small">' + (inv.status === 'paid' ? 'Paid ' + esc(new Date(inv.paidAt).toLocaleDateString('en-US')) : 'Open') + '</p><div class="row-end"><button class="btn" data-print-inv>Print</button></div>', { noFocus: true })
      .querySelector('[data-print-inv]').addEventListener('click', () => window.print());
  }

  window.StoreViews = {
    tabs: [
      { key: 'today', label: 'Orders', icon: 'box', render: renderToday },
      { key: 'add', label: 'Add', icon: 'plus', render: renderAdd },
      { key: 'history', label: 'History', icon: 'list', render: renderHistory },
      { key: 'billing', label: 'Billing', icon: 'money', render: renderBilling }
    ],
    teardown,
    invoiceModal
  };
})();
