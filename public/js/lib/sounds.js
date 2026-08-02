/**
 * Sons de Skype.
 *
 * Les sons officiels (sonnerie, tonalité d'appel, notification, échec d'appel)
 * sont lus depuis /assets/sounds/. Si un fichier est absent ou illisible, on
 * retombe automatiquement sur une synthèse Web Audio équivalente, pour que
 * l'application reste utilisable sans les fichiers audio.
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
  if (!enabled) stopRinging();
};
export const setVolume = (value) => {
  if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, value));
};

// ── Sons officiels ────────────────────────────────────────────────────────────

const ASSETS = {
  ring: '/assets/sounds/skype-ring.mp3',                          // appel entrant
  dialing: '/assets/sounds/skype-dialing.mp3',                    // tonalité d'appel sortant
  message: '/assets/sounds/skype-message.mp3',                    // message reçu
  callFailed: '/assets/sounds/skype-call-failed.mp3',             // échec de l'appel
  callNotConnected: '/assets/sounds/skype-call-not-connected.mp3',// appel non abouti
};

const buffers = new Map();   // nom -> AudioBuffer
const loading = new Map();   // nom -> Promise
const missing = new Set();   // fichiers dont le chargement a échoué

/** Charge et décode un son, une seule fois. */
function loadAsset(name) {
  if (buffers.has(name)) return Promise.resolve(buffers.get(name));
  if (missing.has(name)) return Promise.resolve(null);
  if (loading.has(name)) return loading.get(name);

  const url = ASSETS[name];
  if (!url) return Promise.resolve(null);

  const promise = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((data) => audio().decodeAudioData(data))
    .then((buffer) => {
      buffers.set(name, buffer);
      loading.delete(name);
      return buffer;
    })
    .catch((err) => {
      // Fichier absent ou format non pris en charge : on passe à la synthèse.
      console.warn(`[sons] « ${name} » indisponible (${err.message}), repli sur la synthèse.`);
      missing.add(name);
      loading.delete(name);
      return null;
    });

  loading.set(name, promise);
  return promise;
}

/** Précharge les sons pour qu'ils démarrent sans latence au premier appel. */
export function preload() {
  for (const name of Object.keys(ASSETS)) loadAsset(name);
}

/**
 * Joue un son officiel. Renvoie une poignée { stop } ou null si indisponible
 * (l'appelant se rabat alors sur la synthèse).
 */
function playAsset(name, { loop = false, gain = 1, onFallback = null } = {}) {
  if (!enabled) return { stop() {} };

  const buffer = buffers.get(name);
  if (!buffer) {
    // Pas encore décodé : on charge, puis on joue si c'est toujours pertinent.
    const handle = { stopped: false, source: null, stop() { this.stopped = true; this.source?.stop(); } };
    loadAsset(name).then((loaded) => {
      if (handle.stopped) return;
      if (!loaded) {
        onFallback?.();
        return;
      }
      handle.source = startBuffer(loaded, loop, gain);
    });
    return handle;
  }

  const source = startBuffer(buffer, loop, gain);
  return { source, stop: () => { try { source.stop(); } catch { /* déjà arrêté */ } } };
}

function startBuffer(buffer, loop, gain) {
  const context = audio();
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = loop;

  const volume = context.createGain();
  volume.gain.value = gain;

  source.connect(volume);
  volume.connect(masterGain);
  source.start();
  return source;
}

// ── Synthèse de secours ───────────────────────────────────────────────────────

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

// ── Sons ponctuels ────────────────────────────────────────────────────────────

/** Message reçu — le « blop » de Skype. */
export const messageIn = () =>
  playAsset('message', {
    onFallback: () =>
      play([
        { freq: 660, duration: 0.09, gain: 0.18 },
        { freq: 880, start: 0.07, duration: 0.13, gain: 0.2 },
      ]),
  });

/** Message envoyé : plus discret, toujours synthétisé. */
export const messageOut = () => play([{ freq: 950, duration: 0.07, gain: 0.1 }]);

/** Mention : trois notes montantes, distinctes du message ordinaire. */
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

/** L'appel n'a pas abouti : personne n'a répondu, ou refus. */
export const callNotConnected = () =>
  playAsset('callNotConnected', {
    onFallback: () =>
      play([
        { freq: 480, duration: 0.3, gain: 0.16 },
        { freq: 400, start: 0.32, duration: 0.4, gain: 0.16 },
      ]),
  });

/** L'appel a échoué (erreur technique, correspondant injoignable). */
export const callFailed = () =>
  playAsset('callFailed', {
    onFallback: () => play([{ freq: 220, duration: 0.25, gain: 0.18, type: 'sawtooth', sweepTo: 150 }]),
  });

export const notify = () =>
  play([
    { freq: 1046, duration: 0.08, gain: 0.16 },
    { freq: 1318, start: 0.08, duration: 0.12, gain: 0.14 },
  ]);

export const error = () => play([{ freq: 220, duration: 0.22, gain: 0.18, type: 'sawtooth', sweepTo: 160 }]);

// ── Sons en boucle ────────────────────────────────────────────────────────────

let ringHandle = null;
let ringTimer = null;

/** Sonnerie d'appel entrant — le fichier officiel, en boucle. */
export function startRinging() {
  if (!enabled || ringHandle || ringTimer) return;

  ringHandle = playAsset('ring', {
    loop: true,
    onFallback: () => {
      ringHandle = null;
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
    },
  });
}

/** Tonalité d'appel sortant — le fichier officiel, en boucle. */
export function startDialing() {
  if (!enabled || ringHandle || ringTimer) return;

  ringHandle = playAsset('dialing', {
    loop: true,
    gain: 0.8,
    onFallback: () => {
      ringHandle = null;
      const beep = () =>
        play([
          { freq: 440, duration: 0.4, gain: 0.12 },
          { freq: 480, duration: 0.4, gain: 0.1 },
        ]);
      beep();
      ringTimer = setInterval(beep, 3000);
    },
  });
}

/** Arrête toute boucle en cours (sonnerie ou tonalité). */
export function stopRinging() {
  ringHandle?.stop();
  ringHandle = null;
  clearInterval(ringTimer);
  ringTimer = null;
}

/** Tonalités DTMF du pavé numérique (fréquences normalisées). */
const DTMF = {
  1: [697, 1209], 2: [697, 1336], 3: [697, 1477],
  4: [770, 1209], 5: [770, 1336], 6: [770, 1477],
  7: [852, 1209], 8: [852, 1336], 9: [852, 1477],
  '*': [941, 1209], 0: [941, 1336], '#': [941, 1477],
};

export function dtmf(key) {
  const pair = DTMF[key];
  if (!pair) return;
  play(pair.map((freq) => ({ freq, duration: 0.13, gain: 0.13 })));
}

/**
 * Réveille le contexte audio au premier geste utilisateur (politique autoplay)
 * et précharge les sons officiels dans la foulée.
 */
export function unlockAudio() {
  const handler = () => {
    try {
      audio();
      preload();
    } catch {
      /* ignoré */
    }
    document.removeEventListener('pointerdown', handler);
    document.removeEventListener('keydown', handler);
  };
  document.addEventListener('pointerdown', handler);
  document.addEventListener('keydown', handler);
}
