/**
 * Skype Reborn — application de bureau (Electron).
 *
 * Le serveur (zéro dépendance, écrit pour tourner seul) est démarré ICI, dans
 * le processus principal — Electron embarque déjà Node.js, inutile d'en
 * héberger un séparément. L'application est donc autonome : aucun serveur à
 * installer à part, aucune adresse à configurer, les données restent sur la
 * machine de l'utilisateur.
 */
import { app, BrowserWindow, session, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Une seule instance à la fois : la seconde invocation redonne le focus à la
// première plutôt que d'ouvrir une fenêtre en double, comme les vraies
// applications de bureau.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// Application locale d'abord : pas de vérification de connectivité en
// arrière-plan ni de résolution DNS-sur-HTTPS superflue vers des serveurs
// tiers — rien de tout cela n'est nécessaire pour parler à son propre serveur.
app.commandLine.appendSwitch('disable-background-networking');

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
  process.env.SKYPE_DATA_DIR = path.join(app.getPath('userData'), 'data');

  const entree = app.isPackaged
    ? path.join(process.resourcesPath, 'server', 'index.js')
    : path.join(__dirname, '..', 'server', 'index.js');

  const { server } = await import(pathToFileURL(entree).href);

  if (server.listening) return server.address().port;
  return new Promise((resolve) => server.once('listening', () => resolve(server.address().port)));
}

function creerFenetre(port) {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 760,
    minHeight: 480,
    title: 'Skype',
    backgroundColor: '#ffffff',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  // Les liens externes (aide, à propos…) s'ouvrent dans le navigateur du
  // système plutôt que dans une fenêtre Electron sans barre d'adresse.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  // Micro et caméra : Electron ne propose pas la boîte de dialogue
  // d'autorisation automatique d'un navigateur, il faut répondre soi-même.
  // On autorise uniquement ce que l'application locale peut légitimement
  // demander — jamais l'accès au système de fichiers ou autre.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(['media', 'display-capture', 'notifications', 'clipboard-sanitized-write'].includes(permission));
  });

  const port = await demarrerServeur();
  creerFenetre(port);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) creerFenetre(port);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
