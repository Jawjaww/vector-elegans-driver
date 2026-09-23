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
- **Journal de décisions natif** : `VeOverlayController.recordDiagnostic` tient un anneau borné (40 entrées, SharedPreferences). Vocabulaire : `process_start` (ouverture, avec l'identité du build), `fcm_received` / `fcm_rejected` (le message est arrivé / n'a pas été reconnu), `push_received`, `no_launch` (`driver_offline` | `app_foreground`), `launch_requested`, `launch_confirmed` / `launch_refused` / `launch_impossible` / `launch_threw`, `fallback_presented` / `fallback_cancelled`, `app_foregrounded` (avec `ON_START` | `ON_RESUME`), `app_backgrounded`, `driver_online`, `pill_shown` / `pill_failed`. C'est la seule fenêtre sur ce qui se passe **avant** que JS existe, et elle ne demande pas d'`adb` : relu au démarrage et à chaque retour au premier plan, puis versé dans `offer_pipeline_events` (`stage = 'native_diag'`, horloge appareil dans `native_at`).
- **Sonde inconditionnelle** : `fcm_received` est écrit **avant tout parsing**. C'est la seule ligne qui peut dire que le message est arrivé **à notre service** — quand plusieurs services déclarent `MESSAGING_EVENT`, un seul est démarré et les perdants ne laissent aucune trace. Son absence est ce qui a prouvé que les concurrents gagnaient ; sa présence sépare « notre service tourne et n'est pas d'accord sur le payload » de « notre service n'a jamais tourné », deux pannes indistinguables autrement. Quand la reconnaissance échoue, `fcm_rejected` porte `body=` (tronqué à 300 caractères) : la raison est toujours la forme du payload, et c'est exactement ce qui manquait.
- **Réveil silencieux** : `consumePendingOfferPush()` rend à JS le payload que le service a gardé. Un réveil silencieux reprend l'Activity du lanceur — **aucun extra, aucun `NotificationResponse`** : sans cette copie, la course devrait être redécouverte par le boot, c'est-à-dire exactement le délai que le réveil supprime. Côté JS le stage est `silent_wake`, distinct de `tap_received`, et une fenêtre de 10 s empêche la même offre d'être mise en file deux fois (la copie native est sans action et écraserait un « Accepter » venu du tiroir).
- **Pastille** : visible **seulement** hors premier plan et si le chauffeur est en ligne (`ProcessLifecycleOwner` côté natif). Elle disparaît dès que l'app revient, et réapparaît quand elle repart en arrière-plan.
- **JS** : `src/lib/overlay/overlayPolicy.ts` (`isOverlayAvailable`, pur, testé en Jest) + `src/lib/overlay/overlayService.ts`. Entrées JS : `setDriverOnline(boolean)`, publiée depuis [`app/_layout.tsx`](app/_layout.tsx) via l'état `isOnline` du store, plus les trois lectures ci-dessus (`consumeNativeOfferPush`, `drainOverlayDiagnostics`, `getOverlayState`) — jamais appelées depuis un chemin de rendu.
- **Dégradation** : `requireOptionalNativeModule` renvoie `null` sur iOS et sur tout binaire sans le natif → toutes les fonctions sont inertes et la notification reprend la main. C'est ce qui rend un OTA sans rebuild **sans danger** (mais sans overlay).
- **Rebuild APK obligatoire** pour l'activer : `eas build --profile preview --platform android`. `runtimeVersion` suit la politique `fingerprint` : il change tout seul dès qu'un plugin natif, une dépendance native ou une permission bougent — rien à bumper à la main.

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

Conséquence : un `setNotificationHandler` JS ne peut **pas** ramener l'app au premier plan. Le retour au premier plan vit donc dans [`VeFirebaseMessagingService`](modules/ve-overlay/android/src/main/java/expo/modules/veoverlay/VeFirebaseMessagingService.kt), qui étend `ExpoFirebaseMessagingService`. `super` — la présentation par Expo — n'est plus appelé systématiquement : il l'est dès que le service sait qu'aucun lancement n'est en cours (voir § « La notification est le recours, pas le point d'entrée »). Rien n'est jamais perdu, seule la **date** de présentation change.

### Le payload d'une offre n'est pas plat

**Piège qui a coûté deux itérations.** `dispatch-push` passe par l'**API Expo**, qui transforme `title`/`body` en vraie notification et sérialise les données custom dans `data["body"]` **sous forme de chaîne JSON**. Tester `data["type"]` à plat renvoie donc toujours `null` : `onRideOfferPush` n'était jamais appelé et aucun lancement n'était tenté — la notification restait le seul chemin, ce qui rendait le tap obligatoire.

Le JS reparse cette chaîne (`mapNotificationResponse.ts` : `mappedContent.data = JSON.parse(dataString)`), c'est pourquoi le tap fonctionnait. **Le natif doit faire la même chose** : parser `data["body"]` en `JSONObject` et lire `type` dedans. Le test à plat est conservé en repli pour un envoi FCM direct (sans Expo dans la chaîne). Le parseur qui l'établit côté natif : `NotificationSerializer.java` (`isValidJSONString(dataBody)` → `dataString`).

**Et la règle d'acceptation doit être celle du JS, pas une plus stricte.** `isRideOfferPush` (`src/lib/notifications/rideOfferPushContent.ts`) accepte `type === 'ride_offer'` **ou** un `ride_id` non vide ; le natif, lui, exigeait `type` seul. Un payload ne portant que `ride_id` était donc **ouvert par un tap et ignoré par le réveil** : les deux moitiés d'un même pipeline ne s'accordaient pas sur ce qu'est une offre, la notification restait le seul chemin, et rien ne disait pourquoi. Toute évolution de cette règle doit être faite **des deux côtés** — le test `fcmServiceResolution.test.ts` compare les deux gardes.

### La notification est le recours, pas le point d'entrée

Objectif produit : sur le chemin où le réveil réussit, **aucune notification ne doit apparaître**. Une bannière qui double une course déjà à l'écran ne fait pas qu'être inutile, elle détourne l'attention au pire moment — et elle est le premier signe visible d'un réveil qui ne marche pas.

Le service décide donc en trois temps :

1. `onRideOfferPush` renvoie `true` **seulement** s'il y a un lancement à tenter : chauffeur en ligne **et** app hors premier plan. Sinon `false`, et `super` est appelé immédiatement — la notification est alors le seul porteur de l'offre et elle ne doit pas attendre.
2. Si `true`, le service ne présente rien : il confie le `RemoteMessage` à `holdOfferPresentation`, qui arme un `Runnable` de 2 s (`OFFER_PRESENTATION_FALLBACK_MS`).
3. Sur `ON_START` / `ON_RESUME`, `onAppForegrounded` annule ce `Runnable`. Si l'app n'est jamais revenue, le `Runnable` **rejoue le message par le délégué d'Expo** — `FirebaseMessagingDelegate(context).onMessageReceived(remoteMessage)` — donc le même payload, le même canal, la même action de tiroir que le chemin d'origine.

Le délégué est instancié avec le **contexte d'application**, jamais le service : `onMessageReceived` qui rend la main est ce qui **arrête** ce service, et présenter depuis un composant qu'Android a déjà détruit serait présenter depuis un mort. `NotificationsService.receive` passe par `sendBroadcast`, légal depuis n'importe quel contexte.

2 s est choisi au-dessus du démarrage à froid observé (≈1,1–1,5 s du process à `app_foregrounded`) : un lancement lent retire la bannière avant que le chauffeur l'ait lue, plutôt que de la faire clignoter. Et un lancement accordé plus tard n'est pas perdu — la notification est retirée au retour, et le payload arrive dans tous les cas.

### Un journal natif doit porter l'identité de son processus

**Le journal natif survit à une mise à jour d'APK** (il vit dans les `SharedPreferences`). Des enregistrements écrits par un build antérieur se lisent donc exactement comme des enregistrements frais : une entrée `launch_refused` sans le champ `origin=` ajouté par la 1.0.6 — donc écrite par la 1.0.5, restée en préférences — a été prise pour la preuve d'un échec de lancement **du build testé**. Une session de diagnostic entière peut partir sur une ligne que le binaire installé n'a jamais produite.

Deux garde-fous :

- `start()` écrit `process_start` avec `versionName` + `versionCode` lus au `PackageManager` (jamais une constante : le seul bump oublié ferait mentir le journal exactement quand il sert) ;
- le JS écrit `app_build` (`stage = 'app_build'`) avec `updateId`, `runtimeVersion`, `channel` et `isEmbeddedLaunch` — l'APK peut être à jour pendant qu'un **bundle OTA périmé** tourne dessous, et rien d'autre dans le pipeline ne peut le voir.

**Et l'identité doit être lisible sur l'appareil.** `android.versionCode` est désormais explicite et monotone (`major * 10000 + minor * 100 + patch`) : non renseigné, Expo écrit la valeur par défaut **1** pour toutes les versions, si bien que deux builds séparés de plusieurs jours portaient le même numéro dans Réglages → Applications. Le nom du fichier reprend les deux : `ve-driver-<version>+<versionCode>.apk`.

**Mais une valeur de configuration ne suffit pas : `eas.json` doit accepter de la lire.** Le piège a été mesuré sur le binaire, pas déduit. Avec `"appVersionSource": "remote"`, EAS résout le `versionCode` depuis ses propres serveurs et **ignore** `android.versionCode` : un APK construit depuis un `app.config.js` déclarant `10007` a été livré avec `versionCode='1'`, ce que `aapt2 dump badging` affiche sans ambiguïté. Le `versionName`, lui, venait bien de la config — d'où un binaire dont les deux moitiés d'identité se contredisaient.

Deux conséquences, et la seconde est la vraie leçon :

- la source est passée à `"local"`, et `autoIncrement` a été **retiré de la production**. Avec une source locale, `autoIncrement` fait réécrire la valeur par EAS, ce qui, sur un build cloud, devient un commit sur une `main` protégée par un ruleset qu'aucun acteur de build ne peut contourner. Le `versionCode` redevient une valeur relue en PR, dérivée de `version` : **une release native se prépare en bumpant `version`**, jamais le code à la main.
- **un test qui assertait sur `app.config.js` restait vert pendant que le binaire disait autre chose.** Vérifier la source n'est pas vérifier le livrable. C'est pourquoi la suite assère maintenant aussi `appVersionSource === "local"` : sans cette invariante, toutes les autres assertions de cette section sont décoratives.

### Résolution du service : un seul service reçoit l'intent, et c'est le premier déclaré

Notre service **était** déclaré avec `android:priority="1"` (celui d'Expo est à `-1`, celui de Firebase à `-500`), mais **la priorité n'est pas un contrat**. La documentation Firebase est explicite : un seul service reçoit les messages FCM, « le premier déclaré » l'emporte, et il faut **éviter de dépendre de l'ordre ou de la priorité**.

**Mesuré le 23/09 — l'hypothèse « priority suffit » est tombée.** Le manifeste fusionné déclarait trois services sur `com.google.firebase.MESSAGING_EVENT`, le nôtre **en dernier** :

| Service | `priority` | Position |
|---------|-----------|----------|
| `expo.modules.notifications.service.ExpoFirebaseMessagingService` | -1 | 1er |
| `com.google.firebase.messaging.FirebaseMessagingService` | -500 | 2e |
| `expo.modules.veoverlay.VeFirebaseMessagingService` | 1 | 3e |

Notre service n'était donc **jamais démarré**, et tout le réveil silencieux avec lui. Deux témoins indépendants l'ont établi :

- `push_received`, journalisé **inconditionnellement en première ligne** de `onMessageReceived`, était **absent** des 23 enregistrements natifs d'une session de 8 minutes contenant deux offres — alors que `pill_shown`, `app_backgrounded` et `launch_confirmed` y figuraient ;
- `onAppForegrounded()` retire la notification via `pendingOfferNotificationId`, un champ que **seul `onRideOfferPush` renseigne**. Or la notification était encore là 41 s après le retour au premier plan, et c'est le tap dessus qui a affiché la course.

**Correctif appliqué** : les deux déclarations concurrentes sont retirées, et cela **doit se faire dans le manifeste d'application**, via le config plugin `plugins/withRemoveCompetingFcmServices.js`. Elles ne déclarent **que** cette action, donc le retrait ne coûte rien d'autre ; `NotificationsService` (la présentation de la notification) est un receiver distinct et reste en place. Notre service étendant `ExpoFirebaseMessagingService` et appelant `super`, la présentation est inchangée — seule la classe qui reçoit le message change. Le `android:priority` est **supprimé** : le conserver aurait perpétué la fausse garantie.

**Le premier correctif a été écrit au mauvais niveau, et il a été ignoré en silence.** Le `tools:node="remove"` avait été posé dans le manifeste du **module**. Or un manifeste de bibliothèque ne peut pas retirer un nœud apporté par une bibliothèque de **priorité de fusion supérieure** : les déclarations fusionnent dans l'ordre des dépendances (`expo-notifications` précède notre module), et le marqueur est purement et simplement abandonné. L'APK produit portait toujours **trois** services, sans le moindre avertissement — exactement la classe d'échec muet que ce chantier combat. Le manifeste d'application, lui, a la priorité la plus haute : c'est l'endroit documenté pour retirer un nœud déclaré par une bibliothèque.

L'épreuve qui tranche n'est pas l'APK (6 min) mais la fusion seule, en ~40 s :

```bash
cd android && ./gradlew :app:processReleaseMainManifest
rg -c 'name="com.google.firebase.MESSAGING_EVENT"' \
  app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml
# attendu : 1
```

**Piège du comptage** : ne pas compter `MESSAGING_EVENT` dans le manifeste fusionné, mais `name="com.google.firebase.MESSAGING_EVENT"`. La fusion **conserve les commentaires** des manifestes sources, et un commentaire qui nomme l'action fait monter le compte à 2 sans qu'aucun service supplémentaire n'existe. Dans le binaire, en revanche, les commentaires disparaissent : `aapt2 dump xmltree … --file AndroidManifest.xml` ne rend que les déclarations.

Garde-fou : `src/lib/__tests__/fcmServiceResolution.test.ts` vérifie que le plugin retire bien les deux concurrents, qu'il porte `tools:node` **et** `xmlns:tools` (sans le namespace le marqueur est inerte), qu'il est **déclaré** dans `app.config.js` (un plugin non listé ne retire rien et le build paraît identique), et que le manifeste du **module** ne contient ni `tools:node` ni `android:priority` — le retrait au niveau module doit rester absent, puisque le remettre ressemblerait à un correctif tout en produisant un APK à trois services.

**Le journal ne savait pas dire *qui* avait demandé le lancement.** `attemptForeground` a **deux** appelants — le push **et le tap sur la pastille**. Tant que l'enregistrement ne nommait pas l'origine, un `launch_confirmed` se lisait comme la preuve que le push était arrivé, alors qu'il pouvait tout aussi bien être un tap sur la pastille : c'est précisément cette ambiguïté qui a masqué un service jamais démarré pendant une session de diagnostic entière. Chaque enregistrement porte désormais `origin=push|pill`.

Même leçon côté JS : `consumeSilentWake` enregistre désormais son **silence** (`outcome=no_payload` / `already_queued`). « Il n'y a jamais eu de payload » et « le payload a été ignoré » produisaient la même observation — aucune ligne `silent_wake` — et un réveil mort était indiscernable d'un réveil qui fonctionne.

**Mais un silence enregistré sans borne devient du bruit.** La même session a produit **21 lignes `no_payload` en 5 s**, parce que la lecture se faisait à chaque montage. Elle est désormais gardée par un drapeau de **portée module** — un `useRef` serait réinitialisé par le remontage même qui causait le flot. La lecture unique ne peut rien manquer : la première **consomme** la copie native, donc toute lecture suivante du même runtime répond « pas de payload » par construction. Le déclencheur du remontage, lui, n'est pas identifié ; c'est le symptôme qui est traité, et l'écrire évite qu'on croie la cause trouvée.

Autre piège : **`startActivity` ne signale pas un lancement bloqué**. Android ignore silencieusement un BAL refusé, sans lever d'exception — un booléen de retour est donc un faux positif. Le succès se constate par le passage du lifecycle à `RESUMED`, et c'est ce signal qui retire la notification (avec une seconde tentative, la présentation Expo étant asynchrone).

**Ce constat était écrit, mais le verdict ne l'appliquait pas.** Il était pris par un **échantillon unique, 3 s après la demande** — et cet échantillon mentait dans les deux sens. Une 1.0.5 a ramené l'app au premier plan **127 ms** après la requête puis est repartie en arrière-plan avant l'échéance : le journal portait `launch_refused` pour un lancement qui avait parfaitement réussi. Le verdict est désormais rendu par l'observateur de cycle de vie, à l'instant où l'app revient réellement ; l'échantillon différé ne subsiste que comme **chemin d'expiration**, pour le cas où aucun retour ne survient jamais.

`launch_confirmed` porte `latency_ms` (demande → `RESUMED`) : c'est le chiffre qui répond à « combien de temps entre le push et la course à l'écran », et il ne peut pas être reconstitué après coup — le journal est relu par JS au démarrage, plusieurs minutes plus tard. `app_foregrounded` porte `ON_START` ou `ON_RESUME` : les deux événements se déclenchaient et la même ligne apparaissait deux fois, sans que rien ne dise si la fenêtre était seulement en préparation ou réellement au premier plan.

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
# Ici on le passe à la main ; `eas build --local` n'a pas cette prise, c'est le
# profil `preview-local` qui le porte (voir § `eas build --local` ci-dessous).
./gradlew :app:assembleRelease -Dorg.gradle.jvmargs="-Xmx4g -XX:MaxMetaspaceSize=2g"
```

`modules/*/android/build/` est gitignoré — seul le **source** du module est versionné.

### `eas build --local` — prérequis

Produit le même APK qu'EAS, signé avec la **même clé de release** (donc installable en mise à jour, contrairement à un `assembleDebug` signé `Android Debug`), sans file d'attente. Trois différences avec le cloud, apprises à la dure :

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export GOOGLE_SERVICES_JSON="$PWD/google-services.json"   # sinon ENOENT au prebuild
./scripts/build-local-apk.sh                              # ou : npm run build:local:apk
```

Le script nomme l'APK d'après ce qu'il contient — `ve-driver-<version>+<versionCode>.apk`, les deux lus dans `app.config.js` — il n'y a donc pas de second exemplaire des numéros à maintenir. **Ne pas revenir à un `--output ./app.apk` fixe** : deux builds séparés de plusieurs jours portaient alors le même nom, un APK périmé était indiscernable d'un neuf, et c'est ce qui a fait tester une nuit durant une application qui ne contenait pas le code à éprouver. Le `versionCode` est dans le nom pour la même raison que dans Réglages → Applications : c'est le seul numéro qu'Android compare.

1. **`GOOGLE_SERVICES_JSON` est obligatoire.** Le fichier est gitignoré, donc absent de l'archive que le build local reçoit : sans cette variable, le prebuild meurt en `ENOENT: .../build/google-services.json`. Le cloud le fournit autrement (variable-fichier EAS), d'où l'écart. [`app.config.js`](app.config.js) lit déjà `process.env.GOOGLE_SERVICES_JSON`.
2. **Ne pas définir `NODE_ENV=production`.** npm omet alors les `devDependencies`, or `tailwindcss` en est une et `metro.config.js` l'exige via `nativewind` → `Cannot find module 'tailwindcss/package.json'`, phase Bundle JavaScript en échec.
3. **Le métaspace du template fait échouer la variante release.** Le prebuild fige `org.gradle.jvmargs` à `-XX:MaxMetaspaceSize=512m` — et `android/` est gitignoré **et régénéré à chaque build**, donc ce plafond ne se corrige pas à la source : les tâches lint release meurent en `OutOfMemoryError: Metaspace`. La boucle `./gradlew` s'en sort en passant le flag à la main, mais `eas build` ne laisse pas accéder à la ligne de commande Gradle. D'où le profil **`preview-local`** (`extends: "preview"` — même APK, même `channel`, même `environment` — auquel s'ajoute le `gradleCommand`). Le profil `preview` reste celui du cloud : ne **pas** y déplacer le flag, un builder EAS plus petit serait tué pour OOM sur le seul chemin qui fonctionne aujourd'hui.

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
