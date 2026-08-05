# Skype Reborn — serveur.
#
# Le projet n'a aucune dépendance npm : il n'y a donc ni « npm install », ni
# étape de construction, ni couche d'outillage. On copie le code, et on lance.
# L'image tient en quelques mégaoctets au-dessus de Node.
FROM node:22-alpine

# Node 22 au minimum : le serveur tourne dès la 18, mais la suite de tests se
# connecte avec le client WebSocket natif, apparu en 22.
WORKDIR /app

COPY package.json ./
COPY server ./server
COPY public ./public

# Les conversations et les fichiers envoyés vivent ici, hors de l'image :
# c'est le seul dossier à sauvegarder.
ENV SKYPE_DATA_DIR=/données \
    HOST=0.0.0.0 \
    PORT=3000

RUN mkdir -p /données && chown -R node:node /données /app

# Le dossier de données est monté depuis l'hôte. Quand Docker doit le créer,
# il le crée au nom de root — et le serveur, qui ne tourne pas en root, ne
# peut alors rien y écrire. Le point d'entrée corrige ces droits au démarrage,
# puis abandonne les privilèges.
#
# « su-exec » remplace le processus au lieu d'en lancer un second : Node reçoit
# donc directement les signaux d'arrêt de Docker, et enregistre avant de
# quitter.
RUN apk add --no-cache su-exec
COPY entree.sh /usr/local/bin/entree.sh
RUN chmod +x /usr/local/bin/entree.sh

# Pas de « VOLUME » ici : la directive crée un volume anonyme dès qu'aucun
# montage n'est donné, et ces volumes s'accumulent sans nom, oubliés, à chaque
# recréation du conteneur. La composition monte « ./donnees » explicitement,
# ce qui est à la fois plus clair et sauvegardable.

# Le conteneur démarre en root le temps de corriger les droits ; le serveur,
# lui, tourne sous « node ». C'est le processus qui écoute sur le réseau qui
# compte, et il n'est jamais privilégié.
ENTRYPOINT ["/usr/local/bin/entree.sh"]

EXPOSE 3000

# Le conteneur est déclaré en panne si le serveur cesse de répondre, ce qui
# permet à Docker (ou au reverse proxy) de le redémarrer tout seul.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
