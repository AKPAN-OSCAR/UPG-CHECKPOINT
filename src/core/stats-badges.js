/* ═══════════════════════════════════════
   UPG — STATS + BADGES + HEATMAP + QUOTES
   Ported directly from the original js/features/badges.js. Every
   calculation below is unchanged from the original — only the DOM
   rendering (popups, HTML strings) was stripped out, since that's now
   React's job. If you're diffing against the original file, the
   scoring/unlock logic should match line-for-line in spirit.
═══════════════════════════════════════ */
import State from './state.js';
import { TZ } from './timezone.js';

export const Stats = (() => {
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
          if (!interacted) return;
          const done = dayArr.filter(s => s === 1).length;
          totalPct += (done / blks.length) * 100;
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
          if (i >= stats.length || s === 0) return;
          stats[i].total++;
          if (s === 1) stats[i].done++;
          if (s === 2) stats[i].miss++;
        })
      )
    );
    return stats;
  };

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
      if (!interacted) { dayPcts.push(null); continue; }
      const dn = st.filter(s => s === 1).length;
      const pct = Math.round(dn / blks.length * 100);
      dayPcts.push(pct);
      done += dn;
      interactedTotal += blks.length;
      if (dn > bestDone) { bestDone = dn; bestDay = d; }
    }
    const hasData = dayPcts.some(p => p !== null);
    if (!hasData) return null;
    return {
      overallPct: interactedTotal > 0 ? Math.round(done / interactedTotal * 100) : 0,
      dayPcts, bestDay, totalDone: done, totalBlocks: interactedTotal,
    };
  };

  const generateReviewText = (tbl, wk, DAY_FULL) => {
    const s = getWeeklySummary(tbl, wk);
    if (!s) return ['No data recorded this week yet.'];
    const ins = [`You completed ${s.overallPct}% of your tracked schedule this week.`];
    if (s.bestDay >= 0) ins.push(`Best day: ${DAY_FULL[s.bestDay]} at ${s.dayPcts[s.bestDay]}%.`);
    const activeDays = s.dayPcts.filter(p => p !== null).length;
    ins.push(`Active ${activeDays} day${activeDays !== 1 ? 's' : ''} this week.`);
    const missedDays = s.dayPcts.filter(p => p !== null && p < 50).length;
    if (missedDays > 0) ins.push(`${missedDays} active day${missedDays > 1 ? 's' : ''} below 50%. Focus on consistency.`);
    ins.push(s.overallPct >= 80 ? 'Outstanding week! Keep up this momentum.' : s.overallPct >= 50 ? 'Good effort. Push for 80%+ next week.' : 'Tough week. Every task completed still counts.');
    return ins;
  };

  return { getConsistencyScore, getBlockStats, getWeeklySummary, generateReviewText };
})();

export const Badges = (() => {
  const _totalDone = () => {
    let c = 0;
    Object.values(State.schedState).forEach(tbl =>
      Object.values(tbl).forEach(wk => Object.values(wk).forEach(dy => dy.forEach(s => { if (s === 1) c++; }))));
    return c;
  };
  const _hasPerfectDay = () =>
    Object.entries(State.schedState).some(([id, tbl]) => {
      const blks = State.blocks[id] || [];
      if (!blks.length) return false;
      return Object.values(tbl).some(wk => Object.values(wk).some(dy => dy.length === blks.length && dy.every(s => s === 1)));
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
        return days.length >= 5 && days.every(dy => dy.filter(s => s === 1).length >= Math.ceil(blks.length * 0.6));
      });
    });
  const _isEarlyBird = () =>
    Object.entries(State.schedState).some(([id, tbl]) => {
      const blks = State.blocks[id] || [];
      return Object.values(tbl).some(wk => Object.values(wk).some(dy => dy.some((s, i) => {
        if (s !== 1) return false;
        const blk = blks[i];
        if (!blk) return false;
        const [h] = blk.start.split(':').map(Number);
        return h < 6;
      })));
    });

  const CHECKS = {
    first_tick: () => _totalDone() >= 1,
    day_complete: () => _hasPerfectDay(),
    streak_3: () => _getMaxStreak() >= 3,
    streak_7: () => _getMaxStreak() >= 7,
    streak_14: () => _getMaxStreak() >= 14,
    streak_30: () => _getMaxStreak() >= 30,
    week_done: () => _hasFullWeek(),
    tables_3: () => State.tables.length >= 3,
    consistent: () => Stats.getConsistencyScore() >= 80,
    early_bird: () => _isEarlyBird(),
  };

  // Returns newly-earned badge defs (caller decides how to celebrate —
  // React component shows the popup instead of this module touching the DOM)
  const check = () => {
    const newBadges = [];
    State.BADGE_DEFS.forEach(def => {
      if (State.badges[def.id]) return;
      try {
        if (CHECKS[def.id] && CHECKS[def.id]()) {
          State.badges[def.id] = { earnedAt: new Date().toISOString() };
          newBadges.push(def);
        }
      } catch (e) { /* a single bad check should never break the others */ }
    });
    if (newBadges.length) State.saveAll();
    return newBadges;
  };

  const getAll = () => State.BADGE_DEFS.map(d => ({
    ...d, earned: !!State.badges[d.id], earnedAt: State.badges[d.id]?.earnedAt || null,
  }));

  return { check, getAll };
})();

export const Heatmap = (() => {
  const getData = (tbl, days = 84) => {
    const blks = State.blocks[tbl.id] || [];
    if (!blks.length) return [];
    const result = [];
    const { wk: tw } = TZ.getTodayWkDay(tbl);
    for (let w = 0; w <= tw; w++) {
      for (let d = 0; d < 7; d++) {
        const dt = TZ.slotDate(tbl, w, d);
        if (TZ.isFuture(dt)) continue;
        const st = ((State.schedState[tbl.id] || {})[w] || {})[d] || [];
        const interacted = st.some(s => s !== 0);
        const done = st.filter(s => s === 1).length;
        result.push({ date: dt, pct: interacted ? Math.round(done / blks.length * 100) : null, done, total: blks.length, interacted });
      }
    }
    return result.slice(-days);
  };
  const pctToClass = p => {
    if (p === null || p === 0) return 'hm-0';
    if (p < 50) return 'hm-25';
    if (p < 75) return 'hm-50';
    if (p < 100) return 'hm-75';
    return 'hm-100';
  };
  return { getData, pctToClass };
})();

export const Quotes = (() => {
  const getToday = () => {
    const d = TZ.now();
    return State.QUOTES[(d.getDate() + d.getMonth() * 31) % State.QUOTES.length];
  };
  return { getToday };
})();
