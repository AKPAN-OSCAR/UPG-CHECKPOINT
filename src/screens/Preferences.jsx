import React, { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { ScreenFrame } from '../components/ScreenStack.jsx';
import State from '../core/state.js';

const COMMON_TZS = ['Africa/Lagos', 'Africa/Cairo', 'Africa/Johannesburg', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney'];

export default function Preferences({ onBack }) {
  const u = State.me();
  const [tz, setTz] = useState(u?.tz || 'Africa/Lagos');
  const [theme, setTheme] = useState(u?.theme || 'green');
  const [timeFmt, setTimeFmt] = useState(u?.timeFmt || '24h');

  const save = (patch) => {
    if (u) { Object.assign(u, patch); State.saveAll(); }
  };

  return (
    <ScreenFrame title="Preferences" onBack={onBack}>
      <div className="screen-root px" style={{ paddingTop: 16 }}>
        <div className="sec-lbl">Time format</div>
        <div className="row" style={{ gap: 8 }}>
          <button className={`btn-ghost${timeFmt === '24h' ? ' sel' : ''}`} style={{ flex: 1 }} onClick={() => { setTimeFmt('24h'); save({ timeFmt: '24h' }); }}>24-hour</button>
          <button className={`btn-ghost${timeFmt === '12h' ? ' sel' : ''}`} style={{ flex: 1 }} onClick={() => { setTimeFmt('12h'); save({ timeFmt: '12h' }); }}>12-hour</button>
        </div>

        <div className="sec-lbl">Accent color</div>
        <div className="swatch-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14 }}>
          {State.THEMES.map(t => (
            <button key={t.id} className={`accent-swatch${theme === t.id ? ' active' : ''}`} style={{ background: t.color }} onClick={() => { setTheme(t.id); save({ theme: t.id }); }}>
              {theme === t.id && <Icon name="check" size={14} color="#0A0B0F" />}
            </button>
          ))}
        </div>

        <div className="sec-lbl">Timezone</div>
        <div style={{ maxHeight: 260, overflowY: 'auto' }}>
          {COMMON_TZS.map(z => (
            <button key={z} className={`type-row${tz === z ? ' sel' : ''}`} onClick={() => { setTz(z); save({ tz: z }); }}>
              <div className="ic"><Icon name="globe" size={16} /></div>
              <div><div className="t">{z.replace('_', ' ')}</div></div>
            </button>
          ))}
        </div>
      </div>
    </ScreenFrame>
  );
}
