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

L’APK preview embarque le runtime natif une fois ; les correctifs **JS/TS/styles** passent ensuite via OTA (`expo-updates`, channel `preview` dans [`eas.json`](eas.json)). Le `runtimeVersion` utilise la politique **`fingerprint`** (`app.config.js`), pas un numéro écrit à la main : l’empreinte ne change **que** si le natif change (module, permission, plugin, dépendance). Conséquence pratique : une correction JS seule part en OTA sans rebuild, un changement natif impose un rebuild — et Expo refuse automatiquement un OTA incompatible au lieu de le laisser atterrir sur un APK qui n’a pas le bon code natif. Ne pas revenir à un numéro manuel : oublier de le bumper produit exactement cette panne, et le bumper pour du JS gèle les APK inutilement.

Vérifier qu’un OTA atterrira bien avant de le publier (le hash est calculé hors sandbox — `os.cpus()` y retourne 0 et fait échouer l’outil) :

```bash
cd vector-elegans && node -e "
require('@expo/fingerprint').createFingerprintAsync(process.cwd(),{platforms:['android']})
  .then(r=>console.log(r.hash))"
# comparer au « Using fingerprint from EXPO_UPDATES_FINGERPRINT_OVERRIDE » du dernier build
```

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
- **La permission n'est pas un veto** : sans elle, le réveil est **quand même tenté**. Un `startActivity` refusé par Android est silencieusement ignoré, une autre exemption (autostart OEM, service de premier plan) peut le couvrir, et ne pas essayer rendait l'échec invisible — ni lancement, ni trace. Le verdict est désormais écrit : `launch_requested` porte `exemption=pill|none`, suivi de `launch_confirmed` ou `launch_refused`.
- **Journal de décisions natif** : `VeOverlayController.recordDiagnostic` tient un anneau borné (40 entrées, SharedPreferences) — `push_received`, `launch_requested`, `launch_confirmed` / `launch_refused`, `pill_shown` / `pill_failed`, `launch_impossible` / `launch_threw`. C'est la seule fenêtre sur ce qui se passe **avant** que JS existe, et elle ne demande pas d'`adb` : relu au démarrage et à chaque retour au premier plan, puis versé dans `offer_pipeline_events` (`stage = 'native_diag'`, horloge appareil dans `native_at`).
- **Réveil silencieux** : `consumePendingOfferPush()` rend à JS le payload que le service a gardé. Un réveil silencieux reprend l'Activity du lanceur — **aucun extra, aucun `NotificationResponse`** : sans cette copie, la course devrait être redécouverte par le boot, c'est-à-dire exactement le délai que le réveil supprime. Côté JS le stage est `silent_wake`, distinct de `tap_received`, et une fenêtre de 10 s empêche la même offre d'être mise en file deux fois (la copie native est sans action et écraserait un « Accepter » venu du tiroir).
- **Pastille** : visible **seulement** hors premier plan et si le chauffeur est en ligne (`ProcessLifecycleOwner` côté natif). Elle disparaît dès que l'app revient, et réapparaît quand elle repart en arrière-plan.
- **JS** : `src/lib/overlay/overlayPolicy.ts` (`isOverlayAvailable`, pur, testé en Jest) + `src/lib/overlay/overlayService.ts`. Entrées JS : `setDriverOnline(boolean)`, publiée depuis [`app/_layout.tsx`](app/_layout.tsx) via l'état `isOnline` du store, plus les trois lectures ci-dessus (`consumeNativeOfferPush`, `drainOverlayDiagnostics`, `getOverlayState`) — jamais appelées depuis un chemin de rendu.
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

Conséquence : un `setNotificationHandler` JS ne peut **pas** ramener l'app au premier plan. Le retour au premier plan vit donc dans [`VeFirebaseMessagingService`](modules/ve-overlay/android/src/main/java/expo/modules/veoverlay/VeFirebaseMessagingService.kt), qui étend `ExpoFirebaseMessagingService` et appelle `super`, donc la présentation de la notification reste inchangée.

### Le payload d'une offre n'est pas plat

**Piège qui a coûté deux itérations.** `dispatch-push` passe par l'**API Expo**, qui transforme `title`/`body` en vraie notification et sérialise les données custom dans `data["body"]` **sous forme de chaîne JSON**. Tester `data["type"]` à plat renvoie donc toujours `null` : `onRideOfferPush` n'était jamais appelé et aucun lancement n'était tenté — la notification restait le seul chemin, ce qui rendait le tap obligatoire.

Le JS reparse cette chaîne (`mapNotificationResponse.ts` : `mappedContent.data = JSON.parse(dataString)`), c'est pourquoi le tap fonctionnait. **Le natif doit faire la même chose** : parser `data["body"]` en `JSONObject` et lire `type` dedans. Le test à plat est conservé en repli pour un envoi FCM direct (sans Expo dans la chaîne). Le parseur qui l'établit côté natif : `NotificationSerializer.java` (`isValidJSONString(dataBody)` → `dataString`).

### Résolution du service : ne pas se fier à `priority`

Notre service est déclaré avec `android:priority="1"` (celui d'Expo est à `-1`, celui de Firebase à `-500`), mais **la priorité n'est pas un contrat**. La documentation Firebase est explicite : un seul service reçoit les messages FCM, « le premier déclaré » l'emporte, et il faut **éviter de dépendre de l'ordre ou de la priorité**. Le remède documenté est de retirer le filtre concurrent (`tools:node="remove"`).

Comme l'ancien filtre ne matchait jamais, notre service n'avait **jamais rien journalisé** : l'hypothèse « priority suffit » n'était pas vérifiée. `onMessageReceived` journalise désormais **inconditionnellement** en première ligne (`push received, data keys=[…]`), avant tout filtrage. C'est la seule preuve fiable de quel service démarre. Si cette ligne n'apparaît pas dans les logs, il faut passer au `tools:node="remove"` sur le filtre d'Expo.

Autre piège : **`startActivity` ne signale pas un lancement bloqué**. Android ignore silencieusement un BAL refusé, sans lever d'exception — un booléen de retour est donc un faux positif. Le succès se constate par le passage du lifecycle à `RESUMED`, et c'est ce signal qui retire la notification (avec une seconde tentative, la présentation Expo étant asynchrone). Un contrôle différé journalise désormais l'échec (`launch refused: lifecycle never resumed`). Si le constructeur bloque, la notification reste : aucune offre n'est perdue.

L'état premier plan/arrière-plan est lu **en direct** (`ProcessLifecycleOwner…currentState.isAtLeast(STARTED)`), jamais mis en cache : un process démarré par un push n'a jamais traversé `ON_STOP` (l'app a été tuée, pas mise en arrière-plan), donc un booléen initialisé à « visible » conclurait à tort que l'app est à l'écran, omettrait la pastille, et perdrait l'exemption de lancement — précisément dans le cas où le chauffeur n'a rien ouvert. Pour la même raison, la pastille est ajoutée **avant** `startActivity` : la fenêtre overlay doit exister pour rendre le lancement légal.

Diagnostic : `adb logcat | grep VeOverlay` (chaque étape est journalisée) et `adb logcat | grep ActivityTaskManager` (blocage BAL éventuel).

### Thread principal et non-lancement d'exception

**Tout ce qui touche au lifecycle ou à une fenêtre doit être posté sur le thread principal.** `Lifecycle.addObserver` est *main-thread only* ; appelé depuis le thread JS, il lève `IllegalStateException`. Ce qui a rendu la panne catastrophique plutôt que bénigne : l'exception est remontée en **promesse JS rejetée**, et `expo-updates` (`ErrorRecovery`) transforme un rejet non géré en **kill du process**. Résultat : force close à *chaque* lancement, sur `RootLayout → startOverlayLifecycle → setDriverOnline`.

Deux règles qui en découlent et qui sont désormais appliquées :

1. **Aucun `Function(...)` du module ne doit pouvoir lancer** : chaque corps est enveloppé (`runCatching`), une défaillance de l'overlay ne doit jamais pouvoir tuer l'app. Côté JS, `src/lib/overlay/overlayService.ts` enveloppe aussi ses appels natifs dans un `try/catch`.
2. **Publier, jamais appeler directement** : `start()`, `requestPermission()` et tout ce qui manipule `WindowManager` passent par un `Handler(Looper.getMainLooper())`. Les SharedPreferences, en revanche, sont thread-safe (l'écriture se fait sur le thread JS volontairement, pour que l'état survive même si le process est tué juste après).

Reproduire un crash de lancement sans téléphone : `emulator -avd <avd> -no-window`, `adb install -r`, puis `adb logcat | grep -E "FATAL|AndroidRuntime"`. Le crash ci-dessus a été diagnostiqué ainsi, en local.

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

### `eas build --local` — prérequis

Produit le même APK qu'EAS, signé avec la **même clé de release** (donc installable en mise à jour, contrairement à un `assembleDebug` signé `Android Debug`), sans file d'attente. Deux différences avec le cloud, apprises à la dure :

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export GOOGLE_SERVICES_JSON="$PWD/google-services.json"   # sinon ENOENT au prebuild
npx eas-cli build --local --profile preview --platform android --output ./app.apk
```

1. **`GOOGLE_SERVICES_JSON` est obligatoire.** Le fichier est gitignoré, donc absent de l'archive que le build local reçoit : sans cette variable, le prebuild meurt en `ENOENT: .../build/google-services.json`. Le cloud le fournit autrement (variable-fichier EAS), d'où l'écart. [`app.config.js`](app.config.js) lit déjà `process.env.GOOGLE_SERVICES_JSON`.
2. **Ne pas définir `NODE_ENV=production`.** npm omet alors les `devDependencies`, or `tailwindcss` en est une et `metro.config.js` l'exige via `nativewind` → `Cannot find module 'tailwindcss/package.json'`, phase Bundle JavaScript en échec.

`*.apk` / `*.aab` sont gitignorés : le build écrit l'APK à la racine du dépôt.

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
