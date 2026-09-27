/* ═══════════════════════════════════════
   UPG — THEME
   Light/Dark appearance, saved automatically (per the Menu → Appearance
   toggle in the v2 design). Default-saved means: once a user picks a
   mode, it persists across app restarts with zero extra action from
   them — this module IS that persistence, not just the toggle UI.

   Resolution order for the FIRST-EVER launch (no saved preference yet):
     1. Device's system light/dark setting (prefers-color-scheme)
     2. Falls back to 'dark' if the browser/webview can't report it
   After that first launch, whatever the user explicitly picks always
   wins — we never silently override a deliberate choice.
═══════════════════════════════════════ */
import Storage from './storage.js';

const Theme = (() => {
  const KEY = 'theme_mode'; // Storage.get/set (device-level, not per-uid —
                             // appearance is a device preference, same as
                             // how a phone's own OS dark mode works)
  const VALID = ['dark', 'light'];

  const _systemPrefersDark = () => {
    try {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (e) { return true; } // safest default if matchMedia is unavailable
  };

  const getSaved = () => {
    const saved = Storage.get(KEY);
    return VALID.includes(saved) ? saved : null;
  };

  const resolveInitial = () => getSaved() || (_systemPrefersDark() ? 'dark' : 'light');

  const _apply = (mode) => {
    document.documentElement.setAttribute('data-theme', mode);
    // Lets the OS status bar / native chrome (Capacitor) tint correctly
    // to match, rather than staying stuck on one color regardless of theme.
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', mode === 'dark' ? '#11162A' : '#F7F5F0');
  };

  const set = (mode) => {
    if (!VALID.includes(mode)) return false;
    Storage.set(KEY, mode);
    _apply(mode);
    return true;
  };

  const toggle = () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    set(next);
    return next;
  };

  const current = () => document.documentElement.getAttribute('data-theme') || resolveInitial();

  // Call once at boot, before first paint if possible, to avoid a
  // flash-of-wrong-theme on load.
  const init = () => {
    _apply(resolveInitial());
  };

  return { init, set, toggle, current, getSaved };
})();

export default Theme;
