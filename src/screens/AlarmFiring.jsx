import React from 'react';
import { Flame } from 'lucide-react';
import './AlarmFiring.css';

export default function AlarmFiring({ blockName, message, onDone, onSnooze }) {
  return (
    <div className="alarm-fire-screen">
      <div className="fire-pulse"><Flame size={40} strokeWidth={1.8} /></div>
      <div className="fire-title">{blockName}</div>
      <div className="fire-sub">"{message}"</div>
      <div className="fire-actions">
        <button className="fire-btn done" onClick={onDone}>Mark as done</button>
        <button className="fire-btn snooze" onClick={onSnooze}>Snooze 10 min</button>
      </div>
    </div>
  );
}
