/**
 * Qui peut réellement s'installer par-dessus soi-même.
 *
 * Cette règle est isolée dans son propre fichier pour une raison précise :
 * elle décide si la mise à jour automatique fonctionne, et une mise à jour
 * qui échoue ne se plaint jamais. L'application cherche, trouve, télécharge,
 * rate l'installation, et ne dit rien — l'utilisateur reste sur sa vieille
 * version pour toujours sans le savoir. Une règle aussi silencieuse doit
 * pouvoir être vérifiée par un test, ce qu'un module important « electron »
 * ne permet pas.
 *
 * Trois cas :
 *
 *   — Windows remplace son propre installateur sans difficulté ;
 *
 *   — macOS exige qu'une application soit signée par un certificat Apple pour
 *     se remplacer elle-même. Celle-ci ne l'est pas ;
 *
 *   — Linux dépend de la forme installée. Une AppImage est un simple fichier
 *     dans le dossier de l'utilisateur : elle peut se remplacer. Un paquet
 *     .deb ou .rpm vit dans /opt, appartient à root, et c'est le gestionnaire
 *     de paquets qui décide de ce qui s'y trouve — passer derrière lui serait
 *     une mauvaise idée même si c'était possible.
 *
 * La variable APPIMAGE est posée par l'AppImage elle-même au lancement :
 * c'est le seul moyen fiable de distinguer les deux.
 */
export function peutSInstallerSeul(
  plateforme = process.platform,
  environnement = process.env,
) {
  if (plateforme === 'darwin') return false;
  if (plateforme === 'linux') return Boolean(environnement.APPIMAGE);
  return true;
}
