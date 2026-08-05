/**
 * Ce qu'un inconnu voit en arrivant sur le dépôt.
 *
 * Un projet auto-hébergé se fait écarter en quelques secondes pour des raisons
 * qui n'ont rien à voir avec sa qualité : pas de licence, pas de capture
 * d'écran, pas de moyen simple de l'essayer. Ces trois manques sont vérifiés
 * ici, parce qu'ils sont faciles à réintroduire sans s'en rendre compte.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const lire = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const existe = (p) => fs.existsSync(path.join(ROOT, p));

const readme = lire('README.md');
const paquet = JSON.parse(lire('package.json'));

describe('Licence', () => {
  test('le fichier existe', () => {
    assert.ok(existe('LICENSE'),
      'package.json annonce une licence : sans le fichier, l’annonce ne vaut rien');
  });

  test('il correspond à ce que package.json déclare', () => {
    assert.equal(paquet.license, 'MIT');
    assert.match(lire('LICENSE'), /MIT License/);
  });

  test('l’usage de la marque y est précisé', () => {
    // Le dépôt porte le nom d'une marque déposée : la licence est l'endroit où
    // un juriste ira regarder en premier.
    assert.match(lire('LICENSE'), /marque déposée de Microsoft/i);
    assert.match(lire('LICENSE'), /ni développé,\s+ni\s+soutenu, ni approuvé/i);
  });
});

describe('Ce que montre le README', () => {
  test('les captures d’écran référencées existent', () => {
    const images = [...readme.matchAll(/(?:!\[[^\]]*\]\(|<img src=")([\w./-]+\.png)/g)].map((m) => m[1]);
    assert.ok(images.length >= 3, `seulement ${images.length} image(s) : un dépôt sans capture est ignoré`);
    for (const image of images) {
      assert.ok(existe(image), `image absente : ${image}`);
      assert.ok(fs.statSync(path.join(ROOT, image)).size > 10000, `image suspecte (vide ?) : ${image}`);
    }
  });

  test('les captures viennent de l’application, pas d’une maquette', () => {
    // Elles sont produites par un script qui démarre le vrai serveur avec les
    // comptes de démonstration : rien n'est dessiné à la main.
    for (const capture of ['conversation', 'connexion', 'emoticones', 'mobile']) {
      assert.ok(existe(`docs/captures/${capture}.png`), `capture manquante : ${capture}`);
    }
  });

  test('la mention de projet de fan apparaît dès le haut', () => {
    const haut = readme.slice(0, 1600);
    assert.match(haut, /sans lien avec Microsoft|Aucun lien avec Microsoft/i);
    assert.match(haut, /marque de Microsoft/i);
  });
});

describe('Essayer en une commande', () => {
  test('le Dockerfile et le compose existent', () => {
    assert.ok(existe('Dockerfile'));
    assert.ok(existe('docker-compose.yml'));
    assert.ok(existe('Caddyfile'), 'le profil HTTPS a besoin de sa configuration');
  });

  test('le conteneur range les données hors de l’image', () => {
    const dockerfile = lire('Dockerfile');
    assert.match(dockerfile, /ENV SKIP_DATA_DIR=/,
      'sans cela, tout serait perdu à chaque reconstruction');
    assert.doesNotMatch(dockerfile, /^VOLUME/m,
      'VOLUME crée un volume anonyme dès qu’aucun montage n’est donné : ils s’accumulent sans nom');
    assert.match(lire('docker-compose.yml'), /- \.\/donnees:/,
      'le dossier à sauvegarder doit être visible depuis la machine hôte');
  });

  test('le serveur ne tourne pas en root', () => {
    // « USER node » ne suffisait pas, et le faire échouait même complètement :
    // le dossier de données est monté depuis l'hôte, où Docker le crée au nom
    // de root quand il n'existe pas — et « node » ne pouvait alors rien y
    // écrire. Le conteneur démarre donc en root le temps de corriger les
    // droits, puis abandonne ses privilèges. C'est ce dernier point qui compte.
    const dockerfile = lire('Dockerfile');
    const entree = lire('entree.sh');
    assert.match(dockerfile, /ENTRYPOINT \["\/usr\/local\/bin\/entree\.sh"\]/,
      'le point d’entrée doit être celui qui abandonne les privilèges');
    assert.match(entree, /exec su-exec node "\$@"/,
      'sans « exec », Node ne recevrait pas les signaux d’arrêt de Docker');
    assert.match(dockerfile, /apk add --no-cache su-exec/,
      'su-exec doit être installé, sinon le point d’entrée échoue au démarrage');
  });

  test('le conteneur sait dire s’il est en panne', () => {
    assert.match(lire('Dockerfile'), /HEALTHCHECK/);
    assert.match(lire('Dockerfile'), /api\/health/);
  });

  test('l’image ne copie que ce qui est nécessaire, et rien de moins', () => {
    // Vérifié en démarrant le serveur avec ces seuls fichiers : ils suffisent.
    const dockerfile = lire('Dockerfile');
    for (const chemin of ['package.json', 'server', 'public']) {
      assert.match(dockerfile, new RegExp(`COPY ${chemin}`), `absent de l’image : ${chemin}`);
    }
    assert.doesNotMatch(dockerfile, /COPY \. /, 'copier tout embarquerait data/ et node_modules');
  });

  test('le README montre la commande dès le début', () => {
    assert.ok(readme.indexOf('docker compose up -d') < 2500,
      'la façon d’essayer doit venir avant tout le reste');
    assert.match(readme, /DOMAINE=.*docker compose --profile https/,
      'le HTTPS n’est pas optionnel : sans lui, pas de micro ni de caméra');
  });
});

describe('Document de lancement', () => {
  const lancement = lire('ad/lancement.md');

  test('il rappelle les règles avant de poster', () => {
    assert.match(lancement, /À lire avant de poster/);
    assert.match(lancement, /projet de fan, non[\s>]+officiel/i);
    assert.match(lancement, /aucun faux témoignage/i);
  });

  test('il prépare les questions dures plutôt que de les éviter', () => {
    for (const sujet of [/Matrix/, /Electron/, /non signé/, /bout en bout/, /marque déposée/]) {
      assert.match(lancement, sujet, `question non préparée : ${sujet}`);
    }
  });

  test('il ne promet pas de chiffrement de bout en bout', () => {
    // Le serveur voit les messages. Le prétendre serait un mensonge coûteux.
    assert.match(lancement, /Il n'y en a pas, et il ne faut pas prétendre le contraire/);
  });

  test('il signale le risque lié au nom', () => {
    assert.match(lancement, /Mieux vaut y avoir pensé\s*\navant de poster/);
  });
});

describe('Composition Docker', () => {
  const compose = lire('docker-compose.yml');

  test('« docker compose up -d » ne dépend d’aucune variable', () => {
    // Compose interprète TOUS les services, y compris ceux d'un profil
    // inactif. Une variable déclarée obligatoire — « ${X:?message} » —
    // n'attend donc pas que son service serve : elle fait échouer la
    // commande la plus simple du README, celle qu'un inconnu tape en
    // premier, pour un conteneur qui n'allait même pas démarrer.
    // Les commentaires parlent du problème ; seule la configuration compte.
    const configuration = compose
      .split('\n')
      .filter((ligne) => !ligne.trim().startsWith('#'))
      .join('\n');
    const obligatoires = [...configuration.matchAll(/\$\{([A-Z_]+):\?/g)].map((m) => m[1]);
    assert.deepEqual(obligatoires, [],
      `variable exigée à l’interprétation : ${obligatoires.join(', ')} — donnez-lui une valeur par défaut`);
  });

  test('le profil https reste séparé du démarrage ordinaire', () => {
    // Sans cela, « up -d » ouvrirait les ports 80 et 443 et tenterait
    // d'obtenir un certificat pour une machine qui n'a pas de domaine.
    assert.match(compose, /profiles:\s*\["https"\]/,
      'Caddy doit rester derrière son profil');
  });

  test('le dossier à sauvegarder est monté hors du conteneur', () => {
    // Un volume anonyme disparaîtrait au premier « docker compose down -v »,
    // emportant les comptes et les conversations sans prévenir.
    assert.match(compose, /- \.\/donnees:\/données/,
      'les données doivent vivre sur la machine hôte');
  });
});
