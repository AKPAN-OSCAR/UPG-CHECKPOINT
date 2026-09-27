import React, { useState } from 'react';
import { Plus, Check } from 'lucide-react';
import { ScreenFrame } from '../components/ScreenStack.jsx';
import './GoalsScreen.css';

const AREAS = ['Health', 'Career', 'Learning', 'Finance', 'Relationships', 'Personal'];

export default function GoalsScreen({ goalsApi, onBack }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [area, setArea] = useState(AREAS[0]);

  const submit = () => {
    if (!title.trim()) return;
    goalsApi.addGoal({ title: title.trim(), area, milestones: [] });
    setTitle(''); setAdding(false);
  };

  return (
    <ScreenFrame title="Goals" onBack={onBack}>
      <div className="goals-screen">
        {goalsApi.goals.length === 0 && !adding && <div className="empty-note">No goals yet — set your first one.</div>}
        {goalsApi.goals.map(g => {
          const pct = g.milestones.length ? Math.round(g.milestones.filter(m => m.done).length / g.milestones.length * 100) : 0;
          return (
            <div className="goal-card" key={g.id}>
              <div className="goal-top"><div className="goal-name">{g.title}</div><div className="goal-area">{g.area}</div></div>
              <div className="goal-bar-track"><div className="goal-bar-fill" style={{ width: `${pct}%` }} /></div>
              <div className="goal-meta">{g.milestones.length ? `${pct}% of milestones` : 'No milestones yet'}</div>
            </div>
          );
        })}

        {adding ? (
          <div className="add-goal-form">
            <input className="field" placeholder="Goal title" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
            <div className="area-row">{AREAS.map(a => <button key={a} className={`area-chip${area === a ? ' sel' : ''}`} onClick={() => setArea(a)}>{a}</button>)}</div>
            <button className="btn-gold" onClick={submit} disabled={!title.trim()}>Create goal</button>
          </div>
        ) : (
          <button className="add-block-row" onClick={() => setAdding(true)}><Plus size={15} />New goal</button>
        )}
      </div>
    </ScreenFrame>
  );
}
