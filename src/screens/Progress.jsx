import React from 'react';
import { Flame } from 'lucide-react';
import './Progress.css';

export default function Progress({ upg }) {
  const badges = upg.badges; // [{id, icon, name, desc, earned, earnedAt}, ...] — real BADGE_DEFS, real earned state
  const earnedCount = badges.filter(b => b.earned).length;

  return (
    <div className="prog-screen">
      <div className="streak-card">
        <div className="l">CONSISTENCY SCORE</div>
        <div className="num"><Flame size={22} color="var(--gold)" />{upg.consistencyScore}<span>%</span></div>
        <div className="sub">Average completion across your active days</div>
      </div>

      <div className="tb-sub" style={{ marginBottom: 10 }}>Badges · {earnedCount} of {badges.length}</div>
      <div className="badge-grid">
        {badges.map(b => (
          <div className={`badge${b.earned ? '' : ' locked'}`} key={b.id}>
            <div className="ic">{b.icon}</div>
            <div className="t">{b.name}</div>
            <div className="d">{b.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
