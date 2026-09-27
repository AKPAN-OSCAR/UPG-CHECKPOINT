import { useState, useCallback, useSyncExternalStore } from 'react';
import State from '../core/state.js';
import { TZ } from '../core/timezone.js';
import { Stats, Badges } from '../core/stats-badges.js';

// State (core/state.js) is a plain closure over module-level variables,
// not a React store — it doesn't emit change events. Rather than
// rewrite State's internals (risking exactly the kind of drift from
// the original that caused the last rebuild to go wrong), this hook
// wraps it with a version counter: every mutation bumps `version` and
// calls State.saveAll(), and components re-render off that. Simple,
// and it means State itself stays untouched from the original.
function useVersionedState() {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion(v => v + 1), []);
  return { version, bump };
}

export default function useUPG() {
  const { version, bump } = useVersionedState();

  const _persist = () => { State.saveAll(); bump(); };

  // ── TABLE CREATION — matches app.js's real flow: type (timetable/
  // build/stop) + schedType (default template / custom empty) ──
  const createTable = useCallback((name, type, schedType, goal) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const table = { id, name, type, goal: goal || '', createdAt: Date.now(), archived: false };
    State.tables = [...State.tables, table];
    if (type === 'timetable') {
      State.blocks[id] = schedType === 'default'
        ? State.DEFAULT_BLOCKS.map(b => ({ ...b, id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }))
        : [];
      State.schedState[id] = {};
    } else {
      State.strkState[id] = [];
    }
    _persist();
    return table;
  }, []);

  const archiveTable = useCallback((id) => {
    State.tables = State.tables.map(t => t.id === id ? { ...t, archived: true } : t);
    _persist();
  }, []);

  const deleteTable = useCallback((id) => {
    State.tables = State.tables.filter(t => t.id !== id);
    delete State.blocks[id];
    delete State.schedState[id];
    delete State.strkState[id];
    _persist();
  }, []);

  const editTable = useCallback((id, { name, goal }) => {
    State.tables = State.tables.map(t => t.id === id ? { ...t, name, goal } : t);
    _persist();
  }, []);

  // ── BLOCKS (timetables only) ──
  const addBlock = useCallback((tableId, { label, tag, start, end, priority }) => {
    const block = { id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, label, tag: tag || '', start, end, priority: priority || 'normal' };
    State.blocks[tableId] = [...(State.blocks[tableId] || []), block];
    _persist();
    return block;
  }, []);

  const editBlock = useCallback((tableId, blockId, patch) => {
    State.blocks[tableId] = (State.blocks[tableId] || []).map(b => b.id === blockId ? { ...b, ...patch } : b);
    _persist();
  }, []);

  const removeBlock = useCallback((tableId, blockId) => {
    const idx = (State.blocks[tableId] || []).findIndex(b => b.id === blockId);
    State.blocks[tableId] = (State.blocks[tableId] || []).filter(b => b.id !== blockId);
    // Sched state is indexed by block POSITION, not id — removing a
    // block means removing that same index from every recorded day,
    // or completion history silently shifts onto the wrong block.
    if (idx > -1) {
      const ss = State.schedState[tableId] || {};
      Object.keys(ss).forEach(wk => Object.keys(ss[wk]).forEach(dy => { ss[wk][dy].splice(idx, 1); }));
    }
    _persist();
  }, []);

  const moveBlock = useCallback((tableId, index, dir) => {
    const arr = [...(State.blocks[tableId] || [])];
    const j = index + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[index], arr[j]] = [arr[j], arr[index]];
    State.blocks[tableId] = arr;
    // Same index-shift concern as removeBlock — swap the recorded
    // completion state for those two positions too.
    const ss = State.schedState[tableId] || {};
    Object.keys(ss).forEach(wk => Object.keys(ss[wk]).forEach(dy => {
      const d = ss[wk][dy];
      if (d && d.length > Math.max(index, j)) [d[index], d[j]] = [d[j], d[index]];
    }));
    _persist();
  }, []);

  // ── TIMETABLE 3-STATE CYCLE: 0 (blank) -> 1 (done) -> 2 (missed) -> 0 ──
  const cycleBlockState = useCallback((tableId, wk, dy, blockIndex) => {
    State.schedState[tableId] ??= {};
    State.schedState[tableId][wk] ??= {};
    const blockCount = (State.blocks[tableId] || []).length;
    const cur = State.schedState[tableId][wk][dy] || new Array(blockCount).fill(0);
    cur[blockIndex] = (cur[blockIndex] + 1) % 3;
    State.schedState[tableId][wk][dy] = cur;
    _persist();
  }, []);

  // ── HABIT TRACKER (build/stop): calendar-heatmap, same 3-state cycle
  // per day-since-creation, streak = consecutive 1s counting back from today ──
  const cycleHabitDay = useCallback((tableId, dayIndex) => {
    const arr = [...(State.strkState[tableId] || [])];
    while (arr.length <= dayIndex) arr.push(0);
    arr[dayIndex] = (arr[dayIndex] + 1) % 3;
    State.strkState[tableId] = arr;
    _persist();
  }, []);

  const getHabitStreak = useCallback((tableId) => {
    const arr = State.strkState[tableId] || [];
    let streak = 0;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i] === 1) streak++;
      else if (arr[i] === 2) break; // an explicit "missed" breaks the streak; unmarked (0) for TODAY does not
      else if (i !== arr.length - 1) break;
    }
    return streak;
  }, []);

  const getHabitBestStreak = useCallback((tableId) => {
    const arr = State.strkState[tableId] || [];
    let best = 0, cur = 0;
    arr.forEach(v => { if (v === 1) { cur++; best = Math.max(best, cur); } else cur = 0; });
    return best;
  }, []);

  const runBadgeCheck = useCallback(() => {
    const newly = Badges.check();
    if (newly.length) bump();
    return newly;
  }, [bump]);

  return {
    version, tables: State.tables, blocks: State.blocks, schedState: State.schedState, strkState: State.strkState,
    createTable, archiveTable, deleteTable, editTable,
    addBlock, editBlock, removeBlock, moveBlock, cycleBlockState,
    cycleHabitDay, getHabitStreak, getHabitBestStreak,
    consistencyScore: Stats.getConsistencyScore(),
    runBadgeCheck, badges: Badges.getAll(),
    TZ, DEFAULT_BLOCKS: State.DEFAULT_BLOCKS, PRIORITIES: State.PRIORITIES, TYPE_META: State.TYPE_META,
  };
}
