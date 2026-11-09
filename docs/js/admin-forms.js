/* Media on Wheels admin menu: the settings forms. Every box saves by itself (a moment after you stop typing) and
 * shows "Saved ✓"; ↺ puts one setting back to its default; the bar at the bottom has Undo for the last change. */
(function () {
  'use strict';
  const { esc, $, $$, toast, confirmBox } = UI;
  const SS = () => window.SiteSettings;
  let lastUndo = null;

  function fieldId(k) { return 'set-' + k.replace(/[^a-z0-9]+/gi, '-'); }
  function resetBtn(k) { return '<button type="button" class="set-reset" data-reset="' + esc(k) + '" title="Back to default" aria-label="Back to default"' + (SS().isDefault(k) ? ' hidden' : '') + '>↺ Default</button>'; }
  function savedPill(k) { return '<span class="set-saved" data-saved="' + esc(k) + '" aria-live="polite"></span>'; }

  function control(d) {
    const v = SS().get(d.k), id = fieldId(d.k), ka = ' data-k="' + esc(d.k) + '" id="' + id + '"';
    switch (d.type) {
      case 'toggle':
        return '<label class="set-toggle" for="' + id + '"><span class="set-label">' + esc(d.label) + '</span><input type="checkbox" role="switch"' + ka + (v ? ' checked' : '') + '><span class="sw" aria-hidden="true"></span></label>';
      case 'number':
        return '<label class="set-label" for="' + id + '">' + esc(d.label) + '</label><div class="set-num"><button type="button" class="set-step" data-step="-1" data-for="' + id + '" aria-label="Less">−</button>' +
          '<input class="input" type="number" inputmode="decimal"' + ka + ' value="' + esc(v) + '"' + (d.min != null ? ' min="' + d.min + '"' : '') + (d.max != null ? ' max="' + d.max + '"' : '') + ' step="' + (d.step || 1) + '">' +
          '<button type="button" class="set-step" data-step="1" data-for="' + id + '" aria-label="More">+</button>' + (d.suffix ? '<span class="set-suffix">' + esc(d.suffix) + '</span>' : '') + '</div>';
      case 'textarea':
        return '<label class="set-label" for="' + id + '">' + esc(d.label) + '</label><textarea class="input" rows="3"' + ka + (d.max ? ' maxlength="' + d.max + '"' : '') + '>' + esc(v) + '</textarea>';
      case 'select':
        return '<label class="set-label" for="' + id + '">' + esc(d.label) + '</label><select class="select input"' + ka + '>' + d.options.map(([val, lab]) => '<option value="' + esc(val) + '"' + (String(v) === String(val) ? ' selected' : '') + '>' + esc(lab) + '</option>').join('') + '</select>';
      case 'color':
        return '<label class="set-label" for="' + id + '">' + esc(d.label) + '</label><div class="set-color"><input type="color"' + ka + ' value="' + esc(v) + '"><span class="set-hex">' + esc(v) + '</span></div>' +
          '<div class="set-presets" role="group" aria-label="Color presets">' + d.presets.map(([n, c]) => '<button type="button" class="set-preset' + (String(v).toLowerCase() === c ? ' on' : '') + '" data-preset="' + c + '" data-for="' + id + '" style="--c:' + c + '"><i aria-hidden="true"></i>' + esc(n) + '</button>').join('') + '</div>';
      case 'image':
        return '<label class="set-label" for="' + id + '">' + esc(d.label) + '</label><div class="set-image"><span class="set-thumb">' + (v ? '<img alt="" src="' + esc(v) + '">' : '<span class="logo big" aria-hidden="true"><i class="lf r"></i><i class="lf b"></i></span>') + '</span>' +
          '<div class="set-image-r"><label class="btn ghost small-btn set-upload">Upload<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" data-upload="' + esc(d.k) + '" hidden></label>' +
          '<input class="input" type="url" inputmode="url" placeholder="https://…/logo.png"' + ka + ' value="' + esc(/^data:/.test(v) ? '' : v) + '"></div></div>';
      case 'url':
      case 'text':
        return '<label class="set-label" for="' + id + '">' + esc(d.label) + '</label><input class="input" type="' + (d.type === 'url' ? 'url" inputmode="url' : 'text') + '"' + ka + ' value="' + esc(v) + '"' + (d.max ? ' maxlength="' + d.max + '"' : '') + '>';
      case 'list':
        return '<span class="set-label">' + esc(d.label) + '</span><ul class="set-list" data-list="' + esc(d.k) + '">' + v.map((x, i) => '<li><input class="input" value="' + esc(x) + '" data-li="' + i + '" aria-label="' + esc(d.label) + ' ' + (i + 1) + '"><button type="button" class="icon-btn" data-li-del="' + i + '" aria-label="Remove">✕</button></li>').join('') + '</ul>' +
          '<button type="button" class="btn ghost small-btn" data-li-add="' + esc(d.k) + '">+ Add</button>';
      case 'dates':
        return '<span class="set-label">' + esc(d.label) + '</span><ul class="set-list" data-dates="' + esc(d.k) + '">' + (v.length ? v.map((x, i) => '<li><b>' + esc(UI.fmtDate(x.date || x)) + '</b><span class="muted small">' + esc(x.note || '') + '</span><button type="button" class="icon-btn" data-date-del="' + i + '" aria-label="Remove this day">✕</button></li>').join('') : '<li class="muted small">No blocked days.</li>') + '</ul>' +
          '<div class="set-adddate"><input class="input" type="date" id="bd-date" aria-label="Day to block"><input class="input" id="bd-note" placeholder="Why (optional)" aria-label="Why"><button type="button" class="btn primary small-btn" data-date-add="' + esc(d.k) + '">Block day</button></div>';
      case 'items':
        return '<span class="set-label">' + esc(d.label) + '</span><ol class="set-items" data-items="' + esc(d.k) + '">' + v.map((it, i) => '<li class="set-item"><div class="set-item-f">' +
          d.item.map(([p, lab, t]) => '<label>' + esc(lab) + (t === 'textarea' ? '<textarea class="input" rows="2" data-it="' + i + '" data-p="' + p + '">' + esc(it[p] || '') + '</textarea>' : '<input class="input" data-it="' + i + '" data-p="' + p + '" value="' + esc(it[p] || '') + '">') + '</label>').join('') +
          '</div><div class="set-item-b"><button type="button" class="icon-btn" data-it-up="' + i + '" aria-label="Move up"' + (i ? '' : ' disabled') + '>↑</button><button type="button" class="icon-btn" data-it-down="' + i + '" aria-label="Move down"' + (i < v.length - 1 ? '' : ' disabled') + '>↓</button><button type="button" class="icon-btn" data-it-del="' + i + '" aria-label="Remove">✕</button></div></li>').join('') + '</ol>' +
          '<button type="button" class="btn ghost small-btn" data-it-add="' + esc(d.k) + '">+ Add</button>';
    }
    return '';
  }

  function fieldHtml(d) {
    return '<div class="set-field' + (d.type === 'toggle' ? ' is-toggle' : '') + '" data-field="' + esc(d.k) + '">' + control(d) +
      (d.help ? '<p class="set-help">' + esc(d.help) + '</p>' : '') + '<div class="set-meta">' + savedPill(d.k) + resetBtn(d.k) + '</div></div>';
  }

  function undoBar(text, undo) {
    let bar = $('#set-bar');
    if (!bar) { bar = document.createElement('div'); bar.id = 'set-bar'; bar.className = 'set-bar'; bar.setAttribute('role', 'status'); document.body.appendChild(bar); }
    bar.innerHTML = '<span>' + esc(text) + '</span>' + (undo ? '<button type="button" class="set-undo">Undo</button>' : '');
    bar.classList.add('show');
    lastUndo = undo;
    const b = bar.querySelector('.set-undo');
    if (b) b.addEventListener('click', async () => { const u = lastUndo; lastUndo = null; bar.classList.remove('show'); if (u) { await u(); toast('Undone'); } });
    clearTimeout(bar._t); bar._t = setTimeout(() => bar.classList.remove('show'), 6000);
  }

  /* Save one setting, show Saved ✓ next to it and an Undo bar. */
  async function save(host, k, value, rerender) {
    const pill = host.querySelector('[data-saved="' + k + '"]');
    if (pill) { pill.textContent = 'Saving…'; pill.className = 'set-saved'; }
    try {
      const prev = await SS().set(k, value);
      if (pill) { pill.textContent = 'Saved ✓'; pill.className = 'set-saved ok'; clearTimeout(pill._t); pill._t = setTimeout(() => { pill.textContent = ''; }, 2500); }
      const rb = host.querySelector('[data-reset="' + k + '"]'); if (rb) rb.hidden = SS().isDefault(k);
      undoBar('Saved ✓', async () => { await SS().set(k, prev === undefined ? undefined : prev); if (rerender) rerender(); });
      if (rerender) rerender();
    } catch (e) {
      console.error(e);
      if (pill) { pill.textContent = 'Not saved: ' + ((window.Auth && Auth.friendly) ? Auth.friendly(e) : e.message); pill.className = 'set-saved bad'; }
    }
  }

  /* Render one section's settings into host. parts = { '@discounts': fn(el) … } for built-in admin panels. */
  function renderFields(host, section, parts, focusKey) {
    const draw = () => {
      let html = '', group = null;
      section.fields.forEach((d) => {
        if (d.type === 'part') { if (group) { html += '</div>'; group = null; } html += '<div class="card set-part" data-part="' + esc(d.k) + '"></div>'; return; }
        if (d.group !== group) { if (group) html += '</div>'; group = d.group || null; if (group) html += '<div class="card set-group"><h3>' + esc(group) + '</h3>'; }
        html += group ? fieldHtml(d) : '<div class="card set-card">' + fieldHtml(d) + '</div>';
      });
      if (group) html += '</div>';
      host.innerHTML = html;
      $$('[data-part]', host).forEach((el) => { const fn = parts && parts[el.getAttribute('data-part')]; if (fn) fn(el); else el.remove(); });
    };
    draw();
    const timers = {};
    const val = (el) => el.type === 'checkbox' ? el.checked : el.value;
    const later = (k, fn, ms) => { clearTimeout(timers[k]); timers[k] = setTimeout(fn, ms); };
    host.addEventListener('input', (e) => {
      const el = e.target, k = el.getAttribute('data-k');
      if (k) {
        const d = SS().BY_KEY[k];
        if (d.type === 'color') { const hx = el.parentNode.querySelector('.set-hex'); if (hx) hx.textContent = el.value; }
        if (d.type === 'toggle' || d.type === 'select' || d.type === 'color') return; /* saved on change */
        later(k, () => save(host, k, d.type === 'number' ? (el.value === '' ? undefined : +el.value) : el.value.trim()), 650);
        return;
      }
      const li = el.closest('[data-list]'), it = el.closest('[data-items]');
      if (li) { const key = li.getAttribute('data-list'); later(key, () => save(host, key, $$('input[data-li]', li).map((x) => x.value.trim()).filter(Boolean)), 700); }
      if (it) { const key = it.getAttribute('data-items'); later(key, () => { const arr = SS().get(key); const i = +el.getAttribute('data-it'); arr[i] = Object.assign({}, arr[i], { [el.getAttribute('data-p')]: el.value }); save(host, key, arr); }, 700); }
    });
    host.addEventListener('change', (e) => {
      const el = e.target, k = el.getAttribute('data-k');
      if (el.hasAttribute('data-upload')) return upload(el);
      if (!k) return;
      const d = SS().BY_KEY[k];
      if (d.type === 'toggle' || d.type === 'select' || d.type === 'color') { clearTimeout(timers[k]); save(host, k, val(el), d.type === 'color' ? draw : null); }
      else if (d.type === 'number') { clearTimeout(timers[k]); save(host, k, el.value === '' ? undefined : +el.value, () => { el.value = SS().get(k); }); }
      else if (d.type === 'image') { const u = el.value.trim(); if (u && !/^https:\/\//.test(u)) { toast('Please paste an https:// link'); return; } save(host, k, u, draw); }
    });
    async function upload(input) {
      const file = input.files && input.files[0]; if (!file) return;
      if (file.size > 150 * 1024) { toast('That picture is too big (' + Math.round(file.size / 1024) + ' KB). Please use one under 150 KB.'); return; }
      const url = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
      save(host, input.getAttribute('data-upload'), url, draw);
    }
    host.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t || !host.contains(t)) return;
      const A = (n) => t.getAttribute(n);
      if (A('data-reset')) { const k = A('data-reset'); return save(host, k, undefined, draw); }
      if (A('data-step')) { const inp = $('#' + A('data-for'), host); const d = SS().BY_KEY[inp.getAttribute('data-k')]; inp.value = Math.max(d.min != null ? d.min : -1e9, Math.min(d.max != null ? d.max : 1e9, (+inp.value || 0) + (+A('data-step')) * (d.step || 1))); return save(host, inp.getAttribute('data-k'), +inp.value); }
      if (A('data-preset')) { const inp = $('#' + A('data-for'), host); return save(host, inp.getAttribute('data-k'), A('data-preset'), draw); }
      if (A('data-li-add')) { const k = A('data-li-add'); const arr = SS().get(k); arr.push(''); const ul = host.querySelector('[data-list="' + k + '"]'); ul.insertAdjacentHTML('beforeend', '<li><input class="input" data-li="' + (arr.length - 1) + '" placeholder="' + esc(SS().BY_KEY[k].placeholder || '') + '"><button type="button" class="icon-btn" data-li-del="' + (arr.length - 1) + '" aria-label="Remove">✕</button></li>'); ul.lastChild.querySelector('input').focus(); return; }
      if (A('data-li-del') != null && t.closest('[data-list]')) { const ul = t.closest('[data-list]'), k = ul.getAttribute('data-list'); const li = t.closest('li'); const v = li.querySelector('input').value.trim(); const go = () => { li.remove(); save(host, k, $$('input[data-li]', ul).map((x) => x.value.trim()).filter(Boolean), draw); }; return v ? confirmBox('Remove "' + v + '"?', 'It comes off the list. You can Undo right after.', 'Remove', go, true) : go(); }
      if (A('data-date-add')) { const k = A('data-date-add'); const ds = $('#bd-date', host).value; if (!ds) { toast('Pick a day first'); return; } const arr = SS().get(k).filter((x) => (x.date || x) !== ds); arr.push({ date: ds, note: $('#bd-note', host).value.trim() }); arr.sort((a, b) => (a.date < b.date ? -1 : 1)); return save(host, k, arr, draw); }
      if (A('data-date-del') != null) { const ul = t.closest('[data-dates]'), k = ul.getAttribute('data-dates'); const arr = SS().get(k); const x = arr[+A('data-date-del')]; return confirmBox('Open ' + UI.fmtDate(x.date || x) + ' again?', 'Clients can book this day again.', 'Remove block', () => { arr.splice(+A('data-date-del'), 1); save(host, k, arr, draw); }, true); }
      const items = t.closest('[data-items]');
      if (A('data-it-add')) { const k = A('data-it-add'); const arr = SS().get(k); const blank = {}; SS().BY_KEY[k].item.forEach(([p]) => { blank[p] = ''; }); arr.push(blank); return save(host, k, arr, () => { draw(); const last = $$('[data-items="' + k + '"] .set-item', host).pop(); if (last) last.querySelector('input,textarea').focus(); }); }
      if (items) {
        const k = items.getAttribute('data-items'), arr = SS().get(k);
        if (A('data-it-up') != null) { const i = +A('data-it-up'); [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; return save(host, k, arr, draw); }
        if (A('data-it-down') != null) { const i = +A('data-it-down'); [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; return save(host, k, arr, draw); }
        if (A('data-it-del') != null) { const i = +A('data-it-del'); const first = Object.values(arr[i] || {})[0] || 'this item'; return confirmBox('Remove "' + String(first).slice(0, 60) + '"?', 'It comes off the site. You can Undo right after.', 'Remove', () => { arr.splice(i, 1); save(host, k, arr, draw); }, true); }
      }
    });
    if (focusKey) setTimeout(() => {
      const el = host.querySelector('[data-field="' + focusKey + '"]');
      if (el) { el.classList.add('set-hit'); el.scrollIntoView({ block: 'center' }); const i = el.querySelector('input,textarea,select'); if (i) i.focus({ preventScroll: true }); setTimeout(() => el.classList.remove('set-hit'), 2600); }
    }, 60);
  }

  window.AdminForms = { renderFields, fieldHtml, save, undoBar };
})();
