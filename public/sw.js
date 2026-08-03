/**
 * Service worker : rend l'application installable et lui permet de s'ouvrir
 * sans réseau.
 *
 * Stratégie volontairement prudente :
 *   — les ressources de l'interface (HTML, CSS, JS, sons, icônes) sont servies
 *     depuis le cache puis rafraîchies en arrière-plan ;
 *   — tout ce qui touche aux données (API, WebSocket, fichiers envoyés) n'est
 *     JAMAIS mis en cache : une conversation périmée serait pire que pas de
 *     conversation du tout.
 */

const VERSION = 'skype-v1';
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

  // Ressources : cache d'abord, rafraîchi en arrière-plan.
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
