/**
 * Skype Reborn — point d'entrée.
 * Amorçage, routage des vues, événements temps réel et raccourcis clavier.
 */
import { el, clear, $, replace } from './lib/dom.js';
import { icon } from './lib/icons.js';
import { api, getToken, setToken } from './lib/api.js';
import { socket } from './lib/socket.js';
import {
  state, setState, subscribe, notify, getChat, upsertChat, addMessage,
  replaceMessage, cacheUser, getUser, chatTitle, computeUnread, setTyping, sortChats,
} from './state.js';
import { applyAppearance, restoreAppearance, watchSystemTheme, toggleDarkMode } from './theme.js';
import { showAuth } from './ui/auth.js';
import { renderRail } from './ui/rail.js';
import { renderSidebar, openChat, refreshContacts, openDirectChat } from './ui/sidebar.js';
import { renderConversation, currentConversation } from './ui/conversation.js';
import { renderDetails } from './ui/details.js';
import { toast, emptyState, closeTopModal, closeMenu, avatar } from './ui/common.js';
import { openSettings, setStatus } from './ui/settings.js';
import { openNewChatDialog, openProfileCard, openShortcutsDialog } from './ui/modals.js';
import { showIncomingCall, dismissIncomingCall, activeSession, hangupActiveCall } from './ui/calls.js';
import { plainPreview } from './lib/format.js';
import * as sounds from './lib/sounds.js';

const appNode = document.getElementById('app');

// ── Amorçage ──────────────────────────────────────────────────────────────────

restoreAppearance();

(async function boot() {
  sounds.unlockAudio();

  let session = null;

  if (getToken()) {
    try {
      session = await api.me();
    } catch {
      setToken(null);
    }
  }
  // Une session restaurée n'est pas une connexion : le son ne doit pas
  // retentir à chaque rechargement de la page.
  const connexionFraiche = !session;
  if (!session) session = await showAuth();

  state.user = session.user;
  applyAppearance(state.user.settings);
  watchSystemTheme(() => state.user?.settings);
  sounds.setSoundEnabled(state.user.settings?.notifications?.sound !== false);
  sounds.setRingtone(state.user.settings?.notifications?.ringtone || 'ring');
  if (connexionFraiche) sounds.login();

  renderShell();
  wireSocket();
  socket.connect();

  await Promise.all([loadChats(), refreshContacts(), loadCalls()]);

  handleDeepLinks();
  installShortcuts();
  installLifecycle();
  requestNotificationPermission();
})();

// ── Structure ─────────────────────────────────────────────────────────────────

let mainSlot = null;
let detailsSlot = null;

function renderShell() {
  clear(appNode);
  appNode.removeAttribute('aria-busy');

  mainSlot = el('div', { style: { flex: '1', display: 'flex', minWidth: '0' } });
  detailsSlot = el('div', { style: { display: 'flex' } });

  appNode.append(renderRail(), renderSidebar(), mainSlot, detailsSlot);

  subscribe(['activeChatId', 'view'], renderMain);
  subscribe(['detailsOpen', 'activeChatId', 'detailsTab', 'chats'], renderDetailsSlot);
  renderMain();

  if (innerWidth <= 700) document.body.setAttribute('data-mobile-view', 'list');
}

let renderedChatId = null;

function renderMain() {
  const chat = getChat(state.activeChatId);

  if (!chat) {
    renderedChatId = null;
    replace(mainSlot, el('div.main', {}, welcomeScreen()));
    return;
  }
  // On ne reconstruit la conversation que si elle change réellement.
  if (chat.id === renderedChatId) return;
  renderedChatId = chat.id;
  replace(mainSlot, renderConversation(chat.id));
}

function renderDetailsSlot() {
  clear(detailsSlot);
  const chat = getChat(state.activeChatId);
  if (state.detailsOpen && chat) detailsSlot.append(renderDetails(chat));
}

function welcomeScreen() {
  const hour = new Date().getHours();
  const greeting = hour < 6 ? 'Bonne nuit' : hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';

  return el('div.empty-state', {}, [
    el('div', {
      style: {
        width: '96px', height: '96px', borderRadius: '50%',
        background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
        color: '#fff', display: 'grid', placeItems: 'center',
        fontSize: '46px', fontWeight: '700', boxShadow: '0 12px 32px rgba(0,175,240,.32)',
      },
      text: 'S',
    }),
    el('h2.empty-state__title', { text: `${greeting}, ${state.user.displayName.split(' ')[0]} 👋` }),
    el('p.empty-state__text', { text: 'Choisissez une conversation à gauche, ou commencez-en une nouvelle. Vos appels, vos groupes et vos messages sont là où vous les aviez laissés.' }),
    el('div.row.gap-8', { style: { marginTop: '8px', flexWrap: 'wrap', justifyContent: 'center' } }, [
      el('button.btn.btn--primary', { onclick: openNewChatDialog }, [icon('edit', 'icon icon--sm'), 'Nouvelle conversation']),
      el('button.btn', { onclick: () => setState({ view: 'contacts' }) }, [icon('person-add', 'icon icon--sm'), 'Ajouter un contact']),
      el('button.btn', { onclick: () => setState({ view: 'dialpad' }) }, [icon('dialpad', 'icon icon--sm'), 'Appeler un numéro']),
    ]),
    el('p.dim', { style: { marginTop: '20px', fontSize: '0.82em' } }, [
      'Votre pseudo Skype : ',
      el('code', { text: state.user.skypeName }),
      ' — partagez-le pour qu’on vous retrouve.',
    ]),
  ]);
}

// ── Chargement des données ────────────────────────────────────────────────────

async function loadChats() {
  try {
    const { chats } = await api.chats();
    for (const chat of chats) {
      for (const member of chat.members) cacheUser(member.user);
    }
    setState({ chats });
    sortChats();
    computeUnread();
    notify('chats');
  } catch (err) {
    toast(err.message, { type: 'error' });
  }
}

async function loadCalls() {
  try {
    const { calls } = await api.calls();
    setState({ calls });
  } catch {
    /* l'historique se rechargera plus tard */
  }
}

// ── Temps réel ────────────────────────────────────────────────────────────────

function wireSocket() {
  socket.on('open', () => {
    setState({ connection: 'online' });
    // Une reconnexion peut avoir manqué des messages : on resynchronise.
    if (state.chats.length) {
      loadChats();
      if (state.activeChatId) refreshActiveMessages();
    }
  });

  socket.on('close', () => setState({ connection: 'offline' }));

  socket.on('reconnecting', ({ attempt }) => {
    if (attempt === 2) toast('Connexion perdue — reconnexion en cours…', { duration: 2500 });
  });

  socket.on('ready', ({ user }) => {
    state.user = { ...state.user, ...user };
    notify('user');
  });

  // ── Messages ───────────────────────────────────────────────────────────────

  socket.on('message:new', ({ chatId, message, sender }) => {
    if (sender) cacheUser(sender);
    const chat = getChat(chatId);

    if (!chat) {
      loadChats();
      return;
    }

    const added = addMessage(chatId, message);
    chat.lastMessage = message;
    chat.lastMessageAt = message.createdAt;

    const isMine = message.senderId === state.user.id;
    const isActive = chatId === state.activeChatId && !document.hidden;

    if (!isMine && !isActive && message.type !== 'system') {
      chat.unread = (chat.unread || 0) + 1;
      notifyIncoming(chat, message, sender);
    }

    sortChats();
    notify('chats');
    if (added) notify('messages');
    computeUnread();
  });

  socket.on('message:edited', ({ chatId, message }) => {
    replaceMessage(chatId, message);
    const chat = getChat(chatId);
    if (chat?.lastMessage?.id === message.id) chat.lastMessage = message;
    notify('messages', 'chats');
  });

  socket.on('message:deleted', ({ chatId, message }) => {
    replaceMessage(chatId, message);
    const chat = getChat(chatId);
    if (chat?.lastMessage?.id === message.id) chat.lastMessage = message;
    notify('messages', 'chats');
  });

  socket.on('message:reaction', ({ chatId, message, by, emoji }) => {
    replaceMessage(chatId, message);
    notify('messages');
    const isMine = message.senderId === state.user.id;
    if (isMine && by?.id !== state.user.id && emoji && state.user.settings?.notifications?.reactions !== false) {
      if (state.user.settings?.notifications?.sound !== false) sounds.notify();
    }
  });

  socket.on('message:poll', ({ chatId, message }) => {
    replaceMessage(chatId, message);
    notify('messages');
  });

  // ── Conversations ──────────────────────────────────────────────────────────

  socket.on('chat:new', ({ chat }) => {
    for (const member of chat.members) cacheUser(member.user);
    upsertChat(chat);
    notify('chats');
  });

  socket.on('chat:updated', () => loadChats());

  socket.on('chat:members', async ({ chatId }) => {
    try {
      const { chat } = await api.chat(chatId);
      upsertChat(chat);
      notify('chats', 'messages');
    } catch {
      loadChats();
    }
  });

  socket.on('chat:removed', ({ chatId }) => {
    state.chats = state.chats.filter((c) => c.id !== chatId);
    if (state.activeChatId === chatId) setState({ activeChatId: null });
    notify('chats');
  });

  socket.on('chat:read', ({ chatId, userId, at }) => {
    const messages = state.messages.get(chatId);
    if (!messages) return;
    for (const message of messages) {
      if (!message.readBy[userId]) message.readBy[userId] = at;
    }
    const chat = getChat(chatId);
    const member = chat?.members.find((m) => m.userId === userId);
    if (member) member.lastReadAt = at;
    notify('messages');
  });

  // ── Présence et saisie ─────────────────────────────────────────────────────

  socket.on('presence', ({ userId, status, lastSeen }) => {
    if (userId === state.user.id) {
      state.user.status = status;
    } else {
      const user = getUser(userId);
      if (user) Object.assign(user, { status, lastSeen });
      for (const chat of state.chats) {
        const member = chat.members.find((m) => m.userId === userId);
        if (member?.user) Object.assign(member.user, { status, lastSeen });
      }
      const contact = state.contacts.find((c) => c.id === userId);
      if (contact) Object.assign(contact, { status, lastSeen });
    }
    notify('presence', 'contacts');
  });

  socket.on('typing', ({ chatId, userId, isTyping }) => setTyping(chatId, userId, isTyping));

  // ── Contacts ───────────────────────────────────────────────────────────────

  socket.on('contact:request', ({ request }) => {
    cacheUser(request.from);
    state.requests.incoming.push(request);
    notify('requests', 'contacts');
    if (state.user.settings?.notifications?.contactRequests !== false) {
      toast(`${request.from.displayName} souhaite vous ajouter`, {
        action: { label: 'Voir', onClick: () => setState({ view: 'contacts' }) },
        duration: 6000,
      });
      sounds.notify();
    }
  });

  socket.on('contact:response', ({ request, by }) => {
    if (request.status === 'accepted') {
      toast(`${by?.displayName || 'Votre contact'} a accepté votre demande`);
      sounds.notify();
    }
    refreshContacts();
    loadChats();
  });

  socket.on('contacts:sync', () => {
    refreshContacts();
    loadChats();
  });

  socket.on('contact:removed', () => refreshContacts());

  socket.on('user:updated', ({ user }) => {
    cacheUser(user);
    for (const chat of state.chats) {
      const member = chat.members.find((m) => m.userId === user.id);
      if (member) member.user = { ...member.user, ...user };
    }
    const contact = state.contacts.find((c) => c.id === user.id);
    if (contact) Object.assign(contact, user);
    notify('contacts', 'chats', 'presence');
  });

  // ── Appels ─────────────────────────────────────────────────────────────────

  socket.on('call:incoming', ({ call, from, chat }) => {
    cacheUser(from);
    if (state.user.settings?.calls?.autoAnswer) {
      import('./ui/calls.js').then(({ answerCall }) => answerCall(call, { video: call.video }));
      return;
    }
    showIncomingCall({ call, from, chat });
  });

  socket.on('call:answered-elsewhere', ({ callId }) => dismissIncomingCall(callId));

  socket.on('call:ended', ({ callId }) => {
    dismissIncomingCall(callId);
    loadCalls();
  });

  socket.on('error', ({ message }) => message && console.warn('[socket]', message));
}

async function refreshActiveMessages() {
  const chatId = state.activeChatId;
  if (!chatId) return;
  try {
    const { messages, hasMore } = await api.messages(chatId);
    state.messages.set(chatId, messages);
    state.hasMore.set(chatId, hasMore);
    notify('messages');
  } catch {
    /* nouvelle tentative à la prochaine reconnexion */
  }
}

// ── Notifications ─────────────────────────────────────────────────────────────

function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    // On attend une interaction pour ne pas être bloqué par le navigateur.
    const ask = () => {
      Notification.requestPermission().catch(() => {});
      document.removeEventListener('pointerdown', ask);
    };
    setTimeout(() => document.addEventListener('pointerdown', ask, { once: true }), 4000);
  }
}

function notifyIncoming(chat, message, sender) {
  const settings = state.user.settings?.notifications || {};
  if (settings.messages === false) return;
  if (chat.muted) return;
  if (isQuietHours(settings.quietHours)) return;

  const mentionsMe = message.mentions?.includes(state.user.id);
  if (settings.sound !== false) {
    const estVocal = message.attachments?.some((a) => a.mime?.startsWith('audio/'));
    if (mentionsMe) sounds.mention();
    // La messagerie vocale a son propre son : elle se distingue d'un message
    // vocal envoyé dans le fil de la conversation.
    else if (message.voicemail) sounds.voicemail();
    else if (estVocal) sounds.voiceMessage();
    else if (message.attachments?.length) sounds.fileReceived();
    else sounds.messageIn();
  }

  const title = chat.type === 'group' ? `${sender?.displayName || 'Quelqu’un'} · ${chat.topic}` : sender?.displayName || 'Nouveau message';
  const body = state.user.settings?.showPreviews === false
    ? 'Nouveau message'
    : message.attachments?.length
      ? '📎 Pièce jointe'
      : plainPreview(message.content, 120);

  // Bandeau interne
  showNotificationCard({ chat, title, body, sender });

  // Notification système
  if (document.hidden && settings.desktop !== false && Notification?.permission === 'granted') {
    const notification = new Notification(title, {
      body,
      icon: sender?.avatar || undefined,
      tag: `chat-${chat.id}`,
      silent: settings.sound === false,
    });
    notification.onclick = () => {
      window.focus();
      openChat(chat.id);
      notification.close();
    };
  }
}

function showNotificationCard({ chat, title, body, sender }) {
  if (!document.hidden && chat.id === state.activeChatId) return;
  document.querySelector('.notification-card')?.remove();

  const card = el('div.notification-card', {
    onclick: () => {
      openChat(chat.id);
      card.remove();
    },
  }, [
    avatar(sender || { displayName: '?' }, { size: 'md' }),
    el('div', { style: { flex: '1', minWidth: '0' } }, [
      el('div.notification-card__title.truncate', { text: title }),
      el('div.notification-card__body', { text: body }),
    ]),
    el('button.icon-btn.icon-btn--sm', {
      'aria-label': 'Ignorer',
      onclick: (e) => {
        e.stopPropagation();
        card.remove();
      },
    }, icon('close', 'icon icon--sm')),
  ]);

  document.getElementById('overlays').append(card);
  setTimeout(() => card.remove(), 6000);
}

function isQuietHours(range) {
  if (!range?.from || !range?.to) return false;
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const [fromH, fromM] = range.from.split(':').map(Number);
  const [toH, toM] = range.to.split(':').map(Number);
  const from = fromH * 60 + fromM;
  const to = toH * 60 + toM;
  return from <= to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}

// ── Liens profonds (?join=, ?add=, ?view=) ───────────────────────────────────

async function handleDeepLinks() {
  const params = new URLSearchParams(location.search);

  if (params.get('view')) setState({ view: params.get('view') });
  if (params.get('action') === 'new-chat') openNewChatDialog();

  const join = params.get('join');
  if (join) {
    try {
      const { chat } = await api.joinByLink(join);
      upsertChat(chat);
      notify('chats');
      openChat(chat.id);
      toast('Vous avez rejoint la conversation');
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  }

  const add = params.get('add');
  if (add) {
    try {
      const { user } = await api.user(add);
      openProfileCard(user.id, user);
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  }

  if (params.size) history.replaceState(null, '', location.pathname);
}

// ── Raccourcis clavier ────────────────────────────────────────────────────────

function installShortcuts() {
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const inField = ['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable;

    if (e.key === 'Escape') {
      if (closeTopModal()) return;
      closeMenu();
      if (state.detailsOpen) {
        setState({ detailsOpen: false });
        return;
      }
      if (state.search) {
        setState({ search: '' });
        const input = $('.sidebar__search input');
        if (input) input.value = '';
      }
      return;
    }

    if (!mod) return;

    // Ctrl + Maj + …
    if (e.shiftKey) {
      switch (e.key.toLowerCase()) {
        case 'd':
          e.preventDefault();
          toggleDarkMode(state.user.settings);
          api.updateSettings({ theme: state.user.settings.theme }).catch(() => {});
          return;
        case 'arrowdown':
          e.preventDefault();
          return cycleChat(1);
        case 'arrowup':
          e.preventDefault();
          return cycleChat(-1);
        case 'p': {
          e.preventDefault();
          const chat = getChat(state.activeChatId);
          if (chat) import('./ui/calls.js').then(({ startCall }) => startCall(chat, { video: false }));
          return;
        }
        case 'k': {
          e.preventDefault();
          const chat = getChat(state.activeChatId);
          if (chat) import('./ui/calls.js').then(({ startCall }) => startCall(chat, { video: true }));
          return;
        }
        case 'h':
          e.preventDefault();
          hangupActiveCall();
          return;
        case 'l': {
          e.preventDefault();
          const chat = getChat(state.activeChatId);
          if (chat) {
            socket.send({ type: 'read', chatId: chat.id });
            chat.unread = 0;
            notify('chats');
          }
          return;
        }
        case 'r': {
          e.preventDefault();
          const messages = state.messages.get(state.activeChatId) || [];
          const last = [...messages].reverse().find((m) => m.type !== 'system');
          if (last) currentConversation()?.reply?.(last);
          return;
        }
        default:
          return;
      }
    }

    // Ctrl + …
    switch (e.key.toLowerCase()) {
      case 'n':
        e.preventDefault();
        openNewChatDialog();
        break;
      case 'f':
        if (inField) return;
        e.preventDefault();
        $('.sidebar__search input')?.focus();
        break;
      case ',':
        e.preventDefault();
        openSettings();
        break;
      case 'm': {
        const session = activeSession();
        if (session) {
          e.preventDefault();
          document.querySelector('.call-control .icon-btn')?.click();
        }
        break;
      }
      case '/':
        e.preventDefault();
        openShortcutsDialog();
        break;
      default:
        break;
    }
  });
}

function cycleChat(direction) {
  const visible = state.chats.filter((c) => !c.archived);
  if (!visible.length) return;
  const index = visible.findIndex((c) => c.id === state.activeChatId);
  const next = visible[(index + direction + visible.length) % visible.length];
  openChat(next.id);
}

// ── Cycle de vie ──────────────────────────────────────────────────────────────

function installLifecycle() {
  // Absence automatique après 5 minutes d'inactivité.
  let idleTimer;
  let wasAutoAway = false;

  const resetIdle = () => {
    clearTimeout(idleTimer);
    if (wasAutoAway) {
      wasAutoAway = false;
      if (state.user.manualStatus === 'away') setStatus('online');
    }
    idleTimer = setTimeout(() => {
      if (['online'].includes(state.user.manualStatus || state.user.status)) {
        wasAutoAway = true;
        setStatus('away');
      }
    }, 5 * 60000);
  };

  for (const event of ['pointerdown', 'keydown', 'focus']) {
    window.addEventListener(event, resetIdle, { passive: true });
  }
  resetIdle();

  // Marquer comme lu au retour sur l'onglet.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    const chat = getChat(state.activeChatId);
    if (chat && (chat.unread || chat.markedUnread)) {
      socket.send({ type: 'read', chatId: chat.id });
      chat.unread = 0;
      chat.markedUnread = false;
      notify('chats');
      computeUnread();
    }
    if (!socket.connected) socket.connect();
  });

  // Reconnexion immédiate au retour du réseau.
  window.addEventListener('online', () => socket.connect());
  window.addEventListener('offline', () => setState({ connection: 'offline' }));

  // Avertissement avant de quitter pendant un appel.
  window.addEventListener('beforeunload', (e) => {
    if (activeSession()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Adaptation mobile / bureau.
  let wasMobile = innerWidth <= 700;
  window.addEventListener('resize', () => {
    const isMobile = innerWidth <= 700;
    if (isMobile === wasMobile) return;
    wasMobile = isMobile;
    document.body.setAttribute('data-mobile-view', isMobile ? (state.activeChatId ? 'chat' : 'list') : 'list');
  });

  // Indicateur de connexion perdue.
  subscribe('connection', () => {
    const existing = document.getElementById('connection-banner');
    if (state.connection === 'online') {
      existing?.remove();
      return;
    }
    if (existing) return;
    document.getElementById('overlays').append(
      el('div#connection-banner.toast.toast--error', {
        style: { position: 'fixed', top: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: '390' },
      }, [icon('warning', 'icon icon--sm'), 'Connexion perdue — reconnexion…'])
    );
  });
}

// Journalisation des erreurs non interceptées (utile en démo).
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason?.name === 'AbortError') return;
  console.error('[skype]', e.reason);
});
