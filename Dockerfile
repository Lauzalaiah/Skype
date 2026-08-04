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
VOLUME /données

# Jamais en root : une faille dans le serveur ne doit pas donner la machine.
USER node

EXPOSE 3000

# Le conteneur est déclaré en panne si le serveur cesse de répondre, ce qui
# permet à Docker (ou au reverse proxy) de le redémarrer tout seul.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
