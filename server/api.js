/**
 * API REST de Skype Reborn.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, save, id, FILES_DIR, hashPassword, verifyPassword } from './store.js';
import * as M from './models.js';
import { paysDuNumero, tarifDuNumero } from '../public/js/lib/pays.js';

const { httpError } = M;

/** Version déclarée dans package.json, exposée par /api/health. */
const VERSION = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')
).version;

const json = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
};

async function readBody(req, limit = 64 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw httpError(413, 'Fichier trop volumineux (64 Mo maximum).');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const readJson = async (req) => {
  const body = await readBody(req, 32 * 1024 * 1024);
  if (!body.length) return {};
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw httpError(400, 'Corps de requête JSON invalide.');
  }
};

/** Routeur minimaliste : « MÉTHODE /chemin/:param ». */
export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler) {
    const keys = [];
    const regex = new RegExp(
      '^' +
        pattern
          .split('/')
          .map((segment) => {
            if (segment.startsWith(':')) {
              keys.push(segment.slice(1));
              return '([^/]+)';
            }
            return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          })
          .join('/') +
        '/?$'
    );
    this.routes.push({ method, regex, keys, handler });
    return this;
  }

  get = (p, h) => this.add('GET', p, h);
  post = (p, h) => this.add('POST', p, h);
  patch = (p, h) => this.add('PATCH', p, h);
  put = (p, h) => this.add('PUT', p, h);
  delete = (p, h) => this.add('DELETE', p, h);

  match(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const m = pathname.match(route.regex);
      if (!m) continue;
      const params = {};
      route.keys.forEach((key, index) => (params[key] = decodeURIComponent(m[index + 1])));
      return { handler: route.handler, params };
    }
    return null;
  }
}

export function createApi(hub) {
  const router = new Router();

  const requireUser = (ctx) => {
    if (!ctx.user) throw httpError(401, 'Session expirée, veuillez vous reconnecter.');
    return ctx.user;
  };

  const requireChat = (ctx, chatId) => {
    const chat = db.chats[chatId];
    if (!chat) throw httpError(404, 'Conversation introuvable.');
    if (!M.isMember(chat, ctx.user.id)) throw httpError(403, 'Vous ne faites pas partie de cette conversation.');
    return chat;
  };

  // ── Authentification ────────────────────────────────────────────────────────

  router.post('/api/auth/signup', async (ctx) => {
    const body = await readJson(ctx.req);
    const user = M.createUser(body);
    const token = M.createSession(user.id, ctx.req.headers['user-agent'] || '');
    user.status = user.manualStatus;
    save();
    return { token, user: M.publicUser(user, user.id) };
  });

  router.post('/api/auth/signin', async (ctx) => {
    const { identifier, password } = await readJson(ctx.req);
    const user = M.authenticate(identifier, password);
    const token = M.createSession(user.id, ctx.req.headers['user-agent'] || '');
    return { token, user: M.publicUser(user, user.id) };
  });

  router.post('/api/auth/signout', (ctx) => {
    if (ctx.token) M.destroySession(ctx.token);
    return { ok: true };
  });

  router.get('/api/auth/me', (ctx) => {
    const user = requireUser(ctx);
    return { user: M.publicUser(user, user.id) };
  });

  router.post('/api/auth/password', async (ctx) => {
    const user = requireUser(ctx);
    const { current, next } = await readJson(ctx.req);
    if (!verifyPassword(current, user.passwordHash, user.passwordSalt)) {
      throw httpError(403, 'Mot de passe actuel incorrect.');
    }
    if (String(next || '').length < 6) throw httpError(400, 'Le nouveau mot de passe doit contenir au moins 6 caractères.');
    const { hash, salt } = hashPassword(next);
    user.passwordHash = hash;
    user.passwordSalt = salt;
    save();
    return { ok: true };
  });

  // ── Profil et réglages ──────────────────────────────────────────────────────

  router.patch('/api/me', async (ctx) => {
    const user = requireUser(ctx);
    const patch = await readJson(ctx.req);
    M.updateUser(user, patch);
    hub.broadcastToContacts(user.id, { type: 'user:updated', user: M.publicUser(user) });
    return { user: M.publicUser(user, user.id) };
  });

  router.patch('/api/me/settings', async (ctx) => {
    const user = requireUser(ctx);
    M.updateUser(user, { settings: await readJson(ctx.req) });
    return { settings: user.settings };
  });

  router.put('/api/me/draft/:chatId', async (ctx) => {
    const user = requireUser(ctx);
    const { text } = await readJson(ctx.req);
    if (text) user.drafts[ctx.params.chatId] = text;
    else delete user.drafts[ctx.params.chatId];
    save();
    return { ok: true };
  });

  router.get('/api/me/bookmarks', (ctx) => {
    const user = requireUser(ctx);
    const items = user.bookmarks
      .map((b) => {
        const message = M.findMessage(b.chatId, b.messageId);
        return message ? { ...b, message, chat: db.chats[b.chatId] ? M.chatView(db.chats[b.chatId], user.id) : null } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.at - a.at);
    return { bookmarks: items };
  });

  router.post('/api/me/bookmarks', async (ctx) => {
    const user = requireUser(ctx);
    const { chatId, messageId } = await readJson(ctx.req);
    const existing = user.bookmarks.findIndex((b) => b.messageId === messageId);
    if (existing >= 0) user.bookmarks.splice(existing, 1);
    else user.bookmarks.push({ chatId, messageId, at: Date.now() });
    save();
    return { bookmarked: existing < 0 };
  });

  // ── Utilisateurs et contacts ────────────────────────────────────────────────

  router.get('/api/users/search', (ctx) => {
    const user = requireUser(ctx);
    return { results: M.searchUsers(ctx.url.searchParams.get('q'), user.id) };
  });

  router.get('/api/users/:id', (ctx) => {
    const user = requireUser(ctx);
    const target = db.users[ctx.params.id] || M.findUserByName(ctx.params.id);
    if (!target) throw httpError(404, 'Utilisateur introuvable.');
    return { user: M.publicUser(target, user.id) };
  });

  router.get('/api/contacts', (ctx) => {
    const user = requireUser(ctx);
    return {
      contacts: user.contacts.map((cid) => M.publicUser(db.users[cid], user.id)).filter(Boolean),
      favorites: user.favorites,
      blocked: user.blocked.map((bid) => M.publicUser(db.users[bid], user.id)).filter(Boolean),
      requests: {
        incoming: Object.values(db.contactRequests)
          .filter((r) => r.toId === user.id && r.status === 'pending')
          .map((r) => ({ ...r, from: M.publicUser(db.users[r.fromId], user.id) })),
        outgoing: Object.values(db.contactRequests)
          .filter((r) => r.fromId === user.id && r.status === 'pending')
          .map((r) => ({ ...r, to: M.publicUser(db.users[r.toId], user.id) })),
      },
    };
  });

  router.post('/api/contacts/request', async (ctx) => {
    const user = requireUser(ctx);
    const { userId, message } = await readJson(ctx.req);
    const request = M.sendContactRequest(user, userId, message);
    hub.sendToUser(userId, {
      type: 'contact:request',
      request: { ...request, from: M.publicUser(user) },
    });
    if (request.status === 'accepted') hub.syncContacts(user.id, userId);
    return { request };
  });

  router.post('/api/contacts/respond', async (ctx) => {
    const user = requireUser(ctx);
    const { requestId, accept } = await readJson(ctx.req);
    const request = M.respondToContactRequest(user, requestId, accept);
    hub.sendToUser(request.fromId, { type: 'contact:response', request, by: M.publicUser(user) });
    if (accept) hub.syncContacts(request.fromId, request.toId);
    return { request };
  });

  router.delete('/api/contacts/:id', (ctx) => {
    const user = requireUser(ctx);
    M.removeContact(user, ctx.params.id);
    hub.sendToUser(ctx.params.id, { type: 'contact:removed', userId: user.id });
    return { ok: true };
  });

  router.post('/api/contacts/:id/favorite', async (ctx) => {
    const user = requireUser(ctx);
    const { favorite } = await readJson(ctx.req);
    user.favorites = favorite
      ? [...new Set([...user.favorites, ctx.params.id])]
      : user.favorites.filter((f) => f !== ctx.params.id);
    save();
    return { favorites: user.favorites };
  });

  router.post('/api/contacts/:id/block', async (ctx) => {
    const user = requireUser(ctx);
    const { blocked } = await readJson(ctx.req);
    M.setBlocked(user, ctx.params.id, blocked !== false);
    return { blocked: user.blocked };
  });

  // ── Conversations ───────────────────────────────────────────────────────────

  router.get('/api/chats', (ctx) => {
    const user = requireUser(ctx);
    return { chats: M.chatsForUser(user.id).map((c) => M.chatView(c, user.id)) };
  });

  router.post('/api/chats', async (ctx) => {
    const user = requireUser(ctx);
    const body = await readJson(ctx.req);
    const chat =
      body.type === 'group'
        ? M.createGroupChat(user, body)
        : M.getOrCreateDirectChat(user.id, body.userId);
    for (const member of chat.members) {
      if (member.userId !== user.id) hub.sendToUser(member.userId, { type: 'chat:new', chat: M.chatView(chat, member.userId) });
    }
    return { chat: M.chatView(chat, user.id) };
  });

  router.get('/api/chats/:id', (ctx) => {
    const user = requireUser(ctx);
    return { chat: M.chatView(requireChat(ctx, ctx.params.id), user.id) };
  });

  router.patch('/api/chats/:id', async (ctx) => {
    const user = requireUser(ctx);
    const chat = requireChat(ctx, ctx.params.id);
    const patch = await readJson(ctx.req);

    if (chat.type === 'group' && (patch.topic !== undefined || patch.picture !== undefined)) {
      if (!M.isAdmin(chat, user.id)) throw httpError(403, 'Seuls les administrateurs peuvent modifier le groupe.');
      if (patch.topic !== undefined && patch.topic !== chat.topic) {
        chat.topic = String(patch.topic).slice(0, 80);
        M.addSystemMessage(chat.id, `${user.displayName} a renommé la conversation en « ${chat.topic} »`, { kind: 'topic', actorId: user.id });
      }
      if (patch.picture !== undefined) {
        chat.picture = patch.picture;
        M.addSystemMessage(chat.id, `${user.displayName} a changé la photo du groupe`, { kind: 'picture', actorId: user.id });
      }
    }

    // Préférences personnelles (elles ne concernent que l'utilisateur courant).
    const toggles = { pinned: 'pinnedChats', muted: 'mutedChats', archived: 'archivedChats', markedUnread: 'unreadOverride' };
    for (const [key, field] of Object.entries(toggles)) {
      if (patch[key] === undefined) continue;
      user[field] = patch[key]
        ? [...new Set([...user[field], chat.id])]
        : user[field].filter((c) => c !== chat.id);
    }
    save();

    hub.broadcastToChat(chat, { type: 'chat:updated', chat: null, chatId: chat.id }, user.id);
    return { chat: M.chatView(chat, user.id) };
  });

  router.post('/api/chats/:id/members', async (ctx) => {
    const user = requireUser(ctx);
    const chat = requireChat(ctx, ctx.params.id);
    if (chat.type !== 'group') throw httpError(400, 'Impossible d’ajouter des membres à une conversation individuelle.');
    const { memberIds } = await readJson(ctx.req);
    M.addMembers(chat, user.id, memberIds);
    hub.broadcastToChat(chat, { type: 'chat:members', chatId: chat.id });
    for (const memberId of memberIds) hub.sendToUser(memberId, { type: 'chat:new', chat: M.chatView(chat, memberId) });
    return { chat: M.chatView(chat, user.id) };
  });

  router.delete('/api/chats/:id/members/:userId', (ctx) => {
    const user = requireUser(ctx);
    const chat = requireChat(ctx, ctx.params.id);
    const target = ctx.params.userId;
    if (target !== user.id && !M.isAdmin(chat, user.id)) throw httpError(403, 'Seuls les administrateurs peuvent retirer un membre.');
    M.removeMember(chat, user.id, target);
    hub.broadcastToChat(chat, { type: 'chat:members', chatId: chat.id });
    hub.sendToUser(target, { type: 'chat:removed', chatId: chat.id });
    return { ok: true };
  });

  router.post('/api/chats/:id/members/:userId/role', async (ctx) => {
    const user = requireUser(ctx);
    const chat = requireChat(ctx, ctx.params.id);
    if (!M.isAdmin(chat, user.id)) throw httpError(403, 'Réservé aux administrateurs.');
    const { role } = await readJson(ctx.req);
    const member = chat.members.find((m) => m.userId === ctx.params.userId);
    if (!member) throw httpError(404, 'Membre introuvable.');
    member.role = role === 'admin' ? 'admin' : 'member';
    M.addSystemMessage(chat.id, `${db.users[member.userId].displayName} est désormais ${member.role === 'admin' ? 'administrateur' : 'membre'}`, { kind: 'role', actorId: user.id });
    save();
    hub.broadcastToChat(chat, { type: 'chat:members', chatId: chat.id });
    return { chat: M.chatView(chat, user.id) };
  });

  router.post('/api/chats/join/:link', (ctx) => {
    const user = requireUser(ctx);
    const chat = Object.values(db.chats).find((c) => c.joinLink === ctx.params.link);
    if (!chat) throw httpError(404, 'Lien d’invitation invalide ou expiré.');
    if (!M.isMember(chat, user.id)) {
      M.addMembers(chat, chat.createdBy, [user.id]);
      hub.broadcastToChat(chat, { type: 'chat:members', chatId: chat.id });
    }
    return { chat: M.chatView(chat, user.id) };
  });

  // ── Messages ────────────────────────────────────────────────────────────────

  router.get('/api/chats/:id/messages', (ctx) => {
    const user = requireUser(ctx);
    const chat = requireChat(ctx, ctx.params.id);
    const all = (db.messages[chat.id] || []).filter((m) => !m.deletedFor.includes(user.id));
    const limit = Math.min(Number(ctx.url.searchParams.get('limit')) || 60, 300);
    const before = Number(ctx.url.searchParams.get('before')) || Infinity;
    const slice = all.filter((m) => m.createdAt < before);
    return {
      messages: slice.slice(-limit),
      hasMore: slice.length > limit,
    };
  });

  router.post('/api/chats/:id/messages', async (ctx) => {
    const user = requireUser(ctx);
    const chat = requireChat(ctx, ctx.params.id);

    // Blocage : on n'envoie pas de message à quelqu'un qui vous a bloqué.
    if (chat.type === 'direct') {
      const other = chat.members.find((m) => m.userId !== user.id);
      if (other && db.users[other.userId]?.blocked.includes(user.id)) {
        throw httpError(403, 'Vous ne pouvez pas envoyer de message à ce contact.');
      }
    }

    const body = await readJson(ctx.req);
    const message = M.addMessage(chat.id, user.id, body);
    delete user.drafts[chat.id];
    save();
    hub.broadcastToChat(chat, { type: 'message:new', chatId: chat.id, message, sender: M.publicUser(user) });
    return { message };
  });

  router.patch('/api/chats/:id/messages/:messageId', async (ctx) => {
    const user = requireUser(ctx);
    const chat = requireChat(ctx, ctx.params.id);
    const { content } = await readJson(ctx.req);
    const message = M.editMessage(chat.id, ctx.params.messageId, user.id, content);
    hub.broadcastToChat(chat, { type: 'message:edited', chatId: chat.id, message });
    return { message };
  });

  router.delete('/api/chats/:id/messages/:messageId', (ctx) => {
    const user = requireUser(ctx);
    const chat = requireChat(ctx, ctx.params.id);
    const forEveryone = ctx.url.searchParams.get('scope') !== 'me';
    const message = M.deleteMessage(chat.id, ctx.params.messageId, user.id, forEveryone);
    if (message.deleted) hub.broadcastToChat(chat, { type: 'message:deleted', chatId: chat.id, message });
    return { message };
  });

  router.post('/api/chats/:id/messages/:messageId/react', async (ctx) => {
    const user = requireUser(ctx);
    const chat = requireChat(ctx, ctx.params.id);
    const { emoji } = await readJson(ctx.req);
    const message = M.reactToMessage(chat.id, ctx.params.messageId, user.id, emoji);
    hub.broadcastToChat(chat, { type: 'message:reaction', chatId: chat.id, message, by: M.publicUser(user), emoji });
    return { message };
  });

  router.post('/api/chats/:id/messages/:messageId/vote', async (ctx) => {
    const user = requireUser(ctx);
    const chat = requireChat(ctx, ctx.params.id);
    const { options } = await readJson(ctx.req);
    const message = M.votePoll(chat.id, ctx.params.messageId, user.id, options || []);
    hub.broadcastToChat(chat, { type: 'message:poll', chatId: chat.id, message });
    return { message };
  });

  router.post('/api/chats/:id/read', async (ctx) => {
    const user = requireUser(ctx);
    const chat = requireChat(ctx, ctx.params.id);
    M.markRead(chat, user.id);
    hub.broadcastToChat(chat, { type: 'chat:read', chatId: chat.id, userId: user.id, at: Date.now() }, user.id);
    return { ok: true };
  });

  router.post('/api/chats/:id/forward', async (ctx) => {
    const user = requireUser(ctx);
    const source = requireChat(ctx, ctx.params.id);
    const { messageId, targetChatIds } = await readJson(ctx.req);
    const original = M.findMessage(source.id, messageId);
    if (!original) throw httpError(404, 'Message introuvable.');

    const created = [];
    for (const targetId of targetChatIds) {
      const target = db.chats[targetId];
      if (!target || !M.isMember(target, user.id)) continue;
      const message = M.addMessage(target.id, user.id, {
        type: original.type,
        content: original.content,
        attachments: original.attachments,
        poll: original.poll ? { ...original.poll, options: original.poll.options.map((o) => ({ ...o, votes: [] })) } : null,
        forwardedFrom: { userId: original.senderId, chatId: source.id, messageId: original.id },
      });
      created.push(message);
      hub.broadcastToChat(target, { type: 'message:new', chatId: target.id, message, sender: M.publicUser(user) });
    }
    return { messages: created };
  });

  // ── Recherche globale ───────────────────────────────────────────────────────

  router.get('/api/search', (ctx) => {
    const user = requireUser(ctx);
    const q = String(ctx.url.searchParams.get('q') || '').trim().toLowerCase();
    if (q.length < 2) return { messages: [], chats: [], people: [] };

    const chats = M.chatsForUser(user.id);
    const messages = [];
    for (const chat of chats) {
      for (const message of db.messages[chat.id] || []) {
        if (message.deleted || message.deletedFor.includes(user.id)) continue;
        if (typeof message.content === 'string' && message.content.toLowerCase().includes(q)) {
          messages.push({ ...message, chatTitle: chat.type === 'group' ? chat.topic : null });
        }
      }
    }
    return {
      messages: messages.sort((a, b) => b.createdAt - a.createdAt).slice(0, 60),
      chats: chats
        .filter((c) => (c.type === 'group' ? c.topic.toLowerCase().includes(q) : c.members.some((m) => db.users[m.userId]?.displayName.toLowerCase().includes(q))))
        .map((c) => M.chatView(c, user.id))
        .slice(0, 20),
      people: M.searchUsers(q, user.id).slice(0, 20),
    };
  });

  // ── Historique d'appels et crédit ───────────────────────────────────────────

  router.get('/api/calls', (ctx) => {
    const user = requireUser(ctx);
    return {
      calls: M.callsForUser(user.id).map((c) => ({
        ...c,
        participantsInfo: c.participants.map((p) => M.publicUser(db.users[p], user.id)).filter(Boolean),
      })),
    };
  });

  router.post('/api/calls/pstn', async (ctx) => {
    const user = requireUser(ctx);
    const { number, minutes = 1 } = await readJson(ctx.req);
    // Le tarif est déduit du numéro par le serveur : le client ne le choisit pas.
    const rate = tarifDuNumero(number);
    const pays = paysDuNumero(number);
    const cost = Number((rate * minutes).toFixed(3));
    if (user.credit < cost) throw httpError(402, 'Crédit Skype insuffisant. Rechargez pour appeler ce numéro.');
    user.credit = Number((user.credit - cost).toFixed(3));
    const call = M.recordCall({
      chatId: null,
      initiatorId: user.id,
      type: 'pstn',
      participants: [user.id],
      status: 'completed',
      startedAt: Date.now() - minutes * 60000,
      endedAt: Date.now(),
    });
    call.number = number;
    call.country = pays?.code ?? null;
    save();
    return { call, credit: user.credit, cost, rate, country: pays?.nom ?? 'Destination inconnue' };
  });

  router.post('/api/credit/topup', async (ctx) => {
    const user = requireUser(ctx);
    const { amount } = await readJson(ctx.req);
    const value = Math.min(Math.max(Number(amount) || 0, 0), 100);
    user.credit = Number((user.credit + value).toFixed(2));
    save();
    return { credit: user.credit };
  });

  router.post('/api/skype-number', async (ctx) => {
    const user = requireUser(ctx);
    const { country = 'FR' } = await readJson(ctx.req);
    const prefixes = { FR: '+33 9 70', BE: '+32 2', CH: '+41 22', CA: '+1 514', US: '+1 415', UK: '+44 20' };
    const digits = String(crypto.randomInt(100000, 999999));
    user.skypeNumber = `${prefixes[country] || prefixes.FR} ${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4)}`;
    save();
    return { skypeNumber: user.skypeNumber };
  });

  // ── Fichiers ────────────────────────────────────────────────────────────────

  router.post('/api/files', async (ctx) => {
    const user = requireUser(ctx);
    const name = ctx.url.searchParams.get('name') || 'fichier';
    const mime = ctx.url.searchParams.get('type') || 'application/octet-stream';
    const buffer = await readBody(ctx.req);
    if (!buffer.length) throw httpError(400, 'Fichier vide.');

    const fileId = id('f_');
    const safeName = path.basename(name).replace(/[^\w.\-() À-ſ]/g, '_').slice(0, 120);
    fs.writeFileSync(path.join(FILES_DIR, fileId), buffer);
    const meta = {
      id: fileId,
      name: safeName,
      mime,
      size: buffer.length,
      ownerId: user.id,
      uploadedAt: Date.now(),
      width: Number(ctx.url.searchParams.get('w')) || null,
      height: Number(ctx.url.searchParams.get('h')) || null,
      duration: Number(ctx.url.searchParams.get('d')) || null,
    };
    db.files[fileId] = meta;
    save();
    return { file: meta };
  });

  router.get('/api/files/:id', (ctx) => {
    requireUser(ctx);
    const meta = db.files[ctx.params.id];
    if (!meta) throw httpError(404, 'Fichier introuvable.');
    const filePath = path.join(FILES_DIR, meta.id);
    if (!fs.existsSync(filePath)) throw httpError(404, 'Fichier introuvable sur le disque.');

    const download = ctx.url.searchParams.get('download') === '1';
    const stat = fs.statSync(filePath);
    ctx.res.writeHead(200, {
      'Content-Type': meta.mime,
      'Content-Length': stat.size,
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
      'Cache-Control': 'private, max-age=31536000, immutable',
    });
    fs.createReadStream(filePath).pipe(ctx.res);
    return null; // réponse déjà envoyée en flux
  });

  // ── Divers ──────────────────────────────────────────────────────────────────

  router.get('/api/emoticons', () => ({ emoticons: EMOTICON_CATALOG }));

  router.post('/api/translate', async (ctx) => {
    requireUser(ctx);
    const { text, to = 'en' } = await readJson(ctx.req);
    // Traducteur local de démonstration (Skype Translator sans service externe).
    return { translation: pseudoTranslate(text, to), to, engine: 'skype-translator-local' };
  });

  // Point d'entrée public : il sert à un client distant (application native)
  // pour vérifier qu'il parle bien à un serveur Skype avant de mémoriser son
  // adresse. Volontairement avare — le nombre d'utilisateurs et de
  // conversations n'a pas à être lisible sans authentification.
  router.get('/api/health', () => ({
    service: 'skype',
    ok: true,
    version: VERSION,
    uptime: Math.round(process.uptime()),
  }));

  return { router, json, readJson };
}

// ── Émoticônes historiques de Skype ─────────────────────────────────────────

export const EMOTICON_CATALOG = {
  smileys: [
    { code: ':)', emoji: '🙂', name: 'Sourire', tags: ['smile', 'sourire'] },
    { code: ':D', emoji: '😃', name: 'Grand sourire', tags: ['happy'] },
    { code: ':(', emoji: '🙁', name: 'Triste', tags: ['sad'] },
    { code: ";)", emoji: '😉', name: 'Clin d’œil', tags: ['wink'] },
    { code: ':P', emoji: '😛', name: 'Langue', tags: ['tongue'] },
    { code: ':O', emoji: '😮', name: 'Surpris', tags: ['surprised'] },
    { code: ":'(", emoji: '😢', name: 'Pleure', tags: ['cry'] },
    { code: ':^)', emoji: '🤔', name: 'Pensif', tags: ['think'] },
    { code: '(rofl)', emoji: '🤣', name: 'Mort de rire', tags: ['rofl'] },
    { code: '(giggle)', emoji: '🤭', name: 'Rire discret', tags: ['giggle'] },
    { code: '(blush)', emoji: '😊', name: 'Rougir', tags: ['blush'] },
    { code: '(wondering)', emoji: '🤨', name: 'Perplexe', tags: [] },
    { code: '(sleepy)', emoji: '😴', name: 'Endormi', tags: ['sleep'] },
    { code: '(dull)', emoji: '😑', name: 'Blasé', tags: [] },
    { code: '(inlove)', emoji: '😍', name: 'Amoureux', tags: ['love'] },
    { code: '(cool)', emoji: '😎', name: 'Cool', tags: [] },
    { code: '(mad)', emoji: '😠', name: 'Fâché', tags: ['angry'] },
    { code: '(puke)', emoji: '🤮', name: 'Dégoûté', tags: [] },
    { code: '(angel)', emoji: '😇', name: 'Ange', tags: [] },
    { code: '(devil)', emoji: '😈', name: 'Diable', tags: [] },
    { code: '(nerd)', emoji: '🤓', name: 'Intello', tags: [] },
    { code: '(ninja)', emoji: '🥷', name: 'Ninja', tags: [] },
    { code: '(sweat)', emoji: '😅', name: 'Sueur', tags: [] },
    { code: '(speechless)', emoji: '😶', name: 'Sans voix', tags: [] },
    { code: '(kiss)', emoji: '😘', name: 'Bisou', tags: [] },
    { code: '(yawn)', emoji: '🥱', name: 'Bâillement', tags: [] },
    { code: '(worry)', emoji: '😟', name: 'Inquiet', tags: [] },
    { code: '(facepalm)', emoji: '🤦', name: 'Facepalm', tags: [] },
  ],
  gestes: [
    { code: '(y)', emoji: '👍', name: 'Pouce en l’air', tags: ['yes', 'like'] },
    { code: '(n)', emoji: '👎', name: 'Pouce en bas', tags: ['no'] },
    { code: '(handshake)', emoji: '🤝', name: 'Poignée de main', tags: [] },
    { code: '(clap)', emoji: '👏', name: 'Applaudissements', tags: [] },
    { code: '(wave)', emoji: '👋', name: 'Coucou', tags: ['hi'] },
    { code: '(punch)', emoji: '👊', name: 'Poing', tags: [] },
    { code: '(muscle)', emoji: '💪', name: 'Muscle', tags: [] },
    { code: '(pray)', emoji: '🙏', name: 'Prière', tags: [] },
    { code: '(highfive)', emoji: '🙌', name: 'Tope là', tags: [] },
    { code: '(ok)', emoji: '👌', name: 'OK', tags: [] },
  ],
  coeurs: [
    { code: '(h)', emoji: '❤️', name: 'Cœur', tags: ['love', 'heart'] },
    { code: '(brokenheart)', emoji: '💔', name: 'Cœur brisé', tags: [] },
    { code: '(hearteyes)', emoji: '😍', name: 'Yeux en cœur', tags: [] },
    { code: '(sparklingheart)', emoji: '💖', name: 'Cœur scintillant', tags: [] },
    { code: '(hug)', emoji: '🤗', name: 'Câlin', tags: [] },
    { code: '(rose)', emoji: '🌹', name: 'Rose', tags: [] },
  ],
  fetes: [
    { code: '(party)', emoji: '🎉', name: 'Fête', tags: ['party'] },
    { code: '(cake)', emoji: '🎂', name: 'Gâteau', tags: ['anniversaire'] },
    { code: '(gift)', emoji: '🎁', name: 'Cadeau', tags: [] },
    { code: '(champagne)', emoji: '🍾', name: 'Champagne', tags: [] },
    { code: '(beer)', emoji: '🍺', name: 'Bière', tags: [] },
    { code: '(drink)', emoji: '🍸', name: 'Cocktail', tags: [] },
    { code: '(coffee)', emoji: '☕', name: 'Café', tags: [] },
    { code: '(pizza)', emoji: '🍕', name: 'Pizza', tags: [] },
    { code: '(xmas)', emoji: '🎄', name: 'Sapin', tags: [] },
    { code: '(fireworks)', emoji: '🎆', name: 'Feu d’artifice', tags: [] },
  ],
  objets: [
    { code: '(*)', emoji: '⭐', name: 'Étoile', tags: [] },
    { code: '(sun)', emoji: '☀️', name: 'Soleil', tags: [] },
    { code: '(rain)', emoji: '🌧️', name: 'Pluie', tags: [] },
    { code: '(music)', emoji: '🎵', name: 'Musique', tags: [] },
    { code: '(film)', emoji: '🎬', name: 'Cinéma', tags: [] },
    { code: '(phone)', emoji: '📱', name: 'Téléphone', tags: [] },
    { code: '(computer)', emoji: '💻', name: 'Ordinateur', tags: [] },
    { code: '(mail)', emoji: '✉️', name: 'Courrier', tags: [] },
    { code: '(clock)', emoji: '🕐', name: 'Horloge', tags: [] },
    { code: '(bomb)', emoji: '💣', name: 'Bombe', tags: [] },
    { code: '(idea)', emoji: '💡', name: 'Idée', tags: [] },
    { code: '(rocket)', emoji: '🚀', name: 'Fusée', tags: [] },
    { code: '(car)', emoji: '🚗', name: 'Voiture', tags: [] },
    { code: '(plane)', emoji: '✈️', name: 'Avion', tags: [] },
    { code: '(football)', emoji: '⚽', name: 'Football', tags: [] },
    { code: '(skype)', emoji: '🇸', name: 'Skype', tags: [] },
  ],
  animaux: [
    { code: '(cat)', emoji: '🐱', name: 'Chat', tags: [] },
    { code: '(dog)', emoji: '🐶', name: 'Chien', tags: [] },
    { code: '(monkey)', emoji: '🐵', name: 'Singe', tags: [] },
    { code: '(bear)', emoji: '🐻', name: 'Ours', tags: [] },
    { code: '(penguin)', emoji: '🐧', name: 'Manchot', tags: [] },
    { code: '(unicorn)', emoji: '🦄', name: 'Licorne', tags: [] },
  ],
};

/** Traducteur local : suffisant pour la démo hors-ligne de Skype Translator. */
function pseudoTranslate(text, to) {
  const dictionaries = {
    en: { bonjour: 'hello', salut: 'hi', 'merci': 'thanks', oui: 'yes', non: 'no', 'ça va': 'how are you', 'à bientôt': 'see you soon', appel: 'call', message: 'message', 'demain': 'tomorrow', 'aujourd’hui': 'today' },
    es: { bonjour: 'hola', salut: 'hola', merci: 'gracias', oui: 'sí', non: 'no', appel: 'llamada', message: 'mensaje', demain: 'mañana' },
    de: { bonjour: 'hallo', salut: 'hallo', merci: 'danke', oui: 'ja', non: 'nein', appel: 'anruf', message: 'nachricht', demain: 'morgen' },
  };
  const dict = dictionaries[to] || dictionaries.en;
  let out = String(text);
  for (const [from, target] of Object.entries(dict)) {
    out = out.replace(new RegExp(from, 'gi'), target);
  }
  return out;
}
