/**
 * Service d'écho (test du micro) : appeler « echo123 » ne doit jamais
 * déclencher la signalisation WebRTC réelle — personne ne répond à l'autre
 * bout, tout se joue en local — et ne doit jamais interférer avec un appel
 * vers un vrai contact. Ce test lit le code source.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const lire = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const appels = lire('public/js/ui/calls.js');
const modeles = lire('server/models.js');
const api = lire('server/api.js');
const seed = lire('server/seed.js');

/** Isole le corps de la fonction startEchoTest, entre sa déclaration et la suivante. */
function corpsEchoTest() {
  const debut = appels.indexOf('function startEchoTest(chat) {');
  assert.ok(debut >= 0, 'startEchoTest introuvable');
  const fin = appels.indexOf('\n// ── Session d’appel', debut);
  const finReelle = fin >= 0 ? fin : appels.indexOf("\n// ── Session d'appel", debut);
  assert.ok(finReelle > debut, 'fin de startEchoTest introuvable');
  return appels.slice(debut, finReelle);
}

describe('Aiguillage de l’appel', () => {
  test('appeler le bot ne rejoint jamais un appel existant, ne démarre jamais un appel réel', () => {
    assert.match(appels, /if \(!join && otherMember\(chat\)\?\.isBot\) \{\s*\n\s*return startEchoTest\(chat\);\s*\n\s*\}/,
      'la détection doit précéder l’acquisition du micro et le départ vers un vrai pair');
  });

  test('la détection se fait sur otherMember(chat), pas sur un nom ou un pseudo en dur côté client', () => {
    // Le pseudo « echo123 » n'est connu que du serveur (models.js) : le client
    // se fie uniquement au drapeau isBot renvoyé par l'API.
    assert.doesNotMatch(corpsEchoTest(), /echo123/,
      'le client ne doit pas coder en dur le pseudo du bot : tout passe par isBot');
  });
});

describe('La session d’écho ne parle jamais au serveur d’appel', () => {
  const corps = corpsEchoTest();

  test('aucun message socket.send n’est envoyé', () => {
    assert.doesNotMatch(corps, /socket\.send/,
      'un appel au bot ne doit déclencher aucune signalisation WebRTC (personne ne répond à l’autre bout)');
  });

  test('aucune RTCPeerConnection n’est créée', () => {
    assert.doesNotMatch(corps, /RTCPeerConnection/);
  });

  test('le message d’accueil est synthétisé localement, avec le texte exact demandé', () => {
    assert.match(corps, /SpeechSynthesisUtterance/);
    assert.match(corps,
      /Bienvenue au service de test d’appel Skip\. Après le bip, parlez, votre message sera enregistré puis rejoué\./,
      'le texte doit correspondre mot pour mot à ce qui a été demandé');
  });

  test('le bip retentit après le message, puis l’enregistrement démarre', () => {
    const iBeep = corps.indexOf('sounds.beep()');
    // On cherche l'appel « demarrerEnregistrement(); », pas sa déclaration
    // « function demarrerEnregistrement() { », qui apparaît plus tôt dans le fichier.
    const iEnr = corps.indexOf('demarrerEnregistrement();');
    assert.ok(iBeep > 0 && iEnr > iBeep, 'le bip doit précéder le début de l’enregistrement');
  });

  test('un MediaRecorder qui refuse de démarrer ne fait pas planter l’appel', () => {
    // start() peut lever une exception au même titre que le constructeur
    // (état invalide, périphérique repris entre deux appels) : les deux
    // doivent être couverts par le même filet, sans quoi une erreur non
    // interceptée remonte jusqu'au gestionnaire de clic.
    assert.match(corps,
      /try \{\s*\n\s*recorder = new MediaRecorder\(stream\.current[\s\S]*?recorder\.start\(\);\s*\n\s*\} catch \{/,
      'la construction ET le démarrage doivent être dans le même bloc try');
  });

  test('l’enregistrement est borné dans le temps, puis relu automatiquement', () => {
    // La constante de durée est déclarée juste avant la fonction : hors du
    // corps isolé par corpsEchoTest(), on la cherche dans le fichier entier.
    assert.match(appels, /const ECHO_DUREE_ENREGISTREMENT = 10;/);
    assert.match(corps, /recorder\.onstop = rejouer;/);
    assert.match(corps, /new MediaRecorder\(stream\.current/);
  });

  test('la relecture est un vrai réenregistrement de ce qui a été capté, pas un rebouclage en direct', () => {
    // Ancien comportement (retiré) : un graphe Web Audio en direct via DelayNode.
    assert.doesNotMatch(corps, /createDelay/, 'la voix ne doit plus être renvoyée en direct : elle est enregistrée puis relue');
    assert.match(corps, /new Blob\(morceaux/);
    assert.match(corps, /new Audio\(urlLecture\)/);
  });

  test('couper le micro désactive réellement la piste audio locale', () => {
    assert.match(corps, /stream\.current\?\.getAudioTracks\(\)\.forEach\(\(t\) => \(t\.enabled = !muted\)\)/);
  });

  test('raccrocher en cours d’enregistrement n’en déclenche pas la relecture', () => {
    assert.match(corps, /recorder\.onstop = null;/,
      'hangup() doit retirer le gestionnaire avant d’arrêter l’enregistreur, sinon il rejoue après avoir raccroché');
  });

  test('raccrocher libère le micro, arrête toute lecture en cours, et vide la session', () => {
    assert.match(corps, /stream\.current\?\.getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/);
    assert.match(corps, /lecture\.pause\(\)/);
    assert.match(corps, /URL\.revokeObjectURL\(urlLecture\)/);
    assert.match(corps, /session = null;/);
  });

  test('le service d’écho utilise le même son de connexion que les vrais appels', () => {
    assert.match(corps, /sounds\.callConnect\(\);/);
  });
});

describe('Le service d’écho ne peut pas être usurpé', () => {
  test('authenticate() refuse toute tentative de connexion en tant que bot', () => {
    assert.match(modeles, /if \(!user \|\| user\.isBot \|\| !verifyPassword/,
      'un utilisateur isBot ne doit jamais pouvoir passer verifyPassword avec un mot de passe nul');
  });

  test('l’identifiant du bot est fixe, pas généré à chaque démarrage', () => {
    assert.match(modeles, /export const ECHO_BOT_ID = 'bot_echo123';/);
  });

  test('publicUser expose isBot : c’est le seul signal que le client doit lire', () => {
    assert.match(modeles, /isBot: !!user\.isBot,/);
  });
});

describe('Disponibilité du contact', () => {
  test('l’inscription connecte le nouveau compte au service d’écho', () => {
    assert.match(api, /M\.connectToEchoBot\(user\);/);
  });

  test('les comptes de démonstration ont aussi le bot dans leurs contacts', () => {
    assert.match(seed, /for \(const user of all\) M\.connectToEchoBot\(user\);/);
  });
});
