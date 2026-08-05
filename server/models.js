/**
 * Couche métier : utilisateurs, contacts, conversations, messages, appels.
 */
import { db, id, save, hashPassword, verifyPassword, token } from './store.js';

export const STATUSES = ['online', 'away', 'busy', 'invisible', 'offline'];

export const DEFAULT_SETTINGS = {
  theme: 'light',                 // light | dark | classic | contrast
  accent: 'skip',                // skip | ocean | forest | sunset | grape | rose
  language: 'fr',
  fontSize: 'medium',             // small | medium | large
  layout: 'default',              // default | compact | classic (Skip 7)
  enterToSend: true,
  showPreviews: true,
  notifications: {
    messages: true,
    calls: true,
    reactions: true,
    contactRequests: true,
    sound: true,
    desktop: true,
    ringtone: 'ring',             // sonnerie choisie (voir SONNERIES côté client)
    quietHours: null,             // { from: '22:00', to: '08:00' }
  },
  privacy: {
    whoCanCall: 'contacts',       // anyone | contacts
    whoCanMessage: 'anyone',
    showReadReceipts: true,
    showTypingIndicator: true,
    appearInSearch: true,
    autoAcceptContacts: false,
  },
  calls: {
    autoAnswer: false,
    videoOnByDefault: true,
    noiseSuppression: true,
    hdVideo: true,
    blurBackground: false,
    liveCaptions: false,
  },
  chat: {
    autoDownloadImages: true,
    largeEmoticons: true,
    animatedEmoticons: true,
    showTimestamps: true,
    webLinkPreviews: true,
    translationLanguage: null,
  },
};

const deepMerge = (base, patch) => {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(patch || {})) {
    out[key] =
      value && typeof value === 'object' && !Array.isArray(value) && typeof base?.[key] === 'object'
        ? deepMerge(base[key], value)
        : value;
  }
  return out;
};

// ── Utilisateurs ──────────────────────────────────────────────────────────────

export function createUser({ pseudo, displayName, password, email = '', avatar = null }) {
  const normalized = String(pseudo).trim().toLowerCase();
  if (!/^[a-z][a-z0-9._-]{2,31}$/.test(normalized)) {
    throw httpError(400, "Le pseudo Skip doit faire 3 à 32 caractères, commencer par une lettre et n'utiliser que lettres, chiffres, point, tiret ou souligné.");
  }
  if (findUserByName(normalized)) throw httpError(409, 'Ce pseudo Skip est déjà pris.');
  if (String(password || '').length < 6) throw httpError(400, 'Le mot de passe doit contenir au moins 6 caractères.');

  const { hash, salt } = hashPassword(password);
  const user = {
    id: id('u_'),
    pseudo: normalized,
    displayName: String(displayName || pseudo).trim().slice(0, 60),
    email,
    passwordHash: hash,
    passwordSalt: salt,
    avatar,
    mood: '',
    status: 'offline',
    manualStatus: 'online',       // statut choisi par l'utilisateur
    lastSeen: Date.now(),
    about: '',
    birthday: null,
    country: '',
    city: '',
    phone: '',
    website: '',
    credit: 5.0,                  // Skip Crédit de démonstration (€)
    skypeNumber: null,
    contacts: [],
    favorites: [],
    blocked: [],
    pinnedChats: [],
    mutedChats: [],
    archivedChats: [],
    unreadOverride: [],           // conversations marquées « non lues » manuellement
    bookmarks: [],                // { chatId, messageId, at }
    drafts: {},                   // chatId -> texte
    settings: structuredClone(DEFAULT_SETTINGS),
    createdAt: Date.now(),
  };
  db.users[user.id] = user;
  save();
  return user;
}

// ── Service d'écho (test du micro) ──────────────────────────────────────────
//
// Contact spécial, permanent, identifié par un identifiant fixe : « appeler
// echo123 » pour tester son micro et ses haut-parleurs est une fonctionnalité
// historique de Skip. L'appel lui-même ne passe jamais par la signalisation
// WebRTC normale — il est traité entièrement côté client (voir calls.js) — ce
// contact n'existe ici que pour être cherchable, affiché, et pour porter un
// message d'accueil dans sa conversation.

export const ECHO_BOT_ID = 'bot_echo123';

export function ensureEchoBot() {
  let bot = db.users[ECHO_BOT_ID];
  if (bot) return bot;

  bot = {
    id: ECHO_BOT_ID,
    pseudo: 'echo123',
    displayName: 'Echo / Test de son',
    email: '',
    passwordHash: null,
    passwordSalt: null,
    avatar: 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">'
      + '<rect width="96" height="96" rx="48" fill="#5B5FC7"/>'
      + '<path d="M30 44a18 18 0 0136 0M38 44a10 10 0 0120 0M48 44v14m-6 6h12" '
      + 'stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/></svg>'
    ),
    mood: 'Appelez-moi pour tester votre micro',
    status: 'online',
    manualStatus: 'online',
    lastSeen: Date.now(),
    about: 'Service automatisé : je réponds instantanément et vous renvoie votre voix, pour vérifier que votre micro et vos haut-parleurs fonctionnent.',
    birthday: null,
    country: '',
    city: '',
    phone: '',
    website: '',
    credit: 0,
    skypeNumber: null,
    contacts: [],
    favorites: [],
    blocked: [],
    pinnedChats: [],
    mutedChats: [],
    archivedChats: [],
    unreadOverride: [],
    bookmarks: [],
    drafts: {},
    settings: structuredClone(DEFAULT_SETTINGS),
    createdAt: Date.now(),
    isBot: true,
  };
  db.users[bot.id] = bot;
  save();
  return bot;
}

/**
 * Ajoute le service d'écho aux contacts d'un utilisateur et prépare sa
 * conversation, avec un message d'accueil s'il n'en a pas déjà un. Appelé à
 * l'inscription, pour que le contact soit immédiatement disponible — comme
 * il l'était réellement dans Skype.
 */
export function connectToEchoBot(user) {
  const bot = ensureEchoBot();
  if (!user.contacts.includes(bot.id)) user.contacts.push(bot.id);
  if (!bot.contacts.includes(user.id)) bot.contacts.push(user.id);

  const chat = getOrCreateDirectChat(user.id, bot.id);
  if (!db.messages[chat.id]?.length) {
    addMessage(chat.id, bot.id, {
      content: 'Bonjour ! Appelez-moi pour tester votre micro et vos haut-parleurs : je réponds tout de suite et vous renvoie votre voix.',
    });
  }
  save();
  return chat;
}

export const findUserByName = (name) =>
  Object.values(db.users).find((u) => u.pseudo === String(name).trim().toLowerCase());

export const findUserByEmail = (email) =>
  email ? Object.values(db.users).find((u) => u.email && u.email.toLowerCase() === String(email).toLowerCase()) : null;

export function authenticate(identifier, password) {
  const user = findUserByName(identifier) || findUserByEmail(identifier);
  // Le service d'écho n'a pas de mot de passe : il ne se connecte jamais lui-même.
  if (!user || user.isBot || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
    throw httpError(401, 'Pseudo Skip ou mot de passe incorrect.');
  }
  return user;
}

export function createSession(userId, agent = '') {
  const tok = token();
  db.sessions[tok] = { userId, createdAt: Date.now(), agent };
  save();
  return tok;
}

export function sessionUser(tok) {
  const session = tok && db.sessions[tok];
  return session ? db.users[session.userId] || null : null;
}

export function destroySession(tok) {
  delete db.sessions[tok];
  save();
}

/** Vue publique d'un utilisateur (jamais de secrets, statut masqué si invisible). */
export function publicUser(user, viewerId = null) {
  if (!user) return null;
  const isSelf = user.id === viewerId;
  const invisible = user.status === 'invisible' || user.manualStatus === 'invisible';
  return {
    id: user.id,
    pseudo: user.pseudo,
    displayName: user.displayName,
    avatar: user.avatar,
    mood: user.mood,
    about: user.about,
    status: isSelf ? user.manualStatus : invisible ? 'offline' : user.status,
    lastSeen: isSelf || !invisible ? user.lastSeen : null,
    country: user.country,
    city: user.city,
    birthday: user.birthday,
    phone: isSelf ? user.phone : '',
    email: isSelf ? user.email : '',
    website: user.website,
    skypeNumber: user.skypeNumber,
    isBot: !!user.isBot,
    ...(isSelf ? { credit: user.credit, settings: user.settings, drafts: user.drafts } : {}),
  };
}

export function searchUsers(query, viewerId) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  return Object.values(db.users)
    .filter((u) => {
      if (u.id === viewerId) return false;
      if (u.settings?.privacy?.appearInSearch === false) return false;
      if (u.blocked.includes(viewerId)) return false;
      return (
        u.pseudo.includes(q) ||
        u.displayName.toLowerCase().includes(q) ||
        (u.email && u.email.toLowerCase() === q) ||
        (u.phone && u.phone.replace(/\s/g, '') === q.replace(/\s/g, ''))
      );
    })
    .slice(0, 40)
    .map((u) => publicUser(u, viewerId));
}

export function updateUser(user, patch) {
  const allowed = ['displayName', 'mood', 'about', 'avatar', 'birthday', 'country', 'city', 'phone', 'website', 'email'];
  for (const key of allowed) {
    if (key in patch) user[key] = patch[key];
  }
  if (patch.settings) user.settings = deepMerge(user.settings, patch.settings);
  if (patch.manualStatus && STATUSES.includes(patch.manualStatus)) {
    user.manualStatus = patch.manualStatus;
    user.status = patch.manualStatus;
  }
  save();
  return user;
}

// ── Contacts ──────────────────────────────────────────────────────────────────

export function sendContactRequest(fromUser, toUserId, message = '') {
  const to = db.users[toUserId];
  if (!to) throw httpError(404, 'Utilisateur introuvable.');
  if (to.id === fromUser.id) throw httpError(400, 'Vous ne pouvez pas vous ajouter vous-même.');
  if (fromUser.contacts.includes(to.id)) throw httpError(409, 'Ce contact est déjà dans votre liste.');
  if (to.blocked.includes(fromUser.id)) throw httpError(403, "Impossible d'envoyer cette demande.");

  const existing = Object.values(db.contactRequests).find(
    (r) => r.fromId === fromUser.id && r.toId === to.id && r.status === 'pending'
  );
  if (existing) return existing;

  // Demande croisée : on accepte automatiquement.
  const reverse = Object.values(db.contactRequests).find(
    (r) => r.fromId === to.id && r.toId === fromUser.id && r.status === 'pending'
  );
  if (reverse) return respondToContactRequest(fromUser, reverse.id, true);

  const request = {
    id: id('cr_'),
    fromId: fromUser.id,
    toId: to.id,
    message: String(message).slice(0, 300),
    status: 'pending',
    createdAt: Date.now(),
  };
  db.contactRequests[request.id] = request;

  if (to.settings?.privacy?.autoAcceptContacts) {
    return respondToContactRequest(to, request.id, true);
  }
  save();
  return request;
}

export function respondToContactRequest(user, requestId, accept) {
  const request = db.contactRequests[requestId];
  if (!request) throw httpError(404, 'Demande introuvable.');
  if (request.toId !== user.id && request.fromId !== user.id) throw httpError(403, 'Demande non autorisée.');

  request.status = accept ? 'accepted' : 'declined';
  request.respondedAt = Date.now();

  if (accept) {
    const a = db.users[request.fromId];
    const b = db.users[request.toId];
    if (!a.contacts.includes(b.id)) a.contacts.push(b.id);
    if (!b.contacts.includes(a.id)) b.contacts.push(a.id);
    getOrCreateDirectChat(a.id, b.id);
  }
  save();
  return request;
}

export function removeContact(user, contactId) {
  user.contacts = user.contacts.filter((c) => c !== contactId);
  user.favorites = user.favorites.filter((c) => c !== contactId);
  const other = db.users[contactId];
  if (other) other.contacts = other.contacts.filter((c) => c !== user.id);
  save();
}

export function setBlocked(user, targetId, blocked) {
  if (blocked) {
    if (!user.blocked.includes(targetId)) user.blocked.push(targetId);
    user.contacts = user.contacts.filter((c) => c !== targetId);
  } else {
    user.blocked = user.blocked.filter((b) => b !== targetId);
  }
  save();
}

// ── Conversations ─────────────────────────────────────────────────────────────

export function getOrCreateDirectChat(userA, userB) {
  const existing = Object.values(db.chats).find(
    (c) => c.type === 'direct' && c.members.length === 2 && c.members.some((m) => m.userId === userA) && c.members.some((m) => m.userId === userB)
  );
  if (existing) return existing;

  const chat = {
    id: id('c_'),
    type: 'direct',
    topic: '',
    picture: null,
    members: [
      { userId: userA, role: 'member', joinedAt: Date.now() },
      { userId: userB, role: 'member', joinedAt: Date.now() },
    ],
    createdBy: userA,
    createdAt: Date.now(),
    lastMessageAt: Date.now(),
    joinLink: null,
    history: 'visible',
  };
  db.chats[chat.id] = chat;
  db.messages[chat.id] = [];
  save();
  return chat;
}

export function createGroupChat(creator, { topic, memberIds = [], picture = null }) {
  const unique = [...new Set([creator.id, ...memberIds])];
  const chat = {
    id: id('c_'),
    type: 'group',
    topic: String(topic || 'Nouveau groupe').slice(0, 80),
    picture,
    members: unique.map((userId) => ({
      userId,
      role: userId === creator.id ? 'admin' : 'member',
      joinedAt: Date.now(),
    })),
    createdBy: creator.id,
    createdAt: Date.now(),
    lastMessageAt: Date.now(),
    joinLink: id('join_'),
    history: 'visible',
  };
  db.chats[chat.id] = chat;
  db.messages[chat.id] = [];
  addSystemMessage(chat.id, `${creator.displayName} a créé le groupe « ${chat.topic} »`, { kind: 'group-created', actorId: creator.id });
  save();
  return chat;
}

export const isMember = (chat, userId) => !!chat?.members.some((m) => m.userId === userId);
export const isAdmin = (chat, userId) => chat?.members.some((m) => m.userId === userId && m.role === 'admin');

export function chatsForUser(userId) {
  return Object.values(db.chats)
    .filter((c) => isMember(c, userId))
    .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
}

export function chatView(chat, viewerId) {
  const messages = db.messages[chat.id] || [];
  const lastMessage = [...messages].reverse().find((m) => !m.deletedFor?.includes(viewerId)) || null;
  const viewer = db.users[viewerId];
  const member = chat.members.find((m) => m.userId === viewerId);
  const lastReadAt = member?.lastReadAt || 0;

  return {
    id: chat.id,
    type: chat.type,
    topic: chat.topic,
    picture: chat.picture,
    createdBy: chat.createdBy,
    createdAt: chat.createdAt,
    lastMessageAt: chat.lastMessageAt,
    joinLink: chat.joinLink,
    members: chat.members.map((m) => ({
      ...m,
      user: publicUser(db.users[m.userId], viewerId),
    })),
    lastMessage,
    unread: messages.filter((m) => m.createdAt > lastReadAt && m.senderId !== viewerId && m.type !== 'system').length,
    markedUnread: viewer?.unreadOverride?.includes(chat.id) || false,
    pinned: viewer?.pinnedChats?.includes(chat.id) || false,
    muted: viewer?.mutedChats?.includes(chat.id) || false,
    archived: viewer?.archivedChats?.includes(chat.id) || false,
    draft: viewer?.drafts?.[chat.id] || '',
  };
}

export function addMembers(chat, actorId, memberIds) {
  const added = [];
  for (const userId of memberIds) {
    if (isMember(chat, userId) || !db.users[userId]) continue;
    chat.members.push({ userId, role: 'member', joinedAt: Date.now() });
    added.push(db.users[userId].displayName);
  }
  if (added.length) {
    addSystemMessage(chat.id, `${db.users[actorId].displayName} a ajouté ${added.join(', ')}`, { kind: 'members-added', actorId });
  }
  save();
  return chat;
}

export function removeMember(chat, actorId, userId) {
  chat.members = chat.members.filter((m) => m.userId !== userId);
  const actor = db.users[actorId];
  const target = db.users[userId];
  addSystemMessage(
    chat.id,
    actorId === userId ? `${target.displayName} a quitté la conversation` : `${actor.displayName} a retiré ${target.displayName}`,
    { kind: 'member-removed', actorId }
  );
  // Le groupe garde toujours au moins un administrateur.
  if (chat.members.length && !chat.members.some((m) => m.role === 'admin')) chat.members[0].role = 'admin';
  save();
  return chat;
}

// ── Messages ──────────────────────────────────────────────────────────────────

export function addMessage(chatId, senderId, payload) {
  const message = {
    id: id('m_'),
    chatId,
    senderId,
    type: payload.type || 'text',
    content: payload.content ?? '',
    attachments: payload.attachments || [],
    replyTo: payload.replyTo || null,
    forwardedFrom: payload.forwardedFrom || null,
    mentions: payload.mentions || [],
    poll: payload.poll || null,
    contactCard: payload.contactCard || null,
    // Message laissé sur la messagerie vocale après un appel manqué.
    voicemail: payload.voicemail === true,
    location: payload.location || null,
    scheduled: payload.scheduled || null,
    call: payload.call || null,
    meta: payload.meta || null,
    reactions: {},
    readBy: { [senderId]: Date.now() },
    deliveredTo: [senderId],
    deletedFor: [],
    edited: false,
    editedAt: null,
    deleted: false,
    createdAt: Date.now(),
  };
  (db.messages[chatId] ||= []).push(message);
  const chat = db.chats[chatId];
  if (chat) chat.lastMessageAt = message.createdAt;
  save();
  return message;
}

export function addSystemMessage(chatId, text, meta = {}) {
  return addMessage(chatId, 'system', { type: 'system', content: text, meta });
}

export const findMessage = (chatId, messageId) => (db.messages[chatId] || []).find((m) => m.id === messageId);

export function editMessage(chatId, messageId, userId, content) {
  const message = findMessage(chatId, messageId);
  if (!message) throw httpError(404, 'Message introuvable.');
  if (message.senderId !== userId) throw httpError(403, 'Vous ne pouvez modifier que vos propres messages.');
  if (message.deleted) throw httpError(400, 'Ce message a été supprimé.');
  message.content = content;
  message.edited = true;
  message.editedAt = Date.now();
  save();
  return message;
}

export function deleteMessage(chatId, messageId, userId, forEveryone = true) {
  const message = findMessage(chatId, messageId);
  if (!message) throw httpError(404, 'Message introuvable.');
  const chat = db.chats[chatId];
  const canDeleteForAll = message.senderId === userId || isAdmin(chat, userId);

  if (forEveryone && canDeleteForAll) {
    message.deleted = true;
    message.content = '';
    message.attachments = [];
    message.poll = null;
    message.reactions = {};
  } else {
    if (!message.deletedFor.includes(userId)) message.deletedFor.push(userId);
  }
  save();
  return message;
}

export function reactToMessage(chatId, messageId, userId, emoji) {
  const message = findMessage(chatId, messageId);
  if (!message) throw httpError(404, 'Message introuvable.');
  // Une seule réaction par personne : on retire l'ancienne.
  for (const [key, users] of Object.entries(message.reactions)) {
    message.reactions[key] = users.filter((u) => u !== userId);
    if (!message.reactions[key].length) delete message.reactions[key];
  }
  if (emoji) (message.reactions[emoji] ||= []).push(userId);
  save();
  return message;
}

export function markRead(chat, userId, at = Date.now()) {
  const member = chat.members.find((m) => m.userId === userId);
  if (member) member.lastReadAt = at;
  const user = db.users[userId];
  if (user) user.unreadOverride = user.unreadOverride.filter((c) => c !== chat.id);
  for (const message of db.messages[chat.id] || []) {
    if (message.senderId !== userId && !message.readBy[userId]) message.readBy[userId] = at;
  }
  save();
}

export function votePoll(chatId, messageId, userId, optionIndexes) {
  const message = findMessage(chatId, messageId);
  if (!message?.poll) throw httpError(404, 'Sondage introuvable.');
  const poll = message.poll;
  if (poll.closed) throw httpError(400, 'Ce sondage est clos.');
  const choices = poll.multiple ? optionIndexes.slice(0, poll.options.length) : optionIndexes.slice(0, 1);
  poll.options.forEach((option, index) => {
    option.votes = (option.votes || []).filter((v) => v !== userId);
    if (choices.includes(index)) option.votes.push(userId);
  });
  save();
  return message;
}

// ── Historique d'appels ───────────────────────────────────────────────────────

export function recordCall({ chatId, initiatorId, type, participants, status, startedAt, endedAt }) {
  const call = {
    id: id('call_'),
    chatId,
    initiatorId,
    type,
    participants,
    status, // completed | missed | declined | failed
    startedAt,
    endedAt,
    duration: endedAt && startedAt ? Math.max(0, Math.round((endedAt - startedAt) / 1000)) : 0,
  };
  db.calls[call.id] = call;
  save();
  return call;
}

export const callsForUser = (userId) =>
  Object.values(db.calls)
    .filter((c) => c.participants.includes(userId))
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 200);

// ── Erreurs HTTP ──────────────────────────────────────────────────────────────

export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
