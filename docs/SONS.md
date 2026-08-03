# Où va chaque son

Ce document dit **comment** un fichier audio reçu est rattaché à un événement,
et **quels emplacements sont encore vides**. Il existe parce qu'une erreur a été
commise : `Skypevideocall.mp3` avait été branché sur les appels vidéo au seul
motif de son nom, alors que Skype n'a jamais distingué la sonnerie d'un appel
vidéo de celle d'un appel audio. C'était une supposition déguisée en évidence.

## Règle de placement

Trois critères, **par ordre d'autorité décroissante**. Le premier qui tranche
l'emporte sur les suivants.

1. **Le comportement réel de Skype.** Si Skype n'avait pas cet événement, le son
   n'y va pas — quel que soit son nom. C'est ce critère qui manquait pour
   `Skypevideocall.mp3` : la question n'était pas « ce son évoque-t-il la
   vidéo ? » mais « Skype sonnait-il différemment pour un appel vidéo ? ».
   Non. Donc c'est une sonnerie parmi les autres.
2. **La structure acoustique du fichier.** Mesurée, pas devinée : durée, nombre
   de salves, silence de queue, capacité à boucler proprement. Un fichier de
   7 s qui se répète sans couture n'est pas une notification ; un fichier de
   0,6 s qui se termine sec n'est pas une sonnerie.
3. **Le nom du fichier.** Un indice, jamais une preuve. Il oriente la
   recherche ; il ne conclut pas.

**En cas de doute, le son n'est branché sur rien.** Il rejoint la section
« Sons non attribués » des réglages : écoutable, présent, mais rattaché à aucun
événement. Un son muet vaut mieux qu'un son qui se déclenche au mauvais moment.

## Ce que la mesure permet de trancher

Profils relevés sur les 14 fichiers intégrés (analyse du signal décodé) :

| Famille | Durée | Boucle | Silence de queue |
|---|---|---|---|
| **Sonnerie** (appel entrant) | 2,6 – 15 s | oui | 0 – 1 s, pour espacer les répétitions |
| **Tonalité** (appel sortant) | 7,6 s, 3 salves | oui | 1,96 s entre deux séries de bips |
| **État d'appel** (établi, échoué, sans réponse) | 1,3 – 2,0 s | non | quasi nul, le son finit net |
| **Notification** (message, fichier, vocal) | 0,6 – 1,0 s | non | quasi nul |

Les trois familles ne se recouvrent pas. Un nouveau fichier tombe donc presque
toujours dans une seule d'entre elles, ce qui réduit d'emblée les candidats.

## Les 19 sons attribués

| Fichier d'origine | Durée | Événement — unique |
|---|---|---|
| `Skypelogin.mp3` | 1,99 s | connexion à Skype (ni rechargement, ni reconnexion du socket) |
| `Skypecall.mp3` | 2,58 s | appel entrant — sonnerie par défaut |
| `Skype_ringtone_.mp3` | 7,34 s | appel entrant — 2ᵉ sonnerie au choix |
| `Sonnerieskype2.mp3` | 7,41 s | appel entrant — 3ᵉ sonnerie au choix |
| `Skypevideocall.mp3` | 3,75 s | appel entrant — 4ᵉ sonnerie au choix |
| `Skypesonnerie3.mp3` | 15,02 s | appel entrant — 5ᵉ sonnerie au choix |
| `Skypecallbipbip.mp3` | 7,64 s | appel sortant, pendant que ça sonne |
| `Skypecallincall.mp3` | 0,56 s | appel entrant pendant une communication |
| `Skypestartcall.mp3` | 1,69 s | l'appel est établi, la communication démarre |
| `Skyperaccroche_.mp3` | 1,11 s | raccrochage d'une communication établie |
| `Skypepaused.mp3` | 0,90 s | appel mis en attente, ou repris |
| `Skypecallnotconnected.mp3` | 1,35 s | appel sans réponse, refusé ou annulé |
| `Skypecallfailed.mp3` | 1,29 s | micro ou caméra inaccessible |
| `Skypenotification_.mp3` | 0,83 s | message texte reçu, conversation non ouverte |
| `Skypefolderreceived.mp3` | 0,72 s | message reçu contenant une pièce jointe |
| `Skypesendfolder.mp3` | 2,06 s | envoi d'un fichier, d'une image ou d'un GIF |
| `Skypesendfolderfailed.mp3` | 2,70 s | l'envoi d'un fichier a échoué |
| `Skypeforwindowsnew.mp3` | 0,99 s | envoi d'une carte de contact |
| `Skypevoicemail.mp3` | 0,74 s | réception d'un message vocal |

### Un cas d'arbitrage : `Skypesendfolder` contre `Skypeforwindowsnew`

`Skypeforwindowsnew.mp3` occupait « fichier ou contact envoyé », sur indication
explicite de l'utilisateur. L'arrivée de `Skypesendfolder.mp3` a créé un
conflit : deux fichiers pour un même événement.

Il a été tranché par la **paire officielle** — `Skypefolderreceived` /
`Skypesendfolder` sont manifestement le recto et le verso du même transfert,
comme le confirme leur nommage symétrique. `Skypesendfolder` prend donc l'envoi
de fichier. `Skypeforwindowsnew` conserve l'autre moitié de ce que
l'utilisateur avait décrit : **la carte de contact**. Aucune des deux
informations n'est écrasée.

## Les emplacements encore vides

Ces événements existent dans l'application mais sonnent aujourd'hui en synthèse
(oscillateurs). **C'est là que va tout nouveau fichier**, à moins qu'il ne
corresponde à rien — auquel cas il reste non attribué.

| Emplacement | Attendu | Profil attendu |
|---|---|---|
| **Message envoyé** | le « pop » discret de l'envoi | < 0,3 s, très bref, aigu |
| **Mention** | quelqu'un vous cite dans un groupe | 0,3 – 1 s, distinct du message ordinaire |
| **Notification générale** | demande de contact, réaction | 0,5 – 1 s |
| **Erreur** | action refusée, échec réseau | < 0,5 s, grave |

Le pavé numérique (DTMF) reste synthétisé **définitivement** : ce sont des
fréquences normalisées, qui doivent être générées et non rejouées.

### Un son qui révèle une fonctionnalité manquante : `Skypepaused`

L'application n'avait aucune notion de « mise en attente ». Plutôt que de
brancher ce son sur un événement approchant, la fonctionnalité a été ajoutée :
elle existait dans Skype, et l'existence même du fichier dans le jeu officiel
l'atteste. Le canal `call:state` étant déjà générique, le serveur n'a pas
bougé.

C'est le sens du critère nº 1 : quand un son officiel ne trouve pas sa place,
l'hypothèse la plus probable n'est pas qu'il faille lui en inventer une, mais
qu'il manque quelque chose à la recréation.

## Garde-fous

- Chaque entrée de `public/js/lib/sounds.js` déclare `source` (le fichier
  d'origine, pour l'audit) et `usage` (l'événement exact et unique).
- `test/sons.test.js` lit le code source et échoue si un son est déplacé,
  dupliqué, branché à deux endroits, ou si ce document cesse de décrire la
  bibliothèque réelle.
- Un fichier déjà intégré est détecté par empreinte MD5 avant tout ajout : un
  même son ne peut pas servir deux événements.
