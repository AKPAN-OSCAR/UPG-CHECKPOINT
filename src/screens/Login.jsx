import React, { useState } from 'react';
import Icon from '../components/Icon.jsx';
import './Login.css';

export default function Login({ auth }) {
  const [mode, setMode] = useState('signin'); // signin | signup | phone-number | phone-code
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (mode === 'signup') return auth.signUpEmail(name, email, password);
    return auth.signInEmail(email, password);
  };

  const submitPhone = async (e) => {
    e.preventDefault();
    if (mode === 'phone-number') {
      const res = await auth.startPhoneSignIn(phone);
      if (res.ok) setMode('phone-code');
    } else {
      await auth.confirmPhoneCode(code);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-mark"><Icon name="compass" size={20} color="#2A1200" /></div>
        <div className="h1">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</div>
        <div className="muted" style={{ margin: '6px 0 22px' }}>Your guide remembers where you left off. Sign in to pick up your streak.</div>

        {(mode === 'signin' || mode === 'signup') && (
          <form onSubmit={submit}>
            {mode === 'signup' && (
              <input className="field" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
            )}
            <input className="field" type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="field" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {auth.error && <div className="login-error">{auth.error}</div>}
            <button className="btn-primary" type="submit" disabled={auth.status === 'loading'}>
              {auth.status === 'loading' ? 'Please wait…' : 'Continue'}
            </button>
            <div className="switch-mode" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
              {mode === 'signup' ? 'Already have an account? Sign in' : "New here? Create an account"}
            </div>
          </form>
        )}

        {mode.startsWith('phone') && (
          <form onSubmit={submitPhone}>
            {mode === 'phone-number' ? (
              <input className="field" placeholder="+2348012345678" value={phone} onChange={(e) => setPhone(e.target.value)} />
            ) : (
              <input className="field" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} />
            )}
            {auth.error && <div className="login-error">{auth.error}</div>}
            <button className="btn-primary" type="submit" disabled={auth.status === 'loading'}>
              {mode === 'phone-number' ? 'Send code' : 'Verify'}
            </button>
          </form>
        )}

        {mode === 'signin' && (
          <>
            <div className="divider-row"><div className="line" /><span>or continue with</span><div className="line" /></div>
            <div className="social-row">
              <button className="btn-ghost" onClick={() => auth.signInWithGoogle()}><Icon name="globe" size={15} />Google</button>
              <button className="btn-ghost" onClick={() => setMode('phone-number')}><Icon name="mic" size={15} />Phone</button>
              <button className="btn-ghost" onClick={() => auth.createGuest('Guest', ['12345', '67890'])}><Icon name="target" size={15} />Guest</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
