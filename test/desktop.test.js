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
    assert.match(store, /process\.env\.SKYPE_DATA_DIR/,
      'sans ça, l’application écrirait sous « Program Files », refusé sans droits admin');
  });

  test('main.js pointe SKYPE_DATA_DIR vers le dossier utilisateur d’Electron', () => {
    assert.match(main, /process\.env\.SKYPE_DATA_DIR = path\.join\(app\.getPath\('userData'\), 'data'\);/);
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
});

describe('Empaquetage', () => {
  test('la mise à jour automatique est désactivée (aucun serveur de publication configuré)', () => {
    assert.equal(pkg.build.publish, null,
      'sans ce réglage, la construction plante en cherchant un canal de mise à jour inexistant');
  });

  test('server/ et public/ sont inclus tels quels, au même niveau relatif que dans le dépôt', () => {
    const ressources = pkg.build.extraResources.map((r) => r.to);
    assert.ok(ressources.includes('server') && ressources.includes('public'),
      'server/api.js importe public/js/lib/pays.js par chemin relatif : les deux doivent rester frères');
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
