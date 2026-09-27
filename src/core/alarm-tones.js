/* ═══════════════════════════════════════
   UPG — 12 ALARM TONES
   Real, synthesized via Web Audio oscillators — not recorded/licensed
   sound files (none available to source in this environment). Each
   one is a genuinely distinct frequency/rhythm/waveform pattern, not
   the same tone repeated with a different name. On native Android,
   these render through the STREAM_ALARM audio channel (see
   AlarmVolume native plugin) so they're audible even when the phone's
   ringer/media volume is turned down — same principle a real alarm
   clock app uses.
═══════════════════════════════════════ */

let _ctx = null;
const getCtx = () => (_ctx ??= new (window.AudioContext || window.webkitAudioContext)());

function tone(ctx, t, freq, dur, type = 'sine', vol = 1) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol, t + Math.min(0.05, dur * 0.2));
  gain.gain.linearRampToValueAtTime(0, t + dur);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const ALARM_TONES = [
  { id: 'classic_beep', label: 'Classic Beep', play: (ctx, t0, v) => { for (let i = 0; i < 6; i++) tone(ctx, t0 + i * 0.35, 1000, 0.22, 'square', v); } },
  { id: 'rising_pulse', label: 'Rising Pulse', play: (ctx, t0, v) => { [600, 750, 900, 1050, 1200, 1350].forEach((f, i) => tone(ctx, t0 + i * 0.28, f, 0.24, 'sine', v)); } },
  { id: 'urgent_siren', label: 'Urgent Siren', play: (ctx, t0, v) => { for (let i = 0; i < 4; i++) { tone(ctx, t0 + i * 0.6, 700, 0.3, 'sawtooth', v); tone(ctx, t0 + i * 0.6 + 0.3, 1400, 0.3, 'sawtooth', v); } } },
  { id: 'digital_chime', label: 'Digital Chime', play: (ctx, t0, v) => { [880, 1108, 1318].forEach((f, i) => tone(ctx, t0 + i * 0.4, f, 0.5, 'triangle', v)); } },
  { id: 'deep_alert', label: 'Deep Alert', play: (ctx, t0, v) => { for (let i = 0; i < 5; i++) tone(ctx, t0 + i * 0.4, 220, 0.32, 'sawtooth', v); } },
  { id: 'quick_triplets', label: 'Quick Triplets', play: (ctx, t0, v) => { for (let g = 0; g < 3; g++) for (let i = 0; i < 3; i++) tone(ctx, t0 + g * 0.9 + i * 0.14, 1200, 0.1, 'square', v); } },
  { id: 'bell_toll', label: 'Bell Toll', play: (ctx, t0, v) => { [523, 659, 523, 659].forEach((f, i) => tone(ctx, t0 + i * 0.5, f, 0.6, 'sine', v)); } },
  { id: 'sharp_buzzer', label: 'Sharp Buzzer', play: (ctx, t0, v) => { for (let i = 0; i < 8; i++) tone(ctx, t0 + i * 0.18, 480, 0.12, 'square', v); } },
  { id: 'wave_sweep', label: 'Wave Sweep', play: (ctx, t0, v) => { for (let i = 0; i < 20; i++) tone(ctx, t0 + i * 0.06, 400 + i * 40, 0.07, 'sine', v); } },
  { id: 'double_ring', label: 'Double Ring', play: (ctx, t0, v) => { for (let g = 0; g < 3; g++) { tone(ctx, t0 + g * 0.7, 1000, 0.2, 'sine', v); tone(ctx, t0 + g * 0.7 + 0.22, 1000, 0.2, 'sine', v); } } },
  { id: 'staccato_high', label: 'Staccato High', play: (ctx, t0, v) => { for (let i = 0; i < 10; i++) tone(ctx, t0 + i * 0.15, 1600, 0.08, 'triangle', v); } },
  { id: 'low_pulse_wave', label: 'Low Pulse Wave', play: (ctx, t0, v) => { for (let i = 0; i < 6; i++) tone(ctx, t0 + i * 0.5, 150, 0.4, 'sawtooth', v); } },
];

export function playAlarmTone(toneId, volume = 0.9) {
  const def = ALARM_TONES.find(t => t.id === toneId) || ALARM_TONES[0];
  try {
    const ctx = getCtx();
    def.play(ctx, ctx.currentTime + 0.05, volume);
  } catch (e) { /* AudioContext unavailable — fails silently */ }
}

export function previewTone(toneId) {
  playAlarmTone(toneId, 0.5);
}
