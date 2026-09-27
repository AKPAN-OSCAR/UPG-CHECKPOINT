import React, { useState } from 'react';
import Icon from '../components/Icon.jsx';
import State from '../core/state.js';
import './Setup.css';

const COMMON_TZS = [
  'Africa/Lagos', 'Africa/Cairo', 'Africa/Johannesburg',
  'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney',
];

// New-user "auth questions" — real onboarding steps from the locked-in
// UPG (timezone, theme, time format), never ported into React until
// now. Wrapped in AuthBackground by App.jsx, so the same rotating
// photo background continues through this exact flow.
export default function Setup({ userName, onComplete }) {
  const [step, setStep] = useState(0);
  const [tz, setTz] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Lagos');
  const [theme, setTheme] = useState('green');
  const [timeFmt, setTimeFmt] = useState('24h');

  const finish = () => {
    const u = State.me();
    if (u) { u.tz = tz; u.theme = theme; u.timeFmt = timeFmt; State.saveAll(); }
    onComplete();
  };

  const steps = [
    {
      label: 'Your timezone',
      body: (
        <div className="setup-list">
          {COMMON_TZS.map(z => (
            <button key={z} className={`type-row${tz === z ? ' sel' : ''}`} onClick={() => setTz(z)}>
              <div className="ic"><Icon name="globe" size={16} /></div>
              <div><div className="t">{z.replace('_', ' ')}</div></div>
            </button>
          ))}
        </div>
      ),
    },
    {
      label: 'Pick your accent color',
      body: (
        <div className="swatch-grid">
          {State.THEMES.map(t => (
            <button key={t.id} className={`accent-swatch${theme === t.id ? ' active' : ''}`} style={{ background: t.color }} onClick={() => setTheme(t.id)}>
              {theme === t.id && <Icon name="check" size={14} color="#0A0B0F" />}
            </button>
          ))}
        </div>
      ),
    },
    {
      label: 'Time format',
      body: (
        <div className="fmt-row">
          <button className={`btn-ghost${timeFmt === '24h' ? ' sel' : ''}`} onClick={() => setTimeFmt('24h')}>24-hour</button>
          <button className={`btn-ghost${timeFmt === '12h' ? ' sel' : ''}`} onClick={() => setTimeFmt('12h')}>12-hour</button>
        </div>
      ),
    },
  ];

  const isLast = step === steps.length - 1;

  return (
    <div className="setup-screen">
      <div className="setup-progress">{steps.map((_, i) => <div key={i} className={`dot${i <= step ? ' on' : ''}`} />)}</div>
      <div className="h1" style={{ marginBottom: 6 }}>Hey {userName} 👋</div>
      <div className="muted" style={{ marginBottom: 24 }}>{steps[step].label}</div>
      {steps[step].body}
      <button className="btn-primary" style={{ marginTop: 24 }} onClick={() => isLast ? finish() : setStep(s => s + 1)}>
        {isLast ? "Let's go" : 'Continue'}
      </button>
    </div>
  );
}
