/**
 * Mise à jour automatique de l'application de bureau.
 *
 * La source est la même que celle du site de téléchargement : les versions
 * publiées du dépôt. Le workflow y dépose, à côté des installateurs, les
 * fichiers de description (`latest.yml`, `latest-linux.yml`) que ce module lit
 * pour savoir si une version plus récente existe.
 *
 * Deux comportements, et la différence n'est pas un caprice :
 *
 *   — Windows et Linux : téléchargement en arrière-plan puis installation au
 *     redémarrage. L'utilisateur n'a rien à faire d'autre qu'accepter.
 *
 *   — macOS : impossible. macOS exige qu'une application signée par un
 *     certificat Apple pour se remplacer elle-même ; celle-ci ne l'est pas.
 *     Prétendre le contraire produirait un échec silencieux à chaque
 *     démarrage. On se contente donc de signaler la nouvelle version et de
 *     renvoyer vers la page de téléchargement.
 */
import { app, ipcMain, shell } from 'electron';
import electronUpdater from 'electron-updater';

const { autoUpdater } = electronUpdater;

const DEPOT = 'Lauzalaiah/Skype';
export const PAGE_TELECHARGEMENT = 'https://lauzalaiah.github.io/Skype/';

/** macOS ne peut pas se mettre à jour sans signature de code. */
const MISE_A_JOUR_AUTOMATIQUE_POSSIBLE = process.platform !== 'darwin';

const INTERVALLE = 6 * 60 * 60 * 1000;   // toutes les six heures
const PREMIER_DELAI = 8 * 1000;          // pas pendant le démarrage : l'ouverture doit rester rapide

/**
 * État partagé avec l'interface. Un seul objet, toujours complet : la fenêtre
 * peut se recharger à n'importe quel moment et redemander où on en est.
 */
let etat = { phase: 'inactif', version: null, notes: null };
let fenetre = null;

function publier(nouvel) {
  etat = { ...etat, ...nouvel };
  if (fenetre && !fenetre.isDestroyed()) {
    fenetre.webContents.send('maj:etat', etat);
  }
}

/** Compare deux numéros de version « 8.130.0 ». Renvoie vrai si a > b. */
export function plusRecente(a, b) {
  const decouper = (v) => String(v).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const [x, y] = [decouper(a), decouper(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
}

/**
 * macOS : on interroge simplement la dernière version publiée. Aucun
 * téléchargement, aucune installation — juste de quoi prévenir honnêtement.
 */
async function verifierSansInstaller() {
  publier({ phase: 'recherche' });
  try {
    const reponse = await fetch(`https://api.github.com/repos/${DEPOT}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    const version = await reponse.json();
    const numero = String(version.tag_name || '').replace(/^v/, '');

    if (numero && plusRecente(numero, app.getVersion())) {
      publier({ phase: 'manuel', version: numero, notes: version.html_url || null });
    } else {
      publier({ phase: 'inactif', version: null, notes: null });
    }
  } catch (err) {
    // Une vérification qui échoue n'est pas un incident : l'utilisateur peut
    // être hors ligne, ce qui est un usage prévu de cette application.
    publier({ phase: 'inactif', version: null, notes: null });
    console.warn('[skype] vérification de mise à jour impossible :', err.message);
  }
}

function brancherAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  autoUpdater.on('checking-for-update', () => publier({ phase: 'recherche' }));

  autoUpdater.on('update-available', (info) => {
    publier({ phase: 'telechargement', version: info.version, notes: null });
  });

  autoUpdater.on('update-not-available', () => {
    publier({ phase: 'inactif', version: null, notes: null });
  });

  autoUpdater.on('update-downloaded', (info) => {
    publier({
      phase: 'prete',
      version: info.version,
      notes: `https://github.com/${DEPOT}/releases/tag/v${info.version}`,
    });
  });

  autoUpdater.on('error', (err) => {
    publier({ phase: 'inactif', version: null, notes: null });
    console.warn('[skype] mise à jour impossible :', err?.message || err);
  });
}

/**
 * Branche la mise à jour sur une fenêtre. Sans effet hors application
 * empaquetée : en développement, il n'y a pas de version installée à
 * remplacer, et electron-updater refuserait de toute façon.
 */
export function surveillerMisesAJour(fenetrePrincipale) {
  fenetre = fenetrePrincipale;

  // L'interface redemande l'état à chaque chargement : elle peut être
  // rechargée bien après que la mise à jour a été téléchargée.
  ipcMain.on('maj:etat-demande', (evenement) => evenement.sender.send('maj:etat', etat));

  ipcMain.handle('maj:nouveautes', () => {
    shell.openExternal(etat.notes || PAGE_TELECHARGEMENT);
  });

  ipcMain.handle('maj:installer', () => {
    if (etat.phase !== 'prete') return false;
    // isSilent = false : l'installateur montre sa progression, comme le
    // faisait le vrai Skype. isForceRunAfter : on rouvre l'application après.
    autoUpdater.quitAndInstall(false, true);
    return true;
  });

  if (!app.isPackaged) return;

  const verifier = MISE_A_JOUR_AUTOMATIQUE_POSSIBLE
    ? () => autoUpdater.checkForUpdates().catch(() => { /* géré par l'événement « error » */ })
    : verifierSansInstaller;

  if (MISE_A_JOUR_AUTOMATIQUE_POSSIBLE) brancherAutoUpdater();

  setTimeout(verifier, PREMIER_DELAI);
  const minuterie = setInterval(verifier, INTERVALLE);
  app.on('before-quit', () => clearInterval(minuterie));
}
