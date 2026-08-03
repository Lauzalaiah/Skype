/** Zone de rédaction : texte enrichi, pièces jointes, voix, mentions, brouillons. */
import { el, clear, debounce, escapeHtml } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { api, fileUrl } from '../lib/api.js';
import { socket } from '../lib/socket.js';
import { state, chatMembers, getUser } from '../state.js';
import { toast, menu, avatar, modal, confirm } from './common.js';
import { openEmojiPicker } from './emoji.js';
import { extractMentions, formatBytes, formatDuration } from '../lib/format.js';
import * as sounds from '../lib/sounds.js';

const MAX_FILE_SIZE = 64 * 1024 * 1024;

export function createComposer(chat, { onSent = () => {} } = {}) {
  let attachments = [];       // { file, meta, node, uploaded }
  let replyTo = null;
  let editing = null;
  let recorder = null;

  // ── Champ de saisie ────────────────────────────────────────────────────────
  const input = el('div.composer__input', {
    contenteditable: 'plaintext-only',
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-label': 'Écrire un message',
    'data-placeholder': `Écrivez un message à ${chat.type === 'group' ? chat.topic : 'votre contact'}…`,
    spellcheck: 'true',
  });

  // Certains navigateurs ignorent plaintext-only : on se rabat sur true.
  if (input.contentEditable !== 'plaintext-only') input.contentEditable = 'true';

  const replyBar = el('div.composer__reply.hidden');
  const attachmentBar = el('div.composer__attachments.hidden');
  const formatBar = el('div.composer__format-bar.hidden');
  const recorderBar = el('div.hidden');

  const getText = () => input.innerText.replace(/ /g, ' ').replace(/\n$/, '');
  const setText = (text) => {
    input.textContent = text;
    updateSendState();
    autoGrow();
  };

  // ── Boutons ────────────────────────────────────────────────────────────────
  const sendButton = el('button.icon-btn.composer__send', {
    type: 'button',
    title: 'Envoyer (Entrée)',
    'aria-label': 'Envoyer',
    disabled: true,
    onclick: () => send(),
  }, icon('send'));

  const emojiButton = el('button.icon-btn', { type: 'button', title: 'Émoticônes', 'aria-label': 'Émoticônes' }, icon('emoji'));
  emojiButton.addEventListener('click', () => {
    openEmojiPicker(emojiButton, (emoji) => {
      insertAtCursor(emoji);
      updateSendState();
    });
  });

  const fileInput = el('input', {
    type: 'file',
    multiple: true,
    class: 'sr-only',
    onchange: (e) => {
      addFiles([...e.target.files]);
      e.target.value = '';
    },
  });

  const attachButton = el('button.icon-btn', { type: 'button', title: 'Envoyer un fichier', 'aria-label': 'Joindre' }, icon('attach'));
  attachButton.addEventListener('click', (e) =>
    menu(
      [
        { label: 'Photo ou vidéo', icon: 'image', onClick: () => { fileInput.accept = 'image/*,video/*'; fileInput.click(); } },
        { label: 'Fichier', icon: 'file', onClick: () => { fileInput.accept = ''; fileInput.click(); } },
        'divider',
        { label: 'Créer un sondage', icon: 'poll', onClick: () => openPollComposer(chat) },
        { label: 'Envoyer un contact', icon: 'contact', onClick: () => openContactPicker(chat) },
        { label: 'Partager ma position', icon: 'location', onClick: () => shareLocation(chat) },
        { label: 'Envoyer un GIF', icon: 'gif', onClick: () => openGifPicker(chat) },
      ],
      { anchor: attachButton }
    )
  );

  const micButton = el('button.icon-btn', { type: 'button', title: 'Message vocal', 'aria-label': 'Enregistrer un message vocal' }, icon('mic'));
  micButton.addEventListener('click', () => (recorder ? stopRecording(true) : startRecording()));

  const formatButton = el('button.icon-btn', { type: 'button', title: 'Mise en forme', 'aria-label': 'Mise en forme' }, icon('bold'));
  formatButton.addEventListener('click', () => {
    formatBar.classList.toggle('hidden');
    formatButton.classList.toggle('is-active');
    input.focus();
  });

  for (const [label, iconName, wrapper, title] of [
    ['Gras', 'bold', '*', 'Gras'],
    ['Italique', 'italic', '_', 'Italique'],
    ['Barré', 'strike', '~', 'Barré'],
    ['Code', 'code', '`', 'Code'],
    ['Citation', 'quote', '> ', 'Citation'],
  ]) {
    formatBar.append(
      el('button.icon-btn.icon-btn--sm', {
        type: 'button',
        title,
        'aria-label': label,
        onclick: () => wrapSelection(wrapper),
      }, icon(iconName, 'icon icon--sm'))
    );
  }

  const box = el('div.composer__box', {}, [
    el('div.composer__tools', {}, [attachButton, emojiButton]),
    input,
    el('div.composer__tools', {}, [formatButton, micButton, sendButton]),
  ]);

  // fileInput est rattaché au DOM : un input détaché ne peut pas ouvrir le
  // sélecteur de fichiers dans tous les navigateurs.
  const root = el('div.composer', {}, [replyBar, attachmentBar, recorderBar, formatBar, box, fileInput]);

  // ── Envoi ──────────────────────────────────────────────────────────────────

  async function send() {
    const text = getText().trim();
    const pending = attachments.filter((a) => a.meta);
    if (!text && !pending.length) return;
    if (attachments.some((a) => !a.meta)) {
      toast('Téléversement en cours…');
      return;
    }

    if (editing) {
      const message = editing;
      cancelEdit();
      try {
        await api.editMessage(chat.id, message.id, text);
      } catch (err) {
        toast(err.message, { type: 'error' });
      }
      return;
    }

    const payload = {
      type: pending.length ? (pending[0].meta.mime?.startsWith('image/') ? 'image' : 'file') : 'text',
      content: text,
      attachments: pending.map((a) => a.meta),
      mentions: extractMentions(text, chatMembers(chat)),
      replyTo: replyTo ? { id: replyTo.id, senderId: replyTo.senderId, content: String(replyTo.content || '').slice(0, 200), type: replyTo.type } : null,
    };

    // Réinitialisation immédiate : l'interface reste réactive.
    setText('');
    clearAttachments();
    setReply(null);
    api.saveDraft(chat.id, '').catch(() => {});
    stopTyping();

    try {
      await api.send(chat.id, payload);
      // Un envoi de fichier a son propre son ; un message texte reste discret.
      if (pending.length) sounds.fileSent();
      else sounds.messageOut();
      onSent();
    } catch (err) {
      toast(err.message, { type: 'error' });
      setText(text); // on rend le texte à l'utilisateur en cas d'échec
    }
  }

  // ── Pièces jointes ─────────────────────────────────────────────────────────

  async function addFiles(files) {
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        toast(`« ${file.name} » dépasse 64 Mo`, { type: 'error' });
        continue;
      }

      const progress = el('div.composer__attachment-progress', { style: { width: '0%' } });
      const preview = file.type.startsWith('image/')
        ? el('img', { src: URL.createObjectURL(file) })
        : el('div', { style: { textAlign: 'center', padding: '4px' } }, [
            icon('file', 'icon icon--sm'),
            el('div', { style: { fontSize: '9px', marginTop: '2px', overflow: 'hidden' }, text: file.name.slice(0, 14) }),
          ]);

      const entry = { file, meta: null };
      const node = el('div.composer__attachment', { title: `${file.name} · ${formatBytes(file.size)}` }, [
        preview,
        progress,
        el('button.composer__attachment-remove', {
          type: 'button',
          'aria-label': 'Retirer',
          onclick: () => {
            attachments = attachments.filter((a) => a !== entry);
            node.remove();
            if (!attachments.length) attachmentBar.classList.add('hidden');
            updateSendState();
          },
        }, icon('close', 'icon icon--sm')),
      ]);

      entry.node = node;
      attachments.push(entry);
      attachmentBar.append(node);
      attachmentBar.classList.remove('hidden');
      updateSendState();

      // Dimensions de l'image, utiles à l'affichage côté destinataire.
      if (file.type.startsWith('image/')) {
        try {
          const bitmap = await createImageBitmap(file);
          file.width = bitmap.width;
          file.height = bitmap.height;
          bitmap.close?.();
        } catch {
          /* format non décodable : sans importance */
        }
      }

      try {
        entry.meta = await api.upload(file, (ratio) => (progress.style.width = `${Math.round(ratio * 100)}%`));
        progress.style.width = '100%';
        progress.style.background = 'var(--presence-online)';
      } catch (err) {
        sounds.fileSendFailed();
        toast(`Échec de l'envoi de ${file.name}`, { type: 'error' });
        attachments = attachments.filter((a) => a !== entry);
        node.remove();
      }
      updateSendState();
    }
  }

  function clearAttachments() {
    attachments = [];
    clear(attachmentBar);
    attachmentBar.classList.add('hidden');
    updateSendState();
  }

  // ── Réponse et édition ─────────────────────────────────────────────────────

  function setReply(message) {
    replyTo = message;
    clear(replyBar);
    if (!message) {
      replyBar.classList.add('hidden');
      return;
    }
    const author = getUser(message.senderId) || state.user;
    replyBar.append(
      icon('reply', 'icon icon--sm'),
      el('div', { style: { flex: '1', minWidth: '0' } }, [
        el('div', { style: { fontWeight: '700', color: 'var(--accent)' }, text: `Réponse à ${author?.displayName || ''}` }),
        el('div.truncate.dim', { text: String(message.content || '').slice(0, 120) || 'Pièce jointe' }),
      ]),
      el('button.icon-btn.icon-btn--sm', { type: 'button', onclick: () => setReply(null), 'aria-label': 'Annuler' }, icon('close', 'icon icon--sm'))
    );
    replyBar.classList.remove('hidden');
    input.focus();
  }

  function startEdit(message) {
    editing = message;
    setText(message.content || '');
    box.style.borderColor = 'var(--warning)';
    input.dataset.placeholder = 'Modifier le message… (Échap pour annuler)';
    input.focus();
    placeCursorAtEnd();
    sendButton.title = 'Enregistrer (Entrée)';
  }

  function cancelEdit() {
    editing = null;
    setText('');
    box.style.borderColor = '';
    input.dataset.placeholder = `Écrivez un message…`;
    sendButton.title = 'Envoyer (Entrée)';
  }

  // ── Enregistrement vocal ───────────────────────────────────────────────────

  async function startRecording() {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      toast('Micro inaccessible. Vérifiez les autorisations du navigateur.', { type: 'error' });
      return;
    }

    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type)) || '';
    const media = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    const startedAt = Date.now();

    media.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    media.start(200);

    // Visualisation du niveau sonore.
    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    const wave = el('div.recorder__wave');
    const bars = Array.from({ length: 28 }, () => {
      const bar = el('span', { style: { height: '2px' } });
      wave.append(bar);
      return bar;
    });

    const timeLabel = el('span.recorder__time', { text: '0:00' });
    const bar = el('div.recorder', {}, [
      el('span.recorder__dot'),
      timeLabel,
      wave,
      el('button.icon-btn', { type: 'button', title: 'Annuler', onclick: () => stopRecording(false) }, icon('trash')),
      el('button.icon-btn', { type: 'button', title: 'Envoyer', style: { background: 'var(--accent)', color: '#fff' }, onclick: () => stopRecording(true) }, icon('send')),
    ]);
    clear(recorderBar);
    recorderBar.append(bar);
    recorderBar.classList.remove('hidden');
    box.classList.add('hidden');
    micButton.classList.add('is-active');

    let frame;
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const level = data.reduce((sum, value) => sum + value, 0) / data.length / 255;
      bars.forEach((element, index) => {
        const jitter = 0.5 + Math.abs(Math.sin(Date.now() / 180 + index)) * 0.5;
        element.style.height = `${Math.max(2, level * jitter * 100)}%`;
      });
      timeLabel.textContent = formatDuration((Date.now() - startedAt) / 1000);
      frame = requestAnimationFrame(tick);
    };
    tick();

    recorder = { media, stream, chunks, startedAt, frame, audioCtx, mime };
  }

  async function stopRecording(shouldSend) {
    if (!recorder) return;
    const current = recorder;
    recorder = null;

    cancelAnimationFrame(current.frame);
    current.audioCtx.close().catch(() => {});
    micButton.classList.remove('is-active');
    recorderBar.classList.add('hidden');
    box.classList.remove('hidden');

    await new Promise((resolve) => {
      current.media.onstop = resolve;
      current.media.stop();
    });
    current.stream.getTracks().forEach((track) => track.stop());

    const duration = (Date.now() - current.startedAt) / 1000;
    if (!shouldSend || duration < 0.6) {
      if (shouldSend) toast('Enregistrement trop court');
      return;
    }

    const blob = new Blob(current.chunks, { type: current.mime || 'audio/webm' });
    blob.name = `message-vocal-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`;
    blob.duration = duration;

    try {
      const meta = await api.upload(blob);
      await api.send(chat.id, { type: 'audio', content: '', attachments: [{ ...meta, duration: Math.round(duration) }] });
      sounds.messageOut();
      onSent();
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  }

  // ── Saisie, mentions, raccourcis ───────────────────────────────────────────

  const saveDraft = debounce(() => {
    const text = getText();
    if (!editing) api.saveDraft(chat.id, text).catch(() => {});
  }, 700);

  let typingSent = false;
  const stopTyping = () => {
    if (!typingSent) return;
    typingSent = false;
    socket.send({ type: 'typing', chatId: chat.id, isTyping: false });
  };
  const stopTypingSoon = debounce(stopTyping, 3000);

  const signalTyping = () => {
    if (state.user?.settings?.privacy?.showTypingIndicator === false) return;
    if (!typingSent) {
      typingSent = true;
      socket.send({ type: 'typing', chatId: chat.id, isTyping: true });
    }
    stopTypingSoon();
  };

  function autoGrow() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 220)}px`;
  }

  function updateSendState() {
    const hasContent = !!getText().trim() || attachments.some((a) => a.meta);
    sendButton.disabled = !hasContent;
  }

  function insertAtCursor(text) {
    input.focus();
    const selection = window.getSelection();
    if (!selection.rangeCount || !input.contains(selection.anchorNode)) {
      input.append(document.createTextNode(text));
      placeCursorAtEnd();
    } else {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    autoGrow();
  }

  function placeCursorAtEnd() {
    const range = document.createRange();
    range.selectNodeContents(input);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  /** Entoure la sélection d'un marqueur (*gras*, _italique_…). */
  function wrapSelection(marker) {
    input.focus();
    const selection = window.getSelection();
    const selected = selection.toString();
    if (marker === '> ') {
      insertAtCursor(`\n> ${selected}`);
    } else if (selected) {
      insertAtCursor(`${marker}${selected}${marker}`);
    } else {
      insertAtCursor(`${marker}${marker}`);
      // Curseur entre les deux marqueurs.
      const selection2 = window.getSelection();
      const range = selection2.getRangeAt(0);
      range.setStart(range.startContainer, Math.max(0, range.startOffset - marker.length));
      range.collapse(true);
      selection2.removeAllRanges();
      selection2.addRange(range);
    }
    updateSendState();
  }

  // Autocomplétion des mentions dans les groupes.
  let mentionMenu = null;
  function checkMention() {
    if (chat.type !== 'group') return;
    const text = getText();
    const match = text.slice(0, getCaretOffset()).match(/@([\w.-]*)$/);
    mentionMenu?.remove();
    mentionMenu = null;
    if (!match) return;

    const query = match[1].toLowerCase();
    const candidates = chatMembers(chat)
      .filter((m) => m.id !== state.user.id && (m.displayName.toLowerCase().includes(query) || m.skypeName.includes(query)))
      .slice(0, 6);
    if (!candidates.length) return;

    mentionMenu = el('div.menu', { style: { position: 'fixed', zIndex: '320' } });
    for (const member of candidates) {
      mentionMenu.append(
        el('button.menu__item', {
          type: 'button',
          onclick: () => {
            const before = text.slice(0, getCaretOffset()).replace(/@[\w.-]*$/, '');
            const after = text.slice(getCaretOffset());
            setText(`${before}@${member.skypeName} ${after}`);
            placeCursorAtEnd();
            mentionMenu?.remove();
            mentionMenu = null;
          },
        }, [avatar(member, { size: 'xs', presence: false }), el('span', { text: member.displayName }), el('span.dim', { text: `@${member.skypeName}` })])
      );
    }
    document.getElementById('menus').append(mentionMenu);
    const rect = box.getBoundingClientRect();
    mentionMenu.style.left = `${rect.left + 8}px`;
    mentionMenu.style.top = `${rect.top - mentionMenu.offsetHeight - 6}px`;
  }

  function getCaretOffset() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return getText().length;
    const range = selection.getRangeAt(0).cloneRange();
    range.selectNodeContents(input);
    range.setEnd(selection.getRangeAt(0).endContainer, selection.getRangeAt(0).endOffset);
    return range.toString().length;
  }

  input.addEventListener('input', () => {
    updateSendState();
    autoGrow();
    signalTyping();
    saveDraft();
    checkMention();
  });

  input.addEventListener('keydown', (e) => {
    const enterSends = state.user?.settings?.enterToSend !== false;

    if (e.key === 'Enter' && !e.shiftKey && enterSends && !mentionMenu) {
      e.preventDefault();
      send();
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      send();
      return;
    }
    if (e.key === 'Escape') {
      if (mentionMenu) {
        mentionMenu.remove();
        mentionMenu = null;
        return;
      }
      if (editing) {
        e.stopPropagation();
        cancelEdit();
        return;
      }
      if (replyTo) {
        e.stopPropagation();
        setReply(null);
      }
      return;
    }
    // Flèche haut sur un champ vide : modifier son dernier message (comme Skype).
    if (e.key === 'ArrowUp' && !getText()) {
      const own = [...(state.messages.get(chat.id) || [])].reverse().find((m) => m.senderId === state.user.id && !m.deleted && (m.type || 'text') === 'text');
      if (own) {
        e.preventDefault();
        startEdit(own);
      }
    }
  });

  // Collage : images depuis le presse-papiers, texte en clair.
  input.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) {
      e.preventDefault();
      addFiles(files);
      return;
    }
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    insertAtCursor(text);
    updateSendState();
  });

  input.addEventListener('blur', () => saveDraft.flush?.());

  // Brouillon existant
  if (chat.draft) setText(chat.draft);

  return {
    root,
    input,
    focus: () => input.focus(),
    setReply,
    startEdit,
    addFiles,
    insert: (text) => {
      insertAtCursor(text);
      updateSendState();
    },
    getText,
    destroy: () => {
      stopTyping();
      saveDraft.flush?.();
      if (recorder) stopRecording(false);
      mentionMenu?.remove();
    },
  };
}

// ── Composeurs additionnels ──────────────────────────────────────────────────

/** Création d'un sondage. */
export function openPollComposer(chat) {
  const question = el('input.input', { placeholder: 'Votre question', maxLength: 200 });
  const optionsBox = el('div.stack.gap-8');
  const multiple = el('input', { type: 'checkbox' });

  const addOption = (value = '') => {
    const input = el('input.input', { placeholder: `Option ${optionsBox.children.length + 1}`, value, maxLength: 100 });
    const row = el('div.row.gap-8', {}, [
      input,
      el('button.icon-btn', {
        type: 'button',
        'aria-label': 'Retirer',
        onclick: () => {
          if (optionsBox.children.length > 2) row.remove();
        },
      }, icon('close', 'icon icon--sm')),
    ]);
    optionsBox.append(row);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (row === optionsBox.lastElementChild && optionsBox.children.length < 12) addOption();
        else row.nextElementSibling?.querySelector('input')?.focus();
      }
    });
    return input;
  };
  addOption();
  addOption();

  const instance = modal({
    title: 'Créer un sondage',
    body: [
      el('div.field', {}, [el('label.field__label', { text: 'Question' }), question]),
      el('div.field', {}, [el('label.field__label', { text: 'Options' }), optionsBox]),
      el('button.btn.btn--ghost.btn--sm', {
        type: 'button',
        onclick: () => optionsBox.children.length < 12 && addOption().focus(),
      }, [icon('plus', 'icon icon--sm'), 'Ajouter une option']),
      el('label.switch', { style: { marginTop: '16px' } }, [multiple, el('span.switch__track'), el('span', { text: 'Autoriser plusieurs réponses' })]),
    ],
    footer: [
      el('button.btn', { text: 'Annuler', onclick: () => instance.close() }),
      el('button.btn.btn--primary', {
        text: 'Publier',
        onclick: async () => {
          const options = [...optionsBox.querySelectorAll('input')].map((i) => i.value.trim()).filter(Boolean);
          if (!question.value.trim()) return toast('Ajoutez une question', { type: 'error' });
          if (options.length < 2) return toast('Ajoutez au moins deux options', { type: 'error' });
          try {
            await api.send(chat.id, {
              type: 'poll',
              content: question.value.trim(),
              poll: {
                question: question.value.trim(),
                multiple: multiple.checked,
                closed: false,
                options: options.map((text) => ({ text, votes: [] })),
              },
            });
            instance.close();
          } catch (err) {
            toast(err.message, { type: 'error' });
          }
        },
      }),
    ],
  });
}

/** Envoi d'une carte de contact. */
function openContactPicker(chat) {
  const list = el('div.stack');
  const instance = modal({ title: 'Envoyer un contact', body: list, size: 'narrow' });

  const contacts = state.contacts;
  if (!contacts.length) {
    list.append(el('p.dim', { text: 'Vous n’avez pas encore de contacts.' }));
    return;
  }
  for (const contact of contacts) {
    list.append(
      el('button.person-row', {
        type: 'button',
        onclick: async () => {
          instance.close();
          try {
            await api.send(chat.id, {
              type: 'contact',
              content: `Carte de contact : ${contact.displayName}`,
              contactCard: { id: contact.id, displayName: contact.displayName, skypeName: contact.skypeName, avatar: contact.avatar },
            });
            sounds.fileSent();
          } catch (err) {
            toast(err.message, { type: 'error' });
          }
        },
      }, [
        avatar(contact, { size: 'md' }),
        el('div.person-row__body', {}, [
          el('div.person-row__name', { text: contact.displayName }),
          el('div.person-row__sub', { text: `@${contact.skypeName}` }),
        ]),
      ])
    );
  }
}

/** Partage de la position (géolocalisation du navigateur). */
async function shareLocation(chat) {
  if (!navigator.geolocation) return toast('Géolocalisation indisponible', { type: 'error' });
  toast('Localisation en cours…');
  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      try {
        await api.send(chat.id, {
          type: 'location',
          content: 'Position partagée',
          location: { lat: coords.latitude, lng: coords.longitude, label: 'Ma position actuelle', accuracy: coords.accuracy },
        });
      } catch (err) {
        toast(err.message, { type: 'error' });
      }
    },
    () => toast('Position refusée par le navigateur', { type: 'error' }),
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

/** Sélecteur de GIF : bibliothèque locale animée en SVG (aucun service externe). */
function openGifPicker(chat) {
  const GIFS = [
    ['🎉', 'Bravo !', '#7B68EE'], ['👋', 'Coucou', '#00AFF0'], ['😂', 'Trop drôle', '#F59E0B'],
    ['❤️', 'Amour', '#EC4899'], ['👍', 'Parfait', '#20C997'], ['🤯', 'Incroyable', '#8B5CF6'],
    ['🕺', 'On danse', '#F97316'], ['😴', 'Bonne nuit', '#0EA5E9'], ['🍕', 'On mange ?', '#EF4444'],
    ['🚀', 'C’est parti', '#14B8A6'], ['🙏', 'Merci', '#6366F1'], ['🤔', 'Hmm…', '#64748B'],
  ];

  const grid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' } });

  for (const [emoji, caption, color] of GIFS) {
    const svg = `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150"><rect width="200" height="150" fill="${color}"/><text x="100" y="85" font-size="56" text-anchor="middle">${emoji}</text><text x="100" y="128" font-size="18" font-family="Segoe UI,Arial" font-weight="700" fill="white" text-anchor="middle">${caption}</text></svg>`
    )}`;
    grid.append(
      el('button', {
        type: 'button',
        style: { border: 'none', padding: '0', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer', background: 'none' },
        onclick: async () => {
          instance.close();
          try {
            const blob = await (await fetch(svg)).blob();
            blob.name = `gif-${caption}.svg`;
            const meta = await api.upload(blob);
            await api.send(chat.id, { type: 'image', content: '', attachments: [meta] });
            sounds.fileSent();
          } catch (err) {
            toast(err.message, { type: 'error' });
          }
        },
      }, el('img', { src: svg, alt: caption, style: { width: '100%', display: 'block' } }))
    );
  }

  const instance = modal({ title: 'Choisir un GIF', body: grid });
}
