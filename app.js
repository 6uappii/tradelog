(() => {
  const KEY = 'tradelog.v1';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  let trades = load();
  let editingId = null;
  let calMonth = startOfMonth(new Date());
  let openId = null;      // trade shown in drawer
  let navList = [];       // ids the drawer steps through

  // ---------- storage ----------
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
  }
  function save() {
    localStorage.setItem(KEY, JSON.stringify(trades));
    render();
  }

  // ---------- helpers ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n, sign = true) => {
    const a = Math.abs(n);
    const s = a.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: a < 1000 ? 2 : 0 });
    return (n < 0 ? '−$' : sign && n > 0 ? '+$' : '$') + s;
  };
  const pct = (n, sign = true) => (n < 0 ? '−' : sign && n > 0 ? '+' : '') + Math.abs(n * 100).toFixed(2) + '%';
  const price = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 6 }));
  const fmtR = (r) => (r == null ? '—' : (r < 0 ? '−' : r > 0 ? '+' : '') + Math.abs(r).toFixed(2) + 'R');
  const cls = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
  const num = (v) => (v === '' || v == null ? null : Number(v));
  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function isoDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  const uid = () => Math.random().toString(36).slice(2, 10);
  const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
  const WEEKDAYS_FULL = ['понеділок', 'вівторок', 'середа', 'четвер', 'пʼятниця', 'субота', 'неділя'];
  const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
  const MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
  const weekdayIdx = (iso) => (new Date(iso + 'T00:00').getDay() + 6) % 7;
  const longDate = (iso) => { const d = new Date(iso + 'T00:00'); return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}, ${WEEKDAYS_FULL[weekdayIdx(iso)]}`; };

  const dirOf = (t) => (t.side === 'short' ? -1 : 1);
  const grossOf = (t) => (t.exit - t.entry) * t.qty * dirOf(t);
  const pnlOf = (t) => grossOf(t) - (t.fees || 0);
  const riskOf = (t) => (t.stop == null || t.stop === t.entry ? null : Math.abs(t.entry - t.stop) * t.qty);
  function rOf(t) { const r = riskOf(t); return r ? pnlOf(t) / r : null; }
  const moveOf = (t) => ((t.exit - t.entry) / t.entry) * dirOf(t);
  const sorted = () => [...trades].sort((a, b) => a.date.localeCompare(b.date) || a.created - b.created);
  const byId = (id) => trades.find((t) => t.id === id);

  // ---------- stats ----------
  function computeStats(list) {
    const pnls = list.map(pnlOf);
    const wins = pnls.filter((p) => p > 0);
    const losses = pnls.filter((p) => p < 0);
    const net = pnls.reduce((a, b) => a + b, 0);
    const grossW = wins.reduce((a, b) => a + b, 0);
    const grossL = Math.abs(losses.reduce((a, b) => a + b, 0));
    let peak = 0, eq = 0, maxDD = 0;
    for (const p of pnls) { eq += p; peak = Math.max(peak, eq); maxDD = Math.max(maxDD, peak - eq); }
    let best = 0, worst = 0, cur = 0;
    for (const p of pnls) {
      if (p > 0) cur = cur > 0 ? cur + 1 : 1; else if (p < 0) cur = cur < 0 ? cur - 1 : -1; else cur = 0;
      best = Math.max(best, cur); worst = Math.min(worst, cur);
    }
    const rs = list.map(rOf).filter((r) => r != null);
    return {
      n: list.length, net, wins: wins.length, losses: losses.length,
      winRate: list.length ? wins.length / list.length : 0,
      avgW: wins.length ? grossW / wins.length : 0,
      avgL: losses.length ? grossL / losses.length : 0,
      pf: grossL ? grossW / grossL : grossW ? Infinity : 0,
      expectancy: list.length ? net / list.length : 0,
      maxDD, streak: cur, bestStreak: best, worstStreak: -worst,
      avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
      best: pnls.length ? Math.max(...pnls) : 0,
      worst: pnls.length ? Math.min(...pnls) : 0,
    };
  }

  function statCells(items) {
    return items.map(([l, v, c, sub]) =>
      `<div class="stat"><div class="label">${l}</div><div class="value ${c || ''}">${v}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`).join('');
  }

  function renderStats() {
    if (!trades.length) { $('#stats').innerHTML = ''; $('#ddLabel').textContent = ''; return; }
    const s = computeStats(sorted());
    const pf = s.pf === Infinity ? '∞' : s.pf.toFixed(2);
    const streakTxt = s.streak > 0 ? `${s.streak} у плюс` : s.streak < 0 ? `${-s.streak} у мінус` : '—';
    $('#stats').innerHTML = statCells([
      ['Чистий результат', money(s.net), cls(s.net), `${s.n} угод`],
      ['Відсоток виграшних', (s.winRate * 100).toFixed(1) + '%', '', `${s.wins} виграшів · ${s.losses} програшів`],
      ['Profit factor', pf, s.pf >= 1 ? 'pos' : 'neg', 'прибуток ÷ збиток'],
      ['Очікування', money(s.expectancy), cls(s.expectancy), 'на одну угоду'],
      ['Середній виграш', money(s.avgW, false), 'pos', s.avgL ? `у ${(s.avgW / s.avgL).toFixed(2)}× від програшу` : ''],
      ['Середній програш', money(-s.avgL), 'neg', ''],
      ['Максимальна просадка', money(-s.maxDD), s.maxDD ? 'neg' : '', 'від піку капіталу'],
      ['Поточна серія', streakTxt, s.streak > 0 ? 'pos' : s.streak < 0 ? 'neg' : '', `рекорди: ${s.bestStreak} у плюс, ${s.worstStreak} у мінус`],
    ]);
    $('#ddLabel').textContent = `найкраща ${money(s.best)}  ·  найгірша ${money(s.worst)}`;
  }

  // ---------- equity curve ----------
  function renderEquity() {
    const el = $('#equity');
    const list = sorted();
    if (!list.length) { el.innerHTML = '<p class="muted">Тут з’явиться крива капіталу.</p>'; return; }
    const W = Math.max(320, el.clientWidth || 600), H = 270, P = { l: 64, r: 8, t: 10, b: 22 };
    const pts = [0];
    list.forEach((t) => pts.push(pts[pts.length - 1] + pnlOf(t)));
    const min = Math.min(0, ...pts), max = Math.max(0, ...pts);
    const span = max - min || 1;
    const x = (i) => P.l + (i / (pts.length - 1 || 1)) * (W - P.l - P.r);
    const y = (v) => P.t + (1 - (v - min) / span) * (H - P.t - P.b);
    const line = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const area = `${line}L${x(pts.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
    const ticks = [max, (min + max) / 2, min];
    el.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
        <defs>
          <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke="#1b1a17" stroke-opacity=".12" stroke-width="2"/>
          </pattern>
        </defs>
        ${ticks.map((v) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule)"/>
          <text x="${P.l - 8}" y="${y(v) + 4}" fill="var(--muted)" font-size="11" font-family="IBM Plex Mono, monospace" text-anchor="end">${money(v, false)}</text>`).join('')}
        <line x1="${P.l}" x2="${W - P.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--ink)"/>
        <text x="${P.l}" y="${H - 4}" fill="var(--muted)" font-size="11" font-family="IBM Plex Mono, monospace">${esc(list[0].date)}</text>
        <text x="${W - P.r}" y="${H - 4}" fill="var(--muted)" font-size="11" font-family="IBM Plex Mono, monospace" text-anchor="end">${esc(list[list.length - 1].date)}</text>
        <path d="${area}" fill="url(#hatch)"/>
        <path d="${line}" fill="none" stroke="var(--ink)" stroke-width="1.75" stroke-linejoin="round"/>
        <line id="eqCursor" x1="0" x2="0" y1="${P.t}" y2="${H - P.b}" stroke="var(--ink)" stroke-dasharray="2 3" opacity="0"/>
        <circle id="eqDot" r="4" fill="var(--sheet)" stroke="var(--ink)" stroke-width="1.5" opacity="0"/>
        <rect x="${P.l}" y="0" width="${W - P.l - P.r}" height="${H}" fill="transparent" id="eqHit" style="cursor:pointer"/>
      </svg>`;
    const svg = el.querySelector('svg');
    const hit = el.querySelector('#eqHit');
    const cursor = el.querySelector('#eqCursor');
    const dot = el.querySelector('#eqDot');
    const idxAt = (e) => {
      const r = svg.getBoundingClientRect();
      const vx = ((e.clientX - r.left) / r.width) * W;
      return Math.max(1, Math.min(pts.length - 1, Math.round(((vx - P.l) / (W - P.l - P.r)) * (pts.length - 1))));
    };
    hit.addEventListener('mousemove', (e) => {
      const i = idxAt(e), t = list[i - 1];
      cursor.setAttribute('x1', x(i)); cursor.setAttribute('x2', x(i)); cursor.setAttribute('opacity', '1');
      dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(pts[i])); dot.setAttribute('opacity', '1');
      showTip(e, `№${i} · ${esc(t.date)} · ${esc(t.ticker)}<br><span class="${cls(pnlOf(t))}">${money(pnlOf(t))}</span> → ${money(pts[i])}<br><span style="opacity:.6">натисни, щоб відкрити</span>`);
    });
    hit.addEventListener('mouseleave', () => { cursor.setAttribute('opacity', '0'); dot.setAttribute('opacity', '0'); hideTip(); });
    hit.addEventListener('click', (e) => { hideTip(); openTrade(list[idxAt(e) - 1].id, list.map((t) => t.id)); });
  }

  // ---------- calendar ----------
  function renderCalendar() {
    const byDay = {};
    for (const t of trades) {
      byDay[t.date] ??= { pnl: 0, n: 0 };
      byDay[t.date].pnl += pnlOf(t);
      byDay[t.date].n++;
    }
    const maxAbs = Math.max(1, ...Object.values(byDay).map((d) => Math.abs(d.pnl)));
    const y = calMonth.getFullYear(), m = calMonth.getMonth();
    const first = new Date(y, m, 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(y, m, 1 - offset);
    const today = isoDate(new Date());
    let html = WEEKDAYS.map((d) => `<div class="cal-h">${d}</div>`).join('') + '<div class="cal-h">Тиждень</div>';
    let monthTotal = 0;
    for (let w = 0; w < 6; w++) {
      let weekPnl = 0, weekN = 0;
      for (let d = 0; d < 7; d++) {
        const day = new Date(start); day.setDate(start.getDate() + w * 7 + d);
        const iso = isoDate(day);
        const info = byDay[iso];
        const inMonth = day.getMonth() === m;
        let style = '';
        if (info) {
          const a = 0.18 + 0.62 * Math.min(1, Math.abs(info.pnl) / maxAbs);
          style = `background: ${info.pnl >= 0 ? `rgba(29,107,67,${a * 0.55})` : `rgba(168,50,31,${a * 0.5})`}`;
          if (inMonth) { weekPnl += info.pnl; weekN += info.n; monthTotal += info.pnl; }
        }
        html += `<div class="cal-d ${inMonth ? '' : 'out'} ${iso === today ? 'today' : ''} ${info ? 'has' : ''}" style="${style}" data-day="${iso}">
          <span class="n">${day.getDate()}</span>
          ${info ? `<span class="p">${money(info.pnl)}</span>` : ''}
        </div>`;
      }
      html += `<div class="cal-w">${weekN ? `<span class="p ${cls(weekPnl)}">${money(weekPnl)}</span><span class="muted">${weekN} уг.</span>` : '<span class="muted">—</span>'}</div>`;
    }
    $('#calendar').innerHTML = html;
    $('#calTitle').innerHTML = `${MONTHS[m]} ${y} <span class="mono ${cls(monthTotal)}" style="font-size:14px;font-weight:500">${monthTotal ? money(monthTotal) : ''}</span>`;
    $$('#calendar .cal-d.has').forEach((c) => {
      const dayTrades = () => sorted().filter((t) => t.date === c.dataset.day);
      c.addEventListener('mousemove', (e) => {
        showTip(e, `<b>${c.dataset.day}</b><br>` + dayTrades().map((t) => `${esc(t.ticker)} <span class="${cls(pnlOf(t))}">${money(pnlOf(t))}</span>`).join('<br>'));
      });
      c.addEventListener('mouseleave', hideTip);
      c.addEventListener('click', () => { hideTip(); const l = dayTrades(); openTrade(l[0].id, l.map((t) => t.id)); });
    });
  }

  // ---------- trades table ----------
  function filteredTrades() {
    const q = $('#search').value.trim().toLowerCase();
    return sorted().reverse().filter((t) =>
      !q || [t.ticker, t.setup, t.notes, t.emotion, t.side, t.date].some((f) => String(f || '').toLowerCase().includes(q)));
  }
  function renderTable() {
    const list = filteredTrades();
    $('#tradeCount').textContent = trades.length ? `· ${list.length}` : '';
    if (!list.length) {
      $('#tradeRows').innerHTML = `<tr><td colspan="10" class="muted" style="text-align:center;padding:30px">${trades.length ? 'Нічого не знайдено' : 'Угод поки немає'}</td></tr>`;
      return;
    }
    $('#tradeRows').innerHTML = list.map((t) => {
      const p = pnlOf(t), r = rOf(t);
      return `<tr class="trade ${t.id === openId ? 'selected' : ''}" data-id="${t.id}">
        <td class="mono">${esc(t.date)}</td>
        <td><span class="tk">${esc(t.ticker)}</span>${t.notes ? '<span class="note-ico" title="Є нотатка">✎</span>' : ''}</td>
        <td><span class="side ${t.side}">${t.side === 'short' ? 'Short' : 'Long'}</span></td>
        <td class="num">${price(t.entry)}</td><td class="num">${price(t.exit)}</td><td class="num">${price(t.qty)}</td>
        <td class="num ${cls(p)}">${money(p)}</td>
        <td class="num ${cls(r || 0)}">${fmtR(r)}</td>
        <td>${t.setup ? `<span class="tag">${esc(t.setup)}</span>` : ''}</td>
        <td>${esc(t.emotion)}</td>
      </tr>`;
    }).join('');
  }

  // ---------- trade detail drawer ----------
  function openTrade(id, list) {
    openId = id;
    if (list) navList = list;
    if (!navList.includes(id)) navList = filteredTrades().map((t) => t.id);
    renderDrawer();
    $('#drawer').classList.add('open');
    $('#drawer').setAttribute('aria-hidden', 'false');
    $('#drawerBackdrop').classList.add('open');
    $$('#tradeRows tr.trade').forEach((r) => r.classList.toggle('selected', r.dataset.id === id));
  }
  function closeTrade() {
    openId = null;
    $('#drawer').classList.remove('open');
    $('#drawer').setAttribute('aria-hidden', 'true');
    $('#drawerBackdrop').classList.remove('open');
    $$('#tradeRows tr.selected').forEach((r) => r.classList.remove('selected'));
  }
  function stepTrade(delta) {
    const i = navList.indexOf(openId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= navList.length) return;
    openTrade(navList[j]);
  }

  function ladderSVG(t) {
    const marks = [
      { k: 'Стоп', v: t.stop, c: 'var(--red)' },
      { k: 'Вхід', v: t.entry, c: 'var(--ink)' },
      { k: 'Вихід', v: t.exit, c: pnlOf(t) >= 0 ? 'var(--green)' : 'var(--red)' },
      { k: 'Ціль', v: t.target, c: 'var(--green)' },
    ].filter((m) => m.v != null);
    const vals = marks.map((m) => m.v);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo || Math.abs(hi) * 0.01 || 1) * 0.08;
    lo -= pad; hi += pad;
    const W = 500, H = 92, L = 10, R = 10, Y = 46;
    const x = (v) => L + ((v - lo) / (hi - lo)) * (W - L - R);
    const ex = x(t.exit), en = x(t.entry);
    let svg = `<svg viewBox="0 0 ${W} ${H}">`;
    svg += `<line x1="${L}" x2="${W - R}" y1="${Y}" y2="${Y}" stroke="var(--rule)" stroke-width="1"/>`;
    if (t.stop != null) {
      const sx = x(t.stop);
      svg += `<rect x="${Math.min(sx, en)}" y="${Y - 5}" width="${Math.abs(en - sx)}" height="10" fill="var(--red-bg)"/>`;
    }
    if (t.target != null) {
      const tx = x(t.target);
      svg += `<rect x="${Math.min(tx, en)}" y="${Y - 5}" width="${Math.abs(tx - en)}" height="10" fill="var(--green-bg)"/>`;
    }
    svg += `<line x1="${en}" x2="${ex}" y1="${Y}" y2="${Y}" stroke="${pnlOf(t) >= 0 ? 'var(--green)' : 'var(--red)'}" stroke-width="3"/>`;
    // labels alternate above / below to avoid collisions
    const order = [...marks].sort((a, b) => a.v - b.v);
    order.forEach((m, i) => {
      const mx = x(m.v), up = i % 2 === 0;
      const anchor = mx < 60 ? 'start' : mx > W - 60 ? 'end' : 'middle';
      svg += `<line x1="${mx}" x2="${mx}" y1="${Y - 10}" y2="${Y + 10}" stroke="${m.c}" stroke-width="2"/>`;
      svg += `<text x="${mx}" y="${up ? Y - 26 : Y + 26}" text-anchor="${anchor}" font-size="11" fill="var(--muted)" font-family="IBM Plex Sans, sans-serif">${m.k}</text>`;
      svg += `<text x="${mx}" y="${up ? Y - 14 : Y + 38}" text-anchor="${anchor}" font-size="12" fill="${m.c}" font-family="IBM Plex Mono, monospace">${price(m.v)}</text>`;
    });
    return svg + '</svg>';
  }

  // ---------- price chart (lightweight-charts + Binance candles) ----------
  const BINANCE = 'https://data-api.binance.vision/api/v3/klines';
  const CRYPTO_RE = /^[A-Z0-9]{2,12}(USDT|USDC|FDUSD|BTC|ETH|BNB)$/;
  const INTERVALS = [['1m', 60], ['3m', 180], ['5m', 300], ['15m', 900], ['30m', 1800], ['1h', 3600], ['2h', 7200], ['4h', 14400], ['6h', 21600], ['12h', 43200], ['1d', 86400]];
  const klineCache = new Map();
  const TZ = -new Date().getTimezoneOffset() * 60; // chart shows local time
  let chart = null;
  let chartToken = 0;

  // entry/exit as unix seconds; falls back to the whole day when times are unknown
  function tradeTimes(t) {
    const exitDate = t.exitDate || t.date;
    const entry = new Date(`${t.date}T${t.entryTime || '00:00'}`).getTime() / 1000;
    let exit = new Date(`${exitDate}T${t.exitTime || (t.entryTime && !t.exitDate ? '' : '23:59')}`).getTime() / 1000;
    if (!t.exitTime && t.entryTime && !t.exitDate) exit = entry + 3600; // only entry time known
    if (!(exit > entry)) exit = entry + 3600;
    return { entry, exit, exact: Boolean(t.entryTime && t.exitTime) };
  }

  async function fetchKlines(symbol, interval, startMs, endMs) {
    const url = `${BINANCE}?symbol=${symbol}&interval=${interval}&startTime=${startMs}&endTime=${endMs}&limit=1000`;
    if (klineCache.has(url)) return klineCache.get(url);
    const res = await fetch(url);
    if (!res.ok) throw new Error('binance ' + res.status);
    const rows = await res.json();
    klineCache.set(url, rows);
    return rows;
  }

  function levelsOf(t) {
    const win = pnlOf(t) >= 0;
    return [
      t.stop != null && { price: t.stop, color: '#a8321f', lineStyle: 2, title: 'Стоп' },
      t.target != null && { price: t.target, color: '#1d6b43', lineStyle: 2, title: 'Тейк' },
      { price: t.entry, color: '#1b1a17', lineStyle: 0, title: 'Вхід' },
      { price: t.exit, color: win ? '#1d6b43' : '#a8321f', lineStyle: 1, title: 'Вихід' },
    ].filter(Boolean);
  }

  function makeChart(el) {
    const LWC = window.LightweightCharts;
    return LWC.createChart(el, {
      autoSize: true,
      layout: { background: { color: '#faf8f3' }, textColor: '#7a7366', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 },
      grid: { vertLines: { color: '#ece6da' }, horzLines: { color: '#e2dbcc' } },
      rightPriceScale: { borderColor: '#d8d1c2', scaleMargins: { top: 0.12, bottom: 0.12 } },
      timeScale: { borderColor: '#d8d1c2', timeVisible: true, secondsVisible: false, rightOffset: 3 },
      crosshair: { mode: LWC.CrosshairMode.Normal, vertLine: { color: '#1b1a17', style: 3, labelBackgroundColor: '#1b1a17' }, horzLine: { color: '#1b1a17', style: 3, labelBackgroundColor: '#1b1a17' } },
      handleScroll: true, handleScale: true,
    });
  }

  function addLevels(series, t) {
    const levels = levelsOf(t);
    levels.forEach((l) => series.createPriceLine({ ...l, lineWidth: l.title === 'Вхід' ? 2 : 1, axisLabelVisible: true }));
    const prices = levels.map((l) => l.price);
    series.applyOptions({
      autoscaleInfoProvider: (orig) => {
        const r = orig();
        const lo = Math.min(...prices, r ? r.priceRange.minValue : Infinity);
        const hi = Math.max(...prices, r ? r.priceRange.maxValue : -Infinity);
        return { priceRange: { minValue: lo, maxValue: hi } };
      },
    });
  }

  function entryExitMarkers(t, entryT, exitT) {
    const long = t.side !== 'short';
    const win = pnlOf(t) >= 0;
    return [
      { time: entryT, position: long ? 'belowBar' : 'aboveBar', color: '#1b1a17', shape: long ? 'arrowUp' : 'arrowDown', text: `${long ? 'Long' : 'Short'} ${price(t.entry)}` },
      { time: exitT, position: long ? 'aboveBar' : 'belowBar', color: win ? '#1d6b43' : '#a8321f', shape: 'circle', text: `Вихід ${price(t.exit)}` },
    ].sort((a, b) => a.time - b.time);
  }

  async function renderPriceChart(t) {
    const box = $('#priceChart'), note = $('#chartNote');
    if (!box) return;
    const token = ++chartToken;
    if (chart) { chart.remove(); chart = null; }
    if (!window.LightweightCharts) { box.innerHTML = '<p class="muted" style="padding:20px">Бібліотека графіків не завантажилась.</p>'; return; }

    const tt = tradeTimes(t);
    const symbol = t.ticker.replace(/[^A-Z0-9]/g, '');
    let candles = null, iv = null;

    if (CRYPTO_RE.test(symbol)) {
      const span = tt.exit - tt.entry;
      const from = tt.entry - Math.max(span * 0.8, 3600 * 3);
      const to = Math.min(tt.exit + Math.max(span * 0.5, 3600 * 2), Date.now() / 1000);
      iv = INTERVALS.find(([, s]) => (to - from) / s <= 160) || INTERVALS[INTERVALS.length - 1];
      note.textContent = 'Завантажую свічки з Binance…';
      try {
        const rows = await fetchKlines(symbol, iv[0], Math.floor(from * 1000), Math.floor(to * 1000));
        if (rows.length) candles = rows.map((r) => ({ time: r[0] / 1000 + TZ, open: +r[1], high: +r[2], low: +r[3], close: +r[4] }));
      } catch { /* fall through to the schematic */ }
      if (token !== chartToken) return; // user moved to another trade meanwhile
    }

    chart = makeChart(box);
    const snap = (sec) => (iv ? Math.floor(sec / iv[1]) * iv[1] : sec) + TZ;

    if (candles) {
      const series = chart.addCandlestickSeries({
        upColor: '#1d6b43', downColor: '#a8321f', borderVisible: false,
        wickUpColor: '#1d6b43', wickDownColor: '#a8321f', priceLineVisible: false, lastValueVisible: false,
        priceFormat: { type: 'price', precision: t.entry < 1 ? 5 : t.entry < 100 ? 3 : 2, minMove: t.entry < 1 ? 0.00001 : t.entry < 100 ? 0.001 : 0.01 },
      });
      series.setData(candles);
      addLevels(series, t);
      const first = candles[0].time, last = candles[candles.length - 1].time;
      const clamp = (x) => Math.min(last, Math.max(first, x));
      series.setMarkers(entryExitMarkers(t, clamp(snap(tt.entry)), clamp(snap(tt.exit))));
      // tint the holding period
      const hold = chart.addHistogramSeries({ priceScaleId: 'hold', color: 'rgba(233,223,184,0.55)', priceLineVisible: false, lastValueVisible: false });
      chart.priceScale('hold').applyOptions({ visible: false, scaleMargins: { top: 0, bottom: 0 } });
      hold.setData(candles.map((c) => ({ time: c.time, value: c.time >= snap(tt.entry) && c.time <= snap(tt.exit) ? 1 : 0 })));
      note.innerHTML = `Свічки Binance · ${symbol} · ${iv[0]}${tt.exact ? '' : ' · час входу/виходу не вказано, показано весь день'}`;
    } else {
      const series = chart.addLineSeries({ color: '#1b1a17', lineWidth: 2, lineStyle: 0, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: true });
      // a straight entry→exit segment, sampled so bars (and markers) stay normal-sized,
      // with empty padding on both sides
      const STEPS = 40, PAD = 12;
      const step = Math.max(60, Math.round((tt.exit - tt.entry) / STEPS));
      const a = tt.entry + TZ, b = a + step * STEPS;
      const data = [];
      for (let i = -PAD; i <= STEPS + PAD; i++) {
        const time = a + i * step;
        data.push(i < 0 || i > STEPS ? { time } : { time, value: t.entry + (t.exit - t.entry) * (i / STEPS) });
      }
      series.setData(data);
      addLevels(series, t);
      series.setMarkers(entryExitMarkers(t, a, b));
      note.textContent = CRYPTO_RE.test(symbol)
        ? `Не вдалося завантажити котирування ${symbol} — показано схему угоди.`
        : 'Схема угоди: вхід → вихід на фоні рівнів. Реальні свічки підтягуються для крипто-пар Binance (BTCUSDT, ETHUSDT…).';
    }
    chart.timeScale().fitContent();
  }

  function kv(rows) {
    return `<div class="kv">${rows.filter(Boolean).map(([k, v, c]) => `<div><span class="k">${k}</span><span class="v ${c || ''}">${v}</span></div>`).join('')}</div>`;
  }

  function compareBars(rows) {
    const maxAbs = Math.max(1e-9, ...rows.map((r) => Math.abs(r[1])));
    return `<div class="compare">${rows.map(([k, v]) =>
      `<div class="cmp-row"><span>${k}</span><div class="cmp-track"><i class="${cls(v)}" style="width:${(Math.abs(v) / maxAbs) * 100}%"></i></div><span class="v ${cls(v)}">${money(v)}</span></div>`).join('')}</div>`;
  }

  function renderDrawer() {
    const t = byId(openId);
    if (!t) { closeTrade(); return; }
    const all = sorted();
    const chronoIdx = all.findIndex((x) => x.id === t.id);
    const p = pnlOf(t), g = grossOf(t), r = rOf(t), risk = riskOf(t), mv = moveOf(t);
    const size = t.entry * t.qty;
    const equityBefore = all.slice(0, chronoIdx).reduce((a, x) => a + pnlOf(x), 0);
    const rankList = [...all].sort((a, b) => pnlOf(b) - pnlOf(a));
    const rank = rankList.findIndex((x) => x.id === t.id) + 1;
    const total = computeStats(all);
    const sameSetup = t.setup ? all.filter((x) => x.setup === t.setup) : [];
    const sameTicker = all.filter((x) => x.ticker === t.ticker);
    const sameDay = all.filter((x) => x.date === t.date);
    const setupSt = sameSetup.length ? computeStats(sameSetup) : null;
    const tickerSt = computeStats(sameTicker);
    const plannedRR = t.target != null && t.stop != null && t.stop !== t.entry ? Math.abs(t.target - t.entry) / Math.abs(t.entry - t.stop) : null;
    const targetHit = t.target != null ? (dirOf(t) * (t.exit - t.target) >= 0) : null;
    const stopHit = t.stop != null ? (dirOf(t) * (t.exit - t.stop) <= 0) : null;
    const pos = navList.indexOf(t.id);

    $('#dPos').textContent = pos >= 0 ? `${pos + 1} / ${navList.length}` : '';
    $('#dPrev').disabled = pos <= 0;
    $('#dNext').disabled = pos < 0 || pos >= navList.length - 1;

    let outcome = 'Закрита вручну';
    if (stopHit) outcome = 'Вибило по стопу';
    else if (targetHit) outcome = 'Дійшла до цілі';
    else if (p > 0) outcome = 'Закрита в плюс до цілі';
    else if (p < 0) outcome = 'Закрита в мінус до стопу';

    const similar = sameSetup.filter((x) => x.id !== t.id).slice(-5).reverse();

    $('#drawerBody').innerHTML = `
      <div class="d-head">
        <div>
          <div class="d-ticker">${esc(t.ticker)}</div>
          <div class="d-meta">
            <span class="side ${t.side}">${t.side === 'short' ? 'Short' : 'Long'}</span>
            <span>${longDate(t.date)}${t.entryTime ? `, ${esc(t.entryTime)}` : ''}${t.exitTime || t.exitDate ? ` → ${t.exitDate && t.exitDate !== t.date ? esc(t.exitDate) + ' ' : ''}${esc(t.exitTime || '')}` : ''}</span>
            ${t.setup ? `<span class="tag">${esc(t.setup)}</span>` : ''}
            <span class="tag">${esc(t.emotion)}</span>
          </div>
        </div>
        ${t.grade ? `<div class="d-grade" title="Оцінка виконання">${esc(t.grade)}</div>` : ''}
      </div>

      <div class="d-result">
        <div><div class="label">Чистий результат</div><div class="big ${cls(p)}">${money(p)}</div></div>
        <div><div class="label">У ризиках</div><div class="mid ${cls(r || 0)}">${fmtR(r)}</div></div>
        <div><div class="label">Рух ціни</div><div class="mid ${cls(mv)}">${pct(mv)}</div></div>
      </div>
      <div class="muted">${outcome}${rank ? ` · ${rank}-а з ${all.length} за результатом` : ''}</div>

      <div class="d-section">
        <h4>Графік <span>стоп і тейк — лінії на сітці</span></h4>
        <div class="price-chart" id="priceChart"></div>
        <div class="chart-legend">
          <span><i class="lg lg-entry"></i>Вхід</span>
          <span><i class="lg lg-exit"></i>Вихід</span>
          <span><i class="lg lg-stop"></i>Стоп</span>
          <span><i class="lg lg-target"></i>Тейк</span>
        </div>
        <p class="muted chart-note" id="chartNote"></p>
      </div>

      <div class="d-section ladder">
        <h4>Карта ціни <span>стоп → вхід → вихід → ціль</span></h4>
        ${ladderSVG(t)}
      </div>

      <div class="d-section">
        <h4>Цифри</h4>
        ${kv([
          ['Ціна входу', price(t.entry)],
          ['Ціна виходу', price(t.exit)],
          ['Стоп-лос', price(t.stop)],
          ['Ціль', price(t.target)],
          ['Кількість', price(t.qty)],
          ['Обсяг позиції', money(size, false)],
          ['Рух на одиницю', (dirOf(t) * (t.exit - t.entry) >= 0 ? '+' : '−') + price(Math.abs(t.exit - t.entry))],
          ['Валовий PnL', money(g), cls(g)],
          ['Комісії', money(-(t.fees || 0)), t.fees ? 'neg' : ''],
          ['Чистий PnL', money(p), cls(p)],
          ['Дохідність на обсяг', pct(p / size), cls(p)],
          ['Комісії від валового', g ? (Math.abs((t.fees || 0) / g) * 100).toFixed(1) + '%' : '—'],
          ['Ризик до стопу', risk ? money(risk, false) : '—', risk ? 'neg' : ''],
          ['Плановий R:R', plannedRR ? '1 : ' + plannedRR.toFixed(2) : '—'],
          ['Фактичний R', fmtR(r), cls(r || 0)],
          ['Реалізація цілі', plannedRR && r > 0 ? ((r / plannedRR) * 100).toFixed(0) + '%' : '—'],
        ])}
      </div>

      <div class="d-section">
        <h4>Місце в журналі</h4>
        ${kv([
          ['Угода №', `${chronoIdx + 1} з ${all.length}`],
          ['Капітал до', money(equityBefore)],
          ['Капітал після', money(equityBefore + p), cls(equityBefore + p)],
          ['Частка в загальному', total.net ? ((p / total.net) * 100).toFixed(1) + '%' : '—'],
          ['Угод цього дня', String(sameDay.length)],
          ['Результат дня', money(sameDay.reduce((a, x) => a + pnlOf(x), 0)), cls(sameDay.reduce((a, x) => a + pnlOf(x), 0))],
        ])}
      </div>

      <div class="d-section">
        <h4>Порівняння <span>чистий PnL</span></h4>
        ${compareBars([
          ['Ця угода', p],
          ['Середній виграш', total.avgW],
          ['Середній програш', -total.avgL],
          setupSt ? [`Сер. «${esc(t.setup)}»`, setupSt.expectancy] : null,
          [`Сер. ${esc(t.ticker)}`, tickerSt.expectancy],
        ].filter(Boolean))}
      </div>

      ${setupSt ? `<div class="d-section">
        <h4>Сетап «${esc(t.setup)}» <span>${setupSt.n} угод</span></h4>
        ${kv([
          ['Відсоток виграшних', (setupSt.winRate * 100).toFixed(0) + '%'],
          ['Сумарно', money(setupSt.net), cls(setupSt.net)],
          ['Profit factor', setupSt.pf === Infinity ? '∞' : setupSt.pf.toFixed(2), setupSt.pf >= 1 ? 'pos' : 'neg'],
          ['Середній R', fmtR(setupSt.avgR), cls(setupSt.avgR || 0)],
        ])}
      </div>` : ''}

      ${t.notes ? `<div class="d-section"><h4>Нотатки</h4><div class="d-notes">${esc(t.notes)}</div></div>` : ''}

      ${similar.length ? `<div class="d-section">
        <h4>Інші угоди цього сетапу</h4>
        <table class="trades"><tbody>
          ${similar.map((x) => `<tr class="trade" data-open="${x.id}">
            <td class="mono">${esc(x.date)}</td><td class="tk">${esc(x.ticker)}</td>
            <td><span class="side ${x.side}">${x.side === 'short' ? 'Short' : 'Long'}</span></td>
            <td class="num ${cls(pnlOf(x))}">${money(pnlOf(x))}</td><td class="num ${cls(rOf(x) || 0)}">${fmtR(rOf(x))}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
    `;
    $('#drawerBody').scrollTop = 0;
    renderPriceChart(t);
    $$('#drawerBody [data-open]').forEach((row) => row.addEventListener('click', () => openTrade(row.dataset.open, sameSetup.map((x) => x.id).reverse())));
  }

  // ---------- insights ----------
  function groupBy(fn) {
    const g = {};
    for (const t of trades) {
      const k = fn(t) || '—';
      g[k] ??= { pnl: 0, n: 0, w: 0 };
      g[k].pnl += pnlOf(t); g[k].n++; if (pnlOf(t) > 0) g[k].w++;
    }
    return g;
  }
  function bars(el, groups, order) {
    const entries = order ? order.filter((k) => groups[k]).map((k) => [k, groups[k]]) : Object.entries(groups).sort((a, b) => b[1].pnl - a[1].pnl);
    if (!entries.length) { $(el).innerHTML = '<p class="muted">Немає даних</p>'; return; }
    const maxAbs = Math.max(1, ...entries.map(([, v]) => Math.abs(v.pnl)));
    $(el).innerHTML = entries.slice(0, 10).map(([k, v]) => {
      const w = (Math.abs(v.pnl) / maxAbs) * 50;
      const pos = v.pnl >= 0;
      return `<div class="bar-row">
        <div><div class="name">${esc(k)}</div><div class="meta">${v.n} уг. · ${Math.round((v.w / v.n) * 100)}%</div></div>
        <div class="bar-track"><div class="bar-fill" style="${pos ? 'left:50%' : 'right:50%'};width:${w}%;background:${pos ? 'var(--green)' : 'var(--red)'}"></div></div>
        <div class="val ${cls(v.pnl)}">${money(v.pnl)}</div>
      </div>`;
    }).join('');
  }
  function renderInsights() {
    const setup = groupBy((t) => t.setup);
    const emo = groupBy((t) => t.emotion);
    const wd = groupBy((t) => WEEKDAYS[weekdayIdx(t.date)]);
    const tick = groupBy((t) => t.ticker);
    bars('#bySetup', setup);
    bars('#byEmotion', emo);
    bars('#byWeekday', wd, WEEKDAYS);
    bars('#byTicker', tick);

    const v = [];
    if (trades.length < 5) {
      v.push(['', 'Замало даних', 'Потрібно хоча б 5 угод', 'Після цього тут з’являться висновки про твою торгівлю.']);
    } else {
      const best = (g) => Object.entries(g).filter(([, x]) => x.n >= 2).sort((a, b) => b[1].pnl - a[1].pnl);
      const s = best(setup), e = best(emo), d = best(wd);
      if (s.length) v.push(['good', 'Найкращий сетап', s[0][0], `${money(s[0][1].pnl)} за ${s[0][1].n} угод. Варто робити більше такого.`]);
      if (s.length > 1 && s[s.length - 1][1].pnl < 0) v.push(['bad', 'Сетап у мінусі', s[s.length - 1][0], `${money(s[s.length - 1][1].pnl)} сумарно. Можливо, його варто прибрати.`]);
      if (e.length && e[e.length - 1][1].pnl < 0) v.push(['bad', 'Найдорожчий стан', e[e.length - 1][0], `Угоди в цьому стані дали ${money(e[e.length - 1][1].pnl)}. Помітив його — зроби паузу.`]);
      if (d.length) v.push(['good', 'Найкращий день', d[0][0], `${money(d[0][1].pnl)}.${d.length > 1 && d[d.length - 1][1].pnl < 0 ? ` Найгірший — ${d[d.length - 1][0]} (${money(d[d.length - 1][1].pnl)}).` : ''}`]);
      const st = computeStats(sorted());
      if (st.avgL && st.avgW / st.avgL < 1 && st.winRate < 0.6) v.push(['bad', 'Звернути увагу', 'Ріжеш прибуток', `Середній виграш (${money(st.avgW, false)}) менший за середній програш (${money(st.avgL, false)}).`]);
      if (st.worstStreak >= 4) v.push(['', 'Дисципліна', 'Довгі серії мінусів', `Найдовша — ${st.worstStreak} поспіль. Постав ліміт: після 3 мінусів закінчуй день.`]);
    }
    $('#verdicts').innerHTML = v.map(([c, k, t, d]) => `<div class="verdict ${c}"><div class="kicker">${esc(k)}</div><b>${esc(t)}</b>${esc(d)}</div>`).join('');
  }

  // ---------- calculator ----------
  function renderCalc() {
    const bal = +$('#cBalance').value, risk = +$('#cRisk').value, entry = +$('#cEntry').value, stop = +$('#cStop').value, target = num($('#cTarget').value);
    const riskUsd = (bal * risk) / 100;
    const perUnit = Math.abs(entry - stop);
    const out = [];
    if (!perUnit || !entry) {
      out.push(['Помилка', 'Вхід і стоп мають відрізнятися', 'neg']);
    } else {
      const qty = riskUsd / perUnit;
      const size = qty * entry;
      out.push(['Ризик', money(riskUsd, false), 'neg']);
      out.push(['Кількість', qty.toLocaleString('en-US', { maximumFractionDigits: 4 }), '']);
      out.push(['Обсяг позиції', money(size, false), '']);
      out.push(['Плече від депозиту', (size / bal).toFixed(2) + '×', size > bal ? 'neg' : '']);
      out.push(['Напрям', stop < entry ? 'Long' : 'Short', '']);
      if (target != null && target !== entry) {
        const rr = Math.abs(target - entry) / perUnit;
        out.push(['Профіт на цілі', money(Math.abs(target - entry) * qty), 'pos']);
        out.push(['R:R', '1 : ' + rr.toFixed(2), rr >= 2 ? 'pos' : rr < 1 ? 'neg' : '']);
        out.push(['Мін. відсоток виграшних', ((1 / (1 + rr)) * 100).toFixed(1) + '%', '']);
        out.push(['', '', '']);
      }
    }
    $('#calcOut').innerHTML = `<div class="stats">${statCells(out)}</div>`;
  }

  // ---------- tooltip ----------
  const tip = $('#tooltip');
  function showTip(e, html) {
    tip.innerHTML = html; tip.style.opacity = 1;
    const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = x + 'px'; tip.style.top = e.clientY + 14 + 'px';
  }
  function hideTip() { tip.style.opacity = 0; }

  // ---------- add/edit dialog ----------
  const dlg = $('#tradeDialog');
  const form = $('#tradeForm');
  function openDialog(t) {
    editingId = t?.id || null;
    $('#dialogTitle').textContent = t ? 'Редагувати угоду' : 'Нова угода';
    form.reset();
    const data = t || { date: isoDate(new Date()), side: 'long', fees: 0, emotion: 'Спокій' };
    for (const [k, val] of Object.entries(data)) if (form.elements[k]) form.elements[k].value = val ?? '';
    $('#setupList').innerHTML = [...new Set(trades.map((x) => x.setup).filter(Boolean))].map((s) => `<option value="${esc(s)}">`).join('');
    updatePreview();
    dlg.showModal();
  }
  function readForm() {
    const f = form.elements;
    return {
      date: f.date.value, entryTime: f.entryTime.value, exitDate: f.exitDate.value, exitTime: f.exitTime.value,
      ticker: f.ticker.value.trim().toUpperCase(), side: f.side.value,
      qty: num(f.qty.value), entry: num(f.entry.value), exit: num(f.exit.value),
      stop: num(f.stop.value), target: num(f.target.value), fees: num(f.fees.value) || 0,
      setup: f.setup.value.trim(), emotion: f.emotion.value, grade: f.grade.value, notes: f.notes.value.trim(),
    };
  }
  function updatePreview() {
    const t = readForm();
    if (t.qty == null || t.entry == null || t.exit == null) { $('#pnlPreview').innerHTML = '<span class="muted">Заповни кількість, вхід і вихід — тут буде результат</span>'; return; }
    const p = pnlOf(t), r = rOf(t);
    $('#pnlPreview').innerHTML = `<b class="${cls(p)}">${money(p)}</b>${r != null ? `  ·  <span class="${cls(r)}">${fmtR(r)}</span>` : ''}  ·  ${pct(moveOf(t))}`;
  }
  form.addEventListener('input', updatePreview);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = readForm();
    if (editingId) {
      const i = trades.findIndex((x) => x.id === editingId);
      trades[i] = { ...trades[i], ...t };
    } else {
      trades.push({ ...t, id: uid(), created: Date.now() });
      calMonth = startOfMonth(new Date(t.date + 'T00:00'));
    }
    dlg.close();
    save();
  });
  $('#cancelBtn').addEventListener('click', () => dlg.close());

  // ---------- demo data ----------
  // Crypto trades are simulated on real Binance 1h candles (entry at a candle close,
  // exit where price actually touched stop/target), so the chart matches the trade.
  // Stock trades are synthetic and shown as a schematic.
  async function demo() {
    const btn = $('#demoBtn');
    btn.disabled = true; btn.textContent = 'Завантажую ціни…';
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const rand = (a, b) => a + Math.random() * (b - a);
    const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const goodSetups = ['Тренд-пулбек', 'Пробій', 'Відскок від рівня'];
    const badSetups = ['Контртренд', 'Новини'];
    const goodEmos = ['Спокій', 'Спокій', 'Впевненість'];
    const badEmos = ['FOMO', 'Реванш', 'Жадібність', 'Страх', 'Нудьга'];
    const winNotes = ['Чітко за планом.', 'Дочекався ретесту рівня, вхід без поспіху.', 'Взяв частину на першій цілі, решту довів до тейку.'];
    const lossNotes = ['Зайшов рано, не дочекався підтвердження.', 'Увійшов після серії мінусів — хотів відігратися.', 'Обсяг на пробої був слабкий, але все одно зайшов.', 'Стоп був занадто близько до рівня.'];
    const label = (win) => ({
      setup: Math.random() < (win ? 0.75 : 0.35) ? pick(goodSetups) : pick(badSetups),
      emotion: Math.random() < (win ? 0.75 : 0.3) ? pick(goodEmos) : pick(badEmos),
      grade: win ? pick(['A', 'A', 'B', 'B', 'C']) : pick(['B', 'C', 'C', 'D']),
      notes: Math.random() < 0.35 ? pick(win ? winNotes : lossNotes) : '',
    });
    const out = [];
    let n = 0;
    const push = (t) => out.push({ id: uid(), created: Date.now() + n++, ...t });

    // --- crypto on real candles ---
    const coins = [['BTCUSDT', 0.05], ['ETHUSDT', 1], ['SOLUSDT', 20]];
    let real = 0;
    try {
      const end = Date.now() - 3600e3;
      const start = end - 90 * 86400e3;
      const series = await Promise.all(coins.map(async ([sym]) => {
        let rows = [], from = start;
        while (from < end) {
          const part = await fetchKlines(sym, '1h', from, end);
          if (!part.length) break;
          rows = rows.concat(part);
          from = part[part.length - 1][0] + 3600e3;
        }
        return rows.map((r) => ({ t: r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4] }));
      }));
      await Promise.all(Array.from({ length: 48 }, async () => {
        const ci = Math.floor(Math.random() * coins.length);
        const [sym, qty] = coins[ci];
        const cs = series[ci];
        if (cs.length < 120) return;
        const i = Math.floor(rand(0, cs.length - 60));
        const side = Math.random() < 0.6 ? 'long' : 'short';
        const dir = side === 'long' ? 1 : -1;
        const entry = cs[i].c;
        const riskPct = rand(0.006, 0.02);
        const plan = rand(1.3, 3);
        const stop = entry * (1 - dir * riskPct);
        const target = entry * (1 + dir * riskPct * plan);
        const hit = (c) => ({ stop: dir > 0 ? c.l <= stop : c.h >= stop, target: dir > 0 ? c.h >= target : c.l <= target });
        let exit = null, exitAt = null;
        for (let j = i + 1; j < Math.min(cs.length, i + 48); j++) {
          const c = cs[j], h = hit(c);
          if (!h.stop && !h.target) continue;
          exit = h.stop ? stop : target; exitAt = c.t + 30 * 60e3;
          // pin the exact minute (and which level came first) using 1m candles
          try {
            const mins = await fetchKlines(sym, '1m', c.t, c.t + 3600e3 - 1);
            for (const m of mins) {
              const mh = hit({ l: +m[3], h: +m[2] });
              if (mh.stop || mh.target) { exit = mh.stop ? stop : target; exitAt = m[0] + 30e3; break; }
            }
          } catch { /* keep the hourly approximation */ }
          break;
        }
        if (exit == null) { const j = Math.min(cs.length - 1, i + 47); exit = cs[j].c; exitAt = cs[j].t + 3600e3 - 60e3; }
        const dp = entry < 100 ? 3 : 2;
        const t = { ticker: sym, side, qty, entry: +entry.toFixed(dp), exit: +exit.toFixed(dp), stop: +stop.toFixed(dp), target: +target.toFixed(dp) };
        const win = (t.exit - t.entry) * dir > 0;
        const ein = new Date(cs[i].t + 3600e3), eout = new Date(exitAt);
        push({ ...t, date: isoDate(ein), entryTime: hhmm(ein), exitDate: isoDate(eout), exitTime: hhmm(eout),
          fees: +(entry * qty * 0.0008).toFixed(2), ...label(win) });
        real++;
      }));
    } catch { /* offline or blocked — fall back to synthetic crypto below */ }

    // --- synthetic stocks (and crypto if Binance was unreachable) ---
    const synth = [['AAPL', 190, 15], ['TSLA', 240, 10], ['NVDA', 120, 25]];
    if (!real) synth.push(['BTCUSDT', 65000, 0.05], ['ETHUSDT', 3200, 1]);
    const now = new Date();
    for (let k = 0; k < (real ? 22 : 70); k++) {
      const d = new Date(now); d.setDate(now.getDate() - 1 - Math.floor(Math.random() * 90));
      if (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - (d.getDay() === 0 ? 2 : 1));
      const [tk, px, qty] = pick(synth);
      const side = Math.random() < 0.65 ? 'long' : 'short';
      const dir = side === 'long' ? 1 : -1;
      const entry = +(px * rand(0.9, 1.1)).toFixed(2);
      const riskPct = rand(0.01, 0.03);
      const plan = rand(1.3, 3);
      const stop = +(entry * (1 - dir * riskPct)).toFixed(2);
      const target = +(entry * (1 + dir * riskPct * plan)).toFixed(2);
      const win = Math.random() < 0.5;
      const move = win ? (Math.random() < 0.4 ? riskPct * plan : riskPct * plan * rand(0.3, 0.9)) : (Math.random() < 0.6 ? -riskPct : -riskPct * rand(0.3, 0.9));
      const exit = +(entry * (1 + dir * move)).toFixed(2);
      const h = Math.floor(rand(16, 21)), mi = Math.floor(rand(0, 60));
      const dur = Math.floor(rand(20, 300));
      const outT = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, mi + dur);
      push({ date: isoDate(d), entryTime: `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`,
        exitDate: isoDate(outT), exitTime: hhmm(outT), ticker: tk, side, qty, entry, exit, stop, target,
        fees: +(entry * qty * 0.0008).toFixed(2), ...label(win) });
    }

    trades = out;
    calMonth = startOfMonth(new Date());
    btn.disabled = false; btn.textContent = 'Відкрити демо';
    save();
  }

  // ---------- events ----------
  $$('.tab').forEach((b) => b.addEventListener('click', () => {
    $$('.tab').forEach((x) => x.classList.toggle('active', x === b));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + b.dataset.view));
    history.replaceState(null, '', '#' + b.dataset.view);
    if (b.dataset.view === 'dashboard') renderEquity();
  }));
  const initial = location.hash.slice(1);
  if (initial) $(`.tab[data-view="${initial}"]`)?.click();

  $('#addBtn').addEventListener('click', () => openDialog());
  $('#emptyAdd').addEventListener('click', () => openDialog());
  $('#demoBtn').addEventListener('click', demo);
  $('#calPrev').addEventListener('click', () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderCalendar(); });
  $('#calNext').addEventListener('click', () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderCalendar(); });
  $('#search').addEventListener('input', renderTable);
  $('#tradeRows').addEventListener('click', (e) => {
    const row = e.target.closest('tr.trade');
    if (row) openTrade(row.dataset.id, filteredTrades().map((t) => t.id));
  });

  $('#dClose').addEventListener('click', closeTrade);
  $('#drawerBackdrop').addEventListener('click', closeTrade);
  $('#dPrev').addEventListener('click', () => stepTrade(-1));
  $('#dNext').addEventListener('click', () => stepTrade(1));
  $('#dEdit').addEventListener('click', () => openDialog(byId(openId)));
  $('#dDelete').addEventListener('click', () => {
    if (!openId || !confirm('Видалити цю угоду?')) return;
    const i = navList.indexOf(openId);
    trades = trades.filter((t) => t.id !== openId);
    navList = navList.filter((id) => id !== openId);
    const next = navList[Math.min(i, navList.length - 1)];
    save();
    if (next) openTrade(next); else closeTrade();
  });
  document.addEventListener('keydown', (e) => {
    if (!openId || dlg.open) return;
    if (e.key === 'Escape') closeTrade();
    else if (e.key === 'ArrowLeft') stepTrade(-1);
    else if (e.key === 'ArrowRight') stepTrade(1);
  });

  $('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(trades, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `tradelog-${isoDate(new Date())}.json`; a.click();
    URL.revokeObjectURL(a.href);
  });
  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data)) throw new Error();
      trades = data.filter((t) => t && t.date && t.ticker).map((t) => ({ ...t, id: t.id || uid(), created: t.created || Date.now() }));
      save();
      alert(`Імпортовано ${trades.length} угод`);
    } catch { alert('Не вдалося прочитати файл'); }
    e.target.value = '';
  });
  $('#clearBtn').addEventListener('click', () => {
    if (trades.length && confirm('Видалити ВСІ угоди? Спершу краще зробити експорт.')) { trades = []; closeTrade(); save(); }
  });
  ['#cBalance', '#cRisk', '#cEntry', '#cStop', '#cTarget'].forEach((s) => $(s).addEventListener('input', renderCalc));
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(renderEquity, 120); });

  // ---------- render ----------
  function render() {
    $('#emptyHint').style.display = trades.length ? 'none' : '';
    renderStats();
    renderEquity();
    renderCalendar();
    renderTable();
    renderInsights();
    if (openId) renderDrawer();
  }
  render();
  renderCalc();
})();
