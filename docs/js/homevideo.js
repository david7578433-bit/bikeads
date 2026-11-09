/* BikeAds v4: main page video. Default = real drone footage of Williamsburg (the Dronalist, CC BY 3.0,
 * Wikimedia Commons). The admin can upload an MP4/WebM (kept in this browser's IndexedDB) or paste a video
 * link (kept in Settings). Demo storage: an uploaded file shows only on this browser until a shared
 * storage backend is connected — the same swappable data layer as the rest of the demo. */
(function () {
  'use strict';
  const DB = 'bikeads-media', STORE = 'files';
  const DEFAULT = {
    src: 'media/hero-williamsburg.mp4', phone: 'media/hero-williamsburg-phone.mp4', poster: 'media/hero-poster.jpg',
    credit: 'Video: the Dronalist, CC BY 3.0, via Wikimedia Commons',
    creditUrl: 'https://commons.wikimedia.org/wiki/File:Aerial_view_of_MTA_Subway_Trains_on_Williamsburg_Bridge,_The_East_River,_Downtown_Manhattan,_Williamsburg_Brooklyn,_420_Kent,_Brooklyn_Shipyard,_Williamsburg_Bank,_New_York_City,_USA.webm'
  };
  const MAX_MB = 80;
  const urls = [];

  function db() {
    return new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('no IndexedDB'));
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function idb(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => { const tx = d.transaction(STORE, mode); const q = fn(tx.objectStore(STORE)); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); });
  }
  const getFile = (k) => idb('readonly', (s) => s.get(k)).catch(() => null);
  const putFile = (k, v) => idb('readwrite', (s) => s.put(v, k));
  const delFile = (k) => idb('readwrite', (s) => s.delete(k)).catch(() => null);
  const blobUrl = (b) => { const u = URL.createObjectURL(b); urls.push(u); return u; };
  const okUrl = (u) => /^https:\/\/[^\s"'<>]+$/i.test(String(u || '').trim());

  const HomeVideo = {
    DEFAULT,
    /* The video credit, shown only behind the footer's small "Credits" link (Nov 8 2026, David: "take it down" about the
     * credit line on the main page). Text and link are admin settings (Site content). The default credit belongs to the
     * default video: with an uploaded file or a pasted link it hides by itself. Empty text = no credit at all. */
    credit() {
      const s = Data.settings();
      const custom = (s.homeVideoMode || 'default') !== 'default';
      const SS = window.SiteSettings;
      const text = String(SS ? SS.get('videoCredit') : DEFAULT.credit).trim();
      let url = String(SS ? SS.get('videoCreditUrl') : DEFAULT.creditUrl).trim();
      if (!text || (custom && text === DEFAULT.credit)) return null;
      if (custom && url === DEFAULT.creditUrl) url = '';
      return { text, url: okUrl(url) ? url : '' };
    },
    creditHtml() {
      const c = HomeVideo.credit(); if (!c) return '';
      const e = UI.esc;
      return '<p class="credits-line">' + (c.url ? '<a href="' + e(c.url) + '" target="_blank" rel="noopener">' + e(c.text) + '</a>' : e(c.text)) + '</p>';
    },
    openCredits() {
      const h = HomeVideo.creditHtml(); if (!h) return;
      UI.modal('Credits', h + '<div class="row-end"><button type="button" class="btn" data-close>Close</button></div>', { noFocus: true });
    },
    /* What the main page plays now: an uploaded file, a pasted link, or the default footage. */
    async current() {
      const s = Data.settings();
      const mode = s.homeVideoMode || 'default';
      const phone = window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
      let poster = DEFAULT.poster;
      if (mode !== 'default') {
        const pf = await getFile('poster');
        if (pf) poster = blobUrl(pf); else if (okUrl(s.homePosterUrl)) poster = s.homePosterUrl.trim(); else poster = '';
      }
      if (mode === 'file') { const f = await getFile('video'); if (f) return { kind: 'file', src: blobUrl(f), poster, name: s.homeVideoName || 'Uploaded video' }; }
      if (mode === 'url' && okUrl(s.homeVideoUrl)) return { kind: 'url', src: s.homeVideoUrl.trim(), poster };
      return { kind: 'default', src: phone ? DEFAULT.phone : DEFAULT.src, poster: DEFAULT.poster };
    },
    /* Fill a <video> on the main page. Reduced motion: no autoplay, the still poster stays. */
    async mount(video) { /* no credit on the video itself (Nov 8 2026): it is behind the footer's Credits link */
      if (!video) return;
      const v = await HomeVideo.current();
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      video.muted = true; video.loop = true; video.playsInline = true; video.setAttribute('playsinline', ''); video.setAttribute('muted', '');
      if (v.poster) video.poster = v.poster;
      video.preload = reduce ? 'none' : 'auto';
      video.src = v.src;
      if (!reduce) { video.autoplay = true; const p = video.play(); if (p && p.catch) p.catch(() => { /* the poster stays */ }); }
      video.addEventListener('error', () => { if (v.kind !== 'default') { video.src = DEFAULT.src; video.poster = DEFAULT.poster; } }, { once: true });
    },
    teardown() { while (urls.length) URL.revokeObjectURL(urls.pop()); },

    /* Admin → Settings → "Main page video" */
    async renderAdmin(host) {
      if (!host) return;
      const { esc, toast } = UI;
      const s = Data.settings();
      const mode = s.homeVideoMode || 'default';
      const cur = await HomeVideo.current();
      const label = cur.kind === 'file' ? 'Your uploaded video (' + esc(cur.name) + ')' : cur.kind === 'url' ? 'Your video link' : 'Default: drone footage over Williamsburg';
      host.innerHTML = '<h2>Main page video</h2><p class="muted">The big video at the top of the main page. Upload your own street video, or paste a link to one.</p>' +
        '<div class="hv-preview"><video id="hv-prev" muted loop playsinline controls preload="metadata"' + (cur.poster ? ' poster="' + esc(cur.poster) + '"' : '') + ' src="' + esc(cur.src) + '"></video></div>' +
        '<p class="hv-now">Now showing: <strong>' + label + '</strong></p>' +
        '<form id="hv-form" class="form">' +
        '<label>Upload a video (MP4 or WebM, up to ' + MAX_MB + ' MB)<input class="input" type="file" name="file" accept="video/mp4,video/webm"></label>' +
        '<label>…or paste a video link (https, ends in .mp4 or .webm)<input class="input" type="url" name="url" inputmode="url" placeholder="https://…/street-video.mp4" value="' + esc(mode === 'url' ? (s.homeVideoUrl || '') : '') + '"></label>' +
        '<label>Poster picture, shown while the video loads (optional)<input class="input" type="file" name="poster" accept="image/jpeg,image/png,image/webp"></label>' +
        '<p class="err" id="hv-err" role="alert"></p>' +
        '<div class="row-end hv-actions"><button type="button" class="btn ghost" id="hv-reset"' + (mode === 'default' ? ' disabled' : '') + '>Use default video</button><button class="btn primary">Save video</button></div>' +
        '<p class="small muted">Note: an uploaded file is saved in this browser only for now (file storage in the database comes next). A pasted link works for everyone already.</p></form>';
      const f = host.querySelector('#hv-form'), err = host.querySelector('#hv-err'), prev = host.querySelector('#hv-prev');
      f.file.addEventListener('change', () => { const x = f.file.files[0]; if (x) { prev.removeAttribute('poster'); prev.src = blobUrl(x); prev.play().catch(() => {}); } });
      f.url.addEventListener('change', () => { if (okUrl(f.url.value)) prev.src = f.url.value.trim(); });
      f.addEventListener('submit', async (e) => {
        e.preventDefault(); err.textContent = '';
        const file = f.file.files[0], url = f.url.value.trim(), poster = f.poster.files[0];
        try {
          if (file) {
            if (!/^video\/(mp4|webm)$/.test(file.type)) { err.textContent = 'Please choose an MP4 or WebM video.'; return; }
            if (file.size > MAX_MB * 1048576) { err.textContent = 'That video is over ' + MAX_MB + ' MB. Please use a shorter or smaller one.'; return; }
            await putFile('video', file);
            if (poster) await putFile('poster', poster);
            Data.saveSettings({ homeVideoMode: 'file', homeVideoName: file.name });
          } else if (url) {
            if (!okUrl(url)) { err.textContent = 'The link must start with https://'; return; }
            if (poster) await putFile('poster', poster); else await delFile('poster');
            Data.saveSettings({ homeVideoMode: 'url', homeVideoUrl: url });
          } else if (poster && mode !== 'default') {
            await putFile('poster', poster);
          } else { err.textContent = 'Choose a video file or paste a link first.'; return; }
          toast('Main page video saved'); HomeVideo.renderAdmin(host);
        } catch (x) { err.textContent = 'Could not save the video in this browser (' + (x && x.message ? x.message : 'storage full') + ').'; }
      });
      host.querySelector('#hv-reset').addEventListener('click', async () => {
        await delFile('video'); await delFile('poster');
        Data.saveSettings({ homeVideoMode: 'default', homeVideoUrl: '', homeVideoName: '' });
        toast('Back to the default video'); HomeVideo.renderAdmin(host);
      });
    }
  };
  window.HomeVideo = HomeVideo;
})();
