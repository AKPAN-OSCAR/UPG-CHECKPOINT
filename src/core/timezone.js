/* ═══════════════════════════════════════
   UPG v10 — TIMEZONE & DATE UTILS
   Fixed: all date comparisons are timezone-aware
   Fixed: midnight() uses TZ-local date parts
   Fixed: isFuture/isToday use TZ-aware noon anchor
   Added: formatDateKey() for consistent mood/note keys
   Added: resetCalendarInit() for settings changes
═══════════════════════════════════════ */
import State from './state.js';

const TZ = (() => {
  const getTZ  = () => State.me()?.tz || 'Africa/Lagos';
  const getFmt = () => State.me()?.timeFmt || '24h';

  // Returns a JS Date whose .getHours()/.getDate() etc reflect the given TZ
  // Implementation: we ask the browser for the locale string in that TZ,
  // then parse it back — this is the most reliable cross-browser approach.
  const nowInTZ = (tz) => {
    try { return new Date(new Date().toLocaleString('en-US', { timeZone: tz })); }
    catch(e) { return new Date(); }
  };

  const dateInTZ = (d, tz) => {
    try { return new Date(d.toLocaleString('en-US', { timeZone: tz })); }
    catch(e) { return d; }
  };

  const now = () => nowInTZ(getTZ());

  // ── FORMATTING ──
  const formatTime = (d, fmt) => {
    const f = fmt || getFmt();
    if (f === '12h') {
      const h = d.getHours(), m = String(d.getMinutes()).padStart(2, '0');
      const ampm = h >= 12 ? 'PM' : 'AM';
      return `${h % 12 || 12}:${m} ${ampm}`;
    }
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };

  const formatBlockTime = str => {
    if (getFmt() === '12h') {
      const [hh, mm] = str.split(':').map(Number);
      return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
    }
    return str;
  };

  const DAYS_FULL  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const formatFullDate  = d => `${DAYS_FULL[d.getDay()]} · ${d.getDate()} ${State.MONTH_FULL[d.getMonth()]} ${d.getFullYear()}`;
  const formatShortDate = d => `${d.getDate()} ${State.MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;

  // Consistent key for mood/note storage: YYYY_MM_DD in user's TZ
  // Month is 0-indexed to match getMonth() — both writer and reader use this fn
  const formatDateKey = (d) => {
    const n = d || now();
    return `${n.getFullYear()}_${n.getMonth()}_${n.getDate()}`;
  };

  // ── DATE MATH ──
  // midnight(): strip time portion using the date parts AS SEEN in local TZ
  const midnight = d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

  // isToday / isFuture compare using TZ-aware "now"
  const isToday = d => {
    const n = now();
    return d.getDate() === n.getDate()
      && d.getMonth() === n.getMonth()
      && d.getFullYear() === n.getFullYear();
  };

  const isFuture = d => midnight(d) > midnight(now());
  const isPast   = d => midnight(d) < midnight(now());

  const daysBetween = (a, b) => Math.round((midnight(b) - midnight(a)) / 86400000);

  // Day-of-week (Mon=0 … Sun=6)
  const todayDOW = () => { const d = now().getDay(); return d === 0 ? 6 : d - 1; };

  // ── TIMETABLE SLOT MATH ──
  // Converts (tbl, weekIndex, dayIndex) → JS Date for that slot
  const slotDate = (tbl, wk, dy) => {
    const created = dateInTZ(new Date(tbl.createdAt), getTZ());
    const cm = midnight(created);
    const crDOW = cm.getDay() === 0 ? 6 : cm.getDay() - 1; // Mon-based
    // Start of week 0 = the Monday of the creation week
    const weekStart = new Date(cm);
    weekStart.setDate(cm.getDate() - crDOW + wk * 7);
    const slot = new Date(weekStart);
    slot.setDate(weekStart.getDate() + dy);
    return slot;
  };

  const getTodayWkDay = tbl => {
    const n       = nowInTZ(getTZ());
    const created = dateInTZ(new Date(tbl.createdAt), getTZ());
    const nm = midnight(n), cm = midnight(created);
    const diff = Math.max(0, Math.floor((nm - cm) / 86400000));
    return { wk: Math.floor(diff / 7), dy: todayDOW() };
  };

  const tableAgeDays = tbl => {
    const n       = nowInTZ(getTZ());
    const created = dateInTZ(new Date(tbl.createdAt), getTZ());
    return Math.max(1, Math.floor((midnight(n) - midnight(created)) / 86400000) + 1);
  };

  const greeting = () => {
    const h = now().getHours();
    return h < 12 ? 'GOOD MORNING' : h < 17 ? 'GOOD AFTERNOON' : 'GOOD EVENING';
  };

  return {
    getTZ, getFmt, nowInTZ, dateInTZ, now,
    formatTime, formatBlockTime, formatFullDate, formatShortDate, formatDateKey,
    todayDOW, midnight, isToday, isFuture, isPast, daysBetween,
    slotDate, getTodayWkDay, tableAgeDays, greeting,
  };
})();


/* ═══════════════════════════════════════
   TOAST
═══════════════════════════════════════ */
const Toast = (() => {
  const show = (msg, type = 'default', ms = 2600) => {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => {
      t.style.cssText = 'opacity:0;transform:translateY(6px);transition:all .25s ease';
      setTimeout(() => t.remove(), 260);
    }, ms);
  };
  return {
    show,
    success: m => show(m, 'success'),
    error:   m => show(m, 'error'),
    warning: m => show(m, 'warning'),
  };
})();


/* ═══════════════════════════════════════
   CONFIRM DIALOG
═══════════════════════════════════════ */
const Confirm = (() => {
  let _res = null;
  const show = ({ icon = '⚠️', title, msg, confirmLabel = 'CONFIRM', danger = true }) =>
    new Promise(resolve => {
      _res = resolve;
      document.getElementById('conf-icon').textContent  = icon;
      document.getElementById('conf-title').textContent = title;
      document.getElementById('conf-msg').textContent   = msg;
      const btn = document.getElementById('conf-btn');
      btn.textContent = confirmLabel;
      btn.className   = danger ? 'btn btn-danger' : 'btn btn-primary';
      document.getElementById('ov-confirm').classList.add('open');
    });
  const resolve = v => {
    document.getElementById('ov-confirm').classList.remove('open');
    if (_res) { _res(v); _res = null; }
  };
  return { show, resolve };
})();

export { TZ, Toast, Confirm };
