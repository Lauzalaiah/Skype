/**
 * Le site de téléchargement est la première chose que verra quelqu'un qui
 * cherche à retrouver la messagerie d'avant. Deux catégories d'erreurs y seraient graves :
 *
 *  - laisser croire à un retour officiel de Skip (c'est un projet de fan) ;
 *  - proposer un bouton de téléchargement qui ne mène nulle part.
 *
 * Ces tests verrouillent les deux, plus la cohérence entre ce que le workflow
 * publie et ce que la page va chercher.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const lire = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const site = lire('docs/index.html');
const workflow = lire('.github/workflows/release.yml');
const paquet = JSON.parse(lire('package.json'));

const DEPOT = 'Lauzalaiah/Skype';

describe('Site de téléchargement — honnêteté', () => {
  test('la mention « projet de fan, non officiel » précède tout le reste', () => {
    assert.match(site, /Projet de fan, non officiel/);
    assert.ok(site.indexOf('Projet de fan, non officiel') < site.indexOf('<header>'),
      'la mention doit être visible avant l’en-tête, pas reléguée en bas');
  });

  test('l’absence de lien avec Microsoft est dite explicitement', () => {
    assert.match(site, /Aucun lien\s+avec\s+Microsoft|sans lien\s+avec\s+Microsoft/i);
    assert.match(site, /«\s*Skype\s*»\s+est une marque déposée de Microsoft/i,
      'la marque doit être attribuée à son titulaire, nommément');
    assert.doesNotMatch(site, /«\s*Skip\s*»[^.]{0,40}marque[^.]{0,20}de Microsoft/i,
      'attribuer « Skip » à Microsoft serait faux et se retournerait contre le projet');
    assert.match(site, /ni développé, ni soutenu, ni approuvé par Microsoft/i,
      'la mention légale du pied de page a disparu');
  });

  test('la page n’annonce pas un retour officiel de Skip', () => {
    const interdits = [
      /Skip est de retour/i,
      /Skip revient/i,
      /le retour officiel/i,
      /Microsoft relance/i,
      /officiellement de retour/i,
      /version officielle/i,
    ];
    for (const motif of interdits) {
      assert.doesNotMatch(site, motif, `formulation trompeuse : ${motif}`);
    }
  });

  test('aucun avis ni témoignage inventés', () => {
    assert.doesNotMatch(site, /★/, 'des notes en étoiles laissent croire à de vrais avis');
    assert.doesNotMatch(site, /téléchargements? (?:déjà )?\d/i,
      'aucun compteur de téléchargements inventé');
  });

  test('les conversations illustrées sont signalées comme fictives', () => {
    assert.match(site, /comptes de démonstration/i);
  });

  test('l’absence de signature est annoncée, pas cachée', () => {
    assert.match(site, /SmartScreen|Windows a protégé votre ordinateur/,
      'le visiteur doit savoir à quoi s’attendre en ouvrant le fichier');
    assert.match(site, /Exécuter quand même/);
  });

  test('la page ne promet pas d’appels réels vers des téléphones', () => {
    assert.match(site, /aucun paiement réel/i);
    assert.match(site, /aucun appel\s+n'est réellement passé/i);
  });
});

describe('Site de téléchargement — liens et cohérence', () => {
  test('tous les liens GitHub visent le bon dépôt', () => {
    const liens = site.match(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+/g) || [];
    assert.ok(liens.length >= 5, 'la page doit renvoyer vers le dépôt');
    for (const lien of liens) {
      assert.equal(lien, `https://github.com/${DEPOT}`, `dépôt inattendu : ${lien}`);
    }
  });

  test('aucun lien ne pointe vers une branche « main » qui n’existe pas', () => {
    assert.doesNotMatch(site, /\/blob\/main\//,
      'la branche par défaut du dépôt n’est pas « main » : utiliser /blob/HEAD/');
    const fichiers = site.match(/\/blob\/HEAD\/([\w./-]+)/g) || [];
    assert.ok(fichiers.length >= 3, 'les liens vers la documentation ont disparu');
    for (const lien of fichiers) {
      const chemin = lien.replace('/blob/HEAD/', '');
      assert.ok(fs.existsSync(path.join(ROOT, chemin)), `fichier lié absent : ${chemin}`);
    }
  });

  test('la version affichée est celle du projet', () => {
    assert.match(site, new RegExp(`const VERSION = '${paquet.version.replace(/\./g, '\\.')}'`),
      'la constante VERSION du site a divergé de package.json');
    const desktop = JSON.parse(lire('desktop/package.json'));
    assert.equal(desktop.version, paquet.version,
      'l’enveloppe de bureau et le projet doivent porter le même numéro');
  });

  test('les boutons ont toujours une destination valide avant tout appel réseau', () => {
    // Chaque bouton de téléchargement est écrit dans le HTML avec la page des
    // versions comme destination : si l'API GitHub ne répond pas, on atterrit
    // sur une page réelle plutôt que sur un lien mort.
    const boutons = site.match(/data-role="lien" href="([^"]+)"/g) || [];
    assert.equal(boutons.length, 3, 'trois systèmes doivent être proposés');
    for (const bouton of boutons) {
      assert.match(bouton, new RegExp(`https://github\\.com/${DEPOT}/releases`));
    }
    assert.match(site, /id="btnPrincipal"[\s\S]{0,120}releases/,
      'le bouton principal doit aussi avoir une destination de repli');
  });

  test('l’absence de version publiée est annoncée au visiteur', () => {
    assert.match(site, /id="avertissementIndispo"/);
    assert.match(site, /ne sont pas encore publiés/i);
    assert.match(site, /avertissementIndispo'\)\.hidden = false/,
      'l’avertissement doit être révélé quand l’API ne renvoie aucun fichier');
  });

  test('la page est autonome : aucune ressource tierce chargée', () => {
    assert.doesNotMatch(site, /<script[^>]+src=/i, 'aucun script externe');
    assert.doesNotMatch(site, /<link[^>]+stylesheet/i, 'aucune feuille de style externe');
    const distants = site.match(/https?:\/\/(?!github\.com|api\.github\.com|www\.w3\.org|localhost)[\w.-]+/g) || [];
    assert.deepEqual(distants, [], `ressource distante inattendue : ${distants.join(', ')}`);
  });

  test('GitHub Pages ne passera pas la page à Jekyll', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'docs/.nojekyll')),
      'docs/.nojekyll est nécessaire pour servir le HTML tel quel');
  });
});

describe('Publication des fichiers téléchargeables', () => {
  test('le workflow construit les trois systèmes', () => {
    for (const systeme of ['windows-latest', 'macos-latest', 'ubuntu-latest']) {
      assert.ok(workflow.includes(systeme), `exécuteur manquant : ${systeme}`);
    }
    for (const cible of ['build:win', 'build:mac', 'build:linux']) {
      assert.ok(workflow.includes(cible), `cible manquante : ${cible}`);
    }
  });

  test('ce que le workflow publie est ce que la page cherche', () => {
    // Le lien entre les deux fichiers : si l'un change d'extension sans
    // l'autre, la page proposera un bouton vide sans que rien ne le signale.
    for (const [extension, motif] of [
      ['exe', /\/\\\.exe\$\/i/],
      ['dmg', /\/\\\.dmg\$\/i/],
      ['AppImage', /\/\\\.AppImage\$\/i/],
      ['deb', /\/\\\.deb\$\/i/],
      ['rpm', /\/\\\.rpm\$\/i/],
    ]) {
      assert.ok(workflow.includes(`*.${extension}`), `le workflow ne publie pas de .${extension}`);
      assert.match(site, motif, `la page ne sait pas reconnaître un .${extension}`);
    }
  });

  test('les empreintes SHA-256 sont produites, jointes et recopiées dans les notes', () => {
    assert.match(workflow, /sha256sum \*\.exe \*\.dmg \*\.AppImage \*\.deb \*\.rpm/);
    // Recopiées dans les notes, sinon la page ne peut pas les lire : le
    // téléchargement d'une pièce jointe redirige vers un hôte qui n'autorise
    // pas les requêtes venues d'une autre origine.
    assert.match(workflow, /cat publication\/SHA256SUMS\.txt/,
      'les empreintes doivent être recopiées dans les notes de version');
    assert.match(site, /version\.body/,
      'la page doit lire les empreintes dans les notes, pas dans la pièce jointe');
    assert.doesNotMatch(site, /fetch\(somme\.browser_download_url\)/,
      'une pièce jointe de release n’est pas lisible depuis un navigateur');
  });

  test('les notes de version portent la mention de projet de fan', () => {
    assert.match(workflow, /Projet de fan, non officiel/);
    assert.match(workflow, /ne sont pas signés/i,
      'les notes doivent prévenir que les fichiers ne sont pas signés');
  });

  test('la publication ne part jamais sans que les tests soient passés', () => {
    assert.match(workflow, /needs: \[verifier, construire\]/);
    assert.match(workflow, /needs: verifier/);
    assert.match(workflow, /run: npm test/);
  });

  test('tout workflow qui exécute la suite de tests demande Node 22 au moins', () => {
    // La suite se connecte au serveur avec le client WebSocket natif, apparu
    // en Node 22 : sur un exécuteur plus ancien, deux tests échouent et rien
    // ne se publie. Le serveur, lui, tourne dès Node 18.
    const dossier = path.join(ROOT, '.github/workflows');
    for (const nom of fs.readdirSync(dossier)) {
      const contenu = fs.readFileSync(path.join(dossier, nom), 'utf8');
      if (!/npm test/.test(contenu)) continue;
      const versions = [...contenu.matchAll(/node-version: '(\d+)'/g)].map((m) => Number(m[1]));
      assert.ok(versions.length, `${nom} exécute les tests sans fixer de version de Node`);
      for (const version of versions) {
        assert.ok(version >= 22, `${nom} demande Node ${version} : trop ancien pour la suite de tests`);
      }
    }
  });

  test('aucune action officielle n’est restée sur Node 20', () => {
    // GitHub a déprécié Node 20 : chaque exécution portait un avertissement,
    // sur les jobs réussis comme sur les autres. Ce n'est pas une panne, mais
    // du bruit permanent — et du bruit permanent finit par masquer un vrai
    // problème le jour où il arrive.
    //
    // Le numéro à partir duquel une action bascule sur Node 24 n'est pas le
    // même pour toutes : une montée uniforme en v5 laissait upload-artifact
    // en Node 20, et l'avertissement persistait. Ces seuils ont été relevés
    // dans le « runs.using » de chaque action, pas devinés.
    const PREMIERE_EN_NODE_24 = {
      checkout: 5,
      'setup-node': 5,
      'upload-artifact': 6,
      'download-artifact': 7,
    };
    const dossier = path.join(ROOT, '.github/workflows');
    const retards = [];
    for (const nom of fs.readdirSync(dossier)) {
      const contenu = fs.readFileSync(path.join(dossier, nom), 'utf8');
      for (const [, action, version] of contenu.matchAll(/uses: actions\/([\w-]+)@v(\d+)/g)) {
        const seuil = PREMIERE_EN_NODE_24[action];
        assert.ok(seuil, `${nom} utilise actions/${action}, dont le seuil Node 24 est inconnu ici`);
        if (Number(version) < seuil) retards.push(`${nom} : actions/${action}@v${version} (il faut v${seuil})`);
      }
    }
    assert.deepEqual(retards, [], `actions encore en Node 20 : ${retards.join(', ')}`);
  });

  test('une nouvelle publication remplace les fichiers au lieu d’échouer', () => {
    assert.match(workflow, /gh release upload "\$TAG" publication\/\* --clobber/);
  });
});
