/**
 * La page de campagne présente un projet de fan. Elle ne doit jamais laisser
 * croire à un retour officiel de Skype, ni afficher d'avis inventés.
 * Ces règles sont vérifiées ici parce qu'une phrase malheureuse suffirait à
 * transformer une page honnête en usurpation.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const lire = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const pub = lire('public/pub/index.html');
const campagne = lire('ad/campagne.md');

describe('Page de campagne', () => {
  test('la mention « projet de fan, non officiel » est visible', () => {
    assert.match(pub, /Projet de fan, non officiel/,
      'le bandeau de clarification a disparu');
    // Et il est placé avant le contenu, pas relégué en pied de page.
    assert.ok(pub.indexOf('Projet de fan, non officiel') < pub.indexOf('<header>'),
      'la mention doit précéder l’en-tête de la page');
  });

  test('l’absence de lien avec Microsoft est dite explicitement', () => {
    assert.match(pub, /sans lien avec Microsoft|Aucun lien avec Microsoft/i);
    assert.match(pub, /marque de Microsoft/i,
      'l’usage nominatif de la marque doit être précisé');
  });

  test('la page n’annonce pas un retour officiel de Skype', () => {
    const interdits = [
      /Skype est de retour/i,
      /Skype revient/i,
      /le retour officiel/i,
      /Microsoft relance/i,
      /officiellement de retour/i,
    ];
    for (const motif of interdits) {
      assert.doesNotMatch(pub, motif, `formulation trompeuse : ${motif}`);
      assert.doesNotMatch(campagne.replace(/^>.*$/gm, ''), motif,
        `formulation trompeuse dans la campagne : ${motif}`);
    }
  });

  test('aucun témoignage ni note d’utilisateur inventés', () => {
    assert.doesNotMatch(pub, /★★★★★/, 'des notes en étoiles laissent croire à de vrais avis');
    assert.doesNotMatch(pub, /quote__name/, 'plus de témoignage attribué à une personne');
    assert.doesNotMatch(pub, /Ce qu’on nous dit|Ce qu'on nous dit/,
      'le projet vient de sortir : il n’a pas de retours d’utilisateurs');
  });

  test('les personnes montrées sont signalées comme fictives', () => {
    assert.match(pub, /comptes de démonstration/i,
      'les conversations illustrées doivent être signalées comme fictives');
  });

  test('la campagne rappelle les règles avant diffusion', () => {
    assert.match(campagne, /À lire avant toute diffusion/);
    assert.match(campagne, /projet de fan, non officiel/i);
    assert.match(campagne, /Aucun faux témoignage/i);
  });
});

describe('La publicité est réellement joignable', () => {
  /**
   * Une publicité sans adresse publique ne sert à rien. Elle vivait
   * uniquement sur « /pub » du serveur de l'application — que personne
   * n'héberge. Elle est donc publiée à côté du site de téléchargement, où
   * elle a une vraie adresse.
   *
   * Le même fichier sert aux deux endroits : dupliquer une page de 700 lignes
   * garantirait qu'elle diverge. Ces tests exigent qu'elle reste identique et
   * que ses chemins fonctionnent des deux côtés.
   */
  const enLigne = lire('docs/pub/index.html');

  test('la copie publiée est identique à la source', () => {
    assert.equal(enLigne, pub,
      'docs/pub/index.html a divergé : recopiez public/pub/index.html');
  });

  test('aucun chemin absolu : la page suit là où on la sert', () => {
    // « /assets/… » désignerait la racine du domaine, pas celle du site.
    assert.doesNotMatch(pub, /(?:href|src)="\/[^"]/,
      'un chemin absolu casserait la page servie depuis un sous-dossier');
    assert.doesNotMatch(pub, /'\/assets\//,
      'les sons doivent être référencés relativement');
  });

  test('chaque son référencé existe aux deux endroits', () => {
    const sons = [...pub.matchAll(/'\.\.\/assets\/sounds\/([\w.-]+)'/g)].map((m) => m[1]);
    assert.ok(sons.length >= 5, `seulement ${sons.length} son(s) référencé(s)`);
    for (const son of sons) {
      assert.ok(fs.existsSync(path.join(ROOT, 'public/assets/sounds', son)),
        `absent de l’application : ${son}`);
      assert.ok(fs.existsSync(path.join(ROOT, 'docs/assets/sounds', son)),
        `absent du site publié : ${son}`);
    }
  });

  test('le site de téléchargement renvoie vers elle', () => {
    assert.match(lire('docs/index.html'), /href="pub\/"/,
      'la publicité doit être atteignable depuis la page d’accueil');
  });

  test('la page publiée garde la mention de projet de fan', () => {
    assert.match(enLigne, /Projet de fan, non officiel/);
    assert.ok(enLigne.indexOf('Projet de fan, non officiel') < enLigne.indexOf('<header>'));
  });
});

describe('Installation sur iPhone', () => {
  const index = lire('public/index.html');
  const manifeste = JSON.parse(lire('public/manifest.webmanifest'));

  test('les balises que Safari exige sont présentes', () => {
    assert.match(index, /rel="apple-touch-icon"/);
    assert.match(index, /name="apple-mobile-web-app-capable" content="yes"/);
    assert.match(index, /name="apple-mobile-web-app-title"/);
    assert.match(index, /viewport-fit=cover/);
  });

  test('les icônes déclarées existent et sont bien des PNG', () => {
    for (const icone of manifeste.icons) {
      assert.match(icone.src, /\.png$/, 'iOS n’accepte pas de SVG pour l’écran d’accueil');
      const chemin = path.join(ROOT, 'public', icone.src);
      assert.ok(fs.existsSync(chemin), `icône absente : ${icone.src}`);
      const entete = fs.readFileSync(chemin).subarray(0, 4);
      assert.equal(entete[0], 0x89, `${icone.src} n’est pas un PNG`);
      assert.equal(entete.toString('latin1', 1, 4), 'PNG');
    }
    assert.ok(manifeste.icons.some((i) => (i.purpose || '').includes('maskable')));
  });

  test('le service worker ne met jamais les données en cache', () => {
    const sw = lire('public/sw.js');
    assert.match(sw, /const estDonnee[\s\S]*?\/api\/[\s\S]*?\/files\/[\s\S]*?\/ws/,
      'API, fichiers et WebSocket doivent être exclus du cache');
    assert.match(sw, /if \(estDonnee\(url\)\) return;/);
  });

  test('la documentation iOS ne promet pas d’IPA prêt à installer', () => {
    const doc = lire('ios/README.md');
    assert.match(doc, /ne peut pas être produit sur autre chose qu'un macOS/i,
      'la contrainte de signature doit rester explicite');
    assert.match(doc, /non signé/i);
  });
});
