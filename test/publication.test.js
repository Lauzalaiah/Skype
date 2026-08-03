/**
 * Le vérificateur de publication est le dernier filet avant que des fichiers
 * ne partent chez les utilisateurs. On le teste donc en fabriquant chacune des
 * publications défectueuses qu'il doit refuser — sinon on n'aurait aucune
 * preuve qu'il refuse quoi que ce soit.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts/verifier-publication.mjs');

const empreinte = (contenu) => crypto.createHash('sha512').update(contenu).digest('base64');

/**
 * Fabrique une publication complète et cohérente, puis laisse l'appelant la
 * détraquer d'une seule façon précise.
 */
function publication(version, deteriorer = () => {}) {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'publication-'));
  const fichiers = {
    'latest.yml': `Skype-Reborn-Setup-${version}.exe`,
    'latest-mac.yml': `Skype-Reborn-${version}.dmg`,
    'latest-linux.yml': `Skype-Reborn-${version}.AppImage`,
  };

  for (const [description, binaire] of Object.entries(fichiers)) {
    const contenu = Buffer.from(`contenu factice de ${binaire}`);
    fs.writeFileSync(path.join(dossier, binaire), contenu);
    fs.writeFileSync(path.join(dossier, description), [
      `version: ${version}`,
      'files:',
      `  - url: ${binaire}`,
      `    sha512: ${empreinte(contenu)}`,
      `    size: ${contenu.length}`,
      `path: ${binaire}`,
      `sha512: ${empreinte(contenu)}`,
    ].join('\n') + '\n');
  }

  deteriorer(dossier, fichiers);
  return dossier;
}

/** Renvoie { code, sortie } sans jamais lever : c'est le code qui nous intéresse. */
function verifier(dossier, version, versionPubliee) {
  const args = [SCRIPT, dossier, version];
  if (versionPubliee) args.push(versionPubliee);
  try {
    return { code: 0, sortie: execFileSync(process.execPath, args, { encoding: 'utf8' }) };
  } catch (err) {
    return { code: err.status, sortie: (err.stdout || '') + (err.stderr || '') };
  }
}

describe('Vérification avant publication', () => {
  test('une publication saine passe', () => {
    const { code, sortie } = verifier(publication('8.132.0'), '8.132.0', '8.131.0');
    assert.equal(code, 0, sortie);
    assert.match(sortie, /Publication saine/);
  });

  test('refuse un fichier de description annonçant une autre version', () => {
    // Sans ce contrôle : l'application se met à jour, redémarre sur le même
    // numéro, se remet à jour… indéfiniment.
    const dossier = publication('8.132.0', (d) => {
      const p = path.join(d, 'latest.yml');
      fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('version: 8.132.0', 'version: 8.131.0'));
    });
    const { code, sortie } = verifier(dossier, '8.132.0');
    assert.equal(code, 1);
    assert.match(sortie, /annonce la version 8\.131\.0/);
  });

  test('refuse une description qui désigne un fichier absent', () => {
    const dossier = publication('8.132.0', (d, f) => fs.rmSync(path.join(d, f['latest.yml'])));
    const { code, sortie } = verifier(dossier, '8.132.0');
    assert.equal(code, 1);
    assert.match(sortie, /qui n'est pas publié/);
  });

  test('refuse une empreinte qui ne correspond pas au fichier', () => {
    // C'est le contrôle que fait l'application après avoir tout téléchargé :
    // s'il échoue chez elle, elle abandonne sans rien dire à personne.
    const dossier = publication('8.132.0', (d, f) => {
      fs.writeFileSync(path.join(d, f['latest-linux.yml']), 'contenu remplacé après coup');
    });
    const { code, sortie } = verifier(dossier, '8.132.0');
    assert.equal(code, 1);
    assert.match(sortie, /empreinte différente/);
  });

  test('refuse une version qui ne serait pas plus récente', () => {
    const { code, sortie } = verifier(publication('8.132.0'), '8.132.0', '8.132.0');
    assert.equal(code, 1);
    assert.match(sortie, /n'est pas plus récente/);
  });

  test('refuse un retour en arrière', () => {
    const { code } = verifier(publication('8.131.0'), '8.131.0', '8.132.0');
    assert.equal(code, 1);
  });

  test('compare les numéros en nombres, pas en lettres', () => {
    // « 8.9.0 » précède « 8.132.0 », ce qu'un tri alphabétique inverserait.
    const { code, sortie } = verifier(publication('8.132.0'), '8.132.0', '8.9.0');
    assert.equal(code, 0, sortie);
  });

  test('refuse de laisser un système sans fichier de description', () => {
    const dossier = publication('8.132.0', (d) => fs.rmSync(path.join(d, 'latest-mac.yml')));
    const { code, sortie } = verifier(dossier, '8.132.0');
    assert.equal(code, 1);
    assert.match(sortie, /macOS n'a pas de fichier de description/);
  });

  test('refuse un dossier vide plutôt que de le déclarer sain', () => {
    const vide = fs.mkdtempSync(path.join(os.tmpdir(), 'vide-'));
    assert.notEqual(verifier(vide, '8.132.0').code, 0);
  });
});

describe('La comparaison de versions est la même des deux côtés', () => {
  /**
   * Deux implémentations comparent des numéros de version : celle qui décide
   * si une publication a le droit de partir, et celle qui, dans l'application
   * installée, décide s'il faut se mettre à jour. Si elles divergeaient, une
   * version pourrait être jugée publiable et jamais proposée à personne.
   */
  const extraire = (fichier) => {
    const source = fs.readFileSync(path.join(ROOT, fichier), 'utf8');
    const debut = source.indexOf('function plusRecente');
    assert.notEqual(debut, -1, `plusRecente introuvable dans ${fichier}`);
    const fin = source.indexOf('\n}', debut);
    return source.slice(debut, fin + 2).replace(/\s+/g, ' ');
  };

  test('les deux copies sont identiques', () => {
    assert.equal(
      extraire('scripts/verifier-publication.mjs'),
      extraire('desktop/maj.js'),
      'les deux comparaisons ont divergé : une version pourrait être publiée sans être proposée'
    );
  });
});

describe('Le workflow appelle bien ce vérificateur', () => {
  const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/release.yml'), 'utf8');

  test('la vérification a lieu avant la publication', () => {
    assert.match(workflow, /scripts\/verifier-publication\.mjs/);
    const ordre = workflow.indexOf('verifier-publication.mjs') < workflow.indexOf('gh release create');
    assert.ok(ordre, 'vérifier après avoir publié ne servirait à rien');
  });

  test('la version déjà publiée lui est transmise', () => {
    assert.match(workflow, /verifier-publication\.mjs publication "\$VERSION" "\$PRECEDENTE"/,
      'sans elle, impossible de refuser un retour en arrière');
  });

  test('l’application construite est réellement démarrée avant publication', () => {
    // Les quatre défauts d'empaquetage trouvés au début ne se voyaient que
    // sur l'application installée : construire sans lancer ne prouve rien.
    assert.match(workflow, /xvfb-run/);
    assert.match(workflow, /api\/health/);
  });
});
