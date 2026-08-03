/**
 * Adresse du serveur partagé, si l'utilisateur en a choisi un.
 *
 * Par défaut, l'application se sert du serveur qu'elle embarque : elle
 * fonctionne seule, hors ligne, sans rien configurer. Mais deux personnes sur
 * deux machines différentes ne peuvent alors pas se voir — chacune parle à son
 * propre serveur. Pour se retrouver, elles doivent viser le même.
 *
 * Le choix est mémorisé ici, à côté des données, et la fenêtre charge
 * directement cette adresse. C'est volontaire : tout devient de même origine —
 * API, WebSocket, fichiers envoyés, images — et il n'y a aucun cas particulier
 * à traiter dans l'application web.
 */
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const fichier = () => path.join(app.getPath('userData'), 'serveur.json');

/** Adresse choisie, ou chaîne vide pour « le serveur embarqué ». */
export function adresseServeur() {
  try {
    return String(JSON.parse(fs.readFileSync(fichier(), 'utf8')).adresse || '');
  } catch {
    return '';
  }
}

/**
 * Enregistre l'adresse. Une chaîne vide revient au serveur embarqué.
 * Refuse tout ce qui n'est pas une adresse web : la fenêtre chargera ce
 * qu'on lui donne, ce n'est pas l'endroit pour accepter « file:// ».
 */
export function definirAdresseServeur(valeur) {
  const propre = String(valeur || '').trim().replace(/\/+$/, '');

  if (propre && !/^https?:\/\/[^/\s]+/i.test(propre)) {
    throw new Error('Adresse invalide : elle doit commencer par https:// ou http://');
  }

  fs.mkdirSync(path.dirname(fichier()), { recursive: true });
  fs.writeFileSync(fichier(), JSON.stringify({ adresse: propre }, null, 2));
  return propre;
}
