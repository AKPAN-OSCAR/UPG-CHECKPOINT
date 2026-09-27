import React, { useState } from 'react';
import { Bell, Menu, Plus, Flame } from 'lucide-react';
import { Quotes } from '../core/stats-badges.js';
import './Home.css';

function pillFor(t, upg) {
  if (t.archived) return { cls: 'muted', txt: 'ARCHIVED' };
  if (t.type === 'timetable') {
    const { wk, dy } = upg.TZ.getTodayWkDay(t);
    const blks = upg.blocks[t.id] || [];
    const st = ((upg.schedState[t.id] || {})[wk] || {})[dy] || [];
    const done = st.filter(s => s === 1).length, tot = blks.length;
    if (!tot) return { cls: 'muted', txt: 'NO BLOCKS' };
    if (!done) return { cls: 'muted', txt: 'NOT STARTED' };
    if (done === tot) return { cls: 'good', txt: '✓ COMPLETE' };
    return { cls: 'warn', txt: `${done}/${tot} DONE` };
  }
  const s = upg.getHabitStreak(t.id);
  return s === 0 ? { cls: 'muted', txt: '0 DAYS' } : { cls: 'good', txt: `🔥 ${s} DAYS` };
}

export default function Home({ upg, userName, onOpenMenu, onOpenTable, onNewTable }) {
  const quote = Quotes.getToday();
  const activeTables = upg.tables.filter(t => !t.archived);

  // Today's overall % across all active timetables — feeds the ring.
  const timetables = activeTables.filter(t => t.type === 'timetable');
  let done = 0, total = 0;
  timetables.forEach(t => {
    const { wk, dy } = upg.TZ.getTodayWkDay(t);
    const blks = upg.blocks[t.id] || [];
    const st = ((upg.schedState[t.id] || {})[wk] || {})[dy] || [];
    total += blks.length;
    done += st.filter(s => s === 1).length;
  });
  const pct = total ? Math.round((done / total) * 100) : 0;

  const hour = new Date().getHours();
  const streakAtRisk = hour >= 20 && total > 0 && pct < 100;

  return (
    <div className="home-screen">
      <div className="home-screen__greet">
        <div>
          <div className="home-screen__hello">{upg.TZ.greeting ? upg.TZ.greeting() : 'Hello'},</div>
          <div className="home-screen__who">{userName}</div>
        </div>
        <div className="home-screen__icons">
          <button className="icon-btn" aria-label="Notifications"><Bell size={17} strokeWidth={1.8} /></button>
          <button className="icon-btn" aria-label="Menu" onClick={onOpenMenu}><Menu size={17} strokeWidth={1.8} /></button>
        </div>
      </div>

      <div className="quote-card">
        <div className="quote-text">"{quote && quote.text}"</div>
        <div className="quote-author">— {quote && quote.author}</div>
      </div>

      {streakAtRisk && (
        <div className="risk-banner">⚠️ Mark today's progress before midnight to keep your streak alive.</div>
      )}

      <div className="balance-card">
        <div>
          <div className="balance-card__lbl">Today's focus</div>
          <div className="balance-card__sub">{done} of {total} tasks</div>
        </div>
        <div className="balance-ring" style={{ '--pct': `${pct * 3.6}deg` }}>
          <div className="balance-ring__inner"><b>{pct}%</b><span>DONE</span></div>
        </div>
      </div>

      <div className="stat2-row">
        <div className="stat2"><div className="stat2__top"><div className="stat2__dot"><Flame size={15} strokeWidth={1.8} /></div><div className="stat2__lbl">Consistency</div></div><div className="stat2__num">{upg.consistencyScore}%</div></div>
        <div className="stat2"><div className="stat2__top"><div className="stat2__dot">📋</div><div className="stat2__lbl">Tables</div></div><div className="stat2__num">{activeTables.length}</div></div>
      </div>

      <div className="section-hd"><h3>Your tables</h3></div>
      {activeTables.length === 0 && <div className="empty-note">No tables yet — tap + to build your first one.</div>}
      {activeTables.map(t => {
        const pill = pillFor(t, upg);
        return (
          <div className="table-card" key={t.id} onClick={() => onOpenTable(t)}>
            <div><div className="t">{t.name}</div><div className="s">{t.type === 'timetable' ? 'Timetable' : t.type === 'build' ? 'Building habit' : 'Breaking habit'}</div></div>
            <div className={`pill pill--${pill.cls}`}>{pill.txt}</div>
          </div>
        );
      })}

      <button className="fab" onClick={onNewTable} aria-label="New table"><Plus size={22} strokeWidth={2} /></button>
    </div>
  );
}
