# Skype Reborn sur PC

Une vraie application de bureau — icône, menu Démarrer, raccourci sur le
bureau, fenêtre à elle sans barre d'adresse de navigateur — installée avec
un programme d'installation classique, exactement comme l'ancien Skype.

Contrairement à l'IPA iOS, **aucun compte développeur ni certificat n'est
nécessaire** : Windows n'exige pas de signature pour qu'un `.exe` s'installe.
Ce dossier contient tout ce qu'il faut pour en construire un.

## Ce que c'est, concrètement

Une enveloppe [Electron](https://www.electronjs.org/) autour du serveur du
projet. Electron embarque déjà Node.js : le serveur (`server/index.js`, celui
que le projet héberge sur le web, zéro dépendance) est démarré **directement
dans le processus de l'application**, sur un port local choisi par le système
au lancement. Il n'y a donc rien à héberger séparément — l'application est
autonome, fonctionne sans connexion Internet une fois installée, et range ses
données dans le dossier utilisateur habituel de Windows
(`%APPDATA%\Skype\data`), jamais dans le dossier d'installation.

Chaque installation a sa **propre base de données locale**, indépendante du
site web ou d'une autre installation — comme le ferait n'importe quel
programme de bureau.

## Mises à jour automatiques

L'application se met à jour seule, à partir des versions publiées du dépôt —
exactement celles que le site de téléchargement propose. Huit secondes après
le démarrage puis toutes les six heures, elle demande s'il existe plus récent,
télécharge en arrière-plan, et affiche un bandeau « Redémarrer maintenant ».
Rien ne s'installe sans que l'utilisateur l'ait accepté.

Le mécanisme repose sur trois pièces, et il est muet si l'une manque :

1. `publish` dans la configuration d'`electron-builder` — c'est elle qui fait
   produire les fichiers de description `latest.yml`, `latest-mac.yml` et
   `latest-linux.yml` ;
2. le workflow **Publier une version**, qui joint ces fichiers à la version
   publiée en même temps que les installateurs ;
3. `desktop/maj.js`, qui les interroge.

`test/maj.test.js` vérifie que les trois restent attachées.

### Pourquoi tout est vérifié avant publication

Une mise à jour ratée ne se signale pas. L'application installée continue de
tourner et reste sur son ancienne version, sans message d'erreur et sans que
personne s'en plaigne — on ne l'apprendrait jamais. Le workflow refuse donc de
publier tant que :

- l'application construite n'a pas été **réellement démarrée** sur un
  exécuteur, et son serveur embarqué interrogé (version servie, sons présents) ;
- chaque `latest*.yml` n'annonce pas exactement la version construite ;
- chaque fichier désigné n'existe pas, avec l'empreinte SHA-512 annoncée ;
- la version n'est pas strictement plus récente que celle déjà publiée ;
- un des trois systèmes n'a pas sa description.

Le détail est dans `scripts/verifier-publication.mjs`, et
`test/publication.test.js` fabrique chacune de ces publications défectueuses
pour prouver qu'elles sont bien refusées.

### macOS fait exception

macOS n'autorise une application à se remplacer elle-même que si elle est
signée par un certificat Apple. Celle-ci ne l'est pas : la mise à jour
automatique y échouerait silencieusement à chaque démarrage. `maj.js` détecte
donc `darwin` et se contente d'interroger la dernière version publiée, puis
d'afficher un bandeau renvoyant vers la page de téléchargement.

### Ce que l'interface reçoit

`preload.cjs` n'expose que trois fonctions — s'abonner à l'état, installer,
ouvrir les nouveautés. La page reste aussi limitée que dans un navigateur :
ni `ipcRenderer`, ni `require`, ni `process`. Dans la version web,
`window.skypeMaj` n'existe pas et le bandeau ne s'affiche jamais.

## Construire l'installateur

### Le plus simple : GitHub Actions

`.github/workflows/windows.yml` construit l'installateur sur un exécuteur
Windows réel. Depuis l'onglet **Actions** du dépôt : **Windows** →
**Run workflow**. Le fichier `.exe` produit est déposé en pièce jointe
(« artifact ») de l'exécution.

### En local

```bash
cd desktop
npm install
npm run build:win      # produit desktop/dist/Skype-Reborn-Setup-*.exe
```

Fonctionne aussi bien sous Windows que sous Linux ou macOS (electron-builder
sait construire une cible Windows depuis n'importe quel système ; sous Linux,
il lui faut [Wine](https://www.winehq.org/) installé — `apt install wine32`
suffit).

### Tester l'installateur sans machine Windows

Wine sait exécuter l'installateur et vérifier qu'il fait son travail —
fichiers déposés, raccourcis bureau et menu Démarrer, entrée de
désinstallation, démarrage du serveur embarqué :

```bash
export WINEPREFIX=/tmp/essai WINEARCH=win64
wine64 wineboot --init
wine64 dist/Skype-Reborn-Setup-*.exe /S
ls "$WINEPREFIX/drive_c/users/$USER/AppData/Local/Programs/Skype"
```

Deux pièges à connaître :

- l'installateur est **par utilisateur** (`perMachine: false`) : il installe
  dans `%LOCALAPPDATA%\Programs\Skype`, **jamais** dans `Program Files` — y
  chercher les fichiers donne l'impression que l'installation a échoué ;
- il faut un préfixe **64 bits** (`WINEARCH=win64`) et donc `wine64`, sinon
  l'application x64 ne peut pas se lancer.

En revanche, **l'interface graphique ne s'affiche pas de façon fiable sous
Wine** : Chromium y est trop exigeant, la fenêtre ne se réalise pas et
l'application se referme. Ce n'est pas un défaut de l'application — pour
vérifier l'interface de la version *empaquetée*, construisez la cible Linux
(`npx electron-builder --linux dir`), qui utilise exactement le même
`app.asar` et les mêmes ressources, et lancez-la nativement.

Pour tester sans construire d'installateur :

```bash
npm start
```

## Installer

Double-cliquer sur le `.exe` obtenu. L'installateur n'est pas signé
(aucun certificat de code n'a été acheté pour ce projet de fan) : Windows
affichera l'avertissement SmartScreen habituel pour un logiciel non signé —
**« Plus d'infos »** puis **« Exécuter quand même »**. C'est le comportement
normal pour tout logiciel indépendant non signé, pas un signe de problème.

L'installateur laisse ensuite choisir le dossier d'installation, crée un
raccourci sur le bureau et dans le menu Démarrer, comme n'importe quel
programme Windows.

## Micro et caméra

Contrairement à un navigateur, Electron ne propose pas de boîte de dialogue
d'autorisation automatique : `main.js` l'accorde lui-même pour le micro, la
caméra et le partage d'écran, uniquement pour les demandes venant de
l'application elle-même — jamais un accès plus large.

## Autres systèmes

Les mêmes fichiers savent aussi produire un AppImage Linux
(`npm run build:linux`) et un `.dmg` macOS (`npm run build:mac`, non signé —
macOS demandera d'autoriser l'application dans Réglages Système › Sécurité,
comme pour tout logiciel hors App Store).
