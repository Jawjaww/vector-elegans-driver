# Règles pour l'IA

## Variables d'environnement - CRUCIAL

Deux backends possibles, **un seul actif** dans `.env` à la fois. Pas besoin de projet Expo distant pour le quotidien (Expo Go / Metro local).

| Mode | Script | Backend |
|------|--------|---------|
| **Local (défaut)** | `./scripts/sync-local-supabase-env.sh` | Supabase Docker via **IP LAN** `:54329` |
| **Cloud (= Vercel)** | `./scripts/use-cloud-supabase-env.sh` | `https://iodsddzustunlahxafif.supabase.co` |

Ou à la main : commenter le bloc LAN / décommenter le bloc cloud dans `.env` (et l’inverse).

Après tout changement : `npx expo start -c`

### Local — IP LAN (pas localhost)

- Sur device physique : IP Wi‑Fi du Mac, jamais `localhost` / `127.0.0.1`
- Exemple: `ifconfig | grep "inet " | grep -v "127.0.0.1" | head -1`

### Configuration docker-compose.yml

```yaml
services:
  expo:
    environment:
      - REACT_NATIVE_PACKAGER_HOSTNAME=10.89.89.240  # IP de votre machine
```

### Configuration .env

```bash
# Local Docker (quotidien) :
./scripts/sync-local-supabase-env.sh

# Même DB que elegance-mobility.vercel.app :
./scripts/use-cloud-supabase-env.sh

# Retour local :
./scripts/sync-local-supabase-env.sh
# ou: cp .env.lan.bak .env
```

Smoke test local (phone Safari, même Wi‑Fi) : `http://<LAN_IP>:54329/auth/v1/health`

### Clés / carte

- Clés anon : `EXPO_PUBLIC_SUPABASE_ANON_KEY` dans `.env`
- Carte : **MapLibre WebView** (`src/map/VTCMap` → `WebViewMap`) — pas Google Maps
- Offres : card compacte bas + map live en haut — voir `vector-elegans-docs/mobile/OFFER_MAP.md`
- Code mort : ne pas laisser de composants/hooks sans import ; même nom ≠ même app (voir `.cursor/rules/no-dead-code.mdc`). Swipe pile Expo : `useOfferDismissGesture` sur la card avant → `cycleAvailableRideToBack`. Refuser → `deferAvailableRide`.
- `extra.eas.projectId` dans `app.config.js` : requis pour `eas build` et EAS Update OTA

## EAS Build / Update (CNG, pas de `android/` commité)

Le natif Android est **généré par prebuild** sur EAS à partir de [`app.config.js`](app.config.js) (plugins, permissions, FCM, icônes). Les dossiers `android/` et `ios/` sont **gitignorés** — ne pas les committer.

L’APK preview embarque le runtime natif une fois ; les correctifs **JS/TS/styles** passent ensuite via OTA (`expo-updates`, channel `preview` dans [`eas.json`](eas.json), `runtimeVersion` = `"1.0.1"` aligné sur `version` dans `app.config.js`).

Build local natif (optionnel) : `npx expo prebuild --platform android` (recrée `android/` localement, non versionné).

### Première fois (ou changement natif)

```bash
# Bump runtimeVersion dans app.config.js si plugin natif / dep native / permissions changent
eas build --profile preview --platform android --non-interactive
# Installer le nouvel APK sur le téléphone
```

### Fixes JS après install (sans réinstall)

```bash
npm run update:preview -- "fix login map"
# Kill + relancer l’app sur le device pour appliquer l’update
```

- Env cloud : `--environment preview` reprend les `EXPO_PUBLIC_*` du projet EAS (même DB que Vercel).
- **Expo Go / Metro** ≠ OTA : dev local reste `npx expo start` ; OTA ne s’applique qu’aux builds preview/production.
- Rebuild obligatoire si : nouvelle dep native, plugin `app.config.js`, icône/splash, permissions.

Dashboard updates : https://expo.dev/accounts/jawjaww/projects/vector-elegans-driver/updates

## Pastille overlay Android (`modules/ve-overlay`)

But : amener l'app au premier plan avec la course **sans passer par la notification**, quand le chauffeur est en ligne. Android bloque les lancements d'Activity depuis l'arrière-plan (BAL, API 29+) ; détenir `SYSTEM_ALERT_WINDOW` **et** afficher une fenêtre overlay visible est une des exemptions documentées. La pastille *est* cette fenêtre — sans elle, le lancement est refusé.

- **Module natif local** : `modules/ve-overlay/` (Kotlin + `expo-module.config.json`), autolinké depuis `./modules` (défaut Expo). `android/` et `ios/` restent gitignorés : on committe la **source** du module, jamais le projet généré.
  - ⚠️ Les motifs du [`.gitignore`](.gitignore) sont **ancrés à la racine** (`/android/`, `/ios/`) pour cette raison : un `android/` non ancré matche aussi `modules/*/android/` et supprimerait silencieusement le Kotlin de tout module local du commit. Vérifier après ajout d'un module : `for f in $(find modules -type f); do git check-ignore -v "$f"; done` ne doit rien afficher.
- **Permission** : `android.permission.SYSTEM_ALERT_WINDOW` dans [`app.config.js`](app.config.js) — accès spécial, accordé par l'utilisateur depuis Settings. L'app affiche d'abord une explication in-app (`src/hooks/useOverlayPermissionPrompt.ts`) ; un refus est honoré et la notification reste le chemin de secours.
- **Pastille** : visible **seulement** hors premier plan et si le chauffeur est en ligne (`ProcessLifecycleOwner` côté natif). Elle disparaît dès que l'app revient, et réapparaît quand elle repart en arrière-plan.
- **JS** : `src/lib/overlay/overlayPolicy.ts` (`isOverlayAvailable`, pur, testé en Jest) + `src/lib/overlay/overlayService.ts`. Seule entrée côté JS : `setDriverOnline(boolean)`, publiée depuis [`app/_layout.tsx`](app/_layout.tsx) via l'état `isOnline` du store.
- **Dégradation** : `requireOptionalNativeModule` renvoie `null` sur iOS et sur tout binaire sans le natif → toutes les fonctions sont inertes et la notification reprend la main. C'est ce qui rend un OTA sans rebuild **sans danger** (mais sans overlay).
- **Rebuild APK obligatoire** pour l'activer : `eas build --profile preview --platform android`. Bump `runtimeVersion` dans `app.config.js` (nouveau service + dépendances natives).

### Toute décision de push en arrière-plan se prend en Kotlin

`expo-notifications` ne consulte **jamais** JS quand l'app est en arrière-plan :

```kotlin
// expo-notifications/.../service/delegates/ExpoHandlingDelegate.kt
override fun handleNotification(notification: Notification) {
  if (isAppInForeground()) {
    getListeners().forEach { it.onNotificationReceived(notification) }  // seul cas où JS décide
  } else if (notification.shouldPresent()) {
    NotificationsService.present(context, notification)                 // arrière-plan : natif, sans JS
  }
}
```

Conséquence : un `setNotificationHandler` JS ne peut **pas** ramener l'app au premier plan. Le retour au premier plan vit donc dans [`VeFirebaseMessagingService`](modules/ve-overlay/android/src/main/java/expo/modules/veoverlay/VeFirebaseMessagingService.kt), déclaré avec `android:priority="1"` (celui d'Expo est à `-1`) pour être le service résolu sur `com.google.firebase.MESSAGING_EVENT`. Il étend `ExpoFirebaseMessagingService` et appelle `super`, donc la présentation de la notification reste inchangée.

Autre piège : **`startActivity` ne signale pas un lancement bloqué**. Android ignore silencieusement un BAL refusé, sans lever d'exception — un booléen de retour est donc un faux positif. Le succès se constate par le passage du lifecycle à `RESUMED`, et c'est ce signal qui retire la notification (avec une seconde tentative, la présentation Expo étant asynchrone). Si le constructeur bloque, la notification reste : aucune offre n'est perdue.

Diagnostic : `adb logcat | grep VeOverlay` (chaque étape est journalisée) et `adb logcat | grep ActivityTaskManager` (blocage BAL éventuel).

### Compiler ce module — deux pièges invisibles depuis le cloud

EAS ne remonte qu'un `EAS_BUILD_UNKNOWN_GRADLE_ERROR` ; Gradle **local** nomme l'erreur. Deux échecs rencontrés et corrigés, à ne pas réintroduire :

1. **`expo-notifications` n'est pas un projet Gradle** dans ce SDK : il est livré en **AAR précompilé**, déclaré par le bloc `publication` de son `expo-module.config.json` (`host.exp.exponent:expo.modules.notifications`). `project(':expo-notifications')` échoue donc en « could not be found in project ':ve-overlay' ». On dépend de la **coordonnée**, résolue depuis le `local-maven-repo` du module qu'expo-autolinking lie à *tous* les projets ; la version est **lue dans le JSON**, jamais figée (une version figée pourrirait au prochain SDK). Corollaire : `firebase-messaging` et `lifecycle-process` sont déclarés `implementation` chez Expo, donc présents **uniquement dans la variante runtime** de ses métadonnées Gradle — ils ne remontent pas à notre classpath de compilation et doivent être nommés explicitement.
2. **Un manifeste de bibliothèque ne peut pas porter un `<service>` à la racine** : AAPT2 échoue en `unexpected element <service> found in <manifest>`. Le service doit être enveloppé dans un `<application>`.

Boucle locale (le JDK d'Android Studio suffit, aucun secret requis) :

```bash
cd vector-elegans
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
  npx expo prebuild --platform android --no-install
cd android && ./gradlew :ve-overlay:compileDebugKotlin   # boucle rapide sur le module
./gradlew :app:assembleDebug                             # APK complet : app/build/outputs/apk/debug/
# Release (= ce que produit le profil preview) : le métaspace par défaut du
# template (512m) fait échouer les tâches lint en `OutOfMemoryError: Metaspace`.
# EAS dispose de la marge, pas cette machine — d'où le flag explicite.
./gradlew :app:assembleRelease -Dorg.gradle.jvmargs="-Xmx4g -XX:MaxMetaspaceSize=2g"
```

`modules/*/android/build/` est gitignoré — seul le **source** du module est versionné.

## CI / OTA (GitHub Actions)

- **CI** : [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — Jest + `tsc` on push/PR to `main` (paths : `src/**`, `app/**`, `modules/**`, `app.config.js`, `app.json`, `tsconfig.json`, `package*.json`).
- **OTA preview** : [`.github/workflows/eas-update-preview.yml`](.github/workflows/eas-update-preview.yml) — runs `eas update --channel preview` after CI succeeds on `main` push (no APK rebuild).
- **Secret** : `EXPO_TOKEN` in GitHub repo secrets (`vector-elegans-driver`).
- Manual OTA remains: `npm run update:preview -- "message"`.

## Commandes Docker

- Toujours utiliser `docker compose up -d --build expo` après modifications
- Vérifier les logs: `docker compose logs -f expo`

## Types Supabase

- Source de vérité: `infra-supabase/supabase/migrations/` + types générés dans `infra-supabase/supabase/types/database.types.ts`
- Ne pas éditer à la main `src/lib/types/database.types.ts` (copie syncée)
- Régénérer depuis `infra-supabase`: `./scripts/gen-types.sh`

## Notes rapides

- **Sync dossier (home)** : Realtime `drivers` + hors-ligne immédiat dans `applyDriverStatus` + poll 45 s / `AppState` — `src/lib/utils/dossierStatusSync.ts`. Doc : `vector-elegans-docs/mobile/README-APP.md` § Sync dossier temps réel.

- Pour appliquer une migration SQL immédiatement :
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54325/postgres" -v ON_ERROR_STOP=1 -f infra-supabase/supabase/migrations/20260227130000_add_dossier_state_functions.sql
```

## Créer des utilisateurs de test

Après un `supabase db reset` ou nouvelle installation:

```bash
# 1. Reset la DB (applique migrations + seed)
cd infra-supabase && supabase db reset

# 2. Policies storage (souvent skippées — requis pour upload docs / avatars)
cd infra-supabase && ./scripts/apply-storage-policies.sh

# 3. Créer les utilisateurs Auth (car seed ne peut pas utiliser GoTrue)
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
