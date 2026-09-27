import React, { useState, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import './ScreenStack.css';

// A minimal push/pop stack: root tab screens live at depth 0 (no back
// arrow, bottom nav visible); anything pushed on top gets a back arrow
// and a slide-in transition, and hides the bottom nav while active —
// exactly the "other features open full screen with an animated back
// arrow" behavior that was asked for.
export function useScreenStack(rootScreen) {
  const [stack, setStack] = useState([{ key: rootScreen, props: {} }]);

  const push = useCallback((key, props = {}) => {
    setStack(s => [...s, { key, props }]);
  }, []);

  const pop = useCallback(() => {
    setStack(s => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  const replaceRoot = useCallback((key) => {
    setStack([{ key, props: {} }]);
  }, []);

  return { stack, push, pop, replaceRoot, atRoot: stack.length === 1 };
}

export function ScreenFrame({ title, onBack, children }) {
  return (
    <div className="screen-frame">
      <div className="screen-frame__hd">
        <button className="screen-frame__back" onClick={onBack} aria-label="Back">
          <ArrowLeft size={19} strokeWidth={2} />
        </button>
        <div className="screen-frame__title">{title}</div>
        <div style={{ width: 34 }} /> {/* balances the back button so the title stays centered */}
      </div>
      <div className="screen-frame__body">{children}</div>
    </div>
  );
}
