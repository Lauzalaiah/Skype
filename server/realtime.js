/**
 * Temps réel : présence, saisie en cours, signalisation WebRTC des appels.
 */
import { db, save } from './store.js';
import * as M from './models.js';

export class Hub {
  constructor() {
    this.sockets = new Map();      // userId -> Set<WebSocketConnection>
    this.activeCalls = new Map();  // callId -> état de l'appel
    this.typing = new Map();       // chatId -> Map<userId, timeout>
  }

  // ── Connexions ──────────────────────────────────────────────────────────────

  register(userId, socket) {
    if (!this.sockets.has(userId)) this.sockets.set(userId, new Set());
    this.sockets.get(userId).add(socket);

    const user = db.users[userId];
    const wasOffline = user.status === 'offline';
    if (user.manualStatus !== 'invisible') user.status = user.manualStatus || 'online';
    else user.status = 'invisible';
    user.lastSeen = Date.now();
    save();

    if (wasOffline) this.broadcastPresence(userId);
    socket.send({ type: 'ready', user: M.publicUser(user, userId), serverTime: Date.now() });
  }

  unregister(userId, socket) {
    const set = this.sockets.get(userId);
    if (!set) return;
    set.delete(socket);
    if (set.size) return;

    this.sockets.delete(userId);
    const user = db.users[userId];
    if (user) {
      user.status = 'offline';
      user.lastSeen = Date.now();
      save();
    }
    // On raccroche proprement les appels laissés en suspens.
    for (const [callId, call] of this.activeCalls) {
      if (call.participants.has(userId)) this.leaveCall(callId, userId);
    }
    this.broadcastPresence(userId);
  }

  isOnline = (userId) => this.sockets.has(userId);

  // ── Envoi ───────────────────────────────────────────────────────────────────

  sendToUser(userId, payload) {
    const set = this.sockets.get(userId);
    if (!set) return false;
    for (const socket of set) socket.send(payload);
    return true;
  }

  sendToUserExcept(userId, payload, exceptSocket) {
    const set = this.sockets.get(userId);
    if (!set) return;
    for (const socket of set) if (socket !== exceptSocket) socket.send(payload);
  }

  broadcastToChat(chat, payload, exceptUserId = null) {
    for (const member of chat.members) {
      if (member.userId === exceptUserId) continue;
      this.sendToUser(member.userId, payload);
    }
  }

  broadcastToContacts(userId, payload) {
    const user = db.users[userId];
    if (!user) return;
    for (const contactId of user.contacts) this.sendToUser(contactId, payload);
  }

  broadcastPresence(userId) {
    const user = db.users[userId];
    if (!user) return;
    const visible = user.manualStatus !== 'invisible';
    const payload = {
      type: 'presence',
      userId,
      status: visible ? user.status : 'offline',
      lastSeen: visible ? user.lastSeen : null,
    };
    // Contacts + toute personne partageant une conversation.
    const recipients = new Set(user.contacts);
    for (const chat of M.chatsForUser(userId)) {
      for (const member of chat.members) if (member.userId !== userId) recipients.add(member.userId);
    }
    for (const recipient of recipients) this.sendToUser(recipient, payload);
    this.sendToUser(userId, { ...payload, status: user.manualStatus });
  }

  syncContacts(...userIds) {
    for (const userId of userIds) this.sendToUser(userId, { type: 'contacts:sync' });
  }

  // ── Saisie en cours ─────────────────────────────────────────────────────────

  setTyping(chatId, userId, isTyping) {
    const chat = db.chats[chatId];
    if (!chat || !M.isMember(chat, userId)) return;
    const user = db.users[userId];
    if (user?.settings?.privacy?.showTypingIndicator === false) return;

    if (!this.typing.has(chatId)) this.typing.set(chatId, new Map());
    const chatTyping = this.typing.get(chatId);
    clearTimeout(chatTyping.get(userId));

    if (isTyping) {
      // Coupure automatique si le client oublie d'envoyer l'arrêt.
      chatTyping.set(userId, setTimeout(() => this.setTyping(chatId, userId, false), 6000));
    } else {
      chatTyping.delete(userId);
    }
    this.broadcastToChat(chat, { type: 'typing', chatId, userId, isTyping }, userId);
  }

  // ── Appels (signalisation WebRTC) ───────────────────────────────────────────

  startCall(userId, { chatId, callType = 'audio', video = false }) {
    const chat = db.chats[chatId];
    if (!chat || !M.isMember(chat, userId)) return null;

    // Un appel déjà en cours sur cette conversation : on rejoint au lieu de doubler.
    const existing = [...this.activeCalls.values()].find((c) => c.chatId === chatId && c.status !== 'ended');
    if (existing) {
      this.joinCall(existing.id, userId, video);
      return existing;
    }

    const call = {
      id: 'call_' + Math.random().toString(36).slice(2, 11),
      chatId,
      initiatorId: userId,
      type: callType,
      video,
      status: 'ringing',
      participants: new Map([[userId, { video, muted: false, screen: false, joinedAt: Date.now(), hand: false }]]),
      invited: new Set(chat.members.map((m) => m.userId)),
      startedAt: Date.now(),
      answeredAt: null,
      recording: false,
    };
    this.activeCalls.set(call.id, call);

    const payload = {
      type: 'call:incoming',
      call: this.callView(call),
      from: M.publicUser(db.users[userId]),
      chat: M.chatView(chat, userId),
    };
    for (const member of chat.members) {
      if (member.userId === userId) continue;
      const target = db.users[member.userId];
      if (target?.settings?.privacy?.whoCanCall === 'contacts' && !target.contacts.includes(userId)) continue;
      this.sendToUser(member.userId, payload);
    }
    this.sendToUser(userId, { type: 'call:started', call: this.callView(call) });

    // Appel manqué au bout de 45 s sans réponse.
    call.ringTimer = setTimeout(() => {
      if (call.status === 'ringing') this.endCall(call.id, 'missed');
    }, 45000);

    return call;
  }

  joinCall(callId, userId, video = false) {
    const call = this.activeCalls.get(callId);
    if (!call) return null;
    const chat = db.chats[call.chatId];
    if (!chat || !M.isMember(chat, userId)) return null;

    if (call.status === 'ringing') {
      call.status = 'active';
      call.answeredAt = Date.now();
      clearTimeout(call.ringTimer);
    }
    call.participants.set(userId, { video, muted: false, screen: false, joinedAt: Date.now(), hand: false });

    const view = this.callView(call);
    for (const participantId of call.participants.keys()) {
      this.sendToUser(participantId, {
        type: 'call:participant-joined',
        call: view,
        userId,
        user: M.publicUser(db.users[userId]),
        // Le nouvel arrivant crée les offres vers les participants déjà présents.
        shouldOffer: participantId !== userId,
      });
    }
    // Les autres appareils de l'appelé arrêtent de sonner.
    this.sendToUser(userId, { type: 'call:answered-elsewhere', callId });
    return call;
  }

  declineCall(callId, userId) {
    const call = this.activeCalls.get(callId);
    if (!call) return;
    call.invited.delete(userId);
    for (const participantId of call.participants.keys()) {
      this.sendToUser(participantId, { type: 'call:declined', callId, userId, user: M.publicUser(db.users[userId]) });
    }
    const chat = db.chats[call.chatId];
    // Appel individuel refusé : il se termine.
    if (chat?.type === 'direct' && call.status === 'ringing') this.endCall(callId, 'declined');
  }

  leaveCall(callId, userId) {
    const call = this.activeCalls.get(callId);
    if (!call) return;
    call.participants.delete(userId);

    for (const participantId of call.participants.keys()) {
      this.sendToUser(participantId, { type: 'call:participant-left', callId, userId });
    }
    this.sendToUser(userId, { type: 'call:ended', callId, reason: 'left' });

    if (call.participants.size <= 1) this.endCall(callId, call.answeredAt ? 'completed' : 'cancelled');
  }

  endCall(callId, reason = 'completed') {
    const call = this.activeCalls.get(callId);
    if (!call) return;
    clearTimeout(call.ringTimer);
    call.status = 'ended';
    call.endedAt = Date.now();
    this.activeCalls.delete(callId);

    const chat = db.chats[call.chatId];
    const everyone = new Set([...call.participants.keys(), ...call.invited]);
    for (const userId of everyone) this.sendToUser(userId, { type: 'call:ended', callId, reason });

    const record = M.recordCall({
      chatId: call.chatId,
      initiatorId: call.initiatorId,
      type: call.video ? 'video' : call.type,
      participants: [...everyone],
      status: reason === 'missed' || reason === 'declined' ? reason : call.answeredAt ? 'completed' : 'cancelled',
      startedAt: call.answeredAt || call.startedAt,
      endedAt: call.endedAt,
    });

    if (chat) {
      const label =
        reason === 'missed'
          ? 'Appel manqué'
          : reason === 'declined'
            ? 'Appel refusé'
            : record.duration
              ? `Appel terminé · ${formatDuration(record.duration)}`
              : 'Appel annulé';
      const message = M.addMessage(chat.id, call.initiatorId, {
        type: 'call',
        content: label,
        call: { id: record.id, type: record.type, status: record.status, duration: record.duration },
      });
      this.broadcastToChat(chat, { type: 'message:new', chatId: chat.id, message, sender: M.publicUser(db.users[call.initiatorId]) });
    }
  }

  /** Relais des offres/réponses/candidats ICE entre deux participants. */
  relaySignal(fromUserId, { callId, to, signal }) {
    const call = this.activeCalls.get(callId);
    if (!call || !call.participants.has(fromUserId)) return;
    this.sendToUser(to, { type: 'call:signal', callId, from: fromUserId, signal });
  }

  updateCallState(callId, userId, patch) {
    const call = this.activeCalls.get(callId);
    const state = call?.participants.get(userId);
    if (!state) return;
    Object.assign(state, patch);
    for (const participantId of call.participants.keys()) {
      if (participantId === userId) continue;
      this.sendToUser(participantId, { type: 'call:state', callId, userId, state: { ...state } });
    }
  }

  callView(call) {
    return {
      id: call.id,
      chatId: call.chatId,
      initiatorId: call.initiatorId,
      type: call.type,
      video: call.video,
      status: call.status,
      startedAt: call.startedAt,
      answeredAt: call.answeredAt,
      participants: [...call.participants.entries()].map(([userId, state]) => ({
        userId,
        user: M.publicUser(db.users[userId]),
        ...state,
      })),
    };
  }

  activeCallForChat = (chatId) =>
    [...this.activeCalls.values()].find((c) => c.chatId === chatId && c.status !== 'ended') || null;
}

const formatDuration = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}min` : m ? `${m} min ${String(s).padStart(2, '0')} s` : `${s} s`;
};

/** Aiguillage des messages WebSocket entrants. */
export function handleSocketMessage(hub, socket, user, msg) {
  switch (msg.type) {
    case 'ping':
      socket.send({ type: 'pong', t: msg.t });
      break;

    case 'typing':
      hub.setTyping(msg.chatId, user.id, msg.isTyping !== false);
      break;

    case 'presence:set': {
      if (!M.STATUSES.includes(msg.status)) break;
      user.manualStatus = msg.status;
      user.status = msg.status;
      save();
      hub.broadcastPresence(user.id);
      break;
    }

    case 'read': {
      const chat = db.chats[msg.chatId];
      if (chat && M.isMember(chat, user.id)) {
        M.markRead(chat, user.id);
        hub.broadcastToChat(chat, { type: 'chat:read', chatId: chat.id, userId: user.id, at: Date.now() }, user.id);
      }
      break;
    }

    case 'call:start':
      hub.startCall(user.id, msg);
      break;

    case 'call:join':
      hub.joinCall(msg.callId, user.id, msg.video);
      break;

    case 'call:decline':
      hub.declineCall(msg.callId, user.id);
      break;

    case 'call:leave':
      hub.leaveCall(msg.callId, user.id);
      break;

    case 'call:end':
      hub.endCall(msg.callId, 'completed');
      break;

    case 'call:signal':
      hub.relaySignal(user.id, msg);
      break;

    case 'call:state':
      hub.updateCallState(msg.callId, user.id, msg.state || {});
      break;

    case 'call:knock': {
      // Rejoindre un appel déjà en cours depuis la conversation.
      const call = hub.activeCallForChat(msg.chatId);
      if (call) socket.send({ type: 'call:available', call: hub.callView(call) });
      break;
    }

    default:
      socket.send({ type: 'error', message: `Type de message inconnu : ${msg.type}` });
  }
}
