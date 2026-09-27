import React from 'react';
import Icon from '../components/Icon.jsx';
import { ScreenFrame } from '../components/ScreenStack.jsx';
import State from '../core/state.js';

export default function Account({ auth, onBack }) {
  const u = State.me();
  return (
    <ScreenFrame title="Account & Security" onBack={onBack}>
      <div className="screen-root px" style={{ paddingTop: 16 }}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="h2">{u?.name || auth.user?.name}</div>
          <div className="muted" style={{ marginTop: 4 }}>{u?.email || 'Guest account'}</div>
          <div className="muted" style={{ marginTop: 2, fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>{auth.user?.uid}</div>
        </div>
        <button className="btn-danger" style={{ width: '100%' }} onClick={auth.signOut}>
          <Icon name="logout" size={15} />Sign out
        </button>
      </div>
    </ScreenFrame>
  );
}
