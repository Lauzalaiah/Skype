/**
 * Skip — application de bureau (Electron).
 *
 * Le serveur (zéro dépendance, écrit pour tourner seul) est démarré ICI, dans
 * le processus principal — Electron embarque déjà Node.js, inutile d'en
 * héberger un séparément. L'application est donc autonome : aucun serveur à
 * installer à part, aucune adresse à configurer, les données restent sur la
 * machine de l'utilisateur.
 */
import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { surveillerMisesAJour } from './maj.js';
import { adresseServeur, definirAdresseServeur } from './serveur-partage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Une seule instance à la fois : la seconde invocation redonne le focus à la
// première plutôt que d'ouvrir une fenêtre en double, comme les vraies
// applications de bureau.
//
// app.quit() ne coupe PAS l'exécution du fichier : sans cette sortie
// immédiate, la seconde instance continuerait et démarrerait un deuxième
// serveur sur le même dossier de données avant de se fermer.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// Application locale d'abord : pas de vérification de connectivité en
// arrière-plan ni de résolution DNS-sur-HTTPS superflue vers des serveurs
// tiers — rien de tout cela n'est nécessaire pour parler à son propre serveur.
app.commandLine.appendSwitch('disable-background-networking');

// Electron nomme le dossier de données d'après le nom du paquet npm
// (« skip-desktop ») et fige ce chemin avant l'exécution de ce
// fichier : app.setName() seul arrive trop tard. On impose donc le chemin
// explicitement, pour que les conversations vivent dans %APPDATA%\Skip
// plutôt que dans un dossier au nom technique.
app.setName('Skip');
app.setPath('userData', path.join(app.getPath('appData'), 'Skip'));

let mainWindow = null;

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

/** Démarre le serveur local et renvoie le port réellement attribué. */
async function demarrerServeur() {
  process.env.HOST = '127.0.0.1';       // usage local uniquement, jamais exposé sur le réseau
  process.env.PORT = '0';               // 0 = le système choisit un port libre : aucun conflit possible
  process.env.SKIP_DATA_DIR = path.join(app.getPath('userData'), 'data');

  const entree = app.isPackaged
    ? path.join(process.resourcesPath, 'server', 'index.js')
    : path.join(__dirname, '..', 'server', 'index.js');

  const { server } = await import(pathToFileURL(entree).href);

  if (server.listening) return server.address().port;
  return new Promise((resolve) => server.once('listening', () => resolve(server.address().port)));
}

let adresseLocale = '';

/**
 * Charge l'adresse voulue, avec un filet : si le serveur partagé ne répond
 * pas, on retombe sur le serveur embarqué plutôt que de laisser l'utilisateur
 * devant une page d'erreur — sans interface, il n'aurait plus aucun moyen de
 * corriger son adresse.
 */
function chargerServeur(fenetre) {
  const distant = adresseServeur();
  fenetre.loadURL(distant || adresseLocale);

  if (!distant) return;

  fenetre.webContents.once('did-fail-load', (_e, code, description, url, principale) => {
    if (!principale || code === -3) return;   // -3 : chargement interrompu volontairement
    console.warn(`[skip] serveur partagé injoignable (${description}) : retour au serveur local`);
    dialog.showErrorBox(
      'Serveur injoignable',
      `${url}\n\n${description}\n\nSkype revient à son serveur local. `
      + 'Vous pourrez saisir une autre adresse depuis l’écran de connexion.'
    );
    definirAdresseServeur('');
    fenetre.loadURL(adresseLocale);
  });
}

function creerFenetre(port) {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 760,
    minHeight: 480,
    title: 'Skip',
    backgroundColor: '#ffffff',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // N'expose que l'état des mises à jour — rien d'autre du système.
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  adresseLocale = `http://127.0.0.1:${port}`;
  chargerServeur(mainWindow);

  // Les liens externes (aide, à propos…) s'ouvrent dans le navigateur du
  // système plutôt que dans une fenêtre Electron sans barre d'adresse.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const interne = url.startsWith(adresseLocale)
      || (adresseServeur() && url.startsWith(adresseServeur()));
    if (!interne) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

/**
 * Un démarrage qui échoue doit le dire. Sans cela, l'application se ferme
 * sans un mot : impossible à diagnostiquer pour qui l'utilise, et invisible
 * pour qui la teste.
 *
 * Mais une fois la fenêtre ouverte, la règle s'inverse : fermer Skip parce
 * qu'une promesse a échoué quelque part — une vérification de mise à jour, une
 * requête réseau perdue — couperait une conversation en cours pour un incident
 * dont l'utilisateur n'a que faire. Après le démarrage, on journalise et on
 * continue.
 */
let demarre = false;

function signalerEchec(err) {
  const message = String(err?.stack || err);

  if (demarre) {
    console.error('[skip] erreur ignorée après démarrage :', message);
    return;
  }

  console.error('[skip] démarrage impossible :', message);
  try {
    dialog.showErrorBox('Skip n’a pas pu démarrer', message);
  } catch {
    /* si même la boîte de dialogue échoue, la console reste */
  }
  app.quit();
}

process.on('uncaughtException', signalerEchec);
process.on('unhandledRejection', signalerEchec);

app.whenReady().then(async () => {
  // Micro et caméra : Electron ne propose pas la boîte de dialogue
  // d'autorisation automatique d'un navigateur, il faut répondre soi-même.
  // On autorise uniquement ce que l'application locale peut légitimement
  // demander — jamais l'accès au système de fichiers ou autre.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(['media', 'display-capture', 'notifications', 'clipboard-sanitized-write'].includes(permission));
  });

  // L'application web demande où elle tourne, et peut changer de serveur.
  ipcMain.handle('bureau:etat', () => ({
    serveur: adresseServeur(),
    local: adresseLocale,
    version: app.getVersion(),
  }));

  ipcMain.handle('bureau:serveur', (_evenement, valeur) => {
    const propre = definirAdresseServeur(valeur);
    if (mainWindow) chargerServeur(mainWindow);
    return propre;
  });

  const port = await demarrerServeur();
  creerFenetre(port);
  surveillerMisesAJour();
  demarre = true;

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) creerFenetre(port);
  });
}).catch(signalerEchec);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
