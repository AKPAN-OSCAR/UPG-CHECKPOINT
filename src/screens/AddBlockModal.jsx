import React, { useState } from 'react';
import { X } from 'lucide-react';
import './NewTableModal.css';

export default function AddBlockModal({ upg, table, onClose }) {
  const [label, setLabel] = useState('');
  const [tag, setTag] = useState('');
  const [start, setStart] = useState('07:00');
  const [end, setEnd] = useState('07:30');
  const [priority, setPriority] = useState('normal');

  const priorities = Object.entries(upg.PRIORITIES); // [id, {label,color,weight,desc}]

  const submit = () => {
    if (!label.trim()) return;
    upg.addBlock(table.id, { label: label.trim(), tag: tag.trim(), start, end, priority });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-hd"><span>Add block</span><button onClick={onClose}><X size={18} /></button></div>
        <div className="details-form">
          <input className="field" placeholder="Block name" value={label} onChange={e => setLabel(e.target.value)} autoFocus />
          <input className="field" placeholder="Tag (optional)" value={tag} onChange={e => setTag(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="field" style={{ flex: 1 }} type="time" value={start} onChange={e => setStart(e.target.value)} />
            <input className="field" style={{ flex: 1 }} type="time" value={end} onChange={e => setEnd(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {priorities.map(([id, p]) => (
              <button key={id}
                onClick={() => setPriority(id)}
                style={{
                  fontSize: 10.5, padding: '7px 11px', borderRadius: 8,
                  background: priority === id ? p.color + '30' : 'var(--card)',
                  border: `1px solid ${priority === id ? p.color : 'var(--hair)'}`,
                  color: priority === id ? p.color : 'var(--text-2)',
                }}>
                {p.label}
              </button>
            ))}
          </div>
          <button className="btn-gold" onClick={submit} disabled={!label.trim()}>Add block</button>
        </div>
      </div>
    </div>
  );
}
