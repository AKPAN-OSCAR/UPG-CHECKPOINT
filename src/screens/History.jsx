import React from 'react';
import { ScreenFrame } from '../components/ScreenStack.jsx';
import { Stats } from '../core/stats-badges.js';
import './History.css';

export default function History({ upg, onBack }) {
  const timetables = upg.tables.filter(t => !t.archived && t.type === 'timetable');
  const habits = upg.tables.filter(t => !t.archived && t.type !== 'timetable');

  return (
    <ScreenFrame title="History" onBack={onBack}>
      <div className="screen-root px" style={{ paddingTop: 16 }}>
        {timetables.length === 0 && habits.length === 0 && <div className="empty-note">No history yet — start marking your tables.</div>}

        {timetables.map(t => {
          const { wk } = upg.TZ.getTodayWkDay(t);
          const summary = Stats.getWeeklySummary(t, wk);
          return (
            <div className="card" style={{ marginBottom: 12 }} key={t.id}>
              <div className="h2">{t.name}</div>
              {summary ? (
                <>
                  <div className="mono" style={{ fontSize: 24, fontWeight: 700, margin: '8px 0 4px' }}>{summary.overallPct}%</div>
                  <div className="muted">this week · {summary.totalDone} of {summary.totalBlocks} blocks</div>
                </>
              ) : <div className="muted" style={{ marginTop: 8 }}>No data recorded this week yet.</div>}
            </div>
          );
        })}

        {habits.map(t => (
          <div className="card" style={{ marginBottom: 12 }} key={t.id}>
            <div className="h2">{t.name}</div>
            <div className="mono" style={{ fontSize: 24, fontWeight: 700, margin: '8px 0 4px' }}>{upg.getHabitStreak(t.id)} days</div>
            <div className="muted">current streak · best {upg.getHabitBestStreak(t.id)}</div>
          </div>
        ))}
      </div>
    </ScreenFrame>
  );
}
