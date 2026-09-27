import { useState, useCallback } from 'react';
import Theme from '../core/theme.js';

// Thin React wrapper around Theme (core/theme.js) — the actual
// persistence logic lives there and is framework-agnostic; this hook
// just gives components a re-render when the mode changes.
export default function useTheme() {
  const [mode, setMode] = useState(Theme.current());

  const toggle = useCallback(() => {
    setMode(Theme.toggle());
  }, []);

  const set = useCallback((next) => {
    Theme.set(next);
    setMode(next);
  }, []);

  return { mode, toggle, set };
}
