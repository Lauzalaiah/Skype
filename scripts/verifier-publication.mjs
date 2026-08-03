#!/usr/bin/env node
/**
 * Vérifie qu'une publication est saine AVANT qu'elle ne parte.
 *
 * Une mise à jour ratée ne se voit pas : l'application installée continue de
 * tourner, ne dit rien, et reste sur son ancienne version pour toujours. Il
 * n'y a pas de message d'erreur à attendre, pas de plainte d'utilisateur —
 * juste un parc qui ne bouge plus. C'est pourquoi tout se vérifie ici, avant.
 *
 * Les cinq façons dont une publication peut être muette :
 *
 *   1. le fichier de description annonce une version différente de celle de
 *      l'application → l'application se met à jour, redémarre sur le même
 *      numéro, se remet à jour… en boucle ;
 *   2. il désigne un fichier qui n'est pas publié → téléchargement en 404 ;
 *   3. son empreinte ne correspond pas au fichier → l'application refuse
 *      d'installer après avoir tout téléchargé, sans rien dire ;
 *   4. la version publiée n'est pas plus récente que la précédente → personne
 *      ne reçoit rien, et la page de téléchargement recule ;
 *   5. il manque un fichier de description pour un système → ce système ne
 *      recevra plus jamais de mise à jour.
 *
 * Usage :
 *   node scripts/verifier-publication.mjs <dossier> <version> [version-publiée]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [dossier, version, versionPubliee] = process.argv.slice(2);

if (!dossier || !version) {
  console.error('usage : verifier-publication.mjs <dossier> <version> [version-publiée]');
  process.exit(2);
}

const problemes = [];
const constate = (texte) => console.log('  ✓', texte);
const probleme = (texte) => { console.log('  ✗', texte); problemes.push(texte); };

/** Compare deux numéros « 8.132.0 ». Vrai si a est strictement plus récent que b. */
export function plusRecente(a, b) {
  const decouper = (v) => String(v).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const [x, y] = [decouper(a), decouper(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
}

/** Lecture volontairement minimale : ces fichiers ont une forme connue et fixe. */
function lireDescription(texte) {
  const fichiers = [...texte.matchAll(/- url:\s*(\S+)\s*\n\s*sha512:\s*(\S+)\s*\n\s*size:\s*(\d+)/g)]
    .map(([, url, sha512, size]) => ({ url, sha512, size: Number(size) }));
  return { version: texte.match(/^version:\s*(\S+)/m)?.[1], fichiers };
}

const presents = fs.existsSync(dossier) ? fs.readdirSync(dossier) : [];
if (!presents.length) {
  console.error(`dossier vide ou introuvable : ${dossier}`);
  process.exit(1);
}

console.log(`Publication de la version ${version} — ${presents.length} fichiers`);

// ── 4. Ne jamais reculer ────────────────────────────────────────────────
if (versionPubliee) {
  if (plusRecente(version, versionPubliee)) {
    constate(`${version} est bien plus récente que ${versionPubliee}`);
  } else {
    probleme(`${version} n'est pas plus récente que la version déjà publiée (${versionPubliee})`);
  }
}

// ── 5. Aucun système laissé sans mise à jour ────────────────────────────
const DESCRIPTIONS = {
  'latest.yml': 'Windows',
  'latest-mac.yml': 'macOS',
  'latest-linux.yml': 'Linux',
};

for (const [nom, systeme] of Object.entries(DESCRIPTIONS)) {
  if (!presents.includes(nom)) {
    probleme(`${systeme} n'a pas de fichier de description (${nom}) : ce système ne recevra plus rien`);
  }
}

// ── 1, 2, 3. Chaque description doit dire la vérité ─────────────────────
for (const nom of presents.filter((f) => /^latest.*\.yml$/.test(f))) {
  const description = lireDescription(fs.readFileSync(path.join(dossier, nom), 'utf8'));

  if (description.version !== version) {
    probleme(`${nom} annonce la version ${description.version}, l'application est en ${version}`);
  } else {
    constate(`${nom} annonce bien ${version}`);
  }

  if (!description.fichiers.length) {
    probleme(`${nom} ne désigne aucun fichier`);
    continue;
  }

  for (const fichier of description.fichiers) {
    const chemin = path.join(dossier, fichier.url);

    if (!fs.existsSync(chemin)) {
      probleme(`${nom} désigne « ${fichier.url} », qui n'est pas publié`);
      continue;
    }

    const contenu = fs.readFileSync(chemin);
    const empreinte = crypto.createHash('sha512').update(contenu).digest('base64');

    if (empreinte !== fichier.sha512) {
      probleme(`${fichier.url} : empreinte différente de celle annoncée dans ${nom}`);
    } else if (contenu.length !== fichier.size) {
      probleme(`${fichier.url} : taille ${contenu.length}, annoncée ${fichier.size}`);
    } else {
      constate(`${fichier.url} correspond à son empreinte (${(contenu.length / 1048576).toFixed(1)} Mo)`);
    }
  }
}

if (problemes.length) {
  console.error(`\n${problemes.length} problème(s) : publication refusée.`);
  console.error('Publier malgré tout produirait une mise à jour silencieusement inopérante.');
  process.exit(1);
}

console.log('\nPublication saine.');
