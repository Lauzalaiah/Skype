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
      orphelin: /orphelin: true/.test(corps),
      loop: /loop: true/.test(corps),
    };
  }
  return entrees;
}

const LIB = bibliotheque();

describe('Bibliothèque de sons', () => {
  test('les quatorze sons sont déclarés', () => {
    assert.equal(Object.keys(LIB).length, 14, `clés : ${Object.keys(LIB).join(', ')}`);
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
    assert.match(appels, /if \(session\) sounds\.callWaiting\(\);\s*\n\s*else sounds\.startRinging\(\{ video: call\.video \}\);/,
      'un appel entrant pendant une communication doit jouer callWaiting, pas la sonnerie');
  });

  test('un appel vidéo entrant a sa propre sonnerie', () => {
    assert.match(sons, /sound\(video \? 'ringVideo' : ringtone, \{ loop: true \}\)/,
      'la sonnerie vidéo doit être distincte de celle des appels audio');
    // La sonnerie vidéo n'est pas proposée dans la liste des sonneries au choix :
    // elle est imposée par la nature de l'appel.
    assert.match(sons, /export const SONNERIES = \['ring', 'ringLong', 'ringAlt'\];/);
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
    for (const cle of ['ring', 'ringLong', 'ringAlt', 'ringVideo']) {
      assert.ok(LIB[cle]?.loop, `${cle} doit être déclaré en boucle`);
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

  test('le son « fichier envoyé » ne sert qu’aux envois de fichier ou de contact', () => {
    // Composeur : pièce jointe, carte de contact, GIF. Nulle part ailleurs.
    const dansCompose = [...compose.matchAll(/sounds\.fileSent\(\)/g)];
    assert.equal(dansCompose.length, 3, 'attendu : pièce jointe, carte de contact, GIF');

    assert.match(compose, /if \(pending\.length\) sounds\.fileSent\(\);\s*\n\s*else sounds\.messageOut\(\);/,
      'un message texte ne doit pas jouer le son de fichier envoyé');

    for (const source of [app, appels]) {
      assert.equal([...source.matchAll(/sounds\.fileSent\(\)/g)].length, 0,
        'le son de fichier envoyé ne doit servir que dans le composeur');
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
