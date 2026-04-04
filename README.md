# Vector Elegans - Driver Mobile App

Application mobile Expo pour les chauffeurs de Vector Elegans.

## Architecture

- **Image Docker**: `expo/eas-cli:latest` (cloud-native, 2026)
- **Framework**: Expo SDK 54.0.33 + React Native 0.81.5
- **Navigation**: Expo Router 6.0.23 (file-based routing)
- **State Management**: Zustand 5.0.11
- **Authentification**: Supabase Auth avec SecureStore
- **Upload Documents**: Supabase Storage avec signed URLs
- **Notifications**: Expo Notifications
- **Localisation**: Expo Location (background GPS)
- **Styling**: NativeWind 4.2.1 (Tailwind-like)
- **UI Components**: Gluestack-UI 3.0.11

## Structure

```
vector-elegans/
├── src/
│   ├── components/      # Composants réutilisables (GlassCard, ElegantButton, etc.)
│   ├── screens/         # Écrans de l'app (HomeScreen, DocumentUploadScreen)
│   ├── lib/             # Clients/API (Supabase, stores, services, utils)
│   │   ├── stores/      # Zustand stores (driverStore, driverFolderStore)
│   │   ├── services/    # Services métier (rideService, routing)
│   │   └── utils/       # Utilitaires (auth-helpers, driverUtils, map)
│   ├── hooks/           # Custom React hooks (useDriverLocation, useNotifications, useRealtimeRides)
│   ├── i18n/            # Internationalisation (i18next + expo-localization)
│   ├── map/             # Composants de cartographie
│   └── types/           # Types TypeScript (nativewind, navigation)
├── app/                 # Expo Router (app/(tabs)/, app/(auth)/)
├── assets/              # Images, icônes
├── Dockerfile           # Image expo/eas-cli
├── docker-compose.yml   # Services dev/build
├── app.json            # Configuration Expo
├── eas.json            # Configuration EAS Build
└── package.json        # Dépendances
```

## Démarrage Rapide

```bash
# Copier les variables d'environnement
cp .env.example .env
# Éditer .env avec vos valeurs

# Démarrer en développement
docker-compose up expo

# Build EAS (production)
docker-compose --profile build up eas-build
```

## Réseau — Expo + Supabase (développement)

Important : pour le développement mobile, n'utilisez jamais `localhost` dans les URLs exposées à l'app. Utilisez l'adresse IP LAN de la machine ou passez-la au démarrage du conteneur.

Commandes recommandées (macOS) :

```bash
# Récupérer l'IP LAN
HOST_IP=$(ipconfig getifaddr en0)

# Mettre à jour .env (macOS)
sed -i '' "s|^EXPO_PUBLIC_SUPABASE_URL=.*|EXPO_PUBLIC_SUPABASE_URL=http://$HOST_IP:54329|" .env
sed -i '' "s|^EXPO_PUBLIC_API_URL=.*|EXPO_PUBLIC_API_URL=http://$HOST_IP:54329|" .env

# Démarrer Expo en fournissant l'IP du packager
REACT_NATIVE_PACKAGER_HOSTNAME=$HOST_IP docker compose up -d --build expo

# Vérifier Metro et Supabase depuis l'hôte
curl -I http://$HOST_IP:8081/
curl -I http://$HOST_IP:54329/rest/v1

# Si vos appareils sont sur des réseaux différents, utilisez le tunnel :
# docker compose exec -T expo sh -c 'npx expo start --tunnel'
```

## Types Database

Le fichier `database.types.ts` a été généré par Supabase et est crucial pour respecter les types distants :

**Emplacement** : `elegance-mobilite tmp/src/lib/types/database.types.ts`

## Variables d'Environnement

| Variable                                | Description          |
| --------------------------------------- | -------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`              | URL Supabase         |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY`         | Clé anon Supabase    |
| `EXPO_PUBLIC_SUPABASE_STORAGE_ANON_KEY` | Clé storage (pk\_\*) |
| `EXPO_PUBLIC_API_URL`                   | URL API backend      |
| `EXPO_TOKEN`                            | Token EAS pour CI/CD |

## Migration depuis le Driver Portal Web (elegance-mobilite tmp)

**État de la migration** : En cours - Plusieurs composants déjà migrés

### Composants Migrés ✅

- `src/screens/DocumentUploadScreen.tsx` (DriverProfileSetup)
- `src/components/DriverDocumentUploader.tsx`
- `src/components/GlassCard.tsx`
- `src/components/ElegantButton.tsx`
- `src/components/SwipeButton.tsx`
- `src/hooks/useDriverLocation.ts`
- `src/hooks/useNotifications.ts`
- `src/lib/stores/driverStore.ts`

### Composants à Migrer 🔄

- `elegance-mobilite tmp/src/app/driver-portal/` → `app/(tabs)/`
- `elegance-mobilite tmp/src/components/driver/` → `src/components/`
- `elegance-mobilite tmp/src/components/map/` → `src/map/`

### Fichiers Utiles à Consulter

- `elegance-mobilite tmp/src/lib/types/database.types.ts` (types Supabase)
- `elegance-mobilite tmp/src/lib/stores/driversStore.ts`
- `elegance-mobilite tmp/src/services/rideService.ts`
- `elegance-mobilite tmp/src/config/map.ts`
  /Users/beij/Documents/dev/vector-elegans-project/elegance-mobilite tmp/src/lib/stores/driversStore.ts
  /Users/beij/Documents/dev/vector-elegans-project/elegance-mobilite tmp/src/lib
  /Users/beij/Documents/dev/vector-elegans-project/elegance-mobilite tmp/src/hooks
  /Users/beij/Documents/dev/vector-elegans-project/elegance-mobilite tmp/src/config/map.ts
  /Users/beij/Documents/dev/vector-elegans-project/elegance-mobilite tmp/src/services/rideService.ts
  mais aussi dans les dossiers lib, stores et services
  /Users/beij/Documents/dev/vector-elegans-project/elegance-mobilite tmp/src/services/directionsService.ts
  /Users/beij/Documents/dev/vector-elegans-project/elegance-mobilite tmp/src/stores/driverStore.ts
  [ ](<../elegance-mobilite tmp/src/styles>)
  /Users/beij/Documents/dev/vector-elegans-project/elegance-mobilite tmp/src/lib/constants/rideStatus.ts
  [text](<../elegance-mobilite tmp/src/lib/driver>)

## Fonctionnalités Mobile

- [ ] Rides and maps
- [ ] Upload documents (permis, ID, etc.)
- [ ] GPS background pour tracking trajets
- [ ] Push notifications
- [ ] Authentification sécurisée
- [ ] Mode offline

## Sécurité

- Stockage SecureStore pour les tokens
- Uploads signés (pas de clés exposées)
- RLS policies sur Supabase
- Pas de secrets dans le code

Bref tout ce qui seras necessaires aux drivers pour accepter les courses provenant de supabase et les effectuer

## Documentation

/Users/beij/Documents/dev/vector-elegans-project/elegance-mobilite tmp/docs

## Migration et fonctions Supabase

/Users/beij/Documents/dev/vector-elegans-project/elegance-mobilite tmp/supabase
