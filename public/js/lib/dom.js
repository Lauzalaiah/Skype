/** Utilitaires DOM légers (aucune bibliothèque externe). */

/**
 * Crée un élément.
 *   el('div.chat-item', { onclick }, [enfant1, 'texte'])
 * La chaîne de sélecteur accepte « tag#id.classe1.classe2 ».
 */
export function el(selector, props = {}, children = []) {
  const [tagAndId, ...classes] = String(selector).split('.');
  const [tag, id] = tagAndId.split('#');
  const node = document.createElement(tag || 'div');
  if (id) node.id = id;
  if (classes.length) node.className = classes.join(' ');

  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class' || key === 'className') node.className = [node.className, value].filter(Boolean).join(' ');
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key === 'ref' && typeof value === 'function') value(node);
    else if (key in node && key !== 'list' && typeof value !== 'object') {
      // Certaines propriétés sont en lecture seule selon l'élément
      // (« type » sur un textarea, par exemple) : on retombe sur l'attribut.
      try {
        node[key] = value;
      } catch {
        node.setAttribute(key, value === true ? '' : value);
      }
    } else node.setAttribute(key, value === true ? '' : value);
  }

  append(node, children);
  return node;
}

export function append(parent, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function clear(node) {
  while (node?.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function replace(node, children) {
  clear(node);
  append(node, children);
  return node;
}

/** Échappe le HTML — indispensable avant toute insertion de texte utilisateur. */
export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function on(target, event, handler, options) {
  target.addEventListener(event, handler, options);
  return () => target.removeEventListener(event, handler, options);
}

/** Délégation d'événement : on(root, 'click', '.chat-item', handler) */
export function delegate(root, event, selector, handler) {
  return on(root, event, (e) => {
    const match = e.target.closest(selector);
    if (match && root.contains(match)) handler(e, match);
  });
}

export const raf = (fn) => requestAnimationFrame(fn);
export const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function debounce(fn, delay = 250) {
  let timer;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
  wrapped.cancel = () => clearTimeout(timer);
  wrapped.flush = (...args) => {
    clearTimeout(timer);
    fn(...args);
  };
  return wrapped;
}

export function throttle(fn, interval = 200) {
  let last = 0;
  let timer;
  return (...args) => {
    const now = Date.now();
    const remaining = interval - (now - last);
    if (remaining <= 0) {
      last = now;
      fn(...args);
    } else {
      clearTimeout(timer);
      timer = setTimeout(() => {
        last = Date.now();
        fn(...args);
      }, remaining);
    }
  };
}

/** Focus piégé dans une modale (accessibilité clavier). */
export function trapFocus(container) {
  const selector = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
  const handler = (e) => {
    if (e.key !== 'Tab') return;
    const focusable = $$(selector, container).filter((n) => n.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  container.addEventListener('keydown', handler);
  return () => container.removeEventListener('keydown', handler);
}

export function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = el('textarea', { value: text, style: { position: 'fixed', opacity: '0' } });
  document.body.append(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
  return Promise.resolve();
}
