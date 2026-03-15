# Vector Elegans - Configuration Docker (Stable)

Ce document décrit la configuration **éprouvée et fonctionnelle** pour l'environnement de développement Docker + Expo + Supabase.
**Ne pas modifier cette configuration sans tester sur un device physique.**

## 1. Principe Fondamental : IP Fixe

Pour que l'application mobile (sur téléphone) puisse communiquer avec les services (Supabase, API) hébergés sur votre ordinateur via Docker, **l'utilisation de `localhost` ou `127.0.0.1` est INTERDITE** dans les variables d'environnement exposées à l'app.

Il faut impérativement utiliser l'adresse IP locale de votre machine (ex: `10.89.89.240`).

Pour connaître votre IP locale :
```bash
ifconfig | grep "inet " | grep -v "127.0.0.1" | head -1
```

## 2. Fichiers de Configuration Critiques

### A. `docker-compose.yml`

Ce fichier doit contenir :
1. La variable `REACT_NATIVE_PACKAGER_HOSTNAME` définie sur l'IP de votre machine.
2. Les ports exposés (8081, 19000-19002).

```yaml
services:
  expo:
    build: .
    ports:
      - "8081:8081"
      - "19000:19000"
      - "19001:19001"
      - "19002:19002"
    environment:
      # ⚠️ CRITIQUE : L'IP doit être celle de votre machine (pas localhost)
      - REACT_NATIVE_PACKAGER_HOSTNAME=10.89.89.240
      - EXPO_NO_TYPESCRIPT_SETUP=1
      - CHOKIDAR_USEPOLLING=true
      - CHOKIDAR_INTERVAL=1000
      - WATCHPACK_POLLING=true
      # ... autres variables d'environnement
```

**Note :** Ne pas utiliser `--tunnel` car cela cause des problèmes de stabilité avec ngrok. Utiliser `--host lan` ou laisser par défaut.

### B. `.env` (Environnement)

Le fichier `.env` utilisé par Expo doit également refléter cette IP pour les accès API.

```bash
# ⚠️ CRITIQUE : Pas de localhost ici !
EXPO_PUBLIC_SUPABASE_URL=http://10.89.89.240:54329
EXPO_PUBLIC_API_URL=http://10.89.89.240:54329

# Clés Supabase (ne pas commiter les vraies clés en prod)
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_SUPABASE_STORAGE_ANON_KEY=...
```

## 3. Comment lancer l'environnement

```bash
# 1. Vérifier l'IP de votre machine
ipconfig getifaddr en0
# ou
ifconfig | grep "inet " | grep -v 127.0.0.1

# 2. Mettre à jour les fichiers si nécessaire
# - docker-compose.yml: REACT_NATIVE_PACKAGER_HOSTNAME
# - .env: EXPO_PUBLIC_SUPABASE_URL

# 3. Lancer les services
docker compose up -d --build expo

# 4. Scanner le QR code avec Expo Go
# L'URL doit être: exp://10.89.89.240:8081
```

## 4. Dépannage Rapide

Si l'application ne se connecte plus :
1. Vérifiez si votre IP locale a changé (changement de réseau Wi-Fi).
2. Si l'IP a changé :
   - Mettez à jour `docker-compose.yml` → `REACT_NATIVE_PACKAGER_HOSTNAME`
   - Mettez à jour `.env` → `EXPO_PUBLIC_SUPABASE_URL`
   - Redémarrez : `docker compose down && docker compose up -d --build expo`
3. Vérifiez que Supabase est lancé : `supabase start`
4. Vérifiez la connectivité : `curl http://10.89.89.240:54329/rest/v1/`
