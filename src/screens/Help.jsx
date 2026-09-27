import React from 'react';
import { ScreenFrame } from '../components/ScreenStack.jsx';

const FAQ = [
  { q: 'What\'s the difference between a Timetable and a Habit table?', a: 'A Timetable is a fixed list of blocks you repeat every day, checked off one by one. A Habit table (Build or Break) tracks a single daily streak instead — no blocks, just a calendar grid.' },
  { q: 'Why did my alarm not fire?', a: 'Reminders need to be enabled in Alarms & Reminders, and the app needs notification/alarm permissions granted on your device. Do Not Disturb can also silence alarms unless bypass is granted.' },
  { q: 'Can I use UPG without an account?', a: 'Yes — choose Guest on the sign-in screen. Guest data stays on this device only and won\'t follow you to a new phone.' },
  { q: 'How is my consistency score calculated?', a: 'It\'s the average completion percentage across every day you actually interacted with a timetable — days you never opened the app aren\'t counted against you.' },
];

export default function Help({ onBack }) {
  return (
    <ScreenFrame title="Help & Support" onBack={onBack}>
      <div className="screen-root px" style={{ paddingTop: 16 }}>
        {FAQ.map((f, i) => (
          <div className="card" style={{ marginBottom: 10 }} key={i}>
            <div className="h2" style={{ fontSize: 13.5 }}>{f.q}</div>
            <div className="muted" style={{ marginTop: 6, lineHeight: 1.5 }}>{f.a}</div>
          </div>
        ))}
      </div>
    </ScreenFrame>
  );
}
