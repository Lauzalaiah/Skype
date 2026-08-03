/**
 * Pont entre l'application web et le processus principal.
 *
 * Il n'expose que trois fonctions, toutes liées aux mises à jour. L'interface
 * ne reçoit jamais `ipcRenderer` ni quoi que ce soit qui permettrait
 * d'atteindre le système : la page reste exactement aussi limitée que dans un
 * navigateur, ce qui est le but de `contextIsolation` et de `sandbox`.
 *
 * En CommonJS (`.cjs`) volontairement : un préchargement en bac à sable est
 * toujours chargé comme un module CommonJS, quel que soit le « type » déclaré
 * dans package.json.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('skypeMaj', {
  /** S'abonne à l'état de la mise à jour, et le demande immédiatement. */
  surEtat(rappel) {
    ipcRenderer.on('maj:etat', (_evenement, etat) => rappel(etat));
    ipcRenderer.send('maj:etat-demande');
  },

  /** Redémarre l'application sur la nouvelle version. */
  installer: () => ipcRenderer.invoke('maj:installer'),

  /** Ouvre les nouveautés dans le navigateur du système. */
  ouvrirNouveautes: () => ipcRenderer.invoke('maj:nouveautes'),
});

/**
 * De quoi choisir un serveur partagé. Sans cela, deux personnes qui installent
 * l'application ne se verraient jamais : chacune parlerait au serveur que sa
 * propre installation embarque.
 */
contextBridge.exposeInMainWorld('skypeBureau', {
  /** { serveur, local, version } — serveur vide = celui embarqué. */
  etat: () => ipcRenderer.invoke('bureau:etat'),

  /** Change de serveur et recharge la fenêtre dessus. Vide = retour au local. */
  definirServeur: (adresse) => ipcRenderer.invoke('bureau:serveur', adresse),
});
