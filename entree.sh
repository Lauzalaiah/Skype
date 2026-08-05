#!/bin/sh
# Point d'entrée du conteneur.
#
# Le problème qu'il règle, et qui ne se voit qu'une fois « docker compose
# up -d » lancé sur une machine neuve : le dossier de données est monté depuis
# l'hôte (« ./donnees »). S'il n'existe pas encore, Docker le crée — et il le
# crée au nom de root. Le serveur, lui, tourne sous « node », qui n'a alors
# aucun droit d'écriture : il s'arrête sur une erreur de permission avant même
# d'avoir servi une page, et le conteneur se déclare en panne.
#
# On répare donc les droits ici, tant qu'on est encore root, puis on abandonne
# ces droits définitivement pour lancer le serveur. Une faille dans le serveur
# ne donne pas la machine : le processus qui écoute sur le réseau n'est jamais
# root.

set -e

DONNEES="${SKYPE_DATA_DIR:-/données}"
mkdir -p "$DONNEES"

# Ne pas relancer un « chown -R » à chaque démarrage sur des années de
# conversations : on ne corrige que si le dossier n'appartient pas déjà à node.
if [ "$(stat -c %u "$DONNEES")" != "$(id -u node)" ]; then
  echo "Droits du dossier de données corrigés pour l'utilisateur « node »."
  chown -R node:node "$DONNEES"
fi

# su-exec remplace le processus courant : pas de shell intermédiaire, donc les
# signaux d'arrêt de Docker parviennent bien à Node, qui enregistre avant de
# quitter.
exec su-exec node "$@"
