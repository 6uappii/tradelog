(() => {
  const KEY = 'tradelog.v1';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  let trades = load();
  let editingId = null;
  let calMonth = startOfMonth(new Date());

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
    const s = Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: Math.abs(n) < 1000 ? 2 : 0 });
    return (n < 0 ? '-$' : sign && n > 0 ? '+$' : '$') + s;
  };
  const cls = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
  const num = (v) => (v === '' || v == null ? null : Number(v));
  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function isoDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  const uid = () => Math.random().toString(36).slice(2, 10);
  const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
  const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];

  function pnlOf(t) {
    const dir = t.side === 'short' ? -1 : 1;
    return (t.exit - t.entry) * t.qty * dir - (t.fees || 0);
  }
  function rOf(t) {
    if (t.stop == null || t.stop === t.entry) return null;
    const risk = Math.abs(t.entry - t.stop) * t.qty;
    return risk ? pnlOf(t) / risk : null;
  }
  const sorted = () => [...trades].sort((a, b) => a.date.localeCompare(b.date) || a.created - b.created);

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
    let streak = 0, best = 0, worst = 0, cur = 0;
    for (const p of pnls) {
      if (p > 0) cur = cur > 0 ? cur + 1 : 1; else if (p < 0) cur = cur < 0 ? cur - 1 : -1; else cur = 0;
      best = Math.max(best, cur); worst = Math.min(worst, cur);
    }
    streak = cur;
    const rs = list.map(rOf).filter((r) => r != null);
    return {
      n: list.length, net, wins: wins.length, losses: losses.length,
      winRate: list.length ? wins.length / list.length : 0,
      avgW: wins.length ? grossW / wins.length : 0,
      avgL: losses.length ? grossL / losses.length : 0,
      pf: grossL ? grossW / grossL : grossW ? Infinity : 0,
      expectancy: list.length ? net / list.length : 0,
      maxDD, streak, bestStreak: best, worstStreak: -worst,
      avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
      best: pnls.length ? Math.max(...pnls) : 0,
      worst: pnls.length ? Math.min(...pnls) : 0,
    };
  }

  function renderStats() {
    const s = computeStats(sorted());
    const pf = s.pf === Infinity ? '∞' : s.pf.toFixed(2);
    const streakTxt = s.streak > 0 ? `🔥 ${s.streak} прибуткових поспіль` : s.streak < 0 ? `🧊 ${-s.streak} збиткових поспіль` : '—';
    const items = [
      ['Чистий PnL', money(s.net), cls(s.net), `${s.n} угод`],
      ['Win rate', (s.winRate * 100).toFixed(1) + '%', s.winRate >= 0.5 ? 'pos' : 'neg', `${s.wins} W / ${s.losses} L`],
      ['Profit factor', pf, s.pf >= 1 ? 'pos' : 'neg', 'прибуток / збиток'],
      ['Очікування', money(s.expectancy), cls(s.expectancy), 'на одну угоду'],
      ['Сер. виграш / програш', `${money(s.avgW, false)} / ${money(s.avgL, false)}`, '', s.avgL ? `співвідношення ${(s.avgW / s.avgL).toFixed(2)}` : ''],
      ['Сер. R', s.avgR == null ? '—' : s.avgR.toFixed(2) + 'R', cls(s.avgR || 0), 'для угод зі стопом'],
      ['Макс. просадка', money(-s.maxDD), s.maxDD ? 'neg' : '', 'від піку капіталу'],
      ['Серія', streakTxt, '', `рекорд: +${s.bestStreak} / −${s.worstStreak}`],
    ];
    $('#stats').innerHTML = items.map(([l, v, c, sub]) =>
      `<div class="stat"><div class="label">${l}</div><div class="value ${c}">${v}</div><div class="sub">${sub}</div></div>`).join('');
    $('#ddLabel').textContent = s.n ? `найкраща ${money(s.best)} · найгірша ${money(s.worst)}` : '';
  }

  // ---------- equity curve ----------
  function renderEquity() {
    const el = $('#equity');
    const list = sorted();
    if (!list.length) { el.innerHTML = '<p class="muted">Тут з’явиться крива капіталу.</p>'; return; }
    const W = 600, H = 260, P = { l: 56, r: 12, t: 12, b: 24 };
    const pts = [0];
    list.forEach((t) => pts.push(pts[pts.length - 1] + pnlOf(t)));
    const min = Math.min(0, ...pts), max = Math.max(0, ...pts);
    const span = max - min || 1;
    const x = (i) => P.l + (i / (pts.length - 1 || 1)) * (W - P.l - P.r);
    const y = (v) => P.t + (1 - (v - min) / span) * (H - P.t - P.b);
    const line = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const area = `${line}L${x(pts.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
    const last = pts[pts.length - 1];
    const color = last >= 0 ? 'var(--green)' : 'var(--red)';
    const ticks = [min, (min + max) / 2, max];
    el.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="eqg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity=".35"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${ticks.map((v) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)" stroke-dasharray="3 4"/>
          <text x="${P.l - 6}" y="${y(v) + 4}" fill="var(--muted)" font-size="11" text-anchor="end">${money(v, false)}</text>`).join('')}
        <line x1="${P.l}" x2="${W - P.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--muted)" stroke-opacity=".5"/>
        <path d="${area}" fill="url(#eqg)"/>
        <path d="${line}" fill="none" stroke="${color}" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
        <line id="eqCursor" x1="0" x2="0" y1="${P.t}" y2="${H - P.b}" stroke="var(--muted)" stroke-opacity="0"/>
        <rect x="${P.l}" y="0" width="${W - P.l - P.r}" height="${H}" fill="transparent" id="eqHit"/>
      </svg>`;
    const svg = el.querySelector('svg');
    const hit = el.querySelector('#eqHit');
    const cursor = el.querySelector('#eqCursor');
    hit.addEventListener('mousemove', (e) => {
      const r = svg.getBoundingClientRect();
      const vx = ((e.clientX - r.left) / r.width) * W;
      const i = Math.max(1, Math.min(pts.length - 1, Math.round(((vx - P.l) / (W - P.l - P.r)) * (pts.length - 1))));
      const t = list[i - 1];
      cursor.setAttribute('x1', x(i)); cursor.setAttribute('x2', x(i)); cursor.setAttribute('stroke-opacity', '1');
      showTip(e, `#${i} · ${esc(t.date)} · ${esc(t.ticker)}<br><span class="${cls(pnlOf(t))}">${money(pnlOf(t))}</span> → капітал <b>${money(pts[i])}</b>`);
    });
    hit.addEventListener('mouseleave', () => { cursor.setAttribute('stroke-opacity', '0'); hideTip(); });
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
    $('#calTitle').textContent = `${MONTHS[m]} ${y}`;
    const first = new Date(y, m, 1);
    const offset = (first.getDay() + 6) % 7; // Monday-first
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
          const a = 0.15 + 0.65 * Math.min(1, Math.abs(info.pnl) / maxAbs);
          style = `background: ${info.pnl >= 0 ? `rgba(34,197,94,${a})` : `rgba(239,68,68,${a})`}`;
          if (inMonth) { weekPnl += info.pnl; weekN += info.n; monthTotal += info.pnl; }
        }
        html += `<div class="cal-d ${inMonth ? '' : 'out'} ${iso === today ? 'today' : ''}" style="${style}" data-day="${iso}">
          <span class="n">${day.getDate()}</span>
          ${info ? `<span class="p">${money(info.pnl)}</span>` : ''}
        </div>`;
      }
      html += `<div class="cal-w">${weekN ? `<span class="p ${cls(weekPnl)}">${money(weekPnl)}</span><span class="muted">${weekN} уг.</span>` : '<span class="muted">—</span>'}</div>`;
    }
    $('#calendar').innerHTML = html;
    $('#calTitle').innerHTML = `${MONTHS[m]} ${y} <span class="${cls(monthTotal)}">${monthTotal ? money(monthTotal) : ''}</span>`;
    $$('#calendar .cal-d').forEach((c) => {
      const info = byDay[c.dataset.day];
      if (!info) return;
      c.addEventListener('mousemove', (e) => {
        const list = trades.filter((t) => t.date === c.dataset.day);
        showTip(e, `<b>${c.dataset.day}</b><br>` + list.map((t) => `${esc(t.ticker)} <span class="${cls(pnlOf(t))}">${money(pnlOf(t))}</span>`).join('<br>'));
      });
      c.addEventListener('mouseleave', hideTip);
    });
  }

  // ---------- trades table ----------
  function renderTable() {
    const q = $('#search').value.trim().toLowerCase();
    const list = sorted().reverse().filter((t) =>
      !q || [t.ticker, t.setup, t.notes, t.emotion, t.side].some((f) => String(f || '').toLowerCase().includes(q)));
    if (!list.length) {
      $('#tradeRows').innerHTML = `<tr><td colspan="11" class="muted" style="text-align:center;padding:30px">${trades.length ? 'Нічого не знайдено' : 'Угод поки немає'}</td></tr>`;
      return;
    }
    $('#tradeRows').innerHTML = list.map((t) => {
      const p = pnlOf(t), r = rOf(t);
      return `<tr>
        <td>${esc(t.date)}</td>
        <td><b>${esc(t.ticker)}</b></td>
        <td><span class="tag ${t.side}">${t.side === 'short' ? 'Short' : 'Long'}</span></td>
        <td>${t.entry}</td><td>${t.exit}</td><td>${t.qty}</td>
        <td class="${cls(p)}"><b>${money(p)}</b></td>
        <td class="${cls(r || 0)}">${r == null ? '—' : r.toFixed(2) + 'R'}</td>
        <td>${t.setup ? `<span class="tag">${esc(t.setup)}</span>` : ''}</td>
        <td>${esc(t.emotion)}</td>
        <td><button class="act" data-edit="${t.id}" title="Редагувати">✎</button><button class="act" data-del="${t.id}" title="Видалити">🗑</button></td>
      </tr>${t.notes ? `<tr class="note-row"><td></td><td colspan="10">💬 ${esc(t.notes)}</td></tr>` : ''}`;
    }).join('');
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
        <div><div class="name">${esc(k)}</div><div class="meta">${v.n} уг. · ${Math.round((v.w / v.n) * 100)}% WR</div></div>
        <div class="bar-track"><div class="bar-fill" style="${pos ? 'left:50%' : `right:50%`};width:${w}%;background:${pos ? 'var(--green)' : 'var(--red)'}"></div></div>
        <div class="val ${cls(v.pnl)}">${money(v.pnl)}</div>
      </div>`;
    }).join('');
  }
  function renderInsights() {
    const setup = groupBy((t) => t.setup);
    const emo = groupBy((t) => t.emotion);
    const wd = groupBy((t) => WEEKDAYS[(new Date(t.date + 'T00:00').getDay() + 6) % 7]);
    const tick = groupBy((t) => t.ticker);
    bars('#bySetup', setup);
    bars('#byEmotion', emo);
    bars('#byWeekday', wd, WEEKDAYS);
    bars('#byTicker', tick);

    const v = [];
    if (trades.length < 5) {
      v.push(['', 'Мало даних', 'Додай хоча б 5 угод, і тут з’являться персональні висновки про твою торгівлю.']);
    } else {
      const best = (g) => Object.entries(g).filter(([, x]) => x.n >= 2).sort((a, b) => b[1].pnl - a[1].pnl);
      const s = best(setup), e = best(emo), d = best(wd);
      if (s.length) v.push(['good', `🏆 Найкращий сетап: ${s[0][0]}`, `${money(s[0][1].pnl)} за ${s[0][1].n} угод. Роби більше такого.`]);
      if (s.length > 1 && s[s.length - 1][1].pnl < 0) v.push(['bad', `🚫 Сетап, що зливає: ${s[s.length - 1][0]}`, `${money(s[s.length - 1][1].pnl)}. Може, варто його прибрати?`]);
      if (e.length && e[e.length - 1][1].pnl < 0) v.push(['bad', `🧠 Найдорожча емоція: ${e[e.length - 1][0]}`, `Угоди в цьому стані принесли ${money(e[e.length - 1][1].pnl)}. Помітив її — зроби паузу.`]);
      if (d.length) v.push(['good', `📅 Найкращий день: ${d[0][0]}`, `${money(d[0][1].pnl)}. ${d.length > 1 && d[d.length - 1][1].pnl < 0 ? `А в ${d[d.length - 1][0]} краще відпочити (${money(d[d.length - 1][1].pnl)}).` : ''}`]);
      const st = computeStats(sorted());
      if (st.avgL && st.avgW / st.avgL < 1 && st.winRate < 0.6) v.push(['bad', '✂️ Ріжеш прибуток', `Середній виграш (${money(st.avgW, false)}) менший за середній програш (${money(st.avgL, false)}). Дай прибутковим угодам рости.`]);
      if (st.worstStreak >= 4) v.push(['', '🧊 Обережно з серіями', `Найдовша збиткова серія — ${st.worstStreak}. Постав ліміт: після 3 мінусів поспіль закінчуй день.`]);
    }
    $('#verdicts').innerHTML = v.map(([c, t, d]) => `<div class="verdict ${c}"><b>${esc(t)}</b>${esc(d)}</div>`).join('');
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
      out.push(['Ризик, $', money(riskUsd, false), 'neg']);
      out.push(['Кількість', qty.toLocaleString('en-US', { maximumFractionDigits: 4 }), '']);
      out.push(['Розмір позиції', money(size, false), '']);
      out.push(['Плече (від депо)', (size / bal).toFixed(2) + 'x', size > bal ? 'neg' : '']);
      out.push(['Напрям', stop < entry ? 'Long' : 'Short', '']);
      if (target != null && target !== entry) {
        const rr = Math.abs(target - entry) / perUnit;
        out.push(['Профіт на тейку', money(Math.abs(target - entry) * qty), 'pos']);
        out.push(['R:R', '1 : ' + rr.toFixed(2), rr >= 2 ? 'pos' : rr < 1 ? 'neg' : '']);
        out.push(['Потрібний win rate', ((1 / (1 + rr)) * 100).toFixed(1) + '%', '']);
      }
    }
    $('#calcOut').innerHTML = out.map(([l, v, c]) => `<div class="stat"><div class="label">${l}</div><div class="value ${c}">${v}</div></div>`).join('');
  }

  // ---------- tooltip ----------
  const tip = $('#tooltip');
  function showTip(e, html) {
    tip.innerHTML = html; tip.style.opacity = 1;
    const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = x + 'px'; tip.style.top = e.clientY + 14 + 'px';
  }
  function hideTip() { tip.style.opacity = 0; }

  // ---------- dialog ----------
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
      date: f.date.value, ticker: f.ticker.value.trim().toUpperCase(), side: f.side.value,
      qty: num(f.qty.value), entry: num(f.entry.value), exit: num(f.exit.value),
      stop: num(f.stop.value), fees: num(f.fees.value) || 0,
      setup: f.setup.value.trim(), emotion: f.emotion.value, notes: f.notes.value.trim(),
    };
  }
  function updatePreview() {
    const t = readForm();
    if (t.qty == null || t.entry == null || t.exit == null) { $('#pnlPreview').innerHTML = '<span class="muted">Заповни кількість, вхід і вихід — побачиш PnL</span>'; return; }
    const p = pnlOf(t), r = rOf(t);
    $('#pnlPreview').innerHTML = `PnL: <b class="${cls(p)}">${money(p)}</b>${r != null ? ` · <b class="${cls(r)}">${r.toFixed(2)}R</b>` : ''} · ${((t.side === 'short' ? -1 : 1) * ((t.exit - t.entry) / t.entry) * 100).toFixed(2)}%`;
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
  function demo() {
    const tickers = [['BTCUSDT', 65000, 0.05], ['ETHUSDT', 3200, 1], ['SOLUSDT', 150, 20], ['AAPL', 190, 15], ['TSLA', 240, 10], ['NVDA', 120, 25]];
    const setups = [['Пробій', 0.58, 1.6], ['Відскок від рівня', 0.55, 1.3], ['Тренд-пулбек', 0.6, 1.8], ['Контртренд', 0.38, 1.0], ['Новини', 0.42, 1.2]];
    const emos = [['Спокій', 0.08], ['Впевненість', 0.05], ['FOMO', -0.2], ['Страх', -0.1], ['Жадібність', -0.12], ['Реванш', -0.25], ['Нудьга', -0.08]];
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const out = [];
    const now = new Date();
    for (let i = 0; i < 70; i++) {
      const d = new Date(now); d.setDate(now.getDate() - Math.floor(Math.random() * 90));
      if (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - (d.getDay() === 0 ? 2 : 1));
      const [tk, px, q] = pick(tickers);
      const [setup, wr, rr] = pick(setups);
      const [emo, bias] = Math.random() < 0.55 ? pick(emos.slice(0, 2)) : pick(emos);
      const side = Math.random() < 0.65 ? 'long' : 'short';
      const entry = +(px * (0.9 + Math.random() * 0.2)).toFixed(2);
      const riskPct = 0.01 + Math.random() * 0.02;
      const dir = side === 'long' ? 1 : -1;
      const stop = +(entry * (1 - dir * riskPct)).toFixed(2);
      const win = Math.random() < wr + bias;
      const move = win ? riskPct * rr * (0.5 + Math.random()) : -riskPct * (0.6 + Math.random() * 0.5);
      const exit = +(entry * (1 + dir * move)).toFixed(2);
      const notes = Math.random() < 0.25 ? pick(['Зайшов рано, не дочекався підтвердження', 'Чітко за планом 👌', 'Пересунув стоп — більше так не роблю', 'Взяв частину на першій цілі', 'Увійшов після серії мінусів']) : '';
      out.push({ id: uid(), created: Date.now() + i, date: isoDate(d), ticker: tk, side, qty: q, entry, exit, stop, fees: +(entry * q * 0.0008).toFixed(2), setup, emotion: emo, notes });
    }
    trades = out;
    calMonth = startOfMonth(new Date());
    save();
  }

  // ---------- events ----------
  $$('.tab').forEach((b) => b.addEventListener('click', () => {
    $$('.tab').forEach((x) => x.classList.toggle('active', x === b));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + b.dataset.view));
    location.hash = b.dataset.view;
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
    const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
    if (ed) openDialog(trades.find((t) => t.id === ed.dataset.edit));
    if (del && confirm('Видалити угоду?')) { trades = trades.filter((t) => t.id !== del.dataset.del); save(); }
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
    if (trades.length && confirm('Видалити ВСІ угоди? Спершу краще зробити експорт.')) { trades = []; save(); }
  });
  ['#cBalance', '#cRisk', '#cEntry', '#cStop', '#cTarget'].forEach((s) => $(s).addEventListener('input', renderCalc));
  window.addEventListener('resize', () => renderEquity());

  // ---------- render ----------
  function render() {
    $('#emptyHint').style.display = trades.length ? 'none' : '';
    renderStats();
    renderEquity();
    renderCalendar();
    renderTable();
    renderInsights();
  }
  render();
  renderCalc();
})();
