/* ═══════════════════════════════════════
   UPG v10 — BADGES + STATS + NOTES + HEATMAP + QUOTES + EXPORT
   Fixed: consistency score — active days only, correct denominator
   Fixed: weekly bars skip null (no-data) days properly
   Fixed: Early Bird badge checks actual sub-6AM task completion time
   Fixed: Heatmap uses interacted flag, not raw zero
   Fixed: getWeeklySummary — null for no-interaction days (not 0%)
   Fixed: Export functions referenced correctly as ExportData
═══════════════════════════════════════ */

/* ════════ STATS ════════ */
const Stats = (() => {

  // Consistency score: average completion % across days the user actually used the app
  // A day is "active" only if at least one block was tapped (state !== 0)
  const getConsistencyScore = () => {
    const tt = State.tables.filter(t => !t.archived && t.type === 'timetable');
    if (!tt.length) return 0;
    let totalPct = 0, activeDays = 0;
    tt.forEach(tbl => {
      const blks = State.blocks[tbl.id] || [];
      if (!blks.length) return;
      const ss = State.schedState[tbl.id] || {};
      Object.values(ss).forEach(wkObj => {
        Object.values(wkObj).forEach(dayArr => {
          const interacted = dayArr.some(s => s !== 0);
          if (!interacted) return; // skip days user never opened
          const done = dayArr.filter(s => s === 1).length;
          totalPct  += (done / blks.length) * 100;
          activeDays++;
        });
      });
    });
    return activeDays > 0 ? Math.round(totalPct / activeDays) : 0;
  };

  const getBlockStats = id => {
    const blks = State.blocks[id] || [];
    if (!blks.length) return [];
    const stats = blks.map(b => ({ ...b, done: 0, miss: 0, total: 0 }));
    Object.values(State.schedState[id] || {}).forEach(wk =>
      Object.values(wk).forEach(dy =>
        dy.forEach((s, i) => {
          if (i >= stats.length || s === 0) return; // skip untouched
          stats[i].total++;
          if (s === 1) stats[i].done++;
          if (s === 2) stats[i].miss++;
        })
      )
    );
    return stats;
  };

  // Fixed: returns null for days with no interaction (not 0%)
  const getWeeklySummary = (tbl, wk) => {
    const blks = State.blocks[tbl.id] || [];
    if (!blks.length) return null;
    let done = 0, interactedTotal = 0, bestDay = -1, bestDone = -1;
    const dayPcts = [];

    for (let d = 0; d < 7; d++) {
      const dt = TZ.slotDate(tbl, wk, d);
      if (TZ.isFuture(dt)) { dayPcts.push(null); continue; }
      const st = ((State.schedState[tbl.id] || {})[wk] || {})[d] || [];
      const interacted = st.some(s => s !== 0);
      if (!interacted) { dayPcts.push(null); continue; } // null = no data
      const dn  = st.filter(s => s === 1).length;
      const pct = Math.round(dn / blks.length * 100);
      dayPcts.push(pct);
      done += dn;
      interactedTotal += blks.length;
      if (dn > bestDone) { bestDone = dn; bestDay = d; }
    }

    const hasData = dayPcts.some(p => p !== null);
    if (!hasData) return null;

    return {
      overallPct:  interactedTotal > 0 ? Math.round(done / interactedTotal * 100) : 0,
      dayPcts,
      bestDay,
      totalDone:   done,
      totalBlocks: interactedTotal,
    };
  };

  const generateReviewText = (tbl, wk) => {
    const s = getWeeklySummary(tbl, wk);
    if (!s) return ['No data recorded this week yet.'];
    const ins = [`You completed ${s.overallPct}% of your tracked schedule this week.`];
    if (s.bestDay >= 0)
      ins.push(`Best day: ${State.DAY_FULL[s.bestDay]} at ${s.dayPcts[s.bestDay]}%.`);
    const activeDays = s.dayPcts.filter(p => p !== null).length;
    ins.push(`Active ${activeDays} day${activeDays !== 1 ? 's' : ''} this week.`);
    const missedDays = s.dayPcts.filter(p => p !== null && p < 50).length;
    if (missedDays > 0)
      ins.push(`${missedDays} active day${missedDays > 1 ? 's' : ''} below 50%. Focus on consistency.`);
    ins.push(
      s.overallPct >= 80 ? 'Outstanding week! Keep up this momentum. 🏆' :
      s.overallPct >= 50 ? 'Good effort. Push for 80%+ next week. 📈' :
                           'Tough week. Every task completed still counts. 💪'
    );
    return ins;
  };

  return { getConsistencyScore, getBlockStats, getWeeklySummary, generateReviewText };
})();


/* ════════ BADGES ════════ */
const Badges = (() => {

  const _totalDone = () => {
    let c = 0;
    Object.values(State.schedState).forEach(tbl =>
      Object.values(tbl).forEach(wk =>
        Object.values(wk).forEach(dy => dy.forEach(s => { if (s === 1) c++; }))
      )
    );
    return c;
  };

  const _hasPerfectDay = () =>
    Object.entries(State.schedState).some(([id, tbl]) => {
      const blks = State.blocks[id] || [];
      if (!blks.length) return false;
      return Object.values(tbl).some(wk =>
        Object.values(wk).some(dy => dy.length === blks.length && dy.every(s => s === 1))
      );
    });

  const _getMaxStreak = () => {
    let max = 0;
    State.tables.filter(t => t.type !== 'timetable').forEach(t => {
      const s = State.strkState[t.id] || [];
      let c = 0, b = 0;
      s.forEach(v => { if (v === 1) { c++; b = Math.max(b, c); } else c = 0; });
      max = Math.max(max, b);
    });
    return max;
  };

  const _hasFullWeek = () =>
    Object.entries(State.schedState).some(([id, tbl]) => {
      const blks = State.blocks[id] || [];
      if (!blks.length) return false;
      return Object.values(tbl).some(wk => {
        const days = Object.values(wk);
        return days.length >= 5 && days.every(dy =>
          dy.filter(s => s === 1).length >= Math.ceil(blks.length * 0.6)
        );
      });
    });

  // Fixed: Early Bird — checks if any task was completed AND that task's
  // block start time is before 06:00
  const _isEarlyBird = () => {
    return Object.entries(State.schedState).some(([id, tbl]) => {
      const blks = State.blocks[id] || [];
      return Object.values(tbl).some(wk =>
        Object.values(wk).some(dy =>
          dy.some((s, i) => {
            if (s !== 1) return false;
            const blk = blks[i];
            if (!blk) return false;
            const [h] = blk.start.split(':').map(Number);
            return h < 6; // before 06:00
          })
        )
      );
    });
  };

  const CHECKS = {
    first_tick:   () => _totalDone() >= 1,
    day_complete: () => _hasPerfectDay(),
    streak_3:     () => _getMaxStreak() >= 3,
    streak_7:     () => _getMaxStreak() >= 7,
    streak_14:    () => _getMaxStreak() >= 14,
    streak_30:    () => _getMaxStreak() >= 30,
    week_done:    () => _hasFullWeek(),
    tables_3:     () => State.tables.length >= 3,
    consistent:   () => Stats.getConsistencyScore() >= 80,
    early_bird:   () => _isEarlyBird(),
  };

  const check = () => {
    const newBadges = [];
    State.BADGE_DEFS.forEach(def => {
      if (State.badges[def.id]) return;
      try {
        if (CHECKS[def.id] && CHECKS[def.id]()) {
          State.badges[def.id] = { earnedAt: new Date().toISOString() };
          newBadges.push(def);
        }
      } catch(e) {}
    });
    if (newBadges.length) {
      State.saveAll();
      newBadges.forEach(_popup);
    }
    return newBadges;
  };

  const _popup = b => {
    const el = document.createElement('div');
    el.style.cssText = [
      'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%)',
      'z-index:9999;background:var(--bg2);border:1px solid var(--acc-b)',
      'border-radius:16px;padding:28px 24px;text-align:center',
      'box-shadow:0 8px 40px rgba(0,0,0,.7);animation:badgePop .4s cubic-bezier(.34,1.56,.64,1) both',
      'min-width:260px;max-width:320px',
    ].join(';');
    el.innerHTML = `
      <div style="font-size:52px;margin-bottom:10px">${b.icon}</div>
      <div style="font-family:var(--font-m);font-size:8px;color:var(--acc);letter-spacing:2px;margin-bottom:6px">BADGE UNLOCKED</div>
      <div style="font-size:22px;font-weight:800;letter-spacing:1px;margin-bottom:4px">${b.name}</div>
      <div style="font-family:var(--font-m);font-size:9px;color:var(--tx2);letter-spacing:.5px">${b.desc}</div>`;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity .3s';
      setTimeout(() => el.remove(), 320);
    }, 2800);
    setTimeout(() => Widget.speak(`Congratulations! You earned the ${b.name} badge!`), 300);
  };

  const getAll = () => State.BADGE_DEFS.map(d => ({
    ...d,
    earned:   !!State.badges[d.id],
    earnedAt: State.badges[d.id]?.earnedAt || null,
  }));

  return { check, getAll };
})();


/* ════════ NOTES ════════ */
const Notes = (() => {
  const key = (id, wk, dy) => `${id}_${wk}_${dy}`;
  const get = (id, wk, dy) => State.notes[key(id, wk, dy)] || '';
  const set = (id, wk, dy, text) => { State.notes[key(id, wk, dy)] = text; State.saveAll(); };
  return { get, set };
})();


/* ════════ HEATMAP ════════ */
const Heatmap = (() => {
  const getData = (tbl, days = 84) => {
    const blks = State.blocks[tbl.id] || [];
    if (!blks.length) return [];
    const result  = [];
    const { wk: tw } = TZ.getTodayWkDay(tbl);
    for (let w = 0; w <= tw; w++) {
      for (let d = 0; d < 7; d++) {
        const dt = TZ.slotDate(tbl, w, d);
        if (TZ.isFuture(dt)) continue;
        const st         = ((State.schedState[tbl.id] || {})[w] || {})[d] || [];
        const interacted = st.some(s => s !== 0);
        const done       = st.filter(s => s === 1).length;
        result.push({
          date:       dt,
          pct:        interacted ? Math.round(done / blks.length * 100) : null,
          done,
          total:      blks.length,
          interacted,
        });
      }
    }
    return result.slice(-days);
  };

  // null = no data (grey), 0 = 0% (lightest), etc.
  const pctToClass = p => {
    if (p === null) return 'hm-0';
    if (p === 0)    return 'hm-0';
    if (p < 50)     return 'hm-25';
    if (p < 75)     return 'hm-50';
    if (p < 100)    return 'hm-75';
    return 'hm-100';
  };

  return { getData, pctToClass };
})();


/* ════════ QUOTES ════════ */
const Quotes = (() => {
  const getToday = () => {
    const d = TZ.now();
    return State.QUOTES[(d.getDate() + d.getMonth() * 31) % State.QUOTES.length];
  };
  return { getToday };
})();


/* ════════ EXPORT ════════ */
const ExportData = (() => {

  const exportScheduleText = tbl => {
    const blks = State.blocks[tbl.id] || [];
    if (!blks.length) { Toast.warning('No blocks to export'); return; }
    const { wk, dy } = TZ.getTodayWkDay(tbl);
    const st   = ((State.schedState[tbl.id] || {})[wk] || {})[dy] || [];
    const date = TZ.formatFullDate(TZ.now());
    let text   = `UPG — ${tbl.name}\n${date}\n${'─'.repeat(40)}\n\n`;
    blks.forEach((b, i) => {
      const s    = st[i] || 0;
      const tick = s === 1 ? '✓' : s === 2 ? '✗' : '○';
      text += `${tick} ${TZ.formatBlockTime(b.start)}–${TZ.formatBlockTime(b.end)}  ${b.label}\n`;
    });
    const done  = st.filter(s => s === 1).length;
    const total = blks.length;
    text += `\n${'─'.repeat(40)}\nDone: ${done}/${total} (${total ? Math.round(done / total * 100) : 0}%)\n`;
    const blob = new Blob([text], { type: 'text/plain' });
    const a    = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(blob),
      download: `upg_${tbl.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
    Toast.success('Schedule exported');
  };

  const exportWeeklyHTML = tbl => {
    const { wk } = TZ.getTodayWkDay(tbl);
    const sum    = Stats.getWeeklySummary(tbl, wk);
    const ins    = Stats.generateReviewText(tbl, wk);
    const start  = TZ.slotDate(tbl, wk, 0);
    const end    = TZ.slotDate(tbl, wk, 6);

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>UPG Weekly Report</title>
<style>
  body{font-family:system-ui,sans-serif;background:#0a0b0d;color:#dde3ea;padding:24px;max-width:600px;margin:0 auto}
  h1{font-size:28px;letter-spacing:2px;margin-bottom:4px}
  .sub{color:#6b7885;font-size:12px;margin-bottom:20px}
  .score{font-size:48px;font-weight:800;color:#00e676}
  .insight{background:#0f1114;border:1px solid #1f2328;border-radius:8px;padding:12px 16px;margin-bottom:8px;font-size:13px;line-height:1.6}
</style></head><body>
<h1>UPG WEEKLY REPORT</h1>
<div class="sub">${tbl.name} · ${start.getDate()} ${State.MONTH_SHORT[start.getMonth()]} – ${end.getDate()} ${State.MONTH_SHORT[end.getMonth()]} ${end.getFullYear()}</div>
<div class="score">${sum ? sum.overallPct : 0}%</div>
<div style="color:#6b7885;font-size:12px;margin-bottom:20px">WEEKLY COMPLETION RATE</div>
${ins.map(i => `<div class="insight">${i}</div>`).join('')}
<div style="color:#2e353d;font-size:11px;margin-top:24px">Generated by UPG · ${new Date().toLocaleDateString()}</div>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const a    = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(blob),
      download: `upg_weekly_${new Date().toISOString().split('T')[0]}.html`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
    Toast.success('Weekly report exported');
  };

  const backupData = () => {
    const data = Storage.exportAll();
    const a    = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(new Blob([data], { type: 'application/json' })),
      download: `upg_backup_${new Date().toISOString().split('T')[0]}.json`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
    Toast.success('Backup downloaded');
  };

  const restoreData = file => new Promise(resolve => {
    const r = new FileReader();
    r.onload = e => {
      const ok = Storage.importAll(e.target.result);
      if (ok) {
        Toast.success('Data restored! Reloading…');
        setTimeout(() => location.reload(), 1400);
      } else {
        Toast.error('Invalid backup file');
      }
      resolve(ok);
    };
    r.readAsText(file);
  });

  return { exportScheduleText, exportWeeklyHTML, backupData, restoreData };
})();
