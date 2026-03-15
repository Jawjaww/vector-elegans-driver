# Règles pour l'IA

## Variables d'environnement - CRUCIAL

### IP Locale pour Supabase et Expo

- L'IP locale de la machine DOIT être utilisée (pas localhost/127.0.0.1!)
- Pour connaître votre IP : `ifconfig | grep "inet " | grep -v "127.0.0.1" | head -1`
- Exemple: `10.89.89.240`

### Configuration docker-compose.yml

```yaml
services:
  expo:
    environment:
      - REACT_NATIVE_PACKAGER_HOSTNAME=10.89.89.240  # IP de votre machine
```

### Configuration .env

```bash
EXPO_PUBLIC_SUPABASE_URL=http://10.89.89.240:54329
EXPO_PUBLIC_API_URL=http://10.89.89.240:54329
```

### Clés à utiliser

- Voir `.env` pour les clés anon (EXPO_PUBLIC_SUPABASE_ANON_KEY)
- NE JAMAIS utiliser localhost ou 127.0.0.1 dans le code ou config
- NE JAMAIS utiliser l'URL du cloud Supabase (supabase.co)

## Commandes Docker

- Toujours utiliser `docker compose up -d --build expo` après modifications
- Vérifier les logs: `docker compose logs -f expo`

## Notes rapdes

- Pour appliquer une migration SQL immédiatement :
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54325/postgres" -v ON_ERROR_STOP=1 -f infra-supabase/supabase/migrations/20260227130000_add_dossier_state_functions.sql
```

## Créer des utilisateurs de test

Après un `supabase db reset` ou nouvelle installation:

```bash
# 1. Reset la DB (applique migrations + seed)
cd infra-supabase && supabase db reset

# 2. Créer les utilisateurs Auth (car seed ne peut pas utiliser GoTrue)
cd infra-supabase && ./scripts/create-test-users.sh
```

Le seed crée les données publiques (drivers, vehicles, etc.) mais les utilisateurs Auth doivent être créés via l'API car GoTrue utilise son propre système de hash de mot de passe.

## Design System

- **NativeWind** - pour le styling Tailwind-like
- **react-native-reanimated** - pour les animations
- **Gluestack-UI** - pour les composants UI (Button, Input, Card, etc.)
- **Style pattern:** "Elegant Dark Mode" (inspiré de `globals.css` du web)
  - **Couleurs principales:**
    - Background Start: `#0b1220` (Dark Blue/Gray)
    - Background Mid/End: `#041428`
    - Accent: `#4a77a8` (Bluish Gray)
  - **Gradients:**
    - Global Background: `linear-gradient(180deg, #2f3338 0%, #000000 100%)`
    - Cards/Modals: `linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.008))`
  - **Glass Effect:**
    - Border: `1px solid rgba(255, 255, 255, 0.06)`
    - Shadow: `0 12px 36px rgba(2, 6, 23, 0.5)`
    - Backdrop Blur: `blur(10px)` (ou `blur-md` en NativeWind)
  - **Boutons:**
    - Base: `rgba(255, 255, 255, 0.02)` avec bordure `rgba(255, 255, 255, 0.06)`
    - Text: `var(--elegant-accent)` (#4a77a8)
    - Hover/Active: Gradient subtil `rgba(74, 119, 168, 0.08)`
