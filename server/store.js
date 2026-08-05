/**
 * Persistance JSON simple, atomique, sans dépendance.
 * Les écritures sont regroupées (debounce) pour éviter de saturer le disque.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Surchageable : une application de bureau empaquetée (voir desktop/) ne peut
// pas écrire à côté de son propre exécutable (droits refusés sous
// « Program Files »), et doit ranger les données dans le dossier utilisateur.
// L'ancienne variable reste acceptée : un serveur déjà installé la définit
// dans son unité systemd ou sa composition Docker, et cesserait brutalement de
// trouver ses données le jour de la mise à jour — sans message d'erreur, il
// repartirait simplement sur une base vide.
export const DATA_DIR = process.env.SKIP_DATA_DIR
  || process.env.SKYPE_DATA_DIR
  || path.join(__dirname, '..', 'data');
export const FILES_DIR = path.join(DATA_DIR, 'files');
const DB_PATH = path.join(DATA_DIR, 'skip.json');
const ANCIEN_DB_PATH = path.join(DATA_DIR, 'skype.json');

const EMPTY_DB = {
  version: 1,
  users: {},
  chats: {},
  messages: {},        // chatId -> [message]
  contactRequests: {},
  calls: {},           // historique
  sessions: {},        // token -> { userId, createdAt, agent }
  files: {},           // fileId -> métadonnées
};

function ensureDirs() {
  fs.mkdirSync(FILES_DIR, { recursive: true });
}

/**
 * Le fichier de données a changé de nom en même temps que le projet.
 *
 * Sans cette reprise, la mise à jour serait une perte totale et silencieuse :
 * le serveur ne trouverait pas « skip.json », en conclurait qu'il démarre pour
 * la première fois, et créerait une base vide à côté de l'ancienne. Comptes,
 * conversations et contacts seraient toujours sur le disque, mais plus
 * personne ne pourrait se connecter — et rien dans le journal ne dirait
 * pourquoi.
 *
 * On renomme plutôt que copier : deux fichiers vivants finiraient par
 * diverger, et l'on ne saurait plus lequel fait foi.
 */
function reprendreAncienneBase() {
  if (fs.existsSync(DB_PATH) || !fs.existsSync(ANCIEN_DB_PATH)) return;
  try {
    fs.renameSync(ANCIEN_DB_PATH, DB_PATH);
    console.log('Base de données reprise de skype.json vers skip.json.');
  } catch (err) {
    // Un disque en lecture seule ne doit pas empêcher le serveur de démarrer,
    // mais le silence serait pire que l'échec.
    console.error('[store] reprise de l’ancienne base impossible :', err.message);
  }
}

function load() {
  ensureDirs();
  reprendreAncienneBase();
  if (!fs.existsSync(DB_PATH)) return structuredClone(EMPTY_DB);
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    return { ...structuredClone(EMPTY_DB), ...parsed };
  } catch (err) {
    // Base corrompue : on la met de côté plutôt que de la perdre.
    const backup = `${DB_PATH}.corrupt-${Date.now()}`;
    fs.renameSync(DB_PATH, backup);
    console.error(`[store] Base illisible (${err.message}). Sauvegardée dans ${backup}.`);
    return structuredClone(EMPTY_DB);
  }
}

export const db = load();

let writeTimer = null;
let writing = false;
let pending = false;

function writeNow() {
  if (writing) {
    pending = true;
    return;
  }
  writing = true;
  const tmp = `${DB_PATH}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DB_PATH); // rename = atomique sur le même système de fichiers
  } catch (err) {
    console.error('[store] Échec de sauvegarde :', err.message);
  } finally {
    writing = false;
    if (pending) {
      pending = false;
      writeNow();
    }
  }
}

export function save() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    writeNow();
  }, 150);
  writeTimer.unref?.();
}

export function saveSync() {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  writeNow();
}

// ── Utilitaires ───────────────────────────────────────────────────────────────

export const id = (prefix = '') => prefix + crypto.randomBytes(9).toString('base64url');
export const token = () => crypto.randomBytes(32).toString('base64url');

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, hash, salt) {
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

// Sauvegarde garantie même en cas d'arrêt brutal.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    saveSync();
    process.exit(0);
  });
}
process.on('exit', () => {
  try {
    saveSync();
  } catch {
    /* rien à faire pendant l'arrêt */
  }
});
