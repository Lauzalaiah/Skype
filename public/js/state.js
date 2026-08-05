/** État global de l'application, avec abonnements. */

const listeners = new Map(); // clé -> Set<callback>

export const state = {
  user: null,                 // utilisateur connecté
  chats: [],                  // conversations (vue)
  activeChatId: null,
  messages: new Map(),        // chatId -> [message]
  hasMore: new Map(),         // chatId -> booléen
  users: new Map(),           // cache : userId -> utilisateur public
  contacts: [],
  favorites: [],
  blocked: [],
  requests: { incoming: [], outgoing: [] },
  calls: [],                  // historique
  typing: new Map(),          // chatId -> Map<userId, expiration>
  view: 'chats',              // chats | calls | contacts | notifications | bookmarks | dialpad
  filter: 'all',              // all | unread | groups | favorites | archived
  search: '',
  activeCall: null,
  incomingCall: null,
  detailsOpen: false,
  detailsTab: 'profile',
  replyTo: null,
  editing: null,
  connection: 'connecting',   // connecting | online | offline
  unreadTotal: 0,
};

/** Abonnement à une ou plusieurs clés (« * » pour tout). */
export function subscribe(keys, callback) {
  const list = Array.isArray(keys) ? keys : [keys];
  for (const key of list) {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(callback);
  }
  return () => {
    for (const key of list) listeners.get(key)?.delete(callback);
  };
}

/** Notifie les abonnés d'une ou plusieurs clés. */
export function notify(...keys) {
  const notified = new Set();
  for (const key of keys) {
    for (const callback of listeners.get(key) || []) {
      if (notified.has(callback)) continue;
      notified.add(callback);
      callback(key);
    }
  }
  for (const callback of listeners.get('*') || []) {
    if (!notified.has(callback)) callback(keys[0]);
  }
}

/** Modifie l'état et notifie automatiquement les clés touchées. */
export function setState(patch) {
  const changed = [];
  for (const [key, value] of Object.entries(patch)) {
    if (state[key] === value) continue;
    state[key] = value;
    changed.push(key);
  }
  if (changed.length) notify(...changed);
  return changed;
}

// ── Sélecteurs ────────────────────────────────────────────────────────────────

export const getChat = (chatId) => state.chats.find((c) => c.id === chatId) || null;
export const activeChat = () => getChat(state.activeChatId);
export const getMessages = (chatId) => state.messages.get(chatId) || [];

export function getUser(userId) {
  if (userId === state.user?.id) return state.user;
  return state.users.get(userId) || null;
}

export function cacheUser(user) {
  if (user?.id) state.users.set(user.id, { ...state.users.get(user.id), ...user });
  return user;
}

/** Nom affiché d'une conversation. */
export function chatTitle(chat) {
  if (!chat) return '';
  if (chat.type === 'group') return chat.topic || 'Groupe sans nom';
  const other = otherMember(chat);
  return other?.displayName || 'Conversation';
}

/** L'interlocuteur d'une conversation individuelle. */
export function otherMember(chat) {
  if (!chat || chat.type !== 'direct') return null;
  const member = chat.members.find((m) => m.userId !== state.user?.id) || chat.members[0];
  return member?.user || null;
}

export const chatMembers = (chat) => (chat?.members || []).map((m) => m.user).filter(Boolean);

export function upsertChat(chat) {
  const index = state.chats.findIndex((c) => c.id === chat.id);
  if (index >= 0) state.chats[index] = { ...state.chats[index], ...chat };
  else state.chats.unshift(chat);
  for (const member of chat.members || []) cacheUser(member.user);
  sortChats();
}

export function sortChats() {
  state.chats.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.lastMessageAt || 0) - (a.lastMessageAt || 0);
  });
}

export function addMessage(chatId, message) {
  const list = state.messages.get(chatId);
  if (!list) return false;                                   // conversation pas encore chargée
  if (list.some((m) => m.id === message.id)) return false;    // doublon (écho du serveur)
  list.push(message);
  list.sort((a, b) => a.createdAt - b.createdAt);
  return true;
}

export function replaceMessage(chatId, message) {
  const list = state.messages.get(chatId);
  if (!list) return;
  const index = list.findIndex((m) => m.id === message.id);
  if (index >= 0) list[index] = message;
}

export function removeMessage(chatId, messageId) {
  const list = state.messages.get(chatId);
  if (!list) return;
  const index = list.findIndex((m) => m.id === messageId);
  if (index >= 0) list.splice(index, 1);
}

/** Total des conversations non lues (badge du rail). */
export function computeUnread() {
  const total = state.chats
    .filter((c) => !c.archived)
    .reduce((sum, chat) => sum + (chat.unread > 0 || chat.markedUnread ? 1 : 0), 0);
  if (total !== state.unreadTotal) {
    state.unreadTotal = total;
    notify('unreadTotal');
  }
  document.title = total ? `(${total}) Skip` : 'Skip';
  return total;
}

/** Personnes en train d'écrire dans une conversation. */
export function typingUsers(chatId) {
  const map = state.typing.get(chatId);
  if (!map) return [];
  const now = Date.now();
  const users = [];
  for (const [userId, expires] of map) {
    if (expires < now) map.delete(userId);
    else users.push(getUser(userId));
  }
  return users.filter(Boolean);
}

export function setTyping(chatId, userId, isTyping) {
  if (!state.typing.has(chatId)) state.typing.set(chatId, new Map());
  const map = state.typing.get(chatId);
  if (isTyping) map.set(userId, Date.now() + 6000);
  else map.delete(userId);
  notify('typing');
}
