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

  test('le message d’accueil est synthétisé localement (SpeechSynthesisUtterance)', () => {
    assert.match(corps, /SpeechSynthesisUtterance/);
    assert.match(corps, /écho/i, 'le message doit se présenter comme le service d’écho');
  });

  test('le bip retentit après le message, puis le rebouclage démarre', () => {
    const iBeep = corps.indexOf('sounds.beep()');
    // On cherche l'appel « demarrerBoucle(); », pas sa déclaration
    // « function demarrerBoucle() { », qui apparaît plus tôt dans le fichier.
    const iBoucle = corps.indexOf('demarrerBoucle();');
    assert.ok(iBeep > 0 && iBoucle > iBeep, 'le bip doit précéder le début du rebouclage');
  });

  test('le rebouclage passe par un DelayNode : ce n’est pas un simple monitoring', () => {
    assert.match(corps, /createDelay/, 'sans délai, on ne distingue pas sa propre voix de l’écho');
  });

  test('couper le micro désactive réellement la piste audio locale', () => {
    assert.match(corps, /stream\.current\?\.getAudioTracks\(\)\.forEach\(\(t\) => \(t\.enabled = !muted\)\)/);
  });

  test('raccrocher libère le micro, ferme le contexte audio, et vide la session', () => {
    assert.match(corps, /stream\.current\?\.getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/);
    assert.match(corps, /audioCtx\?\.close\(\)/);
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
