# Le site de téléchargement

`docs/index.html` est un site de téléchargement complet et autonome : une seule
page, aucune dépendance, aucune ressource chargée ailleurs. Il est prévu pour
être servi par **GitHub Pages**, gratuitement, à l'adresse :

```
https://lauzalaiah.github.io/Skype/
```

---

## 1. L'allumer — une seule case à cocher

GitHub Pages ne peut pas être activé depuis un programme (l'API correspondante
n'est pas ouverte aux jetons d'automatisation). C'est la seule étape manuelle,
et elle prend dix secondes :

1. **Settings** › **Pages** ;
2. *Build and deployment* › **Source : Deploy from a branch** ;
3. Branche : **`claude/recreer-skype-complet-1qvll5`** — c'est la branche par
   défaut du dépôt — et dossier : **`/docs`** ;
4. **Save**.

Une minute plus tard, le site est en ligne. Il se met à jour tout seul à chaque
envoi sur cette branche : il n'y a rien à reconstruire ni à redéployer.

> `docs/.nojekyll` est là pour empêcher GitHub de faire passer la page dans
> Jekyll : le HTML est servi exactement tel qu'il est écrit.

---

## 2. Le remplir — publier les fichiers à télécharger

La page **n'écrit aucun lien de téléchargement à la main**. Au chargement, elle
interroge l'API du dépôt :

```
GET https://api.github.com/repos/Lauzalaiah/Skype/releases/latest
```

et remplit ses boutons avec les fichiers réellement publiés — nom, taille,
date, empreinte. C'est ce qui garantit qu'un bouton ne peut pas pointer vers un
fichier qui n'existe pas : tant qu'aucune version n'est publiée, la page
affiche un avertissement et renvoie vers la page des versions du dépôt.

Pour publier une version, il faut donc lancer le workflow
`.github/workflows/release.yml` :

- **Actions** › **Publier une version** › **Run workflow** ;
- ou en poussant une étiquette : `git tag v8.137.2 && git push origin v8.137.2`.

Il exécute la suite de tests, construit l'application sur un vrai exécuteur
Windows, macOS et Linux, calcule les empreintes SHA-256, puis crée la
« release » `v<version>` avec les quatre fichiers :

| Fichier | Système |
| --- | --- |
| `Skype-Reborn-Setup-<version>.exe` | Windows 10 / 11 |
| `Skype-Reborn-<version>.dmg` | macOS |
| `Skype-Reborn-<version>.AppImage` | Linux |
| `SHA256SUMS.txt` | vérification des trois précédents |
| `latest.yml`, `latest-mac.yml`, `latest-linux.yml` | **mise à jour automatique** |

Relancer le workflow sur une version déjà publiée remplace les fichiers au lieu
d'échouer.

> Les trois fichiers `latest*.yml` ne servent à personne qui télécharge à la
> main : ce sont eux que **les applications déjà installées** interrogent pour
> apprendre qu'une version plus récente existe. Les oublier ne casse rien de
> visible — les utilisateurs restent simplement bloqués sur leur vieille
> version, sans le savoir. Le workflow échoue plutôt que de publier sans eux,
> et `test/maj.test.js` verrouille la règle.

---

## 2 bis. Ce qui est vérifié avant que la publication ne parte

Une mise à jour ratée **ne se plaint jamais**. L'application installée continue
de tourner, ne dit rien, et reste sur son ancienne version pour toujours : pas
de message d'erreur, pas de plainte d'utilisateur, juste un parc qui ne bouge
plus. Tout se vérifie donc avant, jamais après.

**Sur l'application construite** — elle est réellement démarrée sur l'exécuteur
Linux, et son serveur embarqué interrogé. Construire ne prouve rien : les
défauts d'empaquetage (modules ES perdus, `package.json` absent, sons oubliés)
ne se manifestent qu'au démarrage de l'application installée. Sont vérifiés :
le démarrage, la version servie, et la présence des sons.

**Sur les fichiers à publier** — `scripts/verifier-publication.mjs` refuse la
publication dans cinq cas, chacun correspondant à une panne silencieuse :

| Défaut | Ce que vivrait l'utilisateur |
| --- | --- |
| La description annonce une autre version que l'application | mise à jour, redémarrage sur le même numéro, remise à jour… en boucle |
| Elle désigne un fichier non publié | téléchargement en 404 |
| L'empreinte ne correspond pas au fichier | l'application télécharge 100 Mo puis refuse d'installer, sans un mot |
| La version n'est pas plus récente que la précédente | personne ne reçoit rien, et la page de téléchargement recule |
| Un système n'a pas de description | ce système ne recevra plus jamais de mise à jour |

`test/publication.test.js` fabrique chacune de ces publications défectueuses et
exige qu'elle soit refusée — sans quoi rien ne prouverait que le vérificateur
refuse quoi que ce soit.

---

## 3. Ce que le site ne fait pas

- **Il n'héberge pas le serveur de Skype Reborn.** GitHub Pages ne sert que des
  fichiers statiques : il distribue l'application, il ne la fait pas tourner.
  Pour que deux personnes se parlent, il faut un serveur — voir
  [HEBERGEMENT.md](HEBERGEMENT.md).
- **Il ne compte pas les téléchargements sur la page.** Aucun traceur, aucune
  statistique affichée. GitHub tient ce décompte de son côté, dans l'API des
  versions.

---

## 4. Les règles que la page doit respecter

`test/site.test.js` les vérifie à chaque exécution de `npm test`, parce qu'une
phrase malheureuse suffirait à transformer une page honnête en usurpation :

- la mention **« Projet de fan, non officiel »** apparaît avant tout le reste ;
- l'absence de lien avec Microsoft est écrite explicitement, et l'usage
  nominatif de la marque est précisé ;
- aucune formulation ne laisse croire à un retour officiel de Skype ;
- aucun avis, témoignage ni compteur de téléchargements inventé ;
- l'absence de signature du code est annoncée, pas dissimulée ;
- tout lien vers le dépôt vise bien `Lauzalaiah/Skype`, et tout fichier lié
  existe réellement ;
- chaque bouton a une destination valide **avant** le moindre appel réseau ;
- les extensions publiées par le workflow sont exactement celles que la page
  sait reconnaître.

---

## 5. Une adresse à soi

Pour servir le site sur un nom de domaine personnel, ajoutez un fichier
`docs/CNAME` contenant ce seul nom (par exemple `skype-reborn.fr`), faites
pointer un enregistrement DNS `CNAME` vers `lauzalaiah.github.io`, puis cochez
*Enforce HTTPS* dans Settings › Pages. Rien d'autre ne change.
