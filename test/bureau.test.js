/**
 * Serveur partagé de l'application de bureau.
 *
 * Sans ce réglage, deux personnes qui installent Skype ne peuvent pas se
 * parler : chacune s'adresse au serveur que sa propre installation embarque.
 * Le téléchargement produit alors autant d'îles que d'installations.
 *
 * Le choix fait ici — recharger la fenêtre sur l'adresse choisie plutôt que
 * préfixer les appels d'API — remet tout sur une seule origine : API,
 * WebSocket, fichiers envoyés, images. Ces tests verrouillent ce choix, car
 * revenir à des chemins préfixés casserait les fichiers sans casser la
 * connexion, ce qui ne se verrait pas tout de suite.
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
const partage = lire('desktop/serveur-partage.js');
const preload = lire('desktop/preload.cjs');
const serveur = lire('public/js/lib/serveur.js');
const auth = lire('public/js/ui/auth.js');
const app = lire('public/js/app.js');

describe('Choix du serveur, côté Electron', () => {
  test('le choix est mémorisé à côté des données de l’utilisateur', () => {
    assert.match(partage, /app\.getPath\('userData'\)/);
    assert.match(partage, /serveur\.json/);
  });

  test('seule une adresse web est acceptée', () => {
    // La fenêtre charge ce qu'on lui donne : ce n'est pas l'endroit pour
    // accepter « file:// ».
    assert.match(partage, /\^https\?:\\\/\\\//);
    assert.match(partage, /Adresse invalide/);
  });

  test('une adresse vide ramène au serveur embarqué', () => {
    assert.match(partage, /Une chaîne vide revient au serveur embarqué/);
    assert.match(main, /distant \|\| adresseLocale/);
  });

  test('un serveur injoignable ne laisse pas l’utilisateur bloqué', () => {
    // Sans interface, il n'aurait plus aucun moyen de corriger son adresse :
    // l'application serait inutilisable jusqu'à réinstallation.
    assert.match(main, /did-fail-load/);
    assert.match(main, /definirAdresseServeur\(''\)/);
    assert.match(main, /fenetre\.loadURL\(adresseLocale\)/);
  });

  test('les liens du serveur partagé restent internes à la fenêtre', () => {
    // Sinon chaque lien de l'application s'ouvrirait dans le navigateur.
    assert.match(main, /url\.startsWith\(adresseServeur\(\)\)/);
  });

  test('le pont expose de quoi lire et changer le serveur', () => {
    assert.match(preload, /skypeBureau/);
    assert.match(preload, /bureau:etat/);
    assert.match(preload, /bureau:serveur/);
  });
});

describe('Choix du serveur, côté application web', () => {
  test('le bureau est reconnu par la présence du pont', () => {
    assert.match(serveur, /export const estBureau = \(\) =>[\s\S]{0,120}skypeBureau/);
  });

  test('sur le bureau, c’est Electron qui décide — pas le stockage local', () => {
    assert.match(serveur, /if \(estBureau\(\)\) \{[\s\S]{0,240}skypeBureau\.definirServeur/,
      'le choix doit passer par le pont, sinon la fenêtre ne se recharge pas');
  });

  test('l’état du bureau est connu avant tout affichage', () => {
    // L'écran de connexion propose de changer de serveur : il doit savoir
    // lequel est actif au moment où il se dessine.
    assert.match(serveur, /export async function initialiserServeur/);
    assert.match(app, /await initialiserServeur\(\);/);
    assert.ok(app.indexOf('await initialiserServeur();') < app.indexOf('showAuth()'),
      'l’initialisation doit précéder l’écran de connexion');
  });

  test('l’écran de connexion propose de changer de serveur sur le bureau', () => {
    assert.match(auth, /estNatif\(\) \|\| estBureau\(\) \|\| serveurChoisi\(\)/);
  });

  test('l’adresse est vérifiée avant d’être adoptée', () => {
    assert.match(auth, /await tester\(champ\.value\);\s*definirServeur\(champ\.value\);/,
      'adopter une adresse sans la tester enfermerait l’utilisateur');
  });
});

describe('Ajout d’un contact', () => {
  test('le bouton ouvre directement la fenêtre de recherche', () => {
    // Il basculait vers la liste des contacts, où il fallait trouver un second
    // bouton : un détour que l'ancien Skype ne faisait pas.
    assert.match(app, /onclick: openAddContactDialog \}, \[icon\('person-add'/);
    assert.match(app, /import \{[^}]*openAddContactDialog[^}]*\} from '\.\/ui\/modals\.js'/);
  });
});
