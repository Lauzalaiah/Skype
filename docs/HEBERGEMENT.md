# Héberger Skype Reborn

L'application est un **client**. Tant qu'aucun serveur ne tourne quelque part
de joignable, elle ne sert à rien à plusieurs. C'est l'étape que tout le monde
saute, et c'est celle qui décide si l'application fonctionne ou non.

Ce document contient le chemin exact, de la machine nue à deux personnes qui
s'appellent, puis la liste complète des paramètres.

> Vous louez un VPS et voulez qu'on vous tienne la main du début à la fin,
> avec la liste des valeurs à préparer ? Suivez plutôt **[VPS.md](VPS.md)** :
> c'est le même chemin, en pas à pas.

---

## Choisir où

| Situation | Ce qu'il faut | Ce que vous obtenez |
| --- | --- | --- |
| **Essayer seul** | votre ordinateur | tout fonctionne, micro et caméra compris |
| **Essayer à deux, aujourd'hui** | votre ordinateur + un tunnel | une adresse `https://` publique, temporaire |
| **Pour de bon** | une machine allumée + un domaine | une adresse à vous, un certificat renouvelé seul |

Les navigateurs refusent le micro et la caméra sur une page en `http`. Sans
certificat, il n'y a **ni appel ni message vocal**. `localhost` fait exception,
mais pas l'adresse IP de votre machine sur le réseau local : deux personnes sur
le même wifi pourront s'écrire, pas s'appeler.

---

## 1. Essayer seul, en une commande

Docker installé, puis :

```bash
git clone https://github.com/Lauzalaiah/Skype && cd Skype
docker compose up -d
```

L'application répond sur **http://localhost:3000**. Micro et caméra
fonctionnent : `localhost` est l'exception des navigateurs.

Pour voir une conversation à deux, créez deux comptes et ouvrez-les dans deux
fenêtres, dont une en navigation privée.

```bash
docker compose logs -f      # suivre ce que fait le serveur
docker compose down         # arrêter (les données restent)
```

---

## 2. Essayer à deux, sans rien louer

Une adresse publique en `https`, le temps d'un essai, pendant que la commande
ci-dessus tourne :

```bash
cloudflared tunnel --url http://localhost:3000
```

Vous obtenez une adresse `https://…` à envoyer à quelqu'un. Vous pourrez vous
appeler pour de vrai. Elle change à chaque lancement et disparaît quand vous
fermez la commande.

**C'est la façon la moins chère de répondre à la vraie question** — est-ce que
ça marche entre deux personnes ? — avant de dépenser un euro.

---

## 3. Pour de bon, sur une machine à vous

### 3.1 La machine

N'importe quel serveur Linux avec 1 Go de mémoire suffit : l'application n'a
aucune dépendance et le serveur tient dans quelques dizaines de mégaoctets. Un
ordinateur qui reste allumé chez vous fait l'affaire, à condition que votre
box laisse passer les ports 80 et 443.

### 3.2 Le nom de domaine

Créez un enregistrement DNS **A** pointant vers l'adresse IP de la machine :

```
skype.exemple.fr.   A   203.0.113.42
```

Vérifiez qu'il est propagé avant d'aller plus loin — sans quoi Caddy
demandera un certificat pour un nom qui ne mène pas à lui, et échouera :

```bash
dig +short skype.exemple.fr
```

### 3.3 L'installation

```bash
# Docker, si absent
curl -fsSL https://get.docker.com | sh

# Les ports du web
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp

# Le projet
git clone https://github.com/Lauzalaiah/Skype && cd Skype

# En service, avec certificat automatique
DOMAINE=skype.exemple.fr docker compose --profile https up -d
```

Caddy obtient le certificat Let's Encrypt seul, laisse passer le WebSocket sans
configuration, et renouvelle sans qu'on y repense.

### 3.4 Vérifier

```bash
curl https://skype.exemple.fr/api/health
# {"service":"skype","ok":true,"version":"…","uptime":…}
```

Puis, depuis un téléphone :

| À vérifier | Comment |
| --- | --- |
| L'interface se charge | l'écran de connexion apparaît |
| Le temps réel fonctionne | un message envoyé depuis un autre appareil arrive sans recharger |
| Le micro est autorisé | démarrer un appel ne déclenche pas « micro inaccessible » |
| L'installation marche | Partager → « Sur l'écran d'accueil » est proposé |

Si un message n'arrive qu'après rechargement, c'est le WebSocket qui est bloqué
par un proxy placé devant Caddy.

### 3.5 Redémarrer tout seul

`restart: unless-stopped` est déjà dans la composition : les conteneurs
repartent après un redémarrage de la machine, sans rien faire.

---

## 4. Tous les paramètres

### 4.1 Le serveur

Trois variables, c'est tout.

| Variable | Défaut | Ce qu'elle fait |
| --- | --- | --- |
| `PORT` | `3000` | Port d'écoute. **`PORT=0` demande au système un port libre** — utilisé par l'application de bureau pour ne jamais entrer en conflit. |
| `HOST` | `0.0.0.0` | Interface d'écoute. `127.0.0.1` rend le serveur injoignable de l'extérieur : à utiliser quand un reverse proxy est devant. |
| `SKYPE_DATA_DIR` | `./data` | Où vivent les données. **C'est le seul dossier à sauvegarder.** |

Dans l'image Docker, ces trois valeurs sont déjà `0.0.0.0`, `3000` et
`/données`.

### 4.2 La composition

| Paramètre | Défaut | Ce qu'il fait |
| --- | --- | --- |
| `DOMAINE` | `localhost` | Nom de domaine servi par Caddy. Sans domaine réel, Caddy signe lui-même un certificat pour `localhost` : le navigateur avertit, mais micro et caméra fonctionnent. |
| profil `https` | inactif | Ajoute Caddy. Sans lui, seul le serveur démarre, en clair sur le port 3000. |
| `./donnees` | — | Le dossier de données, monté depuis la machine hôte. |
| ports | `3000`, puis `80` et `443` | Avec le profil `https`, vous pouvez commenter `"3000:3000"` pour que le serveur ne soit plus joignable en clair. |

```bash
docker compose up -d                                     # local, port 3000
DOMAINE=skype.exemple.fr docker compose --profile https up -d   # public, HTTPS
```

### 4.3 L'image

| Réglage | Valeur | Pourquoi |
| --- | --- | --- |
| Base | `node:22-alpine` | Aucune dépendance npm à installer : l'image tient en quelques mégaoctets au-dessus de Node. |
| Point d'entrée | `entree.sh` | Corrige les droits du dossier de données, puis **abandonne les privilèges**. Le serveur ne tourne jamais en root. |
| Contrôle de santé | 30 s, 5 s de délai, 10 s de grâce, 3 essais | Docker redémarre le conteneur s'il cesse de répondre. |
| Port exposé | `3000` | — |

### 4.4 Les appels derrière un pare-feu

Les appels sont en pair-à-pair : l'audio et la vidéo ne passent pas par le
serveur, qui ne relaie que la mise en relation. Deux personnes sur des réseaux
ordinaires se joignent grâce aux serveurs STUN publics déjà configurés.

Derrière certains réseaux d'entreprise ou mobiles stricts, il faut un serveur
**TURN** — sans lui, l'appel sonne mais reste muet. À ajouter dans
`ICE_SERVERS`, en tête de `public/js/ui/calls.js` :

```js
const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'turn:turn.exemple.fr:3478', username: '…', credential: '…' },
];
```

`coturn` fait très bien l'affaire.

### 4.5 Les limites du serveur

| Limite | Valeur | Où |
| --- | --- | --- |
| Taille d'un fichier envoyé | 64 Mo | `server/api.js` |
| Messages chargés d'un coup | 60, 300 au maximum | `server/api.js` |

Avec **nginx** devant plutôt que Caddy, pensez à `client_max_body_size 64M;` —
sinon les pièces jointes échoueront à 1 Mo sans message clair.

### 4.6 Dire à l'application native où est le serveur

**Depuis un navigateur** : rien à faire, la page vient du serveur.

**Application de bureau** : elle demande l'adresse au premier lancement, la
vérifie (`/api/health` doit répondre), puis la mémorise dans `serveur.json`.
On peut en changer depuis l'écran de connexion.

**iOS** : renseignez `server.url` dans `ios/capacitor.config.json` pour figer
l'adresse à la construction et supprimer l'écran de saisie.

```json
"server": { "url": "https://skype.exemple.fr" }
```

| Variable | Effet |
| --- | --- |
| `SKYPE_MAJ_DEBUG=1` | Affiche le détail de la mise à jour automatique, normalement silencieuse. |

---

## 5. Sauvegarder

Tout est dans un seul dossier : comptes, conversations, fichiers envoyés.

```bash
# Sauvegarde
tar czf skype-$(date +%F).tar.gz donnees/

# Restauration
docker compose down
rm -rf donnees && tar xzf skype-2026-08-05.tar.gz
docker compose up -d
```

`donnees/skype.json` contient les comptes et les messages, `donnees/files/`
les pièces jointes.

> `docker compose down -v` supprime les volumes nommés (ceux de Caddy), **pas**
> le dossier `donnees/`, qui est monté depuis la machine. Vos données survivent
> à un `down -v` — mais pas à un `rm -rf`.

---

## 6. Mettre à jour

```bash
cd Skype && git pull
docker compose up -d --build
```

Les données ne sont pas touchées : elles vivent hors de l'image.

---

## 7. Ce qu'il faut savoir avant d'ouvrir au public

**L'inscription est ouverte.** Quiconque connaît l'adresse peut créer un
compte. Il n'y a ni invitation, ni validation, ni liste d'attente. Pour un
serveur de famille, gardez l'adresse privée — ou placez une authentification
devant, dans Caddy :

```
skype.exemple.fr {
    basic_auth {
        famille <empreinte>
    }
    reverse_proxy skype:3000
}
```

L'empreinte se génère avec `docker compose exec caddy caddy hash-password`.
Sur une version de Caddy antérieure à la 2.8, la directive s'appelle
`basicauth`, sans le tiret bas.

**Les messages ne sont pas chiffrés de bout en bout.** Le serveur les voit.
C'est le vôtre, donc c'est vous qui les voyez — mais il faut le savoir, et ne
jamais prétendre le contraire.

**Sauvegardez.** Il n'y a pas de deuxième copie ailleurs.

---

## 8. Quand quelque chose ne marche pas

| Symptôme | Cause la plus fréquente |
| --- | --- |
| `docker compose up` s'arrête aussitôt | Regardez `docker compose logs` : le port 3000 est peut-être déjà pris. |
| Caddy n'obtient pas de certificat | Le DNS ne pointe pas encore sur la machine, ou le port 80 est fermé. |
| Les messages n'arrivent qu'au rechargement | Le WebSocket est bloqué par un proxy devant Caddy. |
| « Micro inaccessible » | La page est en `http`. Seul `localhost` fait exception. |
| L'appel sonne mais reste muet | Un réseau strict des deux côtés : il faut un serveur TURN (§ 4.4). |
| Les pièces jointes échouent | Un reverse proxy limite la taille du corps (§ 4.5). |

Le contrôle de santé répond toujours à la même adresse, et c'est le premier
endroit où regarder :

```bash
curl https://skype.exemple.fr/api/health
```
