# Mettre Skype Reborn en service

L'application est un **client**. Sur un téléphone, elle ne sert à rien tant
qu'un serveur ne tourne pas quelque part de joignable. C'est l'étape que tout
le monde saute, et c'est celle qui décide si l'application fonctionne ou non.

Trois choses, dans cet ordre :

1. faire tourner le serveur quelque part ;
2. le rendre accessible en **HTTPS** ;
3. dire à l'application où il est.

---

## 1. Le serveur

Aucune dépendance à installer. Node 18 ou plus suffit.

```bash
git clone <votre-dépôt> skype && cd skype
node server/seed.js          # comptes de démonstration (facultatif)
PORT=3000 node server/index.js
```

Les données vivent dans `data/skype.json` et les fichiers envoyés dans
`data/files/`. **Sauvegardez ce dossier** : il contient tout.

Pour qu'il redémarre tout seul, sur une machine Linux avec systemd :

```ini
# /etc/systemd/system/skype.service
[Unit]
Description=Skype Reborn
After=network.target

[Service]
Type=simple
User=skype
WorkingDirectory=/opt/skype
Environment=PORT=3000
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now skype
```

---

## 2. HTTPS — non négociable

iOS **refuse** le micro, la caméra et l'installation sur l'écran d'accueil si
la page n'est pas servie en HTTPS. Sans certificat, il n'y aura ni appel ni
message vocal. `localhost` fait exception, mais pas l'adresse IP de votre
machine sur le réseau local.

### Pour essayer, en une commande

```bash
npx localtunnel --port 3000
# ou
cloudflared tunnel --url http://localhost:3000
```

Vous obtenez une adresse `https://…` utilisable immédiatement depuis
l'iPhone. Elle change à chaque lancement : pratique pour voir à quoi ça
ressemble, insuffisant pour un usage durable.

### Pour de bon

Un nom de domaine, un certificat Let's Encrypt, et un reverse proxy devant le
serveur. Avec Caddy, c'est tout le fichier de configuration :

```
skype.exemple.fr {
    reverse_proxy localhost:3000
}
```

Caddy obtient et renouvelle le certificat seul. Avec nginx, il faut penser à
**laisser passer le WebSocket**, faute de quoi les messages n'arriveront jamais
en temps réel :

```nginx
server {
    server_name skype.exemple.fr;
    listen 443 ssl;
    # ssl_certificate … (certbot)

    client_max_body_size 64M;          # les pièces jointes vont jusqu'à 64 Mo

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;      # ← indispensable
        proxy_set_header Connection "upgrade";       # ← indispensable
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;                    # un appel dure longtemps
    }
}
```

### Les appels derrière un pare-feu

Les appels sont en pair-à-pair : l'audio et la vidéo ne transitent pas par le
serveur, qui ne fait que relayer la mise en relation. Deux personnes sur des
réseaux ordinaires se joignent grâce aux serveurs STUN publics déjà
configurés. En revanche, derrière certains réseaux d'entreprise ou mobiles
stricts, il faut un serveur TURN — sans lui, l'appel sonne mais reste muet.

À ajouter dans `ICE_SERVERS`, en tête de `public/js/ui/calls.js` :

```js
{ urls: 'turn:turn.exemple.fr:3478', username: '…', credential: '…' }
```

`coturn` fait très bien l'affaire.

---

## 3. Dire à l'application où est le serveur

### Depuis un navigateur, ou installée depuis Safari

Rien à faire. La page vient du serveur : l'application lui parle
naturellement.

### Dans l'application native

La page vient du paquet embarqué : elle ne peut pas deviner l'adresse. Deux
possibilités.

**a. La demander au premier lancement** *(comportement par défaut)*
L'application affiche un écran « À quel serveur cette application doit-elle se
connecter ? ». L'adresse est vérifiée — le serveur doit répondre à
`/api/health` — puis mémorisée. On peut en changer depuis l'écran de connexion.

**b. La figer à la construction**
Renseignez `server.url` dans `ios/capacitor.config.json` : Capacitor charge
alors toute l'interface depuis votre serveur, et l'écran d'adresse ne
s'affiche plus.

```json
"server": { "url": "https://skype.exemple.fr" }
```

C'est la voie à choisir pour distribuer l'application à des gens qui ne doivent
pas avoir à saisir une adresse.

---

## Vérifier que tout est en place

```bash
curl https://skype.exemple.fr/api/health
# {"service":"skype","ok":true,"version":"…","uptime":…}
```

Puis, depuis l'iPhone, en HTTPS :

| À vérifier | Comment |
|---|---|
| L'interface se charge | l'écran de connexion apparaît |
| Le temps réel fonctionne | un message envoyé depuis un autre appareil arrive sans recharger |
| Le micro est autorisé | démarrer un appel ne déclenche pas « micro inaccessible » |
| L'installation marche | Partager → « Sur l'écran d'accueil » est proposé |

Si le message n'arrive qu'après rechargement, c'est le WebSocket qui est
bloqué par le proxy — revoyez les en-têtes `Upgrade` et `Connection`.
