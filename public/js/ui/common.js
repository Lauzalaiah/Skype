/** Briques d'interface réutilisables : avatars, modales, menus, toasts… */
import { el, $, clear, append, trapFocus, on } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { initials, colorFor } from '../lib/format.js';
import * as sounds from '../lib/sounds.js';

const layer = (id) => document.getElementById(id);

// ── Avatar ────────────────────────────────────────────────────────────────────

/**
 * avatar(user, { size, presence, group })
 * size : xs | sm | md | (défaut) | lg | xl | xxl
 */
export function avatar(user, { size = '', presence = true, onClick = null, className = '' } = {}) {
  const name = user?.displayName || user?.topic || '?';
  const node = el(
    `${onClick ? 'button' : 'div'}.avatar${size ? `.avatar--${size}` : ''}${className ? `.${className}` : ''}`,
    {
      style: { background: user?.avatar ? 'transparent' : colorFor(user?.id || name) },
      title: name,
      ...(onClick ? { onclick: onClick, type: 'button' } : {}),
    },
    user?.avatar
      ? el('img', { src: user.avatar, alt: name, loading: 'lazy' })
      : el('span.avatar__initials', { text: initials(name) })
  );

  if (presence && user?.status) {
    node.append(el('span.avatar__presence', { dataset: { status: user.status }, title: user.status }));
  }
  return node;
}

/** Avatar d'un groupe : mosaïque des membres. */
export function groupAvatar(chat, { size = '' } = {}) {
  if (chat.picture) return avatar({ avatar: chat.picture, displayName: chat.topic }, { size, presence: false });

  const members = (chat.members || []).slice(0, 4).map((m) => m.user).filter(Boolean);
  if (members.length < 2) return avatar({ displayName: chat.topic, id: chat.id }, { size, presence: false });

  // La mosaïque s'adapte au nombre de membres : jamais de case vide.
  const template =
    members.length === 2 ? '1fr / repeat(2, 1fr)'
    : members.length === 3 ? 'repeat(2, 1fr) / repeat(2, 1fr)'
    : 'repeat(2, 1fr) / repeat(2, 1fr)';

  const node = el(`div.avatar${size ? `.avatar--${size}` : ''}`, {
    style: {
      background: 'var(--bg-input)',
      display: 'grid',
      gridTemplate: template,
      overflow: 'hidden',
      gap: '1px',
    },
    title: chat.topic,
  });
  for (const [index, member] of members.slice(0, 4).entries()) {
    // À trois membres, le premier occupe toute la colonne de gauche.
    const span = members.length === 3 && index === 0 ? { gridRow: 'span 2' } : {};
    node.append(
      member.avatar
        ? el('img', { src: member.avatar, alt: '', style: { width: '100%', height: '100%', objectFit: 'cover', borderRadius: '0', ...span } })
        : el('span', {
            text: initials(member.displayName)[0] || '?',
            style: {
              background: colorFor(member.id),
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontSize: '0.34em',
              fontWeight: '700',
              ...span,
            },
          })
    );
  }
  return node;
}

// ── Notifications éphémères ──────────────────────────────────────────────────

export function toast(message, { type = 'info', duration = 3800, action = null } = {}) {
  const node = el(`div.toast${type !== 'info' ? `.toast--${type}` : ''}`, { role: 'alert' }, [
    type === 'error' ? icon('warning', 'icon icon--sm') : null,
    el('span', { text: message }),
    action ? el('button', { text: action.label, onclick: () => { action.onClick(); node.remove(); } }) : null,
  ]);
  layer('toasts').append(node);
  if (type === 'error') sounds.error();

  const timer = setTimeout(() => {
    node.style.transition = 'opacity 200ms, transform 200ms';
    node.style.opacity = '0';
    node.style.transform = 'translateY(8px)';
    setTimeout(() => node.remove(), 220);
  }, duration);
  node.addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') {
      clearTimeout(timer);
      node.remove();
    }
  });
  return node;
}

// ── Modales ───────────────────────────────────────────────────────────────────

const openModals = [];

/**
 * modal({ title, body, footer, size, onClose })
 * Renvoie { close, node, body }.
 */
export function modal({ title = '', body = null, footer = null, size = '', onClose = null, closable = true, flush = false } = {}) {
  const bodyNode = el(`div.modal__body${flush ? '.modal__body--flush' : ''}`);
  append(bodyNode, body);

  const dialog = el(`div.modal${size ? `.modal--${size}` : ''}`, { role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
    title || closable
      ? el('div.modal__header', {}, [
          el('h2.modal__title', { text: title }),
          closable ? el('button.icon-btn', { onclick: () => close(), 'aria-label': 'Fermer' }, icon('close')) : null,
        ])
      : null,
    bodyNode,
    footer ? el('div.modal__footer', {}, footer) : null,
  ]);

  const backdrop = el('div.modal-backdrop', {
    onclick: (e) => {
      if (e.target === backdrop && closable) close();
    },
  }, dialog);

  const releaseFocus = trapFocus(dialog);
  const previousFocus = document.activeElement;

  function close() {
    releaseFocus();
    backdrop.remove();
    const index = openModals.indexOf(instance);
    if (index >= 0) openModals.splice(index, 1);
    previousFocus?.focus?.();
    onClose?.();
  }

  const instance = { node: dialog, backdrop, body: bodyNode, close, closable };
  openModals.push(instance);
  layer('modals').append(backdrop);

  // Focus sur le premier champ ou bouton d'action.
  requestAnimationFrame(() => {
    const target = dialog.querySelector('input:not([type=hidden]),textarea,[contenteditable],button.btn--primary');
    target?.focus();
  });

  return instance;
}

export const topModal = () => openModals.at(-1) || null;
export const closeTopModal = () => {
  const top = topModal();
  if (top?.closable) {
    top.close();
    return true;
  }
  return false;
};

/** Boîte de confirmation. */
export function confirm({ title, message, confirmLabel = 'Confirmer', cancelLabel = 'Annuler', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      instance.close();
      resolve(value);
    };
    const instance = modal({
      title,
      size: 'narrow',
      body: el('p', { text: message, style: { lineHeight: '1.55', color: 'var(--text-secondary)' } }),
      footer: [
        el('button.btn', { text: cancelLabel, onclick: () => done(false) }),
        el(`button.btn.${danger ? 'btn--danger' : 'btn--primary'}`, { text: confirmLabel, onclick: () => done(true) }),
      ],
      onClose: () => done(false),
    });
  });
}

/** Boîte de saisie. */
export function prompt({ title, label, value = '', placeholder = '', confirmLabel = 'Enregistrer', multiline = false, maxLength = 200 }) {
  return new Promise((resolve) => {
    let settled = false;
    const input = el(multiline ? 'textarea.textarea' : 'input.input', {
      value,
      placeholder,
      maxLength,
      onkeydown: (e) => {
        if (e.key === 'Enter' && !multiline) {
          e.preventDefault();
          done(input.value.trim());
        }
      },
    });
    const done = (result) => {
      if (settled) return;
      settled = true;
      instance.close();
      resolve(result);
    };
    const instance = modal({
      title,
      size: 'narrow',
      body: el('div.field', {}, [label ? el('label.field__label', { text: label }) : null, input]),
      footer: [
        el('button.btn', { text: 'Annuler', onclick: () => done(null) }),
        el('button.btn.btn--primary', { text: confirmLabel, onclick: () => done(input.value.trim()) }),
      ],
      onClose: () => done(null),
    });
  });
}

// ── Menus contextuels ────────────────────────────────────────────────────────

let activeMenu = null;

/**
 * Ouvre un menu à une position donnée.
 * items : [{ label, icon, onClick, danger, checked, disabled, shortcut }] ou 'divider' / { label: 'Titre', header: true }
 */
export function menu(items, { x, y, anchor = null, align = 'start', width = null } = {}) {
  closeMenu();

  const node = el('div.menu', { role: 'menu' });
  if (width) node.style.minWidth = `${width}px`;

  for (const item of items) {
    if (!item) continue;
    if (item === 'divider' || item.divider) {
      node.append(el('div.menu__divider'));
      continue;
    }
    if (item.header) {
      node.append(el('div.menu__label', { text: item.label }));
      continue;
    }
    node.append(
      el(
        `button.menu__item${item.danger ? '.menu__item--danger' : ''}`,
        {
          role: 'menuitem',
          disabled: item.disabled || false,
          'aria-checked': item.checked === undefined ? null : String(!!item.checked),
          onclick: (e) => {
            e.stopPropagation();
            if (item.keepOpen !== true) closeMenu();
            item.onClick?.(e);
          },
        },
        [
          item.icon ? icon(item.icon, 'icon icon--sm') : null,
          el('span', { text: item.label, style: { flex: '1' } }),
          item.shortcut ? el('span.menu__shortcut', { text: item.shortcut }) : null,
        ]
      )
    );
  }

  layer('menus').append(node);

  // Positionnement : on garde le menu dans la fenêtre.
  const rect = anchor?.getBoundingClientRect();
  let left = x ?? (align === 'end' ? rect.right - node.offsetWidth : rect?.left ?? 0);
  let top = y ?? (rect ? rect.bottom + 4 : 0);
  const menuRect = node.getBoundingClientRect();
  if (left + menuRect.width > innerWidth - 8) left = innerWidth - menuRect.width - 8;
  if (top + menuRect.height > innerHeight - 8) top = Math.max(8, (rect?.top ?? y) - menuRect.height - 4);
  node.style.left = `${Math.max(8, left)}px`;
  node.style.top = `${Math.max(8, top)}px`;

  activeMenu = node;
  setTimeout(() => {
    document.addEventListener('pointerdown', onOutside, { once: true });
    document.addEventListener('keydown', onEscape);
  }, 0);
  node.querySelector('.menu__item:not([disabled])')?.focus();
  return node;
}

function onOutside(e) {
  if (activeMenu && !activeMenu.contains(e.target)) closeMenu();
  else if (activeMenu) document.addEventListener('pointerdown', onOutside, { once: true });
}

function onEscape(e) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    closeMenu();
  }
}

export function closeMenu() {
  activeMenu?.remove();
  activeMenu = null;
  document.removeEventListener('keydown', onEscape);
}

export const isMenuOpen = () => !!activeMenu;

// ── Visionneuse d'images ─────────────────────────────────────────────────────

export function lightbox(items, startIndex = 0) {
  let index = startIndex;

  const content = el('div', { style: { display: 'grid', placeItems: 'center' } });
  const counter = el('span', { style: { marginLeft: 'auto', fontSize: '0.9em' } });

  const render = () => {
    const item = items[index];
    clear(content);
    content.append(
      item.mime?.startsWith('video/')
        ? el('video', { src: item.url, controls: true, autoplay: true })
        : el('img', { src: item.url, alt: item.name || '' })
    );
    counter.textContent = items.length > 1 ? `${index + 1} / ${items.length}` : '';
    title.textContent = item.name || '';
  };

  const move = (delta) => {
    index = (index + delta + items.length) % items.length;
    render();
  };

  const title = el('span', { style: { fontWeight: '600' } });

  const view = el('div.lightbox', {
    onclick: (e) => {
      if (e.target === view) close();
    },
  }, [
    el('div.lightbox__bar', {}, [
      title,
      counter,
      el('a.icon-btn', { href: items[index].downloadUrl || items[index].url, download: items[index].name || '', title: 'Télécharger' }, icon('download')),
      el('button.icon-btn', { onclick: close, 'aria-label': 'Fermer' }, icon('close')),
    ]),
    content,
    items.length > 1 ? el('button.lightbox__nav.lightbox__nav--prev', { onclick: () => move(-1), 'aria-label': 'Précédent' }, icon('left')) : null,
    items.length > 1 ? el('button.lightbox__nav.lightbox__nav--next', { onclick: () => move(1), 'aria-label': 'Suivant' }, icon('right')) : null,
  ]);

  function onKey(e) {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') move(-1);
    if (e.key === 'ArrowRight') move(1);
  }

  function close() {
    document.removeEventListener('keydown', onKey);
    view.remove();
  }

  document.addEventListener('keydown', onKey);
  layer('overlays').append(view);
  render();
  return { close };
}

// ── Divers ────────────────────────────────────────────────────────────────────

export const emptyState = (iconName, title, text, action = null) =>
  el('div.empty-state', {}, [
    el('div', { style: { width: '72px', height: '72px', borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent)', display: 'grid', placeItems: 'center' } }, icon(iconName, 'icon icon--xl')),
    el('h3.empty-state__title', { text: title }),
    text ? el('p.empty-state__text', { text }) : null,
    action,
  ]);

export const spinner = (large = false) => el(`div.spinner${large ? '.spinner--lg' : ''}`);

export const sectionTitle = (text) => el('div.list-section__title', { text });

/** Ligne « personne » réutilisable (contacts, sélecteurs, recherche). */
export const personRow = (user, { sub = '', trailing = null, onClick = null, selected = false } = {}) =>
  el('button.person-row', { onclick: onClick, type: 'button', style: selected ? { background: 'var(--accent-soft)' } : {} }, [
    avatar(user, { size: 'md' }),
    el('div.person-row__body', {}, [
      el('div.person-row__name.truncate', { text: user.displayName }),
      el('div.person-row__sub.truncate', { text: sub || user.mood || `@${user.skypeName}` }),
    ]),
    trailing,
  ]);

/** Champ de recherche standard. */
export const searchBox = (placeholder, onInput, { value = '' } = {}) => {
  const input = el('input', { type: 'search', placeholder, value, oninput: (e) => onInput(e.target.value), autocomplete: 'off' });
  const box = el('div.search-box', {}, [icon('search', 'icon icon--sm'), input]);
  box.input = input;
  return box;
};
