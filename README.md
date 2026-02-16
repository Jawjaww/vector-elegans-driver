# Vector Elegans - Driver Mobile App

Application mobile Expo pour les chauffeurs de Vector Elegans.

## Architecture

- **Image Docker**: `expo/eas-cli:latest` (cloud-native, 2026)
- **Framework**: Expo SDK 50 + React Native
- **Authentification**: Supabase Auth avec SecureStore
- **Upload Documents**: Supabase Storage avec signed URLs
- **Notifications**: Expo Notifications
- **Localisation**: Expo Location (background GPS)

## Structure

```
vector-elegans/
├── src/
│   ├── components/     # Composants réutilisables
│   ├── screens/        # Écrans de l'app
│   ├── navigation/     # Configuration navigation
│   ├── lib/           # Clients/API (Supabase, etc.)
│   ├── hooks/         # Custom React hooks
│   └── types/         # Types TypeScript
├── assets/            # Images, icônes
├── Dockerfile         # Image expo/eas-cli
├── docker-compose.yml # Services dev/build
├── app.json          # Configuration Expo
├── eas.json          # Configuration EAS Build
└── package.json      # Dépendances
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

## Ce fichier database.types as été généré par supabase donc il seras d'une tres grande importance pour construire l'application mobile en respectant les types distants

/Users/beij/Documents/dev/vector-elegans-project/elegance-mobilite tmp/src/lib/types/database.types.ts

## Variables d'Environnement

| Variable                                | Description          |
| --------------------------------------- | -------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`              | URL Supabase         |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY`         | Clé anon Supabase    |
| `EXPO_PUBLIC_SUPABASE_STORAGE_ANON_KEY` | Clé storage (pk\_\*) |
| `EXPO_PUBLIC_API_URL`                   | URL API backend      |
| `EXPO_TOKEN`                            | Token EAS pour CI/CD |

## Migration depuis le Driver Portal Web

Les composants et dossiers suivants sont à migrer:

/Users/beij/Documents/dev/vector-elegans-project/elegance-mobilite tmp/src/app/driver-portal
/Users/beij/Documents/dev/vector-elegans-project/elegance-mobilite tmp/src/components/driver
/Users/beij/Documents/dev/vector-elegans-project/elegance-mobilite tmp/src/components/drivers
/Users/beij/Documents/dev/vector-elegans-project/elegance-mobilite tmp/src/app/driver-portal/login
/Users/beij/Documents/dev/vector-elegans-project/elegance-mobilite tmp/src/components/layout/DriverHeader.tsx
/Users/beij/Documents/dev/vector-elegans-project/elegance-mobilite tmp/src/components/map/DriverMap.tsx
/Users/beij/Documents/dev/vector-elegans-project/elegance-mobilite tmp/src/components/map/RideRequestMap.tsx
/Users/beij/Documents/dev/vector-elegans-project/elegance-mobilite tmp/src/components/map/UnifiedMap.tsx

1. **Auth flow** → `src/screens/AuthScreen.tsx`
2. **DriverProfileSetup** → `src/screens/DocumentUploadScreen.tsx`
3. **DriverDocumentUploader** → `src/components/DriverDocumentUploader.tsx`

D'autres fichiers peuvent etre utiles tres utiles dans le dossier hooks:

/Users/beij/Documents/dev/vector-elegans-project/elegance-mobilite tmp/src/lib/types/database.types.ts
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
