/**
 * Mise en page sur téléphone.
 *
 * Défaut corrigé : sur un écran de téléphone, la moitié haute de l'écran
 * restait vide et la liste des conversations était collée en bas.
 *
 * La cause tenait en une ligne. « #app » passe en « column-reverse » sur
 * mobile — les éléments s'empilent donc depuis le bas, et tout l'espace libre
 * remonte en haut. Le conteneur de la conversation réclamait « flex: 1 » alors
 * qu'il est vide (la conversation y est en position absolue), et il prenait
 * la moitié de la hauteur.
 *
 * Ce qui a rendu le défaut tenace : ce « flex: 1 » était un style EN LIGNE,
 * posé par le JavaScript. Aucune règle CSS ne pouvait le corriger.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const lire = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const app = lire('public/js/app.js');
const layout = lire('public/css/layout.css');

describe('Mise en page mobile', () => {
  test('les conteneurs ne portent aucun style en ligne', () => {
    // Un style en ligne l'emporte sur toute feuille de style : la version
    // mobile ne pourrait plus leur retirer l'espace qu'ils réservent.
    assert.match(app, /mainSlot = el\('div\.slot-main'\);/);
    assert.match(app, /detailsSlot = el\('div\.slot-details'\);/);
    assert.doesNotMatch(app, /slot-main'[^)]*style:/,
      'la mise en page du conteneur doit rester dans la feuille de style');
  });

  test('leur mise en page est bien dans la feuille de style', () => {
    assert.match(layout, /\.slot-main \{ flex: 1; display: flex; min-width: 0; \}/);
  });

  test('sur téléphone, le conteneur vide ne réserve plus d’espace', () => {
    const mobile = layout.slice(layout.indexOf('@media (max-width: 700px)'));
    assert.match(mobile, /\.slot-main, \.slot-details \{ flex: 0 0 auto;/,
      'sans cela, la moitié de l’écran reste vide');
    assert.match(mobile, /\.sidebar \{[^}]*flex: 1;/,
      'la liste doit occuper la hauteur restante');
  });

  test('la conversation reste en position absolue sur téléphone', () => {
    // C'est ce qui permet au conteneur de ne rien réserver sans faire
    // disparaître la conversation.
    const mobile = layout.slice(layout.indexOf('@media (max-width: 700px)'));
    assert.match(mobile, /\.main \{ position: absolute; inset: 0;/);
  });
});
