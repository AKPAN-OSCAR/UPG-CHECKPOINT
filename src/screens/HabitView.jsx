import React from 'react';
import { Check, X as XIcon, Flame } from 'lucide-react';
import { ScreenFrame } from '../components/ScreenStack.jsx';
import './HabitView.css';

export default function HabitView({ upg, table, onBack }) {
  const ageDays = upg.TZ.tableAgeDays(table); // days since creation, inclusive of today
  const arr = upg.strkState[table.id] || [];
  const streak = upg.getHabitStreak(table.id);
  const best = upg.getHabitBestStreak(table.id);
  const totalDone = arr.filter(v => v === 1).length;

  const cells = Array.from({ length: ageDays }, (_, i) => ({ day: i, state: arr[i] || 0 }));

  return (
    <ScreenFrame title={table.name} onBack={onBack}>
      <div className="habit-view">
        <div className="habit-stats">
          <div className="hstat"><Flame size={16} color="var(--gold)" /><b>{streak}</b><span>current</span></div>
          <div className="hstat"><b>{best}</b><span>best</span></div>
          <div className="hstat"><b>{totalDone}</b><span>total</span></div>
        </div>

        <div className="habit-hint">Tap a day to cycle: blank → done → missed</div>
        <div className="habit-grid">
          {cells.map(c => (
            <div
              key={c.day}
              className={`hcell ${c.state === 1 ? 'done' : c.state === 2 ? 'missed' : ''}`}
              onClick={() => upg.cycleHabitDay(table.id, c.day)}
            >
              {c.state === 1 && <Check size={11} strokeWidth={2.6} />}
              {c.state === 2 && <XIcon size={11} strokeWidth={2.6} />}
            </div>
          ))}
        </div>
      </div>
    </ScreenFrame>
  );
}
