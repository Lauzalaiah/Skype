/**
 * Sons de Skype.
 *
 * Les sons officiels sont déclarés dans BIBLIOTHEQUE ci-dessous et chargés
 * depuis /assets/sounds/. Chaque son garde une synthèse Web Audio de secours :
 * si un fichier manque ou ne se décode pas, l'application reste sonore.
 *
 * ── Ajouter un son ────────────────────────────────────────────────────────
 *   1. Déposer le fichier dans public/assets/sounds/
 *   2. Ajouter une ligne dans BIBLIOTHEQUE
 *   3. L'appeler avec sound('maCle') ou via une fonction exportée dédiée
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
export const isSoundEnabled = () => enabled;

// ── Bibliothèque de sons ──────────────────────────────────────────────────────
//
//   file    : nom du fichier dans /assets/sounds/
//   source  : nom du fichier d'origine, pour pouvoir auditer la correspondance
//   usage   : l'événement exact — et unique — qui déclenche ce son
//   label   : libellé affiché dans les réglages
//   loop    : le son tourne en boucle jusqu'à stopRinging()
//   gain    : volume relatif (1 par défaut)
//   eager   : préchargé au démarrage (sinon chargé à la première utilisation)
//   secours : notes de synthèse jouées si le fichier est indisponible
//
// Chaque son ne doit servir qu'à l'événement décrit dans « usage ».
// Le test test/sons.test.js vérifie que cette table et le code ne divergent pas.

export const BIBLIOTHEQUE = {
  message: {
    file: 'skype-message.mp3',
    source: 'Skypenotification_.mp3',
    usage: 'Message texte reçu, conversation non ouverte',
    label: 'Message reçu',
    eager: true,
    secours: [
      { freq: 660, duration: 0.09, gain: 0.18 },
      { freq: 880, start: 0.07, duration: 0.13, gain: 0.2 },
    ],
  },
  ring: {
    file: 'skype-ring.mp3',
    source: 'Skypecall.mp3',
    usage: 'Appel entrant, quand aucun appel n’est déjà en cours',
    label: 'Sonnerie — classique',
    loop: true,
    eager: true,
    secours: [
      { freq: 587, duration: 0.16, gain: 0.24 },
      { freq: 698, start: 0.16, duration: 0.16, gain: 0.24 },
      { freq: 880, start: 0.32, duration: 0.16, gain: 0.24 },
      { freq: 1174, start: 0.48, duration: 0.3, gain: 0.26 },
      { freq: 880, start: 0.85, duration: 0.16, gain: 0.2 },
      { freq: 1174, start: 1.01, duration: 0.34, gain: 0.22 },
    ],
    secoursBoucle: 2600,
  },
  ringLong: {
    file: 'skype-ringtone-classic.mp3',
    source: 'Skype_ringtone_.mp3',
    usage: 'Appel entrant — variante choisie dans les réglages',
    label: 'Sonnerie — longue',
    loop: true,
    secours: null,
    secoursRepris: 'ring',   // même mélodie de secours que la sonnerie classique
    secoursBoucle: 2600,
  },
  ringAlt: {
    file: 'skype-ringtone-2.mp3',
    source: 'Sonnerieskype2.mp3',
    usage: 'Appel entrant — variante choisie dans les réglages',
    label: 'Sonnerie — variante 1',
    loop: true,
    secours: null,
    secoursRepris: 'ring',
    secoursBoucle: 2600,
  },
  ringAlt2: {
    file: 'skype-ringtone-3.mp3',
    source: 'Skypevideocall.mp3',
    usage: 'Appel entrant — variante choisie dans les réglages',
    label: 'Sonnerie — variante 2',
    loop: true,
    secours: null,
    secoursRepris: 'ring',
    secoursBoucle: 2600,
  },
  callStart: {
    file: 'skype-call-start.mp3',
    source: 'Skypestartcall.mp3',
    usage: 'L’appel est établi : la communication démarre',
    label: 'Début d’appel',
    secours: [
      { freq: 523, duration: 0.11, gain: 0.2 },
      { freq: 784, start: 0.1, duration: 0.16, gain: 0.2 },
    ],
  },
  voicemail: {
    file: 'skype-voicemail.mp3',
    source: 'Skypevoicemail.mp3',
    usage: 'Réception d’un message vocal',
    label: 'Message vocal reçu',
    secours: [
      { freq: 698, duration: 0.1, gain: 0.18 },
      { freq: 880, start: 0.1, duration: 0.18, gain: 0.18 },
    ],
  },
  dialing: {
    file: 'skype-dialing.mp3',
    source: 'Skypecallbipbip.mp3',
    usage: 'Appel sortant, pendant que ça sonne chez le correspondant',
    label: 'Tonalité d’appel',
    loop: true,
    gain: 0.8,
    eager: true,
    secours: [
      { freq: 440, duration: 0.4, gain: 0.12 },
      { freq: 480, duration: 0.4, gain: 0.1 },
    ],
    secoursBoucle: 3000,
  },
  callWaiting: {
    file: 'skype-call-waiting.mp3',
    source: 'Skypecallincall.mp3',
    usage: 'Appel entrant alors qu’une communication est déjà en cours',
    label: 'Appel en attente',
    secours: [
      { freq: 880, duration: 0.12, gain: 0.2 },
      { freq: 880, start: 0.24, duration: 0.12, gain: 0.2 },
    ],
  },
  callNotConnected: {
    file: 'skype-call-not-connected.mp3',
    source: 'Skypecallnotconnected.mp3',
    usage: 'Appel terminé sans avoir abouti : sans réponse, refusé ou annulé',
    label: 'Appel sans réponse',
    secours: [
      { freq: 480, duration: 0.3, gain: 0.16 },
      { freq: 400, start: 0.32, duration: 0.4, gain: 0.16 },
    ],
  },
  callFailed: {
    file: 'skype-call-failed.mp3',
    source: 'Skypecallfailed.mp3',
    usage: 'Appel impossible à démarrer : micro ou caméra inaccessible',
    label: 'Échec de l’appel',
    secours: [{ freq: 220, duration: 0.25, gain: 0.18, type: 'sawtooth', sweepTo: 150 }],
  },
  fileReceived: {
    file: 'skype-file-received.mp3',
    source: 'Skypefolderreceived.mp3',
    usage: 'Message reçu contenant une pièce jointe',
    label: 'Fichier reçu',
    secours: [
      { freq: 784, duration: 0.1, gain: 0.18 },
      { freq: 1046, start: 0.09, duration: 0.16, gain: 0.18 },
    ],
  },
  login: {
    file: 'skype-login.mp3',
    source: 'Skypelogin.mp3',
    usage: 'Connexion à Skype, et rien d’autre. Ne retentit pas au rechargement '
      + 'de la page ni à la reconnexion automatique du socket.',
    label: 'Connexion',
    secours: [
      { freq: 523, duration: 0.12, gain: 0.16 },
      { freq: 659, start: 0.11, duration: 0.12, gain: 0.16 },
      { freq: 784, start: 0.22, duration: 0.22, gain: 0.16 },
    ],
  },
  fileSent: {
    file: 'skype-file-sent.mp3',
    source: 'Skypeforwindowsnew.mp3',
    usage: 'Envoi d’un fichier ou d’une carte de contact depuis la conversation',
    label: 'Fichier envoyé',
    secours: [
      { freq: 1046, duration: 0.08, gain: 0.16 },
      { freq: 1318, start: 0.08, duration: 0.12, gain: 0.14 },
    ],
  },
};

const CHEMIN = '/assets/sounds/';

const buffers = new Map();
const loading = new Map();
const missing = new Set();

function loadSound(key) {
  const entry = BIBLIOTHEQUE[key];
  if (!entry?.file) return Promise.resolve(null);
  if (buffers.has(key)) return Promise.resolve(buffers.get(key));
  if (missing.has(key)) return Promise.resolve(null);
  if (loading.has(key)) return loading.get(key);

  const promise = fetch(CHEMIN + entry.file)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((data) => audio().decodeAudioData(data))
    .then((buffer) => {
      buffers.set(key, buffer);
      loading.delete(key);
      return buffer;
    })
    .catch((err) => {
      console.warn(`[sons] « ${key} » indisponible (${err.message}) — repli sur la synthèse.`);
      missing.add(key);
      loading.delete(key);
      return null;
    });

  loading.set(key, promise);
  return promise;
}

/** Précharge les sons marqués « eager ». */
export function preload() {
  return Promise.all(
    Object.entries(BIBLIOTHEQUE)
      .filter(([, entry]) => entry.eager)
      .map(([key]) => loadSound(key))
  );
}

/** Précharge la totalité de la bibliothèque (utilisé par les réglages). */
export const preloadAll = () => Promise.all(Object.keys(BIBLIOTHEQUE).map(loadSound));

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
  if (!enabled || !notes) return;
  try {
    notes.forEach(tone);
  } catch {
    /* audio indisponible (autoplay bloqué) : on ignore */
  }
};

/**
 * Notes de secours d'un son. Un son sans secours déclaré et sans renvoi
 * explicite ne joue rien : mieux vaut le silence qu'une mélodie qui n'a
 * aucun rapport avec l'événement.
 */
function secoursDe(key) {
  const entry = BIBLIOTHEQUE[key];
  if (!entry) return null;
  if (entry.secours) return entry.secours;
  if (entry.secoursRepris) return BIBLIOTHEQUE[entry.secoursRepris]?.secours ?? null;
  return null;
}

// ── Lecture ───────────────────────────────────────────────────────────────────

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

/**
 * Joue un son de la bibliothèque. Renvoie une poignée { stop }.
 * Si le fichier est indisponible, la synthèse de secours prend le relais.
 */
export function sound(key, { loop = null, gain = null } = {}) {
  if (!enabled) return { stop() {} };

  const entry = BIBLIOTHEQUE[key];
  if (!entry) {
    console.warn(`[sons] clé inconnue : ${key}`);
    return { stop() {} };
  }

  const enBoucle = loop ?? !!entry.loop;
  const volume = gain ?? entry.gain ?? 1;

  const jouerSecours = () => {
    const notes = secoursDe(key);
    play(notes);
    if (!enBoucle || !entry.secoursBoucle) return { stop() {} };
    const timer = setInterval(() => play(notes), entry.secoursBoucle);
    return { stop: () => clearInterval(timer) };
  };

  const buffer = buffers.get(key);
  if (buffer) {
    const source = startBuffer(buffer, enBoucle, volume);
    return { stop: () => { try { source.stop(); } catch { /* déjà arrêté */ } } };
  }
  if (missing.has(key)) return jouerSecours();

  // Pas encore décodé : on charge, puis on joue si c'est toujours pertinent.
  const handle = {
    stopped: false,
    inner: null,
    stop() {
      this.stopped = true;
      this.inner?.stop();
    },
  };
  loadSound(key).then((loaded) => {
    if (handle.stopped) return;
    if (!loaded) {
      handle.inner = jouerSecours();
      return;
    }
    const source = startBuffer(loaded, enBoucle, volume);
    handle.inner = { stop: () => { try { source.stop(); } catch { /* déjà arrêté */ } } };
  });
  return handle;
}

// ── Sons ponctuels ────────────────────────────────────────────────────────────

/** Message reçu — le « blop » de Skype. */
export const messageIn = () => sound('message');

/** Fichier ou photo reçu. */
export const fileReceived = () => sound('fileReceived');

/** Fichier ou carte de contact envoyé depuis la conversation. */
export const fileSent = () => sound('fileSent');

/** Connexion réussie. */
export const login = () => sound('login');

/**
 * Notification générale : demande de contact, réaction…
 * Synthétisée : aucun fichier officiel n'a encore été rattaché à cet
 * événement. Emplacement libre, voir docs/SONS.md.
 */
export const notify = () =>
  play([
    { freq: 1046, duration: 0.08, gain: 0.16 },
    { freq: 1318, start: 0.08, duration: 0.12, gain: 0.14 },
  ]);

/** Second appel entrant pendant un appel en cours. */
export const callWaiting = () => sound('callWaiting');

/** L'appel n'a pas abouti : personne n'a répondu, ou refus. */
export const callNotConnected = () => sound('callNotConnected');

/** L'appel a échoué (erreur technique, périphérique inaccessible). */
export const callFailed = () => sound('callFailed');

/** Message envoyé : discret, toujours synthétisé. */
export const messageOut = () => play([{ freq: 950, duration: 0.07, gain: 0.1 }]);

/** Mention : trois notes montantes, distinctes du message ordinaire. */
export const mention = () =>
  play([
    { freq: 880, duration: 0.1, gain: 0.2 },
    { freq: 1174, start: 0.1, duration: 0.1, gain: 0.2 },
    { freq: 1318, start: 0.2, duration: 0.16, gain: 0.18 },
  ]);

/** L'appel est établi : la communication démarre. */
export const callConnect = () => sound('callStart');

/** Message vocal reçu. */
export const voicemail = () => sound('voicemail');

/** Raccrochage. */
export const callEnd = () =>
  play([
    { freq: 587, duration: 0.12, gain: 0.18 },
    { freq: 392, start: 0.11, duration: 0.22, gain: 0.18 },
  ]);

export const error = () => play([{ freq: 220, duration: 0.22, gain: 0.18, type: 'sawtooth', sweepTo: 160 }]);

// ── Sonneries (en boucle) ─────────────────────────────────────────────────────

/** Sonneries proposées à l'utilisateur dans les réglages. */
export const SONNERIES = ['ring', 'ringLong', 'ringAlt', 'ringAlt2'];

let ringtone = 'ring';
export const setRingtone = (key) => {
  if (SONNERIES.includes(key)) ringtone = key;
};
export const getRingtone = () => ringtone;

let ringHandle = null;

/**
 * Sonnerie d'appel entrant, en boucle.
 * Audio ou vidéo, c'est la même : celle choisie dans les réglages.
 */
export function startRinging() {
  if (!enabled || ringHandle) return;
  ringHandle = sound(ringtone, { loop: true });
}

/** Tonalité d'appel sortant, en boucle. */
export function startDialing() {
  if (!enabled || ringHandle) return;
  ringHandle = sound('dialing', { loop: true });
}

/** Arrête toute boucle en cours (sonnerie ou tonalité). */
export function stopRinging() {
  ringHandle?.stop();
  ringHandle = null;
}

// ── Pavé numérique ────────────────────────────────────────────────────────────

/** Tonalités DTMF (fréquences normalisées, toujours synthétisées). */
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
 * et précharge les sons les plus courants.
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
