/** Boîtes de dialogue : nouvelle conversation, groupe, profil, transfert… */
import { el, clear, debounce, copyToClipboard } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { api } from '../lib/api.js';
import { state, setState, notify, getUser, getChat, chatTitle, otherMember, chatMembers } from '../state.js';
import { modal, toast, avatar, groupAvatar, personRow, confirm, prompt, menu, searchBox, spinner, emptyState } from './common.js';
import { presenceLabel, dateOf } from '../lib/time.js';
import { initials, colorFor } from '../lib/format.js';

// ── Nouvelle conversation ─────────────────────────────────────────────────────

export function openNewChatDialog() {
  const results = el('div.stack');
  const info = el('p.dim', { style: { fontSize: '0.85em', marginBottom: '10px' }, text: 'Choisissez un contact ou recherchez un pseudo Skype.' });

  const render = (people) => {
    clear(results);
    if (!people.length) {
      results.append(el('p.dim.center', { style: { padding: '20px' }, text: 'Aucun résultat' }));
      return;
    }
    for (const person of people) {
      results.append(
        personRow(person, {
          sub: person.mood || `@${person.skypeName}`,
          onClick: async () => {
            instance.close();
            const { openDirectChat } = await import('./sidebar.js');
            openDirectChat(person.id);
          },
        })
      );
    }
  };

  const search = searchBox('Rechercher une personne…', debounce(async (value) => {
    if (value.trim().length < 2) return render(state.contacts);
    try {
      const { results: found } = await api.searchUsers(value.trim());
      render(found);
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  }, 250));

  const instance = modal({
    title: 'Nouvelle conversation',
    body: [
      search,
      el('div', { style: { height: '10px' } }),
      el('button.btn.btn--ghost.btn--block', {
        style: { justifyContent: 'flex-start' },
        onclick: () => {
          instance.close();
          openNewGroupDialog();
        },
      }, [icon('people'), 'Créer un groupe']),
      el('div', { style: { height: '10px' } }),
      info,
      results,
    ],
  });

  render(state.contacts);
}

// ── Nouveau groupe ────────────────────────────────────────────────────────────

export function openNewGroupDialog(preselected = []) {
  // La fonction est parfois branchée directement sur un menu ou un bouton :
  // l'argument reçu est alors un événement, pas une liste de personnes.
  const seed = Array.isArray(preselected) ? preselected : [];
  const selected = new Map(seed.map((u) => [u.id, u]));
  const chips = el('div.people-picker__selected');
  const results = el('div.stack', { style: { maxHeight: '280px', overflowY: 'auto' } });
  const topic = el('input.input', { placeholder: 'Nom du groupe (facultatif)', maxLength: 80 });

  const renderChips = () => {
    clear(chips);
    for (const person of selected.values()) {
      chips.append(
        el('span.people-chip', {}, [
          avatar(person, { size: 'xs', presence: false }),
          el('span', { text: person.displayName.split(' ')[0] }),
          el('button', {
            type: 'button',
            'aria-label': 'Retirer',
            onclick: () => {
              selected.delete(person.id);
              renderChips();
              renderResults(lastResults);
            },
          }, icon('close', 'icon icon--sm')),
        ])
      );
    }
    createButton.disabled = selected.size < 1;
    createButton.textContent = selected.size ? `Créer le groupe (${selected.size + 1})` : 'Créer le groupe';
  };

  let lastResults = state.contacts;
  const renderResults = (people) => {
    lastResults = people;
    clear(results);
    for (const person of people) {
      const isSelected = selected.has(person.id);
      results.append(
        personRow(person, {
          selected: isSelected,
          sub: `@${person.skypeName}`,
          trailing: isSelected ? icon('check', 'icon icon--sm') : null,
          onClick: () => {
            if (isSelected) selected.delete(person.id);
            else selected.set(person.id, person);
            renderChips();
            renderResults(people);
          },
        })
      );
    }
  };

  const search = searchBox('Ajouter des personnes…', debounce(async (value) => {
    if (value.trim().length < 2) return renderResults(state.contacts);
    const { results: found } = await api.searchUsers(value.trim());
    renderResults(found);
  }, 250));

  const createButton = el('button.btn.btn--primary', {
    text: 'Créer le groupe',
    disabled: true,
    onclick: async () => {
      createButton.disabled = true;
      try {
        const names = [...selected.values()].map((u) => u.displayName.split(' ')[0]);
        const { chat } = await api.createGroup(
          topic.value.trim() || `${state.user.displayName.split(' ')[0]}, ${names.slice(0, 3).join(', ')}`,
          [...selected.keys()]
        );
        state.chats.unshift(chat);
        notify('chats');
        setState({ activeChatId: chat.id, view: 'chats' });
        instance.close();
        toast('Groupe créé');
      } catch (err) {
        toast(err.message, { type: 'error' });
        createButton.disabled = false;
      }
    },
  });

  const instance = modal({
    title: 'Nouveau groupe',
    body: [
      el('div.field', {}, [el('label.field__label', { text: 'Nom du groupe' }), topic]),
      search,
      el('div', { style: { height: '10px' } }),
      chips,
      results,
    ],
    footer: [el('button.btn', { text: 'Annuler', onclick: () => instance.close() }), createButton],
  });

  renderChips();
  renderResults(state.contacts);
}

// ── Ajouter des participants ─────────────────────────────────────────────────

export function openAddMembers(chat) {
  if (chat.type !== 'group') {
    // Conversation individuelle : créer un groupe avec cette personne.
    const other = otherMember(chat);
    return openNewGroupDialog(other ? [other] : []);
  }

  const existing = new Set(chat.members.map((m) => m.userId));
  const selected = new Map();
  const results = el('div.stack', { style: { maxHeight: '320px', overflowY: 'auto' } });

  const renderResults = (people) => {
    clear(results);
    const available = people.filter((p) => !existing.has(p.id));
    if (!available.length) {
      results.append(el('p.dim.center', { style: { padding: '20px' }, text: 'Tous vos contacts sont déjà dans ce groupe.' }));
      return;
    }
    for (const person of available) {
      const isSelected = selected.has(person.id);
      results.append(
        personRow(person, {
          selected: isSelected,
          sub: `@${person.skypeName}`,
          trailing: isSelected ? icon('check', 'icon icon--sm') : null,
          onClick: () => {
            if (isSelected) selected.delete(person.id);
            else selected.set(person.id, person);
            addButton.disabled = !selected.size;
            renderResults(people);
          },
        })
      );
    }
  };

  const addButton = el('button.btn.btn--primary', {
    text: 'Ajouter',
    disabled: true,
    onclick: async () => {
      try {
        const { chat: updated } = await api.addMembers(chat.id, [...selected.keys()]);
        Object.assign(chat, updated);
        notify('chats');
        instance.close();
        toast(`${selected.size} personne${selected.size > 1 ? 's ajoutées' : ' ajoutée'}`);
      } catch (err) {
        toast(err.message, { type: 'error' });
      }
    },
  });

  const instance = modal({
    title: 'Ajouter des participants',
    body: [
      searchBox('Rechercher…', debounce(async (value) => {
        if (value.trim().length < 2) return renderResults(state.contacts);
        const { results: found } = await api.searchUsers(value.trim());
        renderResults(found);
      }, 250)),
      el('div', { style: { height: '10px' } }),
      results,
    ],
    footer: [el('button.btn', { text: 'Annuler', onclick: () => instance.close() }), addButton],
  });

  renderResults(state.contacts);
}

// ── Ajouter un contact ────────────────────────────────────────────────────────

export function openAddContactDialog() {
  const results = el('div.stack', { style: { minHeight: '120px' } });
  const hint = el('p.dim', { style: { fontSize: '0.85em' }, text: 'Recherchez par pseudo Skype, nom complet ou adresse e-mail.' });

  const render = (people) => {
    clear(results);
    if (!people.length) {
      results.append(el('p.dim.center', { style: { padding: '24px' }, text: 'Aucune personne trouvée' }));
      return;
    }
    for (const person of people) {
      const isContact = state.contacts.some((c) => c.id === person.id);
      const isPending = state.requests.outgoing.some((r) => r.toId === person.id);
      results.append(
        personRow(person, {
          sub: `@${person.skypeName}${person.city ? ` · ${person.city}` : ''}`,
          onClick: () => openProfileCard(person.id, person),
          trailing: isContact
            ? el('span.dim', { style: { fontSize: '0.8em' }, text: 'Déjà contact' })
            : isPending
              ? el('span.dim', { style: { fontSize: '0.8em' }, text: 'En attente' })
              : el('span.btn.btn--sm.btn--primary', {
                  role: 'button',
                  text: 'Ajouter',
                  onclick: async (e) => {
                    e.stopPropagation();
                    try {
                      await api.addContact(person.id, `Bonjour ! C’est ${state.user.displayName}, ajoutons-nous sur Skype.`);
                      toast('Demande de contact envoyée');
                      const { refreshContacts } = await import('./sidebar.js');
                      await refreshContacts();
                      instance.close();
                    } catch (err) {
                      toast(err.message, { type: 'error' });
                    }
                  },
                }),
        })
      );
    }
  };

  const instance = modal({
    title: 'Ajouter un contact',
    body: [
      searchBox('Pseudo Skype, nom ou e-mail…', debounce(async (value) => {
        if (value.trim().length < 2) {
          clear(results);
          return;
        }
        clear(results);
        results.append(el('div.messages__loader', {}, spinner()));
        try {
          const { results: found } = await api.searchUsers(value.trim());
          render(found);
        } catch (err) {
          clear(results);
          toast(err.message, { type: 'error' });
        }
      }, 300)),
      el('div', { style: { height: '8px' } }),
      hint,
      results,
      el('div', { style: { marginTop: '16px', padding: '12px', borderRadius: '8px', background: 'var(--accent-soft)', fontSize: '0.85em' } }, [
        el('strong', { text: 'Votre pseudo Skype : ' }),
        el('code', { text: state.user.skypeName }),
        el('button.btn.btn--sm.btn--ghost', {
          text: 'Copier',
          style: { marginLeft: '8px' },
          onclick: () => {
            copyToClipboard(state.user.skypeName);
            toast('Pseudo copié — partagez-le pour qu’on vous ajoute');
          },
        }),
      ]),
    ],
  });
}

// ── Fiche de profil ───────────────────────────────────────────────────────────

export async function openProfileCard(userId, preloaded = null) {
  let user = preloaded || getUser(userId);
  if (!user || !user.skypeName) {
    try {
      const data = await api.user(userId);
      user = data.user;
      state.users.set(user.id, user);
    } catch (err) {
      return toast(err.message, { type: 'error' });
    }
  }

  const isSelf = user.id === state.user.id;
  const isContact = state.contacts.some((c) => c.id === user.id);
  const isFavorite = state.favorites.includes(user.id);
  const isBlocked = state.blocked.some((b) => b.id === user.id);

  const detail = (label, value) =>
    value
      ? el('div.details__row', {}, [
          el('span.details__row-label', { text: label }),
          el('span.details__row-value', { text: value }),
        ])
      : null;

  const instance = modal({
    size: 'narrow',
    flush: true,
    title: '',
    body: [
      el('div.details__hero', {}, [
        avatar(user, { size: 'xxl', presence: false }),
        el('div.details__name', { text: user.displayName }),
        el('div.dim', { style: { fontSize: '0.85em' }, text: `@${user.skypeName}` }),
        user.mood ? el('div.details__mood', { text: user.mood }) : null,
        el('div.row.gap-8', { style: { justifyContent: 'center', marginTop: '6px' } }, [
          el('span.status-dot', { dataset: { status: user.status || 'offline' } }),
          el('span.dim', { style: { fontSize: '0.85em' }, text: presenceLabel(user.status, user.lastSeen) }),
        ]),
        !isSelf
          ? el('div.details__quick', {}, [
              quickAction('chat', 'Message', async () => {
                instance.close();
                const { openDirectChat } = await import('./sidebar.js');
                openDirectChat(user.id);
              }),
              quickAction('call', 'Appeler', async () => {
                instance.close();
                await callPerson(user, false);
              }),
              quickAction('video', 'Vidéo', async () => {
                instance.close();
                await callPerson(user, true);
              }),
              isContact
                ? quickAction(isFavorite ? 'star' : 'star-outline', isFavorite ? 'Favori' : 'Favoris', async () => {
                    await api.favoriteContact(user.id, !isFavorite);
                    const { refreshContacts } = await import('./sidebar.js');
                    await refreshContacts();
                    instance.close();
                    openProfileCard(user.id);
                  })
                : quickAction('person-add', 'Ajouter', async () => {
                    try {
                      await api.addContact(user.id, 'Bonjour !');
                      toast('Demande envoyée');
                      instance.close();
                    } catch (err) {
                      toast(err.message, { type: 'error' });
                    }
                  }),
            ])
          : null,
      ]),

      el('div.details__section', {}, [
        el('div.details__section-title', { text: 'Informations' }),
        detail('Pseudo Skype', user.skypeName),
        detail('Statut', presenceLabel(user.status, user.lastSeen)),
        detail('Lieu', [user.city, user.country].filter(Boolean).join(', ')),
        detail('Anniversaire', user.birthday ? dateOf(new Date(user.birthday).getTime()) : ''),
        detail('Numéro Skype', user.skypeNumber),
        detail('Site web', user.website),
        user.about ? el('p', { style: { fontSize: '0.9em', lineHeight: '1.5', marginTop: '8px', color: 'var(--text-secondary)' }, text: user.about }) : null,
      ]),

      !isSelf
        ? el('div', {}, [
            el('button.details__action', {
              onclick: () => {
                copyToClipboard(`${location.origin}/?add=${user.skypeName}`);
                toast('Lien de profil copié');
              },
            }, [icon('link'), 'Copier le lien du profil']),
            isContact
              ? el('button.details__action.details__action--danger', {
                  onclick: async () => {
                    const ok = await confirm({ title: 'Retirer ce contact ?', message: `${user.displayName} sera retiré de vos contacts.`, confirmLabel: 'Retirer', danger: true });
                    if (!ok) return;
                    await api.removeContact(user.id);
                    const { refreshContacts } = await import('./sidebar.js');
                    await refreshContacts();
                    instance.close();
                  },
                }, [icon('trash'), 'Retirer des contacts'])
              : null,
            el('button.details__action.details__action--danger', {
              onclick: async () => {
                const ok = await confirm({
                  title: isBlocked ? 'Débloquer ?' : `Bloquer ${user.displayName} ?`,
                  message: isBlocked ? 'Cette personne pourra de nouveau vous contacter.' : 'Cette personne ne pourra plus vous appeler ni vous écrire.',
                  confirmLabel: isBlocked ? 'Débloquer' : 'Bloquer',
                  danger: !isBlocked,
                });
                if (!ok) return;
                await api.blockContact(user.id, !isBlocked);
                const { refreshContacts } = await import('./sidebar.js');
                await refreshContacts();
                instance.close();
                toast(isBlocked ? 'Contact débloqué' : 'Contact bloqué');
              },
            }, [icon('block'), isBlocked ? 'Débloquer ce contact' : 'Bloquer ce contact']),
          ])
        : el('button.details__action', {
            onclick: async () => {
              instance.close();
              (await import('./settings.js')).openSettings('profile');
            },
          }, [icon('edit'), 'Modifier mon profil']),
    ],
  });
}

const quickAction = (iconName, label, onClick) =>
  el('button.details__quick-item', { type: 'button', onclick: onClick, style: { border: 'none', background: 'none', cursor: 'pointer' } }, [
    el('span.icon-btn', { style: { background: 'var(--accent-soft)', color: 'var(--accent)' } }, icon(iconName)),
    el('span', { text: label }),
  ]);

async function callPerson(user, video) {
  const { startCall } = await import('./calls.js');
  let chat = state.chats.find((c) => c.type === 'direct' && c.members.some((m) => m.userId === user.id));
  if (!chat) {
    const result = await api.createDirect(user.id);
    chat = result.chat;
    state.chats.unshift(chat);
    notify('chats');
  }
  startCall(chat, { video });
}

// ── Transfert de message ──────────────────────────────────────────────────────

export function openForwardDialog(sourceChat, message) {
  const selected = new Set();
  const list = el('div.stack', { style: { maxHeight: '360px', overflowY: 'auto' } });

  const render = (chats) => {
    clear(list);
    for (const chat of chats) {
      const isSelected = selected.has(chat.id);
      const other = otherMember(chat);
      list.append(
        el('button.chat-item', {
          style: isSelected ? { background: 'var(--accent-soft)' } : {},
          onclick: () => {
            if (isSelected) selected.delete(chat.id);
            else selected.add(chat.id);
            sendButton.disabled = !selected.size;
            sendButton.textContent = selected.size ? `Envoyer (${selected.size})` : 'Envoyer';
            render(chats);
          },
        }, [
          chat.type === 'group' ? groupAvatar(chat, { size: 'md' }) : avatar(other, { size: 'md' }),
          el('div.chat-item__body', {}, [el('div.chat-item__name', { text: chatTitle(chat) })]),
          isSelected ? icon('check', 'icon icon--sm') : null,
        ])
      );
    }
  };

  const sendButton = el('button.btn.btn--primary', {
    text: 'Envoyer',
    disabled: true,
    onclick: async () => {
      sendButton.disabled = true;
      try {
        await api.forward(sourceChat.id, message.id, [...selected]);
        instance.close();
        toast(`Message transféré vers ${selected.size} conversation${selected.size > 1 ? 's' : ''}`);
      } catch (err) {
        toast(err.message, { type: 'error' });
        sendButton.disabled = false;
      }
    },
  });

  const instance = modal({
    title: 'Transférer le message',
    body: [
      searchBox('Rechercher une conversation…', (value) => {
        const q = value.trim().toLowerCase();
        render(state.chats.filter((c) => !q || chatTitle(c).toLowerCase().includes(q)));
      }),
      el('div', { style: { height: '10px' } }),
      list,
    ],
    footer: [el('button.btn', { text: 'Annuler', onclick: () => instance.close() }), sendButton],
  });

  render(state.chats.filter((c) => !c.archived));
}

// ── Réglages d'un groupe ──────────────────────────────────────────────────────

export function openGroupSettings(chat) {
  const isAdmin = chat.members.some((m) => m.userId === state.user.id && m.role === 'admin');
  const topic = el('input.input', { value: chat.topic, maxLength: 80, disabled: !isAdmin });
  const membersList = el('div.stack', { style: { maxHeight: '260px', overflowY: 'auto' } });

  const pictureInput = el('input', {
    type: 'file',
    accept: 'image/*',
    class: 'sr-only',
    onchange: async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const dataUrl = await toDataUrl(file, 256);
      try {
        await api.updateChat(chat.id, { picture: dataUrl });
        chat.picture = dataUrl;
        notify('chats');
        toast('Photo du groupe mise à jour');
        instance.close();
      } catch (err) {
        toast(err.message, { type: 'error' });
      }
    },
  });

  const renderMembers = () => {
    clear(membersList);
    for (const member of chat.members) {
      const user = member.user || getUser(member.userId);
      if (!user) continue;
      const isSelf = user.id === state.user.id;
      membersList.append(
        personRow(user, {
          sub: member.role === 'admin' ? 'Administrateur' : presenceLabel(user.status, user.lastSeen),
          onClick: () => openProfileCard(user.id),
          trailing:
            isAdmin && !isSelf
              ? el('span.icon-btn.icon-btn--sm', {
                  role: 'button',
                  'aria-label': 'Options',
                  onclick: (e) => {
                    e.stopPropagation();
                    menu(
                      [
                        {
                          label: member.role === 'admin' ? 'Retirer le rôle d’administrateur' : 'Nommer administrateur',
                          icon: 'shield',
                          onClick: async () => {
                            const { chat: updated } = await api.setRole(chat.id, user.id, member.role === 'admin' ? 'member' : 'admin');
                            Object.assign(chat, updated);
                            renderMembers();
                          },
                        },
                        {
                          label: 'Retirer du groupe',
                          icon: 'trash',
                          danger: true,
                          onClick: async () => {
                            const ok = await confirm({ title: 'Retirer ce participant ?', message: `${user.displayName} sera retiré du groupe.`, confirmLabel: 'Retirer', danger: true });
                            if (!ok) return;
                            await api.removeMember(chat.id, user.id);
                            chat.members = chat.members.filter((m) => m.userId !== user.id);
                            renderMembers();
                            notify('chats');
                          },
                        },
                      ],
                      { anchor: e.currentTarget }
                    );
                  },
                }, icon('more', 'icon icon--sm'))
              : member.role === 'admin'
                ? el('span.dim', { style: { fontSize: '0.75em' }, text: 'Admin' })
                : null,
        })
      );
    }
  };

  const instance = modal({
    title: 'Gérer le groupe',
    body: [
      el('div.center', { style: { marginBottom: '16px' } }, [
        groupAvatar(chat, { size: 'xl' }),
        isAdmin
          ? el('div', {}, [
              pictureInput,
              el('button.btn.btn--sm.btn--ghost', { style: { marginTop: '8px' }, text: 'Changer la photo', onclick: () => pictureInput.click() }),
            ])
          : null,
      ]),
      el('div.field', {}, [el('label.field__label', { text: 'Nom du groupe' }), topic]),
      el('div.field', {}, [
        el('label.field__label', { text: 'Lien d’invitation' }),
        el('div.row.gap-8', {}, [
          el('input.input', { value: `${location.origin}/?join=${chat.joinLink || ''}`, readonly: true }),
          el('button.btn.btn--sm', {
            text: 'Copier',
            onclick: () => {
              copyToClipboard(`${location.origin}/?join=${chat.joinLink}`);
              toast('Lien copié');
            },
          }),
        ]),
      ]),
      el('div.field', {}, [
        el('label.field__label', { text: `Participants (${chat.members.length})` }),
        isAdmin
          ? el('button.btn.btn--sm.btn--ghost', {
              style: { alignSelf: 'flex-start' },
              onclick: () => {
                instance.close();
                openAddMembers(chat);
              },
            }, [icon('person-add', 'icon icon--sm'), 'Ajouter'])
          : null,
        membersList,
      ]),
    ],
    footer: [
      el('button.btn', { text: 'Fermer', onclick: () => instance.close() }),
      isAdmin
        ? el('button.btn.btn--primary', {
            text: 'Enregistrer',
            onclick: async () => {
              try {
                await api.updateChat(chat.id, { topic: topic.value.trim() });
                chat.topic = topic.value.trim();
                notify('chats');
                instance.close();
                toast('Groupe mis à jour');
              } catch (err) {
                toast(err.message, { type: 'error' });
              }
            },
          })
        : null,
    ].filter(Boolean),
  });

  renderMembers();
}

// ── Utilitaire : image redimensionnée en data URL ────────────────────────────

export async function toDataUrl(file, maxSize = 256) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.85);
}

// ── Raccourcis clavier ────────────────────────────────────────────────────────

export function openShortcutsDialog() {
  const shortcuts = [
    ['Nouvelle conversation', 'Ctrl + N'],
    ['Rechercher', 'Ctrl + F'],
    ['Conversation suivante', 'Ctrl + ⇧ + ↓'],
    ['Conversation précédente', 'Ctrl + ⇧ + ↑'],
    ['Envoyer le message', 'Entrée'],
    ['Nouvelle ligne', '⇧ + Entrée'],
    ['Modifier le dernier message', '↑ (champ vide)'],
    ['Répondre au dernier message', 'Ctrl + ⇧ + R'],
    ['Émoticônes', 'Ctrl + E'],
    ['Appel audio', 'Ctrl + ⇧ + P'],
    ['Appel vidéo', 'Ctrl + ⇧ + K'],
    ['Couper le micro', 'Ctrl + M'],
    ['Raccrocher', 'Ctrl + ⇧ + H'],
    ['Marquer comme lu', 'Ctrl + ⇧ + L'],
    ['Réglages', 'Ctrl + ,'],
    ['Thème sombre', 'Ctrl + ⇧ + D'],
    ['Fermer / annuler', 'Échap'],
  ];

  const list = el('dl.shortcut-list');
  for (const [label, keys] of shortcuts) {
    list.append(el('dt', { text: label }), el('dd', {}, el('span.kbd', { text: keys })));
  }

  const instance = modal({
    title: 'Raccourcis clavier',
    body: list,
    footer: [el('button.btn.btn--primary', { text: 'Fermer', onclick: () => instance.close() })],
  });
}

// ── À propos ──────────────────────────────────────────────────────────────────

export function openAboutDialog() {
  const instance = modal({
    title: 'À propos de Skype',
    size: 'narrow',
    body: el('div.center', {}, [
      el('div', {
        style: {
          width: '72px', height: '72px', borderRadius: '50%', margin: '0 auto 16px',
          background: 'linear-gradient(135deg, #00AFF0, #0078A8)', color: '#fff',
          display: 'grid', placeItems: 'center', fontSize: '36px', fontWeight: '700',
        },
        text: 'S',
      }),
      el('h3', { style: { fontSize: '1.3em' }, text: 'Skype' }),
      el('p.dim', { text: 'Version 8.136.0 · Skype Reborn' }),
      el('p', {
        style: { marginTop: '16px', lineHeight: '1.6', fontSize: '0.9em', color: 'var(--text-secondary)' },
        text: 'Messagerie, appels audio et vidéo, partage d’écran, groupes, sondages et bien plus. Toutes vos conversations restent sur votre serveur.',
      }),
      el('p', { style: { marginTop: '12px', fontSize: '0.8em', color: 'var(--text-tertiary)' }, text: 'Chiffrement du transport, aucune donnée envoyée à des tiers.' }),
    ]),
    footer: [el('button.btn.btn--primary', { text: 'Fermer', onclick: () => instance.close() })],
  });
}
