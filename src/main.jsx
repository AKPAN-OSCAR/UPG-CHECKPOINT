import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { initializeApp } from 'firebase/app';
import Theme from './core/theme.js';
import './styles/tokens.css';
import './styles/components.css';

// This is ONLY for browser/dev-server preview (`npm run dev`).
// @capacitor-firebase/authentication auto-detects the platform: on a
// real compiled APK it runs actual native Android code and never
// touches this. In a plain browser tab (no native bridge available),
// it falls back to its own web implementation, which calls the npm
// `firebase` package's getAuth() — a completely separate module
// instance from the CDN-loaded SDK the rest of the app uses in
// core/firebase-init.js. Without this, that fallback throws
// immediately on load, which breaks `npm run dev` even though the
// real native build is unaffected. Same project, same config, just
// registered with the npm SDK too so both code paths have what they
// need in whichever context they're actually running.
initializeApp({
  apiKey: 'AIzaSyBS66iLXQ5FdSllKJqbWA7ViR80P2VfmwA',
  authDomain: 'ur-personal-plan-guide.firebaseapp.com',
  databaseURL: 'https://ur-personal-plan-guide-default-rtdb.firebaseio.com',
  projectId: 'ur-personal-plan-guide',
  storageBucket: 'ur-personal-plan-guide.firebasestorage.app',
  messagingSenderId: '529744661379',
  appId: '1:529744661379:web:2cad2416cf373479c504b6',
});

// Applied BEFORE the first React render so there's no flash of the
// wrong theme on load — same reasoning as Theme.init()'s own comment.
Theme.init();

// During local dev, ensure any previously-registered service workers
// and caches are removed so the Vite dev server shows the current bundle.
if (import.meta.env.DEV && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then(regs => regs.forEach(r => r.unregister()))
    .catch(() => {});
  if (typeof caches !== 'undefined') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).catch(() => {});
  }
}

// Global error handlers to make runtime failures visible in the dev page.
const showErrorUI = (msg, stack) => {
  try {
    document.body.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'color:#fff;background:#111;padding:24px;font-family:system-ui,Segoe UI,Roboto,Arial;border-radius:8px;margin:40px;';
    wrap.innerHTML = `<h2 style="margin:0 0 8px">App failed to start</h2><div style="font-size:14px;margin-bottom:8px">${String(msg)}</div><pre style="white-space:pre-wrap;color:#f88;font-size:12px">${String(stack||'')}</pre>`;
    document.body.appendChild(wrap);
  } catch (e) { console.error('Could not render error UI', e); }
};

window.addEventListener('error', (ev) => {
  console.error('[window:error]', ev.error || ev.message, ev);
  showErrorUI(ev.message || String(ev.error || 'Unknown error'), ev.error?.stack || '');
});
window.addEventListener('unhandledrejection', (ev) => {
  console.error('[unhandledrejection]', ev.reason);
  showErrorUI(ev.reason?.message || String(ev.reason), ev.reason?.stack || '');
});

const mountNode = document.getElementById('root') || (() => {
  const d = document.createElement('div'); d.id = 'root'; document.body.appendChild(d); return d;
})();

try {
  createRoot(mountNode).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (e) {
  console.error('[render] error', e);
  showErrorUI(e.message || String(e), e.stack || '');
}
