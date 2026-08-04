# Publier le projet sans se planter

> ## À lire avant de poster
>
> Les règles de `campagne.md` s'appliquent ici aussi : **projet de fan, non
> officiel**, aucune formulation laissant croire à un retour officiel de Skype,
> aucun faux témoignage, aucun chiffre inventé.
>
> Un point supplémentaire, propre aux forums : **répondez à tout, y compris aux
> commentaires durs.** Un projet dont l'auteur répond honnêtement aux critiques
> est mieux reçu qu'un projet parfait dont l'auteur se tait.

---

## Pourquoi ces projets échouent

Ce n'est presque jamais la qualité du logiciel. C'est toujours la même
mécanique :

1. quelqu'un clique, télécharge 76 Mo, installe, crée un compte ;
2. il se retrouve **seul**, sans personne à qui parler ;
3. il ferme, et ne revient jamais.

Tout ce qui suit vise à casser cette chaîne. Le reste — le nombre de votes,
les commentaires flatteurs — ne sert à rien.

---

## Avant de poster : les quatre conditions

**1. Le lien doit montrer quelque chose en dix secondes.**
Le dépôt s'ouvre sur une capture d'écran réelle, pas sur un paragraphe. Un fil
sans image passe inaperçu.

**2. Une commande, pas un tutoriel.**
`docker compose up -d`. Sur les forums d'auto-hébergement, un projet sans
Docker est écarté sans être essayé.

**3. Les limites doivent être écrites par vous, avant qu'on vous les oppose.**
Il faut un serveur, le binaire n'est pas signé, il n'y a pas d'App Store, ce
n'est pas connecté au vrai Skype. Le dire soi-même désamorce ; le cacher se
retourne toujours.

**4. Vous devez déjà l'utiliser.**
« Je l'ai fait pour appeler ma famille, on s'en sert depuis des semaines » vaut
plus que n'importe quelle liste de fonctionnalités. Si ce n'est pas encore
vrai, **attendez que ça le soit** : c'est la seule chose qu'on ne peut pas
improviser.

---

## Où poster, et ce que chacun regarde

| Endroit | Ce qui compte pour eux | Ce qu'il faut mettre en avant |
| --- | --- | --- |
| **r/selfhosted** | Docker, sauvegarde, ressources, licence | Une commande, zéro dépendance, vos données chez vous |
| **r/opensource** | Licence, lisibilité du code, gouvernance | MIT, aucune dépendance npm, tout est lisible |
| **Hacker News** (Show HN) | La contrainte technique intéressante | WebSocket RFC 6455 écrit à la main, zéro dépendance |
| **r/france**, forums FR | L'histoire, l'utilité concrète | La famille, les grands-parents, la fermeture de Skype |
| **r/nostalgia** | L'émotion | Les sons d'origine, les émoticônes |

Ne postez pas partout le même jour. Un endroit, une semaine, en tenant compte
de ce qu'on vous répond avant de recommencer ailleurs.

---

## Le message (à adapter, pas à copier tel quel)

### Pour un forum d'auto-hébergement

> **Skype Reborn — l'ancien Skype, reconstruit, que vous hébergez vous-même**
>
> Microsoft a fermé Skype. Je n'ai pas trouvé d'équivalent que ma famille sache
> utiliser : Discord et les autres sont faits pour des communautés, pas pour
> appeler sa grand-mère. Alors je l'ai reconstruit.
>
> Messagerie temps réel, appels audio et vidéo en pair-à-pair, partage d'écran,
> groupes, fichiers, et les sons d'origine. Application de bureau pour Windows,
> macOS et Linux, plus le navigateur et le téléphone.
>
> ```
> docker compose up -d
> ```
>
> Le serveur n'a **aucune dépendance npm** — WebSocket, persistance et routage
> HTTP sont écrits directement sur les API de Node. L'audio et la vidéo ne
> passent pas par le serveur (WebRTC en pair-à-pair), donc un très petit VPS
> suffit.
>
> Ce que ce n'est pas : ce n'est pas connecté au vrai Skype, les binaires ne
> sont pas signés (SmartScreen râlera), et il n'y a pas d'App Store. C'est un
> projet de fan, sans aucun lien avec Microsoft.
>
> Code : <lien> — Téléchargement : <lien>

### Pour un public non technique

> **J'ai reconstruit l'ancien Skype, parce que ma famille n'a jamais réussi à
> s'en passer**
>
> Depuis la fermeture, mes parents n'appellent plus personne en vidéo. Les
> outils actuels sont faits pour des groupes de travail ou des communautés de
> joueurs — pas pour dire bonsoir à quelqu'un.
>
> J'ai donc refait celui d'avant : un pseudo, une liste de contacts, un bouton
> vert. Avec les vrais sons.
>
> C'est gratuit, sans publicité, et personne ne peut le fermer : le serveur
> vous appartient. Projet de fan, aucun lien avec Microsoft.

---

## Les questions dures, et les réponses honnêtes

**« Pourquoi pas Matrix / Jitsi / Element ? »**
Ils sont excellents et plus complets. Ils ne visent pas la même chose : ici,
tout part d'une liste de contacts et d'un bouton vert, pour des gens qui ne
comprendront jamais ce qu'est une « salle ». C'est un choix d'ergonomie, pas
une prétention technique.

**« C'est juste Electron, encore. »**
Sur le bureau, oui — et c'est assumé : la même base sert le web, le téléphone
et le bureau, pour une personne seule qui maintient le tout. Le serveur, lui,
n'a aucune dépendance.

**« Un binaire non signé téléchargé sur Internet ? »**
Réponse honnête : les fichiers sont construits par GitHub Actions à partir du
code public, dans un environnement neuf, et chaque version publie ses
empreintes SHA-256. Un certificat coûte plusieurs centaines d'euros par an.
Qui préfère peut construire lui-même.

**« La sécurité ? Chiffrement de bout en bout ? »**
Il n'y en a pas, et il ne faut pas prétendre le contraire. Le transport est
chiffré (HTTPS/WSS), les mots de passe sont hachés avec `scrypt`, mais le
serveur voit les messages. C'est acceptable parce que **le serveur est le
vôtre** — pas celui d'une entreprise. Le dire clairement vaut mieux qu'une
promesse qu'on ne tient pas.

**« Et le nom ? Microsoft va vous tomber dessus. »**
C'est un risque réel : « Skype » est une marque déposée. Le projet le dit
partout, n'utilise ni le logo ni l'identité visuelle de Microsoft, ne se fait
pas passer pour officiel et ne rapporte rien. Si une demande arrive, la réponse
raisonnable est de renommer — pas de discuter. **Mieux vaut y avoir pensé
avant de poster.**

**« Ça va mourir dans six mois comme tous ces projets. »**
Possible. Mais le code est sous licence MIT, sans dépendance, et le serveur
tient dans un dossier : n'importe qui peut le reprendre ou continuer à le faire
tourner. C'est précisément l'inverse d'un service qu'on ferme.

---

## Le jour du lancement

- **Postez le matin**, et restez disponible les deux heures suivantes : c'est
  là que tout se joue.
- **Répondez à tout**, même aux remarques sèches. Surtout à celles-là.
- **Ne défendez pas l'indéfendable.** « Vous avez raison, c'est une limite »
  vous fait gagner plus qu'un argument tordu.
- **Ne demandez pas d'étoiles.** Ça se voit, et ça décrédibilise.

## À quoi ressemble un succès

Pas les votes. Pas les téléchargements — la plupart des gens n'ouvriront jamais
ce qu'ils ont téléchargé, c'est normal et ce n'est pas grave.

Le seul indicateur qui compte : **un groupe de personnes qui s'en sert encore
un mois plus tard.** Si c'est votre famille et personne d'autre, c'est déjà
réussi — c'était le but.
