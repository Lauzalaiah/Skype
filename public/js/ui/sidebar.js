/** Panneau latéral : conversations, appels, contacts, notifications, favoris, pavé. */
import { el, clear, debounce, $$ } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { api } from '../lib/api.js';
import {
  state, setState, subscribe, notify, getChat, chatTitle, otherMember,
  getUser, computeUnread,
} from '../state.js';
import { avatar, groupAvatar, menu, toast, confirm, searchBox, emptyState, personRow, sectionTitle, spinner, modal } from './common.js';
import { shortTime, presenceLabel, relative, dateTimeOf } from '../lib/time.js';
import { plainPreview, formatDuration, apercuPieceJointe } from '../lib/format.js';
import { openChatMenu } from './conversation.js';
import { openNewChatDialog, openNewGroupDialog, openProfileCard, openAddContactDialog } from './modals.js';
import { startCall, startPhoneCall, answerCall, declineCall, openCreditPurchase } from './calls.js';
import { PAYS, paysTries, paysDuNumero, tarifDuNumero, formatNumero } from '../lib/pays.js';
import * as sounds from '../lib/sounds.js';

export function renderSidebar() {
  const listNode = el('div.sidebar__list');
  const headerNode = el('div.sidebar__header');
  const searchNode = el('div.sidebar__search');
  const filtersNode = el('div.sidebar__filters');

  const incomingNode = el('div.sidebar__incoming.hidden');
  const root = el('div.sidebar', {}, [headerNode, incomingNode, searchNode, filtersNode, listNode]);

  /**
   * Appel entrant dans la colonne de gauche. Skip le montrait ici quand on
   * était déjà en communication : la fenêtre d'appel occupe l'écran, mais la
   * liste reste accessible dès qu'on la réduit.
   */
  function renderIncoming() {
    clear(incomingNode);
    const call = state.incomingCall;
    incomingNode.classList.toggle('hidden', !call);
    if (!call) return;

    const from = call.from;
    const estGroupe = call.chat?.type === 'group';
    incomingNode.append(
      el('div.sidebar__incoming-row', { role: 'alert' }, [
        avatar(from, { size: 'md', presence: false }),
        el('div.sidebar__incoming-text', {}, [
          el('div.sidebar__incoming-name', { text: estGroupe ? call.chat.topic : from?.displayName || 'Appel entrant' }),
          el('div.sidebar__incoming-type', {
            text: `${call.video ? 'Appel vidéo' : 'Appel audio'} entrant${estGroupe && from ? ` · de ${from.displayName}` : ''}`,
          }),
        ]),
        el('div.sidebar__incoming-actions', {}, [
          el('button.sidebar__incoming-btn.sidebar__incoming-btn--decline', {
            title: 'Refuser', 'aria-label': 'Refuser l’appel', onclick: () => declineCall(call),
          }, icon('hangup', 'icon icon--sm')),
          el('button.sidebar__incoming-btn.sidebar__incoming-btn--accept', {
            title: 'Répondre', 'aria-label': 'Répondre à l’appel', onclick: () => answerCall(call, { video: false }),
          }, icon('call', 'icon icon--sm')),
          call.video
            ? el('button.sidebar__incoming-btn.sidebar__incoming-btn--video', {
              title: 'Répondre en vidéo', 'aria-label': 'Répondre en vidéo', onclick: () => answerCall(call, { video: true }),
            }, icon('video', 'icon icon--sm'))
            : null,
        ]),
      ])
    );
  }

  const searchInput = searchBox('Personnes, groupes et messages', debounce((value) => {
    setState({ search: value });
  }, 250));

  function renderHeader() {
    clear(headerNode);
    const titles = {
      chats: 'Discussions',
      calls: 'Appels',
      contacts: 'Contacts',
      notifications: 'Notifications',
      bookmarks: 'Messages favoris',
      dialpad: 'Appeler un numéro',
    };

    headerNode.append(el('h1.sidebar__title', { text: titles[state.view] || 'Skip' }), el('span.spacer'));

    if (state.view === 'chats') {
      headerNode.append(
        el('button.icon-btn', {
          title: 'Nouvelle conversation',
          'aria-label': 'Nouvelle conversation',
          onclick: (e) =>
            menu(
              [
                { label: 'Nouvelle conversation', icon: 'chat', onClick: openNewChatDialog },
                { label: 'Nouveau groupe', icon: 'people', onClick: openNewGroupDialog },
                { label: 'Nouvel appel', icon: 'call', onClick: () => setState({ view: 'calls' }) },
                'divider',
                { label: 'Rejoindre par lien…', icon: 'link', onClick: joinByLink },
              ],
              { anchor: e.currentTarget, align: 'end' }
            ),
        }, icon('edit'))
      );
    }

    if (state.view === 'contacts') {
      headerNode.append(
        el('button.icon-btn', { title: 'Ajouter un contact', 'aria-label': 'Ajouter un contact', onclick: openAddContactDialog }, icon('person-add'))
      );
    }

    if (state.view === 'calls') {
      headerNode.append(
        el('button.icon-btn', { title: 'Pavé numérique', 'aria-label': 'Pavé numérique', onclick: () => setState({ view: 'dialpad' }) }, icon('dialpad'))
      );
    }
  }

  function renderSearch() {
    clear(searchNode);
    if (state.view === 'dialpad') return;
    searchNode.append(searchInput);
  }

  function renderFilters() {
    clear(filtersNode);
    if (state.view !== 'chats' || state.search) return;

    const filters = [
      ['all', 'Tout'],
      ['unread', 'Non lus'],
      ['favorites', 'Favoris'],
      ['groups', 'Groupes'],
      ['archived', 'Archivés'],
    ];
    for (const [id, label] of filters) {
      filtersNode.append(
        el(`button.filter-chip${state.filter === id ? '.is-active' : ''}`, {
          text: label,
          onclick: () => setState({ filter: id }),
        })
      );
    }
  }

  function renderList() {
    clear(listNode);
    if (state.search.trim().length >= 2) return renderSearchResults();

    switch (state.view) {
      case 'chats': return renderChats();
      case 'calls': return renderCalls();
      case 'contacts': return renderContacts();
      case 'notifications': return renderNotifications();
      case 'bookmarks': return renderBookmarks();
      case 'dialpad': return renderDialpad();
      default: return renderChats();
    }
  }

  // ── Conversations ──────────────────────────────────────────────────────────

  function renderChats() {
    let chats = state.chats.filter((c) => !!c);

    switch (state.filter) {
      case 'unread': chats = chats.filter((c) => (c.unread > 0 || c.markedUnread) && !c.archived); break;
      case 'groups': chats = chats.filter((c) => c.type === 'group' && !c.archived); break;
      case 'archived': chats = chats.filter((c) => c.archived); break;
      case 'favorites': {
        const favorites = new Set(state.favorites);
        chats = chats.filter((c) => !c.archived && (c.pinned || (c.type === 'direct' && favorites.has(otherMember(c)?.id))));
        break;
      }
      default: chats = chats.filter((c) => !c.archived);
    }

    if (!chats.length) {
      listNode.append(
        emptyState(
          'chat',
          state.filter === 'all' ? 'Aucune conversation' : 'Rien ici',
          state.filter === 'all' ? 'Commencez à discuter avec vos contacts.' : 'Essayez un autre filtre.',
          state.filter === 'all' ? el('button.btn.btn--primary', { text: 'Nouvelle conversation', onclick: openNewChatDialog }) : null
        )
      );
      return;
    }

    const pinned = chats.filter((c) => c.pinned);
    const rest = chats.filter((c) => !c.pinned);

    if (pinned.length) {
      listNode.append(sectionTitle('Épinglés'));
      for (const chat of pinned) listNode.append(chatItem(chat));
      if (rest.length) listNode.append(sectionTitle('Toutes les discussions'));
    }
    for (const chat of rest) listNode.append(chatItem(chat));
  }

  function chatItem(chat) {
    const isActive = chat.id === state.activeChatId;
    const isGroup = chat.type === 'group';
    const other = otherMember(chat);
    const unread = chat.unread > 0 || chat.markedUnread;
    const last = chat.lastMessage;

    let preview = '';
    if (chat.draft) preview = chat.draft;
    else if (!last) preview = 'Nouvelle conversation';
    else if (last.deleted) preview = 'Message supprimé';
    else if (last.type === 'system') preview = last.content;
    else if (last.type === 'call') preview = `📞 ${last.content}`;
    else if (last.type === 'poll') preview = `📊 ${last.poll?.question || 'Sondage'}`;
    else if (last.attachments?.length) {
      preview = apercuPieceJointe(last);
      if (last.content) preview += ` · ${plainPreview(last.content, 40)}`;
    } else preview = plainPreview(last.content);

    // Préfixe de l'auteur (comme Skype : « Vous : … » ou « Prénom : … »)
    if (last && !chat.draft && last.type !== 'system') {
      const author = last.senderId === state.user.id ? 'Vous' : isGroup ? getUser(last.senderId)?.displayName?.split(' ')[0] : null;
      if (author) preview = `${author} : ${preview}`;
    }

    const item = el(
      `button.chat-item${isActive ? '.is-active' : ''}${unread ? '.is-unread' : ''}`,
      {
        dataset: { id: chat.id },
        onclick: () => openChat(chat.id),
        oncontextmenu: (e) => {
          e.preventDefault();
          openChatMenu(e.currentTarget, chat);
        },
      },
      [
        isGroup ? groupAvatar(chat, { size: '' }) : avatar(other, {}),
        el('div.chat-item__body', {}, [
          el('div.chat-item__top', {}, [
            el('span.chat-item__name', { text: chatTitle(chat) }),
            el('span.chat-item__time', { text: shortTime(chat.lastMessageAt) }),
          ]),
          el('div.chat-item__bottom', {}, [
            chat.draft ? el('span.chat-item__draft', { text: 'Brouillon : ' }) : null,
            el('span.chat-item__preview', { text: preview }),
            el('div.chat-item__icons', {}, [
              chat.muted ? icon('bell-off', 'icon icon--sm') : null,
              chat.pinned ? icon('pin', 'icon icon--sm') : null,
              unread ? el('span.badge', { text: chat.unread > 0 ? String(Math.min(chat.unread, 99)) : '' }) : null,
            ]),
          ]),
        ]),
        el('span.icon-btn.icon-btn--sm.chat-item__menu', {
          role: 'button',
          tabIndex: 0,
          'aria-label': 'Options',
          onclick: (e) => {
            e.stopPropagation();
            openChatMenu(e.currentTarget, chat);
          },
        }, icon('more', 'icon icon--sm')),
      ]
    );
    return item;
  }

  // ── Appels ─────────────────────────────────────────────────────────────────

  function renderCalls() {
    if (!state.calls.length) {
      listNode.append(
        emptyState('call', 'Aucun appel', 'Vos appels récents apparaîtront ici.',
          el('button.btn.btn--primary', { text: 'Appeler un numéro', onclick: () => setState({ view: 'dialpad' }) }))
      );
      return;
    }

    listNode.append(sectionTitle('Récents'));
    for (const call of state.calls) {
      const others = (call.participantsInfo || []).filter((p) => p.id !== state.user.id);
      const target = others[0];
      const outgoing = call.initiatorId === state.user.id;
      const missed = call.status === 'missed' || call.status === 'declined';
      const chat = getChat(call.chatId);

      listNode.append(
        el('button.chat-item', {
          onclick: () => (chat ? openChat(chat.id) : null),
        }, [
          target ? avatar(target, {}) : el('div.avatar', {}, icon('call')),
          el('div.chat-item__body', {}, [
            el('div.chat-item__top', {}, [
              el('span.chat-item__name', {
                text: call.number || (others.length > 1 ? `${others.length + 1} participants` : target?.displayName || 'Appel'),
                style: missed ? { color: 'var(--danger)' } : {},
              }),
              el('span.chat-item__time', { text: shortTime(call.startedAt) }),
            ]),
            el('div.chat-item__bottom', {}, [
              icon(missed ? 'call-missed' : outgoing ? 'call-out' : 'call-in', 'icon icon--sm'),
              el('span.chat-item__preview', {
                text: `${call.type === 'video' ? 'Appel vidéo' : call.type === 'pstn' ? 'Appel téléphonique' : 'Appel audio'}${call.duration ? ` · ${formatDuration(call.duration)}` : missed ? ' · manqué' : ''}`,
              }),
            ]),
          ]),
          el('span.icon-btn.icon-btn--sm.chat-item__menu', {
            role: 'button',
            'aria-label': 'Rappeler',
            onclick: (e) => {
              e.stopPropagation();
              if (call.number) startPhoneCall(call.number);
              else if (chat) startCall(chat, { video: call.type === 'video' });
            },
          }, icon(call.type === 'video' ? 'video' : 'call', 'icon icon--sm')),
        ])
      );
    }
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  function renderContacts() {
    const contacts = [...state.contacts].sort((a, b) => {
      const rank = (u) => (u.status === 'online' ? 0 : u.status === 'away' || u.status === 'busy' ? 1 : 2);
      return rank(a) - rank(b) || a.displayName.localeCompare(b.displayName, 'fr');
    });

    if (state.requests.incoming.length) {
      listNode.append(sectionTitle(`Demandes de contact (${state.requests.incoming.length})`));
      for (const request of state.requests.incoming) listNode.append(requestRow(request));
    }

    const favorites = contacts.filter((c) => state.favorites.includes(c.id));
    if (favorites.length) {
      listNode.append(sectionTitle('Favoris'));
      for (const contact of favorites) listNode.append(contactRow(contact));
    }

    if (!contacts.length) {
      listNode.append(
        emptyState('people', 'Aucun contact', 'Recherchez quelqu’un par son pseudo Skip pour l’ajouter.',
          el('button.btn.btn--primary', { text: 'Ajouter un contact', onclick: openAddContactDialog }))
      );
      return;
    }

    const online = contacts.filter((c) => ['online', 'away', 'busy'].includes(c.status) && !state.favorites.includes(c.id));
    const offline = contacts.filter((c) => !['online', 'away', 'busy'].includes(c.status) && !state.favorites.includes(c.id));

    if (online.length) {
      listNode.append(sectionTitle(`En ligne (${online.length})`));
      for (const contact of online) listNode.append(contactRow(contact));
    }
    if (offline.length) {
      listNode.append(sectionTitle(`Hors ligne (${offline.length})`));
      for (const contact of offline) listNode.append(contactRow(contact));
    }
  }

  function contactRow(contact) {
    return el('button.chat-item', {
      onclick: () => openProfileCard(contact.id),
      oncontextmenu: (e) => {
        e.preventDefault();
        openContactMenu(e.currentTarget, contact);
      },
    }, [
      avatar(contact, {}),
      el('div.chat-item__body', {}, [
        el('div.chat-item__top', {}, [el('span.chat-item__name', { text: contact.displayName })]),
        el('div.chat-item__bottom', {}, [
          el('span.chat-item__preview', { text: contact.mood || presenceLabel(contact.status, contact.lastSeen) }),
        ]),
      ]),
      el('span.icon-btn.icon-btn--sm.chat-item__menu', {
        role: 'button',
        'aria-label': 'Envoyer un message',
        onclick: async (e) => {
          e.stopPropagation();
          await openDirectChat(contact.id);
        },
      }, icon('chat', 'icon icon--sm')),
    ]);
  }

  function requestRow(request) {
    const from = request.from;
    return el('div.chat-item', { style: { cursor: 'default' } }, [
      avatar(from, {}),
      el('div.chat-item__body', {}, [
        el('div.chat-item__top', {}, [el('span.chat-item__name', { text: from.displayName })]),
        el('div.chat-item__bottom', {}, [el('span.chat-item__preview', { text: request.message || `@${from.pseudo} souhaite vous ajouter` })]),
        el('div.row.gap-8', { style: { marginTop: '6px' } }, [
          el('button.btn.btn--primary.btn--sm', {
            text: 'Accepter',
            onclick: async () => {
              try {
                await api.respondContact(request.id, true);
                toast(`${from.displayName} a été ajouté à vos contacts`);
                await refreshContacts();
              } catch (err) {
                toast(err.message, { type: 'error' });
              }
            },
          }),
          el('button.btn.btn--sm', {
            text: 'Refuser',
            onclick: async () => {
              await api.respondContact(request.id, false);
              await refreshContacts();
            },
          }),
        ]),
      ]),
    ]);
  }

  // ── Notifications ──────────────────────────────────────────────────────────

  function renderNotifications() {
    const items = [];

    for (const request of state.requests.incoming) {
      items.push({ at: request.createdAt, node: requestRow(request) });
    }

    // Mentions et réactions récentes
    for (const [chatId, messages] of state.messages) {
      const chat = getChat(chatId);
      if (!chat) continue;
      for (const message of messages.slice(-60)) {
        if (message.mentions?.includes(state.user.id) && message.senderId !== state.user.id) {
          items.push({
            at: message.createdAt,
            node: notificationRow(getUser(message.senderId), `vous a mentionné dans ${chatTitle(chat)}`, plainPreview(message.content, 60), message.createdAt, () => openChat(chatId)),
          });
        }
        for (const [emoji, users] of Object.entries(message.reactions || {})) {
          if (message.senderId !== state.user.id) continue;
          for (const userId of users) {
            if (userId === state.user.id) continue;
            items.push({
              at: message.createdAt + 1,
              node: notificationRow(getUser(userId), `a réagi ${emoji} à votre message`, plainPreview(message.content, 60), message.createdAt, () => openChat(chatId)),
            });
          }
        }
      }
    }

    // Appels manqués
    for (const call of state.calls.filter((c) => c.status === 'missed' && c.initiatorId !== state.user.id).slice(0, 15)) {
      const from = (call.participantsInfo || []).find((p) => p.id === call.initiatorId);
      items.push({
        at: call.startedAt,
        node: notificationRow(from, 'vous a appelé', 'Appel manqué', call.startedAt, () => {
          const chat = getChat(call.chatId);
          if (chat) openChat(chat.id);
        }),
      });
    }

    if (!items.length) {
      listNode.append(emptyState('notification', 'Aucune notification', 'Les mentions, réactions et demandes apparaîtront ici.'));
      return;
    }

    items.sort((a, b) => b.at - a.at);
    for (const item of items.slice(0, 60)) listNode.append(item.node);
  }

  const notificationRow = (user, action, detail, at, onClick) =>
    el('button.chat-item', { onclick: onClick }, [
      avatar(user || { displayName: '?' }, {}),
      el('div.chat-item__body', {}, [
        el('div.chat-item__top', {}, [
          el('span.chat-item__name', { text: `${user?.displayName || 'Quelqu’un'} ${action}` }),
          el('span.chat-item__time', { text: shortTime(at) }),
        ]),
        el('div.chat-item__bottom', {}, [el('span.chat-item__preview', { text: detail })]),
      ]),
    ]);

  // ── Messages favoris ───────────────────────────────────────────────────────

  function renderBookmarks() {
    listNode.append(el('div.messages__loader', {}, spinner()));
    api.bookmarks()
      .then(({ bookmarks }) => {
        clear(listNode);
        if (!bookmarks.length) {
          listNode.append(emptyState('bookmark', 'Aucun message favori', 'Faites un clic droit sur un message puis « Ajouter aux favoris ».'));
          return;
        }
        for (const item of bookmarks) {
          const sender = getUser(item.message.senderId);
          listNode.append(
            el('button.chat-item', { onclick: () => openChat(item.chatId) }, [
              avatar(sender || { displayName: '?' }, {}),
              el('div.chat-item__body', {}, [
                el('div.chat-item__top', {}, [
                  el('span.chat-item__name', { text: sender?.displayName || 'Message' }),
                  el('span.chat-item__time', { text: shortTime(item.message.createdAt) }),
                ]),
                el('div.chat-item__bottom', {}, [el('span.chat-item__preview', { text: plainPreview(item.message.content, 70) })]),
              ]),
            ])
          );
        }
      })
      .catch((err) => {
        clear(listNode);
        listNode.append(emptyState('warning', 'Chargement impossible', err.message));
      });
  }

  // ── Pavé numérique ─────────────────────────────────────────────────────────

  function renderDialpad() {
    // Le pays choisi préremplit l'indicatif ; taper un « + » suivi d'un autre
    // indicatif change le pays automatiquement.
    let pays = paysDuNumero(state.user.dialCountry) || PAYS.find((p) => p.code === 'FR');
    let number = pays ? pays.indicatif : '';

    const display = el('div.dialpad__display', { text: '' });
    const tarifNode = el('div.dialpad__rate.dim');
    const selectPays = el('select.select.dialpad__country', {
      'aria-label': 'Pays à appeler',
      onchange: (e) => {
        const choisi = PAYS.find((p) => p.code === e.target.value);
        if (!choisi) return;
        const ancien = paysDuNumero(number);
        const reste = ancien ? number.slice(ancien.indicatif.length) : '';
        pays = choisi;
        number = choisi.indicatif + reste;
        update();
      },
    }, paysTries().map((p) =>
      el('option', { value: p.code, text: `${p.nom} (+${p.indicatif})`, selected: p.code === pays?.code })
    ));
    const keys = [
      ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
      ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
      ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
      ['*', ''], ['0', '+'], ['#', ''],
    ];

    const update = () => {
      display.textContent = formatNumero(number) || '+';
      const detecte = paysDuNumero(number);
      if (detecte && detecte.code !== selectPays.value) {
        pays = detecte;
        selectPays.value = detecte.code;
      }
      const tarif = tarifDuNumero(number);
      const nom = detecte?.nom || 'destination inconnue';
      const credit = state.user.credit ?? 0;
      const minutes = tarif > 0 ? Math.floor(credit / tarif) : 0;
      tarifNode.textContent = number.length > 2
        ? `${nom} · ${tarif.toFixed(3)} €/min · ${minutes} min avec votre crédit`
        : `${nom} · ${tarif.toFixed(3)} €/min`;
    };

    const grid = el('div.dialpad__grid');
    for (const [digit, letters] of keys) {
      let holdTimer;
      grid.append(
        el('button.dialpad__key', {
          onpointerdown: () => {
            if (digit === '0') holdTimer = setTimeout(() => { number += '+'; update(); }, 550);
          },
          onpointerup: () => clearTimeout(holdTimer),
          onclick: () => {
            if (holdTimer) clearTimeout(holdTimer);
            if (number.endsWith('+') && digit === '0') return;
            number += digit;
            sounds.dtmf(digit);
            update();
          },
        }, [el('span.dialpad__digit', { text: digit }), letters ? el('span.dialpad__letters', { text: letters }) : null])
      );
    }

    listNode.append(
      el('div.dialpad', {}, [
        el('div.credit-banner', { style: { width: '100%' } }, [
          icon('wallet', 'icon icon--lg'),
          el('div', { style: { flex: '1' } }, [
            el('div', { style: { fontSize: '0.82em', opacity: '0.9' }, text: 'Crédit Skip' }),
            el('div.credit-banner__amount', { text: `${(state.user.credit ?? 0).toFixed(2)} €` }),
          ]),
          el('button.btn.btn--sm', {
            text: 'Acheter du crédit',
            style: { background: 'rgba(255,255,255,.25)', color: '#fff' },
            onclick: () => openCreditPurchase(paysDuNumero(number), renderList),
          }),
        ]),
        selectPays,
        display,
        tarifNode,
        grid,
        el('div.row.gap-16', {}, [
          el('button.icon-btn', {
            'aria-label': 'Effacer',
            onclick: () => {
              number = number.slice(0, -1);
              update();
            },
          }, icon('back')),
          el('button.dialpad__call', {
            'aria-label': 'Appeler',
            onclick: () => {
              const national = paysDuNumero(number);
              const utile = national ? number.slice(national.indicatif.length) : number;
              if (utile.length < 4) return toast('Saisissez un numéro complet', { type: 'error' });
              startPhoneCall(number);
            },
          }, icon('call', 'icon icon--lg')),
          el('button.icon-btn', {
            'aria-label': 'Coller',
            onclick: async () => {
              try {
                number += (await navigator.clipboard.readText()).replace(/[^\d+*#]/g, '');
                update();
              } catch {
                toast('Presse-papiers inaccessible');
              }
            },
          }, icon('copy')),
        ]),
        el('p.dim.center', {
          style: { fontSize: '0.8em', maxWidth: '260px', lineHeight: '1.5' },
          text: 'Appels vers les fixes et mobiles du monde entier, avec le crédit Skip. Tarifs de démonstration : aucun appel réel n’est passé.',
        }),
        state.user.skypeNumber
          ? el('p.center', { style: { fontSize: '0.85em' } }, [el('strong', { text: 'Votre numéro Skip : ' }), state.user.skypeNumber])
          : el('button.btn.btn--outline.btn--sm', {
              text: 'Obtenir un numéro Skip',
              onclick: async () => {
                const { skypeNumber } = await api.getSkypeNumber('FR');
                state.user.skypeNumber = skypeNumber;
                toast(`Votre numéro Skip : ${skypeNumber}`);
                renderList();
              },
            }),
      ])
    );
    update();
  }

  // ── Résultats de recherche globale ─────────────────────────────────────────

  let searchController = null;

  async function renderSearchResults() {
    const query = state.search.trim();
    listNode.append(el('div.messages__loader', {}, spinner()));

    searchController?.abort();
    searchController = new AbortController();

    try {
      const { messages, chats, people } = await api.search(query, searchController.signal);
      clear(listNode);

      if (!messages.length && !chats.length && !people.length) {
        listNode.append(emptyState('search', 'Aucun résultat', `Rien ne correspond à « ${query} ».`));
        return;
      }

      if (chats.length) {
        listNode.append(sectionTitle('Conversations'));
        for (const chat of chats) listNode.append(chatItem(getChat(chat.id) || chat));
      }

      if (people.length) {
        listNode.append(sectionTitle('Personnes'));
        for (const person of people) {
          const known = state.contacts.some((c) => c.id === person.id);
          listNode.append(
            personRow(person, {
              sub: `@${person.pseudo}${person.city ? ` · ${person.city}` : ''}`,
              onClick: () => openProfileCard(person.id, person),
              trailing: known
                ? el('span.dim', { style: { fontSize: '0.8em' }, text: 'Contact' })
                : el('span.icon-btn.icon-btn--sm', {
                    role: 'button',
                    'aria-label': 'Ajouter',
                    onclick: async (e) => {
                      e.stopPropagation();
                      try {
                        await api.addContact(person.id, 'Bonjour, ajoutons-nous sur Skip !');
                        toast('Demande de contact envoyée');
                      } catch (err) {
                        toast(err.message, { type: 'error' });
                      }
                    },
                  }, icon('person-add', 'icon icon--sm')),
            })
          );
        }
      }

      if (messages.length) {
        listNode.append(sectionTitle(`Messages (${messages.length})`));
        for (const message of messages) {
          const chat = getChat(message.chatId);
          const sender = getUser(message.senderId);
          listNode.append(
            el('button.chat-item', {
              onclick: () => {
                openChat(message.chatId);
                setState({ search: '' });
                searchInput.input.value = '';
              },
            }, [
              avatar(sender || { displayName: '?' }, {}),
              el('div.chat-item__body', {}, [
                el('div.chat-item__top', {}, [
                  el('span.chat-item__name', { text: `${sender?.displayName || 'Message'}${chat ? ` · ${chatTitle(chat)}` : ''}` }),
                  el('span.chat-item__time', { text: shortTime(message.createdAt) }),
                ]),
                el('div.chat-item__bottom', {}, [el('span.chat-item__preview', { text: plainPreview(message.content, 80) })]),
              ]),
            ])
          );
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      clear(listNode);
      listNode.append(emptyState('warning', 'Recherche impossible', err.message));
    }
  }

  // ── Abonnements ────────────────────────────────────────────────────────────

  const render = () => {
    renderHeader();
    renderIncoming();
    renderSearch();
    renderFilters();
    renderList();
    computeUnread();
  };

  subscribe(['chats', 'view', 'filter', 'search', 'activeChatId', 'contacts', 'requests', 'calls', 'presence', 'user', 'incomingCall'], render);
  render();

  return root;
}

// ── Actions partagées ─────────────────────────────────────────────────────────

export function openChat(chatId) {
  setState({ activeChatId: chatId, search: '' });
  if (innerWidth <= 700) document.body.setAttribute('data-mobile-view', 'chat');
}

export async function openDirectChat(userId) {
  const existing = state.chats.find((c) => c.type === 'direct' && c.members.some((m) => m.userId === userId));
  if (existing) return openChat(existing.id);
  try {
    const { chat } = await api.createDirect(userId);
    state.chats.unshift(chat);
    notify('chats');
    openChat(chat.id);
  } catch (err) {
    toast(err.message, { type: 'error' });
  }
}

export async function refreshContacts() {
  try {
    const data = await api.contacts();
    setState({
      contacts: data.contacts,
      favorites: data.favorites,
      blocked: data.blocked,
      requests: data.requests,
    });
    for (const contact of data.contacts) state.users.set(contact.id, contact);
    notify('contacts', 'requests');
  } catch {
    /* rechargé au prochain passage */
  }
}

export function openContactMenu(anchor, contact) {
  const isFavorite = state.favorites.includes(contact.id);
  menu(
    [
      { label: 'Envoyer un message', icon: 'chat', onClick: () => openDirectChat(contact.id) },
      { label: 'Appel audio', icon: 'call', onClick: () => callContact(contact, false) },
      { label: 'Appel vidéo', icon: 'video', onClick: () => callContact(contact, true) },
      'divider',
      { label: 'Voir le profil', icon: 'contact', onClick: () => openProfileCard(contact.id) },
      {
        label: isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris',
        icon: isFavorite ? 'star' : 'star-outline',
        onClick: async () => {
          await api.favoriteContact(contact.id, !isFavorite);
          await refreshContacts();
        },
      },
      'divider',
      {
        label: 'Bloquer',
        icon: 'block',
        danger: true,
        onClick: async () => {
          const ok = await confirm({ title: `Bloquer ${contact.displayName} ?`, message: 'Cette personne ne pourra plus vous contacter.', confirmLabel: 'Bloquer', danger: true });
          if (!ok) return;
          await api.blockContact(contact.id, true);
          await refreshContacts();
          toast('Contact bloqué');
        },
      },
      {
        label: 'Retirer des contacts',
        icon: 'trash',
        danger: true,
        onClick: async () => {
          const ok = await confirm({ title: 'Retirer ce contact ?', message: `${contact.displayName} sera retiré de votre liste de contacts.`, confirmLabel: 'Retirer', danger: true });
          if (!ok) return;
          await api.removeContact(contact.id);
          await refreshContacts();
        },
      },
    ],
    { anchor }
  );
}

async function callContact(contact, video) {
  const existing = state.chats.find((c) => c.type === 'direct' && c.members.some((m) => m.userId === contact.id));
  let chat = existing;
  if (!chat) {
    const result = await api.createDirect(contact.id);
    chat = result.chat;
    state.chats.unshift(chat);
    notify('chats');
  }
  startCall(chat, { video });
}

async function joinByLink() {
  const { prompt } = await import('./common.js');
  const link = await prompt({ title: 'Rejoindre une conversation', label: 'Collez le lien d’invitation', placeholder: 'https://…/?join=…' });
  if (!link) return;
  const code = link.includes('join=') ? link.split('join=')[1].split(/[&#]/)[0] : link.trim();
  try {
    const { chat } = await api.joinByLink(code);
    state.chats = state.chats.filter((c) => c.id !== chat.id);
    state.chats.unshift(chat);
    notify('chats');
    openChat(chat.id);
    toast('Vous avez rejoint la conversation');
  } catch (err) {
    toast(err.message, { type: 'error' });
  }
}
