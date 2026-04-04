FROM node:22-alpine

# Expo CLI + outils de base
RUN npm install -g @expo/cli@latest && \
    apk add --no-cache git bash curl

WORKDIR /app

# Copier package.json
COPY package.json ./

# Installer les dépendances
RUN npm install --legacy-peer-deps

# Exposer les ports Expo
EXPOSE 8081 19000 19001 19002

# Démarrer Expo
CMD ["sh", "-c", "npx expo start --host lan --clear"]
