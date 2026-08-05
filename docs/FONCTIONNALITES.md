# Liste exhaustive des fonctionnalités

Inventaire complet de ce qui a été reconstruit, dans l'esprit des dernières versions de
Skip (8.x). Chaque ligne est implémentée et fonctionnelle.

---

## 1. Compte et identité

- Création de compte avec pseudo Skip, nom affiché, e-mail facultatif
- Validation du pseudo (3 à 32 caractères, commence par une lettre)
- Proposition automatique d'un pseudo à partir du nom saisi
- Connexion par pseudo **ou** par e-mail
- Mots de passe hachés (`scrypt` + sel unique, comparaison à temps constant)
- Sessions par jeton de 256 bits, persistées entre les visites
- Changement de mot de passe (l'ancien est immédiatement invalidé)
- Déconnexion
- Photo de profil (recadrée et compressée côté navigateur)
- Avatar généré à partir des initiales, avec couleur déterministe
- Message d'humeur
- Texte « À propos de moi »
- Ville, pays, date de naissance, téléphone, site web, e-mail
- Carte de profil consultable pour soi et pour les autres
- Lien de profil partageable (`?add=pseudo`)

## 2. Présence

- Cinq statuts : En ligne, Absent, Ne pas déranger, Invisible, Hors ligne
- Passage automatique en « Absent » après 5 minutes d'inactivité, retour automatique
- Le statut « Invisible » vous fait apparaître hors ligne pour tout le monde
- Diffusion de la présence aux contacts et aux participants des conversations
- « Vu à l'instant », « Vu il y a 5 minutes », « Vu le 3 mars »
- Pastille de présence sur chaque avatar
- Passage hors ligne automatique à la fermeture de la dernière session

## 3. Contacts

- Le service d'écho (« echo123 ») est ajouté automatiquement à l'inscription,
  avec sa conversation et un message d'accueil — voir section Appels
- Recherche par pseudo, nom complet, e-mail ou numéro de téléphone
- Envoi d'une demande de contact avec message d'accompagnement
- Acceptation ou refus des demandes
- Acceptation automatique des demandes croisées
- Option « accepter automatiquement les demandes »
- Création automatique de la conversation à l'acceptation
- Contacts favoris
- Suppression d'un contact
- Blocage et déblocage (le blocage empêche réellement l'envoi de messages)
- Liste des personnes bloquées dans les réglages
- Tri par présence puis par ordre alphabétique
- Option « ne pas apparaître dans la recherche »

## 4. Conversations

- Conversations individuelles et de groupe
- Liste triée par activité, épinglés en premier
- Épingler et détacher une conversation
- Couper et réactiver les notifications
- Archiver et désarchiver
- Marquer comme lu / non lu
- Filtres : Tout, Non lus, Favoris, Groupes, Archivés
- Aperçu du dernier message avec préfixe d'auteur (« Vous : », « Thomas : »)
- Aperçu spécifique par type (📷 Photo, 🎤 Message vocal, 📎 Fichier, 📊 Sondage)
- Brouillon conservé par conversation, affiché dans la liste
- Compteur de messages non lus, badge global sur le rail et dans le titre de l'onglet
- Menu contextuel (clic droit) sur chaque conversation

## 5. Messages

- Envoi et réception instantanés par WebSocket
- Mise en forme : `*gras*`, `_italique_`, `~barré~`, `` `code` ``, ```` ```blocs``` ````, `> citation`
- Barre d'outils de mise en forme
- Liens et adresses e-mail cliquables, aperçu de lien
- Mentions `@pseudo` avec autocomplétion dans les groupes, surlignage de ses propres mentions
- Réponse citée avec saut vers le message d'origine
- Modification de ses propres messages (marqués « modifié »)
- Modification du dernier message par la flèche `↑` dans un champ vide
- Suppression pour tout le monde (son message) ou pour soi seulement
- Transfert vers une ou plusieurs conversations
- Copie du texte
- Traduction d'un message (moteur local, hors ligne)
- Ajout aux messages favoris, vue dédiée
- Réactions (❤️ 😂 😮 😢 😡 👍 👎 + toute émoticône), une par personne, liste des auteurs au survol
- Accusés de remise et de lecture, avec la liste des lecteurs
- Groupement des messages consécutifs du même auteur (fenêtre de 5 minutes)
- Séparateurs de jour (« Aujourd'hui », « Hier », « lundi 3 mars »)
- Séparateur « Nouveaux messages »
- Indicateur « est en train d'écrire… » avec coupure automatique
- Chargement progressif de l'historique par défilement
- Bouton de retour au dernier message avec compteur
- Recherche dans la conversation, navigation entre les occurrences, surlignage
- Menu contextuel complet par clic droit

## 6. Émoticônes et émojis

- 80 émoticônes historiques de Skype avec leurs raccourcis d'origine
  (`(y)`, `(n)`, `(h)`, `(rofl)`, `(cool)`, `(party)`, `(inlove)`, `(facepalm)`, `(ninja)`…)
- Conversion automatique à la frappe, y compris `:)`, `:D`, `;)`, `:P`, `xD`, `8)`
- Sélecteur à 9 catégories, dont un onglet « Émoticônes Skip » dédié
- Environ 1 800 émojis modernes
- Recherche par nom ou par raccourci
- Émoticônes récemment utilisées, conservées localement
- Affichage géant pour les messages ne contenant que des émojis
- Option pour désactiver la conversion automatique

## 7. Appels

- **Service d'écho — test du micro** : le contact « echo123 » est proposé dès
  l'inscription, avec un message d'accueil. L'appeler décroche instantanément,
  dit : « Bienvenue au service de test d'appel Skip. Après le bip, parlez,
  votre message sera enregistré puis rejoué. » (synthèse vocale locale), fait
  entendre un bip, enregistre dix secondes, puis rejoue l'enregistrement — de
  quoi vérifier micro et haut-parleurs avant un vrai appel, exactement comme
  dans Skype. Ne passe par aucune signalisation WebRTC : personne ne répond réellement à
  l'autre bout, tout se joue dans le navigateur
- Coupure/réactivation du micro en cours d'appel, y compris pendant le test
  avec le service d'écho
- Appels audio et vidéo en tête-à-tête
- Appels de groupe (maillage WebRTC complet)
- Sonnerie entrante avec la mélodie caractéristique de Skip
- Tonalité d'appel sortant
- Fenêtre d'appel entrant : répondre en audio, répondre en vidéo, refuser
- Réponses rapides au refus (« Je te rappelle », « Je suis en réunion »…)
- Notification système pour les appels entrants quand l'onglet est en arrière-plan
- Appel manqué automatique après 45 secondes
- Coupure du micro et de la caméra en cours d'appel
- Activation de la caméra à la volée pendant un appel audio
- Partage d'écran, avec retour automatique à la caméra à l'arrêt
- Main levée
- **Mise en attente** : on cesse d'émettre son et image sans quitter l'appel.
  Les deux côtés l'entendent, la vignette s'estompe et affiche « En attente ».
  À la reprise, micro et caméra retrouvent l'état qu'ils avaient avant
  (un micro coupé le reste)
- Vue grille (jusqu'à 9 participants) ou vue intervenant
- Détection de la personne qui parle (contour vert)
- Badges micro coupé / partage d'écran / mise en attente par participant
- Sous-titres en direct (reconnaissance vocale du navigateur)
- Liste des participants
- Pavé numérique DTMF en cours d'appel
- Minuteur, indicateur de qualité de connexion
- Réduction en vignette, plein écran
- Rejoindre un appel déjà en cours depuis la conversation
- Bandeau « appel en cours » dans la conversation
- Message d'appel dans le fil, avec durée et statut
- **Messagerie vocale** : un appel sortant resté sans réponse ou refusé propose
  de laisser un message. L'enregistrement (2 minutes maximum) arrive dans la
  conversation marqué « Messagerie vocale · appel manqué », avec son propre son
  de réception, distinct de celui d'un message vocal ordinaire
- Historique complet : entrants, sortants, manqués, refusés, durée
- Rappel en un clic depuis l'historique
- Avertissement avant de fermer l'onglet pendant un appel
- Raccrochage propre de toutes les sessions à la déconnexion

## 8. Téléphonie et crédit Skip

- Pavé numérique avec vraies tonalités DTMF
- **Composition vers n'importe quel pays** : 77 destinations, sélecteur de pays
  qui préremplit l'indicatif, détection automatique du pays quand on tape un
  indicatif à la main, numéro formaté en direct (`+33 6 12 34 56 78`)
- Tarif à la minute affiché en direct, avec le nombre de minutes que le crédit
  disponible représente vers cette destination
- Composition avec `+` par appui long sur `0`
- Appels vers les numéros fixes et mobiles, décomptés du crédit
- **Le tarif est calculé par le serveur à partir du numéro** : le client ne
  choisit pas ce qu'il paie
- Indicatif non reconnu : tarif international par défaut, jamais de gratuité
- **Achat de crédit** (5 €, 10 €, 25 €, 50 €), chaque montant indiquant combien
  de minutes il représente vers la destination composée
- Solde de crédit Skip visible sur le pavé et dans les réglages
- Grille tarifaire
- Attribution d'un numéro Skip (France, Belgique, Suisse, Canada, Royaume-Uni, États-Unis)
- Les appels téléphoniques apparaissent dans l'historique

## 9. Groupes

- Création avec sélection multiple de participants
- Nom généré automatiquement si aucun n'est fourni
- Photo de groupe, ou mosaïque des avatars des membres
- Renommage (administrateurs uniquement)
- Rôles administrateur et membre, promotion et rétrogradation
- Ajout et retrait de participants
- Quitter le groupe
- Promotion automatique d'un membre si le groupe se retrouve sans administrateur
- Lien d'invitation partageable, accessible aussi par `?join=`
- Messages système pour chaque événement (création, ajout, départ, renommage)
- Sondages à choix simple ou multiple, avec barres de progression et liste des votants

## 10. Fichiers et médias

- Glisser-déposer sur la conversation
- Sélection par le menu, ou collage d'image depuis le presse-papiers
- Jusqu'à 64 Mo par fichier
- Barre de progression du téléversement, annulation possible
- Images en grille, visionneuse plein écran avec navigation clavier
- Vidéos lues en ligne
- Documents avec icône, taille et téléchargement
- Messages vocaux : enregistrement au micro, visualisation du niveau sonore,
  forme d'onde cliquable, lecture avec progression
- Envoi de GIF depuis une bibliothèque locale
- Partage de la position (géolocalisation du navigateur)
- Envoi d'une carte de contact
- Onglets Médias, Fichiers et Liens par conversation

## 11. Recherche

- Recherche globale : messages, conversations, personnes
- Recherche dans une conversation avec navigation entre les résultats
- Recherche d'utilisateurs dans l'annuaire
- Recherche d'émoticônes

## 12. Notifications

- Notifications système du navigateur, cliquables
- Bandeau interne façon Skip
- **Sons d'origine de Skip** — chaque fichier est rattaché à un événement
  précis, et à un seul :

  | Fichier d'origine | Se déclenche sur |
  |---|---|
  | `Skypelogin.mp3` | connexion à Skip, et rien d'autre |
  | `Skypecall.mp3` | appel entrant (sonnerie par défaut) |
  | `Skype_ringtone_.mp3` | appel entrant (sonnerie alternative, au choix) |
  | `Skypecallbipbip.mp3` | appel sortant, pendant que ça sonne |
  | `Skypecallincall.mp3` | appel entrant pendant une communication |
  | `Skypecallnotconnected.mp3` | appel sans réponse, refusé ou annulé |
  | `Skypecallfailed.mp3` | micro ou caméra inaccessible |
  | `Skypemessage.mp3` | message texte reçu |
  | `Skypenotification_.mp3` | demande de contact, réaction |
  | `Skypelogout.mp3` | déconnexion |
  | `Skypefolderreceived.mp3` | fichier reçu |
  | `Skypeforwindowsnew.mp3` | message vocal reçu dans la conversation |
  | `Sonnerieskype2.mp3` | appel entrant (3ᵉ sonnerie, au choix) |
  | `Skypevideocall.mp3` | appel entrant (4ᵉ sonnerie, au choix) |
  | `Skypesonnerie3.mp3` | appel entrant (5ᵉ sonnerie, au choix) |
  | `Skyperaccroche_.mp3` | raccrochage d'une communication établie |
  | `Skypepaused.mp3` | appel mis en attente, ou repris |
  | `Skypesendfolder.mp3` | fichier, image ou GIF envoyé |
  | `Skypesendfolderfailed.mp3` | l'envoi d'un fichier a échoué |
  | `Skypestartcall.mp3` | l'appel est établi, la communication démarre |
  | `Skypevoicemail.mp3` | messagerie vocale, après un appel manqué |

  La correspondance est déclarée dans `public/js/lib/sounds.js` (champs
  `source` et `usage`) et verrouillée par `test/sons.test.js`, qui échoue si
  un son se retrouve branché ailleurs que sur son événement.
  La règle qui décide où va un nouveau son — et la liste des emplacements
  encore vides — est dans [`docs/SONS.md`](SONS.md).
- Choix parmi cinq sonneries d'appel entrant dans les réglages, avec écoute ;
  la même sonnerie sert aux appels audio et vidéo
- **Appel entrant dans la colonne de gauche** : pendant une communication, un
  nouvel appel s'affiche dans le panneau latéral, avec le nom de l'appelant,
  le type d'appel, et de quoi répondre en audio, en vidéo ou refuser
- Bibliothèque de sons écoutable depuis les réglages
- Le son de connexion ne retentit qu'à une vraie connexion, pas à chaque
  rechargement de la page
- Un fichier reçu et un message texte ont deux sons distincts
- Un second appel pendant une communication déclenche un bip discret plutôt
  que la sonnerie complète
- Sons complémentaires synthétisés en Web Audio : message envoyé, mention,
  décrochage, raccrochage, erreur, tonalités DTMF normalisées
- Repli automatique sur la synthèse si un fichier audio est absent
- Réglages fins : messages, appels, réactions, demandes de contact
- Silence des conversations sourdinées
- Heures de silence
- Option « masquer le contenu du message »
- Badge de non-lus dans le titre de l'onglet

## 13. Apparence

- Thème Clair
- Thème Sombre
- Thème **Skip Classic** (le bleu d'origine, rail bleu, bulles bleues)
- Thème Contraste élevé (accessibilité)
- Suivi automatique du thème du système
- Six couleurs d'accentuation
- Quatre tailles de texte
- Densité de liste confortable ou compacte
- Apparence restaurée avant même la connexion (aucun clignotement)

## 14. Confidentialité et données

- Qui peut m'appeler : tout le monde ou mes contacts
- Qui peut m'écrire : tout le monde ou mes contacts
- Confirmations de lecture activables
- Indicateur de saisie activable
- Visibilité dans la recherche
- Export de toutes ses conversations au format JSON
- Aucune donnée envoyée à un tiers, aucun traceur, aucune ressource distante

## 15. Réglages

Onze sections : Profil, Apparence, Audio et vidéo, Appels, Messagerie, Notifications,
Contacts, Confidentialité, Crédit Skip, Général, Aide et retours.

- Test du micro et de la caméra avec aperçu vidéo et niveau sonore en direct
- Liste des périphériques audio et vidéo
- Qualité vidéo HD, réduction de bruit, flou d'arrière-plan
- Réponse automatique, caméra activée par défaut
- Langue de l'interface, statut au démarrage
- Vidage du cache local
- Test des sons

## 16. Interface et accessibilité

- Adaptation complète aux écrans mobiles (navigation par le bas, vues empilées)
- PWA installable, avec raccourcis d'application
- Navigation entièrement au clavier
- Focus piégé dans les modales, restauration du focus à la fermeture
- Rôles ARIA et libellés sur tous les contrôles interactifs
- Respect de `prefers-reduced-motion`
- Barres de défilement et transitions cohérentes
- États vides illustrés et actionnables
- Squelettes de chargement, indicateurs d'activité
- Bandeau de perte de connexion, reconnexion automatique

## 17. Raccourcis clavier

`Ctrl+N` nouvelle conversation · `Ctrl+F` rechercher · `Ctrl+,` réglages ·
`Ctrl+/` liste des raccourcis · `Ctrl+⇧+↓/↑` conversation suivante/précédente ·
`Ctrl+⇧+P` appel audio · `Ctrl+⇧+K` appel vidéo · `Ctrl+⇧+H` raccrocher ·
`Ctrl+M` couper le micro · `Ctrl+⇧+L` marquer comme lu · `Ctrl+⇧+R` répondre ·
`Ctrl+⇧+D` thème sombre · `↑` modifier le dernier message · `Échap` fermer/annuler ·
`Entrée` envoyer · `⇧+Entrée` nouvelle ligne

## 18. Robustesse

- Reconnexion WebSocket avec attente exponentielle et file d'attente des messages
- Resynchronisation de l'historique après une coupure
- Sauvegarde de la base à l'arrêt, y compris sur `SIGINT` et `SIGTERM`
- Écritures disque atomiques (fichier temporaire puis renommage)
- Mise à l'écart automatique d'une base corrompue plutôt que sa perte
- Nettoyage des appels en cours à la déconnexion d'un participant
- Résolution des collisions d'offres WebRTC
- Mise en tampon des candidats ICE reçus trop tôt


## 19. Installation et mobile

- Application installable sur l'écran d'accueil (iOS via Safari, Android via
  Chrome) : plein écran, icône dédiée, sans barre d'adresse
- Icônes PNG 180/192/512 px, dont une version *maskable*
- Service worker : l'interface s'ouvre sans réseau ; les données (API,
  fichiers, WebSocket) ne sont jamais mises en cache
- Encoche et indicateur d'accueil de l'iPhone pris en compte (`safe-area`)
- Sur écran tactile, l'appui long sur un message ouvre son menu — la barre
  d'actions au survol est réservée à la souris
- Champs de connexion nommés et reliés à leur libellé : le remplissage
  automatique et les gestionnaires de mots de passe fonctionnent
- Partage d'écran indisponible sur iOS : le système ne l'expose à aucun
  navigateur
- **Application de bureau (Windows, Linux, macOS)** : enveloppe Electron qui
  embarque le serveur lui-même — aucune adresse à configurer, fonctionne sans
  connexion Internet une fois installée. Un vrai programme d'installation
  (`.exe` NSIS sous Windows), avec choix du dossier, raccourci bureau et menu
  Démarrer. Chaque installation a sa propre base de données locale, dans le
  dossier utilisateur du système, jamais dans le dossier d'installation.
  Micro, caméra et partage d'écran sont autorisés par l'application elle-même,
  sans boîte de dialogue de navigateur
