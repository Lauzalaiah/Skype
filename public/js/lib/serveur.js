/**
 * Adresse du serveur Skype.
 *
 * Sur le web et en application installée depuis Safari, la page vient du
 * serveur lui-même : les chemins relatifs suffisent, et rien ne change.
 *
 * Dans une application native (Capacitor), la page est servie depuis
 * `capacitor://localhost` : « /api/… » désignerait le paquet embarqué, pas le
 * serveur. Il faut donc une adresse explicite. Elle peut venir :
 *
 *   1. de la coquille native, via `window.SKYPE_SERVER` ;
 *   2. d'un réglage saisi par l'utilisateur, conservé localement ;
 *   3. à défaut, de l'origine de la page — le cas normal sur le web.
 */

const CLE = 'skype.server';

/**
 * L'application de bureau, elle, ne se contente pas de préfixer les chemins :
 * sa fenêtre charge directement l'adresse choisie, ce qui remet tout — API,
 * WebSocket, fichiers, images — sur une seule origine. Le choix vit donc côté
 * Electron, et non dans le stockage local de la page.
 */
export const estBureau = () => typeof globalThis.skypeBureau?.definirServeur === 'function';

let bureau = { serveur: '', local: '', version: '' };

/** À appeler au démarrage : récupère l'état du bureau avant tout affichage. */
export async function initialiserServeur() {
  if (!estBureau()) return;
  try {
    bureau = await globalThis.skypeBureau.etat();
  } catch {
    /* on garde les valeurs par défaut : l'application reste utilisable */
  }
}

/** Origines depuis lesquelles les chemins relatifs ne mènent nulle part. */
const ORIGINE_LOCALE = /^(capacitor|ionic|file):/i;

const nettoyer = (valeur) => String(valeur || '').trim().replace(/\/+$/, '');

/** L'application tourne-t-elle dans une coquille native ? */
export const estNatif = () =>
  ORIGINE_LOCALE.test(location.protocol) || location.protocol === 'file:';

/** Adresse configurée par l'utilisateur, si elle existe. */
export const serveurChoisi = () => {
  if (estBureau()) return nettoyer(bureau.serveur);
  try {
    return nettoyer(localStorage.getItem(CLE)) || '';
  } catch {
    return '';
  }
};

/**
 * Enregistre l'adresse du serveur. Une chaîne vide efface le réglage et
 * ramène au comportement par défaut.
 */
export function definirServeur(valeur) {
  const propre = nettoyer(valeur);

  // Sur le bureau, c'est Electron qui décide et qui recharge la fenêtre sur la
  // nouvelle adresse : rien à mémoriser ici.
  if (estBureau()) {
    bureau = { ...bureau, serveur: propre };
    globalThis.skypeBureau.definirServeur(propre);
    return propre;
  }

  try {
    if (propre) localStorage.setItem(CLE, propre);
    else localStorage.removeItem(CLE);
  } catch {
    /* stockage indisponible : on continue sans mémoriser */
  }
  return propre;
}

/**
 * Base à préfixer aux chemins d'API. Chaîne vide sur le web : les chemins
 * relatifs restent relatifs, ce qui évite toute régression.
 */
export function baseServeur() {
  const explicite = nettoyer(globalThis.SKYPE_SERVER) || serveurChoisi();
  if (explicite) return explicite;
  if (estNatif()) return '';        // aucune adresse : l'appelant devra en demander une
  return '';                         // web : même origine, chemins relatifs
}

/** Vrai quand l'application ne sait pas à qui parler. */
export const serveurManquant = () => estNatif() && !baseServeur();

/** Transforme « /api/x » en URL absolue si une base est configurée. */
export const url = (chemin) => {
  const base = baseServeur();
  if (!base) return chemin;
  return chemin.startsWith('/') ? base + chemin : `${base}/${chemin}`;
};

/** Adresse WebSocket correspondante. */
export function urlSocket(chemin) {
  const base = baseServeur();
  if (!base) {
    const protocole = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocole}//${location.host}${chemin}`;
  }
  return base.replace(/^http/i, 'ws') + chemin;
}

/** Vérifie qu'une adresse répond bien comme un serveur Skype. */
export async function tester(adresse) {
  const base = nettoyer(adresse);
  if (!/^https?:\/\//i.test(base)) {
    throw new Error('L’adresse doit commencer par http:// ou https://');
  }
  let reponse;
  try {
    reponse = await fetch(`${base}/api/health`, { method: 'GET' });
  } catch {
    throw new Error('Serveur injoignable à cette adresse.');
  }
  if (!reponse.ok) throw new Error(`Le serveur a répondu ${reponse.status}.`);
  const info = await reponse.json().catch(() => null);
  if (!info || info.service !== 'skype') {
    throw new Error('Cette adresse ne répond pas comme un serveur Skype.');
  }

  const probleme = incompatibilite(info.protocole);
  if (probleme) throw new Error(probleme);
  return info;
}

/**
 * Ce que l'application sait parler. À n'incrémenter que le jour où un client
 * plus ancien cesserait réellement de fonctionner — voir server/protocole.js.
 */
export const PROTOCOLE_ATTENDU = 1;

/**
 * Deux versions différentes n'empêchent pas de se parler ; deux protocoles
 * différents, si. Le message doit dire *qui* doit agir, sinon la personne
 * bloquée cherche du côté qu'il ne faut pas — l'utilisateur ne peut rien
 * faire pour un serveur trop ancien, et l'administrateur ne peut rien faire
 * pour une application trop ancienne.
 *
 * Un serveur qui ne renvoie rien du tout est un serveur d'avant cette
 * mesure : il est accepté. Refuser tout ce qui est déjà déployé serait le
 * comble pour un mécanisme censé préserver la compatibilité.
 */
export function incompatibilite(protocoleDuServeur, attendu = PROTOCOLE_ATTENDU) {
  if (protocoleDuServeur === undefined || protocoleDuServeur === null) return null;

  const serveur = Number(protocoleDuServeur);
  if (!Number.isFinite(serveur)) return null;

  if (serveur > attendu) {
    return 'Ce serveur est plus récent que cette application. Mettez à jour Skype pour vous y connecter.';
  }
  if (serveur < attendu) {
    return 'Ce serveur est trop ancien pour cette application. Son administrateur doit le mettre à jour.';
  }
  return null;
}
