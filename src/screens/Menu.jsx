import React from 'react';
import Icon from '../components/Icon.jsx';
import './Menu.css';

const ROWS = [
  { key: 'managetables', icon: 'layers',   t: 'Manage Tables',      s: 'Edit, archive, delete' },
  { key: 'goals',        icon: 'target',   t: 'Goals',              s: 'Long-term targets' },
  { key: 'history',      icon: 'barchart', t: 'History',            s: 'Weekly summaries & streaks' },
  { key: 'alarms',       icon: 'bellring', t: 'Alarms & Reminders', s: 'Ring · Speak · Vibrate' },
  { key: 'widget',       icon: 'grid',     t: 'Home Screen Widget', s: 'Preview & customize' },
  { key: 'account',      icon: 'shield',   t: 'Account & Security', s: 'Sign-in, sign out' },
  { key: 'preferences',  icon: 'sun',      t: 'Preferences',        s: 'Timezone, accent color' },
  { key: 'sync',         icon: 'refresh',  t: 'Data & Sync',        s: 'Backup, export' },
  { key: 'help',         icon: 'help',     t: 'Help & Support' },
];

export default function Menu({ theme, onClose, onNavigate }) {
  return (
    <div className="screen-root px" style={{ paddingTop: 20 }}>
      <div className="row" style={{ marginBottom: 18 }}>
        <div className="h1">Menu</div>
        <button className="icon-btn" onClick={onClose}><Icon name="x" size={16} /></button>
      </div>

      {ROWS.map(r => (
        <div className="card menu-row" key={r.key} onClick={() => onNavigate(r.key)}>
          <div className="menu-ic"><Icon name={r.icon} size={16} color="var(--ember-1)" /></div>
          <div style={{ flex: 1 }}><div className="h2" style={{ fontSize: 13 }}>{r.t}</div>{r.s && <div className="muted" style={{ marginTop: 2 }}>{r.s}</div>}</div>
          <Icon name="chevright" size={16} color="var(--text-3)" />
        </div>
      ))}

      <div className="card menu-row" style={{ cursor: 'default' }}>
        <div className="menu-ic"><Icon name="sun" size={16} color="var(--ember-1)" /></div>
        <div style={{ flex: 1 }}>
          <div className="h2" style={{ fontSize: 13 }}>Appearance</div>
          <div className="muted" style={{ marginTop: 2 }}>Dark mode only, for now</div>
        </div>
      </div>
    </div>
  );
}
