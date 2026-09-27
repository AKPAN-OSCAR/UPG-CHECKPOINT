import React from 'react';
import Icon from '../components/Icon.jsx';
import { ScreenFrame } from '../components/ScreenStack.jsx';
import './Widget.css';

export default function Widget({ upg, onBack }) {
  const habitTables = upg.tables.filter(t => !t.archived && t.type !== 'timetable');
  const bestStreak = habitTables.reduce((max, t) => Math.max(max, upg.getHabitStreak(t.id)), 0);

  return (
    <ScreenFrame title="Home Screen Widget" onBack={onBack}>
      <div className="screen-root px" style={{ paddingTop: 16 }}>
        <div className="muted" style={{ marginBottom: 16 }}>Preview of the native widget — add it from your phone's home screen editor once this is installed as a real app.</div>
        <div className="widget-preview">
          <div className="row">
            <div className="h2" style={{ fontSize: 13 }}>UPG</div>
            <Icon name="flame" size={16} color="var(--ember-1)" />
          </div>
          <div className="mono" style={{ fontSize: 26, fontWeight: 700, margin: '10px 0 2px' }}>{bestStreak} days</div>
          <div className="muted">current streak</div>
        </div>
        <div className="honest-note" style={{ marginTop: 16 }}>
          This preview is a React mockup of the widget's look. The actual home-screen widget is separate native Android code (an AppWidgetProvider) — not built yet, since it's a distinct native subsystem from the app itself.
        </div>
      </div>
    </ScreenFrame>
  );
}
