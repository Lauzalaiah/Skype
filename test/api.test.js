/**
 * Tests de bout en bout de l'API et du temps réel.
 *   npm test
 * Le serveur est démarré sur un port dédié avec une base isolée.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 3199;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'skype.json');
const BACKUP_PATH = path.join(DATA_DIR, 'skype.json.testbackup');

let server;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, url, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(BASE + url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  return { status: response.status, data };
}

before(async () => {
  // Base de test isolée : l'éventuelle base existante est mise de côté.
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_PATH)) fs.renameSync(DB_PATH, BACKUP_PATH);

  server = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
    stdio: 'pipe',
  });

  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
    } catch {
      /* pas encore prêt */
    }
    await sleep(100);
  }
  throw new Error('Le serveur de test n’a pas démarré');
});

after(async () => {
  server?.kill('SIGTERM');
  await sleep(300);
  server?.kill('SIGKILL');
  fs.rmSync(DB_PATH, { force: true });
  if (fs.existsSync(BACKUP_PATH)) fs.renameSync(BACKUP_PATH, DB_PATH);
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const suffix = Math.random().toString(36).slice(2, 7);
const users = {};

async function createUser(key, name) {
  const { status, data } = await call('POST', '/api/auth/signup', {
    body: { skypeName: `${name}.${suffix}`, displayName: name, password: 'motdepasse123' },
  });
  assert.equal(status, 200, `création de ${name} : ${JSON.stringify(data)}`);
  users[key] = { ...data.user, token: data.token };
  return users[key];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Authentification', () => {
  test('crée un compte et renvoie un jeton', async () => {
    const alice = await createUser('alice', 'alice');
    assert.ok(alice.token);
    assert.equal(alice.skypeName, `alice.${suffix}`);
    assert.equal(alice.status, 'online');
  });

  test('refuse un pseudo déjà pris', async () => {
    const { status } = await call('POST', '/api/auth/signup', {
      body: { skypeName: `alice.${suffix}`, displayName: 'Imposteur', password: 'motdepasse123' },
    });
    assert.equal(status, 409);
  });

  test('refuse un pseudo invalide', async () => {
    const { status } = await call('POST', '/api/auth/signup', {
      body: { skypeName: '42', displayName: 'X', password: 'motdepasse123' },
    });
    assert.equal(status, 400);
  });

  test('refuse un mot de passe trop court', async () => {
    const { status } = await call('POST', '/api/auth/signup', {
      body: { skypeName: `court.${suffix}`, displayName: 'X', password: '123' },
    });
    assert.equal(status, 400);
  });

  test('connecte avec le bon mot de passe et rejette le mauvais', async () => {
    const ok = await call('POST', '/api/auth/signin', {
      body: { identifier: `alice.${suffix}`, password: 'motdepasse123' },
    });
    assert.equal(ok.status, 200);

    const ko = await call('POST', '/api/auth/signin', {
      body: { identifier: `alice.${suffix}`, password: 'mauvais' },
    });
    assert.equal(ko.status, 401);
  });

  test('refuse les requêtes sans jeton', async () => {
    const { status } = await call('GET', '/api/chats');
    assert.equal(status, 401);
  });

  test('ne divulgue jamais le hachage du mot de passe', async () => {
    const { data } = await call('GET', '/api/auth/me', { token: users.alice.token });
    assert.equal(data.user.passwordHash, undefined);
    assert.equal(data.user.passwordSalt, undefined);
  });
});

describe('Contacts', () => {
  test('envoie et accepte une demande de contact', async () => {
    const bob = await createUser('bob', 'bob');

    const sent = await call('POST', '/api/contacts/request', {
      token: users.alice.token,
      body: { userId: bob.id, message: 'Salut !' },
    });
    assert.equal(sent.status, 200);
    assert.equal(sent.data.request.status, 'pending');

    const incoming = await call('GET', '/api/contacts', { token: bob.token });
    assert.equal(incoming.data.requests.incoming.length, 1);

    const accepted = await call('POST', '/api/contacts/respond', {
      token: bob.token,
      body: { requestId: sent.data.request.id, accept: true },
    });
    assert.equal(accepted.data.request.status, 'accepted');

    // Chaque compte a aussi le service d'écho parmi ses contacts dès
    // l'inscription (voir « Service d'écho ») : on ne compte que les humains.
    const contacts = await call('GET', '/api/contacts', { token: users.alice.token });
    const humains = contacts.data.contacts.filter((c) => !c.isBot);
    assert.equal(humains.length, 1);
    assert.equal(humains[0].id, bob.id);
  });

  test('crée automatiquement la conversation à l’acceptation', async () => {
    const { data } = await call('GET', '/api/chats', { token: users.alice.token });
    const humains = data.chats.filter((c) => !c.members.some((m) => m.user?.isBot));
    assert.equal(humains.length, 1);
    assert.equal(humains[0].type, 'direct');
  });

  test('trouve un utilisateur par recherche', async () => {
    const { data } = await call('GET', `/api/users/search?q=bob.${suffix}`, { token: users.alice.token });
    assert.equal(data.results.length, 1);
    assert.equal(data.results[0].id, users.bob.id);
  });

  test('ne se propose pas soi-même dans la recherche', async () => {
    const { data } = await call('GET', `/api/users/search?q=alice.${suffix}`, { token: users.alice.token });
    assert.equal(data.results.length, 0);
  });

  test('empêche de s’ajouter soi-même', async () => {
    const { status } = await call('POST', '/api/contacts/request', {
      token: users.alice.token,
      body: { userId: users.alice.id },
    });
    assert.equal(status, 400);
  });
});

describe('Messages', () => {
  let chatId;

  test('envoie un message', async () => {
    const chats = await call('GET', '/api/chats', { token: users.alice.token });
    chatId = chats.data.chats[0].id;

    const { status, data } = await call('POST', `/api/chats/${chatId}/messages`, {
      token: users.alice.token,
      body: { content: 'Bonjour Bob !' },
    });
    assert.equal(status, 200);
    assert.equal(data.message.content, 'Bonjour Bob !');
    assert.equal(data.message.senderId, users.alice.id);
  });

  test('le destinataire voit le message et son compteur de non-lus', async () => {
    const { data } = await call('GET', `/api/chats/${chatId}/messages`, { token: users.bob.token });
    assert.equal(data.messages.length, 1);

    const chats = await call('GET', '/api/chats', { token: users.bob.token });
    assert.equal(chats.data.chats[0].unread, 1);
  });

  test('marque comme lu', async () => {
    await call('POST', `/api/chats/${chatId}/read`, { token: users.bob.token });
    const chats = await call('GET', '/api/chats', { token: users.bob.token });
    assert.equal(chats.data.chats[0].unread, 0);
  });

  test('modifie son propre message', async () => {
    const messages = await call('GET', `/api/chats/${chatId}/messages`, { token: users.alice.token });
    const id = messages.data.messages[0].id;

    const { data } = await call('PATCH', `/api/chats/${chatId}/messages/${id}`, {
      token: users.alice.token,
      body: { content: 'Bonjour Bob ! (corrigé)' },
    });
    assert.equal(data.message.content, 'Bonjour Bob ! (corrigé)');
    assert.equal(data.message.edited, true);
  });

  test('interdit de modifier le message d’autrui', async () => {
    const messages = await call('GET', `/api/chats/${chatId}/messages`, { token: users.bob.token });
    const id = messages.data.messages[0].id;

    const { status } = await call('PATCH', `/api/chats/${chatId}/messages/${id}`, {
      token: users.bob.token,
      body: { content: 'piraté' },
    });
    assert.equal(status, 403);
  });

  test('réagit à un message, une seule réaction par personne', async () => {
    const messages = await call('GET', `/api/chats/${chatId}/messages`, { token: users.bob.token });
    const id = messages.data.messages[0].id;

    await call('POST', `/api/chats/${chatId}/messages/${id}/react`, { token: users.bob.token, body: { emoji: '❤️' } });
    const second = await call('POST', `/api/chats/${chatId}/messages/${id}/react`, { token: users.bob.token, body: { emoji: '😂' } });

    assert.equal(second.data.message.reactions['❤️'], undefined);
    assert.deepEqual(second.data.message.reactions['😂'], [users.bob.id]);
  });

  test('supprime un message pour tout le monde', async () => {
    const messages = await call('GET', `/api/chats/${chatId}/messages`, { token: users.alice.token });
    const id = messages.data.messages[0].id;

    const { data } = await call('DELETE', `/api/chats/${chatId}/messages/${id}`, { token: users.alice.token });
    assert.equal(data.message.deleted, true);
    assert.equal(data.message.content, '');
  });

  test('interdit l’accès à une conversation dont on n’est pas membre', async () => {
    const eve = await createUser('eve', 'eve');
    const { status } = await call('GET', `/api/chats/${chatId}/messages`, { token: eve.token });
    assert.equal(status, 403);
  });

  test('trouve un message par la recherche globale', async () => {
    await call('POST', `/api/chats/${chatId}/messages`, {
      token: users.alice.token,
      body: { content: 'Rendez-vous licorne à 15 h' },
    });
    const { data } = await call('GET', '/api/search?q=licorne', { token: users.bob.token });
    assert.equal(data.messages.length, 1);
    assert.match(data.messages[0].content, /licorne/);
  });
});

describe('Groupes', () => {
  let groupId;

  test('crée un groupe avec un message système', async () => {
    const { status, data } = await call('POST', '/api/chats', {
      token: users.alice.token,
      body: { type: 'group', topic: 'Les copains', memberIds: [users.bob.id] },
    });
    assert.equal(status, 200);
    groupId = data.chat.id;
    assert.equal(data.chat.type, 'group');
    assert.equal(data.chat.members.length, 2);

    const messages = await call('GET', `/api/chats/${groupId}/messages`, { token: users.alice.token });
    assert.equal(messages.data.messages[0].type, 'system');
  });

  test('le créateur est administrateur', async () => {
    const { data } = await call('GET', `/api/chats/${groupId}`, { token: users.alice.token });
    const creator = data.chat.members.find((m) => m.userId === users.alice.id);
    assert.equal(creator.role, 'admin');
  });

  test('ajoute un membre', async () => {
    const { data } = await call('POST', `/api/chats/${groupId}/members`, {
      token: users.alice.token,
      body: { memberIds: [users.eve.id] },
    });
    assert.equal(data.chat.members.length, 3);
  });

  test('un non-administrateur ne peut pas renommer le groupe', async () => {
    const { status } = await call('PATCH', `/api/chats/${groupId}`, {
      token: users.bob.token,
      body: { topic: 'Détourné' },
    });
    assert.equal(status, 403);
  });

  test('un administrateur renomme le groupe', async () => {
    const { data } = await call('PATCH', `/api/chats/${groupId}`, {
      token: users.alice.token,
      body: { topic: 'Les inséparables' },
    });
    assert.equal(data.chat.topic, 'Les inséparables');
  });

  test('rejoint par lien d’invitation', async () => {
    const chat = await call('GET', `/api/chats/${groupId}`, { token: users.alice.token });
    const frank = await createUser('frank', 'frank');

    const { status, data } = await call('POST', `/api/chats/join/${chat.data.chat.joinLink}`, { token: frank.token });
    assert.equal(status, 200);
    assert.ok(data.chat.members.some((m) => m.userId === frank.id));
  });

  test('quitte le groupe', async () => {
    await call('DELETE', `/api/chats/${groupId}/members/${users.frank.id}`, { token: users.frank.token });
    const { data } = await call('GET', `/api/chats/${groupId}`, { token: users.alice.token });
    assert.ok(!data.chat.members.some((m) => m.userId === users.frank.id));
  });

  test('vote à un sondage, un seul choix par personne', async () => {
    const created = await call('POST', `/api/chats/${groupId}/messages`, {
      token: users.alice.token,
      body: {
        type: 'poll',
        content: 'Quel jour ?',
        poll: { question: 'Quel jour ?', multiple: false, closed: false, options: [{ text: 'Lundi', votes: [] }, { text: 'Mardi', votes: [] }] },
      },
    });
    const messageId = created.data.message.id;

    await call('POST', `/api/chats/${groupId}/messages/${messageId}/vote`, { token: users.bob.token, body: { options: [0] } });
    const second = await call('POST', `/api/chats/${groupId}/messages/${messageId}/vote`, { token: users.bob.token, body: { options: [1] } });

    assert.deepEqual(second.data.message.poll.options[0].votes, []);
    assert.deepEqual(second.data.message.poll.options[1].votes, [users.bob.id]);
  });
});

describe('Réglages et profil', () => {
  test('met à jour le profil', async () => {
    const { data } = await call('PATCH', '/api/me', {
      token: users.alice.token,
      body: { displayName: 'Alice Martin', mood: 'De retour sur Skype' },
    });
    assert.equal(data.user.displayName, 'Alice Martin');
    assert.equal(data.user.mood, 'De retour sur Skype');
  });

  test('fusionne les réglages imbriqués sans écraser les voisins', async () => {
    await call('PATCH', '/api/me/settings', { token: users.alice.token, body: { notifications: { sound: false } } });
    const { data } = await call('GET', '/api/auth/me', { token: users.alice.token });

    assert.equal(data.user.settings.notifications.sound, false);
    assert.equal(data.user.settings.notifications.messages, true, 'les autres réglages doivent être préservés');
    assert.equal(data.user.settings.theme, 'light');
  });

  test('masque le profil quand la recherche est désactivée', async () => {
    await call('PATCH', '/api/me/settings', { token: users.eve.token, body: { privacy: { appearInSearch: false } } });
    const { data } = await call('GET', `/api/users/search?q=eve.${suffix}`, { token: users.alice.token });
    assert.equal(data.results.length, 0);
  });

  test('change le mot de passe et invalide l’ancien', async () => {
    const changed = await call('POST', '/api/auth/password', {
      token: users.bob.token,
      body: { current: 'motdepasse123', next: 'nouveaumotdepasse' },
    });
    assert.equal(changed.status, 200);

    const oldLogin = await call('POST', '/api/auth/signin', {
      body: { identifier: `bob.${suffix}`, password: 'motdepasse123' },
    });
    assert.equal(oldLogin.status, 401);

    const newLogin = await call('POST', '/api/auth/signin', {
      body: { identifier: `bob.${suffix}`, password: 'nouveaumotdepasse' },
    });
    assert.equal(newLogin.status, 200);
    users.bob.token = newLogin.data.token;
  });

  test('crédit Skype : recharge et débit d’un appel', async () => {
    const before = await call('GET', '/api/auth/me', { token: users.alice.token });
    const topUp = await call('POST', '/api/credit/topup', { token: users.alice.token, body: { amount: 10 } });
    assert.ok(topUp.data.credit > before.data.user.credit);

    const callResult = await call('POST', '/api/calls/pstn', { token: users.alice.token, body: { number: '+33612345678', minutes: 2 } });
    assert.equal(callResult.status, 200);
    assert.ok(callResult.data.credit < topUp.data.credit);
    assert.equal(callResult.data.call.type, 'pstn');
  });

  test('attribue un numéro Skype', async () => {
    const { data } = await call('POST', '/api/skype-number', { token: users.alice.token, body: { country: 'FR' } });
    assert.match(data.skypeNumber, /^\+33/);
  });
});

describe('Blocage', () => {
  test('bloque puis empêche l’envoi de messages', async () => {
    const chats = await call('GET', '/api/chats', { token: users.bob.token });
    const direct = chats.data.chats.find((c) => c.type === 'direct');

    await call('POST', `/api/contacts/${users.alice.id}/block`, { token: users.bob.token, body: { blocked: true } });

    const blocked = await call('POST', `/api/chats/${direct.id}/messages`, {
      token: users.alice.token,
      body: { content: 'Tu me lis ?' },
    });
    assert.equal(blocked.status, 403);

    await call('POST', `/api/contacts/${users.alice.id}/block`, { token: users.bob.token, body: { blocked: false } });
    const allowed = await call('POST', `/api/chats/${direct.id}/messages`, {
      token: users.alice.token,
      body: { content: 'Et maintenant ?' },
    });
    assert.equal(allowed.status, 200);
  });
});

describe('Temps réel (WebSocket)', () => {
  test('distribue un message aux autres participants', async () => {
    const { WebSocket } = await import('node:worker_threads').then(() => ({ WebSocket: globalThis.WebSocket }));
    assert.ok(WebSocket, 'WebSocket natif requis (Node 22+)');

    const chats = await call('GET', '/api/chats', { token: users.bob.token });
    const direct = chats.data.chats.find((c) => c.type === 'direct');

    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(users.bob.token)}`);
    const received = [];

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
      setTimeout(() => reject(new Error('délai de connexion dépassé')), 3000);
    });

    ws.onmessage = (event) => received.push(JSON.parse(event.data));

    await call('POST', `/api/chats/${direct.id}/messages`, {
      token: users.alice.token,
      body: { content: 'Message temps réel' },
    });

    for (let i = 0; i < 40 && !received.some((m) => m.type === 'message:new'); i++) await sleep(50);

    const event = received.find((m) => m.type === 'message:new');
    assert.ok(event, `aucun message reçu (${JSON.stringify(received.map((r) => r.type))})`);
    assert.equal(event.message.content, 'Message temps réel');
    assert.equal(event.sender.id, users.alice.id);

    ws.close();
  });

  test('refuse une connexion sans jeton valide', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=invalide`);
    const closed = await new Promise((resolve) => {
      ws.onclose = (e) => resolve(e.code);
      setTimeout(() => resolve(0), 3000);
    });
    assert.equal(closed, 4001);
  });
});

describe('Cache des fichiers servis', () => {
  /**
   * Le serveur autorisait le navigateur à garder tout ce qui n'était pas du
   * HTML pendant une heure sans rien demander — donc le JavaScript aussi.
   * Après une mise à jour, l'ancienne version continuait de tourner jusqu'à
   * une heure, parfois mélangée à une page d'accueil déjà nouvelle.
   */
  const entete = async (chemin) => {
    const r = await fetch(BASE + chemin);
    await r.arrayBuffer();
    return { cache: r.headers.get('cache-control'), etag: r.headers.get('etag'), statut: r.status };
  };

  test('le code doit être revalidé à chaque fois', async () => {
    for (const chemin of ['/', '/index.html', '/js/app.js', '/css/base.css', '/manifest.webmanifest']) {
      const { cache, statut } = await entete(chemin);
      assert.equal(statut, 200, chemin);
      assert.equal(cache, 'no-cache', `${chemin} peut être gardé sans revalidation : ${cache}`);
    }
  });

  test('revalider ne coûte rien : un fichier inchangé répond 304 sans contenu', async () => {
    const { etag } = await entete('/js/app.js');
    assert.ok(etag, 'sans ETag, « no-cache » ferait retélécharger le fichier entier');
    const r = await fetch(`${BASE}/js/app.js`, { headers: { 'If-None-Match': etag } });
    assert.equal(r.status, 304);
    assert.equal((await r.text()).length, 0);
  });

  test('les sons et les icônes, eux, restent en cache', async () => {
    const { cache } = await entete('/assets/sounds/skype-message.mp3');
    assert.match(cache, /max-age=\d{4,}/, 'ce qui ne change pas doit rester en cache');
  });

  test('un fichier absent répond 200 : seul le type de contenu le trahit', async () => {
    // Application monopage : toute route inconnue renvoie index.html, y
    // compris « /assets/sounds/inexistant.mp3 ». Deux vérifications qui
    // croyaient contrôler la présence des sons — dans le workflow de
    // publication et dans celui de l'image Docker — ne pouvaient donc rien
    // détecter : elles se contentaient du code 200.
    //
    // Ce test fixe la règle : pour prouver qu'une ressource existe, il faut
    // regarder son type, jamais son code.
    const absent = await fetch(`${BASE}/assets/sounds/ce-son-n-existe-pas.mp3`);
    assert.equal(absent.status, 200, 'le repli monopage est volontaire');
    assert.match(absent.headers.get('content-type'), /text\/html/,
      'un chemin inconnu doit rester reconnaissable à son type');

    const present = await fetch(`${BASE}/assets/sounds/skype-message.mp3`);
    assert.match(present.headers.get('content-type'), /^audio\/mpeg/,
      'un son réellement servi s’annonce comme un son');
  });
});

describe('Fichiers', () => {
  test('téléverse puis télécharge un fichier', async () => {
    const content = 'Bonjour depuis un fichier de test';
    const upload = await fetch(`${BASE}/api/files?name=test.txt&type=text/plain`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${users.alice.token}` },
      body: content,
    });
    assert.equal(upload.status, 200);
    const { file } = await upload.json();
    assert.equal(file.name, 'test.txt');
    assert.equal(file.size, Buffer.byteLength(content));

    const download = await fetch(`${BASE}/api/files/${file.id}`, {
      headers: { Authorization: `Bearer ${users.alice.token}` },
    });
    assert.equal(await download.text(), content);
  });

  test('refuse le téléchargement sans authentification', async () => {
    const response = await fetch(`${BASE}/api/files/inexistant`);
    assert.equal(response.status, 401);
  });
});

describe('Service d’écho (test du micro)', () => {
  test('le contact echo123 est proposé dès l’inscription', async () => {
    const denise = await createUser('denise', 'denise');
    const { data } = await call('GET', '/api/contacts', { token: denise.token });
    const bot = data.contacts.find((c) => c.isBot);
    assert.ok(bot, 'aucun contact marqué isBot après l’inscription');
    assert.equal(bot.skypeName, 'echo123');
  });

  test('sa conversation contient un message d’accueil', async () => {
    const { data: contacts } = await call('GET', '/api/contacts', { token: users.denise.token });
    const bot = contacts.contacts.find((c) => c.isBot);

    const { data: chats } = await call('GET', '/api/chats', { token: users.denise.token });
    const chat = chats.chats.find((c) => c.members.some((m) => m.userId === bot.id));
    assert.ok(chat, 'aucune conversation avec le service d’écho');

    const { data: messages } = await call('GET', `/api/chats/${chat.id}/messages`, { token: users.denise.token });
    assert.equal(messages.messages.length, 1);
    assert.equal(messages.messages[0].senderId, bot.id);
    assert.match(messages.messages[0].content, /tester votre micro/i);
  });

  test('le pseudo echo123 ne peut pas être pris à l’inscription', async () => {
    const { status, data } = await call('POST', '/api/auth/signup', {
      body: { skypeName: 'echo123', displayName: 'Imposteur', password: 'motdepasse123' },
    });
    assert.equal(status, 409, JSON.stringify(data));
  });

  test('le service d’écho ne peut pas se connecter (il n’a pas de mot de passe)', async () => {
    const { status } = await call('POST', '/api/auth/signin', {
      body: { identifier: 'echo123', password: '' },
    });
    assert.equal(status, 401);
  });
});

describe('Serveur statique', () => {
  test('sert l’application', async () => {
    const response = await fetch(BASE + '/');
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<title>Skype<\/title>/);
  });

  test('sert la page publicitaire', async () => {
    const response = await fetch(BASE + '/pub');
    assert.equal(response.status, 200);
  });

  test('bloque la traversée de répertoire', async () => {
    const response = await fetch(`${BASE}/../server/store.js`);
    const text = await response.text();
    assert.ok(!text.includes('hashPassword'), 'le code serveur ne doit jamais être servi');
  });
});
