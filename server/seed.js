/**
 * Comptes et conversations de démonstration.
 *   npm run seed            (ne fait rien si la base contient déjà des comptes)
 *   npm run reset           (remet la base à zéro)
 */
import fs from 'node:fs';
import path from 'node:path';
import { db, save, saveSync, DATA_DIR } from './store.js';
import * as M from './models.js';

const force = process.argv.includes('--force');

if (Object.keys(db.users).length && !force) {
  console.log('La base contient déjà des comptes. Utilisez « npm run reset » pour tout recréer.');
  process.exit(0);
}

if (force) {
  for (const key of ['users', 'chats', 'messages', 'contactRequests', 'calls', 'sessions', 'files']) db[key] = {};
  const filesDir = path.join(DATA_DIR, 'files');
  if (fs.existsSync(filesDir)) {
    for (const file of fs.readdirSync(filesDir)) fs.rmSync(path.join(filesDir, file), { force: true });
  }
}

const avatar = (initials, color) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="${color}"/><text x="48" y="62" font-family="Segoe UI,Helvetica,Arial" font-size="38" font-weight="600" fill="#fff" text-anchor="middle">${initials}</text></svg>`
  );

const PEOPLE = [
  { skypeName: 'camille.durand', displayName: 'Camille Durand', mood: 'De retour sur Skype 💙', color: '#00AFF0', city: 'Lyon', country: 'France' },
  { skypeName: 'thomas.leroy', displayName: 'Thomas Leroy', mood: 'En télétravail', color: '#7B68EE', city: 'Nantes', country: 'France' },
  { skypeName: 'aicha.benali', displayName: 'Aïcha Benali', mood: 'Dispo pour un appel', color: '#FF6B6B', city: 'Marseille', country: 'France' },
  { skypeName: 'lucas.martin', displayName: 'Lucas Martin', mood: '🎧 Musique', color: '#20C997', city: 'Bruxelles', country: 'Belgique' },
  { skypeName: 'mamie.jeanne', displayName: 'Mamie Jeanne', mood: 'Appelez-moi le dimanche !', color: '#F59E0B', city: 'Quimper', country: 'France' },
  { skypeName: 'sofia.rossi', displayName: 'Sofia Rossi', mood: 'Ciao !', color: '#EC4899', city: 'Milan', country: 'Italie' },
];

console.log('Création des comptes de démonstration…');

const users = {};
for (const person of PEOPLE) {
  const initials = person.displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const user = M.createUser({
    skypeName: person.skypeName,
    displayName: person.displayName,
    password: 'skype123',
    email: `${person.skypeName}@example.com`,
    avatar: avatar(initials, person.color),
  });
  user.mood = person.mood;
  user.city = person.city;
  user.country = person.country;
  users[person.skypeName] = user;
}

// Tout le monde se connaît.
const all = Object.values(users);
for (const a of all) {
  for (const b of all) {
    if (a.id !== b.id && !a.contacts.includes(b.id)) a.contacts.push(b.id);
  }
}
users['camille.durand'].favorites = [users['mamie.jeanne'].id, users['thomas.leroy'].id];

// ── Conversations ─────────────────────────────────────────────────────────────

const ago = (minutes) => Date.now() - minutes * 60000;

function seedChat(chat, entries) {
  for (const [senderName, content, minutesAgo, extra = {}] of entries) {
    const message = M.addMessage(chat.id, users[senderName].id, { content, ...extra });
    message.createdAt = ago(minutesAgo);
    message.readBy = Object.fromEntries(chat.members.map((m) => [m.userId, message.createdAt]));
    Object.assign(message, extra.override || {});
  }
  const messages = db.messages[chat.id];
  messages.sort((a, b) => a.createdAt - b.createdAt);
  chat.lastMessageAt = messages.at(-1)?.createdAt || chat.createdAt;
}

const chatMamie = M.getOrCreateDirectChat(users['camille.durand'].id, users['mamie.jeanne'].id);
seedChat(chatMamie, [
  ['mamie.jeanne', 'Bonjour ma puce, tu es là ?', 240],
  ['camille.durand', 'Coucou Mamie ! Oui je suis là 😊', 236],
  ['mamie.jeanne', 'On s’appelle en vidéo dimanche comme d’habitude ?', 234],
  ['camille.durand', 'Avec plaisir ! 15 h ça te va ?', 230],
  ['mamie.jeanne', 'Parfait (y)', 228],
  ['mamie.jeanne', 'Je suis tellement contente que Skype soit revenu, je n’ai jamais rien compris à l’autre truc là…', 12],
]);

const chatThomas = M.getOrCreateDirectChat(users['camille.durand'].id, users['thomas.leroy'].id);
seedChat(chatThomas, [
  ['thomas.leroy', 'Salut ! Tu as vu le nouveau Skype ?', 180],
  ['camille.durand', 'Oui !! Le vrai, avec les émoticônes animées et tout 🎉', 178],
  ['thomas.leroy', 'Le partage d’écran marche nickel aussi', 176],
  ['camille.durand', 'On teste un appel tout à l’heure ?', 60],
  ['thomas.leroy', 'Ça marche, je te rappelle après ma réunion', 55],
]);

const chatAicha = M.getOrCreateDirectChat(users['camille.durand'].id, users['aicha.benali'].id);
seedChat(chatAicha, [
  ['aicha.benali', 'Coucou ! Dispo pour un call rapide ?', 90],
  ['camille.durand', 'Donne-moi 10 min', 88],
  ['aicha.benali', '👍', 87],
]);

const groupe = M.createGroupChat(users['camille.durand'], {
  topic: 'Les inséparables 💙',
  memberIds: [users['thomas.leroy'].id, users['aicha.benali'].id, users['lucas.martin'].id, users['sofia.rossi'].id],
});
// Le message « groupe créé » doit précéder les conversations qu'on antidate.
groupe.createdAt = ago(320);
db.messages[groupe.id][0].createdAt = groupe.createdAt;
seedChat(groupe, [
  ['lucas.martin', 'Bon, qui est chaud pour un apéro Skype vendredi ?', 300],
  ['sofia.rossi', 'Moi !! 🍾', 298],
  ['aicha.benali', 'Présente 🙌', 295],
  ['thomas.leroy', 'Je ramène la playlist (music)', 290],
  ['camille.durand', 'Je crée un sondage pour l’heure', 285],
]);

const sondage = M.addMessage(groupe.id, users['camille.durand'].id, {
  type: 'poll',
  content: 'À quelle heure vendredi ?',
  poll: {
    question: 'À quelle heure vendredi ?',
    multiple: false,
    closed: false,
    options: [
      { text: '18 h 30', votes: [users['thomas.leroy'].id, users['sofia.rossi'].id] },
      { text: '19 h 30', votes: [users['camille.durand'].id, users['aicha.benali'].id, users['lucas.martin'].id] },
      { text: '21 h', votes: [] },
    ],
  },
});
sondage.createdAt = ago(284);

const derniers = M.addMessage(groupe.id, users['lucas.martin'].id, { content: '19 h 30 gagne 🎉 À vendredi !' });
derniers.createdAt = ago(30);
groupe.lastMessageAt = derniers.createdAt;

// Un appel dans l'historique.
M.recordCall({
  chatId: chatThomas.id,
  initiatorId: users['thomas.leroy'].id,
  type: 'video',
  participants: [users['thomas.leroy'].id, users['camille.durand'].id],
  status: 'completed',
  startedAt: ago(400),
  endedAt: ago(378),
});
M.recordCall({
  chatId: chatAicha.id,
  initiatorId: users['aicha.benali'].id,
  type: 'audio',
  participants: [users['aicha.benali'].id, users['camille.durand'].id],
  status: 'missed',
  startedAt: ago(120),
  endedAt: ago(120),
});

// Une demande de contact en attente pour montrer le flux.
const demandeur = M.createUser({
  skypeName: 'julien.petit',
  displayName: 'Julien Petit',
  password: 'skype123',
  email: 'julien.petit@example.com',
  avatar: avatar('JP', '#0EA5E9'),
});
M.sendContactRequest(demandeur, users['camille.durand'].id, 'Salut Camille, c’est Julien du club de tennis 🎾');

for (const user of Object.values(db.users)) user.status = 'offline';
saveSync();

console.log(`
✔ ${Object.keys(db.users).length} comptes créés, ${Object.keys(db.chats).length} conversations.

  Connectez-vous avec l'un de ces comptes (mot de passe : skype123) :

    camille.durand   ·  Camille Durand   (le compte principal de la démo)
    thomas.leroy     ·  Thomas Leroy
    aicha.benali     ·  Aïcha Benali
    lucas.martin     ·  Lucas Martin
    mamie.jeanne     ·  Mamie Jeanne
    sofia.rossi      ·  Sofia Rossi

  Astuce : ouvrez deux navigateurs (ou une fenêtre privée) avec deux comptes
  différents pour tester les appels, la vidéo et le partage d'écran en vrai.
`);
