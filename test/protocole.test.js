/**
 * La compatibilité entre une application installée et un serveur distant.
 *
 * Dans un navigateur, la question ne se pose pas : la page vient du serveur.
 * L'application installée, elle, embarque son interface et vise un serveur
 * qu'elle ne contrôle pas — et personne ne mettra jamais les deux à jour le
 * même jour. Sans contrat explicite, un couple incompatible ne se manifeste
 * pas par un message, mais par des fonctions qui ne marchent plus sans qu'on
 * sache pourquoi.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROTOCOLE } from '../server/protocole.js';
import { incompatibilite, PROTOCOLE_ATTENDU } from '../public/js/lib/serveur.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

describe('Compatibilité entre versions', () => {
  test('le serveur et le client attendent le même protocole', () => {
    assert.equal(PROTOCOLE_ATTENDU, PROTOCOLE,
      'les deux moitiés du projet doivent être d’accord sur ce qu’elles parlent');
  });

  test('un serveur d’avant cette mesure reste utilisable', () => {
    // C'est le cas le plus important : tous les serveurs déjà installés
    // ne renvoient rien à cet endroit. Les refuser aurait mis hors service
    // l'ensemble du parc au nom de la compatibilité.
    assert.equal(incompatibilite(undefined), null);
    assert.equal(incompatibilite(null), null);
    assert.equal(incompatibilite('pas un nombre'), null);
  });

  test('un serveur au même protocole est accepté', () => {
    assert.equal(incompatibilite(1, 1), null);
  });

  test('un serveur plus récent demande de mettre à jour l’application', () => {
    const message = incompatibilite(2, 1);
    assert.match(message, /Mettez à jour Skip/,
      'c’est à l’utilisateur d’agir, et le message doit le lui dire');
    assert.doesNotMatch(message, /administrateur/);
  });

  test('un serveur plus ancien renvoie vers son administrateur', () => {
    const message = incompatibilite(1, 2);
    assert.match(message, /administrateur/,
      'l’utilisateur ne peut rien faire : inutile de lui demander de chercher');
    assert.doesNotMatch(message, /Mettez à jour Skip/);
  });

  test('le protocole est exposé par le contrôle de santé', () => {
    const api = fs.readFileSync(path.join(ROOT, 'server/api.js'), 'utf8');
    const sante = api.slice(api.indexOf("router.get('/api/health'"));
    assert.match(sante.slice(0, 400), /protocole: PROTOCOLE/,
      'sans cela le client n’a rien à interroger');
  });

  test('le protocole ne suit pas le numéro de version', () => {
    // S'il le suivait, chaque correctif rendrait incompatibles des couples
    // qui fonctionnent parfaitement — et plus personne ne pourrait se
    // connecter à un serveur qui a une version de retard.
    const paquet = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.notEqual(String(PROTOCOLE), paquet.version);
    assert.equal(typeof PROTOCOLE, 'number');
    assert.ok(Number.isInteger(PROTOCOLE) && PROTOCOLE >= 1);
  });

  test('la raison de chaque incrément est écrite quelque part', () => {
    // Sans historique, personne ne saura plus, dans un an, pourquoi le
    // numéro vaut ce qu'il vaut — ni s'il faut l'incrémenter.
    const source = fs.readFileSync(path.join(ROOT, 'server/protocole.js'), 'utf8');
    assert.match(source, /Historique/);
    for (let n = 1; n <= PROTOCOLE; n += 1) {
      assert.match(source, new RegExp(`^\\s*\\*\\s+${n}\\s`, 'm'),
        `le protocole ${n} n’est pas documenté dans l’historique`);
    }
  });
});

describe('Le changement de nom ne coupe rien', () => {
  const serveur = fs.readFileSync(path.join(ROOT, 'public/js/lib/serveur.js'), 'utf8');
  const store = fs.readFileSync(path.join(ROOT, 'server/store.js'), 'utf8');

  test('un serveur pas encore renommé reste joignable', () => {
    // Il annonce encore « skype ». Le refuser rendrait l'application incapable
    // de se connecter à tout le parc existant, pour un mot que personne ne voit.
    assert.match(serveur, /info\.service !== 'skip' && info\.service !== 'skype'/,
      'l’ancien identifiant de service doit rester accepté');
  });

  test('l’ancienne variable d’environnement est encore lue', () => {
    // Un serveur installé la définit dans son unité systemd ou sa composition.
    // Sans elle, il repartirait sur une base vide sans le moindre message.
    assert.match(store, /process\.env\.SKIP_DATA_DIR\s*\n?\s*\|\| process\.env\.SKYPE_DATA_DIR/,
      'SKYPE_DATA_DIR doit rester un repli');
  });

  test('la base de données est reprise sous son nouveau nom', () => {
    // Sans reprise, le serveur conclurait qu'il démarre pour la première fois
    // et créerait une base vide à côté de l'ancienne : comptes et
    // conversations toujours sur le disque, mais plus personne ne peut se
    // connecter, et rien dans le journal ne dit pourquoi.
    assert.match(store, /skype\.json/, 'l’ancien chemin doit rester connu');
    assert.match(store, /fs\.renameSync\(ANCIEN_DB_PATH, DB_PATH\)/,
      'la reprise doit renommer, pas copier : deux bases vivantes divergeraient');
  });
});
