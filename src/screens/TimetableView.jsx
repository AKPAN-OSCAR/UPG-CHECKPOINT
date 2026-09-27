import React, { useState } from 'react';
import { Plus, Check, X as XIcon, MoreVertical } from 'lucide-react';
import { ScreenFrame } from '../components/ScreenStack.jsx';
import './TimetableView.css';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function TimetableView({ upg, table, onBack, onAddBlock }) {
  const today = upg.TZ.getTodayWkDay(table);
  const [wk, setWk] = useState(today.wk);
  const [dy, setDy] = useState(today.dy);

  const blocks = upg.blocks[table.id] || [];
  const dayState = ((upg.schedState[table.id] || {})[wk] || {})[dy] || new Array(blocks.length).fill(0);

  const cycle = (i) => upg.cycleBlockState(table.id, wk, dy, i);

  const stateIcon = (s) => s === 1 ? <Check size={13} strokeWidth={2.4} /> : s === 2 ? <XIcon size={13} strokeWidth={2.4} /> : null;
  const stateClass = (s) => s === 1 ? 'done' : s === 2 ? 'missed' : '';

  return (
    <ScreenFrame title={table.name} onBack={onBack}>
      <div className="tt-view">
        <div className="week-strip">
          {[Math.max(0, wk - 1), wk, wk + 1].map(w => (
            <button key={w} className={`week-chip${w === wk ? ' sel' : ''}`} onClick={() => setWk(w)} disabled={w < 0}>WK {w + 1}</button>
          ))}
        </div>
        <div className="day-strip">
          {DAY_LABELS.map((d, i) => (
            <button key={i} className={`day-chip${i === dy ? ' sel' : ''}`} onClick={() => setDy(i)}>{d}</button>
          ))}
        </div>

        <div className="block-list">
          {blocks.length === 0 && <div className="empty-note">No blocks yet — add your first one below.</div>}
          {blocks.map((b, i) => (
            <div className={`block-item ${stateClass(dayState[i])}`} key={b.id} onClick={() => cycle(i)}>
              <div className={`prio-dot`} style={{ background: upg.PRIORITIES[b.priority]?.color }} />
              <div className="block-item__body">
                <div className="t">{b.label}</div>
                <div className="s">{upg.TZ.formatBlockTime ? upg.TZ.formatBlockTime(b.start) : b.start} – {upg.TZ.formatBlockTime ? upg.TZ.formatBlockTime(b.end) : b.end}{b.tag ? ` · ${b.tag}` : ''}</div>
              </div>
              <div className={`state-icon ${stateClass(dayState[i])}`}>{stateIcon(dayState[i])}</div>
            </div>
          ))}
        </div>

        <button className="add-block-btn" onClick={onAddBlock}><Plus size={15} />Add block</button>
      </div>
    </ScreenFrame>
  );
}
