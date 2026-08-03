/**
 * Mise à jour automatique de l'application de bureau.
 *
 * La chaîne est longue et chaque maillon est invisible quand il casse :
 * l'application interroge un fichier de description publié par le workflow,
 * qui n'existe que si electron-builder a une configuration de publication.
 * Enlevez n'importe lequel des trois et rien ne se voit — les utilisateurs
 * restent simplement sur leur vieille version, sans message d'erreur.
 *
 * Ces tests attachent les maillons les uns aux autres.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const lire = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const paquet = JSON.parse(lire('package.json'));
const paquetBureau = JSON.parse(lire('desktop/package.json'));
const main = lire('desktop/main.js');
const maj = lire('desktop/maj.js');
const preload = lire('desktop/preload.cjs');
const interfaceMaj = lire('public/js/lib/maj.js');
const workflow = lire('.github/workflows/release.yml');

describe('Configuration de la mise à jour', () => {
  test('electron-updater est une dépendance d’exécution, pas de développement', () => {
    assert.ok(paquetBureau.dependencies?.['electron-updater'],
      'en dépendance de développement, le module serait absent de l’application empaquetée');
    assert.ok(!paquetBureau.devDependencies?.['electron-updater']);
  });

  test('la source des mises à jour est bien ce dépôt', () => {
    const [publication] = paquetBureau.build.publish;
    assert.equal(publication.provider, 'github');
    assert.equal(publication.owner, 'Lauzalaiah');
    assert.equal(publication.repo, 'Skype');
  });

  test('l’empaquetage embarque le pont et les modules nécessaires', () => {
    for (const fichier of ['main.js', 'maj.js', 'preload.cjs', 'node_modules/**/*']) {
      assert.ok(paquetBureau.build.files.includes(fichier),
        `absent de la liste des fichiers empaquetés : ${fichier}`);
    }
  });

  test('les fichiers déclarés comme empaquetés existent', () => {
    for (const fichier of paquetBureau.build.files) {
      if (fichier.includes('*')) continue;
      assert.ok(fs.existsSync(path.join(ROOT, 'desktop', fichier)),
        `déclaré mais introuvable : ${fichier}`);
    }
  });

  test('la construction ne publie jamais d’elle-même', () => {
    // C'est le workflow qui décide de publier, après les tests. Sans cela,
    // une construction locale pourrait pousser une version sur le dépôt.
    for (const cible of ['build:win', 'build:mac', 'build:linux']) {
      assert.match(paquetBureau.scripts[cible], /--publish never/,
        `${cible} pourrait publier tout seul`);
    }
  });
});

describe('Le pont exposé à l’interface', () => {
  test('il n’expose que les trois fonctions de mise à jour', () => {
    const exposees = [...preload.matchAll(/^\s{2}(?:(\w+)\(|(\w+):)/gm)]
      .map((m) => m[1] || m[2]).sort();
    assert.deepEqual(exposees, ['installer', 'ouvrirNouveautes', 'surEtat']);
  });

  test('ni ipcRenderer ni require ne sont donnés à la page', () => {
    assert.match(preload, /contextBridge\.exposeInMainWorld/);
    // Ce qui serait grave, c'est de livrer l'objet lui-même : la page pourrait
    // alors émettre n'importe quel message vers le processus principal.
    assert.doesNotMatch(preload, /exposeInMainWorld\(\s*['"][^'"]+['"]\s*,\s*(ipcRenderer|require)\b/,
      'ipcRenderer exposé tel quel permettrait n’importe quel appel système');
    assert.doesNotMatch(preload, /\w+\s*:\s*(ipcRenderer|require)\s*[,}\n]/,
      'aucune propriété ne doit valoir ipcRenderer ou require');
  });

  test('la fenêtre est isolée et charge bien le pont', () => {
    assert.match(main, /contextIsolation: true/);
    assert.match(main, /nodeIntegration: false/);
    assert.match(main, /sandbox: true/);
    assert.match(main, /preload: path\.join\(__dirname, 'preload\.cjs'\)/);
  });

  test('le pont est en CommonJS', () => {
    // Un préchargement en bac à sable est toujours chargé comme du CommonJS,
    // alors que desktop/package.json déclare « type: module ».
    assert.ok(fs.existsSync(path.join(ROOT, 'desktop/preload.cjs')));
    assert.match(preload, /require\('electron'\)/);
    assert.doesNotMatch(preload, /^import /m);
  });
});

describe('Comportement de la mise à jour', () => {
  test('macOS ne prétend pas se mettre à jour tout seul', () => {
    // Sans signature Apple, l'installation échouerait silencieusement à
    // chaque démarrage. On se contente d'y signaler la nouvelle version.
    assert.match(maj, /process\.platform !== 'darwin'/);
    assert.match(maj, /verifierSansInstaller/);
    assert.match(maj, /phase: 'manuel'/);
  });

  test('rien ne se déclenche hors application empaquetée', () => {
    assert.match(maj, /if \(!app\.isPackaged\) return;/,
      'en développement il n’y a aucune version installée à remplacer');
  });

  test('la vérification ne s’exécute pas pendant le démarrage', () => {
    assert.match(maj, /PREMIER_DELAI/, 'la première vérification doit être différée');
    assert.match(maj, /setInterval/, 'et répétée ensuite');
  });

  test('une vérification qui échoue ne casse rien', () => {
    // L'application est prévue pour fonctionner hors ligne : ne pas joindre
    // GitHub est un usage normal, pas une panne.
    assert.match(maj, /catch \(err\)[\s\S]{0,400}console\.warn/);
    assert.match(maj, /autoUpdater\.on\('error'/);
  });

  test('l’installation ne part que si une version est réellement prête', () => {
    assert.match(maj, /if \(etat\.phase !== 'prete'\) return false;/);
  });

  test('la comparaison de versions est numérique, pas alphabétique', () => {
    assert.match(maj, /export function plusRecente/);
    assert.match(maj, /parseInt/, '« 8.9.0 » est plus ancienne que « 8.130.0 »');
  });
});

describe('Le bandeau dans l’interface', () => {
  test('il ne s’affiche jamais dans un navigateur', () => {
    assert.match(interfaceMaj, /globalThis\.skypeMaj/);
    assert.match(interfaceMaj, /if \(!pont\?\.surEtat\) return;/,
      'la version web n’a pas de pont : le module doit rester silencieux');
  });

  test('l’application web l’appelle au démarrage', () => {
    const app = lire('public/js/app.js');
    assert.match(app, /import \{ surveillerMisesAJour \} from '\.\/lib\/maj\.js'/);
    assert.match(app, /surveillerMisesAJour\(\);/);
  });

  test('les trois situations ont un libellé', () => {
    for (const phase of ['telechargement', 'prete', 'manuel']) {
      assert.ok(new RegExp(`${phase}:`).test(interfaceMaj), `libellé manquant : ${phase}`);
    }
  });

  test('un bandeau écarté ne revient pas pour la même version', () => {
    assert.match(interfaceMaj, /ecartee\(version\)/);
    assert.match(interfaceMaj, /sessionStorage/);
  });

  test('le bandeau passe sous les modales et au-dessus des appels', () => {
    const css = lire('public/css/components.css');
    const bloc = css.slice(css.indexOf('.maj {'));
    const zIndex = Number(bloc.match(/z-index:\s*(\d+)/)[1]);
    assert.ok(zIndex > 470, 'il doit passer au-dessus de l’écran d’appel');
    assert.ok(zIndex < 500, 'mais jamais au-dessus d’une boîte de dialogue ouverte');
  });
});

describe('Mise à jour de la version web (service worker)', () => {
  const sw = lire('public/sw.js');

  test('le code part du réseau, jamais du cache en premier', () => {
    // Le défaut corrigé : la page d'accueil arrivait fraîche du réseau, mais
    // les modules JavaScript venaient du cache — une page neuve pilotée par du
    // code ancien jusqu'au rechargement suivant.
    assert.match(sw, /const estCode = \(url\) => \/\\\.\(html\|js\|css\|webmanifest\)\$\//);
    assert.match(sw, /if \(estCode\(url\)\) \{\s*event\.respondWith\(reseauDAbord\(request\)\)/);
  });

  test('hors ligne, le cache prend le relais', () => {
    assert.match(sw, /\.catch\(\(\) => caches\.match\(request\)/,
      'sans secours, l’application ne s’ouvrirait plus sans réseau');
  });

  test('les ressources stables restent servies depuis le cache', () => {
    // Les sons et les icônes ne changent pas d'une version à l'autre : c'est
    // là que le cache fait gagner du temps sans rien risquer.
    assert.match(sw, /caches\.match\(request\)\.then\(\(enCache\)/);
    assert.match(sw, /return enCache \|\| reseau;/,
      'ce qui n’est pas du code doit toujours partir du cache');
  });

  test('une nouvelle version repart d’un cache vide', () => {
    const version = sw.match(/const VERSION = '([^']+)'/)[1];
    assert.equal(version, `skype-${paquet.version}`,
      'le nom du cache doit porter le numéro de version');
    assert.match(sw, /noms\.filter\(\(n\) => n !== VERSION\)\.map\(\(n\) => caches\.delete\(n\)\)/,
      'les caches des versions précédentes doivent être effacés');
  });

  test('les données ne sont toujours jamais mises en cache', () => {
    assert.match(sw, /if \(estDonnee\(url\)\) return;/);
  });
});

describe('Robustesse de l’application de bureau', () => {
  test('une erreur après le démarrage ne ferme plus l’application', () => {
    // Fermer Skype parce qu'une promesse a échoué quelque part couperait une
    // conversation en cours pour un incident qui ne concerne pas l'utilisateur.
    assert.match(main, /if \(demarre\) \{[\s\S]{0,160}return;/);
    assert.match(main, /demarre = true;/);
  });

  test('un démarrage qui échoue, lui, reste fatal et visible', () => {
    assert.match(main, /dialog\.showErrorBox\('Skype n’a pas pu démarrer'/);
    assert.match(main, /app\.quit\(\);/);
  });

  test('le bandeau atteint la fenêtre même après une réouverture', () => {
    // Sur macOS, fermer la fenêtre puis rouvrir l'application en crée une
    // nouvelle : une référence gardée au démarrage ne mènerait plus nulle part.
    assert.match(maj, /for \(const fenetre of BrowserWindow\.getAllWindows\(\)\)/);
    assert.doesNotMatch(maj, /^let fenetre = null;$/m,
      'plus de référence figée vers une fenêtre unique');
  });
});

describe('Publication des mises à jour', () => {
  test('le workflow publie les fichiers de description de version', () => {
    // Sans eux, l'application installée n'a aucun moyen d'apprendre qu'une
    // version plus récente existe : la mise à jour serait muette.
    for (const fichier of ['latest.yml', 'latest-mac.yml', 'latest-linux.yml']) {
      assert.ok(workflow.includes(fichier), `non publié : ${fichier}`);
    }
    assert.match(workflow, /-name 'latest\*\.yml'/,
      'les descriptions doivent être rassemblées avec les installateurs');
  });

  test('une publication sans description de version échoue au lieu de passer', () => {
    assert.match(workflow, /ls publication\/latest\*\.yml/);
    assert.match(workflow, /la mise à jour automatique serait muette/);
  });

  test('les empreintes ne portent que sur les fichiers téléchargeables', () => {
    assert.match(workflow, /sha256sum \*\.exe \*\.dmg \*\.AppImage/);
  });

  test('les notes de version expliquent la limite de macOS', () => {
    assert.match(workflow, /Windows et Linux\*\* se mettent à jour tout seuls/);
    assert.match(workflow, /signature Apple/);
  });
});
