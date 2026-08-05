/**
 * Le numéro de version est écrit à la main à une dizaine d'endroits : la
 * bannière du serveur, la fenêtre « À propos », le pied de la page de
 * campagne, le site de téléchargement, l'enveloppe de bureau…
 *
 * Une seule oubliée et l'application annonce une version qu'elle n'est pas —
 * ce qui compte doublement depuis que la mise à jour automatique compare des
 * numéros pour décider s'il faut se remplacer.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const lire = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const VERSION = JSON.parse(lire('package.json')).version;

/** Chaque endroit où le numéro est écrit, et comment l'y retrouver. */
const ENDROITS = [
  ['desktop/package.json', /"version":\s*"([^"]+)"/],
  ['server/index.js', /S k y p e   R e b o r n   ·   v(\S+)/],
  ['public/js/ui/modals.js', /text: 'Version ([\d.]+) · Skip'/],
  ['public/pub/index.html', /Version ([\d.]+)<\/a>/],
  ['docs/index.html', /const VERSION = '([^']+)'/],
  ['docs/index.html', /id="etiquetteVersion">([\d.]+)</],
  ['README.md', /^Version ([\d.]+) · Zéro dépendance/m],
  // Le nom du cache du service worker : c'est lui qui décide si une version
  // web repart d'un cache vide ou hérite de celui de la précédente.
  ['public/sw.js', /const VERSION = 'skip-([\d.]+)'/],
];

describe('Numéro de version', () => {
  test('il est le même partout', () => {
    for (const [fichier, motif] of ENDROITS) {
      const trouve = lire(fichier).match(motif);
      assert.ok(trouve, `numéro de version introuvable dans ${fichier}`);
      assert.equal(trouve[1], VERSION,
        `${fichier} annonce ${trouve[1]} alors que package.json dit ${VERSION}`);
    }
  });

  test('les exemples de noms de fichiers du site suivent la version', () => {
    // Ces noms sont remplacés par ceux de la version publiée dès que l'API
    // répond ; mais avant, ce sont eux que le visiteur lit.
    const site = lire('docs/index.html');
    const exemples = site.match(/Skip-[^\s`<·]*\d+\.\d+\.\d+[^\s`<·]*/g) || [];
    assert.ok(exemples.length >= 3, 'les noms de fichiers d’exemple ont disparu du site');
    for (const exemple of exemples) {
      assert.ok(exemple.includes(VERSION), `nom de fichier périmé sur le site : ${exemple}`);
    }
  });

  test('le numéro respecte la forme attendue par la mise à jour', () => {
    // electron-updater refuse une version qui n'est pas au format sémantique.
    assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  });
});
