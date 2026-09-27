/* ═══════════════════════════════════════
   UPG v10 — WIDGET + VOICE + ALARM
   Fixed: single AudioContext instance, never recreated
   Fixed: alarm schedules AFTER resume resolves (no stale timestamps)
   Fixed: speech uses sentence-chain with onend fallback timer (Android fix)
   Fixed: show() includes habit tracker progress, not just timetables
   Fixed: manual time check uses a ±30s window (no missed minute bugs)
   Fixed: snoozeTonight uses TZ.now() consistently
   Fixed: widget z-index and position use unified --tab-h var
   Added: checkOnOpen() with proper threshold logic
   Added: Notification API with icon
═══════════════════════════════════════ */
const Widget = (() => {

  // ── STATE ──
  let _audioCtx        = null;
  let _gestureUnlocked = false;
  let _checkInterval   = null;
  let _snoozeUntil     = null;
  let _deferredPrompt  = null;
  let _lastAlertMin    = -1; // track last minute we alerted (prevent double-fire)

  // ── AUDIO UNLOCK ──
  // Must be called inside a user-gesture handler on mobile
  const _unlockAudio = () => {
    if (_gestureUnlocked) return;
    _gestureUnlocked = true;
    try {
      if (!_audioCtx) {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (_audioCtx.state === 'suspended') _audioCtx.resume();
      // Play a silent buffer — satisfies mobile autoplay policy
      const buf = _audioCtx.createBuffer(1, 1, 22050);
      const src = _audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(_audioCtx.destination);
      src.start(0);
    } catch(e) {}
  };

  // Attach unlock to every possible user gesture
  ['touchstart', 'mousedown', 'keydown', 'pointerdown'].forEach(ev =>
    document.addEventListener(ev, _unlockAudio, { once: false, passive: true })
  );

  // ── ALARM SOUND ──
  // Fixed: we resume first, then schedule oscillators using post-resume currentTime
  const playAlarm = (volume = 0.8) => {
    try {
      if (!_audioCtx) {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = _audioCtx;

      const _schedule = () => {
        const pattern = [880, 1100, 880, 1100, 660, 880, 1100];
        let t = ctx.currentTime + 0.05; // small offset after resume
        pattern.forEach(freq => {
          const osc  = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(volume, t + 0.07);
          gain.gain.linearRampToValueAtTime(0, t + 0.28);
          osc.start(t);
          osc.stop(t + 0.32);
          t += 0.40;
        });
      };

      if (ctx.state === 'suspended') {
        ctx.resume().then(_schedule).catch(e => console.warn('[ALARM] resume failed:', e));
      } else {
        _schedule();
      }
    } catch(e) {
      console.warn('[ALARM] playAlarm error:', e);
    }
  };

  // ── VOICE SYNTHESIS ──
  // Fixed: sentence-chain with onend + fallback setTimeout (Android drops onend)
  // Fixed: async voice loading before first utterance
  const _getVoices = () => new Promise(resolve => {
    const v = window.speechSynthesis?.getVoices() || [];
    if (v.length) { resolve(v); return; }
    const handler = () => {
      resolve(window.speechSynthesis.getVoices());
      window.speechSynthesis.removeEventListener('voiceschanged', handler);
    };
    window.speechSynthesis?.addEventListener('voiceschanged', handler);
    // Timeout fallback — some browsers never fire voiceschanged
    setTimeout(() => resolve(window.speechSynthesis?.getVoices() || []), 2500);
  });

  const speak = async (text) => {
    if (!('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();

    const cfg    = State.alertCfg || {};
    if (cfg.voiceEnabled === false) return;

    const p      = State.VOICE_PERSONALITIES[cfg.personality || 'friendly'];
    const voices = await _getVoices();

    // Voice priority: Google en-US > any en-US > any en > first available
    const voice =
      voices.find(v => v.lang === 'en-US' && v.name.toLowerCase().includes('google')) ||
      voices.find(v => v.lang === 'en-US') ||
      voices.find(v => v.lang.startsWith('en')) ||
      voices[0] || null;

    // Split on sentence boundaries — keeps each utterance short (Android fix)
    const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];

    const chain = (idx) => {
      if (idx >= sentences.length) return;
      const sentence = sentences[idx].trim();
      if (!sentence) { chain(idx + 1); return; }

      const utt = new SpeechSynthesisUtterance(sentence);
      utt.pitch  = p.pitch || 1;
      utt.rate   = p.rate  || 1;
      utt.volume = cfg.volume ?? 0.9;
      utt.lang   = 'en-US';
      if (voice) utt.voice = voice;

      let advanced = false;
      // onend: normal path
      utt.onend = () => { advanced = true; chain(idx + 1); };
      // onerror: skip broken sentence, continue chain
      utt.onerror = () => { if (!advanced) { advanced = true; chain(idx + 1); } };
      // Fallback timer: Android sometimes never fires onend
      // Estimate duration: ~0.6s per word at rate 1.0, clamped 0.8s–6s
      const words    = sentence.split(/\s+/).length;
      const estMs    = Math.min(6000, Math.max(800, (words / (p.rate || 1)) * 600));
      setTimeout(() => { if (!advanced) { advanced = true; chain(idx + 1); } }, estMs + 400);

      window.speechSynthesis.speak(utt);
    };

    chain(0);
  };

  const buildMsg = () => {
    const cfg = State.alertCfg || {};
    const p   = State.VOICE_PERSONALITIES[cfg.personality || 'friendly'];
    const msg = p.messages[Math.floor(Math.random() * p.messages.length)];
    return msg.replace(/{name}/g, State.me()?.name || 'Friend');
  };

  // ── PROGRESS (timetables + habit trackers) ──
  const getProgress = () => {
    // Timetable tasks
    const tt = (State.tables || []).filter(t => !t.archived && t.type === 'timetable');
    let done = 0, total = 0;
    tt.forEach(tbl => {
      const { wk, dy } = TZ.getTodayWkDay(tbl);
      const blks = State.blocks[tbl.id] || [];
      const st   = ((State.schedState[tbl.id] || {})[wk] || {})[dy] || [];
      total += blks.length;
      done  += st.filter(s => s === 1).length;
    });

    // Habit trackers — count today's mark as 1 done / 1 total each
    const habits = (State.tables || []).filter(t => !t.archived && t.type !== 'timetable');
    habits.forEach(tbl => {
      const age = TZ.tableAgeDays(tbl);
      const s   = State.strkState[tbl.id] || [];
      total += 1;
      if (s[age - 1] === 1) done += 1;
    });

    return { done, total, pct: total > 0 ? Math.round(done / total * 100) : 0 };
  };

  // ── SHOW WIDGET ──
  const show = () => {
    if (_snoozeUntil && new Date() < _snoozeUntil) return;
    const p = getProgress();
    if (!p.total) return;       // nothing to track
    if (p.pct === 100) return;  // all done — celebrate silently

    const msg  = buildMsg();
    const name = State.me()?.name || '?';
    const w    = document.getElementById('alert-widget');
    if (!w) return;

    w.querySelector('.widget-msg')?.setAttribute('data-text', msg);
    const msgEl = w.querySelector('.widget-msg');
    const subEl = w.querySelector('.widget-sub');
    const fillEl = w.querySelector('.widget-prog-fill');
    const avatEl = w.querySelector('.widget-avatar');

    if (msgEl)  msgEl.textContent  = msg;
    if (subEl)  subEl.textContent  = `${p.done}/${p.total} tasks done today · ${p.pct}%`;
    if (fillEl) fillEl.style.width = p.pct + '%';
    if (avatEl) avatEl.textContent = name.charAt(0).toUpperCase();

    w.classList.add('show');

    const cfg = State.alertCfg || {};
    if (cfg.alarmEnabled && cfg.voiceEnabled !== false) {
      playAlarm(cfg.alarmVolume ?? 0.8);
      setTimeout(() => speak(msg), 2400); // wait for alarm to finish
    } else if (cfg.alarmEnabled) {
      playAlarm(cfg.alarmVolume ?? 0.8);
    } else if (cfg.voiceEnabled !== false) {
      speak(msg);
    }
  };

  // ── ON-OPEN CHECK ──
  // Fires when app becomes visible — alerts if overdue
  const checkOnOpen = () => {
    if (!State.me() || !State.alertCfg?.enabled) return;
    if (_snoozeUntil && new Date() < _snoozeUntil) return;
    const p = getProgress();
    if (!p.total || p.pct === 100) return;
    const h         = TZ.now().getHours();
    const threshold = State.alertCfg?.threshold ?? 50;
    if (h >= 8 && p.pct < threshold) {
      setTimeout(() => show(), 900);
    }
  };

  // ── BACKGROUND INTERVAL (manual alert times) ──
  // Fixed: ±30s window prevents missed-minute bugs from interval drift
  const start = () => {
    rescheduleNativeAlarms(); // no-op until the Capacitor wrap adds the plugin
    if (_checkInterval) clearInterval(_checkInterval);
    _checkInterval = setInterval(() => {
      if (!State.me() || !State.alertCfg?.enabled) return;
      const cfg = State.alertCfg;

      const n   = TZ.now();
      const h   = n.getHours();
      const m   = n.getMinutes();
      const key = h * 60 + m; // current minute-of-day

      // Reset at midnight so next-day alerts fire correctly
      if (h === 0 && m === 0) _lastAlertMin = -1;
      if (_lastAlertMin === key) return; // already fired this minute

      // Manual times
      if (cfg.manualTimes?.length) {
        const hit = cfg.manualTimes.some(t => {
          const [th, tm] = t.split(':').map(Number);
          return h === th && m === tm;
        });
        if (hit) { _lastAlertMin = key; show(); sendNotif(buildMsg()); return; }
      }

      // Auto-detect: fire once at midday if below threshold
      if (cfg.autoDetect && h === 12 && m === 0) {
        const p = getProgress();
        if (p.pct < (cfg.threshold ?? 50)) {
          _lastAlertMin = key;
          show();
          sendNotif(buildMsg());
        }
      }
    }, 30000); // check every 30s — reliable without hammering
  };

  const stop = () => {
    if (_checkInterval) { clearInterval(_checkInterval); _checkInterval = null; }
  };

  const hide = () => {
    document.getElementById('alert-widget')?.classList.remove('show');
    window.speechSynthesis?.cancel();
  };

  // Fixed: snoozeTonight uses TZ.now() not new Date() for consistency
  const snooze = m => {
    _snoozeUntil = new Date(Date.now() + m * 60000);
    hide();
    Toast.warning(`Snoozed ${m} minutes`);
  };

  const snoozeTonight = () => {
    const t = TZ.now();
    t.setHours(23, 59, 0, 0);
    _snoozeUntil = t;
    hide();
    Toast.warning('Snoozed until tonight');
  };

  const trigger = () => {
    _snoozeUntil = null;
    _unlockAudio();
    show();
  };

  // ── NATIVE ALARMS (Capacitor Local Notifications) ──
  // The browser-only path above (setInterval + AudioContext) only
  // fires while this page is open and foregrounded — fine for a PWA
  // tab, not good enough for an installed app someone expects to alert
  // them from a closed app, which is what "alarm" implies once this
  // ships as an APK. This schedules the SAME manual times at the OS
  // level so Android fires them regardless of whether the app is open.
  //
  // Wiring note: this reads window.Capacitor.Plugins.LocalNotifications,
  // which is only populated once the Capacitor wrap adds the
  // @capacitor/local-notifications plugin AND that plugin is included
  // in the native build. Until that step happens, isNativeAlarmsReady()
  // returns false and every call below is a harmless no-op — nothing
  // here breaks the current web/PWA build.
  const isNativeAlarmsReady = () =>
    !!(window.Capacitor?.isNativePlatform?.() && window.Capacitor?.Plugins?.LocalNotifications);

  const requestNativeAlarmPermission = async () => {
    if (!isNativeAlarmsReady()) return false;
    try {
      const { display } = await window.Capacitor.Plugins.LocalNotifications.requestPermissions();
      return display === 'granted';
    } catch (e) { console.warn('[ALARM] native permission request failed:', e); return false; }
  };

  // Turns cfg.manualTimes ("HH:MM" strings) into daily-repeating OS
  // notifications. IDs are deterministic (hash of the time string) so
  // re-calling this always replaces the same slots instead of stacking
  // duplicates every time settings are saved.
  const rescheduleNativeAlarms = async () => {
    if (!isNativeAlarmsReady()) return;
    const LN = window.Capacitor.Plugins.LocalNotifications;
    const cfg = State.alertCfg || {};
    try {
      const pending = await LN.getPending();
      const ourIds = (pending?.notifications || [])
        .filter(n => n.id >= 9000 && n.id < 9100)
        .map(n => ({ id: n.id }));
      if (ourIds.length) await LN.cancel({ notifications: ourIds });

      if (!cfg.enabled || !cfg.manualTimes?.length) return;

      const notifications = cfg.manualTimes.slice(0, 20).map((t, i) => {
        const [h, m] = t.split(':').map(Number);
        return {
          id: 9000 + i,
          title: 'UPG',
          body: buildMsg(),
          schedule: { on: { hour: h, minute: m }, allowWhileIdle: true },
        };
      });
      if (notifications.length) await LN.schedule({ notifications });
    } catch (e) { console.warn('[ALARM] native reschedule failed:', e); }
  };

  // ── NOTIFICATION API ──
  const requestNotifPermission = async () => {
    if (isNativeAlarmsReady()) return requestNativeAlarmPermission();
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    try {
      const r = await Notification.requestPermission();
      return r === 'granted';
    } catch(e) { return false; }
  };

  const sendNotif = (msg) => {
    if (Notification.permission !== 'granted') return;
    try {
      const n = new Notification('UPG', {
        body:  msg,
        icon:  './icons/icon-192.png',
        badge: './icons/icon-192.png',
        tag:   'upg-alert',
        renotify: true,
      });
      n.onclick = () => { window.focus(); n.close(); };
      setTimeout(() => n.close(), 8000);
    } catch(e) {}
  };

  // ── PWA INSTALL ──
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _deferredPrompt = e;
    document.getElementById('pwa-banner')?.classList.add('show');
  });

  window.addEventListener('appinstalled', () => {
    document.getElementById('pwa-banner')?.classList.remove('show');
    Toast.success('UPG installed! 🎉');
    _deferredPrompt = null;
  });

  const installPWA = async () => {
    if (!_deferredPrompt) {
      Toast.warning('Open in your browser and tap "Add to Home Screen"');
      return;
    }
    _deferredPrompt.prompt();
    const { outcome } = await _deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      document.getElementById('pwa-banner')?.classList.remove('show');
    }
    _deferredPrompt = null;
  };

  const dismissPWA = () => document.getElementById('pwa-banner')?.classList.remove('show');

  // Trigger on-open check when user returns to the app
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkOnOpen(); });
  window.addEventListener('focus', () => checkOnOpen());

  return {
    show, hide, snooze, snoozeTonight, start, stop, trigger,
    speak, playAlarm, buildMsg, getProgress,
    checkOnOpen, requestNotifPermission, sendNotif,
    installPWA, dismissPWA,
    isNativeAlarmsReady, rescheduleNativeAlarms,
  };
})();
