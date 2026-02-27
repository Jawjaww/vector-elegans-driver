# Vector Elegans - Configuration Docker (Stable)

Ce document décrit la configuration **éprouvée et fonctionnelle** pour l'environnement de développement Docker + Expo + Supabase.
**Ne pas modifier cette configuration sans tester sur un device physique.**

## 1. Principe Fondamental : IP Fixe

Pour que l'application mobile (sur téléphone) puisse communiquer avec les services (Supabase, API) hébergés sur votre ordinateur via Docker, **l'utilisation de `localhost` ou `127.0.0.1` est INTERDITE** dans les variables d'environnement exposées à l'app.

Il faut impérativement utiliser l'adresse IP locale de votre machine (ex: `10.158.223.240`).

## 2. Fichiers de Configuration Critiques

### A. `docker-compose.yml`

Ce fichier doit contenir deux éléments essentiels :
1. La variable `REACT_NATIVE_PACKAGER_HOSTNAME` définie sur l'IP de votre machine.
2. La variable `EXPO_PUBLIC_SUPABASE_URL` utilisant cette même IP.

```yaml
services:
  expo:
    # ...
    environment:
      # ⚠️ CRITIQUE : L'IP doit être celle de votre machine (pas localhost)
      - REACT_NATIVE_PACKAGER_HOSTNAME=10.158.223.240
      - EXPO_PUBLIC_SUPABASE_URL=http://10.158.223.240:54329
      # ... autres variables
    # ...
    # Le flag --tunnel est utilisé pour assurer la connectivité externe si nécessaire
    command: npx expo start --tunnel --clear
```

### B. `.env` (Environnement)

Le fichier `.env` utilisé par Expo doit également refléter cette IP pour les accès API.

```bash
# ⚠️ CRITIQUE : Pas de localhost ici !
EXPO_PUBLIC_SUPABASE_URL=http://10.158.223.240:54329
EXPO_PUBLIC_API_URL=http://10.158.223.240:54329

# Clés Supabase (ne pas commiter les vraies clés en prod)
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_SUPABASE_STORAGE_ANON_KEY=...
```

## 3. Prévention des régressions

Pour éviter que cette configuration ne soit cassée par inadvertance, un script de validation est disponible.

### Script de vérification (`check-config.sh`)

Créez ou utilisez le script `scripts/check-config.sh` pour valider votre environnement avant de lancer `docker compose up`.

**Règles vérifiées :**
1. Aucune URL `localhost` ou `127.0.0.1` dans les variables `EXPO_PUBLIC_` du `.env`.
2. La variable `REACT_NATIVE_PACKAGER_HOSTNAME` est présente dans `docker-compose.yml`.

## 4. Procédure de Démarrage "Safe"

```bash
# 1. Vérifier l'IP de votre machine (Mac/Linux)
# Doit correspondre à celle dans docker-compose.yml et .env
ipconfig getifaddr en0
# ou
ifconfig | grep "inet " | grep -v 127.0.0.1

# 2. Lancer les services
docker compose up -d

# 3. Vérifier les logs pour le QR Code (si besoin)
docker compose logs -f expo
```

## 5. Dépannage Rapide

Si l'application ne se connecte plus :
1. Vérifiez si votre IP locale a changé (changement de réseau Wi-Fi).
2. Si l'IP a changé :
   - Mettez à jour `docker-compose.yml`
   - Mettez à jour `.env`
   - Redémarrez : `docker compose down && docker compose up -d`
