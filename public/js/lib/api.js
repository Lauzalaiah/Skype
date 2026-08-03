/** Client HTTP de l'API Skype. */
import { url as urlServeur } from './serveur.js';

const TOKEN_KEY = 'skype.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => (token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(method, path, body, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload = body;
  if (body !== undefined && !(body instanceof Blob) && !(body instanceof ArrayBuffer)) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(urlServeur(path), { method, headers, body: payload, signal: options.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Connexion au serveur impossible. Vérifiez votre réseau.', 0);
  }

  if (response.status === 204) return null;

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = (data && data.error) || `Erreur ${response.status}`;
    if (response.status === 401) setToken(null);
    throw new ApiError(message, response.status);
  }
  return data;
}

export const api = {
  get: (path, options) => request('GET', path, undefined, options),
  post: (path, body, options) => request('POST', path, body, options),
  patch: (path, body, options) => request('PATCH', path, body, options),
  put: (path, body, options) => request('PUT', path, body, options),
  del: (path, options) => request('DELETE', path, undefined, options),

  // ── Authentification ──────────────────────────────────────────────────────
  signup: (data) => request('POST', '/api/auth/signup', data),
  signin: (identifier, password) => request('POST', '/api/auth/signin', { identifier, password }),
  signout: () => request('POST', '/api/auth/signout'),
  me: () => request('GET', '/api/auth/me'),
  changePassword: (current, next) => request('POST', '/api/auth/password', { current, next }),

  // ── Profil ────────────────────────────────────────────────────────────────
  updateProfile: (patch) => request('PATCH', '/api/me', patch),
  updateSettings: (patch) => request('PATCH', '/api/me/settings', patch),
  saveDraft: (chatId, text) => request('PUT', `/api/me/draft/${chatId}`, { text }),
  bookmarks: () => request('GET', '/api/me/bookmarks'),
  toggleBookmark: (chatId, messageId) => request('POST', '/api/me/bookmarks', { chatId, messageId }),

  // ── Contacts ──────────────────────────────────────────────────────────────
  contacts: () => request('GET', '/api/contacts'),
  searchUsers: (q, signal) => request('GET', `/api/users/search?q=${encodeURIComponent(q)}`, undefined, { signal }),
  user: (id) => request('GET', `/api/users/${encodeURIComponent(id)}`),
  addContact: (userId, message) => request('POST', '/api/contacts/request', { userId, message }),
  respondContact: (requestId, accept) => request('POST', '/api/contacts/respond', { requestId, accept }),
  removeContact: (id) => request('DELETE', `/api/contacts/${id}`),
  favoriteContact: (id, favorite) => request('POST', `/api/contacts/${id}/favorite`, { favorite }),
  blockContact: (id, blocked) => request('POST', `/api/contacts/${id}/block`, { blocked }),

  // ── Conversations ─────────────────────────────────────────────────────────
  chats: () => request('GET', '/api/chats'),
  chat: (id) => request('GET', `/api/chats/${id}`),
  createDirect: (userId) => request('POST', '/api/chats', { type: 'direct', userId }),
  createGroup: (topic, memberIds, picture) => request('POST', '/api/chats', { type: 'group', topic, memberIds, picture }),
  updateChat: (id, patch) => request('PATCH', `/api/chats/${id}`, patch),
  addMembers: (id, memberIds) => request('POST', `/api/chats/${id}/members`, { memberIds }),
  removeMember: (id, userId) => request('DELETE', `/api/chats/${id}/members/${userId}`),
  setRole: (id, userId, role) => request('POST', `/api/chats/${id}/members/${userId}/role`, { role }),
  joinByLink: (link) => request('POST', `/api/chats/join/${link}`),

  // ── Messages ──────────────────────────────────────────────────────────────
  messages: (chatId, { before, limit = 60 } = {}) =>
    request('GET', `/api/chats/${chatId}/messages?limit=${limit}${before ? `&before=${before}` : ''}`),
  send: (chatId, payload) => request('POST', `/api/chats/${chatId}/messages`, payload),
  editMessage: (chatId, messageId, content) => request('PATCH', `/api/chats/${chatId}/messages/${messageId}`, { content }),
  deleteMessage: (chatId, messageId, scope = 'all') =>
    request('DELETE', `/api/chats/${chatId}/messages/${messageId}?scope=${scope}`),
  react: (chatId, messageId, emoji) => request('POST', `/api/chats/${chatId}/messages/${messageId}/react`, { emoji }),
  vote: (chatId, messageId, options) => request('POST', `/api/chats/${chatId}/messages/${messageId}/vote`, { options }),
  markRead: (chatId) => request('POST', `/api/chats/${chatId}/read`),
  forward: (chatId, messageId, targetChatIds) => request('POST', `/api/chats/${chatId}/forward`, { messageId, targetChatIds }),

  // ── Recherche, appels, crédit ─────────────────────────────────────────────
  search: (q, signal) => request('GET', `/api/search?q=${encodeURIComponent(q)}`, undefined, { signal }),
  calls: () => request('GET', '/api/calls'),
  callPhone: (number, minutes) => request('POST', '/api/calls/pstn', { number, minutes }),
  topUp: (amount) => request('POST', '/api/credit/topup', { amount }),
  getSkypeNumber: (country) => request('POST', '/api/skype-number', { country }),
  translate: (text, to) => request('POST', '/api/translate', { text, to }),
  emoticons: () => request('GET', '/api/emoticons'),

  /** Téléverse un fichier ; onProgress reçoit une valeur entre 0 et 1. */
  upload(file, onProgress) {
    return new Promise((resolve, reject) => {
      const params = new URLSearchParams({ name: file.name || 'fichier', type: file.type || 'application/octet-stream' });
      if (file.width) params.set('w', file.width);
      if (file.height) params.set('h', file.height);
      if (file.duration) params.set('d', Math.round(file.duration));

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/files?${params}`);
      xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) resolve(data.file);
          else reject(new ApiError(data.error || 'Échec du téléversement', xhr.status));
        } catch {
          reject(new ApiError('Réponse invalide du serveur', xhr.status));
        }
      };
      xhr.onerror = () => reject(new ApiError('Échec du téléversement', 0));
      xhr.send(file);
    });
  },
};

/** URL de téléchargement/affichage d'un fichier (jeton inclus pour les balises img). */
export const fileUrl = (fileId, download = false) =>
  urlServeur(`/api/files/${fileId}?token=${encodeURIComponent(getToken() || '')}${download ? '&download=1' : ''}`);
