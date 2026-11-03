/* BikeAds Deliver — shared pieces for the plugins: status chips, the route map,
 * proof, QR labels, the signature pad, photo shrinking and the camera scanner. */
(function () {
  'use strict';
  const { esc, money, fmtDate, ago, modal, closeModal, toast } = UI;
  const COLORS = ['#7c3aed', '#0891b2', '#ea580c', '#db2777', '#65a30d', '#ca8a04', '#0f766e', '#9333ea'];

  const DUI = {
    color(driverId) {
      const i = Data.list('drivers').findIndex((d) => d.id === driverId);
      return i < 0 ? '#6b7280' : COLORS[i % COLORS.length];
    },
    initials(name) { return String(name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); },
    chip(o) {
      return '<span class="dchip s-' + o.status + '">' + Deliver.STATUS[o.status] + '</span>' + (Deliver.late(o) ? ' <span class="dchip s-late">Late</span>' : '');
    },
    win(o) { return o.windowStart ? fmt12(o.windowStart) + '–' + fmt12(o.windowEnd) : 'Any time'; },
    eta(o) { return o.eta && Deliver.isOpen(o) ? Deliver.fmtTime(o.eta) : ''; },
    pay(o) { return o.amount > 0 ? 'Collect ' + money(o.amount) + ' ' + (o.payType === 'card' ? 'card' : 'cash') : 'Prepaid'; },
    phoneDigits(p) { return String(p || '').replace(/[^\d+]/g, ''); },
    navUrl(o) {
      const ios = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;
      const dest = o.approx || o.lat == null ? encodeURIComponent(o.address) : o.lat + ',' + o.lng;
      return ios ? 'https://maps.apple.com/?daddr=' + dest + '&dirflg=w' : 'https://www.google.com/maps/dir/?api=1&destination=' + dest + '&travelmode=bicycling';
    },

    /* ---------- QR labels ---------- */
    qrSvg(text, cell) {
      if (typeof qrcode !== 'function') return '';
      const q = qrcode(0, 'M'); q.addData(text); q.make();
      const n = q.getModuleCount(); let d = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ' + (n + 4) + ' ' + (n + 4) + '" shape-rendering="crispEdges" role="img" aria-label="QR code ' + esc(text) + '"><rect x="-2" y="-2" width="' + (n + 4) + '" height="' + (n + 4) + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
    },
    labelsHtml(orders) {
      const out = [];
      orders.forEach((o) => {
        const s = Deliver.store(o.storeId) || {};
        Deliver.bags(o).forEach((code, i) => {
          out.push('<div class="label"><div class="label-qr">' + DUI.qrSvg('BKD:' + code, 4) + '</div><div class="label-txt">' +
            '<div class="label-store">' + esc(s.name || '') + '</div><div class="label-code">' + esc(o.code) + '</div>' +
            '<div class="label-bag">Bag ' + (i + 1) + ' of ' + o.bags + '</div>' +
            '<div class="label-cust">' + esc(o.customer) + '</div><div class="label-addr">' + esc(o.address) + '</div>' +
            '<div class="label-win">' + esc(fmtDate(o.date, { weekday: 'short', month: 'short', day: 'numeric' })) + ' · ' + esc(DUI.win(o)) + (o.amount > 0 ? ' · COLLECT ' + money(o.amount) : '') + '</div></div></div>');
        });
      });
      return out.join('');
    },
    printLabels(orders) {
      if (!orders.length) { toast('No orders to print'); return; }
      let el = document.getElementById('print-area');
      if (!el) { el = document.createElement('div'); el.id = 'print-area'; document.body.appendChild(el); }
      el.innerHTML = DUI.labelsHtml(orders);
      const n = orders.reduce((a, o) => a + (o.bags || 1), 0);
      const m = modal('Bag labels (' + n + ')', '<p class="muted small">One label per bag. Stick it on the bag; the driver scans the square code when loading.</p><div class="label-preview">' + DUI.labelsHtml(orders.slice(0, 2)) + '</div>' + (orders.length > 2 ? '<p class="muted small">…and ' + (n - orders.slice(0, 2).reduce((a, o) => a + o.bags, 0)) + ' more.</p>' : '') + '<div class="row-end"><button class="btn ghost" data-close>Close</button><button class="btn primary" data-print>Print labels</button></div>');
      m.querySelector('[data-print]').addEventListener('click', () => { closeModal(); document.body.classList.add('printing'); setTimeout(() => { window.print(); setTimeout(() => document.body.classList.remove('printing'), 500); }, 50); });
    },

    /* ---------- proof ---------- */
    proofHtml(o) {
      if (o.status === 'failed') return '<div class="proof fail"><strong>Not delivered:</strong> ' + esc(o.failReason || '') + (o.failNote ? ' — ' + esc(o.failNote) : '') + '<div class="muted small">' + esc(o.failedAt ? new Date(o.failedAt).toLocaleString('en-US') : '') + '</div></div>';
      const p = o.proof;
      if (!p) return '<p class="muted small">No proof yet.</p>';
      return '<div class="proof"><div class="proof-imgs">' +
        (p.photo ? '<figure><img src="' + esc(p.photo) + '" alt="Photo at the door"><figcaption>Photo at the door</figcaption></figure>' : '') +
        (p.signature ? '<figure><img class="sig" src="' + esc(p.signature) + '" alt="Signature"><figcaption>Signed' + (p.signedBy ? ' by ' + esc(p.signedBy) : '') + '</figcaption></figure>' : '') +
        '</div><ul class="dkv"><li><span>Delivered</span><b>' + esc(new Date(p.at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })) + '</b></li>' +
        '<li><span>Driver</span><b>' + esc(p.by || '') + '</b></li>' +
        '<li><span>Collected</span><b>' + (p.collected ? money(p.collected) + ' ' + esc(p.method) : 'Nothing (prepaid)') + '</b></li>' +
        (p.lat ? '<li><span>GPS at the door</span><b>' + (+p.lat).toFixed(5) + ', ' + (+p.lng).toFixed(5) + '</b></li>' : '') +
        (p.note ? '<li><span>Note</span><b>' + esc(p.note) + '</b></li>' : '') + '</ul></div>';
    },
    orderModal(o, extraHtml) {
      o = Data.get('orders', o.id) || o;
      const s = Deliver.store(o.storeId) || {}, d = Deliver.driver(o.driverId);
      const texts = Data.list('smslog').filter((x) => x.orderId === o.id);
      const html = '<div class="omod"><p>' + DUI.chip(o) + '</p>' +
        '<ul class="dkv"><li><span>Customer</span><b>' + esc(o.customer) + '</b></li><li><span>Address</span><b>' + esc(o.address) + (o.approx ? ' <em class="muted">(pin approximate)</em>' : '') + '</b></li>' +
        '<li><span>Phone</span><b>' + esc(o.phone || '—') + '</b></li><li><span>Store</span><b>' + esc(s.name || '') + (o.ref ? ' · ' + esc(o.ref) : '') + '</b></li>' +
        '<li><span>Bags</span><b>' + o.bags + (o.scanned && o.scanned.length ? ' (' + o.scanned.length + ' scanned)' : '') + '</b></li><li><span>Payment</span><b>' + esc(DUI.pay(o)) + '</b></li>' +
        '<li><span>Window</span><b>' + esc(fmtDate(o.date)) + ', ' + esc(DUI.win(o)) + '</b></li>' +
        (d ? '<li><span>Driver</span><b>' + esc(d.name) + ' · stop ' + o.seq + (DUI.eta(o) ? ' · ETA ' + DUI.eta(o) : '') + '</b></li>' : '') +
        (o.notes ? '<li><span>Notes</span><b>' + esc(o.notes) + '</b></li>' : '') + '</ul>' +
        (Deliver.DONE.includes(o.status) ? '<h3 class="mt">Proof</h3>' + DUI.proofHtml(o) : '') +
        (extraHtml || '') +
        '<h3 class="mt">History</h3><ol class="timeline">' + (o.events || []).slice().reverse().map((e) => '<li><b>' + esc(e.text) + '</b><span>' + esc(new Date(e.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) + ' · ' + esc(e.by) + '</span></li>').join('') + '</ol>' +
        (texts.length ? '<h3 class="mt">Customer texts</h3><ul class="smslist">' + texts.map((t) => '<li><span class="dchip s-' + (t.status === 'would send' ? 'routed' : 'delivered') + '">' + esc(t.status) + '</span> ' + esc(t.text) + '</li>').join('') + '</ul>' : '') +
        '</div>';
      return modal(o.code + ' · ' + o.customer, html, { noFocus: true });
    },

    /* ---------- route map ---------- */
    routeMap(el, opts) {
      opts = opts || {};
      const map = L.map(el, { zoomControl: true, tap: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, referrerPolicy: 'origin', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
      const layer = L.layerGroup().addTo(map);
      let fitted = false;
      function orders() {
        const date = opts.date || Data.today();
        return Deliver.day(date).filter((o) => (!opts.driverId || o.driverId === opts.driverId) && (!opts.storeId || o.storeId === opts.storeId) && (!opts.area || (Deliver.store(o.storeId) || {}).locationId === opts.area));
      }
      function draw() {
        layer.clearLayers();
        const list = orders(), pts = [];
        const stores = Deliver.stores().filter((s) => (!opts.storeId || s.id === opts.storeId) && (!opts.area || s.locationId === opts.area));
        stores.forEach((s) => {
          L.marker([s.lat, s.lng], { icon: L.divIcon({ className: 'd-ico', html: '<div class="d-store" title="' + esc(s.name) + '">🏪</div>', iconSize: [30, 30], iconAnchor: [15, 15] }), keyboard: false, zIndexOffset: 200 })
            .bindPopup('<strong>' + esc(s.name) + '</strong><div class="small muted">' + esc(s.address) + '</div>').addTo(layer);
          if (!opts.driverId) pts.push([s.lat, s.lng]);
        });
        const byDriver = {};
        list.forEach((o) => { if (o.driverId && o.status !== 'new') (byDriver[o.driverId] = byDriver[o.driverId] || []).push(o); });
        Object.keys(byDriver).forEach((id) => {
          const r = byDriver[id].sort((a, b) => a.seq - b.seq);
          const st = Deliver.store(r[0].storeId);
          const dep = st ? Deliver.depot(st.locationId) : null;
          const line = (dep ? [[dep.lat, dep.lng]] : []).concat(r.map((o) => [o.lat, o.lng]));
          L.polyline(line, { color: DUI.color(id), weight: 4, opacity: .75, dashArray: '1 0' }).addTo(layer);
        });
        list.forEach((o) => {
          const col = o.driverId && o.status !== 'new' ? DUI.color(o.driverId) : '#6b7280';
          const done = Deliver.DONE.includes(o.status);
          const html = '<div class="d-stop' + (done ? ' done' : '') + (o.status === 'failed' ? ' failed' : '') + (Deliver.late(o) ? ' late' : '') + '" style="--c:' + col + '">' + (o.status === 'new' ? '•' : o.status === 'delivered' ? '✓' : o.status === 'failed' ? '✕' : o.seq) + '</div>';
          const m = L.marker([o.lat, o.lng], { icon: L.divIcon({ className: 'd-ico', html, iconSize: [28, 28], iconAnchor: [14, 14] }), title: o.code + ' ' + o.customer, zIndexOffset: done ? 0 : 100 });
          m.bindPopup('<strong>' + esc(o.code) + ' · ' + esc(o.customer) + '</strong><div class="small">' + esc(o.address) + '</div><div class="small muted">' + Deliver.STATUS[o.status] + (DUI.eta(o) ? ' · ETA ' + DUI.eta(o) : '') + ' · ' + esc(DUI.win(o)) + '</div>' + (opts.onStop ? '<button class="mini" data-open-order="' + o.id + '">Open</button>' : ''));
          m.addTo(layer); pts.push([o.lat, o.lng]);
        });
        Deliver.drivers().forEach((d) => {
          if (opts.driverId && d.id !== opts.driverId) return;
          if (!d.position || !(d.onShift || opts.driverId)) return;
          if (opts.area && d.locationId !== opts.area) return;
          const live = d.position.source === 'phone';
          L.marker([d.position.lat, d.position.lng], { icon: L.divIcon({ className: 'd-ico', html: '<div class="d-driver" style="--c:' + DUI.color(d.id) + '">' + esc(DUI.initials(d.name)) + (live ? '<i class="gps"></i>' : '') + '</div>', iconSize: [36, 36], iconAnchor: [18, 18] }), zIndexOffset: 500 })
            .bindPopup('<strong>' + esc(d.name) + '</strong><div class="small muted">' + (live ? 'Phone GPS' : 'Demo position on route') + ' · ' + ago(d.position.at) + '</div>').addTo(layer);
          if (opts.driverId) pts.push([d.position.lat, d.position.lng]);
        });
        if (!fitted && pts.length) { map.fitBounds(pts, { padding: [30, 30], maxZoom: 16, animate: false }); fitted = true; }
        else if (!fitted) { map.setView([41.341, -74.169], 14); }
      }
      map.on('popupopen', (e) => {
        const b = e.popup.getElement().querySelector('[data-open-order]');
        if (b && opts.onStop) b.addEventListener('click', () => opts.onStop(b.getAttribute('data-open-order')));
      });
      let alive = true;
      draw();
      setTimeout(() => { if (alive) map.invalidateSize(); }, 60);
      const off = Deliver.on(() => { if (alive && (!map._popup || !map.hasLayer(map._popup))) draw(); });
      return { map, draw, refit() { fitted = false; draw(); }, destroy() { alive = false; off(); map.off(); map.remove(); } };
    },

    /* ---------- signature pad ---------- */
    signaturePad(canvas) {
      const ctx = canvas.getContext('2d');
      let drawing = false, empty = true, last = null;
      function size() {
        const r = canvas.getBoundingClientRect(), k = window.devicePixelRatio || 1;
        canvas.width = Math.round(r.width * k); canvas.height = Math.round(r.height * k);
        ctx.setTransform(k, 0, 0, k, 0, 0); ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111827';
      }
      const pt = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      canvas.addEventListener('pointerdown', (e) => { drawing = true; last = pt(e); canvas.setPointerCapture(e.pointerId); e.preventDefault(); });
      canvas.addEventListener('pointermove', (e) => { if (!drawing) return; const p = pt(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; empty = false; e.preventDefault(); });
      const up = () => { drawing = false; };
      canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
      setTimeout(size, 30);
      return {
        clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); empty = true; },
        isEmpty: () => empty,
        toDataURL() {      // small PNG, white background
          const c = document.createElement('canvas'), w = 360, h = Math.round(360 * canvas.height / canvas.width) || 140;
          c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(canvas, 0, 0, w, h);
          return c.toDataURL('image/png');
        }
      };
    },

    /* ---------- photo: shrink to keep the phone's storage small ---------- */
    photo(file, max) {
      max = max || 640;
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file), img = new Image();
        img.onload = () => {
          const k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.62));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that photo')); };
        img.src = url;
      });
    },

    loadScript(src) {
      return new Promise((res, rej) => {
        if (document.querySelector('script[data-src="' + src + '"]')) return res();
        const s = document.createElement('script'); s.src = src; s.setAttribute('data-src', src);
        s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s);
      });
    },

    /* ---------- camera scanner: the phone's own barcode reader when it has one, else jsQR ---------- */
    async scanner(video, onCode) {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      video.srcObject = stream; video.setAttribute('playsinline', ''); video.muted = true; await video.play();
      let detector = null;
      if ('BarcodeDetector' in window) {
        try { detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'upc_a'] }); } catch (e) { detector = null; }
      }
      if (!detector) await DUI.loadScript('vendor/jsqr/jsQR.js');
      const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
      let stopped = false, lastCode = '', lastAt = 0;
      async function loop() {
        if (stopped) return;
        try {
          let code = null;
          if (video.readyState >= 2) {
            if (detector) { const r = await detector.detect(video); if (r && r[0]) code = r[0].rawValue; }
            else {
              const w = 480, h = Math.round(480 * video.videoHeight / video.videoWidth) || 360;
              canvas.width = w; canvas.height = h; ctx.drawImage(video, 0, 0, w, h);
              const r = window.jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
              if (r) code = r.data;
            }
          }
          if (code && (code !== lastCode || Date.now() - lastAt > 2500)) { lastCode = code; lastAt = Date.now(); onCode(code); }
        } catch (e) { /* keep trying */ }
        setTimeout(loop, 220);
      }
      loop();
      return { stop() { stopped = true; stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; } };
    },
    beep(ok) {
      try {
        if (navigator.vibrate) navigator.vibrate(ok ? 60 : [200, 80, 200]);
        const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
        const a = DUI._ac || (DUI._ac = new A()), o = a.createOscillator(), g = a.createGain();
        o.frequency.value = ok ? 880 : 220; o.connect(g); g.connect(a.destination); g.gain.value = .08;
        o.start(); o.stop(a.currentTime + (ok ? .12 : .45));
      } catch (e) { /* no sound */ }
    },

    /* drag the pin to the right door */
    fixPin(o, done) {
      const m = modal('Fix pin · ' + o.code, '<p class="small muted">' + esc(o.address) + '</p><div id="pinmap" class="map pin-map"></div><p class="small muted">Drag the pin to the right building.</p><div class="row-end"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-save>Save pin</button></div>', { noFocus: true });
      const map = L.map(m.querySelector('#pinmap')).setView([o.lat, o.lng], 17);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, referrerPolicy: 'origin', attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
      const mk = L.marker([o.lat, o.lng], { draggable: true }).addTo(map);
      setTimeout(() => map.invalidateSize(), 80);
      m.querySelector('[data-save]').addEventListener('click', () => {
        const p = mk.getLatLng();
        Deliver.log(o, 'dispatch', 'Pin moved on the map', { lat: p.lat, lng: p.lng, approx: false });
        if (o.driverId) Deliver.recompute(o.driverId, o.date);
        closeModal(); toast('Pin saved'); if (done) done();
      });
    },

    busiestArea(date) {
      const n = {};
      Deliver.day(date || Data.today()).forEach((o) => { const s = Deliver.store(o.storeId); if (s) n[s.locationId] = (n[s.locationId] || 0) + 1; });
      const k = Object.keys(n).sort((a, b) => n[b] - n[a])[0];
      return k || ((Deliver.stores()[0] || {}).locationId || '');
    },

    /* little helpers */
    stat(label, value, cls) { return '<div class="stat ' + (cls || '') + '"><b>' + value + '</b><span>' + esc(label) + '</span></div>'; },
    sectionNav(items, active, base) {
      return '<nav class="seg" aria-label="Sections">' + items.map((it) => '<a href="' + base + it[0] + '" class="' + (it[0] === active ? 'on' : '') + '"' + (it[0] === active ? ' aria-current="page"' : '') + '>' + esc(it[1]) + '</a>').join('') + '</nav>';
    },
    connectLater(text) { return '<div class="connect-later"><span class="cl-tag">Connect later</span> ' + text + '</div>'; }
  };
  function fmt12(hhmm) {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':').map(Number);
    return ((h + 11) % 12 + 1) + (m ? ':' + String(m).padStart(2, '0') : '') + (h < 12 ? 'am' : 'pm');
  }
  DUI.fmt12 = fmt12;
  window.DUI = DUI;
})();
