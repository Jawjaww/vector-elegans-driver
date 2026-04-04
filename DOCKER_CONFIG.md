# Vector Elegans - Configuration Docker (Stable)

Ce document décrit la configuration **éprouvée et fonctionnelle** pour l'environnement de développement Docker + Expo + Supabase.
**Ne pas modifier cette configuration sans tester sur un device physique.**

## 1. Principe Fondamental : IP fixe (recommandation)

Pour que l'application mobile (sur téléphone) puisse communiquer avec les services (Supabase, API) hébergés sur votre ordinateur via Docker, **n'utilisez pas `localhost` ou `127.0.0.1`** dans les variables d'environnement exposées à l'app. Préférez l'adresse IP locale (LAN) de la machine ou passez-la au démarrage du conteneur.

Pour connaître votre IP locale (macOS) :
```bash
ipconfig getifaddr en0
# si votre Wi‑Fi est sur une autre interface : ipconfig getifaddr en1
```

## 2. Fichiers de Configuration Critiques

### A. `docker-compose.yml`

Ne mettez pas une IP statique hardcodée dans `docker-compose.yml`. Utilisez la substitution d'environnement au démarrage pour éviter les erreurs lorsque l'IP de la machine change.

Exemple recommandé :
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
      - EXPO_NO_TYPESCRIPT_SETUP=1
      - REACT_NATIVE_PACKAGER_HOSTNAME=${REACT_NATIVE_PACKAGER_HOSTNAME} # passez l'IP au démarrage
      - CHOKIDAR_USEPOLLING=true
      - CHOKIDAR_INTERVAL=1000
      - WATCHPACK_POLLING=true
```

Note : préférez `--host lan` ou la variable d'environnement ci‑dessus. `--tunnel` peut fonctionner en dernier recours (plus lent, moins stable).

### B. `.env` (Environnement)

Le fichier `.env` utilisé par Expo doit contenir l'URL Supabase accessible depuis votre téléphone. Ne mettez pas `localhost` : remplacez par l'IP LAN de la machine.

Exemple (remplacez `<YOUR_HOST_IP>` par votre IP locale) :
```bash
# EXEMPLE :
EXPO_PUBLIC_SUPABASE_URL=http://<YOUR_HOST_IP>:54329
EXPO_PUBLIC_API_URL=http://<YOUR_HOST_IP>:54329

# Clés Supabase (ne pas commiter les vraies clés en prod)
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_SUPABASE_STORAGE_ANON_KEY=...
```

## 3. Comment lancer l'environnement (recommandé)

Suivez ces étapes (macOS) pour éviter toute erreur réseau :

```bash
# 1. Récupérer l'IP LAN de la machine
HOST_IP=$(ipconfig getifaddr en0) # ou en1 selon l'interface

# 2. Mettre à jour .env automatiquement (macOS)
sed -i '' "s|^EXPO_PUBLIC_SUPABASE_URL=.*|EXPO_PUBLIC_SUPABASE_URL=http://$HOST_IP:54329|" .env
sed -i '' "s|^EXPO_PUBLIC_API_URL=.*|EXPO_PUBLIC_API_URL=http://$HOST_IP:54329|" .env

# 3. Démarrer Expo en indiquant l'IP du packager
REACT_NATIVE_PACKAGER_HOSTNAME=$HOST_IP docker compose up -d --build expo

# 4. Vérifier Metro et Supabase
curl -I http://$HOST_IP:8081/
curl -I http://$HOST_IP:54329/rest/v1

# Remarque (Linux): utilisez `hostname -I` ou `ip addr` pour récupérer l'IP.
```

## 4. Dépannage rapide

Si l'application ne se connecte plus :
1. Vérifiez si votre IP locale a changé (changement de réseau Wi‑Fi).
2. Si l'IP a changé :
  - Mettez à jour `.env` (voir la commande `sed` ci‑dessus) ou éditez‑le manuellement.
  - Redémarrez : `REACT_NATIVE_PACKAGER_HOSTNAME=$(ipconfig getifaddr en0) docker compose down && REACT_NATIVE_PACKAGER_HOSTNAME=$(ipconfig getifaddr en0) docker compose up -d --build expo`
3. Vérifiez que Supabase est lancé (infra) : `supabase start`
4. Vérifiez la connectivité depuis votre téléphone ou machine :
  - `curl -I http://<YOUR_HOST_IP>:54329/rest/v1/`
  - `curl -I http://<YOUR_HOST_IP>:8081/`

5. Si vos appareils sont sur des réseaux différents :
  - Utilisez `npx expo start --tunnel` (solution de secours, plus lent), ou
  - Pour Android avec USB : `adb reverse tcp:8081 tcp:8081`.
