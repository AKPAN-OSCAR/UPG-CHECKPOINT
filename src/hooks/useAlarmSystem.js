import { useState, useCallback, useRef, useEffect } from 'react';
import { registerPlugin } from '@capacitor/core';
import State from '../core/state.js';
import { ALARM_TONES, playAlarmTone } from '../core/alarm-tones.js';

// Bridges to UpgAlarmPlugin.kt (android/app/src/main/java/com/upg/) —
// see that file's header comment for the "written but not yet
// compiled/device-tested" caveat. Calls fail gracefully (caught,
// logged) everywhere they're used below, so a browser preview or a
// not-yet-rebuilt APK degrades to the Web Audio fallback instead of
// crashing.
const UpgAlarm = registerPlugin('UpgAlarm');

const STYLE_TO_PERSONALITY = { arrogant: 'strict', friendly: 'friendly', normal: 'normal' };

let _voicesCache = null;
function getVoices() {
  if (_voicesCache) return Promise.resolve(_voicesCache);
  return new Promise(resolve => {
    const existing = window.speechSynthesis?.getVoices() || [];
    if (existing.length) { _voicesCache = existing; resolve(existing); return; }
    window.speechSynthesis?.addEventListener('voiceschanged', () => { _voicesCache = window.speechSynthesis.getVoices(); resolve(_voicesCache); }, { once: true });
    setTimeout(() => resolve(window.speechSynthesis?.getVoices() || []), 2500);
  });
}

// Voice gender selection: Android's system TTS voices don't reliably
// expose a "gender" field, so this filters by common name/locale
// heuristics real TTS engines use (e.g. Google's "en-us-x-iom" =
// female, "en-us-x-iol" = male are engine-specific and not something
// to hardcode safely) — filtering by voice NAME keywords is the
// honest, portable approach across different device TTS engines.
async function pickVoice(gender) {
  const voices = await getVoices();
  const enVoices = voices.filter(v => v.lang.startsWith('en'));
  const femaleHints = ['female', 'woman', 'samantha', 'victoria', 'karen', 'moira', 'tessa'];
  const maleHints = ['male', 'man', 'daniel', 'fred', 'alex', 'aaron', 'arthur'];
  const hints = gender === 'female' ? femaleHints : maleHints;
  return enVoices.find(v => hints.some(h => v.name.toLowerCase().includes(h)))
    || enVoices.find(v => v.name.toLowerCase().includes('google'))
    || enVoices[0] || voices[0] || null;
}

async function speakText(text, personality, gender, volume = 0.9) {
  if (!('speechSynthesis' in window) || !text) return;
  window.speechSynthesis.cancel();
  const p = State.VOICE_PERSONALITIES[personality || 'friendly'];
  const voice = await pickVoice(gender);
  const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
  const chain = (idx) => {
    if (idx >= sentences.length) return;
    const sentence = sentences[idx].trim();
    if (!sentence) { chain(idx + 1); return; }
    const utt = new SpeechSynthesisUtterance(sentence);
    utt.pitch = p.pitch || 1;
    utt.rate = p.rate || 1;
    utt.volume = volume;
    utt.lang = 'en-US';
    if (voice) utt.voice = voice;
    utt.onend = () => chain(idx + 1);
    utt.onerror = () => chain(idx + 1);
    window.speechSynthesis.speak(utt);
  };
  chain(0);
}

function buildMessage(personality, taskName) {
  const p = State.VOICE_PERSONALITIES[personality || 'friendly'];
  const template = p.messages[Math.floor(Math.random() * p.messages.length)];
  return template.replace(/{name}/g, State.me()?.name || 'Friend').replace(/{task}/g, taskName || 'your task');
}

const DEFAULT_CFG = {
  enabled: true, mode: 'ring',
  ringSource: 'upg', ringSoundId: 'classic_beep', ringSoundUri: null, ringSoundTitle: 'Classic Beep',
  voiceGender: 'female', voiceStyle: 'friendly',
  volume: 0.9, alarmVolume: 0.9,
  autoDetect: true, threshold: 50, manualTimes: [],
};

export default function useAlarmSystem() {
  const [cfg, setCfgState] = useState(() => ({ ...DEFAULT_CFG, ...(State.alertCfg || {}) }));
  const [deviceSounds, setDeviceSounds] = useState([]);
  const [dndGranted, setDndGranted] = useState(null);
  const escalationTimers = useRef({}); // blockKey -> {startTimer, endTimer, repeatInterval}

  const saveCfg = useCallback((patch) => {
    const next = { ...cfg, ...patch };
    setCfgState(next);
    State.alertCfg = next;
    State.saveAll();
  }, [cfg]);

  const loadDeviceSounds = useCallback(async () => {
    try {
      const res = await UpgAlarm.getDeviceAlarmSounds();
      setDeviceSounds(res.sounds || []);
      return res.sounds;
    } catch (e) {
      setDeviceSounds([]); // native plugin not available yet (browser preview / not-yet-rebuilt APK)
      return [];
    }
  }, []);

  const checkDndBypass = useCallback(async () => {
    try {
      const res = await UpgAlarm.isDndBypassGranted();
      setDndGranted(res.granted);
      return res.granted;
    } catch (e) { setDndGranted(false); return false; }
  }, []);

  const requestDndBypass = useCallback(async () => {
    try { await UpgAlarm.requestDndBypass(); } catch (e) { /* native unavailable */ }
  }, []);

  // Fires the single configured mode (Ring OR Speak OR Vibrate), and
  // for Ring, tries the native alarm-stream path first, falling back
  // to the in-app Web Audio synth if the plugin isn't available yet
  // (browser preview / APK not rebuilt with this native code yet).
  const fireOnce = useCallback(async (taskName) => {
    if (cfg.mode === 'ring') {
      try {
        await UpgAlarm.boostAlarmVolume();
        if (cfg.ringSource === 'device' && cfg.ringSoundUri) {
          await UpgAlarm.playAlarmSound({ uri: cfg.ringSoundUri, volume: cfg.alarmVolume });
        } else {
          await UpgAlarm.playUpgTone({ toneName: cfg.ringSoundId, volume: cfg.alarmVolume });
        }
      } catch (e) {
        playAlarmTone(cfg.ringSoundId, cfg.alarmVolume); // fallback: in-app synth
      }
    } else if (cfg.mode === 'speak') {
      const personality = STYLE_TO_PERSONALITY[cfg.voiceStyle] || 'friendly';
      speakText(buildMessage(personality, taskName), personality, cfg.voiceGender, cfg.volume);
    } else if (cfg.mode === 'vibrate') {
      try {
        const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
        for (let i = 0; i < 3; i++) { await Haptics.impact({ style: ImpactStyle.Heavy }); await new Promise(r => setTimeout(r, 220)); }
      } catch (e) {
        if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
      }
    }
  }, [cfg]);

  const stopFiring = useCallback(async () => {
    try { await UpgAlarm.stopAlarmSound(); } catch (e) {}
    window.speechSynthesis?.cancel();
  }, []);

  const testAlarm = useCallback(() => fireOnce('Test task'), [fireOnce]);

  // ── PER-BLOCK ESCALATION — the actual "5 times, then repeat until
  // marked done, escalate at end time" behavior. This runs while the
  // app is open/foregrounded; making it survive the app being fully
  // closed needs the native AlarmManager scheduling side (separate,
  // larger native task — not built in this pass, stated plainly).
  const scheduleBlockEscalation = useCallback((block, isDoneNow) => {
    const key = block.id;
    const clearAll = () => {
      const t = escalationTimers.current[key];
      if (t) { clearTimeout(t.startTimer); clearTimeout(t.endTimer); clearInterval(t.repeatInterval); }
    };
    clearAll();
    if (isDoneNow()) return; // already done — nothing to escalate

    const now = new Date();
    const [sh, sm] = block.start.split(':').map(Number);
    const [eh, em] = block.end.split(':').map(Number);
    const startAt = new Date(now); startAt.setHours(sh, sm, 0, 0);
    const endAt = new Date(now); endAt.setHours(eh, em, 0, 0);

    const fireFiveTimes = (onExhausted) => {
      let count = 0;
      const iv = setInterval(() => {
        if (isDoneNow()) { clearInterval(iv); return; }
        fireOnce(block.label);
        count++;
        if (count >= 5) { clearInterval(iv); onExhausted?.(); }
      }, 4000); // 5 alerts, ~4s apart
      return iv;
    };

    const repeatUntilDone = () => setInterval(() => {
      if (isDoneNow()) { clearInterval(escalationTimers.current[key]?.repeatInterval); return; }
      fireOnce(block.label);
    }, 5 * 60 * 1000); // every 5 min until marked done — the "still screaming their name" behavior

    const startTimer = setTimeout(() => {
      fireFiveTimes(() => {
        escalationTimers.current[key].repeatInterval = repeatUntilDone();
      });
    }, Math.max(0, startAt - now));

    const endTimer = setTimeout(() => {
      fireFiveTimes(() => {
        escalationTimers.current[key].repeatInterval = repeatUntilDone();
      });
    }, Math.max(0, endAt - now));

    escalationTimers.current[key] = { startTimer, endTimer, repeatInterval: null };
  }, [fireOnce]);

  const cancelBlockEscalation = useCallback((blockId) => {
    const t = escalationTimers.current[blockId];
    if (t) { clearTimeout(t.startTimer); clearTimeout(t.endTimer); clearInterval(t.repeatInterval); delete escalationTimers.current[blockId]; }
  }, []);

  useEffect(() => () => { Object.values(escalationTimers.current).forEach(t => { clearTimeout(t.startTimer); clearTimeout(t.endTimer); clearInterval(t.repeatInterval); }); }, []);

  const addManualTime = useCallback((time) => {
    if (cfg.manualTimes.includes(time)) return;
    saveCfg({ manualTimes: [...cfg.manualTimes, time].sort() });
  }, [cfg, saveCfg]);

  const removeManualTime = useCallback((time) => {
    saveCfg({ manualTimes: cfg.manualTimes.filter(t => t !== time) });
  }, [cfg, saveCfg]);

  return {
    cfg, saveCfg, fireOnce, stopFiring, testAlarm,
    addManualTime, removeManualTime,
    scheduleBlockEscalation, cancelBlockEscalation,
    deviceSounds, loadDeviceSounds,
    dndGranted, checkDndBypass, requestDndBypass,
    ALARM_TONES, VOICE_PERSONALITIES: State.VOICE_PERSONALITIES,
  };
}
