# Skype Reborn sur iPhone

Deux façons de l'avoir sur votre téléphone. La première marche **tout de
suite**, sans compte développeur ni Mac. La seconde produit un vrai `.ipa`.

---

## 1. Tout de suite : installer depuis Safari

C'est la voie recommandée, et elle donne une application en plein écran avec
son icône sur l'écran d'accueil — indiscernable d'une application installée à
l'usage.

1. Lancez le serveur et rendez-le accessible depuis votre téléphone
   (voir « Servir en HTTPS » plus bas).
2. Sur l'iPhone, ouvrez l'adresse **dans Safari** (pas Chrome : seul Safari
   sait installer sur l'écran d'accueil).
3. Bouton **Partager** → **Sur l'écran d'accueil** → **Ajouter**.

L'application s'ouvre alors sans barre d'adresse, avec son icône, et démarre
même sans réseau (la coquille est mise en cache ; les messages, eux, exigent
évidemment une connexion).

### Servir en HTTPS

iOS refuse le micro, la caméra et l'installation sur une origine non sécurisée.
`localhost` fait exception, mais pas une adresse IP locale. Il vous faut donc
du HTTPS. Le plus simple, sans rien configurer :

```bash
npm start                      # le serveur écoute sur :3000
npx localtunnel --port 3000    # renvoie une URL https://…
```

Ouvrez l'URL `https://…` dans Safari sur l'iPhone. N'importe quel tunnel fait
l'affaire (`cloudflared tunnel --url http://localhost:3000`, `ngrok http 3000`).

### Ce qui fonctionne, et ce qui ne fonctionne pas

| | État sur iOS |
|---|---|
| Messagerie, historique, pièces jointes | ✅ |
| Appels audio et vidéo (WebRTC) | ✅ Safari 15+ |
| Messages vocaux, messagerie vocale | ✅ |
| Sons Skype | ✅ après un premier geste sur l'écran (règle d'autoplay d'iOS) |
| Installation sur l'écran d'accueil | ✅ |
| Ouverture hors ligne | ✅ (coquille uniquement) |
| **Partage d'écran** | ❌ iOS ne l'expose à aucun navigateur |
| **Notifications quand l'app est fermée** | ❌ hors du champ de cette recréation |

---

## 2. Un vrai `.ipa`

Un `.ipa` installable **ne peut pas être produit sur autre chose qu'un macOS
avec Xcode**, et doit être signé avec un certificat Apple. Ce dépôt fournit
donc tout ce qui précède la signature — à vous de fournir le compte.

### Ce dont vous avez besoin

- un Mac avec Xcode 15+, **ou** un compte GitHub (le workflow ci-dessous tourne
  sur un exécuteur macOS fourni par GitHub) ;
- un compte Apple Developer (99 €/an) pour installer sur un appareil et pour
  signer. Un compte gratuit permet de signer pour **7 jours** sur votre propre
  téléphone via Xcode.

### Construire localement

```bash
cd ios
npm install                 # Capacitor, uniquement ici — le serveur reste sans dépendance
npx cap add ios             # crée le projet Xcode
npx cap sync ios
npx cap open ios            # ouvre Xcode
```

Dans Xcode : sélectionnez votre équipe de signature dans **Signing &
Capabilities**, branchez l'iPhone, et lancez. Pour un `.ipa` :
**Product → Archive → Distribute App**.

### Construire par GitHub Actions

`.github/workflows/ios.yml` construit l'archive sur un exécuteur macOS à chaque
lancement manuel. Sans secrets de signature configurés, il produit un `.ipa`
**non signé** : utile pour vérifier que la compilation passe, **inutilisable
tel quel sur un téléphone**. Renseignez les secrets décrits en tête du fichier
pour obtenir une archive signée.

### Pourquoi ce n'est pas fourni tout fait

Un `.ipa` non signé ne s'installe sur aucun iPhone. Un `.ipa` signé contient un
profil de provisionnement lié à un compte Apple et à des identifiants
d'appareils précis — il ne peut être fabriqué que par le détenteur du compte.
Livrer un fichier `.ipa` ici reviendrait à livrer un fichier qui ne s'installe
pas.

---

## Adresse du serveur dans l'application native

L'application native charge l'interface depuis votre serveur. Réglez son
adresse dans `ios/capacitor.config.json`, champ `server.url`. En développement,
pointez-la vers votre machine ; en production, vers l'hébergement du serveur.
