/* ═══════════════════════════════════════
   UPG v10 — CALENDAR + CHARTS + SHARE
   Mood: defined in goals.js — NOT here (removed duplicate)
   Fixed: mood key bug (was d-1, now uses TZ.formatDateKey())
   Fixed: date creation uses TZ-aware date parts
   Fixed: _initialised resets when timezone changes
   Fixed: calendar renders habit-tracker data too (streak dots)
   Added: day tap shows daily summary sheet
   Fixed: Charts line handles null data gaps cleanly
   Fixed: Share card uses real badge + score data
═══════════════════════════════════════ */

/* ════════ CALENDAR ════════ */
const Calendar = (() => {
  let _year         = null;
  let _month        = null;
  let _tblId        = null;
  let _initialised  = false;
  let _lastTZ       = null; // reset if TZ changes

  const _init = () => {
    const currentTZ = TZ.getTZ();
    if (_initialised && _lastTZ === currentTZ) return;
    _initialised = true;
    _lastTZ      = currentTZ;
    const n = TZ.now();
    _year  = n.getFullYear();
    _month = n.getMonth();
  };

  const prev = () => { _init(); _month--; if (_month < 0) { _month = 11; _year--; } render(); };
  const next = () => { _init(); _month++; if (_month > 11) { _month = 0; _year++; } render(); };

  const renderTableSelector = () => {
    _init();
    const el = document.getElementById('cal-tbl-select');
    if (!el) return;
    el.innerHTML = '';

    const tt = State.tables.filter(t => t.type === 'timetable' && !t.archived);
    if (!tt.length) {
      el.innerHTML = '<div style="font-family:var(--font-m);font-size:8px;color:var(--tx3)">No timetables yet — create one from Home</div>';
      _tblId = null;
      return;
    }

    if (!_tblId || !tt.find(t => t.id === _tblId)) _tblId = tt[0].id;

    tt.forEach(t => {
      const b = document.createElement('div');
      b.className = 'wk-btn' + (t.id === _tblId ? ' active' : '');
      b.textContent = t.name;
      b.onclick = () => { _tblId = t.id; renderTableSelector(); render(); };
      el.appendChild(b);
    });
  };

  const render = () => {
    _init();

    // Month label
    const lbl = document.getElementById('cal-month-lbl');
    if (lbl) lbl.textContent = State.MONTH_FULL[_month].toUpperCase() + ' ' + _year;

    const grid = document.getElementById('cal-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // First day of month offset (Mon-based grid)
    const firstDay = new Date(_year, _month, 1);
    const lastDay  = new Date(_year, _month + 1, 0);
    const startDOW = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

    // Empty cells before day 1
    for (let i = 0; i < startDOW; i++) {
      const e = document.createElement('div');
      e.className = 'cal-cell cal-empty';
      grid.appendChild(e);
    }

    const tbl  = _tblId ? State.tables.find(t => t.id === _tblId) : null;
    const blks = tbl ? (State.blocks[tbl.id] || []) : [];

    for (let d = 1; d <= lastDay.getDate(); d++) {
      // Use explicit year/month/day constructor — avoids local-vs-UTC confusion
      const date    = new Date(_year, _month, d);
      const isToday = TZ.isToday(date);
      const isFut   = TZ.isFuture(date);

      const cell = document.createElement('div');
      cell.className = `cal-cell${isToday ? ' cal-today' : ''}${isFut ? ' cal-future' : ''}`;

      // ── Completion dot ──
      let dotHTML = '';
      if (tbl && blks.length && !isFut) {
        const cr   = TZ.dateInTZ(new Date(tbl.createdAt), TZ.getTZ());
        const cm   = TZ.midnight(cr);
        const diff = Math.floor((TZ.midnight(date) - cm) / 86400000);
        if (diff >= 0) {
          const wkIdx = Math.floor(diff / 7);
          const dyIdx = date.getDay() === 0 ? 6 : date.getDay() - 1;
          const st    = ((State.schedState[tbl.id] || {})[wkIdx] || {})[dyIdx] || [];
          const interacted = st.some(s => s !== 0);
          if (interacted) {
            const done  = st.filter(s => s === 1).length;
            const miss  = st.filter(s => s === 2).length;
            const total = blks.length;
            if (done === total && total > 0)
              dotHTML = '<div class="cal-dot-row"><div class="cal-dot done"></div></div>';
            else if (miss > 0 && done === 0)
              dotHTML = '<div class="cal-dot-row"><div class="cal-dot miss"></div></div>';
            else if (done > 0)
              dotHTML = '<div class="cal-dot-row"><div class="cal-dot part"></div></div>';
          }
        }
      }

      // ── Mood emoji ──
      // Fixed: use TZ.formatDateKey with a Date built from year/month(0-indexed)/day
      const moodDate = new Date(_year, _month, d);
      const moodKey  = 'mood_' + TZ.formatDateKey(moodDate);
      const moodVal  = State.data(moodKey, null);
      const moodEmoji = moodVal ? Mood.getMoodEmoji(moodVal) : '';

      cell.innerHTML = `<div class="cal-num">${d}</div>${dotHTML}${moodEmoji ? `<div class="cal-mood-emoji">${moodEmoji}</div>` : ''}`;

      // ── Day tap — show mini summary ──
      if (!isFut) {
        cell.onclick = () => _showDaySummary(date, tbl, blks);
      }

      grid.appendChild(cell);
    }
  };

  // Mini day summary panel on cell tap
  const _showDaySummary = (date, tbl, blks) => {
    if (!tbl || !blks.length) return;
    const cr   = TZ.dateInTZ(new Date(tbl.createdAt), TZ.getTZ());
    const cm   = TZ.midnight(cr);
    const diff = Math.floor((TZ.midnight(date) - cm) / 86400000);
    if (diff < 0) return;

    const wkIdx = Math.floor(diff / 7);
    const dyIdx = date.getDay() === 0 ? 6 : date.getDay() - 1;
    const st    = ((State.schedState[tbl.id] || {})[wkIdx] || {})[dyIdx] || [];

    const done = st.filter(s => s === 1).length;
    const miss = st.filter(s => s === 2).length;
    const pct  = blks.length ? Math.round(done / blks.length * 100) : 0;

    const moodKey = 'mood_' + TZ.formatDateKey(date);
    const mood    = State.data(moodKey, null);
    const moodEmoji = mood ? Mood.getMoodEmoji(mood) : '';

    const label = TZ.formatShortDate(date);
    let summary = `📅 ${label}\n✅ ${done}/${blks.length} done (${pct}%)`;
    if (miss)  summary += ` · ❌ ${miss} missed`;
    if (moodEmoji) summary += `\n${moodEmoji} Mood: ${mood}`;

    Toast.show(summary, 'default', 3000);
  };

  return { prev, next, render, renderTableSelector };
})();


/* ════════ CHARTS ════════ */
const Charts = (() => {
  const drawLine = (canvasId, data, color) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W   = canvas.offsetWidth || 300;
    const H   = 140;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const acc = color || '#00e676';
    const pad = { top: 16, right: 12, bottom: 28, left: 36 };
    const cW  = W - pad.left - pad.right;
    const cH  = H - pad.top  - pad.bottom;
    ctx.clearRect(0, 0, W, H);

    const validData = data.filter(d => d.value !== null && d.value !== undefined);
    if (!validData.length) {
      ctx.font = '10px monospace';
      ctx.fillStyle = '#3a4549';
      ctx.textAlign = 'center';
      ctx.fillText('No data yet — start tracking!', W / 2, H / 2);
      return;
    }

    const xStep = cW / Math.max(data.length - 1, 1);
    const yPos  = v => pad.top + cH - (v / 100) * cH;
    const xPos  = i => pad.left + i * xStep;

    // Grid lines
    ctx.strokeStyle = '#1f2328';
    ctx.lineWidth   = 1;
    [0, 25, 50, 75, 100].forEach(v => {
      const y = yPos(v);
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cW, y); ctx.stroke();
      ctx.font = '8px monospace'; ctx.fillStyle = '#3a4549'; ctx.textAlign = 'right';
      ctx.fillText(v + '%', pad.left - 4, y + 3);
    });

    // Build point list (nulls become gaps)
    const pts = data.map((d, i) => ({
      x: xPos(i),
      y: d.value !== null ? yPos(d.value) : null,
    }));

    // Gradient area fill (skip gaps)
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
    grad.addColorStop(0, acc + '40');
    grad.addColorStop(1, acc + '00');

    // Draw contiguous segments
    let segStart = null;
    const drawSegment = (end) => {
      if (segStart === null) return;
      ctx.beginPath();
      let first = true;
      for (let i = segStart; i <= end; i++) {
        if (pts[i].y === null) continue;
        if (first) { ctx.moveTo(pts[i].x, pts[i].y); first = false; }
        else ctx.lineTo(pts[i].x, pts[i].y);
      }
      // Close area
      ctx.lineTo(pts[end].x, pad.top + cH);
      ctx.lineTo(pts[segStart].x, pad.top + cH);
      ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();

      // Line
      ctx.beginPath();
      ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.lineJoin = 'round';
      first = true;
      for (let i = segStart; i <= end; i++) {
        if (pts[i].y === null) continue;
        if (first) { ctx.moveTo(pts[i].x, pts[i].y); first = false; }
        else ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
    };

    pts.forEach((p, i) => {
      if (p.y !== null) {
        if (segStart === null) segStart = i;
      } else {
        if (segStart !== null) { drawSegment(i - 1); segStart = null; }
      }
    });
    if (segStart !== null) drawSegment(pts.length - 1);

    // Dots + x-labels
    const step = Math.max(1, Math.floor(data.length / 6));
    data.forEach((d, i) => {
      if (d.value !== null) {
        ctx.beginPath();
        ctx.arc(xPos(i), yPos(d.value), 3, 0, Math.PI * 2);
        ctx.fillStyle = acc; ctx.fill();
      }
      if (i % step === 0 || i === data.length - 1) {
        ctx.font = '7px monospace'; ctx.fillStyle = '#3a4549'; ctx.textAlign = 'center';
        ctx.fillText(d.label, xPos(i), H - 6);
      }
    });
  };

  const renderProgressChart = tbl => {
    if (!tbl) return;
    const blks = State.blocks[tbl.id] || [];
    if (!blks.length) return;
    const { wk: tw } = TZ.getTodayWkDay(tbl);
    const data = [];
    for (let w = Math.max(0, tw - 11); w <= tw; w++) {
      const sum = Stats.getWeeklySummary(tbl, w);
      const s   = TZ.slotDate(tbl, w, 0);
      data.push({
        value: sum ? sum.overallPct : null,
        label: `${s.getDate()}/${s.getMonth() + 1}`,
      });
    }
    setTimeout(() => drawLine('progress-chart', data), 100);
  };

  return { drawLine, renderProgressChart };
})();




/* ════════ SHARE ════════ */
const Share = (() => {
  const buildCardData = () => {
    const u     = State.me();
    const score = Stats.getConsistencyScore();
    const prog  = Widget.getProgress();
    const all   = Badges.getAll();
    const earned = all.filter(b => b.earned);
    return { name: u?.name || 'User', score, prog, earned, badgeCount: earned.length };
  };

  const renderShareCard = () => {
    const el = document.getElementById('share-card');
    if (!el) return;
    const d = buildCardData();
    el.innerHTML = `
      <div style="background:var(--bg3);border:1px solid var(--bd2);border-radius:var(--r-md);padding:16px;text-align:center">
        <div style="font-size:22px;font-weight:800;letter-spacing:1px;color:var(--acc);margin-bottom:4px">${_esc(d.name)}</div>
        <div style="font-family:var(--font-m);font-size:8px;color:var(--tx2);letter-spacing:1px;margin-bottom:12px">UPG · ${TZ.formatShortDate(TZ.now())}</div>
        <div style="display:flex;justify-content:center;gap:20px;margin-bottom:12px">
          <div><div style="font-size:28px;font-weight:800;color:var(--acc)">${d.score}</div><div style="font-family:var(--font-m);font-size:7px;color:var(--tx2);letter-spacing:1px">CONSISTENCY</div></div>
          <div><div style="font-size:28px;font-weight:800;color:var(--acc)">${d.prog.pct}%</div><div style="font-family:var(--font-m);font-size:7px;color:var(--tx2);letter-spacing:1px">TODAY</div></div>
          <div><div style="font-size:28px;font-weight:800;color:var(--acc)">${d.badgeCount}</div><div style="font-family:var(--font-m);font-size:7px;color:var(--tx2);letter-spacing:1px">BADGES</div></div>
        </div>
        <div style="font-size:18px">${d.earned.slice(0, 5).map(b => b.icon).join(' ')}</div>
      </div>`;
  };

  const copyShareLink = () => {
    const d    = buildCardData();
    const text = `🎯 UPG Progress\n${d.name} — Consistency: ${d.score}/100 · Today: ${d.prog.pct}% · Badges: ${d.badgeCount}\nTracked with UPG`;
    navigator.clipboard?.writeText(text)
      .then(() => Toast.success('Progress copied to clipboard!'))
      .catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        Toast.success('Progress copied!');
      });
  };

  const shareNative = async () => {
    const d    = buildCardData();
    const text = `🎯 UPG Progress\n${d.name} — Consistency: ${d.score}/100 · Today: ${d.prog.pct}% · Badges: ${d.badgeCount}\nTracked with UPG`;
    if (navigator.share) {
      try { await navigator.share({ title: 'My UPG Progress', text }); }
      catch(e) { copyShareLink(); }
    } else {
      copyShareLink();
    }
  };

  const _esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return { buildCardData, renderShareCard, copyShareLink, shareNative };
})();
