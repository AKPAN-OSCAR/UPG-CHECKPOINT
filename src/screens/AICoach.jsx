import React, { useState } from 'react';
import Icon from '../components/Icon.jsx';
import './AICoach.css';

export default function AICoach({ coach }) {
  const [text, setText] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    coach.send(text.trim());
    setText('');
  };

  return (
    <div className="chat-screen">
      <div className="chat-hd">
        <div className="coach-avatar"><Icon name="compass" size={15} color="#2A1200" /></div>
        <div><div className="h2">Your Guide</div><div className="muted status-dot">● Listening</div></div>
      </div>
      <div className="chat-body">
        {coach.messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role === 'coach' ? 'ai' : 'user'}`}>
            {m.content || (coach.thinking && i === coach.messages.length - 1 ? '…' : '')}
          </div>
        ))}
        {coach.error === 'not_configured' && (
          <div className="bubble ai error-bubble">
            The AI backend isn't deployed yet — this is a real error, not a fallback pretending to be smart.
          </div>
        )}
      </div>
      <form className="chat-input" onSubmit={submit}>
        <input placeholder="Tell your guide what's up..." value={text} onChange={e => setText(e.target.value)} />
        <button type="submit"><Icon name="arrowup" size={16} /></button>
      </form>
    </div>
  );
}
