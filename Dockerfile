FROM node:22-alpine

# Expo CLI + outils de base
RUN npm install -g @expo/cli@latest \
  && apk add --no-cache git bash curl

WORKDIR /app

# On part juste du package.json (lockfile sera régénéré)
COPY package.json ./

# Install des deps à partir de ton package.json corrigé
RUN npm install --legacy-peer-deps

# On ne copie pas tout le code ici : il sera monté en volume
# COPY . .   # <- inutile avec le docker-compose ci-dessous

EXPOSE 8081 19000 19001 19002

CMD ["sh", "-c", "npx expo start --host lan --clear"]
