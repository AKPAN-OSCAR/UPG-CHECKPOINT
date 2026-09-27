import React, { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { ScreenFrame } from '../components/ScreenStack.jsx';
import './ManageTables.css';

export default function ManageTables({ upg, onBack }) {
  const [openMenuFor, setOpenMenuFor] = useState(null);
  const [editing, setEditing] = useState(null);

  const startEdit = (t) => { setEditing({ id: t.id, name: t.name, goal: t.goal || '' }); setOpenMenuFor(null); };
  const saveEdit = () => { upg.editTable(editing.id, { name: editing.name, goal: editing.goal }); setEditing(null); };

  return (
    <ScreenFrame title="Manage Tables" onBack={onBack}>
      <div className="screen-root px" style={{ paddingTop: 16 }}>
        {upg.tables.length === 0 && <div className="empty-note">No tables yet.</div>}
        {upg.tables.map(t => (
          <div className="card" style={{ marginBottom: 10 }} key={t.id}>
            {editing?.id === t.id ? (
              <div>
                <input className="field" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Name" />
                <input className="field" value={editing.goal} onChange={e => setEditing({ ...editing, goal: e.target.value })} placeholder="Goal (optional)" />
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setEditing(null)}>Cancel</button>
                  <button className="btn-primary" style={{ flex: 1 }} onClick={saveEdit}>Save</button>
                </div>
              </div>
            ) : (
              <div className="row">
                <div>
                  <div className="h2">{t.name}{t.archived && <span className="pill pill-muted" style={{ marginLeft: 8 }}>ARCHIVED</span>}</div>
                  <div className="muted" style={{ marginTop: 2 }}>{t.type === 'timetable' ? 'Timetable' : t.type === 'build' ? 'Building habit' : 'Breaking habit'}</div>
                </div>
                <button className="icon-btn" onClick={() => setOpenMenuFor(openMenuFor === t.id ? null : t.id)}><Icon name="kebab" size={16} /></button>
              </div>
            )}
            {openMenuFor === t.id && (
              <div className="kebab-menu">
                <div className="action-row" onClick={() => startEdit(t)}><Icon name="edit" size={15} /><span className="t">Edit</span></div>
                <div className="action-row" onClick={() => { upg.archiveTable(t.id); setOpenMenuFor(null); }}><Icon name="archive" size={15} /><span className="t">{t.archived ? 'Unarchive' : 'Archive'}</span></div>
                <div className="action-row" onClick={() => { if (confirm(`Delete "${t.name}"? This cannot be undone.`)) upg.deleteTable(t.id); setOpenMenuFor(null); }} style={{ color: 'var(--rose)' }}><Icon name="trash" size={15} color="var(--rose)" /><span className="t">Delete</span></div>
              </div>
            )}
          </div>
        ))}
      </div>
    </ScreenFrame>
  );
}
