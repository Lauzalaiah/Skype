/**
 * Ce qui limite l'exposition juridique du projet.
 *
 * Deux choses distinctes s'y jouent, et les confondre serait une erreur :
 *
 *   — la MARQUE. Elle appartient à Microsoft. L'employer pour dire ce que ce
 *     projet recrée est un usage nominatif, admis tant qu'il reste limité au
 *     nécessaire. L'employer comme nom de produit, de domaine, ou dans le
 *     référencement, ne l'est pas ;
 *
 *   — les SONS. Ce sont les enregistrements d'origine. Aucune formulation ne
 *     transforme un emprunt en autorisation. Ce qui est en notre pouvoir,
 *     c'est de le dire, de ne pas en tirer profit, et de pouvoir les retirer
 *     immédiatement.
 *
 * Ces tests vérifient ce qui est en notre pouvoir.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const lire = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const droits = lire('docs/DROITS.md');
const pages = ['docs/index.html', 'public/pub/index.html', 'docs/pub/index.html', 'public/index.html'];

describe('La marque n’est pas employée comme identité', () => {
  test('elle n’apparaît ni dans les titres ni dans les métadonnées', () => {
    // C'est l'usage le plus attaquable : reprendre la marque d'autrui dans le
    // titre et la description, c'est capter les recherches qui la visent.
    // Le corps du texte peut la citer pour dire ce qu'on recrée ; le
    // référencement, non.
    for (const nom of pages) {
      const page = lire(nom);
      const entete = page.slice(0, page.indexOf('</head>'));
      const titre = (entete.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
      const metas = [...entete.matchAll(/<meta[^>]+content="([^"]*)"/g)].map((m) => m[1]);
      assert.doesNotMatch(titre, /skype/i, `la marque est dans le titre de ${nom}`);
      for (const contenu of metas) {
        assert.doesNotMatch(contenu, /skype/i, `la marque est dans une métadonnée de ${nom}`);
      }
    }
  });

  test('le produit, son nom de fichier et son logo sont propres au projet', () => {
    const paquetBureau = JSON.parse(lire('desktop/package.json'));
    assert.equal(paquetBureau.build.productName, 'Skip');
    assert.doesNotMatch(paquetBureau.name, /skype/i);
    assert.doesNotMatch(paquetBureau.build.appId, /skype/i);
    for (const cle of ['win', 'mac', 'linux']) {
      assert.doesNotMatch(paquetBureau.build[cle].artifactName, /skype/i,
        `le nom du fichier téléchargé porte encore la marque (${cle})`);
    }
  });

  test('la marque est attribuée à son titulaire, jamais au projet', () => {
    for (const nom of ['docs/index.html', 'public/pub/index.html', 'LICENSE', 'docs/DROITS.md']) {
      const texte = lire(nom);
      assert.match(texte, /«\s*Skype\s*»\s+est une marque déposée de Microsoft/i,
        `attribution absente ou mal formulée dans ${nom}`);
      assert.doesNotMatch(texte, /«\s*Skip\s*»[^.]{0,40}marque[^.]{0,20}de Microsoft/i,
        `${nom} attribue « Skip » à Microsoft : c’est faux et cela se retourne`);
    }
  });
});

describe('Les emprunts sont déclarés, pas dissimulés', () => {
  test('les mentions légales existent et sont liées depuis les pages', () => {
    for (const nom of ['docs/index.html', 'public/pub/index.html']) {
      assert.match(lire(nom), /docs\/DROITS\.md/,
        `${nom} ne mène pas aux mentions légales`);
    }
  });

  test('l’origine des sons est écrite noir sur blanc', () => {
    // Les présenter comme recréés serait le seul mensonge vraiment coûteux :
    // il transformerait un emprunt assumé en dissimulation.
    assert.match(droits, /sont ceux du logiciel\s*\n?\s*d'origine/i);
    assert.match(droits, /Ils n'ont pas été recréés/i);
    assert.match(droits, /propriété de leur ayant droit/i);
  });

  test('une procédure de retrait est offerte, sans condition', () => {
    assert.match(droits, /Demander un retrait/);
    assert.match(droits, /retiré sans discuter du bien-fondé/i,
      'la promesse doit être inconditionnelle, sinon elle ne vaut rien');
    assert.match(droits, /Il n'est pas nécessaire d'être Microsoft/i);
  });

  test('le document ne se fait pas passer pour un avis juridique', () => {
    assert.match(droits, /n'est pas\s*>?\s*un avis juridique/i);
  });

  test('la licence MIT ne prétend pas couvrir les sons', () => {
    assert.match(droits, /elle ne s'étend pas aux sons/i,
      'publier sous MIT ce qu’on ne détient pas serait une fausse déclaration');
  });
});

describe('L’application survit au retrait des sons', () => {
  test('un son indisponible retombe sur une synthèse', () => {
    // C'est ce qui rend la promesse de retrait tenable : les enlever
    // n'empêche pas le logiciel de fonctionner.
    const sons = lire('public/js/lib/sounds.js');
    assert.match(sons, /repli sur la synthèse/,
      'sans repli, retirer les sons casserait l’application');
    assert.match(sons, /\.catch\(/);
  });

  test('aucun son n’est cité comme argument de vente sans son origine', () => {
    // La page de présentation met les sons en avant : elle doit donc mener
    // aux mentions qui disent d'où ils viennent.
    const pub = lire('public/pub/index.html');
    if (/sons d'origine/i.test(pub)) {
      assert.match(pub, /docs\/DROITS\.md/,
        'mettre les sons en avant sans lien vers leur origine serait une omission');
    }
  });
});
