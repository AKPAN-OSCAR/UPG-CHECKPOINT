import React, { useState, useEffect } from 'react';
import { Bell, Mic, Smartphone, Plus, X, Play, ShieldAlert, Volume2 } from 'lucide-react';
import { ScreenFrame } from '../components/ScreenStack.jsx';
import { previewTone } from '../core/alarm-tones.js';
import './AlarmSettings.css';

const MODES = [
  { id: 'ring', label: 'Ring', desc: 'A loud, hard-to-miss alarm tone', Icon: Bell },
  { id: 'speak', label: 'Speak', desc: 'Your guide says your name and task aloud', Icon: Mic },
  { id: 'vibrate', label: 'Vibrate', desc: 'Strong repeated vibration, silent', Icon: Smartphone },
];

export default function AlarmSettings({ alarms, onBack }) {
  const { cfg, saveCfg, testAlarm, addManualTime, removeManualTime, VOICE_PERSONALITIES, ALARM_TONES, deviceSounds, loadDeviceSounds, dndGranted, checkDndBypass, requestDndBypass } = alarms;
  const [newTime, setNewTime] = useState('08:00');

  useEffect(() => { checkDndBypass(); }, []);

  const chooseUpgSound = (tone) => {
    saveCfg({ ringSource: 'upg', ringSoundId: tone.id, ringSoundUri: null, ringSoundTitle: tone.label });
  };
  const chooseDeviceSound = (sound) => {
    saveCfg({ ringSource: 'device', ringSoundUri: sound.uri, ringSoundTitle: sound.title });
  };

  return (
    <ScreenFrame title="Alarms & Reminders" onBack={onBack}>
      <div className="alarm-settings">
        <div className="as-row">
          <span>Enable reminders</span>
          <div className={`toggle${cfg.enabled ? '' : ' off'}`} onClick={() => saveCfg({ enabled: !cfg.enabled })}><i /></div>
        </div>

        {dndGranted === false && (
          <div className="dnd-banner">
            <ShieldAlert size={15} />
            <span>Alarms may be silenced by Do Not Disturb. Grant bypass so nothing gets muted.</span>
            <button onClick={requestDndBypass}>Open Settings</button>
          </div>
        )}

        <div className="as-sub">How should it get your attention?</div>
        <div className="mode-list">
          {MODES.map(m => (
            <button key={m.id} className={`mode-row${cfg.mode === m.id ? ' sel' : ''}`} onClick={() => saveCfg({ mode: m.id })}>
              <div className="mode-ic"><m.Icon size={17} strokeWidth={1.8} /></div>
              <div><div className="t">{m.label}</div><div className="s">{m.desc}</div></div>
            </button>
          ))}
        </div>

        {cfg.mode === 'ring' && (
          <>
            <div className="as-sub">Choose a sound source</div>
            <div className="source-toggle">
              <button className={cfg.ringSource === 'upg' ? 'sel' : ''} onClick={() => saveCfg({ ringSource: 'upg' })}>UPG Sounds</button>
              <button className={cfg.ringSource === 'device' ? 'sel' : ''} onClick={() => { saveCfg({ ringSource: 'device' }); loadDeviceSounds(); }}>Device Sounds</button>
            </div>

            {cfg.ringSource === 'upg' && (
              <div className="sound-grid">
                {ALARM_TONES.map(t => (
                  <div key={t.id} className={`sound-row${cfg.ringSoundId === t.id ? ' sel' : ''}`} onClick={() => chooseUpgSound(t)}>
                    <span>{t.label}</span>
                    <button onClick={(e) => { e.stopPropagation(); previewTone(t.id); }}><Play size={12} /></button>
                  </div>
                ))}
              </div>
            )}

            {cfg.ringSource === 'device' && (
              <div className="sound-grid">
                {deviceSounds.length === 0 && <div className="empty-note">No device sounds found yet — this loads from your phone's alarm sound list once running as a real app.</div>}
                {deviceSounds.map((s, i) => (
                  <div key={i} className={`sound-row${cfg.ringSoundUri === s.uri ? ' sel' : ''}`} onClick={() => chooseDeviceSound(s)}>
                    <span>{s.title}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="current-sound"><Volume2 size={13} /> Current: {cfg.ringSoundTitle}</div>
          </>
        )}

        {cfg.mode === 'speak' && (
          <>
            <div className="as-sub">Voice</div>
            <div className="pill-toggle">
              <button className={cfg.voiceGender === 'female' ? 'sel' : ''} onClick={() => saveCfg({ voiceGender: 'female' })}>Female</button>
              <button className={cfg.voiceGender === 'male' ? 'sel' : ''} onClick={() => saveCfg({ voiceGender: 'male' })}>Male</button>
            </div>
            <div className="as-sub">Style</div>
            <div className="pill-toggle three">
              <button className={cfg.voiceStyle === 'arrogant' ? 'sel' : ''} onClick={() => saveCfg({ voiceStyle: 'arrogant' })}>Arrogant</button>
              <button className={cfg.voiceStyle === 'friendly' ? 'sel' : ''} onClick={() => saveCfg({ voiceStyle: 'friendly' })}>Friendly</button>
              <button className={cfg.voiceStyle === 'normal' ? 'sel' : ''} onClick={() => saveCfg({ voiceStyle: 'normal' })}>Normal</button>
            </div>
          </>
        )}

        <button className="test-btn" onClick={testAlarm}><Play size={13} strokeWidth={2} />Test this alert</button>

        <div className="as-sub" style={{ marginTop: 18 }}>Auto-detect</div>
        <div className="as-row">
          <span>Alert me if I'm falling behind</span>
          <div className={`toggle${cfg.autoDetect ? '' : ' off'}`} onClick={() => saveCfg({ autoDetect: !cfg.autoDetect })}><i /></div>
        </div>

        <div className="as-sub" style={{ marginTop: 18 }}>Manual times</div>
        {cfg.manualTimes.map(t => (
          <div className="time-row" key={t}>
            <span>{t}</span>
            <button onClick={() => removeManualTime(t)}><X size={14} /></button>
          </div>
        ))}
        <div className="add-time-row">
          <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} />
          <button onClick={() => addManualTime(newTime)}><Plus size={14} />Add</button>
        </div>

        <div className="honest-note">
          Each table block you set a start/end time for automatically gets this same alert treatment — 5 alerts at start time, repeating every 5 minutes until you mark it done, escalating again at end time. This runs reliably while UPG is open. Making it this aggressive while the app is fully closed needs a further native step — noted plainly, not hidden.
        </div>
      </div>
    </ScreenFrame>
  );
}
