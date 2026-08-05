/** Vue conversation : en-tête, fil de messages, recherche interne, rédaction. */
import { el, clear, $, $$, debounce, throttle, copyToClipboard } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { api } from '../lib/api.js';
import { socket } from '../lib/socket.js';
import {
  state, setState, getChat, getMessages, getUser, chatTitle, otherMember,
  chatMembers, typingUsers, subscribe, notify,
} from '../state.js';
import { avatar, groupAvatar, menu, toast, confirm, modal, emptyState, spinner } from './common.js';
import { renderMessage, hooks as messageHooks } from './messages.js';
import { createComposer } from './composer.js';
import { dayLabel, shouldGroup, presenceLabel, isSameDay } from '../lib/time.js';
import { plainPreview } from '../lib/format.js';
import { startCall } from './calls.js';
import { openChatDetails } from './details.js';
import { openForwardDialog, openGroupSettings, openProfileCard, openAddMembers } from './modals.js';

let current = null; // instance active

export function renderConversation(chatId) {
  const chat = getChat(chatId);
  if (!chat) return emptyState('chat', 'Conversation introuvable', '');

  current?.destroy();

  const messagesNode = el('div.messages', { role: 'log', 'aria-live': 'polite', 'aria-label': 'Messages' });
  const typingNode = el('div.typing-indicator.hidden');
  const searchBar = el('div.hidden');
  const callBanner = el('div.hidden');
  const scrollDown = el('button.scroll-down.hidden', { 'aria-label': 'Aller au dernier message' }, icon('down'));

  let searchTerm = '';
  let searchHits = [];
  let searchIndex = 0;
  let loadingMore = false;
  let firstUnreadShown = false;

  const composer = createComposer(chat, { onSent: () => scrollToBottom(true) });

  // ── En-tête ────────────────────────────────────────────────────────────────

  const header = buildHeader();

  function buildHeader() {
    const other = otherMember(chat);
    const isGroup = chat.type === 'group';
    const title = chatTitle(chat);

    const sub = isGroup
      ? `${chat.members.length} participant${chat.members.length > 1 ? 's' : ''}`
      : presenceLabel(other?.status, other?.lastSeen);

    return el('div.main__header', {}, [
      el('button.icon-btn.main__back', {
        'aria-label': 'Retour',
        onclick: () => document.body.setAttribute('data-mobile-view', 'list'),
      }, icon('back')),

      isGroup ? groupAvatar(chat, { size: 'md' }) : avatar(other, { size: 'md' }),

      el('div.main__header-info', { onclick: () => openChatDetails(chat) }, [
        el('div.main__header-title', {}, [
          el('span.truncate', { text: title }),
          chat.muted ? icon('bell-off', 'icon icon--sm') : null,
          chat.pinned ? icon('pin', 'icon icon--sm') : null,
        ]),
        el('div.main__header-sub', {}, [
          !isGroup && other ? el('span.status-dot', { dataset: { status: other.status || 'offline' } }) : null,
          el('span.truncate', { text: sub }),
        ]),
      ]),

      el('div.main__header-actions', {}, [
        el('button.icon-btn', {
          title: 'Rechercher dans la conversation',
          'aria-label': 'Rechercher',
          onclick: toggleSearch,
        }, icon('search')),
        el('button.icon-btn', {
          title: 'Appel audio',
          'aria-label': 'Appel audio',
          onclick: () => startCall(chat, { video: false }),
        }, icon('call')),
        el('button.icon-btn', {
          title: 'Appel vidéo',
          'aria-label': 'Appel vidéo',
          onclick: () => startCall(chat, { video: true }),
        }, icon('video')),
        el('button.icon-btn', {
          title: 'Ajouter des participants',
          'aria-label': 'Ajouter des participants',
          onclick: () => openAddMembers(chat),
        }, icon('person-add')),
        el('button.icon-btn', {
          title: 'Informations',
          'aria-label': 'Informations',
          onclick: () => openChatDetails(chat),
        }, icon('info')),
        el('button.icon-btn', {
          title: 'Plus',
          'aria-label': 'Plus d’options',
          onclick: (e) => openChatMenu(e.currentTarget, chat),
        }, icon('more')),
      ]),
    ]);
  }

  // ── Rendu du fil ───────────────────────────────────────────────────────────

  function renderAll({ keepScroll = false } = {}) {
    const previousHeight = messagesNode.scrollHeight;
    const previousTop = messagesNode.scrollTop;

    clear(messagesNode);
    const messages = getMessages(chat.id);

    if (state.hasMore.get(chat.id)) {
      messagesNode.append(
        el('div.messages__loader', {}, el('button.btn.btn--ghost.btn--sm', { text: 'Charger les messages précédents', onclick: loadMore }))
      );
    }

    if (!messages.length) {
      messagesNode.append(welcomeBlock());
      return;
    }

    const member = chat.members.find((m) => m.userId === state.user.id);
    const lastReadAt = member?.lastReadAt || 0;
    firstUnreadShown = false;

    let previous = null;
    messages.forEach((message, index) => {
      // Séparateur de jour
      if (!previous || !isSameDay(previous.createdAt, message.createdAt)) {
        messagesNode.append(el('div.day-separator', { text: dayLabel(message.createdAt) }));
        previous = null; // pas de groupement à travers les jours
      }

      // Séparateur « nouveaux messages »
      if (
        !firstUnreadShown &&
        lastReadAt &&
        message.createdAt > lastReadAt &&
        message.senderId !== state.user.id &&
        message.type !== 'system'
      ) {
        firstUnreadShown = true;
        messagesNode.append(el('div.unread-separator', { text: 'Nouveaux messages' }));
        previous = null;
      }

      const node = renderMessage(message, {
        chat,
        previous,
        grouped: shouldGroup(previous, message),
        isLast: index === messages.length - 1,
        highlight: searchTerm,
      });
      messagesNode.append(node);
      previous = message;
    });

    if (keepScroll) {
      messagesNode.scrollTop = messagesNode.scrollHeight - previousHeight + previousTop;
    }
    updateSearchHits();
  }

  function welcomeBlock() {
    const other = otherMember(chat);
    const isGroup = chat.type === 'group';
    return el('div', { style: { display: 'grid', placeItems: 'center', padding: '48px 20px', textAlign: 'center', gap: '12px' } }, [
      isGroup ? groupAvatar(chat, { size: 'xl' }) : avatar(other, { size: 'xl', presence: false }),
      el('h2', { style: { fontSize: '1.3em', marginTop: '8px' }, text: chatTitle(chat) }),
      el('p.dim', {
        style: { maxWidth: '400px', lineHeight: '1.55' },
        text: isGroup
          ? 'C’est le début de ce groupe. Dites bonjour, lancez un appel ou créez un sondage.'
          : `C’est le début de votre conversation avec ${other?.displayName || ''}. Envoyez un message ou lancez un appel.`,
      }),
      el('div.row.gap-8', {}, [
        el('button.btn.btn--primary', { onclick: () => startCall(chat, { video: false }) }, [icon('call', 'icon icon--sm'), 'Appeler']),
        el('button.btn', { onclick: () => startCall(chat, { video: true }) }, [icon('video', 'icon icon--sm'), 'Appel vidéo']),
        el('button.btn', { onclick: () => composer.insert('👋 ') }, ['👋 Dire bonjour']),
      ]),
    ]);
  }

  // ── Défilement ─────────────────────────────────────────────────────────────

  const isAtBottom = () => messagesNode.scrollHeight - messagesNode.scrollTop - messagesNode.clientHeight < 120;

  function scrollToBottom(smooth = false) {
    messagesNode.scrollTo({ top: messagesNode.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    scrollDown.classList.add('hidden');
  }

  const onScroll = throttle(() => {
    scrollDown.classList.toggle('hidden', isAtBottom());
    if (messagesNode.scrollTop < 80 && state.hasMore.get(chat.id) && !loadingMore) loadMore();
    if (isAtBottom() && (chat.unread || chat.markedUnread)) markAsRead();
  }, 150);

  async function loadMore() {
    if (loadingMore) return;
    loadingMore = true;
    const messages = getMessages(chat.id);
    const oldest = messages[0]?.createdAt;
    try {
      const { messages: older, hasMore } = await api.messages(chat.id, { before: oldest, limit: 50 });
      if (older.length) {
        state.messages.set(chat.id, [...older, ...messages]);
        for (const message of older) if (message.senderId !== 'system') getUser(message.senderId);
      }
      state.hasMore.set(chat.id, hasMore);
      renderAll({ keepScroll: true });
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      loadingMore = false;
    }
  }

  const markAsRead = debounce(() => {
    if (!chat.unread && !chat.markedUnread) return;
    chat.unread = 0;
    chat.markedUnread = false;
    const member = chat.members.find((m) => m.userId === state.user.id);
    if (member) member.lastReadAt = Date.now();
    socket.send({ type: 'read', chatId: chat.id });
    notify('chats');
  }, 400);

  // ── Recherche dans la conversation ────────────────────────────────────────

  function toggleSearch() {
    if (!searchBar.classList.contains('hidden')) {
      searchBar.classList.add('hidden');
      searchTerm = '';
      renderAll();
      return;
    }
    clear(searchBar);
    const input = el('input.input', {
      placeholder: 'Rechercher dans cette conversation…',
      oninput: debounce((e) => {
        searchTerm = e.target.value.trim();
        renderAll();
        if (searchHits.length) jumpToHit(0);
      }, 200),
      onkeydown: (e) => {
        if (e.key === 'Enter') jumpToHit(searchIndex + (e.shiftKey ? -1 : 1));
        if (e.key === 'Escape') toggleSearch();
      },
    });
    const count = el('span.chat-search__count');
    searchBar.className = 'chat-search';
    searchBar.append(
      icon('search', 'icon icon--sm'),
      input,
      count,
      el('button.icon-btn.icon-btn--sm', { onclick: () => jumpToHit(searchIndex - 1), 'aria-label': 'Précédent' }, icon('up')),
      el('button.icon-btn.icon-btn--sm', { onclick: () => jumpToHit(searchIndex + 1), 'aria-label': 'Suivant' }, icon('down')),
      el('button.icon-btn.icon-btn--sm', { onclick: toggleSearch, 'aria-label': 'Fermer' }, icon('close'))
    );
    searchBar.countNode = count;
    input.focus();
  }

  function updateSearchHits() {
    searchHits = $$('mark.hit', messagesNode);
    if (searchBar.countNode) {
      searchBar.countNode.textContent = searchTerm ? (searchHits.length ? `${Math.min(searchIndex + 1, searchHits.length)} / ${searchHits.length}` : 'Aucun résultat') : '';
    }
  }

  function jumpToHit(index) {
    if (!searchHits.length) return;
    searchIndex = (index + searchHits.length) % searchHits.length;
    searchHits.forEach((hit, i) => hit.classList.toggle('hit--current', i === searchIndex));
    searchHits[searchIndex].scrollIntoView({ block: 'center', behavior: 'smooth' });
    updateSearchHits();
  }

  // ── Indicateur de saisie ───────────────────────────────────────────────────

  function updateTyping() {
    const users = typingUsers(chat.id).filter((u) => u.id !== state.user.id);
    if (!users.length) {
      typingNode.classList.add('hidden');
      return;
    }
    const names = users.map((u) => u.displayName.split(' ')[0]).join(', ');
    clear(typingNode);
    typingNode.append(
      el('span.typing-dots', {}, [el('span'), el('span'), el('span')]),
      el('span', { text: users.length === 1 ? `${names} est en train d’écrire…` : `${names} sont en train d’écrire…` })
    );
    typingNode.classList.remove('hidden');
  }

  // ── Bandeau d'appel en cours ───────────────────────────────────────────────

  function updateCallBanner() {
    const active = state.activeCall;
    const relevant = active && active.chatId === chat.id;
    if (!relevant || active.joined) {
      callBanner.className = 'hidden';
      clear(callBanner);
      return;
    }
    callBanner.className = 'call-banner';
    clear(callBanner);
    callBanner.append(
      icon('call', 'icon icon--sm'),
      el('span', { text: 'Un appel est en cours dans cette conversation' }),
      el('span.spacer'),
      el('button.btn.btn--sm', { text: 'Rejoindre', onclick: () => startCall(chat, { join: active.id }) })
    );
  }

  // ── Raccordements ──────────────────────────────────────────────────────────

  messageHooks.onReply = (message) => composer.setReply(message);
  messageHooks.onEdit = (message) => composer.startEdit(message);
  messageHooks.onForward = (message) => openForwardDialog(chat, message);
  messageHooks.onOpenProfile = (userId) => openProfileCard(userId);
  messageHooks.onJumpTo = (messageId) => {
    const node = $(`.message[data-id="${messageId}"]`, messagesNode);
    if (!node) return toast('Message trop ancien pour être affiché');
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    node.style.transition = 'background 200ms';
    node.style.background = 'var(--accent-soft)';
    setTimeout(() => (node.style.background = ''), 1200);
  };

  messagesNode.addEventListener('scroll', onScroll);
  messagesNode.addEventListener('rerender', () => renderAll());

  // Menu contextuel sur les messages (clic droit).
  messagesNode.addEventListener('contextmenu', (e) => {
    const node = e.target.closest('.message');
    if (!node) return;
    const message = getMessages(chat.id).find((m) => m.id === node.dataset.id);
    if (!message) return;
    import('./messages.js').then(({ openMessageMenu }) => openMessageMenu(e, message, chat));
  });

  // Mentions cliquables
  messagesNode.addEventListener('click', (e) => {
    const mention = e.target.closest('.mention');
    if (!mention) return;
    const member = chatMembers(chat).find((m) => m.pseudo === mention.dataset.mention);
    if (member) openProfileCard(member.id);
  });

  // Glisser-déposer de fichiers
  const dropOverlay = el('div.drop-overlay.hidden', {}, el('div.drop-overlay__inner', {}, [icon('attach', 'icon icon--xl'), el('div', { text: 'Déposez vos fichiers pour les envoyer' })]));
  let dragDepth = 0;

  const conversationNode = el('div.conversation', {}, [
    searchBar,
    callBanner,
    messagesNode,
    typingNode,
    composer.root,
    scrollDown,
    dropOverlay,
  ]);

  conversationNode.addEventListener('dragenter', (e) => {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
    dragDepth++;
    dropOverlay.classList.remove('hidden');
  });
  conversationNode.addEventListener('dragover', (e) => e.preventDefault());
  conversationNode.addEventListener('dragleave', () => {
    if (--dragDepth <= 0) {
      dragDepth = 0;
      dropOverlay.classList.add('hidden');
    }
  });
  conversationNode.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    dropOverlay.classList.add('hidden');
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) composer.addFiles(files);
  });

  scrollDown.addEventListener('click', () => {
    scrollToBottom(true);
    markAsRead();
  });

  // ── Abonnements à l'état ───────────────────────────────────────────────────

  const unsubscribers = [
    subscribe('messages', () => {
      const wasAtBottom = isAtBottom();
      renderAll();
      if (wasAtBottom) {
        scrollToBottom();
        markAsRead();
      } else {
        const unread = getMessages(chat.id).filter((m) => m.createdAt > (chat.members.find((x) => x.userId === state.user.id)?.lastReadAt || 0) && m.senderId !== state.user.id).length;
        clear(scrollDown);
        scrollDown.append(icon('down'), unread ? el('span.scroll-down__badge', { text: String(Math.min(unread, 99)) }) : '');
        scrollDown.classList.remove('hidden');
      }
    }),
    subscribe('typing', updateTyping),
    subscribe('presence', () => {
      const fresh = buildHeader();
      header.replaceWith(fresh);
      Object.assign(header, fresh);
    }),
    subscribe('activeCall', updateCallBanner),
  ];

  // ── Chargement initial ─────────────────────────────────────────────────────

  (async () => {
    if (!state.messages.has(chat.id)) {
      messagesNode.append(el('div.messages__loader', {}, spinner(true)));
      try {
        const { messages, hasMore } = await api.messages(chat.id);
        state.messages.set(chat.id, messages);
        state.hasMore.set(chat.id, hasMore);
      } catch (err) {
        clear(messagesNode);
        messagesNode.append(emptyState('warning', 'Chargement impossible', err.message));
        return;
      }
    }
    renderAll();
    scrollToBottom();
    updateTyping();
    updateCallBanner();
    markAsRead();
    composer.focus();
  })();

  const instance = {
    node: el('div.main', {}, [header, el('div.main__body', {}, conversationNode)]),
    chatId: chat.id,
    scrollToBottom,
    focusComposer: () => composer.focus(),
    reply: (message) => composer.setReply(message),
    toggleSearch,
    destroy() {
      composer.destroy();
      messagesNode.removeEventListener('scroll', onScroll);
      for (const off of unsubscribers) off();
      current = null;
    },
  };
  current = instance;
  return instance.node;
}

export const currentConversation = () => current;

// ── Menu « … » de la conversation ────────────────────────────────────────────

export function openChatMenu(anchor, chat) {
  const isGroup = chat.type === 'group';
  const other = otherMember(chat);

  menu(
    [
      { label: chat.pinned ? 'Détacher de la liste' : 'Épingler en haut', icon: 'pin', onClick: () => toggleFlag(chat, 'pinned') },
      { label: chat.muted ? 'Réactiver les notifications' : 'Couper les notifications', icon: chat.muted ? 'bell' : 'bell-off', onClick: () => toggleFlag(chat, 'muted') },
      { label: chat.markedUnread ? 'Marquer comme lu' : 'Marquer comme non lu', icon: 'check', onClick: () => toggleFlag(chat, 'markedUnread') },
      { label: chat.archived ? 'Désarchiver' : 'Archiver', icon: 'archive', onClick: () => toggleFlag(chat, 'archived') },
      'divider',
      { label: 'Rechercher dans la conversation', icon: 'search', onClick: () => current?.toggleSearch?.() },
      { label: 'Ajouter des participants', icon: 'person-add', onClick: () => openAddMembers(chat) },
      { label: 'Informations et médias', icon: 'info', onClick: () => openChatDetails(chat) },
      isGroup ? { label: 'Gérer le groupe', icon: 'settings', onClick: () => openGroupSettings(chat) } : null,
      isGroup
        ? {
            label: 'Copier le lien d’invitation',
            icon: 'link',
            onClick: () => {
              copyToClipboard(`${location.origin}/?join=${chat.joinLink}`);
              toast('Lien d’invitation copié');
            },
          }
        : null,
      !isGroup && other ? { label: 'Voir le profil', icon: 'contact', onClick: () => openProfileCard(other.id) } : null,
      'divider',
      !isGroup && other
        ? {
            label: 'Bloquer ce contact',
            icon: 'block',
            danger: true,
            onClick: async () => {
              const ok = await confirm({
                title: `Bloquer ${other.displayName} ?`,
                message: 'Cette personne ne pourra plus vous appeler ni vous envoyer de messages. Elle n’en sera pas informée.',
                confirmLabel: 'Bloquer',
                danger: true,
              });
              if (!ok) return;
              await api.blockContact(other.id, true);
              toast(`${other.displayName} a été bloqué`);
            },
          }
        : null,
      isGroup
        ? {
            label: 'Quitter le groupe',
            icon: 'logout',
            danger: true,
            onClick: async () => {
              const ok = await confirm({
                title: 'Quitter le groupe ?',
                message: `Vous ne recevrez plus les messages de « ${chat.topic} ».`,
                confirmLabel: 'Quitter',
                danger: true,
              });
              if (!ok) return;
              await api.removeMember(chat.id, state.user.id);
              state.chats = state.chats.filter((c) => c.id !== chat.id);
              setState({ activeChatId: null });
              notify('chats');
            },
          }
        : null,
    ].filter(Boolean),
    { anchor, align: 'end' }
  );
}

async function toggleFlag(chat, flag) {
  const next = !chat[flag];
  chat[flag] = next;
  if (flag === 'markedUnread' && next) chat.unread = chat.unread || 1;
  notify('chats');
  try {
    await api.updateChat(chat.id, { [flag]: next });
  } catch (err) {
    chat[flag] = !next;
    notify('chats');
    toast(err.message, { type: 'error' });
  }
}
