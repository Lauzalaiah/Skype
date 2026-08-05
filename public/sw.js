/**
 * Service worker : rend l'application installable et lui permet de s'ouvrir
 * sans réseau.
 *
 * Trois régimes, et la distinction compte :
 *
 *   — le CODE (HTML, CSS, JS) part du réseau, et ne retombe sur le cache que
 *     si le réseau ne répond pas. Servir du code périmé serait pire qu'inutile :
 *     la page d'accueil arrivait déjà fraîche du réseau, mais les modules
 *     JavaScript, eux, venaient du cache — une page neuve pilotée par du code
 *     ancien, jusqu'au rechargement suivant ;
 *
 *   — les RESSOURCES qui ne changent pas d'une version à l'autre (sons,
 *     icônes) partent du cache, rafraîchies en arrière-plan : c'est là que le
 *     cache fait gagner du temps, sans risque ;
 *
 *   — les DONNÉES (API, WebSocket, fichiers envoyés) ne sont jamais mises en
 *     cache : une conversation périmée serait pire que pas de conversation.
 *
 * Le nom du cache porte le numéro de version : une nouvelle version repart
 * d'un cache vide, et l'ancien est effacé à l'activation.
 */

const VERSION = 'skype-8.138.0';
const COQUILLE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/css/theme.css',
  '/css/base.css',
  '/css/layout.css',
  '/css/chat.css',
  '/css/components.css',
  '/css/calls.css',
  '/assets/icons/apple-touch-icon.png',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      // On n'échoue pas l'installation si une ressource manque à l'appel.
      .then((cache) => Promise.allSettled(COQUILLE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(noms.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

/** Les données ne se mettent pas en cache. */
const estDonnee = (url) =>
  url.pathname.startsWith('/api/')
  || url.pathname.startsWith('/files/')
  || url.pathname.startsWith('/ws');

/** Ce qui décide du comportement de l'application doit toujours être à jour. */
const estCode = (url) => /\.(html|js|css|webmanifest)$/.test(url.pathname);

/** Réseau d'abord ; le cache ne sert que si le réseau ne répond pas. */
function reseauDAbord(request) {
  return fetch(request)
    .then((reponse) => {
      if (reponse.ok) {
        const copie = reponse.clone();
        caches.open(VERSION).then((cache) => cache.put(request, copie));
      }
      return reponse;
    })
    .catch(() => caches.match(request).then((r) => r || Response.error()));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (estDonnee(url)) return;

  // Navigation : on tente le réseau, et on retombe sur la coquille hors ligne.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((reponse) => {
          const copie = reponse.clone();
          caches.open(VERSION).then((cache) => cache.put('/index.html', copie));
          return reponse;
        })
        .catch(() => caches.match('/index.html').then((r) => r || Response.error()))
    );
    return;
  }

  // Code : réseau d'abord, cache en secours hors ligne.
  if (estCode(url)) {
    event.respondWith(reseauDAbord(request));
    return;
  }

  // Ressources stables (sons, icônes) : cache d'abord, rafraîchi en arrière-plan.
  event.respondWith(
    caches.match(request).then((enCache) => {
      const reseau = fetch(request)
        .then((reponse) => {
          if (reponse.ok) {
            const copie = reponse.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copie));
          }
          return reponse;
        })
        .catch(() => enCache);
      return enCache || reseau;
    })
  );
});
