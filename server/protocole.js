/**
 * Le numéro de protocole, et pourquoi il n'est pas le numéro de version.
 *
 * Dans un navigateur, la question ne se pose pas : la page vient du serveur,
 * les deux sont forcément d'accord. L'application installée, elle, embarque
 * son interface et parle à un serveur distant qu'elle ne contrôle pas. Rien
 * n'oblige les deux à porter le même numéro, et rien ne le fera jamais : on
 * ne peut pas demander à chaque personne de mettre à jour son application le
 * jour où l'administrateur met à jour le serveur.
 *
 * Il faut donc une réponse à « ces deux-là peuvent-ils se parler ? » qui ne
 * dépende pas de la version du produit. Le numéro de version bouge à chaque
 * correctif, à chaque son ajouté, à chaque phrase corrigée — s'en servir pour
 * juger la compatibilité refuserait des couples qui fonctionnent très bien.
 *
 * Ce numéro-ci ne bouge que lorsqu'un client ancien cesserait réellement de
 * fonctionner : point d'API supprimé ou renommé, champ obligatoire ajouté à
 * une requête, forme d'un message WebSocket modifiée. Ajouter un point d'API
 * ou un champ facultatif ne le change pas : les anciens clients ne les
 * demandent pas, et s'en portent bien.
 *
 * ── Historique ──────────────────────────────────────────────────────────────
 *
 *   1  Première version numérotée. Les serveurs antérieurs ne renvoient rien
 *      du tout à cet endroit — c'est prévu, et traité comme « protocole 1 » :
 *      refuser les serveurs déjà déployés aurait été le comble, pour une
 *      mesure censée préserver la compatibilité.
 */
export const PROTOCOLE = 1;
