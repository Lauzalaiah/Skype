/** Rail de navigation : profil, statut et accès aux vues principales. */
import { el, clear } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { state, setState, subscribe, computeUnread } from '../state.js';
import { avatar, menu, toast } from './common.js';
import { setStatus, openSettings } from './settings.js';
import { openProfileCard, openShortcutsDialog, openAboutDialog } from './modals.js';

const VIEWS = [
  ['chats', 'Discussions', 'chat'],
  ['calls', 'Appels', 'call'],
  ['contacts', 'Contacts', 'people'],
  ['notifications', 'Notifs', 'notification'],
];

export function renderRail() {
  const root = el('div.rail', { role: 'navigation', 'aria-label': 'Navigation principale' });

  function render() {
    clear(root);

    // Avatar + statut
    const profileButton = el('button.rail__profile', {
      title: `${state.user.displayName} — changer de statut`,
      'aria-label': 'Mon profil et statut',
      onclick: (e) => openProfileMenu(e.currentTarget),
    }, avatar(state.user, { size: 'md' }));

    root.append(profileButton);

    for (const [id, label, iconName] of VIEWS) {
      const isActive = state.view === id;
      const badgeCount =
        id === 'chats' ? state.unreadTotal
        : id === 'notifications' ? state.requests.incoming.length
        : 0;

      root.append(
        el(`button.rail__button${isActive ? '.is-active' : ''}`, {
          title: label,
          'aria-label': label,
          'aria-current': isActive ? 'page' : null,
          onclick: () => setState({ view: id, search: '' }),
        }, [
          icon(iconName),
          el('span', { text: label }),
          badgeCount ? el('span.rail__badge', { text: String(Math.min(badgeCount, 99)) }) : null,
        ])
      );
    }

    root.append(el('span.spacer'));

    root.append(
      el('button.rail__button', {
        title: 'Messages favoris',
        'aria-label': 'Messages favoris',
        onclick: () => setState({ view: 'bookmarks' }),
      }, [icon('bookmark'), el('span', { text: 'Favoris' })]),

      el('button.rail__button', {
        title: 'Appeler un numéro',
        'aria-label': 'Pavé numérique',
        onclick: () => setState({ view: 'dialpad' }),
      }, [icon('dialpad'), el('span', { text: 'Clavier' })]),

      el('button.rail__button', {
        title: 'Réglages',
        'aria-label': 'Réglages',
        onclick: (e) => openMainMenu(e.currentTarget),
      }, [icon('settings'), el('span', { text: 'Réglages' })])
    );
  }

  subscribe(['view', 'user', 'unreadTotal', 'requests', 'presence'], render);
  render();
  return root;
}

function openProfileMenu(anchor) {
  const statuses = [
    ['online', 'En ligne', 'Disponible pour discuter'],
    ['away', 'Absent', 'De retour bientôt'],
    ['busy', 'Ne pas déranger', 'Les notifications sont silencieuses'],
    ['invisible', 'Invisible', 'Vous apparaissez hors ligne'],
  ];

  const current = state.user.manualStatus || state.user.status;

  menu(
    [
      { label: state.user.displayName, header: true },
      ...statuses.map(([id, label]) => ({
        label,
        checked: current === id,
        onClick: () => {
          setStatus(id);
          toast(`Statut : ${label}`);
        },
        icon: null,
      })),
      'divider',
      { label: 'Mon profil', icon: 'contact', onClick: () => openProfileCard(state.user.id) },
      { label: 'Définir un message d’humeur', icon: 'edit', onClick: setMood },
      { label: 'Réglages', icon: 'settings', shortcut: 'Ctrl ,', onClick: () => openSettings() },
      'divider',
      { label: 'Se déconnecter', icon: 'logout', danger: true, onClick: () => openSettings('profile') },
    ],
    { anchor, align: 'start' }
  );
}

async function setMood() {
  const { prompt } = await import('./common.js');
  const { api } = await import('../lib/api.js');
  const { notify } = await import('../state.js');

  const mood = await prompt({
    title: 'Message d’humeur',
    label: 'Que se passe-t-il ?',
    value: state.user.mood || '',
    placeholder: 'De retour sur Skype 💙',
    maxLength: 120,
  });
  if (mood === null) return;
  try {
    await api.updateProfile({ mood });
    state.user.mood = mood;
    notify('user');
    toast('Message d’humeur mis à jour');
  } catch (err) {
    toast(err.message, { type: 'error' });
  }
}

function openMainMenu(anchor) {
  menu(
    [
      { label: 'Réglages', icon: 'settings', shortcut: 'Ctrl ,', onClick: () => openSettings() },
      { label: 'Apparence', icon: 'moon', onClick: () => openSettings('appearance') },
      { label: 'Audio et vidéo', icon: 'video', onClick: () => openSettings('audio') },
      { label: 'Notifications', icon: 'bell', onClick: () => openSettings('notifications') },
      { label: 'Confidentialité', icon: 'shield', onClick: () => openSettings('privacy') },
      { label: 'Crédit Skype', icon: 'wallet', onClick: () => openSettings('credit') },
      'divider',
      { label: 'Raccourcis clavier', icon: 'keyboard', onClick: openShortcutsDialog },
      { label: 'À propos de Skype', icon: 'info', onClick: openAboutDialog },
    ],
    { anchor, align: 'start' }
  );
}
