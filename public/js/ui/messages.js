/** Rendu d'un message : bulles, pièces jointes, sondages, appels, réactions. */
import { el, escapeHtml, copyToClipboard } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { formatMessage, isJumboEmoji, formatBytes, formatDuration, firstUrl } from '../lib/format.js';
import { timeOf, relative } from '../lib/time.js';
import { api, fileUrl } from '../lib/api.js';
import { state, getUser, chatMembers, getMessages } from '../state.js';
import { avatar, menu, toast, confirm, lightbox } from './common.js';
import { openEmojiPicker, QUICK_REACTIONS, rememberEmoji } from './emoji.js';

/** Callbacks fournis par la conversation (réponse, édition, transfert…). */
export const hooks = {
  onReply: () => {},
  onEdit: () => {},
  onForward: () => {},
  onJumpTo: () => {},
  onOpenProfile: () => {},
};

// ── Message principal ─────────────────────────────────────────────────────────

export function renderMessage(message, { chat, previous = null, isLast = false, grouped = false, highlight = '' } = {}) {
  if (message.type === 'system') return renderSystem(message);

  const isOwn = message.senderId === state.user?.id;
  const sender = isOwn ? state.user : getUser(message.senderId) || { displayName: 'Inconnu', id: message.senderId };
  const isGroup = chat?.type === 'group';

  const node = el(
    `div.message${isOwn ? '.message--own' : ''}${grouped ? '.message--grouped' : ''}${isLast ? '.message--last' : ''}`,
    { dataset: { id: message.id, sender: message.senderId, ts: message.createdAt } }
  );

  node.append(avatar(sender, { size: 'sm', presence: false, className: 'message__avatar', onClick: () => hooks.onOpenProfile(sender.id) }));

  const column = el('div.message__column');

  if (isGroup && !isOwn && !grouped) {
    column.append(el('div.message__author', { text: sender.displayName }));
  }

  column.append(renderBody(message, { chat, isOwn, highlight }));

  if (Object.keys(message.reactions || {}).length) {
    column.append(renderReactions(message, chat));
  }

  column.append(renderMeta(message, { chat, isOwn }));
  node.append(column);
  node.append(renderActions(message, { chat, isOwn }));

  return node;
}

// ── Corps du message ──────────────────────────────────────────────────────────

function renderBody(message, { chat, isOwn, highlight }) {
  if (message.deleted) {
    return el('div.bubble', { style: { fontStyle: 'italic', opacity: '0.7' } }, [
      icon('block', 'icon icon--sm'),
      ' Ce message a été supprimé',
    ]);
  }

  switch (message.type) {
    case 'call':
      return renderCall(message);
    case 'poll':
      return el('div.bubble', {}, renderPoll(message, chat));
    case 'contact':
      return el('div.bubble', { style: { padding: '4px' } }, renderContactCard(message));
    case 'location':
      return el('div.bubble', { style: { padding: '4px' } }, renderLocation(message));
    default:
      break;
  }

  const parts = [];

  // Réponse citée
  if (message.replyTo) {
    const original = getMessages(message.chatId).find((m) => m.id === message.replyTo.id || m.id === message.replyTo);
    const quoted = original || message.replyTo;
    const author = getUser(quoted.senderId) || { displayName: quoted.authorName || 'Message' };
    parts.push(
      el('button.quote', { type: 'button', onclick: () => hooks.onJumpTo(quoted.id) }, [
        el('span.quote__author', { text: author.displayName }),
        el('span.quote__text', { text: previewOf(quoted) }),
      ])
    );
  }

  if (message.forwardedFrom) {
    const from = getUser(message.forwardedFrom.userId);
    parts.push(el('div.forwarded', {}, [icon('forward', 'icon icon--sm'), `Transféré${from ? ` de ${from.displayName}` : ''}`]));
  }

  // Pièces jointes
  const attachments = message.attachments || [];
  const images = attachments.filter((a) => a.mime?.startsWith('image/') || a.mime?.startsWith('video/'));
  const audios = attachments.filter((a) => a.mime?.startsWith('audio/'));
  const files = attachments.filter((a) => !images.includes(a) && !audios.includes(a));

  if (images.length) parts.push(renderImages(images));
  for (const audio of audios) parts.push(renderVoice(audio, message));
  if (message.voicemail) parts.unshift(
    el('div.voicemail-tag', {}, [icon('call', 'icon icon--sm'), 'Messagerie vocale · appel manqué'])
  );
  for (const file of files) parts.push(renderFile(file));

  // Texte
  const members = chatMembers(chat);
  const hasText = typeof message.content === 'string' && message.content.trim();
  const jumbo = hasText && !attachments.length && isJumboEmoji(message.content);

  if (hasText) {
    let html = formatMessage(message.content, {
      mentions: members,
      currentUserName: state.user?.skypeName,
      emoticons: state.user?.settings?.chat?.animatedEmoticons !== false,
    });
    if (highlight) html = highlightHtml(html, highlight);
    parts.push(el('span', { html }));
  }

  // Aperçu de lien
  if (hasText && state.user?.settings?.chat?.webLinkPreviews !== false) {
    const url = firstUrl(message.content);
    if (url) {
      parts.push(
        el('a.link-preview', { href: url.href, target: '_blank', rel: 'noopener noreferrer' }, [
          el('div.link-preview__title', { text: url.hostname.replace(/^www\./, '') }),
          el('div.link-preview__url.truncate', { text: url.href }),
        ])
      );
    }
  }

  // Traduction affichée sous le message
  if (message._translation) {
    parts.push(
      el('div', { style: { marginTop: '6px', paddingTop: '6px', borderTop: '1px solid rgba(127,127,127,.25)', fontSize: '0.92em', opacity: '0.85' } }, [
        el('span', { style: { fontWeight: '700', fontSize: '0.85em' }, text: '🌐 Traduction · ' }),
        message._translation,
      ])
    );
  }

  const bubble = el(`div.bubble${jumbo ? '.bubble--jumbo' : ''}`, {}, parts);

  // Une bulle vide (uniquement des images) n'a pas besoin de fond.
  if (!hasText && images.length && !message.replyTo) {
    bubble.style.background = 'none';
    bubble.style.padding = '0';
  }
  return bubble;
}

const previewOf = (message) => {
  if (!message) return '';
  if (message.deleted) return 'Message supprimé';
  if (message.type === 'poll') return `📊 ${message.poll?.question || 'Sondage'}`;
  if (message.attachments?.length) return apercuPieceJointe(message);
  return String(message.content || '').slice(0, 120);
};

function highlightHtml(html, term) {
  if (!term) return html;
  // Le terme est échappé comme le contenu (« d'ici » → « d&#39;ici ») avant
  // d'être neutralisé pour l'expression régulière.
  const needle = escapeHtml(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(needle, 'gi');

  // On découpe en balises et en segments de texte : seuls les seconds sont
  // surlignés, ce qui évite d'abîmer un attribut ou un nom de balise.
  return html.replace(/<[^>]*>|[^<]+/g, (segment) =>
    segment.startsWith('<') ? segment : segment.replace(pattern, (hit) => `<mark class="hit">${hit}</mark>`)
  );
}

// ── Pièces jointes ────────────────────────────────────────────────────────────

function renderImages(images) {
  const items = images.map((file) => ({
    url: fileUrl(file.id),
    downloadUrl: fileUrl(file.id, true),
    name: file.name,
    mime: file.mime,
  }));

  const grid = el(`div.attachment-grid.attachment-grid--${Math.min(images.length, 4)}`);
  if (images.length === 1) grid.className = 'attachment-grid attachment-grid--1';

  images.forEach((file, index) => {
    if (file.mime?.startsWith('video/')) {
      grid.append(el('video.attachment-video', { src: fileUrl(file.id), controls: true, preload: 'metadata' }));
      return;
    }
    grid.append(
      el('img.attachment-image', {
        src: fileUrl(file.id),
        alt: file.name || 'Image',
        loading: 'lazy',
        onclick: () => lightbox(items, index),
      })
    );
  });
  return grid;
}

function renderFile(file) {
  return el(
    'a.attachment-file',
    { href: fileUrl(file.id, true), download: file.name, target: '_blank', rel: 'noopener' },
    [
      el('div.attachment-file__icon', {}, icon('file')),
      el('div', { style: { flex: '1', minWidth: '0' } }, [
        el('div.attachment-file__name.truncate', { text: file.name }),
        el('div.attachment-file__size', { text: formatBytes(file.size) }),
      ]),
      icon('download', 'icon icon--sm'),
    ]
  );
}

/** Message vocal, avec forme d'onde cliquable. */
function renderVoice(file, message) {
  const audio = new Audio(fileUrl(file.id));
  const bars = 32;
  // Forme d'onde déterministe dérivée de l'identifiant : stable d'un rendu à l'autre.
  let seed = [...file.id].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 7);
  const nextRandom = () => ((seed = (seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;

  const wave = el('div.voice-message__wave');
  const spans = Array.from({ length: bars }, () => {
    const span = el('span', { style: { height: `${18 + nextRandom() * 82}%` } });
    wave.append(span);
    return span;
  });

  const duration = file.duration || 0;
  const time = el('span.voice-message__time', { text: formatDuration(duration) });
  const playIcon = icon('play', 'icon icon--sm');
  const button = el('button.voice-message__play', { type: 'button', 'aria-label': 'Lire le message vocal' }, playIcon);

  const setProgress = (ratio) => {
    const played = Math.round(ratio * bars);
    spans.forEach((span, index) => span.classList.toggle('is-played', index < played));
  };

  button.addEventListener('click', () => {
    if (audio.paused) {
      document.querySelectorAll('audio').forEach((other) => other !== audio && other.pause());
      audio.play();
    } else {
      audio.pause();
    }
  });
  audio.addEventListener('play', () => button.replaceChild(icon('pause', 'icon icon--sm'), button.firstChild));
  audio.addEventListener('pause', () => button.replaceChild(icon('play', 'icon icon--sm'), button.firstChild));
  audio.addEventListener('timeupdate', () => {
    if (audio.duration) {
      setProgress(audio.currentTime / audio.duration);
      time.textContent = formatDuration(audio.duration - audio.currentTime);
    }
  });
  audio.addEventListener('ended', () => {
    setProgress(0);
    time.textContent = formatDuration(audio.duration || duration);
  });
  wave.addEventListener('click', (e) => {
    const rect = wave.getBoundingClientRect();
    if (audio.duration) audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  });

  return el('div.voice-message', {}, [button, wave, time]);
}

// ── Sondages ──────────────────────────────────────────────────────────────────

export function renderPoll(message, chat) {
  const poll = message.poll;
  const totalVoters = new Set(poll.options.flatMap((o) => o.votes || [])).size;

  const node = el('div.poll', {}, [
    el('div.poll__question', {}, [icon('poll', 'icon icon--sm'), ' ', poll.question]),
  ]);

  for (const [index, option] of poll.options.entries()) {
    const votes = option.votes || [];
    const mine = votes.includes(state.user?.id);
    const ratio = totalVoters ? votes.length / totalVoters : 0;

    const voters = votes.map((id) => getUser(id)?.displayName).filter(Boolean).join(', ');

    node.append(
      el(
        `button.poll__option${mine ? '.is-voted' : ''}`,
        {
          type: 'button',
          title: voters || 'Aucun vote',
          onclick: async () => {
            const current = poll.options.flatMap((o, i) => ((o.votes || []).includes(state.user.id) ? [i] : []));
            const next = poll.multiple
              ? current.includes(index) ? current.filter((i) => i !== index) : [...current, index]
              : current.includes(index) ? [] : [index];
            try {
              await api.vote(chat.id, message.id, next);
            } catch (err) {
              toast(err.message, { type: 'error' });
            }
          },
        },
        [
          el('span.poll__bar', { style: { transform: `scaleX(${ratio})` } }),
          el('span', { style: { position: 'relative' } }, mine ? icon('check', 'icon icon--sm') : ''),
          el('span.poll__option-text', { text: option.text }),
          el('span.poll__option-count', { text: votes.length ? `${votes.length}` : '' }),
        ]
      )
    );
  }

  node.append(
    el('div.poll__footer', {}, [
      el('span', { text: `${totalVoters} vote${totalVoters > 1 ? 's' : ''}` }),
      poll.multiple ? el('span', { text: '· choix multiples' }) : null,
      poll.closed ? el('span', { text: '· clos' }) : null,
    ])
  );
  return node;
}

// ── Carte de contact et position ──────────────────────────────────────────────

function renderContactCard(message) {
  const contact = message.contactCard || {};
  return el('div.contact-card', {}, [
    avatar(contact, { size: 'md', presence: false }),
    el('div', { style: { flex: '1', minWidth: '0' } }, [
      el('div', { style: { fontWeight: '700' }, text: contact.displayName || 'Contact' }),
      el('div.dim', { style: { fontSize: '0.85em' }, text: `@${contact.skypeName || ''}` }),
    ]),
    el('button.btn.btn--sm.btn--primary', {
      text: 'Ajouter',
      onclick: async () => {
        try {
          await api.addContact(contact.id, 'Bonjour !');
          toast('Demande de contact envoyée');
        } catch (err) {
          toast(err.message, { type: 'error' });
        }
      },
    }),
  ]);
}

function renderLocation(message) {
  const loc = message.location || {};
  return el('div.location-card', {}, [
    el('div.location-card__map', {}, el('div', { style: { fontSize: '32px' }, text: '📍' })),
    el('div.location-card__body', {}, [
      el('div', { style: { fontWeight: '600', fontSize: '0.9em' }, text: loc.label || 'Position partagée' }),
      el('div.dim', { style: { fontSize: '0.8em' }, text: `${loc.lat?.toFixed(4)}, ${loc.lng?.toFixed(4)}` }),
    ]),
  ]);
}

// ── Appels et messages système ───────────────────────────────────────────────

function renderCall(message) {
  const call = message.call || {};
  const missed = call.status === 'missed' || call.status === 'declined';
  const isOwn = message.senderId === state.user?.id;

  return el(`div.call-message${missed ? '.call-message--missed' : ''}`, {}, [
    el('div.call-message__icon', {}, icon(missed ? 'call-missed' : isOwn ? 'call-out' : 'call-in')),
    el('div', { style: { flex: '1' } }, [
      el('div.call-message__title', { text: call.type === 'video' ? 'Appel vidéo' : 'Appel audio' }),
      el('div.call-message__sub', { text: message.content || '' }),
    ]),
  ]);
}

function renderSystem(message) {
  return el('div.system-message', { dataset: { id: message.id } },
    el('div.system-message__inner', { text: message.content })
  );
}

// ── Réactions ─────────────────────────────────────────────────────────────────

function renderReactions(message, chat) {
  const node = el('div.reactions');
  for (const [emoji, users] of Object.entries(message.reactions)) {
    if (!users.length) continue;
    const mine = users.includes(state.user?.id);
    const names = users.map((id) => getUser(id)?.displayName || 'Quelqu’un').join(', ');
    node.append(
      el(
        `button.reaction${mine ? '.is-mine' : ''}`,
        {
          type: 'button',
          title: `${names} — ${emoji}`,
          onclick: () => api.react(chat.id, message.id, mine ? null : emoji).catch((e) => toast(e.message, { type: 'error' })),
        },
        [el('span', { text: emoji }), users.length > 1 ? el('span.reaction__count', { text: String(users.length) }) : null]
      )
    );
  }
  return node;
}

// ── Métadonnées (heure, état de lecture) ─────────────────────────────────────

function renderMeta(message, { chat, isOwn }) {
  const parts = [el('span', { text: timeOf(message.createdAt) })];

  if (message.edited) parts.push(el('span.message__edited', { text: '· modifié' }));

  if (isOwn && message.type !== 'system') {
    const others = (chat?.members || []).filter((m) => m.userId !== state.user.id);
    const readers = others.filter((m) => message.readBy?.[m.userId]);
    const allRead = others.length > 0 && readers.length === others.length;
    const someRead = readers.length > 0;

    const title = allRead
      ? chat.type === 'group'
        ? `Lu par tout le monde`
        : `Lu ${relative(Math.max(...readers.map((m) => message.readBy[m.userId])))}`
      : someRead
        ? `Lu par ${readers.map((m) => m.user?.displayName).join(', ')}`
        : 'Remis';

    parts.push(
      el(`span.message__status${allRead ? '.message__status--read' : ''}`, { title },
        icon(someRead ? 'check-double' : 'check')
      )
    );
  }

  return el('div.message__meta', {}, parts);
}

// ── Barre d'actions au survol ────────────────────────────────────────────────

function renderActions(message, { chat, isOwn }) {
  if (message.deleted) return el('div.message__actions.hidden');

  const react = el('button.icon-btn', { type: 'button', title: 'Réagir', 'aria-label': 'Réagir' }, icon('emoji'));
  react.addEventListener('click', () => openReactionPicker(react, message, chat));

  const reply = el('button.icon-btn', {
    type: 'button',
    title: 'Répondre',
    'aria-label': 'Répondre',
    onclick: () => hooks.onReply(message),
  }, icon('reply'));

  const more = el('button.icon-btn', { type: 'button', title: 'Plus', 'aria-label': 'Plus d’options' }, icon('more'));
  more.addEventListener('click', (e) => openMessageMenu(e, message, chat, isOwn));

  return el('div.message__actions', {}, [react, reply, more]);
}

/** Sélecteur de réaction rapide (les 7 réactions de Skype + « plus »). */
export function openReactionPicker(anchor, message, chat) {
  document.querySelector('.reaction-picker')?.remove();

  const picker = el('div.reaction-picker');
  const react = async (emoji) => {
    picker.remove();
    rememberEmoji(emoji);
    const mine = Object.entries(message.reactions || {}).find(([key, users]) => key === emoji && users.includes(state.user.id));
    try {
      await api.react(chat.id, message.id, mine ? null : emoji);
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  };

  for (const emoji of QUICK_REACTIONS) {
    picker.append(el('button', { type: 'button', text: emoji, title: emoji, onclick: () => react(emoji) }));
  }
  picker.append(
    el('button', { type: 'button', title: 'Plus d’émoticônes', onclick: () => {
      picker.remove();
      openEmojiPicker(anchor, (emoji) => react(emoji), { closeOnPick: true });
    } }, [icon('plus', 'icon icon--sm')])
  );

  document.getElementById('overlays').append(picker);
  const rect = anchor.getBoundingClientRect();
  picker.style.left = `${Math.min(Math.max(8, rect.left - 100), innerWidth - picker.offsetWidth - 8)}px`;
  picker.style.top = `${Math.max(8, rect.top - picker.offsetHeight - 6)}px`;

  const dismiss = (e) => {
    if (!picker.contains(e.target)) {
      picker.remove();
      document.removeEventListener('pointerdown', dismiss);
    }
  };
  setTimeout(() => document.addEventListener('pointerdown', dismiss), 0);
}

/** Menu complet d'un message. */
export function openMessageMenu(event, message, chat, isOwn = message.senderId === state.user?.id) {
  event.preventDefault();
  const bookmarked = (state.user?.bookmarks || []).some((b) => b.messageId === message.id);
  const canEdit = isOwn && ['text', undefined, null, ''].includes(message.type || 'text') && !message.deleted;

  menu(
    [
      { label: 'Répondre', icon: 'reply', onClick: () => hooks.onReply(message) },
      { label: 'Transférer', icon: 'forward', onClick: () => hooks.onForward(message) },
      { label: 'Copier le texte', icon: 'copy', disabled: !message.content, onClick: () => copyToClipboard(message.content).then(() => toast('Texte copié')) },
      {
        label: 'Traduire',
        icon: 'translate',
        disabled: !message.content,
        onClick: async () => {
          try {
            const target = state.user?.settings?.chat?.translationLanguage || 'en';
            const { translation } = await api.translate(message.content, target);
            message._translation = translation;
            document.querySelector(`.message[data-id="${message.id}"]`)?.dispatchEvent(new CustomEvent('rerender', { bubbles: true }));
            toast('Message traduit');
          } catch (err) {
            toast(err.message, { type: 'error' });
          }
        },
      },
      {
        label: bookmarked ? 'Retirer des favoris' : 'Ajouter aux favoris',
        icon: 'bookmark',
        onClick: async () => {
          try {
            const { bookmarked: now } = await api.toggleBookmark(chat.id, message.id);
            if (now) state.user.bookmarks.push({ chatId: chat.id, messageId: message.id, at: Date.now() });
            else state.user.bookmarks = state.user.bookmarks.filter((b) => b.messageId !== message.id);
            toast(now ? 'Message ajouté aux favoris' : 'Message retiré des favoris');
          } catch (err) {
            toast(err.message, { type: 'error' });
          }
        },
      },
      'divider',
      canEdit ? { label: 'Modifier', icon: 'edit', onClick: () => hooks.onEdit(message) } : null,
      {
        label: isOwn ? 'Supprimer pour tout le monde' : 'Supprimer pour moi',
        icon: 'trash',
        danger: true,
        onClick: async () => {
          const ok = await confirm({
            title: 'Supprimer le message',
            message: isOwn
              ? 'Ce message sera retiré pour tous les participants de la conversation.'
              : 'Ce message ne sera supprimé que pour vous.',
            confirmLabel: 'Supprimer',
            danger: true,
          });
          if (!ok) return;
          try {
            await api.deleteMessage(chat.id, message.id, isOwn ? 'all' : 'me');
            if (!isOwn) {
              document.querySelector(`.message[data-id="${message.id}"]`)?.remove();
            }
          } catch (err) {
            toast(err.message, { type: 'error' });
          }
        },
      },
    ].filter(Boolean),
    { x: event.clientX, y: event.clientY }
  );
}
