/** Panneau de droite : profil de la conversation, médias, fichiers, options. */
import { el, clear, copyToClipboard } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { api, fileUrl } from '../lib/api.js';
import { state, setState, notify, getMessages, chatTitle, otherMember, getUser } from '../state.js';
import { avatar, groupAvatar, toast, confirm, lightbox, personRow, emptyState } from './common.js';
import { presenceLabel, dateOf, shortTime } from '../lib/time.js';
import { formatBytes } from '../lib/format.js';
import { openProfileCard, openGroupSettings, openAddMembers } from './modals.js';

export function openChatDetails(chat) {
  setState({ detailsOpen: true, detailsTab: 'profile' });
}

export function closeDetails() {
  setState({ detailsOpen: false });
}

export function renderDetails(chat) {
  if (!chat) return el('div.hidden');

  const isGroup = chat.type === 'group';
  const other = otherMember(chat);
  const body = el('div');

  const root = el('div.details', {}, [
    el('div.details__header', {}, [
      el('button.icon-btn', { 'aria-label': 'Fermer', onclick: closeDetails }, icon('close')),
      el('span.details__title', { text: isGroup ? 'Infos du groupe' : 'Profil' }),
    ]),
    body,
  ]);

  const tabs = el('div.tabs');
  for (const [id, label] of [['profile', 'Aperçu'], ['media', 'Médias'], ['files', 'Fichiers'], ['links', 'Liens']]) {
    tabs.append(
      el(`button.tab${state.detailsTab === id ? '.is-active' : ''}`, {
        text: label,
        onclick: () => {
          setState({ detailsTab: id });
          renderBody();
        },
      })
    );
  }

  function renderBody() {
    clear(body);
    [...tabs.children].forEach((tab, index) => {
      tab.classList.toggle('is-active', ['profile', 'media', 'files', 'links'][index] === state.detailsTab);
    });
    body.append(tabs);

    switch (state.detailsTab) {
      case 'media': return renderMedia();
      case 'files': return renderFiles();
      case 'links': return renderLinks();
      default: return renderProfile();
    }
  }

  // ── Aperçu ─────────────────────────────────────────────────────────────────

  function renderProfile() {
    body.append(
      el('div.details__hero', {}, [
        isGroup ? groupAvatar(chat, { size: 'xxl' }) : avatar(other, { size: 'xxl', presence: false }),
        el('div.details__name', { text: chatTitle(chat) }),
        !isGroup && other ? el('div.details__mood', { text: other.mood || presenceLabel(other.status, other.lastSeen) }) : null,
        isGroup ? el('div.details__mood', { text: `${chat.members.length} participants` }) : null,

        el('div.details__quick', {}, [
          quick('chat', 'Message', () => {
            closeDetails();
            setState({ activeChatId: chat.id });
          }),
          quick('call', 'Audio', async () => (await import('./calls.js')).startCall(chat, { video: false })),
          quick('video', 'Vidéo', async () => (await import('./calls.js')).startCall(chat, { video: true })),
          quick('person-add', 'Ajouter', () => openAddMembers(chat)),
        ]),
      ])
    );

    if (!isGroup && other) {
      body.append(
        el('div.details__section', {}, [
          el('div.details__section-title', { text: 'Coordonnées' }),
          row('Pseudo Skip', other.pseudo),
          row('Lieu', [other.city, other.country].filter(Boolean).join(', ')),
          row('Anniversaire', other.birthday ? dateOf(new Date(other.birthday).getTime()) : ''),
          row('Numéro Skip', other.numeroSkip),
        ])
      );
    }

    if (isGroup) {
      const membersSection = el('div.details__section', {}, [
        el('div.details__section-title', { text: `Participants (${chat.members.length})` }),
      ]);
      for (const member of chat.members.slice(0, 12)) {
        const user = member.user || getUser(member.userId);
        if (!user) continue;
        membersSection.append(
          personRow(user, {
            sub: member.role === 'admin' ? 'Administrateur' : presenceLabel(user.status, user.lastSeen),
            onClick: () => openProfileCard(user.id),
          })
        );
      }
      if (chat.members.length > 12) {
        membersSection.append(
          el('button.btn.btn--ghost.btn--sm.btn--block', { text: `Voir les ${chat.members.length} participants`, onclick: () => openGroupSettings(chat) })
        );
      }
      body.append(membersSection);
    }

    // Options rapides
    body.append(
      el('div', {}, [
        toggleAction(chat.pinned ? 'Détacher' : 'Épingler la conversation', 'pin', () => toggleFlag('pinned')),
        toggleAction(chat.muted ? 'Réactiver les notifications' : 'Couper les notifications', chat.muted ? 'bell' : 'bell-off', () => toggleFlag('muted')),
        toggleAction(chat.archived ? 'Désarchiver' : 'Archiver', 'archive', () => toggleFlag('archived')),
        isGroup
          ? el('button.details__action', { onclick: () => openGroupSettings(chat) }, [icon('settings'), 'Gérer le groupe'])
          : null,
        isGroup
          ? el('button.details__action', {
              onclick: () => {
                copyToClipboard(`${location.origin}/?join=${chat.joinLink}`);
                toast('Lien d’invitation copié');
              },
            }, [icon('link'), 'Copier le lien d’invitation'])
          : null,
        el('button.details__action.details__action--danger', {
          onclick: async () => {
            const ok = await confirm({
              title: isGroup ? 'Quitter le groupe ?' : 'Supprimer la conversation ?',
              message: isGroup ? 'Vous ne recevrez plus les messages de ce groupe.' : 'L’historique sera masqué de votre côté.',
              confirmLabel: isGroup ? 'Quitter' : 'Supprimer',
              danger: true,
            });
            if (!ok) return;
            if (isGroup) {
              await api.removeMember(chat.id, state.user.id);
              state.chats = state.chats.filter((c) => c.id !== chat.id);
            } else {
              await api.updateChat(chat.id, { archived: true });
              chat.archived = true;
            }
            setState({ activeChatId: null, detailsOpen: false });
            notify('chats');
          },
        }, [icon(isGroup ? 'logout' : 'trash'), isGroup ? 'Quitter le groupe' : 'Supprimer la conversation']),
      ])
    );
  }

  // ── Médias, fichiers, liens ────────────────────────────────────────────────

  const allAttachments = () =>
    getMessages(chat.id)
      .filter((m) => !m.deleted && m.attachments?.length)
      .flatMap((m) => m.attachments.map((a) => ({ ...a, at: m.createdAt, senderId: m.senderId })))
      .sort((a, b) => b.at - a.at);

  function renderMedia() {
    const media = allAttachments().filter((a) => a.mime?.startsWith('image/') || a.mime?.startsWith('video/'));
    if (!media.length) {
      body.append(emptyState('image', 'Aucun média', 'Les photos et vidéos partagées apparaîtront ici.'));
      return;
    }

    const items = media.map((file) => ({ url: fileUrl(file.id), downloadUrl: fileUrl(file.id, true), name: file.name, mime: file.mime }));
    const grid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '3px', padding: '3px' } });

    media.forEach((file, index) => {
      grid.append(
        el('img', {
          src: fileUrl(file.id),
          alt: file.name,
          loading: 'lazy',
          style: { width: '100%', aspectRatio: '1', objectFit: 'cover', cursor: 'zoom-in' },
          onclick: () => lightbox(items, index),
        })
      );
    });
    body.append(grid);
  }

  function renderFiles() {
    const files = allAttachments().filter((a) => !a.mime?.startsWith('image/') && !a.mime?.startsWith('video/'));
    if (!files.length) {
      body.append(emptyState('file', 'Aucun fichier', 'Les documents partagés apparaîtront ici.'));
      return;
    }
    for (const file of files) {
      const sender = getUser(file.senderId);
      body.append(
        el('a.details__action', { href: fileUrl(file.id, true), download: file.name }, [
          icon('file'),
          el('div', { style: { flex: '1', minWidth: '0' } }, [
            el('div.truncate', { text: file.name }),
            el('div.dim', { style: { fontSize: '0.78em' }, text: `${formatBytes(file.size)} · ${sender?.displayName || ''} · ${shortTime(file.at)}` }),
          ]),
          icon('download', 'icon icon--sm'),
        ])
      );
    }
  }

  function renderLinks() {
    const pattern = /(https?:\/\/[^\s]+)/g;
    const links = [];
    for (const message of getMessages(chat.id)) {
      if (message.deleted || typeof message.content !== 'string') continue;
      for (const match of message.content.match(pattern) || []) {
        links.push({ url: match, at: message.createdAt, senderId: message.senderId });
      }
    }
    if (!links.length) {
      body.append(emptyState('link', 'Aucun lien', 'Les liens partagés apparaîtront ici.'));
      return;
    }
    for (const link of links.reverse()) {
      let host = link.url;
      try {
        host = new URL(link.url).hostname.replace(/^www\./, '');
      } catch {
        /* URL malformée : on garde le texte brut */
      }
      body.append(
        el('a.details__action', { href: link.url, target: '_blank', rel: 'noopener noreferrer' }, [
          icon('link'),
          el('div', { style: { flex: '1', minWidth: '0' } }, [
            el('div.truncate', { text: host }),
            el('div.dim.truncate', { style: { fontSize: '0.78em' }, text: link.url }),
          ]),
        ])
      );
    }
  }

  // ── Aides ──────────────────────────────────────────────────────────────────

  const row = (label, value) =>
    value
      ? el('div.details__row', {}, [el('span.details__row-label', { text: label }), el('span.details__row-value', { text: value })])
      : null;

  const quick = (iconName, label, onClick) =>
    el('button.details__quick-item', { type: 'button', onclick: onClick, style: { border: 'none', background: 'none', cursor: 'pointer' } }, [
      el('span.icon-btn', { style: { background: 'var(--accent-soft)', color: 'var(--accent)' } }, icon(iconName)),
      el('span', { text: label }),
    ]);

  const toggleAction = (label, iconName, onClick) =>
    el('button.details__action', { onclick: onClick }, [icon(iconName), label]);

  async function toggleFlag(flag) {
    const next = !chat[flag];
    chat[flag] = next;
    notify('chats');
    renderBody();
    try {
      await api.updateChat(chat.id, { [flag]: next });
    } catch (err) {
      chat[flag] = !next;
      notify('chats');
      toast(err.message, { type: 'error' });
    }
  }

  renderBody();
  return root;
}
