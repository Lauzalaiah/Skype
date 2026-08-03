/**
 * Skype Reborn — serveur HTTP + WebSocket, sans aucune dépendance externe.
 *   node server/index.js            (port 3000 par défaut)
 *   PORT=8080 node server/index.js
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, save, saveSync } from './store.js';
import * as M from './models.js';
import { createApi } from './api.js';
import { WebSocketServer } from './ws.js';
import { Hub, handleSocketMessage } from './realtime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
// « || » traiterait PORT=0 comme absent et retomberait sur 3000, alors que 0
// a un sens précis pour Node : laisser le système attribuer un port libre
// (utilisé par l'application de bureau, pour ne jamais entrer en conflit).
const PORT = process.env.PORT !== undefined ? Number(process.env.PORT) : 3000;
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const hub = new Hub();
const { router, json } = createApi(hub);

function serveStatic(req, res, pathname) {
  // On reste strictement à l'intérieur de public/ : pas de traversée de répertoire.
  const relative = decodeURIComponent(pathname).replace(/^\/+/, '');
  let filePath = path.resolve(PUBLIC_DIR, relative || 'index.html');
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Accès refusé');
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!fs.existsSync(filePath)) {
    // Application monopage : toute route inconnue renvoie index.html.
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }

  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const etag = `W/"${stat.size}-${Number(stat.mtimeMs).toString(36)}"`;

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304).end();
    return;
  }

  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    ETag: etag,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Max-Age': '86400',
    });
    return res.end();
  }

  // Un client hébergé ailleurs (application native, front séparé) doit pouvoir
  // appeler l'API : le préflight ne suffit pas, la réponse réelle doit porter
  // l'en-tête elle aussi.
  if (url.pathname.startsWith('/api/') && req.headers.origin) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Vary', 'Origin');
  }

  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);

  const route = router.match(req.method, url.pathname);
  if (!route) return json(res, 404, { error: 'Point d’API inconnu.' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('token');
  const ctx = { req, res, url, params: route.params, token, user: M.sessionUser(token) };

  try {
    const result = await route.handler(ctx);
    if (result !== null && !res.headersSent) json(res, 200, result);
  } catch (err) {
    if (res.headersSent) return;
    const status = err.status || 500;
    if (status >= 500) console.error('[api]', req.method, url.pathname, err);
    json(res, status, { error: err.message || 'Erreur interne du serveur.' });
  }
});

// ── WebSocket ─────────────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (socket, req, url) => {
  const user = M.sessionUser(url.searchParams.get('token'));
  if (!user) {
    socket.send({ type: 'error', message: 'Authentification requise.' });
    socket.close(4001, 'unauthorized');
    return;
  }

  socket.data.userId = user.id;
  hub.register(user.id, socket);

  socket.on('json', (msg) => {
    try {
      handleSocketMessage(hub, socket, user, msg);
    } catch (err) {
      console.error('[ws]', msg?.type, err.message);
      socket.send({ type: 'error', message: err.message });
    }
  });

  socket.on('close', () => hub.unregister(user.id, socket));
  socket.on('error', () => hub.unregister(user.id, socket));
});

// ── Démarrage ─────────────────────────────────────────────────────────────────

// Tout le monde est hors ligne au démarrage : aucun socket n'est encore connecté.
for (const user of Object.values(db.users)) user.status = 'offline';
save();

server.listen(PORT, HOST, () => {
  const count = Object.keys(db.users).length;
  // PORT peut valoir 0 (« choisis-en un ») : on annonce le port réellement
  // attribué, sinon l'adresse affichée ne mène nulle part.
  const port = server.address().port;
  console.log(`
  ╭──────────────────────────────────────────────╮
  │   S k y p e   R e b o r n   ·   v8.130.0     │
  ╰──────────────────────────────────────────────╯

  ▸ Application : http://localhost:${port}
  ▸ Publicité   : http://localhost:${port}/pub
  ▸ ${count} compte${count > 1 ? 's' : ''} enregistré${count > 1 ? 's' : ''}${count === 0 ? "  (lancez « npm run seed » pour des comptes de démo)" : ''}

  Ctrl+C pour arrêter.
`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log('\nArrêt du serveur…');
    wss.close();
    server.close();
    saveSync();
    process.exit(0);
  });
}

export { server, hub };
