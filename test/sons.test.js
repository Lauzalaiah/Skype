/**
 * Vérifie que chaque son est branché sur le bon événement, et sur celui-là
 * seulement. Ce test lit le code source : il échoue dès qu'un son est ajouté,
 * déplacé ou utilisé à un endroit qui n'est pas décrit dans la bibliothèque.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
  test('les dix-neuf sons sont déclarés', () => {
    assert.equal(Object.keys(LIB).length, 19, `clés : ${Object.keys(LIB).join(', ')}`);
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
    // Skype ne distingue pas la sonnerie d'un appel audio de celle d'un appel
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

  test('envoi de fichier, de contact et échec sont trois sons distincts', () => {
    const trio = [LIB.fileSent?.file, LIB.contactSent?.file, LIB.fileSendFailed?.file];
    assert.ok(trio.every(Boolean), 'les trois entrées doivent exister');
    assert.equal(new Set(trio).size, 3);

    assert.equal([...compose.matchAll(/sounds\.fileSent\(\)/g)].length, 2, 'attendu : pièce jointe + GIF');
    assert.equal([...compose.matchAll(/sounds\.contactSent\(\)/g)].length, 1, 'attendu : carte de contact');
    assert.equal([...compose.matchAll(/sounds\.fileSendFailed\(\)/g)].length, 1, 'attendu : échec du téléversement');
  });

  test('le son de début d’appel ne sert qu’à l’établissement de la communication', () => {
    assert.match(sons, /export const callConnect = \(\) => sound\('callStart'\);/);
    const points = [...appels.matchAll(/sounds\.callConnect\(\)/g)];
    assert.ok(points.length >= 1 && points.length <= 3, `callConnect appelé ${points.length} fois`);
  });

  test('un message vocal reçu a son propre son, distinct du fichier ordinaire', () => {
    assert.match(app, /const estVocal = message\.attachments\?\.some\(\(a\) => a\.mime\?\.startsWith\('audio\/'\)\);/);
    assert.match(app, /else if \(estVocal\) sounds\.voicemail\(\);/);
    assert.notEqual(LIB.voicemail?.file, LIB.fileReceived?.file);

    const points = [...app.matchAll(/sounds\.voicemail\(\)/g)];
    assert.equal(points.length, 1, 'le son de message vocal ne doit servir qu’à la réception d’un vocal');
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
    assert.equal(points.length, 2, 'attendu : appel Skype sortant + appel téléphonique sortant');
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
    for (const nom of ['messageOut', 'mention', 'error', 'notify']) {
      assert.match(sons, new RegExp(`export const ${nom} = \\(\\) =>\\s*\\n?\\s*play\\(`),
        `${nom} est annoncé comme emplacement libre : il doit rester synthétisé`);
    }
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
