/**
 * Appels audio et vidéo (WebRTC), appels de groupe en maillage complet,
 * partage d'écran, sous-titres, main levée, et appels téléphoniques simulés.
 */
import { el, clear, $, $$ } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { api } from '../lib/api.js';
import { socket } from '../lib/socket.js';
import { state, setState, getChat, getUser, chatTitle, otherMember, notify } from '../state.js';
import { avatar, toast, menu, modal, confirm } from './common.js';
import { formatDuration } from '../lib/format.js';
import * as sounds from '../lib/sounds.js';

const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

/** Session d'appel courante. */
let session = null;

// ── Démarrage ─────────────────────────────────────────────────────────────────

export async function startCall(chat, { video = false, join = null } = {}) {
  if (session) {
    toast('Un appel est déjà en cours');
    return;
  }

  const media = await acquireMedia({ video });
  if (!media) return;

  session = createSession({ chat, video, stream: media, outgoing: !join });
  session.render();

  if (join) {
    session.callId = join;
    socket.send({ type: 'call:join', callId: join, video });
  } else {
    socket.send({ type: 'call:start', chatId: chat.id, callType: video ? 'video' : 'audio', video });
    sounds.startDialing();
  }
}

/** Réponse à un appel entrant. */
export async function answerCall(call, { video = false } = {}) {
  sounds.stopRinging();
  setState({ incomingCall: null });
  document.querySelector('.incoming-call')?.remove();

  const chat = getChat(call.chatId);
  if (!chat) return;

  if (session) session.hangup();

  const media = await acquireMedia({ video });
  if (!media) {
    socket.send({ type: 'call:decline', callId: call.id });
    return;
  }

  session = createSession({ chat, video, stream: media, outgoing: false });
  session.callId = call.id;
  session.render();
  socket.send({ type: 'call:join', callId: call.id, video });
  sounds.callConnect();
}

export function declineCall(call) {
  sounds.stopRinging();
  socket.send({ type: 'call:decline', callId: call.id });
  setState({ incomingCall: null });
  document.querySelector('.incoming-call')?.remove();
}

async function acquireMedia({ video }) {
  const settings = state.user?.settings?.calls || {};
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: settings.noiseSuppression !== false,
        autoGainControl: true,
      },
      video: video ? { width: { ideal: settings.hdVideo ? 1280 : 640 }, height: { ideal: settings.hdVideo ? 720 : 480 }, facingMode: 'user' } : false,
    });
  } catch (err) {
    // Sans caméra, on retente en audio seul plutôt que d'échouer.
    if (video) {
      try {
        toast('Caméra indisponible : appel audio uniquement');
        return await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        /* micro également indisponible */
      }
    }
    sounds.callFailed();
    toast('Micro ou caméra inaccessible. Vérifiez les autorisations du navigateur.', { type: 'error' });
    return null;
  }
}

// ── Session d'appel ───────────────────────────────────────────────────────────

function createSession({ chat, video, stream, outgoing }) {
  const peers = new Map();       // userId -> { pc, stream, state }
  const tiles = new Map();       // userId -> élément
  const analysers = new Map();   // userId -> détection de parole

  let callId = null;
  let localStream = stream;
  let screenStream = null;
  let startedAt = null;
  let minimized = false;
  let layout = 'grid';
  let captionsOn = false;
  let handRaised = false;
  let timerInterval = null;
  let audioContext = null;

  const self = {
    muted: false,
    video,
    screen: false,
  };

  // ── Interface ──────────────────────────────────────────────────────────────

  const stage = el('div.call-stage', { dataset: { count: '1', layout } });
  const timerLabel = el('span.call-screen__timer', { text: outgoing ? 'Appel en cours…' : 'Connexion…' });
  const titleLabel = el('span.call-screen__title', { text: chatTitle(chat) });
  const captionsNode = el('div.captions.hidden');
  const sideNode = el('div.hidden');

  const controls = el('div.call-controls');
  const screenNode = el('div.call-screen', {}, [
    el('div.call-screen__header', {}, [
      el('button.icon-btn', { style: { color: '#fff' }, title: 'Réduire', 'aria-label': 'Réduire', onclick: () => toggleMinimize() }, icon('minimize')),
      el('div', {}, [titleLabel, el('div', {}, timerLabel)]),
      el('span.spacer'),
      qualityIndicator(),
      el('button.icon-btn', { style: { color: '#fff' }, title: 'Plein écran', 'aria-label': 'Plein écran', onclick: toggleFullscreen }, icon('fullscreen')),
    ]),
    stage,
    captionsNode,
    sideNode,
    controls,
  ]);

  function qualityIndicator() {
    const bars = el('span.call-screen__quality-bars', {}, [el('i.on'), el('i.on'), el('i.on'), el('i')]);
    return el('span.call-screen__quality', {}, [bars, el('span', { text: 'Bonne connexion' })]);
  }

  // ── Commandes ──────────────────────────────────────────────────────────────

  const control = (name, iconName, label, onClick, extraClass = '') => {
    const button = el(`button.icon-btn${extraClass}`, { title: label, 'aria-label': label, onclick: onClick }, icon(iconName, 'icon icon--lg'));
    const wrapper = el(`div.call-control${name === 'hangup' ? '.call-control--hangup' : ''}`, {}, [
      button,
      el('span.call-controls__label', { text: label }),
    ]);
    wrapper.button = button;
    return wrapper;
  };

  const micControl = control('mic', 'mic', 'Micro', () => toggleMute());
  const videoControl = control('video', 'video', 'Caméra', () => toggleVideo());
  const screenControl = control('screen', 'screen', 'Partager', () => toggleScreenShare());
  const handControl = control('hand', 'hand', 'Lever la main', () => toggleHand());
  const moreControl = control('more', 'more', 'Plus', (e) => openMoreMenu(e.currentTarget));
  const hangupControl = control('hangup', 'hangup', 'Raccrocher', () => hangup());

  controls.append(micControl, videoControl, screenControl, handControl, moreControl, hangupControl);

  function openMoreMenu(anchor) {
    menu(
      [
        {
          label: layout === 'grid' ? 'Vue intervenant' : 'Vue grille',
          icon: 'grid',
          onClick: () => {
            layout = layout === 'grid' ? 'speaker' : 'grid';
            stage.dataset.layout = layout;
            updateStage();
          },
        },
        { label: captionsOn ? 'Masquer les sous-titres' : 'Sous-titres en direct', icon: 'translate', onClick: toggleCaptions },
        { label: 'Participants', icon: 'people', onClick: showParticipants },
        { label: 'Discussion pendant l’appel', icon: 'chat', onClick: showCallChat },
        'divider',
        { label: 'Ajouter des personnes', icon: 'person-add', onClick: async () => (await import('./modals.js')).openAddMembers(chat) },
        { label: 'Pavé numérique', icon: 'dialpad', onClick: showDtmfPad },
        {
          label: 'Copier le lien de l’appel',
          icon: 'link',
          onClick: async () => {
            const { copyToClipboard } = await import('../lib/dom.js');
            copyToClipboard(`${location.origin}/?join=${chat.joinLink || chat.id}`);
            toast('Lien de l’appel copié');
          },
        },
      ],
      { anchor, align: 'end' }
    );
  }

  // ── Tuiles vidéo ───────────────────────────────────────────────────────────

  function tileFor(userId, mediaStream, { isSelf = false } = {}) {
    let tile = tiles.get(userId);
    const user = isSelf ? state.user : getUser(userId) || { displayName: 'Participant', id: userId };

    if (!tile) {
      const videoNode = el('video', { autoplay: true, playsinline: true, muted: isSelf });
      const badges = el('div.call-tile__badges');
      const placeholder = el('div.call-tile__placeholder', {}, [avatar(user, { size: 'xl', presence: false })]);

      tile = el(`div.call-tile${isSelf ? '.call-tile--self' : ''}`, { dataset: { user: userId } }, [
        placeholder,
        videoNode,
        el('div.call-tile__name', {}, [
          el('span', { text: isSelf ? 'Vous' : user.displayName }),
        ]),
        badges,
      ]);
      tile.videoNode = videoNode;
      tile.placeholder = placeholder;
      tile.badges = badges;
      tiles.set(userId, tile);
      stage.append(tile);
    }

    if (mediaStream && tile.videoNode.srcObject !== mediaStream) {
      tile.videoNode.srcObject = mediaStream;
      tile.videoNode.play?.().catch(() => {});
      attachSpeechDetection(userId, mediaStream, tile);
    }

    updateTile(userId);
    updateStage();
    return tile;
  }

  function updateTile(userId) {
    const tile = tiles.get(userId);
    if (!tile) return;

    const isSelf = userId === state.user.id;
    const info = isSelf ? self : peers.get(userId)?.state || {};
    const mediaStream = tile.videoNode.srcObject;
    const hasVideo = mediaStream?.getVideoTracks?.().some((t) => t.enabled && t.readyState === 'live');

    tile.videoNode.style.display = hasVideo ? '' : 'none';
    tile.placeholder.style.display = hasVideo ? 'none' : '';
    tile.classList.toggle('is-screen', !!info.screen);
    tile.classList.toggle('is-hand', !!info.hand);

    clear(tile.badges);
    if (info.muted) tile.badges.append(el('div.call-tile__badge.call-tile__badge--muted', {}, icon('mic-off', 'icon icon--sm')));
    if (info.screen) tile.badges.append(el('div.call-tile__badge', {}, icon('screen', 'icon icon--sm')));
  }

  function updateStage() {
    stage.dataset.count = String(tiles.size);
    if (layout === 'speaker') {
      const speaker = [...tiles.values()].find((t) => t.classList.contains('is-screen')) || [...tiles.values()].find((t) => !t.classList.contains('call-tile--self')) || [...tiles.values()][0];
      let offset = 12;
      for (const tile of tiles.values()) {
        const isSpeaker = tile === speaker;
        tile.classList.toggle('is-speaker', isSpeaker);
        if (!isSpeaker) {
          tile.style.right = `${offset}px`;
          offset += 162;
        } else {
          tile.style.right = '';
        }
      }
    } else {
      for (const tile of tiles.values()) {
        tile.classList.remove('is-speaker');
        tile.style.right = '';
      }
    }
  }

  /** Contour vert autour de la personne qui parle. */
  function attachSpeechDetection(userId, mediaStream, tile) {
    if (!mediaStream.getAudioTracks().length) return;
    try {
      audioContext ||= new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.75;
      audioContext.createMediaStreamSource(mediaStream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      analysers.set(userId, { analyser, data, tile });
    } catch {
      /* détection de parole indisponible */
    }
  }

  let speechFrame;
  function speechLoop() {
    for (const [userId, { analyser, data, tile }] of analysers) {
      analyser.getByteFrequencyData(data);
      const level = data.reduce((sum, value) => sum + value, 0) / data.length;
      const speaking = level > 22 && !(userId === state.user.id && self.muted);
      tile.classList.toggle('is-speaking', speaking);
      if (speaking && captionsOn) pushCaption(userId);
    }
    speechFrame = requestAnimationFrame(speechLoop);
  }

  // ── Commandes ──────────────────────────────────────────────────────────────

  function toggleMute() {
    self.muted = !self.muted;
    localStream.getAudioTracks().forEach((track) => (track.enabled = !self.muted));
    micControl.button.classList.toggle('is-off', self.muted);
    micControl.button.replaceChild(icon(self.muted ? 'mic-off' : 'mic', 'icon icon--lg'), micControl.button.firstChild);
    micControl.querySelector('.call-controls__label').textContent = self.muted ? 'Réactiver' : 'Micro';
    broadcastState();
    updateTile(state.user.id);
  }

  async function toggleVideo() {
    const track = localStream.getVideoTracks()[0];

    if (track) {
      self.video = !self.video;
      track.enabled = self.video;
    } else if (!self.video) {
      // Aucune piste vidéo : on démarre la caméra à la volée.
      try {
        const camera = await navigator.mediaDevices.getUserMedia({ video: true });
        const newTrack = camera.getVideoTracks()[0];
        localStream.addTrack(newTrack);
        for (const { pc } of peers.values()) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) await sender.replaceTrack(newTrack);
          else pc.addTrack(newTrack, localStream);
        }
        self.video = true;
      } catch {
        toast('Caméra inaccessible', { type: 'error' });
        return;
      }
    }

    videoControl.button.classList.toggle('is-off', !self.video);
    videoControl.button.replaceChild(icon(self.video ? 'video' : 'video-off', 'icon icon--lg'), videoControl.button.firstChild);
    broadcastState();
    tileFor(state.user.id, localStream, { isSelf: true });
    updateTile(state.user.id);
  }

  async function toggleScreenShare() {
    if (self.screen) return stopScreenShare();

    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, cursor: 'always' },
        audio: true,
      });
    } catch {
      return; // l'utilisateur a annulé
    }

    const screenTrack = screenStream.getVideoTracks()[0];
    screenTrack.onended = () => stopScreenShare();

    for (const { pc } of peers.values()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(screenTrack);
      else pc.addTrack(screenTrack, screenStream);
    }

    self.screen = true;
    screenControl.button.classList.add('is-on');
    screenControl.querySelector('.call-controls__label').textContent = 'Arrêter';
    broadcastState();

    const tile = tiles.get(state.user.id);
    if (tile) {
      tile.videoNode.srcObject = screenStream;
      tile.classList.add('is-screen');
      updateTile(state.user.id);
    }
    toast('Vous partagez votre écran');
  }

  async function stopScreenShare() {
    if (!self.screen) return;
    screenStream?.getTracks().forEach((track) => track.stop());
    screenStream = null;
    self.screen = false;

    const cameraTrack = localStream.getVideoTracks()[0] || null;
    for (const { pc } of peers.values()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender && cameraTrack) await sender.replaceTrack(cameraTrack);
    }

    screenControl.button.classList.remove('is-on');
    screenControl.querySelector('.call-controls__label').textContent = 'Partager';
    broadcastState();

    const tile = tiles.get(state.user.id);
    if (tile) {
      tile.videoNode.srcObject = localStream;
      tile.classList.remove('is-screen');
      updateTile(state.user.id);
    }
  }

  function toggleHand() {
    handRaised = !handRaised;
    self.hand = handRaised;
    handControl.button.classList.toggle('is-on', handRaised);
    broadcastState();
    updateTile(state.user.id);
    if (handRaised) toast('Vous avez levé la main ✋');
  }

  function toggleCaptions() {
    captionsOn = !captionsOn;
    captionsNode.classList.toggle('hidden', !captionsOn);
    if (captionsOn) {
      clear(captionsNode);
      captionsNode.append(el('span.dim', { text: 'Sous-titres en direct activés…' }));
    }
  }

  // Sous-titres : reconnaissance vocale du navigateur si disponible.
  let recognition = null;
  function pushCaption(userId) {
    if (userId !== state.user.id || recognition) return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      clear(captionsNode);
      captionsNode.append(el('span.dim', { text: 'Sous-titres non pris en charge par ce navigateur.' }));
      return;
    }
    recognition = new Recognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const text = [...event.results].slice(-2).map((r) => r[0].transcript).join(' ');
      clear(captionsNode);
      captionsNode.append(el('span.captions__speaker', { text: 'Vous : ' }), el('span', { text }));
    };
    recognition.onend = () => {
      if (captionsOn && session) recognition.start();
    };
    try {
      recognition.start();
    } catch {
      recognition = null;
    }
  }

  function showParticipants() {
    const list = el('div.call-side__body');
    const everyone = [
      { userId: state.user.id, user: state.user, ...self },
      ...[...peers.entries()].map(([userId, peer]) => ({ userId, user: getUser(userId), ...peer.state })),
    ];
    for (const participant of everyone) {
      list.append(
        el('div.person-row', {}, [
          avatar(participant.user || { displayName: '?' }, { size: 'md' }),
          el('div.person-row__body', {}, [
            el('div.person-row__name', { text: participant.userId === state.user.id ? 'Vous' : participant.user?.displayName || 'Participant' }),
            el('div.person-row__sub', { text: participant.screen ? 'Partage son écran' : participant.muted ? 'Micro coupé' : 'Dans l’appel' }),
          ]),
          participant.hand ? el('span', { text: '✋' }) : null,
          icon(participant.muted ? 'mic-off' : 'mic', 'icon icon--sm'),
        ])
      );
    }
    openSide('Participants', list);
  }

  async function showCallChat() {
    const { renderConversation } = await import('./conversation.js');
    openSide('Discussion', el('div.call-side__body', {}, el('p.dim', { text: 'Ouvrez la conversation dans la fenêtre principale pour discuter pendant l’appel.' })));
    toast('La discussion reste accessible derrière l’appel');
  }

  function showDtmfPad() {
    const display = el('div.dialpad__display');
    let digits = '';
    const grid = el('div.dialpad__grid');
    for (const digit of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']) {
      grid.append(
        el('button.dialpad__key', {
          onclick: () => {
            digits += digit;
            display.textContent = digits;
            sounds.dtmf(digit);
          },
        }, el('span.dialpad__digit', { text: digit }))
      );
    }
    openSide('Clavier', el('div.call-side__body', {}, el('div.dialpad', {}, [display, grid])));
  }

  function openSide(title, content) {
    clear(sideNode);
    sideNode.className = 'call-side';
    sideNode.append(
      el('div.call-side__header', {}, [
        el('strong', { text: title }),
        el('span.spacer'),
        el('button.icon-btn', { 'aria-label': 'Fermer', onclick: () => { sideNode.className = 'hidden'; clear(sideNode); } }, icon('close')),
      ]),
      content
    );
  }

  function toggleMinimize() {
    minimized = !minimized;
    screenNode.classList.toggle('is-minimized', minimized);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else screenNode.requestFullscreen?.().catch(() => {});
  }

  function broadcastState() {
    if (!callId) return;
    socket.send({ type: 'call:state', callId, state: { muted: self.muted, video: self.video, screen: self.screen, hand: self.hand } });
  }

  // ── WebRTC ─────────────────────────────────────────────────────────────────

  function createPeer(userId, shouldOffer) {
    if (peers.has(userId)) return peers.get(userId);

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, bundlePolicy: 'max-bundle' });
    const remoteStream = new MediaStream();
    const peer = { pc, stream: remoteStream, state: { muted: false, video: false, screen: false, hand: false }, pendingCandidates: [] };
    peers.set(userId, peer);

    for (const track of localStream.getTracks()) pc.addTrack(track, localStream);

    pc.ontrack = (event) => {
      for (const track of event.streams[0]?.getTracks() || [event.track]) {
        if (!remoteStream.getTracks().includes(track)) remoteStream.addTrack(track);
      }
      peer.state.video = remoteStream.getVideoTracks().some((t) => t.readyState === 'live');
      tileFor(userId, remoteStream);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.send({ type: 'call:signal', callId, to: userId, signal: { candidate: event.candidate } });
      }
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) removePeer(userId);
      if (pc.connectionState === 'connected' && !startedAt) beginTimer();
    };

    pc.onnegotiationneeded = async () => {
      if (!shouldOffer) return;
      try {
        await pc.setLocalDescription(await pc.createOffer());
        socket.send({ type: 'call:signal', callId, to: userId, signal: { sdp: pc.localDescription } });
      } catch (err) {
        console.warn('[call] négociation', err);
      }
    };

    tileFor(userId, remoteStream);
    return peer;
  }

  function removePeer(userId) {
    const peer = peers.get(userId);
    if (!peer) return;
    peer.pc.close();
    peers.delete(userId);
    analysers.delete(userId);
    tiles.get(userId)?.remove();
    tiles.delete(userId);
    updateStage();

    // Plus personne : l'appel se termine.
    if (!peers.size && startedAt) {
      toast('Votre correspondant a quitté l’appel');
      hangup();
    }
  }

  async function handleSignal({ from, signal }) {
    const peer = peers.get(from) || createPeer(from, false);
    const { pc } = peer;

    try {
      if (signal.sdp) {
        const description = new RTCSessionDescription(signal.sdp);
        // Résolution de collision : le pair au plus petit identifiant cède.
        const collision = description.type === 'offer' && (pc.signalingState !== 'stable' || pc.makingOffer);
        if (collision && state.user.id > from) return;

        await pc.setRemoteDescription(description);
        for (const candidate of peer.pendingCandidates.splice(0)) {
          await pc.addIceCandidate(candidate).catch(() => {});
        }
        if (description.type === 'offer') {
          await pc.setLocalDescription(await pc.createAnswer());
          socket.send({ type: 'call:signal', callId, to: from, signal: { sdp: pc.localDescription } });
        }
      } else if (signal.candidate) {
        const candidate = new RTCIceCandidate(signal.candidate);
        if (pc.remoteDescription?.type) await pc.addIceCandidate(candidate).catch(() => {});
        else peer.pendingCandidates.push(candidate);
      }
    } catch (err) {
      console.warn('[call] signal', err);
    }
  }

  function beginTimer() {
    if (startedAt) return;
    startedAt = Date.now();
    sounds.stopRinging();
    sounds.callConnect();
    timerInterval = setInterval(() => {
      timerLabel.textContent = formatDuration((Date.now() - startedAt) / 1000);
    }, 1000);
    timerLabel.textContent = '0:00';
  }

  function hangup() {
    if (!session) return;
    if (callId) socket.send({ type: 'call:leave', callId });
    destroy();
  }

  function destroy() {
    clearInterval(timerInterval);
    cancelAnimationFrame(speechFrame);
    sounds.stopRinging();
    if (startedAt) sounds.callEnd();

    recognition?.stop?.();
    for (const { pc } of peers.values()) pc.close();
    peers.clear();
    localStream?.getTracks().forEach((track) => track.stop());
    screenStream?.getTracks().forEach((track) => track.stop());
    audioContext?.close().catch(() => {});

    screenNode.remove();
    session = null;
    setState({ activeCall: null });
  }

  // ── Événements serveur ─────────────────────────────────────────────────────

  const off = [
    socket.on('call:started', ({ call }) => {
      callId = call.id;
      setState({ activeCall: { ...call, joined: true } });
    }),

    socket.on('call:participant-joined', ({ call, userId, shouldOffer }) => {
      callId = call.id;
      setState({ activeCall: { ...call, joined: true } });
      if (userId === state.user.id) return;
      sounds.stopRinging();
      createPeer(userId, shouldOffer);
      beginTimer();
    }),

    socket.on('call:signal', ({ from, signal, callId: incomingId }) => {
      if (incomingId !== callId) return;
      handleSignal({ from, signal });
    }),

    socket.on('call:state', ({ userId, state: peerState }) => {
      const peer = peers.get(userId);
      if (!peer) return;
      Object.assign(peer.state, peerState);
      updateTile(userId);
      updateStage();
    }),

    socket.on('call:participant-left', ({ userId }) => removePeer(userId)),

    socket.on('call:declined', ({ user }) => {
      if (chat.type === 'direct') toast(`${user?.displayName || 'Votre correspondant'} a refusé l’appel`);
    }),

    socket.on('call:ended', ({ callId: endedId, reason }) => {
      if (endedId !== callId) return;
      if (reason === 'missed') toast('Personne n’a répondu');
      // Appel jamais établi : on joue le son « appel non abouti » plutôt que
      // le raccrochage, comme le faisait Skype.
      const aboutit = !!startedAt;
      destroy();
      if (!aboutit && ['missed', 'declined', 'cancelled'].includes(reason)) sounds.callNotConnected();
    }),
  ];

  const originalDestroy = destroy;
  const wrappedDestroy = () => {
    for (const unsubscribe of off) unsubscribe();
    originalDestroy();
  };

  speechLoop();

  return {
    get callId() {
      return callId;
    },
    set callId(value) {
      callId = value;
    },
    chat,
    hangup: () => {
      if (callId) socket.send({ type: 'call:leave', callId });
      wrappedDestroy();
    },
    render() {
      document.getElementById('overlays').append(screenNode);
      tileFor(state.user.id, localStream, { isSelf: true });
      if (!self.video) videoControl.button.classList.add('is-off');
      setState({ activeCall: { id: callId, chatId: chat.id, joined: true } });
    },
  };
}

// ── Appel entrant ─────────────────────────────────────────────────────────────

export function showIncomingCall({ call, from, chat }) {
  if (session && session.callId === call.id) return;
  document.querySelector('.incoming-call')?.remove();

  const settings = state.user?.settings?.notifications || {};
  if (settings.calls !== false && settings.sound !== false) {
    // Déjà en communication : un bip discret plutôt que la sonnerie complète,
    // qui couvrirait la conversation en cours.
    if (session) sounds.callWaiting();
    else sounds.startRinging({ video: call.video });
  }

  setState({ incomingCall: call });

  const isGroup = chat?.type === 'group';
  const node = el('div.incoming-call', { role: 'dialog', 'aria-label': 'Appel entrant' }, [
    avatar(from, { size: 'xl', presence: false, className: 'incoming-call__avatar' }),
    el('div.incoming-call__name', { text: isGroup ? chat.topic : from.displayName }),
    el('div.incoming-call__type', {
      text: `${call.video ? 'Appel vidéo' : 'Appel audio'}${isGroup ? ` · de ${from.displayName}` : ''}`,
    }),
    el('div.incoming-call__actions', {}, [
      el('button.incoming-call__btn.incoming-call__btn--decline', { title: 'Refuser', 'aria-label': 'Refuser', onclick: () => declineCall(call) }, icon('hangup', 'icon icon--lg')),
      el('button.incoming-call__btn.incoming-call__btn--accept', { title: 'Répondre', 'aria-label': 'Répondre', onclick: () => answerCall(call, { video: false }) }, icon('call', 'icon icon--lg')),
      call.video
        ? el('button.incoming-call__btn.incoming-call__btn--video', { title: 'Répondre en vidéo', 'aria-label': 'Répondre en vidéo', onclick: () => answerCall(call, { video: true }) }, icon('video', 'icon icon--lg'))
        : null,
    ]),
    el('div.incoming-call__quick', {},
      ['Je te rappelle', 'Je suis en réunion', 'En route !', 'Je ne peux pas parler'].map((text) =>
        el('button', {
          text,
          onclick: async () => {
            declineCall(call);
            try {
              await api.send(call.chatId, { content: text });
            } catch {
              /* la conversation n'est peut-être plus accessible */
            }
          },
        })
      )
    ),
  ]);

  document.getElementById('overlays').append(node);

  // Notification système si la fenêtre n'est pas au premier plan.
  if (document.hidden && Notification?.permission === 'granted') {
    const notification = new Notification(`${from.displayName} vous appelle`, {
      body: call.video ? 'Appel vidéo Skype' : 'Appel audio Skype',
      icon: from.avatar || undefined,
      tag: `call-${call.id}`,
      requireInteraction: true,
    });
    notification.onclick = () => {
      window.focus();
      answerCall(call, { video: call.video });
    };
  }
}

export function dismissIncomingCall(callId) {
  if (state.incomingCall?.id !== callId) return;
  sounds.stopRinging();
  setState({ incomingCall: null });
  document.querySelector('.incoming-call')?.remove();
}

export const activeSession = () => session;
export const hangupActiveCall = () => session?.hangup();

// ── Appel téléphonique (Skype Credit) ────────────────────────────────────────

export async function startPhoneCall(number) {
  const rate = 0.021;
  const credit = state.user.credit ?? 0;
  if (credit < rate) {
    const topUp = await confirm({
      title: 'Crédit insuffisant',
      message: 'Rechargez votre crédit Skype pour appeler ce numéro.',
      confirmLabel: 'Recharger 10 €',
    });
    if (topUp) {
      const { credit: updated } = await api.topUp(10);
      state.user.credit = updated;
      toast('Crédit rechargé');
    }
    return;
  }

  const startedAt = Date.now();
  const timer = el('div', { style: { fontSize: '1.6em', fontWeight: '300', margin: '10px 0' }, text: '0:00' });
  const interval = setInterval(() => (timer.textContent = formatDuration((Date.now() - startedAt) / 1000)), 1000);

  sounds.startDialing();
  setTimeout(() => {
    sounds.stopRinging();
    sounds.callConnect();
  }, 3200);

  const instance = modal({
    title: 'Appel en cours',
    size: 'narrow',
    closable: false,
    body: el('div.center', {}, [
      el('div.avatar.avatar--xl', { style: { margin: '0 auto 14px', background: 'var(--accent)' } }, icon('call', 'icon icon--xl')),
      el('div', { style: { fontSize: '1.2em', fontWeight: '700' }, text: number }),
      el('div.dim', { style: { fontSize: '0.85em' }, text: 'Appel via le crédit Skype' }),
      timer,
      el('div.dim', { style: { fontSize: '0.8em' }, text: `Tarif : ${rate.toFixed(3)} €/min` }),
    ]),
    footer: [
      el('button.btn.btn--danger', {
        text: 'Raccrocher',
        onclick: async () => {
          clearInterval(interval);
          sounds.stopRinging();
          sounds.callEnd();
          instance.close();
          const minutes = Math.max(1, Math.ceil((Date.now() - startedAt) / 60000));
          try {
            const { credit, cost } = await api.callPhone(number, minutes);
            state.user.credit = credit;
            toast(`Appel terminé · ${cost.toFixed(3)} € débités`);
            const { calls } = await api.calls();
            setState({ calls });
          } catch (err) {
            toast(err.message, { type: 'error' });
          }
        },
      }),
    ],
  });
}
