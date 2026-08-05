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

  test('tout module importé par l’application est empaqueté', () => {
    // Une liste écrite à la main oublie le fichier suivant : c'est arrivé, et
    // l'application installée refusait de démarrer (« Cannot find module »).
    // On suit donc les imports depuis main.js, plutôt que de les énumérer.
    const empaquetes = new Set(paquetBureau.build.files);
    const vus = new Set();
    const aVoir = ['main.js'];

    while (aVoir.length) {
      const fichier = aVoir.pop();
      if (vus.has(fichier)) continue;
      vus.add(fichier);

      assert.ok(empaquetes.has(fichier),
        `importé par l’application mais absent de « files » : ${fichier}`);

      const source = fs.readFileSync(path.join(ROOT, 'desktop', fichier), 'utf8');
      for (const [, chemin] of source.matchAll(/from\s+'\.\/([\w./-]+)'/g)) aVoir.push(chemin);
    }

    assert.ok(vus.size >= 3, `seulement ${vus.size} module(s) suivis : le parcours n’a rien trouvé`);
    for (const indispensable of ['preload.cjs', 'node_modules/**/*', 'package.json']) {
      assert.ok(empaquetes.has(indispensable), `absent de « files » : ${indispensable}`);
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
  test('il n’expose que ce qui est nécessaire, et rien de plus', () => {
    // Deux ponts seulement : les mises à jour, et le choix du serveur partagé.
    // Toute fonction ajoutée ici élargit ce que la page peut demander au
    // système : elle doit être un choix, jamais un oubli.
    const attendu = {
      skypeMaj: ['installer', 'ouvrirNouveautes', 'surEtat'],
      skypeBureau: ['definirServeur', 'etat'],
    };

    const blocs = [...preload.matchAll(
      /exposeInMainWorld\(\s*'(\w+)'\s*,\s*\{([\s\S]*?)\n\}\);/g)];
    assert.equal(blocs.length, Object.keys(attendu).length, 'nombre de ponts inattendu');

    for (const [, nom, corps] of blocs) {
      const exposees = [...corps.matchAll(/^\s{2}(?:(\w+)\(|(\w+):)/gm)]
        .map((m) => m[1] || m[2]).sort();
      assert.deepEqual(exposees, attendu[nom], `contenu inattendu du pont ${nom}`);
    }
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
  test('seuls ceux qui peuvent vraiment s’installer le tentent', async () => {
    // Une mise à jour qui échoue ne se plaint jamais : l'application cherche,
    // trouve, télécharge, rate l'installation, et ne dit rien. Mieux vaut
    // donc savoir d'avance qui en est capable.
    const { peutSInstallerSeul } = await import('../desktop/mise-a-jour-possible.js');

    assert.equal(peutSInstallerSeul('win32', {}), true,
      'Windows remplace son propre installateur sans difficulté');
    assert.equal(peutSInstallerSeul('darwin', {}), false,
      'sans signature Apple, l’installation échouerait silencieusement');

    // Sous Linux, tout dépend de la forme sous laquelle on a installé.
    assert.equal(peutSInstallerSeul('linux', { APPIMAGE: '/home/x/Skype.AppImage' }), true,
      'une AppImage est un simple fichier : elle peut se remplacer');
    assert.equal(peutSInstallerSeul('linux', {}), false,
      'un paquet .deb ou .rpm appartient au gestionnaire de paquets, pas à l’application');

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
    assert.match(workflow, /sha256sum \*\.exe \*\.dmg \*\.AppImage \*\.deb \*\.rpm/);
  });

  test('les notes de version disent qui se met à jour seul, et qui non', () => {
    assert.match(workflow, /Windows et l'AppImage Linux\*\* se mettent à jour tout seuls/);
    assert.match(workflow, /signature Apple/,
      'la limite de macOS doit être expliquée, pas passée sous silence');
    assert.match(workflow, /\*\*Les paquets `\.deb` et `\.rpm`\*\* non plus/,
      'un paquet ne peut pas se remplacer lui-même : le dire, sinon on promet à faux');
    assert.match(workflow, /elle ne fait jamais semblant/);
  });
});

describe('Une installation, pas seulement un fichier', () => {
  const build = paquetBureau.build;

  test('Windows propose un vrai installateur, pas un déballage', () => {
    // « oneClick » installerait sans rien demander et sans laisser choisir
    // l'emplacement — le contraire de ce qu'on attend d'une installation.
    assert.equal(build.nsis.oneClick, false);
    assert.equal(build.nsis.allowToChangeInstallationDirectory, true);
    assert.equal(build.nsis.createStartMenuShortcut, true);
    assert.equal(build.nsis.createDesktopShortcut, true);
    // perMachine: false installe pour l'utilisateur courant, donc sans droits
    // d'administrateur — une demande d'élévation fait renoncer beaucoup de monde.
    assert.equal(build.nsis.perMachine, false);
  });

  test('macOS déclare pourquoi il demande la caméra et le micro', () => {
    // Sans ces deux descriptions dans l'Info.plist, macOS REFUSE l'accès :
    // l'application se lance, l'appel démarre, et il n'y a ni image ni son.
    // Pour une application d'appel vidéo, c'est une panne totale, et elle ne
    // se manifeste que sur un vrai Mac.
    const info = build.mac.extendInfo || {};
    assert.ok(info.NSCameraUsageDescription, 'sans quoi la caméra est refusée par le système');
    assert.ok(info.NSMicrophoneUsageDescription, 'sans quoi le micro est refusé par le système');
  });

  test('le .dmg fonctionne sur les Mac Intel comme sur les Apple Silicon', () => {
    // Sans architecture précisée, electron-builder ne produit que celle de la
    // machine qui construit. L'exécuteur GitHub étant en Apple Silicon, la
    // moitié des Mac se retrouvait sans fichier utilisable — sans que rien
    // ne le signale, puisqu'un .dmg était bien publié.
    const dmg = build.mac.target.find((c) => (c.target || c) === 'dmg');
    assert.ok(dmg?.arch?.includes('universal'),
      'le .dmg doit être universel, sinon il ne marche que sur une architecture');
  });

  test('la ligne de commande n’écrase pas les cibles configurées', () => {
    // Le piège dans lequel cette configuration est déjà tombée : « arch:
    // universal » était bien écrit, et le .dmg publié était quand même en
    // arm64 seul. Nommer une cible en ligne de commande — « --mac dmg » —
    // remplace la configuration au lieu de la compléter, et l'architecture
    // repart à celle de la machine.
    //
    // Le plus dangereux est que rien n'échoue : un fichier est produit, le
    // workflow est vert, la publication part. Seul un Mac Intel découvre le
    // problème, et il n'a personne à qui le dire.
    for (const [cible, drapeau] of [
      ['build:win', '--win'], ['build:mac', '--mac'], ['build:linux', '--linux'],
    ]) {
      const commande = paquetBureau.scripts[cible];
      const apres = commande.slice(commande.indexOf(drapeau) + drapeau.length).trim();
      const premier = apres.split(/\s+/)[0] || '';
      assert.ok(premier.startsWith('--'),
        `${cible} nomme « ${premier} » après ${drapeau} : la configuration sera ignorée`);
    }
  });

  test('Linux offre une vraie installation, pas seulement un fichier portable', () => {
    // Une AppImage ne s'installe pas : ni entrée de menu, ni icône, ni
    // désinstallation. Les paquets, si.
    for (const cible of ['AppImage', 'deb', 'rpm']) {
      assert.ok(build.linux.target.includes(cible), `cible Linux manquante : ${cible}`);
    }
    // Ces deux champs ne sont pas décoratifs : sans eux, fpm refuse de
    // fabriquer le paquet et la construction Linux s'arrête en entier —
    // AppImage comprise, qui était pourtant déjà produite.
    assert.ok(build.linux.maintainer,
      'un paquet .deb sans mainteneur ne se construit pas du tout');
    assert.ok(paquetBureau.homepage,
      'sans « homepage », electron-builder refuse de construire le .deb');
    assert.ok(paquetBureau.license,
      'la licence apparaît dans « apt show » et « dnf info »');
    assert.match(build.linux.category, /Network/,
      'sans catégorie, l’application n’apparaît nulle part dans le menu');
  });

  test('l’application aura bien une icône dans le menu Linux', () => {
    // Avec un fichier PNG unique, electron-builder range l'icône dans
    // « /usr/share/icons/hicolor/0x0/apps/ ». Elle est donc bien installée —
    // et introuvable, car aucun bureau ne cherche dans « 0x0 ». Le paquet
    // s'installe, l'application se lance, et son entrée de menu est vide.
    // Il faut un dossier de tailles nommées.
    assert.equal(build.linux.icon, 'build/icons');
    const dossier = path.join(ROOT, 'desktop/build/icons');
    const tailles = fs.readdirSync(dossier).filter((f) => f.endsWith('.png')).sort();
    for (const attendue of ['16x16.png', '32x32.png', '48x48.png', '64x64.png',
      '128x128.png', '256x256.png', '512x512.png']) {
      assert.ok(tailles.includes(attendue), `taille d’icône manquante : ${attendue}`);
    }
    // Le nom du fichier doit correspondre à ses dimensions réelles, sinon
    // c'est ce nom qui ment et l'icône s'affiche floue ou pas du tout.
    for (const nom of tailles) {
      const entete = fs.readFileSync(path.join(dossier, nom));
      const largeur = entete.readUInt32BE(16);
      const hauteur = entete.readUInt32BE(20);
      assert.equal(`${largeur}x${hauteur}.png`, nom,
        `${nom} mesure en réalité ${largeur}x${hauteur}`);
    }
  });

  test('l’entrée de menu ne contient pas de champ mal formé', () => {
    // Le niveau « entry » supplémentaire était recopié tel quel dans le
    // fichier .desktop, produisant la ligne « entry=[object Object] » — et
    // les clés qu'il contenait n'étaient jamais appliquées.
    const bureau = build.linux.desktop || {};
    assert.ok(!('entry' in bureau),
      'electron-builder 24 attend une table plate de clés du fichier .desktop');
    for (const [cle, valeur] of Object.entries(bureau)) {
      assert.equal(typeof valeur, 'string',
        `${cle} doit être une chaîne : tout le reste finit en « [object Object] »`);
      assert.match(cle, /^[A-Z]/, `${cle} n’est pas une clé de fichier .desktop`);
    }
    assert.ok(bureau.Name, 'le nom affiché dans le menu doit être choisi');
    assert.ok(bureau.StartupWMClass,
      'sans cela, la fenêtre n’est pas rattachée à son icône dans la barre des tâches');
  });

  test('le workflow publie bien les paquets qu’il construit', () => {
    for (const extension of ['*.AppImage', '*.deb', '*.rpm']) {
      assert.ok(workflow.includes(extension), `non publié : ${extension}`);
    }
    assert.match(workflow, /install -y -qq rpm/,
      'sans rpmbuild sur l’exécuteur, la construction Linux échoue en entier');
  });
});
