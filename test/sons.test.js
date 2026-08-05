/**
 * Vérifie que chaque son est branché sur le bon événement, et sur celui-là
 * seulement. Ce test lit le code source : il échoue dès qu'un son est ajouté,
 * déplacé ou utilisé à un endroit qui n'est pas décrit dans la bibliothèque.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const lire = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const sons = lire('public/js/lib/sounds.js');
const app = lire('public/js/app.js');
const appels = lire('public/js/ui/calls.js');
const compose = lire('public/js/ui/composer.js');

/** Extrait les clés de BIBLIOTHEQUE et leurs métadonnées déclarées. */
function bibliotheque() {
  const bloc = sons.slice(sons.indexOf('export const BIBLIOTHEQUE'), sons.indexOf('const CHEMIN'));
  const entrees = {};
  for (const m of bloc.matchAll(/^ {2}(\w+): \{([\s\S]*?)^ {2}\},$/gm)) {
    const [, cle, corps] = m;
    entrees[cle] = {
      file: corps.match(/file: '([^']+)'/)?.[1],
      source: corps.match(/source: '([^']+)'/)?.[1],
      usage: corps.match(/usage: '([^']+)/)?.[1],
      label: corps.match(/label: '([^']+)'/)?.[1],
      orphelin: /orphelin: true/.test(corps),
      loop: /loop: true/.test(corps),
    };
  }
  return entrees;
}

const LIB = bibliotheque();

describe('Bibliothèque de sons', () => {
  test('les vingt-et-un sons sont déclarés', () => {
    assert.equal(Object.keys(LIB).length, 21, `clés : ${Object.keys(LIB).join(', ')}`);
  });

  test('deux sons ne portent jamais le même libellé', () => {
    const libelles = Object.values(LIB).map((e) => e.label);
    assert.equal(new Set(libelles).size, libelles.length,
      'un libellé en double rendrait la bibliothèque des réglages ambiguë');
  });

  test('chaque son déclare son fichier, sa provenance et son usage', () => {
    for (const [cle, entree] of Object.entries(LIB)) {
      assert.ok(entree.file, `${cle} : « file » manquant`);
      assert.ok(entree.source, `${cle} : « source » manquant — la provenance doit rester auditable`);
      assert.ok(entree.usage, `${cle} : « usage » manquant — l'événement doit être décrit`);
    }
  });

  test('chaque fichier déclaré existe réellement sur le disque', () => {
    for (const [cle, entree] of Object.entries(LIB)) {
      const chemin = path.join(ROOT, 'public/assets/sounds', entree.file);
      assert.ok(fs.existsSync(chemin), `${cle} : fichier absent (${entree.file})`);
      assert.ok(fs.statSync(chemin).size > 1000, `${cle} : fichier suspect (trop petit)`);
    }
  });

  test('aucun fichier audio n’est déclaré deux fois', () => {
    const fichiers = Object.values(LIB).map((e) => e.file);
    assert.equal(new Set(fichiers).size, fichiers.length, 'un même fichier sert à deux événements');
  });

  test('deux sons n’ont jamais le même contenu audio', () => {
    // Des noms différents ne suffisent pas : un même enregistrement livré deux
    // fois sous deux noms brancherait le même son sur deux événements. On
    // compare donc les empreintes du contenu, pas les noms.
    const parEmpreinte = new Map();
    for (const [cle, entree] of Object.entries(LIB)) {
      const octets = fs.readFileSync(path.join(ROOT, 'public/assets/sounds', entree.file));
      const empreinte = crypto.createHash('md5').update(octets).digest('hex');
      if (parEmpreinte.has(empreinte)) {
        const jumeau = parEmpreinte.get(empreinte);
        assert.fail(
          `« ${cle} » (${entree.file}, ${entree.source}) est le même enregistrement `
          + `que « ${jumeau.cle} » (${jumeau.file}, ${jumeau.source}) — empreinte ${empreinte}`
        );
      }
      parEmpreinte.set(empreinte, { cle, file: entree.file, source: entree.source });
    }
    assert.equal(parEmpreinte.size, Object.keys(LIB).length);
  });

  test('deux entrées ne réclament jamais le même fichier d’origine', () => {
    const sources = Object.values(LIB).map((e) => e.source);
    assert.equal(new Set(sources).size, sources.length,
      'un même fichier d’origine ne peut pas servir deux événements');
  });

  test('tout fichier présent sur le disque est déclaré', () => {
    const surDisque = fs.readdirSync(path.join(ROOT, 'public/assets/sounds')).filter((f) => f.endsWith('.mp3'));
    const declares = new Set(Object.values(LIB).map((e) => e.file));
    for (const f of surDisque) {
      assert.ok(declares.has(f), `${f} est sur le disque mais absent de la bibliothèque`);
    }
  });
});

describe('Correspondance son ↔ événement', () => {
  test('le son de connexion ne sert QU’à la connexion', () => {
    const points = [...`${app}${appels}${compose}`.matchAll(/sounds\.login\(\)/g)];
    assert.equal(points.length, 1, `sounds.login() appelé ${points.length} fois, attendu 1`);

    // Et cet unique appel est bien conditionné à une connexion fraîche.
    assert.match(app, /if \(connexionFraiche\) sounds\.login\(\);/,
      'le son de connexion doit être conditionné à une connexion réelle');
    assert.match(app, /const connexionFraiche = !session;/,
      'une session restaurée ne doit pas compter comme une connexion');
  });

  test('la sonnerie ne retentit que pour un appel entrant hors communication', () => {
    assert.match(appels, /if \(session\) sounds\.callWaiting\(\);\s*\n\s*else sounds\.startRinging\(\);/,
      'un appel entrant pendant une communication doit jouer callWaiting, pas la sonnerie');
  });

  test('la sonnerie est celle choisie dans les réglages, audio comme vidéo', () => {
    // Skip ne distingue pas la sonnerie d'un appel audio de celle d'un appel
    // vidéo : les quatre sonneries sont interchangeables et au choix.
    assert.match(sons, /export function startRinging\(\) \{[\s\S]*?ringHandle = sound\(ringtone, \{ loop: true \}\);/,
      'la sonnerie ne doit pas dépendre du type d’appel');
    assert.doesNotMatch(sons, /ringVideo/, 'plus de sonnerie propre à la vidéo');
    assert.match(sons, /export const SONNERIES = \['ring', 'ringLong', 'ringAlt', 'ringAlt2', 'ringAlt3'\];/);
  });

  test('le raccrochage et la mise en attente sont deux sons distincts', () => {
    assert.match(sons, /export const callEnd = \(\) => sound\('callEnd'\);/);
    assert.match(sons, /export const callHold = \(\) => sound\('callHold'\);/);
    assert.notEqual(LIB.callEnd?.file, LIB.callHold?.file);

    // Le raccrochage ne sonne qu'à la fin d'une communication réellement établie.
    assert.match(appels, /if \(startedAt\) sounds\.callEnd\(\);/,
      'un appel jamais établi ne doit pas jouer le son de raccrochage');
  });

  test('la mise en attente sonne des deux côtés, et nulle part ailleurs', () => {
    const points = [...appels.matchAll(/sounds\.callHold\(\)/g)];
    assert.equal(points.length, 2, 'attendu : mise en attente locale + celle du correspondant');
    assert.match(appels, /if \(peerState\.hold !== undefined && peerState\.hold !== peer\.state\.hold\) sounds\.callHold\(\);/,
      'le son ne doit se déclencher que sur un vrai changement d’état');
  });

  test('envoi de fichier et échec d’envoi sont deux sons distincts', () => {
    assert.notEqual(LIB.fileSent?.file, LIB.fileSendFailed?.file);
    assert.equal([...compose.matchAll(/sounds\.fileSent\(\)/g)].length, 3,
      'attendu : pièce jointe, carte de contact, GIF');
    assert.equal([...compose.matchAll(/sounds\.fileSendFailed\(\)/g)].length, 1,
      'attendu : échec du téléversement');
  });

  test('le son de début d’appel ne sert qu’à l’établissement de la communication', () => {
    assert.match(sons, /export const callConnect = \(\) => sound\('callStart'\);/);
    const points = [...appels.matchAll(/sounds\.callConnect\(\)/g)];
    // Répondre à un appel entrant, un pair WebRTC qui se connecte, le service
    // d'écho qui « décroche », et un appel téléphonique simulé qui aboutit.
    assert.equal(points.length, 4, `callConnect appelé ${points.length} fois`);
  });

  test('un message vocal reçu a son propre son, distinct du fichier ordinaire', () => {
    assert.match(app, /const estVocal = message\.attachments\?\.some\(\(a\) => a\.mime\?\.startsWith\('audio\/'\)\);/);
    assert.match(app, /else if \(estVocal\) sounds\.voiceMessage\(\);/);
    assert.equal(LIB.voiceMessage?.source, 'Skypeforwindowsnew.mp3');
    assert.notEqual(LIB.voiceMessage?.file, LIB.fileReceived?.file);

    const points = [...app.matchAll(/sounds\.voiceMessage\(\)/g)];
    assert.equal(points.length, 1, 'le son de message vocal ne doit servir qu’à la réception d’un vocal');
  });

  test('la messagerie vocale et le message vocal sont deux sons différents', () => {
    assert.equal(LIB.voicemail?.source, 'Skypevoicemail.mp3');
    assert.notEqual(LIB.voicemail?.file, LIB.voiceMessage?.file);
    assert.match(sons, /export const voicemail = \(\) => sound\('voicemail'\);/);
    assert.match(sons, /export const voiceMessage = \(\) => sound\('voiceMessage'\);/);

    // Le son de messagerie vocale est réservé aux messages marqués comme tels,
    // et il est testé AVANT le message vocal ordinaire : une messagerie vocale
    // porte elle aussi une pièce jointe audio.
    assert.match(app, /else if \(message\.voicemail\) sounds\.voicemail\(\);\s*\n\s*else if \(estVocal\) sounds\.voiceMessage\(\);/,
      'la messagerie vocale doit être reconnue avant le message vocal ordinaire');
    assert.equal([...app.matchAll(/sounds\.voicemail\(\)/g)].length, 1);
  });

  test('la messagerie vocale n’est proposée qu’après un appel sortant sans réponse', () => {
    assert.match(appels, /if \(!aboutit && sortant && \['missed', 'declined'\]\.includes\(reason\)\) \{\s*\n\s*proposerMessagerieVocale\(chat\);/,
      'ni un appel abouti, ni un appel entrant ne doivent proposer le répondeur');
    assert.match(appels, /voicemail: true,/, 'le message déposé doit être marqué comme messagerie vocale');
  });

  test('les sonneries au choix sont bien des sons en boucle', () => {
    const proposees = sons.match(/export const SONNERIES = \[([^\]]+)\]/)[1]
      .split(',').map((s) => s.trim().replace(/'/g, ''));
    assert.equal(proposees.length, 5);
    for (const cle of proposees) {
      assert.ok(LIB[cle]?.loop, `${cle} doit être déclaré en boucle`);
      assert.match(LIB[cle].usage, /^Appel entrant/, `${cle} doit servir à un appel entrant`);
    }
  });

  test('la tonalité d’appel ne sert qu’aux appels sortants', () => {
    const points = [...appels.matchAll(/sounds\.startDialing\(\)/g)];
    assert.equal(points.length, 2, 'attendu : appel Skip sortant + appel téléphonique sortant');
  });

  test('le son « fichier reçu » ne sert qu’aux messages avec pièce jointe', () => {
    assert.match(app, /else if \(message\.attachments\?\.length\) sounds\.fileReceived\(\);/);
    const points = [...app.matchAll(/sounds\.fileReceived\(\)/g)];
    assert.equal(points.length, 1);
  });

  test('le son « fichier envoyé » ne sert qu’aux envois depuis le composeur', () => {
    assert.match(compose, /if \(pending\.length\) sounds\.fileSent\(\);\s*\n\s*else sounds\.messageOut\(\);/,
      'un message texte ne doit pas jouer le son de fichier envoyé');

    for (const source of [app, appels]) {
      assert.equal([...source.matchAll(/sounds\.(fileSent|contactSent|fileSendFailed)\(\)/g)].length, 0,
        'les sons d’envoi ne doivent servir que dans le composeur');
    }
  });

  test('envoi et réception de fichier utilisent deux sons différents', () => {
    const envoye = LIB.fileSent?.file;
    const recu = LIB.fileReceived?.file;
    assert.ok(envoye && recu, 'les deux entrées doivent exister');
    assert.notEqual(envoye, recu);
  });

  test('le son « message » ne sert qu’aux messages sans pièce jointe', () => {
    assert.match(app, /else sounds\.messageIn\(\);/);
  });

  test('« appel non abouti » ne sonne que si l’appel n’a jamais démarré', () => {
    assert.match(appels, /if \(!aboutit && \['missed', 'declined', 'cancelled'\]\.includes\(reason\)\) sounds\.callNotConnected\(\);/);
  });

  test('« échec d’appel » ne sonne que sur périphérique inaccessible', () => {
    const points = [...appels.matchAll(/sounds\.callFailed\(\)/g)];
    assert.equal(points.length, 1);
  });
});

describe('Documentation de la correspondance', () => {
  const doc = lire('docs/SONS.md');

  test('chaque son intégré est documenté avec sa provenance', () => {
    for (const [cle, entree] of Object.entries(LIB)) {
      assert.ok(doc.includes(`\`${entree.source}\``),
        `${cle} : ${entree.source} absent de docs/SONS.md`);
    }
  });

  test('le document ne décrit aucun fichier qui n’existe pas', () => {
    const sources = new Set(Object.values(LIB).map((e) => e.source));
    const cites = [...doc.matchAll(/`([\w.]+\.mp3)`/g)].map((m) => m[1]);
    for (const f of cites) {
      assert.ok(sources.has(f), `${f} est documenté mais n'est plus dans la bibliothèque`);
    }
  });

  test('le décompte annoncé correspond à la bibliothèque', () => {
    assert.match(doc, new RegExp(`## Les ${Object.keys(LIB).length} sons attribués`),
      'le titre de la table doit annoncer le nombre réel de sons');
  });

  test('un emplacement libre n’est branché sur aucun fichier', () => {
    // Les événements listés comme « encore vides » doivent rester synthétisés.
    for (const nom of ['messageOut', 'mention', 'error']) {
      assert.match(sons, new RegExp(`export const ${nom} = \\(\\) =>\\s*\\n?\\s*play\\(`),
        `${nom} est annoncé comme emplacement libre : il doit rester synthétisé`);
    }
  });
});

describe('Message, notification et déconnexion', () => {
  test('le message reçu et la notification sont deux sons distincts', () => {
    assert.equal(LIB.message?.source, 'Skypemessage.mp3');
    assert.equal(LIB.notify?.source, 'Skypenotification_.mp3');
    assert.notEqual(LIB.message?.file, LIB.notify?.file);
    assert.match(sons, /export const notify = \(\) => sound\('notify'\);/);
  });

  test('la notification sert aux demandes de contact et aux réactions', () => {
    const points = [...app.matchAll(/sounds\.notify\(\)/g)];
    assert.ok(points.length >= 2, `notify appelé ${points.length} fois`);
    assert.equal([...`${appels}${compose}`.matchAll(/sounds\.notify\(\)/g)].length, 0,
      'la notification générale ne concerne ni les appels ni le composeur');
  });

  test('le son de déconnexion ne sert QU’à la déconnexion', () => {
    const reglages = lire('public/js/ui/settings.js');
    assert.match(sons, /export const logout = \(\) => sound\('logout'\);/);
    const points = [...`${app}${appels}${compose}${reglages}`.matchAll(/sounds\.logout\(\)/g)];
    assert.equal(points.length, 1, `sounds.logout() appelé ${points.length} fois, attendu 1`);
    assert.match(reglages, /sounds\.logout\(\);[\s\S]{0,200}await api\.signout\(\)/,
      'le son doit accompagner la déconnexion réelle');
  });

  test('connexion et déconnexion sont deux sons différents', () => {
    assert.notEqual(LIB.login?.file, LIB.logout?.file);
  });
});

describe('Sons non attribués', () => {
  test('un son orphelin n’est branché sur aucun événement', () => {
    const orphelins = Object.entries(LIB).filter(([, e]) => e.orphelin);
    for (const [cle] of orphelins) {
      const usages = [...`${app}${appels}${compose}`.matchAll(new RegExp(`sound\\('${cle}'\\)`, 'g'))];
      assert.equal(usages.length, 0, `${cle} est marqué orphelin mais utilisé dans l'application`);
    }
  });

  test('un son orphelin ne sert jamais de secours à un autre', () => {
    for (const [cle, entree] of Object.entries(LIB)) {
      if (!entree.orphelin) continue;
      assert.ok(!sons.includes(`secoursRepris: '${cle}'`), `${cle} ne doit pas servir de secours`);
    }
  });
});
