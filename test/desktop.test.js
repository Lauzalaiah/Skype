/**
 * Application de bureau (Electron) : vérifie que l'enveloppe respecte les
 * contraintes qui, sinon, cassent silencieusement une fois installée sur une
 * vraie machine — des choses qu'aucune erreur de syntaxe ne révèle.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const lire = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const main = lire('desktop/main.js');
const pkg = JSON.parse(lire('desktop/package.json'));
const store = lire('server/store.js');
const index = lire('server/index.js');

describe('Les données ne vont jamais dans le dossier d’installation', () => {
  test('store.js accepte une base de données surchargée par variable d’environnement', () => {
    assert.match(store, /process\.env\.SKIP_DATA_DIR/,
      'sans ça, l’application écrirait sous « Program Files », refusé sans droits admin');
  });

  test('main.js pointe SKIP_DATA_DIR vers le dossier utilisateur d’Electron', () => {
    assert.match(main, /process\.env\.SKIP_DATA_DIR = path\.join\(app\.getPath\('userData'\), 'data'\);/);
  });

  test('le dossier de données porte le nom du produit, pas celui du paquet npm', () => {
    // Vérifié en conditions réelles : app.setName() seul ne suffit pas —
    // Electron a déjà figé le chemin quand main.js s'exécute, et les données
    // atterrissaient dans « skip-desktop ». Le chemin doit être imposé.
    assert.match(main, /app\.setPath\('userData', path\.join\(app\.getPath\('appData'\), 'Skip'\)\);/,
      'sans setPath explicite, le dossier reprend le nom du paquet npm');
    const posSetPath = main.indexOf("app.setPath('userData'");
    const posLecture = main.indexOf("app.getPath('userData')");
    assert.ok(posSetPath > 0 && posSetPath < posLecture,
      'le chemin doit être imposé avant d’être lu');
  });
});

describe('Le port ne peut jamais entrer en conflit', () => {
  test('main.js demande un port au système (PORT=0), jamais un port fixe', () => {
    assert.match(main, /process\.env\.PORT = '0';/);
  });

  test('server/index.js traite PORT=0 comme un vrai choix, pas comme « absent »', () => {
    // Un bug réel : Number(process.env.PORT) || 3000 traite 0 comme falsy et
    // retombe sur 3000, annulant l’attribution automatique demandée ci-dessus.
    assert.doesNotMatch(index, /const PORT = Number\(process\.env\.PORT\) \|\| 3000;/,
      'ce piège classique du || annule PORT=0 : il faut distinguer 0 de « non défini »');
    assert.match(index, /process\.env\.PORT !== undefined \? Number\(process\.env\.PORT\) : 3000/);
  });

  test('main.js lit le port réellement attribué via server.address(), jamais deviné', () => {
    assert.match(main, /server\.address\(\)\.port/);
  });

  test('la bannière de démarrage annonce le port réel, pas la valeur demandée', () => {
    // Avec PORT=0, afficher PORT donnerait « http://localhost:0 » — une
    // adresse qui ne mène nulle part.
    assert.match(index, /const port = server\.address\(\)\.port;/);
    assert.doesNotMatch(index, /http:\/\/localhost:\$\{PORT\}/);
  });
});

describe('Le serveur écoute en local uniquement', () => {
  test('main.js force HOST=127.0.0.1 : jamais exposé sur le réseau', () => {
    assert.match(main, /process\.env\.HOST = '127\.0\.0\.1';/);
  });
});

describe('Micro, caméra et liens ouverts sans surprise', () => {
  test('les demandes de permission sont limitées à ce dont l’application a besoin', () => {
    assert.match(main, /setPermissionRequestHandler/);
    assert.match(main, /\['media', 'display-capture', 'notifications', 'clipboard-sanitized-write'\]\.includes\(permission\)/,
      'la liste doit rester explicite : tout ce qui n’y figure pas doit être refusé par défaut');
  });

  test('les liens externes s’ouvrent dans le navigateur du système, pas dans une fenêtre Electron', () => {
    assert.match(main, /setWindowOpenHandler/);
    assert.match(main, /shell\.openExternal\(url\)/);
    assert.match(main, /action: 'deny'/);
  });
});

describe('Une seule fenêtre à la fois', () => {
  test('le verrou mono-instance est demandé', () => {
    assert.match(main, /app\.requestSingleInstanceLock\(\)/);
  });

  test('une seconde invocation redonne le focus plutôt que d’ouvrir une fenêtre en double', () => {
    assert.match(main, /app\.on\('second-instance', \(\) => \{/);
  });

  test('la seconde instance s’arrête vraiment, sans démarrer un second serveur', () => {
    // Constaté en conditions réelles : app.quit() n'interrompt pas
    // l'exécution du fichier. Sans sortie explicite, la seconde instance
    // démarrait un serveur supplémentaire sur le même dossier de données
    // avant de se fermer.
    assert.match(main, /app\.quit\(\);\s*\n\s*process\.exit\(0\);/,
      'app.quit() seul laisse le reste de main.js s’exécuter');
  });
});

describe('Un démarrage raté ne reste jamais silencieux', () => {
  test('les erreurs non interceptées sont signalées, pas avalées', () => {
    // Constaté en conditions réelles : l'application se fermait sans un mot
    // quand le démarrage échouait — impossible à diagnostiquer.
    assert.match(main, /process\.on\('uncaughtException', signalerEchec\);/);
    assert.match(main, /process\.on\('unhandledRejection', signalerEchec\);/);
    assert.match(main, /\}\)\.catch\(signalerEchec\);/,
      'le démarrage asynchrone doit aussi être rattrapé');
  });

  test('l’échec est montré à l’utilisateur, pas seulement journalisé', () => {
    assert.match(main, /dialog\.showErrorBox\(/);
  });
});

describe('Empaquetage', () => {
  test('la mise à jour automatique a une source déclarée', () => {
    // C'est cette configuration qui fait produire les fichiers latest*.yml
    // à electron-builder ; sans elle, l'application installée n'aurait aucun
    // moyen d'apprendre qu'une version plus récente existe.
    // Le détail du mécanisme est vérifié dans test/maj.test.js.
    assert.ok(Array.isArray(pkg.build.publish) && pkg.build.publish.length,
      'sans source de publication, la mise à jour automatique est muette');
  });

  test('server/ et public/ sont inclus tels quels, au même niveau relatif que dans le dépôt', () => {
    const ressources = pkg.build.extraResources.map((r) => r.to);
    assert.ok(ressources.includes('server') && ressources.includes('public'),
      'server/api.js importe public/js/lib/pays.js par chemin relatif : les deux doivent rester frères');
  });

  test('server/ et public/ emportent un package.json déclarant « type: module »', () => {
    // Bug réel, invisible en développement : ces dossiers héritent du
    // « type: module » de la racine du dépôt. Une fois empaquetés, ils en sont
    // détachés — Node les relit comme du CommonJS et l'application installée
    // meurt au démarrage sur « Cannot use import statement outside a module ».
    const ressources = pkg.build.extraResources;
    for (const cible of ['server/package.json', 'public/package.json']) {
      const entree = ressources.find((r) => r.to === cible);
      assert.ok(entree, `${cible} absent : l'application empaquetée ne démarrera pas`);
      const source = path.join(ROOT, 'desktop', entree.from);
      assert.ok(fs.existsSync(source), `fichier source introuvable : ${entree.from}`);
      assert.equal(JSON.parse(fs.readFileSync(source, 'utf8')).type, 'module');
    }
  });

  test('le package.json embarqué avec server/ porte aussi la version', () => {
    // api.js lit la version pour /api/health. Empaqueté, « ../package.json »
    // n'existe plus : c'est le fichier posé à côté de server/ qui la fournit.
    const entree = pkg.build.extraResources.find((r) => r.to === 'server/package.json');
    const source = JSON.parse(fs.readFileSync(path.join(ROOT, 'desktop', entree.from), 'utf8'));
    assert.ok(source.version, 'sans version ici, /api/health en annoncerait une fausse');
  });

  test('la lecture de la version ne peut jamais empêcher le serveur de démarrer', () => {
    const api = lire('server/api.js');
    assert.match(api, /for \(const chemin of \['\.\/package\.json', '\.\.\/package\.json'\]\)/,
      'les deux emplacements (empaqueté puis dépôt) doivent être tentés');
    assert.match(api, /return '0\.0\.0';/,
      'un package.json introuvable doit dégrader la version, pas faire échouer le démarrage');
  });

  test('le marqueur est nécessaire : ni server/ ni public/ n’a son propre package.json', () => {
    // Si l'un d'eux en gagnait un un jour, le marqueur ci-dessus l'écraserait
    // silencieusement — ce test rend ce conflit visible.
    for (const dossier of ['server', 'public']) {
      assert.ok(!fs.existsSync(path.join(ROOT, dossier, 'package.json')),
        `${dossier}/package.json existe désormais : il entrerait en conflit avec le marqueur d'empaquetage`);
    }
  });

  test('l’icône de fenêtre référencée par main.js est bien embarquée', () => {
    // main.js pointe vers build/icon.png relativement à lui-même : ce fichier
    // doit donc figurer dans « files », sinon le chemin ne mène nulle part
    // une fois l'application empaquetée dans app.asar.
    assert.match(main, /icon: path\.join\(__dirname, 'build', 'icon\.png'\)/);
    assert.ok(pkg.build.files.includes('build/icon.png'),
      'l’icône référencée par main.js est absente du paquet');
  });

  test('les icônes déclarées existent réellement sur le disque', () => {
    for (const chemin of [pkg.build.win.icon, pkg.build.linux.icon]) {
      assert.ok(fs.existsSync(path.join(ROOT, 'desktop', chemin)), `icône absente : ${chemin}`);
    }
  });

  test('l’icône Windows est un .ico valide, pas un .png renommé', () => {
    const donnees = fs.readFileSync(path.join(ROOT, 'desktop', pkg.build.win.icon));
    assert.equal(donnees.readUInt16LE(0), 0, 'un .ico commence par un champ réservé à 0');
    assert.equal(donnees.readUInt16LE(2), 1, 'un .ico déclare le type 1 (icône)');
  });

  test('l’installateur Windows propose un vrai choix, pas une installation à un clic', () => {
    assert.equal(pkg.build.nsis.oneClick, false,
      'un « oneClick » masque le choix du dossier et les raccourcis — pas ce qu’on attend d’un installateur');
    assert.equal(pkg.build.nsis.createDesktopShortcut, true);
    assert.equal(pkg.build.nsis.createStartMenuShortcut, true);
  });
});
