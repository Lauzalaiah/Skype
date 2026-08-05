# Héberger Skype Reborn sur un VPS

Un seul chemin, du serveur vide à deux personnes qui s'appellent. Comptez
vingt minutes, dont quinze d'attente.

> Avant de louer quoi que ce soit, essayez gratuitement : voir
> [§ 0](#0-avant-de-payer-quoi-que-ce-soit).

---

## La fiche à remplir

Quatre valeurs. Notez-les maintenant : chaque commande de ce guide y renvoie.

| | Valeur | Où la trouver | Exemple |
| --- | --- | --- | --- |
| **①** | Adresse IP du serveur | tableau de bord du fournisseur, après création | `203.0.113.42` |
| **②** | Nom de domaine | chez votre registrar | `skype.exemple.fr` |
| **③** | Utilisateur SSH initial | fourni par le fournisseur | `root` ou `ubuntu` |
| **④** | Nom d'utilisateur à créer | vous le choisissez | `skype` |

Quatre, et c'est tout. Pas d'adresse e-mail — Caddy obtient le certificat
sans en demander. Pas de clé d'API, pas de jeton, aucun compte à créer nulle
part : le projet ne dépend d'aucun service tiers.

### Ce que doit être le serveur

| | Minimum | Confortable |
| --- | --- | --- |
| Mémoire | 512 Mo | 1 Go |
| Disque | 5 Go | 20 Go (les fichiers envoyés s'y accumulent) |
| Système | Debian 12 ou Ubuntu 22.04+ | idem |
| Processeur | 1 cœur | 1 cœur |

Le serveur n'a aucune dépendance : c'est le plus petit forfait de n'importe
quel fournisseur qui convient. Ce qui coûte, c'est la bande passante des
fichiers échangés — les appels, eux, ne passent pas par le serveur.

### Le piège : un hébergement web n'est pas un VPS

C'est l'erreur qui coûte un abonnement entier, et elle est facile à faire,
parce que les deux sont vendus côte à côte sur les mêmes pages.

Un **hébergement mutualisé** — celui qui sert à poser un site WordPress —
**ne peut pas faire tourner ce projet**, quel que soit son prix. Il n'y a ni
accès root, ni Docker, ni droit de laisser un programme tourner en
permanence, ni possibilité d'ouvrir un port. Aucune de ces limites ne se
contourne : ce n'est pas une question de taille, mais de nature.

Trois questions avant de payer, et il faut trois « oui » :

| Question | Pourquoi |
| --- | --- |
| Ai-je un accès **root** en SSH ? | Sans lui, rien de ce guide ne s'exécute |
| Puis-je installer **Docker** ? | C'est la seule dépendance du projet |
| Les ports **80 et 443** sont-ils libres ? | Un panneau préinstallé (cPanel, Plesk) les occupe déjà, et Caddy ne pourra pas démarrer |

Si un panneau d'administration est fourni avec l'offre, prévoyez de
réinstaller le système « nu » depuis leur interface avant de commencer.

### Le prix affiché n'est pas le prix payé

Chez la plupart des hébergeurs grand public, le tarif mis en avant est
**promotionnel la première période**, et le renouvellement coûte deux à
quatre fois plus. Regardez toujours le prix de renouvellement, pas celui de
la publicité — c'est celui que vous paierez pendant des années.

Comparez aussi ce qui est compté : certaines offres facturent la bande
passante au-delà d'un seuil. Ce projet en consomme peu, sauf si vos proches
s'échangent beaucoup de fichiers.

---

## 0. Avant de payer quoi que ce soit

Sur votre propre machine, avec Docker :

```bash
git clone https://github.com/Lauzalaiah/Skype && cd Skype
docker compose up -d
cloudflared tunnel --url http://localhost:3000
```

La dernière commande affiche une adresse `https://…` publique. Envoyez-la à
quelqu'un et appelez-vous. Si ça marche, le VPS ne fera que rendre cette
adresse permanente. Si ça ne marche pas, autant le savoir avant de payer.

---

## 1. Le domaine, en premier

C'est l'étape que tout le monde met en dernier, et c'est celle qui doit être
faite d'abord : Caddy demandera un certificat au nom **②**, et Let's Encrypt
vérifiera que ce nom mène bien au serveur **①**. Si le DNS n'est pas encore
propagé, la demande échoue — et Let's Encrypt limite le nombre de tentatives.

Chez votre registrar, créez un enregistrement :

| Type | Nom | Valeur | TTL |
| --- | --- | --- | --- |
| `A` | `skype` (ou `@` pour le domaine nu) | **①** l'IP du serveur | 300 |

Puis attendez, et vérifiez :

```bash
dig +short skype.exemple.fr        # ② — doit afficher ① et rien d'autre
```

**Ne passez à la suite que lorsque cette commande affiche votre IP.** Comptez
de cinq minutes à deux heures selon le registrar.

---

## 2. Se connecter et se mettre en sécurité

```bash
ssh ③@①                            # par exemple : ssh root@203.0.113.42
```

Créez un utilisateur ordinaire — travailler en `root` en permanence est une
mauvaise habitude, et Docker n'en a pas besoin :

```bash
adduser ④                          # il demande un mot de passe
usermod -aG sudo ④
rsync --archive --chown=④:④ ~/.ssh /home/④   # garde votre clé SSH
```

Reconnectez-vous avec le nouveau compte, puis vérifiez qu'il fonctionne avant
de fermer la session en cours :

```bash
ssh ④@①
sudo echo ok
```

---

## 3. Le pare-feu

Trois ports, pas un de plus :

```bash
sudo ufw allow OpenSSH             # sinon vous vous enfermez dehors
sudo ufw allow 80/tcp              # Let's Encrypt vérifie le domaine ici
sudo ufw allow 443/tcp             # l'application
sudo ufw enable
sudo ufw status
```

Le port 80 n'est pas facultatif : c'est par lui que passe la vérification du
certificat. Caddy y redirige ensuite tout vers 443.

Le port **3000 reste fermé** : Caddy parle au serveur à l'intérieur de Docker,
sans passer par le réseau public.

---

## 4. Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ④
newgrp docker                      # évite de se déconnecter/reconnecter
docker --version
```

---

## 5. Installer, en une commande

```bash
git clone https://github.com/Lauzalaiah/Skype && cd Skype
DOMAINE=② docker compose --profile https up -d
```

Par exemple :

```bash
DOMAINE=skype.exemple.fr docker compose --profile https up -d
```

La première fois, Docker construit l'image (une minute) puis Caddy demande le
certificat (quelques secondes). Suivez ce qui se passe :

```bash
docker compose logs -f caddy       # Ctrl+C pour arrêter de suivre
```

Vous cherchez une ligne contenant `certificate obtained successfully`.

---

## 6. Vérifier

```bash
curl https://②/api/health
# {"service":"skype","ok":true,"version":"…","uptime":…}
```

Puis, depuis un téléphone, ouvrez `https://②` :

| À vérifier | Ce qui doit se passer |
| --- | --- |
| La page se charge | l'écran de connexion apparaît, sans avertissement de certificat |
| Le compte se crée | vous arrivez dans l'application |
| Le temps réel marche | un message envoyé d'un autre appareil arrive sans recharger |
| Le micro est autorisé | démarrer un appel ne déclenche pas « micro inaccessible » |
| L'installation marche | Partager → « Sur l'écran d'accueil » est proposé |

---

## 7. Ce qu'il faut faire tout de suite après

### Fermer l'inscription, ou l'assumer

**Quiconque connaît l'adresse peut créer un compte.** Il n'y a ni invitation,
ni validation. Pour un serveur de famille, c'est rarement ce qu'on veut.

Générez une empreinte de mot de passe :

```bash
docker compose exec caddy caddy hash-password
```

Puis, dans le `Caddyfile`, avant `reverse_proxy` :

```
{$DOMAINE} {
    basic_auth {
        famille <l-empreinte-obtenue-ci-dessus>
    }
    reverse_proxy skype:3000
    …
}
```

```bash
docker compose --profile https restart caddy
```

Tout le monde partage alors le même mot de passe d'entrée, en plus de son
propre compte.

### Sauvegarder

Tout tient dans un dossier : comptes, conversations, fichiers envoyés.

```bash
tar czf ~/skype-$(date +%F).tar.gz donnees/
```

Automatiquement, chaque nuit à 3 h :

```bash
crontab -e
# puis ajouter :
0 3 * * * cd /home/④/Skype && tar czf ~/sauvegardes/skype-$(date +\%F).tar.gz donnees/
```

```bash
mkdir -p ~/sauvegardes
```

**Récupérez ces archives ailleurs que sur le serveur.** Une sauvegarde qui vit
sur la machine qu'elle sauvegarde ne sauvegarde rien :

```bash
# depuis votre machine
scp ④@①:~/sauvegardes/*.tar.gz ./
```

Pour restaurer :

```bash
docker compose down
rm -rf donnees && tar xzf skype-2026-08-05.tar.gz
docker compose --profile https up -d
```

---

## 8. Mettre à jour le serveur

```bash
cd ~/Skype && git pull
DOMAINE=② docker compose --profile https up -d --build
```

Les données ne sont pas touchées : elles vivent hors de l'image.

> L'application **installée** sur les machines des utilisateurs se met à jour
> séparément — voir les notes de version. Le serveur et les clients n'ont pas
> à porter le même numéro, mais mieux vaut ne pas trop les laisser diverger.

---

## 9. Tous les paramètres

### Ceux de la composition

| Paramètre | Défaut | Effet |
| --- | --- | --- |
| `DOMAINE` | `localhost` | Le nom que Caddy sert et pour lequel il demande un certificat. Sans domaine réel, il signe lui-même : le navigateur avertit, mais micro et caméra fonctionnent. |
| profil `https` | inactif | Sans lui, seul le serveur démarre, en clair sur le port 3000. |
| `./donnees` | — | Le dossier de données sur la machine hôte. **Le seul à sauvegarder.** |
| `restart` | `unless-stopped` | Les conteneurs repartent après un redémarrage du serveur. |

### Ceux du serveur

| Variable | Défaut | Effet |
| --- | --- | --- |
| `PORT` | `3000` | Port d'écoute. `PORT=0` demande un port libre au système. |
| `HOST` | `0.0.0.0` | Interface d'écoute. |
| `SKYPE_DATA_DIR` | `/données` dans l'image | Emplacement des données. |

Pour les changer, ajoutez-les sous `environment:` dans `docker-compose.yml`.
En pratique, aucune n'a besoin d'être modifiée pour un VPS.

### Les limites

| Limite | Valeur |
| --- | --- |
| Taille d'un fichier envoyé | 64 Mo |
| Messages chargés d'un coup | 60, 300 au maximum |

Caddy laisse passer ces tailles sans configuration. Avec **nginx** à la place,
il faut `client_max_body_size 64M;`, faute de quoi les pièces jointes échouent
à 1 Mo sans message clair.

### Les appels derrière un réseau strict

Les appels sont en pair-à-pair : le serveur ne relaie que la mise en relation.
Deux personnes sur des réseaux ordinaires se joignent grâce aux serveurs STUN
publics déjà configurés. Derrière certains réseaux d'entreprise ou mobiles,
il faut un serveur TURN — sans lui, l'appel sonne mais reste muet. À ajouter
dans `ICE_SERVERS`, en tête de `public/js/ui/calls.js` :

```js
{ urls: 'turn:turn.exemple.fr:3478', username: '…', credential: '…' }
```

---

## 10. Quand ça ne marche pas

| Symptôme | Cause la plus fréquente |
| --- | --- |
| Caddy n'obtient pas de certificat | Le DNS ne pointe pas encore sur le serveur (§ 1), ou le port 80 est fermé (§ 3). |
| `curl` ne répond pas du tout | `docker compose ps` : les conteneurs tournent-ils ? Puis `docker compose logs`. |
| La page se charge, pas les messages | Le WebSocket est bloqué — presque toujours par un proxy ajouté devant Caddy. |
| « Micro inaccessible » | La page est en `http`. Seul `localhost` fait exception. |
| L'appel sonne mais reste muet | Réseau strict des deux côtés : il faut un TURN (§ 9). |
| Les pièces jointes échouent | Un reverse proxy limite la taille du corps (§ 9). |
| Plus de place sur le disque | `du -sh donnees/files` — les fichiers envoyés s'accumulent, rien ne les efface. |

La commande à taper en premier, toujours :

```bash
docker compose ps && docker compose logs --tail 50
```

---

## Ce que ce guide ne résout pas

**Le serveur voit les messages.** Il n'y a pas de chiffrement de bout en bout.
C'est le vôtre, donc c'est vous qui les voyez — mais il faut le savoir, et ne
jamais prétendre le contraire à ceux que vous invitez.

**Personne ne surveille la machine à votre place.** Un VPS qui tombe reste
tombé jusqu'à ce que quelqu'un s'en aperçoive. `/api/health` est là pour être
interrogé par un service de surveillance gratuit, si vous en voulez un.
