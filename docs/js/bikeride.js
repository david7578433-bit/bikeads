/* BikeAds promo: ad-bikes riding around Williamsburg (canvas). Not a live map — a looping picture of the
 * service. More bikes ride as the client raises the count. Respects prefers-reduced-motion; pauses offscreen. */
(function () {
  'use strict';
  const LABELS = { 'Lee Avenue': 'Lee Ave', 'Bedford Avenue': 'Bedford Ave', 'Marcy Avenue': 'Marcy Ave', 'Wythe Avenue': 'Wythe Ave', 'Division Avenue': 'Division Ave', 'Broadway': 'Broadway', 'Rodney Street': 'Rodney St', 'Hooper Street': 'Hooper St', 'Keap Street': 'Keap St' };
  const MAIN = ['Lee Avenue', 'Bedford Avenue', 'Marcy Avenue', 'Division Avenue', 'Lee Avenue', 'Bedford Avenue', 'Wythe Avenue', 'Broadway', 'Rodney Street', 'Hooper Street', 'Keap Street', 'Heyward Street', 'Penn Street', 'Rutledge Street', 'Harrison Avenue', 'Ross Street', 'Middleton Street', 'Lynch Street'];
  const MAX_DRAWN = 60;
  const PANEL = ['#4f46e5', '#dc2626', '#2563eb', '#0f766e', '#7c3aed'];

  function prep(route) {
    const seg = []; let L = 0;
    for (let i = 0; i < route.length - 1; i++) { const a = route[i], b = route[i + 1]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); seg.push({ a, b, l, s: L }); L += l; }
    return { pts: route, seg, L };
  }
  function at(r, d) {
    d = Math.max(0, Math.min(r.L, d));
    let lo = 0, hi = r.seg.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (r.seg[m].s <= d) lo = m; else hi = m - 1; }
    const s = r.seg[lo], t = s.l ? (d - s.s) / s.l : 0;
    return { x: s.a[0] + (s.b[0] - s.a[0]) * t, y: s.a[1] + (s.b[1] - s.a[1]) * t, dx: s.b[0] - s.a[0], dy: s.b[1] - s.a[1] };
  }
  function rand(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }

  function mount(host, opts) {
    opts = opts || {};
    const D = window.WBURG; if (!D || !host) return { set() {}, destroy() {} };
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches && !opts.forceMotion;
    const routes = {}; Object.keys(D.routes).forEach((k) => { routes[k] = prep(D.routes[k]); });
    const cv = document.createElement('canvas'); cv.setAttribute('role', 'img');
    host.appendChild(cv);
    const ctx = cv.getContext('2d');
    let W = 0, Hh = 0, k = 1, dpr = 1, bg = null;
    const rnd = rand(opts.seed || 7);
    let label = opts.label || '';
    let target = 0; const bikes = [];
    let raf = 0, last = 0, visible = true, dead = false;

    function makeBike(i) {
      const name = MAIN[i % MAIN.length];
      const r = routes[name] || routes['Lee Avenue'];
      return { r, d: rnd() * r.L, v: (16 + rnd() * 14) * (rnd() < .5 ? -1 : 1), a: 0, want: 1, c: PANEL[i % PANEL.length], bob: rnd() * 6.28 };
    }
    function size() {
      const b = host.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(10, b.width); Hh = Math.max(10, b.height);
      cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr);
      k = Math.max(W / D.w, Hh / D.h);
      bg = null; draw(0);
    }
    function px(x) { return (x - D.w / 2) * k + W / 2; }
    function py(y) { return (y - D.h / 2) * k + Hh / 2; }

    function paintBackground() {
      const off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height;
      const g = off.getContext('2d'); g.scale(dpr, dpr);
      g.fillStyle = '#e9edf5'; g.fillRect(0, 0, W, Hh);
      // park-ish tint + river edge hint
      g.lineCap = 'round'; g.lineJoin = 'round';
      const path = (p) => { g.beginPath(); p.forEach((q, i) => (i ? g.lineTo(px(q[0]), py(q[1])) : g.moveTo(px(q[0]), py(q[1])))); };
      D.streets.forEach((s) => { path(s.p); g.strokeStyle = '#d3d9e6'; g.lineWidth = (s.w === 2 ? 11 : 7) * Math.max(.55, k); g.stroke(); });
      D.streets.forEach((s) => { path(s.p); g.strokeStyle = '#ffffff'; g.lineWidth = (s.w === 2 ? 8 : 4.5) * Math.max(.55, k); g.stroke(); });
      ['Lee Avenue', 'Bedford Avenue', 'Division Avenue'].forEach((n) => { const r = routes[n]; if (!r) return; path(r.pts); g.strokeStyle = 'rgba(79,70,229,.10)'; g.lineWidth = 12 * Math.max(.55, k); g.stroke(); });
      // street names
      g.font = '600 ' + Math.round(Math.max(9, 11 * Math.min(1.25, k))) + 'px "Plus Jakarta Sans", system-ui, sans-serif';
      g.fillStyle = '#7b849a'; g.textAlign = 'center'; g.textBaseline = 'middle';
      Object.keys(LABELS).forEach((n, j) => {
        const r = routes[n]; if (!r) return;
        const p = at(r, r.L * (0.38 + (j % 3) * 0.12));
        let ang = Math.atan2(p.dy, p.dx); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
        g.save(); g.translate(px(p.x), py(p.y)); g.rotate(ang); g.translate(0, -9 * Math.max(.7, k));
        g.fillStyle = 'rgba(233,237,245,.85)'; const tw = g.measureText(LABELS[n]).width; g.fillRect(-tw / 2 - 3, -7, tw + 6, 14);
        g.fillStyle = '#6b7590'; g.fillText(LABELS[n], 0, 0); g.restore();
      });
      g.fillStyle = 'rgba(15,23,42,.55)'; g.font = '800 ' + Math.round(Math.max(12, 15 * Math.min(1.3, k))) + 'px "Plus Jakarta Sans", system-ui, sans-serif';
      g.textAlign = 'left'; const tw0 = g.measureText('Williamsburg').width;
      g.fillStyle = 'rgba(255,255,255,.88)'; g.beginPath(); g.roundRect ? g.roundRect(8, 7, tw0 + 14, 24, 8) : g.rect(8, 7, tw0 + 14, 24); g.fill();
      g.fillStyle = 'rgba(15,23,42,.75)'; g.fillText('Williamsburg', 15, 19);
      bg = off;
    }

    function drawBike(b, t) {
      const p = at(b.r, b.d);
      const x = px(p.x), y = py(p.y) + Math.sin(t / 220 + b.bob) * .6;
      const dir = (p.dx * Math.sign(b.v)) >= 0 ? 1 : -1;
      const s = Math.max(.75, Math.min(1.35, k * 1.05)) * (opts.bikeScale || 1);
      ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, b.a)); ctx.translate(x, y); ctx.scale(dir * s, s);
      const pop = b.a < 1 ? .6 + .4 * b.a : 1; ctx.scale(pop, pop);
      // shadow
      ctx.fillStyle = 'rgba(15,23,42,.18)'; ctx.beginPath(); ctx.ellipse(0, 4, 13, 3, 0, 0, 6.283); ctx.fill();
      // ad panel (rear box)
      ctx.fillStyle = b.c; roundRect(-17, -21, 22, 14, 3); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-15, -17, 18, 2); ctx.fillRect(-15, -13, 12, 2);
      // wheels
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(-8, 0, 4.2, 0, 6.283); ctx.stroke();
      ctx.beginPath(); ctx.arc(9, 0, 4.2, 0, 6.283); ctx.stroke();
      // frame + bars
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.7; ctx.beginPath();
      ctx.moveTo(-8, 0); ctx.lineTo(0, -6); ctx.lineTo(9, 0); ctx.moveTo(0, -6); ctx.lineTo(-2, 0); ctx.lineTo(-8, 0);
      ctx.moveTo(0, -6); ctx.lineTo(-1, -8); ctx.moveTo(-3, -8); ctx.lineTo(1, -8);
      ctx.moveTo(0, -6); ctx.lineTo(7, -6); ctx.lineTo(9, 0); ctx.moveTo(7, -6); ctx.lineTo(8, -10); ctx.lineTo(11, -10);
      ctx.stroke();
      ctx.restore();
      // business name tag (kept upright, not mirrored)
      if (label && s >= .75) {
        ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, b.a));
        ctx.font = '700 ' + Math.round(8.5 * s) + 'px "Plus Jakarta Sans", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const txt = label.length > 14 ? label.slice(0, 13) + '…' : label;
        const tw = ctx.measureText(txt).width + 8;
        ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.strokeStyle = b.c; ctx.lineWidth = 1;
        roundRect(x - tw / 2, y - 31 * s - 6, tw, 12 * s, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#0f172a'; ctx.fillText(txt, x, y - 31 * s - 6 + 6 * s);
        ctx.restore();
      }
    }
    function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

    function step(dt) {
      for (let i = bikes.length - 1; i >= 0; i--) {
        const b = bikes[i];
        b.d += b.v * dt;
        if (b.d > b.r.L) { b.d = b.r.L; b.v = -Math.abs(b.v); }
        if (b.d < 0) { b.d = 0; b.v = Math.abs(b.v); }
        b.a += (b.want - b.a) * Math.min(1, dt * 3.2);
        if (b.want === 0 && b.a < .02) bikes.splice(i, 1);
      }
    }
    function draw(t) {
      if (!W) return;
      if (!bg) paintBackground();
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(bg, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bikes.slice().sort((a, b) => at(a.r, a.d).y - at(b.r, b.d).y).forEach((b) => drawBike(b, t));
    }
    function loop(t) {
      if (dead) return;
      const dt = last ? Math.min(.05, (t - last) / 1000) : 0; last = t;
      step(dt * (opts.speed || 1)); draw(t);
      raf = (visible && !document.hidden) ? requestAnimationFrame(loop) : 0;
    }
    function kick() { if (opts.manual) { draw(0); return; } if (!raf && !dead && !reduce) { last = 0; raf = requestAnimationFrame(loop); } else if (reduce) { bikes.forEach((b) => { b.a = b.want; }); draw(0); } }
    function set(n, lbl) {
      if (lbl !== undefined && lbl !== label) { label = lbl || ''; }
      target = Math.max(0, Math.min(MAX_DRAWN, n | 0));
      const live = bikes.filter((b) => b.want === 1);
      for (let i = live.length; i < target; i++) { const nb = makeBike(bikes.length + i); nb.a = reduce ? 1 : 0; bikes.push(nb); }
      if (live.length > target) live.slice(target).forEach((b) => { b.want = 0; if (reduce) b.a = 0; });
      if (reduce) { for (let i = bikes.length - 1; i >= 0; i--) if (bikes[i].want === 0) bikes.splice(i, 1); }
      cv.setAttribute('aria-label', 'Animation: ' + target + ' ad bike' + (target === 1 ? '' : 's') + ' riding around Williamsburg' + (label ? ' with ' + label + ' ads' : ''));
      kick();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(() => size()) : null; if (ro) ro.observe(host); else window.addEventListener('resize', size);
    const io = window.IntersectionObserver ? new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) kick(); }) : null; if (io) io.observe(host);
    const onVis = () => { if (!document.hidden) kick(); }; document.addEventListener('visibilitychange', onVis);
    size(); set(opts.count == null ? 3 : opts.count, label);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { bg = null; draw(0); });
    let clock = 0;
    return {
      set,
      frame(dt) { clock += dt * 1000; step(dt); draw(clock); }, /* manual stepping (used to record the promo video) */
      destroy() { dead = true; if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); if (io) io.disconnect(); document.removeEventListener('visibilitychange', onVis); cv.remove(); }
    };
  }
  window.BikeRide = { mount, MAX_DRAWN };
})();
