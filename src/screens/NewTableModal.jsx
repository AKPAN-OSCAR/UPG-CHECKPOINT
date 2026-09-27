import React, { useState } from 'react';
import { Calendar, TrendingUp, Slash, X } from 'lucide-react';
import './NewTableModal.css';

const TYPES = [
  { id: 'timetable', label: 'Daily Timetable', desc: 'Track blocks throughout your day', Icon: Calendar },
  { id: 'build', label: 'Build a Habit', desc: 'Track a streak of doing something', Icon: TrendingUp },
  { id: 'stop', label: 'Break a Habit', desc: 'Track a streak of avoiding something', Icon: Slash },
];

export default function NewTableModal({ upg, onClose, onCreated }) {
  const [step, setStep] = useState('type');
  const [type, setType] = useState(null);
  const [schedType, setSchedType] = useState('default');
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');

  const pickType = (id) => {
    setType(id);
    setStep(id === 'timetable' ? 'schedType' : 'details');
  };

  const submit = () => {
    if (!name.trim()) return;
    const table = upg.createTable(name.trim(), type, schedType, goal.trim());
    onCreated(table);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-hd"><span>New table</span><button onClick={onClose}><X size={18} /></button></div>

        {step === 'type' && (
          <div className="type-list">
            {TYPES.map(t => (
              <button key={t.id} className="type-row" onClick={() => pickType(t.id)}>
                <div className="type-ic"><t.Icon size={18} strokeWidth={1.8} /></div>
                <div><div className="t">{t.label}</div><div className="s">{t.desc}</div></div>
              </button>
            ))}
          </div>
        )}

        {step === 'schedType' && (
          <div className="type-list">
            <button className={`type-row${schedType === 'default' ? ' sel' : ''}`} onClick={() => setSchedType('default')}>
              <div className="type-ic"><Calendar size={18} strokeWidth={1.8} /></div>
              <div><div className="t">Use default schedule</div><div className="s">Pre-filled with a starter daily routine</div></div>
            </button>
            <button className={`type-row${schedType === 'custom' ? ' sel' : ''}`} onClick={() => setSchedType('custom')}>
              <div className="type-ic"><Slash size={18} strokeWidth={1.8} /></div>
              <div><div className="t">Start empty</div><div className="s">Add your own blocks from scratch</div></div>
            </button>
            <button className="btn-gold" style={{ marginTop: 10 }} onClick={() => setStep('details')}>Next</button>
          </div>
        )}

        {step === 'details' && (
          <div className="details-form">
            <input className="field" placeholder="Table name" value={name} onChange={e => setName(e.target.value)} autoFocus />
            <input className="field" placeholder="Goal (optional)" value={goal} onChange={e => setGoal(e.target.value)} />
            <button className="btn-gold" onClick={submit} disabled={!name.trim()}>Create table</button>
          </div>
        )}
      </div>
    </div>
  );
}
