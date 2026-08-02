/**
 * Sons de Skype synthétisés à la volée (Web Audio) — aucun fichier audio requis.
 * Les mélodies reprennent l'esprit des sons historiques : notification, appel,
 * décrochage, raccrochage.
 */

let ctx = null;
let enabled = true;
let masterGain = null;

function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export const setSoundEnabled = (value) => {
  enabled = value !== false;
};
export const setVolume = (value) => {
  if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, value));
};

/** Joue une note. */
function tone({ freq, start = 0, duration = 0.15, type = 'sine', gain = 0.25, sweepTo = null }) {
  const context = audio();
  const t0 = context.currentTime + start;
  const osc = context.createOscillator();
  const envelope = context.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t0 + duration);

  // Enveloppe douce : évite les clics à l'attaque et à l'extinction.
  envelope.gain.setValueAtTime(0.0001, t0);
  envelope.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  envelope.gain.setValueAtTime(gain, t0 + duration * 0.7);
  envelope.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.connect(envelope);
  envelope.connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
  return osc;
}

const play = (notes) => {
  if (!enabled) return;
  try {
    notes.forEach(tone);
  } catch {
    /* audio indisponible (autoplay bloqué) : on ignore */
  }
};

/* ── Sons ponctuels ─────────────────────────────────────────────────────── */

/** Message reçu : le petit « blop » de Skype. */
export const messageIn = () =>
  play([
    { freq: 660, duration: 0.09, gain: 0.18, type: 'sine' },
    { freq: 880, start: 0.07, duration: 0.13, gain: 0.2, type: 'sine' },
  ]);

/** Message envoyé : plus discret. */
export const messageOut = () =>
  play([{ freq: 950, duration: 0.07, gain: 0.1, type: 'sine' }]);

export const mention = () =>
  play([
    { freq: 880, duration: 0.1, gain: 0.2 },
    { freq: 1174, start: 0.1, duration: 0.1, gain: 0.2 },
    { freq: 1318, start: 0.2, duration: 0.16, gain: 0.18 },
  ]);

/** Décrochage. */
export const callConnect = () =>
  play([
    { freq: 523, duration: 0.11, gain: 0.2 },
    { freq: 784, start: 0.1, duration: 0.16, gain: 0.2 },
  ]);

/** Raccrochage. */
export const callEnd = () =>
  play([
    { freq: 587, duration: 0.12, gain: 0.18 },
    { freq: 392, start: 0.11, duration: 0.22, gain: 0.18 },
  ]);

export const notify = () =>
  play([
    { freq: 1046, duration: 0.08, gain: 0.16 },
    { freq: 1318, start: 0.08, duration: 0.12, gain: 0.14 },
  ]);

export const error = () =>
  play([{ freq: 220, duration: 0.22, gain: 0.18, type: 'sawtooth', sweepTo: 160 }]);

/* ── Sons en boucle ─────────────────────────────────────────────────────── */

let ringTimer = null;

/** Sonnerie d'appel entrant : la mélodie montante caractéristique de Skype. */
export function startRinging() {
  if (!enabled || ringTimer) return;
  const melody = () =>
    play([
      { freq: 587, duration: 0.16, gain: 0.24 },
      { freq: 698, start: 0.16, duration: 0.16, gain: 0.24 },
      { freq: 880, start: 0.32, duration: 0.16, gain: 0.24 },
      { freq: 1174, start: 0.48, duration: 0.3, gain: 0.26 },
      { freq: 880, start: 0.85, duration: 0.16, gain: 0.2 },
      { freq: 1174, start: 1.01, duration: 0.34, gain: 0.22 },
    ]);
  melody();
  ringTimer = setInterval(melody, 2600);
}

/** Tonalité d'appel sortant. */
export function startDialing() {
  if (!enabled || ringTimer) return;
  const beep = () =>
    play([
      { freq: 440, duration: 0.4, gain: 0.12, type: 'sine' },
      { freq: 480, duration: 0.4, gain: 0.1, type: 'sine' },
    ]);
  beep();
  ringTimer = setInterval(beep, 3000);
}

export function stopRinging() {
  clearInterval(ringTimer);
  ringTimer = null;
}

/** Tonalité DTMF du pavé numérique. */
const DTMF = {
  1: [697, 1209], 2: [697, 1336], 3: [697, 1477],
  4: [770, 1209], 5: [770, 1336], 6: [770, 1477],
  7: [852, 1209], 8: [852, 1336], 9: [852, 1477],
  '*': [941, 1209], 0: [941, 1336], '#': [941, 1477],
};

export function dtmf(key) {
  const pair = DTMF[key];
  if (!pair) return;
  play(pair.map((freq) => ({ freq, duration: 0.13, gain: 0.13, type: 'sine' })));
}

/** Réveille le contexte audio au premier geste utilisateur (politique autoplay). */
export function unlockAudio() {
  const handler = () => {
    try {
      audio();
    } catch {
      /* ignoré */
    }
    document.removeEventListener('pointerdown', handler);
    document.removeEventListener('keydown', handler);
  };
  document.addEventListener('pointerdown', handler);
  document.addEventListener('keydown', handler);
}
