/* ═══════════════════════════════════════
   UPG v10 — AUTH SYSTEM (rearchitected)
   Two clearly separate paths, matching the corrected model:
     - EMAIL:  real account, email+password only, NO PINs, stays
               logged in automatically until explicit logout (default
               Firebase app instance, via EmailAuth).
     - GUEST:  no email collected, a nickname + 2 PINs are the ONLY
               credential (named Firebase app instance per guest, via
               GuestSession) — multiple guests can coexist on one
               device with instant PIN-based switching.
   Data (tables/goals/badges/etc) syncs to Firestore for BOTH types via
   DataSync — see README-SYNC.md for the exact merge policy used.
═══════════════════════════════════════ */
const Auth = (() => {

  // ── REGISTRATION STATE (used by the 6-step wizard, both provider paths) ──
  let _reg = {
    name:'', tz:'Africa/Lagos', timeFmt:'24h',
    theme:'green', aim:'', mission:'',
    provider:'email', email:'', password:'',
    pins:['',''],  // GUEST path only
  };
  let _regStep = 1;

  // ── LOGIN STATE (guest PIN entry) ──
  let _loginUid    = null;
  let _pinEntered  = '';
  let _failCount   = 0;
  let _lockedUntil = null;
  let _lockTimer   = null;

  // ── ACTIVE IDENTITY TYPE — 'email' | 'guest' | null ──
  // Needed so logout/PIN-manager-visibility/sync-hook-binding know
  // which underlying system (EmailAuth vs GuestSession) is in charge.
  let _activeType = null;

  /* ════════════════════════════
     DATA SYNC HELPERS (shared by every login path below)
  ════════════════════════════ */
  // Pull everything ever synced for this uid and merge PER KEY by
  // timestamp: whichever side (this device or the one that synced
  // last) touched a key more recently wins. This replaces the old
  // "only fill in keys that are currently empty" policy — that policy
  // meant a second device could never receive an update to a key it
  // already had any value for. It's still last-write-wins per key
  // (not a real field-level merge), so two devices editing the SAME
  // key while both offline will still have one side's edit lost — but
  // every other real-world case (switch devices, come back later,
  // one device stays offline for a while) now syncs correctly both
  // ways instead of only pulling once at first login.
  const _pullAndSeed = async (app, uid) => {
    let pulled = {};
    try {
      pulled = await DataSync.pullAll(app, uid);
    } catch (e) {
      console.warn('[Auth] data pull failed, continuing with local data only:', e);
    }
    Object.entries(pulled).forEach(([key, rawVal]) => {
      const remoteTs = window.__syncValueTs ? window.__syncValueTs(rawVal) : 0;
      const localTs  = Storage.getTimestamp(uid, key);
      const localHasValue = Storage.uGet(uid, key) != null;

      if (!localHasValue || remoteTs > localTs) {
        const unwrapped = window.__unwrapSyncValue ? window.__unwrapSyncValue(rawVal) : rawVal;
        Storage.uSetLocal(uid, key, unwrapped, remoteTs);
      }
      // else: local copy is newer or equal — leave it, and the sync
      // hook will push it back up next time anything changes.
    });
  };

  // Every local write for the ACTIVE uid pushes through to Firestore,
  // timestamp included so the receiving side can compare recency.
  // Rebound on every login/switch; cleared on logout.
  const _bindSyncHook = (app, uid) => {
    Storage.setSyncHook((hookUid, key, val, ts) => {
      if (hookUid === uid) DataSync.push(app, uid, key, val, ts);
    });
  };

  /* ════════════════════════════
     SETUP WIZARD (steps 1–5 identical for both provider paths;
     step 6 branches EMAIL vs GUEST)
  ════════════════════════════ */
  const startSetup = () => {
    _reg = { name:'', tz:'Africa/Lagos', timeFmt:'24h', theme:'green', aim:'', mission:'',
      provider:'email', email:'', password:'', pins:['',''] };
    _regStep = 1;
    pickProvider('email');
    _showSetupStep(1);
    _showScreen('setup-screen');
  };

  const pickProvider = (provider) => {
    _reg.provider = provider;
    document.querySelectorAll('.provider-tab').forEach(el =>
      el.classList.toggle('active', el.dataset.provider === provider));
    const emailFields = document.getElementById('email-fields');
    const pinSection   = document.getElementById('guest-pin-section');
    const anonNote     = document.getElementById('anon-note');
    const phoneFields  = document.getElementById('phone-fields');
    const googleNote   = document.getElementById('google-note');
    const createBtn    = document.getElementById('create-account-btn');
    if (emailFields) emailFields.style.display = provider === 'email' ? 'block' : 'none';
    if (pinSection)  pinSection.style.display  = provider === 'guest' ? 'block' : 'none';
    if (anonNote)    anonNote.style.display    = provider === 'guest' ? 'block' : 'none';
    if (phoneFields)  phoneFields.style.display  = provider === 'phone'  ? 'block' : 'none';
    if (googleNote)   googleNote.style.display   = provider === 'google' ? 'block' : 'none';
    if (createBtn) {
      // Google's own button submits directly via signInWithGoogle();
      // phone uses its own two-step Send/Verify buttons — hide the
      // generic CREATE ACCOUNT button for both so there's no dead click.
      createBtn.style.display = (provider === 'google' || provider === 'phone') ? 'none' : 'block';
    }
  };

  const goStep = (step) => {
    if (step === 2) {
      const name = document.getElementById('inp-name')?.value.trim();
      if (!name) { _shakeEl('inp-name'); Toast.error('Please enter your name'); return; }
      _reg.name = name;
    }
    if (step === 6) {
      const m = document.getElementById('inp-mission')?.value.trim();
      _reg.mission = m || '';
    }
    _regStep = step;
    _showSetupStep(step);
  };

  const _showSetupStep = (step) => {
    for (let i = 1; i <= 6; i++) {
      const el = document.getElementById('ss' + i);
      if (el) el.style.display = i === step ? 'block' : 'none';
    }
    document.querySelectorAll('.step-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === step - 1);
      dot.classList.toggle('done',   i <  step - 1);
    });
    const lbl = document.querySelector('.step-lbl');
    if (lbl) lbl.textContent = `STEP ${step} OF 6`;
    if (step === 1) setTimeout(() => document.getElementById('inp-name')?.focus(), 300);
  };

  const pickTZ      = (tz)  => { _reg.tz = tz; };
  const pickTimeFmt = (fmt) => {
    _reg.timeFmt = fmt;
    document.querySelectorAll('.time-fmt-opt').forEach(el =>
      el.classList.toggle('sel', el.dataset.fmt === fmt));
  };
  const pickTheme = (el) => {
    _reg.theme = el.dataset.t;
    document.querySelectorAll('#ss4 .theme-swatch').forEach(s => s.classList.remove('active'));
    el.classList.add('active');
    App.applyThemeClass(_reg.theme);
    const th = State.THEMES.find(t => t.id === _reg.theme);
    const nm = document.getElementById('setup-theme-name');
    if (nm) nm.textContent = 'Selected: ' + (th?.name || '');
  };

  /* ════════════════════════════
     ACCOUNT CREATION — branches by provider
  ════════════════════════════ */
  const createAccount = async () => {
    if (_reg.provider === 'email') return _createEmailAccount();
    if (_reg.provider === 'guest') return _createGuestAccount();
    if (_reg.provider === 'google') return signInWithGoogle();
    Toast.error('Choose a sign-up method first');
  };

  /* ════════════════════════════
     GOOGLE SIGN-IN — one tap, works for both first-time and
     returning users (Firebase returns the same uid either way, so
     _createUserProfile's "existing user? just launch them" branch
     handles returning users automatically).
  ════════════════════════════ */
  const signInWithGoogle = async () => {
    const btn = document.getElementById('create-account-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'OPENING GOOGLE…'; }
    const result = await EmailAuth.signInWithGoogle();
    if (btn) { btn.disabled = false; btn.textContent = 'CREATE ACCOUNT →'; }

    if (result.redirecting) return; // page is navigating to Google, nothing more to do here
    if (!result.ok) { Toast.error(result.error || 'Google sign-in failed'); return; }

    _activeType = 'email'; // same default-app session type as email accounts
    await _pullAndSeed(undefined, result.uid);
    _bindSyncHook(undefined, result.uid);
    _reg.name = _reg.name || result.name;
    _createUserProfile(result.uid, 'google');
  };

  /* ════════════════════════════
     PHONE SIGN-IN — two steps: send code, then confirm it.
     UI calls startPhoneVerification() when the user submits their
     number, then confirmPhoneVerification() once they type the code
     that arrives by SMS.
  ════════════════════════════ */
  const startPhoneVerification = async () => {
    const phone = document.getElementById('inp-phone')?.value.trim() || '';
    const btn = document.getElementById('phone-send-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'SENDING…'; }
    const result = await EmailAuth.startPhoneSignIn(phone);
    if (btn) { btn.disabled = false; btn.textContent = 'SEND CODE →'; }
    if (!result.ok) { Toast.error(result.error || 'Could not send code'); return; }
    Toast.success('Code sent — check your SMS');
    const numStep = document.getElementById('phone-number-step');
    if (numStep) numStep.style.display = 'none';
    const codeStep = document.getElementById('phone-code-step');
    if (codeStep) codeStep.style.display = 'block';
  };

  const confirmPhoneVerification = async () => {
    const code = document.getElementById('inp-phone-code')?.value.trim() || '';
    const btn = document.getElementById('phone-confirm-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'VERIFYING…'; }
    const result = await EmailAuth.confirmPhoneCode(code);
    if (btn) { btn.disabled = false; btn.textContent = 'VERIFY →'; }
    if (!result.ok) { Toast.error(result.error || 'Verification failed'); return; }

    _activeType = 'email';
    await _pullAndSeed(undefined, result.uid);
    _bindSyncHook(undefined, result.uid);
    _reg.name = _reg.name || result.name;
    _createUserProfile(result.uid, 'phone');
  };

  const _createEmailAccount = async () => {
    const btn = document.getElementById('create-account-btn');
    const email    = document.getElementById('inp-email')?.value.trim() || '';
    const password = document.getElementById('inp-password')?.value || '';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { _shakeEl('inp-email'); Toast.error('Enter a valid email address'); return; }
    if (password.length < 6) { _shakeEl('inp-password'); Toast.error('Password must be at least 6 characters'); return; }

    if (btn) { btn.disabled = true; btn.textContent = 'CREATING…'; }
    const result = await EmailAuth.signUp({ name: _reg.name, email, password });
    if (btn) { btn.disabled = false; btn.textContent = 'CREATE ACCOUNT →'; }

    if (!result.ok) { Toast.error(result.error || 'Could not create account'); return; }

    _activeType = 'email';
    await _pullAndSeed(undefined, result.uid); // undefined app = Firestore default app
    _bindSyncHook(undefined, result.uid);
    _createUserProfile(result.uid, 'email');
  };

  const _createGuestAccount = async () => {
    const btn = document.getElementById('create-account-btn');
    const p1 = document.getElementById('setup-pin-0')?.value.trim() || '';
    const p2 = document.getElementById('setup-pin-1')?.value.trim() || '';

    if (!p1) { _shakeSlot(0); Toast.error('PIN 1 is empty'); return; }
    if (!p2) { _shakeSlot(1); Toast.error('PIN 2 is empty'); return; }
    if (!/^\d{5}$/.test(p1)) { _shakeSlot(0); Toast.error('PIN 1 must be exactly 5 digits'); return; }
    if (!/^\d{5}$/.test(p2)) { _shakeSlot(1); Toast.error('PIN 2 must be exactly 5 digits'); return; }
    if (p1 === p2) { _shakeSlot(0); _shakeSlot(1); Toast.error('Both PINs must be different from each other'); return; }
    if (GuestSession.isPinTaken(p1)) {
      _shakeSlot(0); document.getElementById('setup-pin-0').value = '';
      Toast.error('PIN 1 is already used by another guest on this device.'); return;
    }
    if (GuestSession.isPinTaken(p2)) {
      _shakeSlot(1); document.getElementById('setup-pin-1').value = '';
      Toast.error('PIN 2 is already used by another guest on this device.'); return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'CREATING…'; }
    const result = await GuestSession.addGuest({ nickname: _reg.name, pins: [p1, p2] });
    if (btn) { btn.disabled = false; btn.textContent = 'CREATE ACCOUNT →'; }

    if (!result.ok) { Toast.error(result.error || 'Could not create guest profile'); return; }

    _activeType = 'guest';
    const app = GuestSession.getActiveApp() || (() => { GuestSession.switchTo(result.uid, p1); return GuestSession.getActiveApp(); })();
    await _pullAndSeed(app, result.uid);
    _bindSyncHook(app, result.uid);
    _createUserProfile(result.uid, 'guest');
  };

  const _createUserProfile = (uid, provider) => {
    const existing = State.users.find(u => u.id === uid);
    if (existing) {
      State.loadUser(uid);
      App.launch(uid);
      return;
    }
    const user = {
      id:           uid,
      name:         _reg.name,
      theme:        _reg.theme,
      tz:           _reg.tz,
      timeFmt:      _reg.timeFmt,
      aim:          '',
      mission:      _reg.mission || '',
      joinedAt:     new Date().toISOString(),
      authProvider: provider, // 'email' | 'guest'
      subscription: { tier: 'free', activatedAt: null, expiresAt: null, method: null },
    };
    State.users.push(user);
    State.saveGlobal();
    State.loadUser(uid);
    State.alertCfg = {
      enabled:true, voiceEnabled:true, alarmEnabled:false,
      personality:'friendly', volume:0.9, alarmVolume:0.8,
      autoDetect:true, threshold:50, manualTimes:[],
    };
    State.saveAll();
    App.launch(uid);
  };

  /* ════════════════════════════
     EMAIL SIGN IN (existing account, any device — no PIN, no wizard)
  ════════════════════════════ */
  const showSignIn = () => {
    document.getElementById('signin-email').value = '';
    document.getElementById('signin-password').value = '';
    _showScreen('signin-screen');
  };

  const submitSignIn = async () => {
    const btn = document.getElementById('signin-btn');
    const email    = document.getElementById('signin-email')?.value.trim() || '';
    const password = document.getElementById('signin-password')?.value || '';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { _shakeEl('signin-email'); Toast.error('Enter a valid email address'); return; }
    if (!password) { _shakeEl('signin-password'); Toast.error('Enter your password'); return; }

    if (btn) { btn.disabled = true; btn.textContent = 'SIGNING IN…'; }
    const result = await EmailAuth.signIn({ email, password });
    if (btn) { btn.disabled = false; btn.textContent = 'SIGN IN →'; }

    if (!result.ok) { Toast.error(result.error || 'Sign-in failed'); return; }

    _activeType = 'email';
    await _pullAndSeed(undefined, result.uid);
    _bindSyncHook(undefined, result.uid);

    _reg = { name: result.name, tz:'Africa/Lagos', timeFmt:'24h', theme:'green', aim:'', mission:'',
      provider:'email', email, password:'', pins:['',''] };
    _createUserProfile(result.uid, 'email');
  };

  /* ════════════════════════════
     USER SWITCHER — guest cards + NEW USER + SIGN IN
     (only shown when NO email session is currently persisted — an
     active email session skips this entirely at boot)
  ════════════════════════════ */
  const showSwitcher = () => {
    _renderSwitcher();
    _showScreen('user-switcher');
  };

  const _renderSwitcher = () => {
    const grid = document.getElementById('users-grid');
    if (!grid) return;
    grid.innerHTML = '';
    GuestSession.listGuests().forEach(g => {
      const card = document.createElement('div');
      card.className = 'user-card fu';
      card.innerHTML = `
        <div class="user-avatar">${g.nickname.charAt(0).toUpperCase()}</div>
        <div class="user-card-name">${_esc(g.nickname)}</div>
        <div class="user-card-sub">${State.MONTH_SHORT[new Date(g.addedAt).getMonth()]} ${new Date(g.addedAt).getFullYear()} · GUEST</div>`;
      card.onclick = () => showLogin(g.uid);
      grid.appendChild(card);
    });
    const addCard = document.createElement('div');
    addCard.className = 'add-user-card fu';
    addCard.innerHTML = `<div class="add-user-icon">＋</div><div class="add-user-lbl">NEW USER</div>`;
    addCard.onclick = () => startSetup();
    grid.appendChild(addCard);

    const signInCard = document.createElement('div');
    signInCard.className = 'add-user-card fu';
    signInCard.innerHTML = `<div class="add-user-icon">🔑</div><div class="add-user-lbl">SIGN IN</div>`;
    signInCard.onclick = () => showSignIn();
    grid.appendChild(signInCard);
  };

  /* ════════════════════════════
     GUEST PIN LOGIN
  ════════════════════════════ */
  const showLogin = (uid) => {
    _loginUid    = uid;
    _pinEntered  = '';
    _failCount   = 0;
    _lockedUntil = null;
    if (_lockTimer) { clearInterval(_lockTimer); _lockTimer = null; }
    const user = State.users.find(u => u.id === uid);
    if (!user) return;
    App.applyThemeClass(user.theme || 'green');
    const av = document.getElementById('login-avatar');
    const nm = document.getElementById('login-name');
    const sb = document.getElementById('login-sub');
    const lo = document.getElementById('login-lockout');
    if (av) av.textContent = user.name.charAt(0).toUpperCase();
    if (nm) nm.textContent = user.name.toUpperCase();
    if (sb) sb.textContent = 'ENTER YOUR 5-DIGIT PIN';
    if (lo) lo.style.display = 'none';
    _updatePinDots();
    _showScreen('pin-login');
  };

  const pinKeypress = (val) => {
    if (_lockedUntil && new Date() < _lockedUntil) {
      const secs = Math.ceil((_lockedUntil - new Date()) / 1000);
      const lo = document.getElementById('login-lockout');
      if (lo) { lo.style.display = 'block'; lo.textContent = `Too many attempts. Wait ${secs}s`; }
      return;
    }
    if (val === 'del') {
      _pinEntered = _pinEntered.slice(0, -1);
      _updatePinDots(); return;
    }
    if (_pinEntered.length >= 5) return;
    _pinEntered += val;
    _updatePinDots();
    if (_pinEntered.length === 5) setTimeout(_tryLogin, 80);
  };

  const _tryLogin = async () => {
    const result = GuestSession.switchTo(_loginUid, _pinEntered);
    if (result.ok) {
      document.querySelectorAll('#pin-login .pin-dot').forEach(d => {
        d.classList.remove('error'); d.classList.add('filled');
      });
      setTimeout(async () => {
        _activeType = 'guest';
        const app = GuestSession.getActiveApp();
        await _pullAndSeed(app, _loginUid);
        _bindSyncHook(app, _loginUid);
        State.loadUser(_loginUid);
        App.launch(_loginUid);
      }, 220);
    } else if (result.needsReauth) {
      document.querySelectorAll('#pin-login .pin-dot').forEach(d =>
        d.classList.remove('filled', 'error'));
      _pinEntered = '';
      _updatePinDots();
      Toast.error('This guest profile expired on this device and needs to be re-created.');
    } else {
      _failCount++;
      document.querySelectorAll('#pin-login .pin-dot').forEach(d => {
        d.classList.remove('filled'); d.classList.add('error');
      });
      setTimeout(() => {
        document.querySelectorAll('#pin-login .pin-dot').forEach(d =>
          d.classList.remove('error', 'filled'));
        _pinEntered = '';
        _updatePinDots();
        const lo = document.getElementById('login-lockout');
        if (_failCount >= 3) {
          _lockedUntil = new Date(Date.now() + 30000);
          if (lo) lo.style.display = 'block';
          _lockTimer = setInterval(() => {
            if (!_lockedUntil || new Date() >= _lockedUntil) {
              if (lo) lo.style.display = 'none';
              _failCount = 0;
              clearInterval(_lockTimer); _lockTimer = null;
            } else {
              const s = Math.ceil((_lockedUntil - new Date()) / 1000);
              if (lo) lo.textContent = `Too many attempts. Wait ${s}s`;
            }
          }, 1000);
        } else {
          Toast.error(`Wrong PIN. ${3 - _failCount} attempt${3-_failCount!==1?'s':''} left.`);
        }
      }, 420);
    }
  };

  const _updatePinDots = () => {
    document.querySelectorAll('#pin-login .pin-dot').forEach((d, i) => {
      d.classList.toggle('filled', i < _pinEntered.length);
      d.classList.remove('error');
    });
  };

  /* ════════════════════════════
     LOGOUT — branches by active identity type
  ════════════════════════════ */
  const logout = async () => {
    Storage.clearSyncHook();
    if (_activeType === 'email') {
      await EmailAuth.logout();
    } else if (_activeType === 'guest') {
      GuestSession.logoutActive();
    }
    _activeType = null;
    State.logoutUser();
    Widget.stop();
    window.speechSynthesis?.cancel();
    showSwitcher();
    Toast.show('Logged out', 'default', 1500);
  };

  /* ════════════════════════════
     MANAGE PINs (settings) — GUEST accounts only, email has no PINs
  ════════════════════════════ */
  const renderPinManager = (containerId) => {
    const el = document.getElementById(containerId);
    if (!el) return;
    const user = State.me();
    if (user?.authProvider !== 'guest') {
      el.innerHTML = `
        <div style="font-family:var(--font-m);font-size:8px;color:var(--tx2);letter-spacing:.5px;line-height:1.7">
          ${user?.authProvider === 'email' ? 'Email accounts sign in with your password' : user?.authProvider === 'google' ? 'Google accounts sign in through Google' : 'Phone accounts sign in with an SMS code'} — there's no PIN to manage. PINs are only used for Guest profiles.
        </div>`;
      return;
    }
    el.innerHTML = `
      <div style="font-family:var(--font-m);font-size:8px;color:var(--tx2);letter-spacing:.5px;line-height:1.7;margin-bottom:16px">
        Enter 2 new PINs — each must be exactly <strong style="color:var(--acc)">5 digits</strong>, different from each other, and not used by another guest on this device.
      </div>`;
    for (let i = 0; i < 2; i++) {
      const slot = document.createElement('div');
      slot.className = 'pin-slot';
      slot.id = 'pin-mgr-slot-' + i;
      slot.innerHTML = `
        <div class="pin-slot-num">PIN ${i + 1}</div>
        <input class="pin-slot-input" type="password" maxlength="5"
          inputmode="numeric" pattern="[0-9]*"
          placeholder="•••••" id="mgr-pin-${i}"
          style="font-family:var(--font-m);font-size:16px;color:var(--tx);background:transparent;border:none;outline:none;width:100%;letter-spacing:4px"/>
        <div class="pin-slot-status" id="mgr-pin-st-${i}"></div>`;
      el.appendChild(slot);
    }
  };

  const saveManagedPins = () => {
    const user = State.me(); if (!user) return;
    if (user.authProvider !== 'guest') {
      Toast.error('This account type doesn\'t use PINs');
      return;
    }
    const p1 = document.getElementById('mgr-pin-0')?.value.trim() || '';
    const p2 = document.getElementById('mgr-pin-1')?.value.trim() || '';

    if (!p1) { Toast.error('PIN 1 is empty'); return; }
    if (!p2) { Toast.error('PIN 2 is empty'); return; }

    const result = GuestSession.updatePins(user.id, [p1, p2]);
    if (!result.ok) { Toast.error(result.error); return; }

    State.saveGlobal();
    Toast.success('PINs updated successfully!');
    document.getElementById('ov-pin-mgr')?.classList.remove('open');
  };

  /* ════════════════════════════
     SCREEN MANAGER
  ════════════════════════════ */
  const _showScreen = (id) => {
    ['setup-screen','user-switcher','signin-screen','pin-login','app-shell'].forEach(sid => {
      const el = document.getElementById(sid);
      if (!el) return;
      if (sid === id) {
        el.style.display = 'flex';
        el.style.visibility = 'visible';
      } else {
        el.style.display = 'none';
      }
    });
  };

  /* ════════════════════════════
     BOOT — called once from app.js's DOMContentLoaded.
     Checks for a persisted EMAIL session FIRST (skips switcher
     entirely if found — "stay logged in like Gmail"). Only falls
     back to restoring guest slots + showing the switcher if no email
     session is active.
  ════════════════════════════ */
  const boot = async () => {
    // If the user just came back from a Google sign-in redirect
    // (mobile browsers that block popups), finish that flow first —
    // it resolves to the same uid checkPersistedSession would find
    // anyway, but only after Firebase processes the redirect result.
    const redirected = await EmailAuth.checkGoogleRedirect().catch(() => null);
    if (redirected) {
      _activeType = 'email';
      await _pullAndSeed(undefined, redirected.uid);
      _bindSyncHook(undefined, redirected.uid);
      const existing = State.users.find(u => u.id === redirected.uid);
      if (!existing) {
        _reg = { name: redirected.name, tz:'Africa/Lagos', timeFmt:'24h', theme:'green', aim:'', mission:'',
          provider:'google', email: redirected.email, password:'', pins:['',''] };
        _createUserProfile(redirected.uid, 'google');
      } else {
        State.loadUser(redirected.uid);
        App.launch(redirected.uid);
      }
      return;
    }

    const persisted = await EmailAuth.checkPersistedSession();
    if (persisted) {
      _activeType = 'email';
      await _pullAndSeed(undefined, persisted.uid);
      _bindSyncHook(undefined, persisted.uid);
      // Ensure a local profile exists even if this is a fresh device
      // resuming a session that was somehow already persisted (edge
      // case, e.g. dev tools manipulation) — normally signUp/signIn
      // already created this.
      const existing = State.users.find(u => u.id === persisted.uid);
      if (!existing) {
        _reg = { name: persisted.name, tz:'Africa/Lagos', timeFmt:'24h', theme:'green', aim:'', mission:'',
          provider:'email', email: persisted.email, password:'', pins:['',''] };
        _createUserProfile(persisted.uid, 'email');
      } else {
        State.loadUser(persisted.uid);
        App.launch(persisted.uid);
      }
      return;
    }

    await GuestSession.restoreAll();
    showSwitcher();
  };

  /* ════════════════════════════
     UTILS
  ════════════════════════════ */
  const _shakeEl = (id) => {
    const el = document.getElementById(id); if (!el) return;
    el.style.animation = 'shake .3s ease';
    setTimeout(() => el.style.animation = '', 400);
    el.focus();
  };
  const _shakeSlot = (i) => {
    const slot = document.querySelectorAll('.pin-slot')[i]; if (!slot) return;
    slot.classList.add('error');
    setTimeout(() => slot.classList.remove('error'), 500);
  };
  const _esc = s => String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  return {
    boot, startSetup, goStep, pickTZ, pickTimeFmt, pickTheme, pickProvider,
    createAccount, showSwitcher, showSignIn, submitSignIn, showLogin, pinKeypress,
    logout, renderPinManager, saveManagedPins,
    signInWithGoogle, startPhoneVerification, confirmPhoneVerification,
    getIdToken: () => window.__getIdToken(_activeType === 'guest' ? GuestSession.getActiveApp() : undefined),
  };
})();
