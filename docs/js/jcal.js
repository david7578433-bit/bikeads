/* BikeAds v3 — Jewish + English calendar helper (Hebrew date, Yom Tov, Chol Hamoed, Chanukah, Purim,
 * fasts, Rosh Chodesh, Shabbos / parsha). Computed in the browser with @hebcal/core (vendor/hebcal, GPL-2.0+);
 * no outside service. Diaspora (chutz la'aretz) schedule. */
(function () {
  'use strict';
  const H = window.hebcal || null;
  const cache = new Map();
  const NO = 'he-x-NoNikud';
  const pad = (n) => String(n).padStart(2, '0');
  const isoOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const SKIP = /Chag HaBanot|Yom Kippur Katan|Selicho|Selichot|Mevarchim|Shabbat Mevarchim|Birkat Hachamah|Sigd|Yom HaAliyah|Yom Ha|Rabin|Ben-Gurion|Jabotinsky|Herzl|Family Day|Hebrew Language|Shabbos Mevorchim/;

  function kindOf(ev) {
    const F = H.flags, f = ev.getFlags(), d = ev.getDesc();
    if (/Chanukah|Purim/.test(d) && !(f & (F.MAJOR_FAST | F.MINOR_FAST))) return /Erev Purim/.test(d) ? 'erev' : 'fest';
    if (f & F.CHOL_HAMOED) return 'chm';
    if (f & F.CHAG) return 'yt';
    if (f & (F.MAJOR_FAST | F.MINOR_FAST)) return 'fast';
    if (f & F.ROSH_CHODESH) return 'rc';
    if (f & F.EREV) return 'erev';
    if (f & F.SPECIAL_SHABBAT) return 'shab';
    if (/Chanukah|Purim|Lag BaOmer|Tu BiShvat|Tu B'Av|Pesach Sheni|Hoshana Raba/.test(d)) return 'fest';
    return 'minor';
  }
  const RANK = { yt: 0, chm: 1, fest: 2, fast: 3, erev: 4, rc: 5, shab: 6, minor: 7 };

  function strip(s) { return String(s || '').replace(/[\u0591-\u05C7]/g, ''); }
  function cleanEn(ev) {
    const raw = ev.render('ashkenazi');
    const m = raw.match(/^Chanukah: (\d) Candles?$/);
    if (m) return 'Chanukah · ' + m[1] + (m[1] === '1' ? ' candle' : ' candles');
    if (/^Chanukah: 8th Day$/.test(raw)) return 'Chanukah · 8th day';
    return raw.replace(/\s*\(CH[’']{2}M\)/, ' · Chol Hamoed').replace(/ \d{4}$/, '');
  }

  function loadMonth(y, m) {
    const key = y + '-' + m;
    if (cache.has(key)) return cache.get(key);
    const out = {};
    if (H) {
      try {
        const evs = H.HebrewCalendar.calendar({ start: new Date(y, m, 1), end: new Date(y, m + 1, 0), il: false, sedrot: true, omer: false, noModern: true, noMinorFast: false, noSpecialShabbat: false, locale: 'ashkenazi' });
        evs.forEach((ev) => {
          const ds = isoOf(ev.getDate().greg());
          const o = out[ds] || (out[ds] = { events: [], parsha: null });
          const d = ev.getDesc();
          if (H.flags && (ev.getFlags() & H.flags.PARSHA_HASHAVUA)) { o.parsha = { en: ev.render('ashkenazi'), he: strip(ev.render(NO)) }; return; }
          if (SKIP.test(d)) return;
          if (H.flags && (ev.getFlags() & (H.flags.MODERN_HOLIDAY | H.flags.DAF_YOMI | H.flags.OMER_COUNT | H.flags.MOLAD | H.flags.HEBREW_DATE))) return;
          o.events.push({ en: cleanEn(ev), he: strip(ev.render(NO)).replace(/ \d{4}$/, ''), kind: kindOf(ev) });
        });
        Object.values(out).forEach((o) => o.events.sort((a, b) => RANK[a.kind] - RANK[b.kind]));
      } catch (e) { console.error('hebcal', e); }
    }
    cache.set(key, out);
    return out;
  }

  function hdate(ds) {
    if (!H) return null;
    const p = ds.split('-').map(Number);
    return new H.HDate(new Date(p[0], p[1] - 1, p[2]));
  }

  const JCal = {
    ready: !!H,
    /* everything about one day, ds = 'YYYY-MM-DD' */
    day(ds) {
      const hd = hdate(ds);
      const p = ds.split('-').map(Number);
      const dow = new Date(p[0], p[1] - 1, p[2]).getDay();
      const info = loadMonth(p[0], p[1] - 1)[ds] || { events: [], parsha: null };
      if (!hd) return { ds, dow, shabbos: dow === 6, events: [], parsha: null, heDay: '', heMonth: '', heFull: '' };
      return {
        ds, dow, shabbos: dow === 6,
        heDay: H.gematriya(hd.getDate()),
        heMonth: strip(H.Locale.gettext(hd.getMonthName(), NO)),
        heFull: strip(hd.renderGematriya(true)),
        enHeb: hd.render('ashkenazi'),
        hebDayNum: hd.getDate(),
        events: info.events, parsha: info.parsha
      };
    },
    /* "חשון – כסלו תשפ״ז" for the header of a Gregorian month */
    monthLabel(y, m) {
      if (!H) return '';
      const a = new H.HDate(new Date(y, m, 1)), b = new H.HDate(new Date(y, m + 1, 0));
      const ma = strip(H.Locale.gettext(a.getMonthName(), NO)), mb = strip(H.Locale.gettext(b.getMonthName(), NO));
      const ya = H.gematriya(a.getFullYear()), yb = H.gematriya(b.getFullYear());
      if (ya === yb) return ma === mb ? ma + ' ' + ya : ma + ' – ' + mb + ' ' + yb;
      return ma + ' ' + ya + ' – ' + mb + ' ' + yb;
    },
    /* all holidays in a Gregorian month, for the list under the calendar */
    monthHolidays(y, m) {
      const days = loadMonth(y, m);
      return Object.keys(days).sort().map((ds) => ({ ds, events: days[ds].events })).filter((x) => x.events.length);
    },
    /* rows for the list under the calendar; Chanukah days and Chol Hamoed days are joined into one row each */
    monthRows(y, m) {
      const rows = [];
      this.monthHolidays(y, m).forEach((x) => x.events.forEach((e) => {
        let key = null, en = e.en, he = e.he;
        if (/^Chanukah/.test(e.en)) { key = 'chanukah'; en = 'Chanukah'; he = 'חנוכה'; }
        else if (e.kind === 'chm') { const base = e.en.split(' ')[0]; key = 'chm-' + base; en = base + ' · Chol Hamoed'; he = 'חול המועד ' + (e.he.split(' ')[0] || ''); }
        const prevDay = (() => { const p = x.ds.split('-').map(Number); return isoOf(new Date(p[0], p[1] - 1, p[2] - 1)); })();
        const prev = key && rows.find((r) => r.key === key && r.to === prevDay);
        if (prev) { prev.to = x.ds; return; }
        rows.push({ key, from: x.ds, to: x.ds, en, he, kind: e.kind });
      }));
      return rows.sort((a, b) => a.from.localeCompare(b.from));
    },
    KIND_LABEL: { yt: 'Yom Tov', chm: 'Chol Hamoed', fest: 'Chanukah · Purim', fast: 'Fast day', rc: 'Rosh Chodesh', erev: 'Erev Yom Tov' }
  };
  window.JCal = JCal;
})();
