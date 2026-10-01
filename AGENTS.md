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
- Offres : card compacte bas + map live en haut — voir `vector-elegans-docs/mobile/OFFER_MAP.md`. FCM offre (réveil silencieux vs bannière hors ligne) : `vector-elegans-docs/mobile/OFFER_PUSH_PIPELINE.md`.
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
- Rebuild obligatoire si : nouvelle dep native, plugin `app.config.js`, icône/splash, permissions, **ou toute ligne de Kotlin dans `modules/`** (la sonnerie et son sélecteur en font partie — voir § « Ce qui part en OTA, et ce qui exige un APK »).

Dashboard updates : https://expo.dev/accounts/jawjaww/projects/vector-elegans-driver/updates

## Pastille overlay Android (`modules/ve-overlay`)

But : amener l'app au premier plan avec la course **sans passer par la notification**, quand le chauffeur est en ligne. Android bloque les lancements d'Activity depuis l'arrière-plan (BAL, API 29+) ; détenir `SYSTEM_ALERT_WINDOW` **et** afficher une fenêtre overlay visible est une des exemptions documentées. La pastille *est* cette fenêtre — sans elle, le lancement est refusé.

**Deux pipelines, ne pas les fusionner.** En ligne = réveil silencieux (aucun heads-up). Hors ligne à l’insert de l’offre = bannière tapable, pas de `startActivity`. Contrat et critères : `vector-elegans-docs/mobile/OFFER_PUSH_PIPELINE.md`. `is_online` est l’interrupteur, pas « app fermée ».

- **Module natif local** : `modules/ve-overlay/` (Kotlin + `expo-module.config.json`), autolinké depuis `./modules` (défaut Expo). `android/` et `ios/` restent gitignorés : on committe la **source** du module, jamais le projet généré.
  - ⚠️ Les motifs du [`.gitignore`](.gitignore) sont **ancrés à la racine** (`/android/`, `/ios/`) pour cette raison : un `android/` non ancré matche aussi `modules/*/android/` et supprimerait silencieusement le Kotlin de tout module local du commit. Vérifier après ajout d'un module : `for f in $(find modules -type f); do git check-ignore -v "$f"; done` ne doit rien afficher.
- **Permission** : `android.permission.SYSTEM_ALERT_WINDOW` dans [`app.config.js`](app.config.js) — accès spécial, accordé par l'utilisateur depuis Settings. L'app affiche d'abord une explication in-app (`src/hooks/useOverlayPermissionPrompt.ts`) ; un refus est honoré et la notification reste le chemin de secours.
- **La permission n'est pas un veto** : sans elle, le réveil est **quand même tenté**. Un `startActivity` refusé par Android est silencieusement ignoré, une autre exemption (autostart OEM, service de premier plan) peut le couvrir, et ne pas essayer rendait l'échec invisible — ni lancement, ni trace. Le verdict est désormais écrit : `launch_requested` porte `exemption=pill|none`, suivi de `launch_confirmed` ou `launch_refused`.
- **Journal de décisions natif** : `VeOverlayController.recordDiagnostic` tient un anneau borné (40 entrées, SharedPreferences). Vocabulaire : `process_start` (ouverture, avec l'identité du build), `fcm_received` / `fcm_rejected` (le message est arrivé / n'a pas été reconnu), `push_received`, `no_launch` (`driver_offline` | `app_foreground`), `launch_requested`, `launch_confirmed` / `launch_refused` / `launch_impossible` / `launch_threw`, `fallback_presented` / `fallback_cancelled`, `app_foregrounded` (avec `ON_START` | `ON_RESUME`), `app_backgrounded`, `driver_online`, `ring_playing` / `ring_stopped` / `ring_failed` / `ring_unplayable` / `ring_default_fallback` (la sonnerie du réveil — voir § « The wake path rings, and JS decides when »), `sound_picked` (sonnerie choisie ou réinitialisée), `pill_shown` / `pill_failed`. C'est la seule fenêtre sur ce qui se passe **avant** que JS existe, et elle ne demande pas d'`adb` : relu au démarrage et à chaque retour au premier plan, puis versé dans `offer_pipeline_events` (`stage = 'native_diag'`, horloge appareil dans `native_at`).
- **Sonde inconditionnelle** : `fcm_received` est écrit **avant tout parsing**. C'est la seule ligne qui peut dire que le message est arrivé **à notre service** — quand plusieurs services déclarent `MESSAGING_EVENT`, un seul est démarré et les perdants ne laissent aucune trace. Son absence est ce qui a prouvé que les concurrents gagnaient ; sa présence sépare « notre service tourne et n'est pas d'accord sur le payload » de « notre service n'a jamais tourné », deux pannes indistinguables autrement. Quand la reconnaissance échoue, `fcm_rejected` porte `body=` (tronqué à 300 caractères) : la raison est toujours la forme du payload, et c'est exactement ce qui manquait.
- **Réveil silencieux** : `consumePendingOfferPush()` rend à JS le payload que le service a gardé. Un réveil silencieux reprend l'Activity du lanceur — **aucun extra, aucun `NotificationResponse`** : sans cette copie, la course devrait être redécouverte par le boot, c'est-à-dire exactement le délai que le réveil supprime. Côté JS le stage est `silent_wake`, distinct de `tap_received`, et une fenêtre de 10 s empêche la même offre d'être mise en file deux fois (la copie native est sans action et écraserait un « Accepter » venu du tiroir). Ce stage n'est pas seulement journalisé : il est **rangé dans le store** comme `offerArrivalSource`, parce que la sonnerie a besoin de savoir si quelque chose a déjà joué un son pour cette offre.
- **Pastille** : visible **seulement** hors premier plan et si le chauffeur est en ligne (`ProcessLifecycleOwner` côté natif). Elle disparaît dès que l'app revient, et réapparaît quand elle repart en arrière-plan.
- **JS** : `src/lib/overlay/overlayPolicy.ts` (`isOverlayAvailable`, pur, testé en Jest) + `src/lib/overlay/overlayService.ts`. Entrées JS : `setDriverOnline(boolean)`, publiée depuis [`app/_layout.tsx`](app/_layout.tsx) via l'état `isOnline` du store ; les trois lectures (`consumeNativeOfferPush`, `drainOverlayDiagnostics`, `getOverlayState`) ; la sonnerie (`ringOffer`, `stopOfferRing`) ; et le choix de sonnerie (`getOfferSound`, `pickOfferSound`, `resetOfferSound`). Aucune n'est appelée depuis un chemin de rendu, sauf `ringOffer` — qui l'est depuis un effet, pour la raison exposée plus bas.
- **Dégradation** : `requireOptionalNativeModule` renvoie `null` sur iOS et sur tout binaire sans le natif → toutes les fonctions sont inertes et la notification reprend la main. C'est ce qui rend un OTA sans rebuild **sans danger** (mais sans overlay). Corollaire pour la sonnerie : la ligne « Sonnerie d'offre » du profil disparaît sur iOS et sur un binaire plus ancien (`isOverlaySupported()`), et la sonnerie choisie n'existe que sur Android.
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

### La notification est le recours du réveil en ligne, pas le point d’entrée

Objectif produit **en ligne** : si le réveil réussit, **aucune notification ne doit apparaître**. Hors ligne, c’est l’inverse : la bannière **est** le point d’entrée, et le tap ouvre l’app. Les deux partagent un message FCM data-only ; le natif tranche avec `OfferPushDisposition` (`WAKE` / `EXPO` / `HANDLED`), pas un booléen. Détail et pièges (prefs `commit()`, parcel `RemoteMessage`, `router.push` trop tôt) : `vector-elegans-docs/mobile/OFFER_PUSH_PIPELINE.md`.

Sur le chemin **WAKE** seulement :

1. `onRideOfferPush` renvoie `WAKE` si chauffeur en ligne **et** app hors premier plan. Hors ligne + away → `OfflineOfferNotifier` puis `HANDLED` (pas de `super`). Déjà au premier plan → `EXPO` et `super` tout de suite.
2. Si `WAKE`, le service ne présente rien : il confie le `RemoteMessage` à `holdOfferPresentation` (2 s).
3. Sur `ON_START` / `ON_RESUME`, `onAppForegrounded` annule ce `Runnable`. Si l'app n'est jamais revenue, le `Runnable` **rejoue le message par le délégué d'Expo**.

Le délégué est instancié avec le **contexte d'application**, jamais le service : `onMessageReceived` qui rend la main est ce qui **arrête** ce service, et présenter depuis un composant qu'Android a déjà détruit serait présenter depuis un mort. `NotificationsService.receive` passe par `sendBroadcast`, légal depuis n'importe quel contexte.

2 s est choisi au-dessus du démarrage à froid observé (≈1,1–1,5 s du process à `app_foregrounded`) : un lancement lent retire la bannière avant que le chauffeur l'ait lue, plutôt que de la faire clignoter. Et un lancement accordé plus tard n'est pas perdu — la notification est retirée au retour, et le payload arrive dans tous les cas.

### The wake path rings, and JS decides when

A silent wake draws no notification, so the `rides` channel never fires and the system has nothing to play: on this path **the app is the only thing that can make a sound**. But a wake landing is not an offer being on screen, and `startOfferRing` used to be called from the native `confirmLaunch()` — the one place where the wake is proven. Four false positives followed, all of them a sound for a ride the driver could not answer:

- the offer died between the push and the resume (matching closed, the ride was taken) — the app came forward, showed a notice, and rang anyway;
- the wake was slow enough that the 2 s fallback had already replayed the tray entry, so the channel sound *and* the native ring played for one offer;
- a tap on the pill, which is not an offer at all;
- the driver opening the app by hand while a launch was in flight.

**The decision therefore lives in JS, in `src/lib/notifications/offerRing.ts`**, where the offer's liveness is actually known, and Kotlin only plays. The invariant is unchanged — the ring exists only where nothing else has sounded — but the trigger is now three facts at once: the arrival came from the wake, the driver is online, and a live offer is painted.

| where the driver is | what rings | who decides |
|---|---|---|
| away, the wake lands, a live offer is painted | the app, natively (`ringOffer` → `startOfferRing`) | JS, `resolveOfferRingAction` |
| already in front | the `rides` channel, through the branded notification | Expo |
| away, the wake is refused | the `rides` channel, through the replayed tray entry | Expo |
| away, the wake lands, the offer is dead / not confirmed yet | nothing | JS |

Four diagnostic stages make a silence readable, because "the ring is silent by design" and "the ring is broken" look identical from the driver's seat: `ring_armed` (JS asked for it), `ring_skipped` with `reason=tap_origin|driver_offline|no_offer|not_confirmed|already_handled|offer_dead` (JS refused), and natively `ring_playing` / `ring_stopped` / `ring_failed` / `ring_unplayable` / `ring_default_fallback`, plus `sound_picked`.

**The arrival's origin has to be stored, because nothing downstream can reconstruct it.** Both paths end in the same `queueOfferOpen`. `offerArrivalSource` is written beside `offerArrivalAt` from the stage the notification path reports (`silent_wake` → `wake`, `tap_received` → `tap`), and `queueOfferOpen`'s default is `tap_received`: a caller that forgets the argument must not silently claim a wake, since that is the one value that arms a sound.

**"Not yet" is not "never".** The offer is `pending` while the payload card is on screen but the server has not confirmed it, so the decision is re-evaluated on every change and only a terminal outcome is latched. Latching `no_offer` or `not_confirmed` would leave the offer on screen in silence; `isTerminalRingAction` is what keeps those two out of the latch.

**A dead offer stops the ring, even after it started.** That is why the `dead` case is tested before the latch: the case with the loudest symptom is the one where the ring is already playing and the card has gone. The native `stopOfferRing` is idempotent, so this costs nothing when nothing is playing.

**`AudioAttributes.USAGE_NOTIFICATION_EVENT`, not a bare player.** Without it the sound ignores the notification volume, silent mode and do-not-disturb — a driver who had silenced their phone would be rung at 3 a.m., which is how an app gets uninstalled. The URI is the driver's own choice (see below), and the default is `RingtoneManager.getDefaultUri(TYPE_NOTIFICATION)`, which returns null when they chose "None" in the system settings: nothing to play is then the correct outcome, not a failure.

**`MediaPlayer`, not `Ringtone`.** `Ringtone.isLooping` only exists from API 28 and `stop()` on a non-looping one is unreliable, so a `Ringtone` could not have been stopped at all on the versions this app still ships to. `prepare()` is deliberately **synchronous**: a picked `content://` URI can stop being readable, and the failure has to be caught while there is still a fallback to try — `prepareAsync()` reports it on a listener that can no longer take another URI. `startOfferRing` marshals onto the main looper like `stopOfferRing`, because the module `Function` that arms it runs on the JS thread.

**The window is `COUNTDOWN_SECONDS`, not a number of its own.** `OFFER_RING_WINDOW_MS` is 20 s because `OfferRideCard.tsx` is 20 s: that is the window the card spends in front of the driver, and past it the offer moves to the back of the stack. Ringing longer would alert for a ride the driver has already let pass. One decision taken in two languages drifts, so `offerRing.test.ts` reads the card's constant and fails when the two disagree.

Four independent stops, because none of them can be trusted alone: the driver's answer through the module (`accepted` / `declined` / `timed_out`), JS on a dead offer (`offer_dead` — the one case Kotlin cannot see), the bounded runnable for an offer nobody answered, and the app leaving the foreground (`app_backgrounded`, plus `driver_offline` when the driver switches off).

**The cost of moving the decision to JS is the delay between the resume and the offer's confirmation (~0.3–1 s on a cold start).** Paid on purpose: a sound that can be wrong is worse than a sound that is late.

### La sonnerie se choisit, et les deux chemins doivent jouer la même

Deux lecteurs de son indépendants, et ils doivent s'accorder ou le son dépend du chemin qu'a pris l'offre : le lecteur natif sur le réveil silencieux, et le canal Android `rides` sur le chemin notification. Le second est le plus contraint — **Android ne permet pas de modifier le son d'un canal en place** : le seul levier est de le supprimer et de le recréer, ce qui réinitialise les réglages que le chauffeur avait posés sur ce canal (importance, vibration). C'est fait **uniquement quand le choix a réellement changé**, la valeur appliquée étant mémorisée sous `rides_channel_sound_v1` ; recréer le canal à chaque lancement serait pire que le problème. Quand la recréation a lieu, l'appli le dit au chauffeur plutôt que de le laisser découvrir un canal qui n'obéit plus.

**Trois états, aucun confondu.** « Jamais choisi » (son par défaut du système), « Aucun son » (un choix), et une URI précise. Le natif les distingue par `contains` sur la clé — une clé absente n'est pas une clé vide — et expose `configured` à côté de `uri` précisément parce que les deux premiers n'ont pas d'URI. Confondre les deux rendrait le son par défaut à un chauffeur qui a demandé le silence. Côté JS, `offerSoundStateFromNative` et `rideChannelSound` (purs, testés) font la traduction ; `rideChannelSound` rend `null` pour « silencieux », qui n'est pas la même demande que `'default'`.

**Le sélecteur est celui du système** (`RingtoneManager.ACTION_RINGTONE_PICKER`, en `TYPE_NOTIFICATION`, avec « Aucun » et « Défaut » proposés). Il est ouvert via `startActivityForResult` + `OnActivityResult` avec notre propre code de requête, et le `Promise` du module est résolu dans le second callback — c'est ce qui rend l'aller-retour d'Activity synchrone du point de vue de JS. Trois issues sont distinguées, et aucune n'est un crash : `picked`, `cancelled` (le choix précédent reste), et **`unavailable`** — certaines ROMs ne livrent pas de sélecteur de sonnerie, ce que `ActivityNotFoundException` rapporte. Le dire vaut mieux qu'une ligne de réglage qui ne fait rien. Côté JS, `pickOfferSound` borne l'attente (2 min) : un résultat qui n'arrive jamais — l'Activity hôte détruite pendant le choix, cas que `expo-modules-core` documente comme non supporté — ne doit pas bloquer l'écran pour la vie du runtime.

**Une URI choisie peut cesser d'être lisible.** Le sélecteur n'accorde aucune permission d'URI persistable, donc le droit d'accès ne survit pas à un redémarrage. Perdre la sonnerie choisie est une perte bien moindre qu'une offre manquée : `startOfferRing` retombe sur le son système et l'écrit (`ring_default_fallback`) au lieu de rester muet. **À vérifier sur appareil** : si le repli se déclenche à chaque redémarrage, la suite est un `takePersistableUriPermission` — impossible tant que l'intent du sélecteur ne porte pas le flag, donc le repli est la réponse pour cette version.

### Ce qui part en OTA, et ce qui exige un APK

`runtimeVersion: { policy: 'fingerprint' }` sépare les deux, et la frontière ne se devine pas — elle se vérifie :

| changement | part en OTA | exige un rebuild |
|---|---|---|
| JS/TS, styles, logique de la feuille d'offre | ✅ | |
| déclencheur de sonnerie, ordre des paliers, textes | ✅ | |
| Kotlin du module `ve-overlay` (lecteur, sélecteur, prefs natives) | | ✅ |
| `CFBundleIdentifier`/permissions/plugins/icônes/splash | | ✅ |
| ligne de réglage du profil (JS) | ✅ | |
| **l'ensemble sonnerie + sélecteur, tel que livré** | | ✅ (le natif porte les deux) |

Une PR mélangeant JS et Kotlin **ne peut pas** partir en OTA : le Kotlin n'arrivera qu'avec l'APK, et l'empreinte refusera l'OTA jusqu'au rebuild. C'est le cas de la PR « sonnerie » : elle livre la ligne de réglage et le nouveau déclencheur, donc un APK, et la correction de l'ordre feuille/carte part séparément en OTA. Vérifier l'empreinte avant de publier un OTA (`@expo/fingerprint`), et ne jamais conclure qu'un correctif JS est parti parce que la PR a été mergée.

**Et une OTA ne se publie jamais à la main en routine.** Le canal `preview` s'installe sur les téléphones des chauffeurs, et `eas-update-preview.yml` ne le publie qu'à une seule condition : un `workflow_run` de `CI (Expo)` terminé sur `main` en `event == 'push'` — donc après un merge, jamais depuis une branche. Le job appelle `eas-update-preview.sh`, qui aligne `GOOGLE_SERVICES_JSON` sur `$PWD/google-services.json` avant `eas update` : même empreinte que `./scripts/build-local-apk.sh` tant que le fichier local est **identique** au secret EAS `preview`. Un `eas update` nu avec `--environment preview` seul laissait parfois l'empreinte sur le chemin temporaire EAS et ratait les APK locaux. Le message du workflow reste le marqueur GitOps : `eas update:list --branch preview` affiche `OTA from <sha>` pour le pipeline.

**Une PR dont la base n'est pas `main` ne passe aucune CI.** Les deux déclencheurs de `ci.yml` filtrent sur `branches: [main]`, `pull_request` compris. Une PR empilée sur une branche intermédiaire n'affiche donc **aucun check** — `gh pr checks <n>` répond « no checks reported » — et rien ne l'a vérifiée. Découper un travail en PR empilées reste légitime, mais il ne faut pas en attendre une vérification : la CI n'arrive qu'au moment où la base atteint `main`, et c'est le merge sur `main` qui arme l'OTA, pas la PR.

### The guidance bar is an announcement, and the sheet is the reference

The instruction was a panel pinned over the map for the whole leg, and that failed in both directions at once: it stood over a sheet that already carried the stage, the addresses and the action button, and it was still there while the driver was driving — when the only thing worth reading is the road. `src/lib/utils/tripGuidancePeek.ts` (pure, tested) holds the life of the announcement and `TripGuidanceBar` only draws it. It follows the driver rather than a clock, which makes it a hysteresis and not a timer:

- **announced on a stage change** (`to_pickup` → `at_pickup` → `to_dropoff` → `at_dropoff`);
- **withdrawn once the driver has covered `GUIDANCE_DEPART_METERS` (8 m)**, which is the smallest displacement a fix can *prove*: the navigation watch filters on `distanceInterval: 8`, so a smaller threshold would be measuring the drift of a parked car;
- **recalled if the driver then stands still for `GUIDANCE_RECALL_MS` (2 min)** — long enough that it cannot fire at a red light, a jam or a junction, short enough for the stop it is meant for;
- **once per stage, and never more.** The recall covers one lapse of attention, it is not a reminder on a schedule; a stage change re-arms it, budget included.

**A stop can only be observed as the absence of new progress, so there is a heartbeat.** Once the bar has withdrawn and the driver parks, `distanceInterval: 8` stops the fixes: no route progress arrives at all, and no message anywhere says "no change". `GUIDANCE_TICK_MS` (5 s) re-runs the same observation so a silence can eventually be read as a stop. It is mounted only while a ride is in progress — and it must **not** take the distance as a dependency. Every route push would then tear the interval down and rebuild it, and a timer rebuilt more often than its own period never fires: the recall would silently never happen, with nothing in a log to say why.

- **The movement signal is route progress (`NavProgress.distanceMeters`), never `currentLocation.speed`.** `currentLocation` is written through a distance throttle (`GPS_STORE_MIN_METERS`): once the driver parks, no fix moves 8 m, so the last *moving* fix stays in the store — speed included — indefinitely. Read as "the vehicle is moving", that stale number would retire the announcement of the next trip before the driver had moved at all, which is the very sentence the bar exists to show.
- **The advance is a running maximum**, so a route recomputed mid-leg (the remaining distance going *up*) neither reads as the driver going backwards nor forgets an advance already made — and, just as importantly, does not push the recall further away.
- **The sheet's `trip` palier takes over from the bar** on the drive to the pickup, because the trip body already holds the pickup, the fare and the customer. That suppression is a filter applied at render and not a flag written into the state: the palier the sheet is *heading for* is known in the same commit as the stage, the *settled* one only a commit later, and a latched flag would be set by a stale value and swallow the next announcement for good. A filter also cannot spend a recall: being covered by the sheet is not the driver having read the instruction, so a stage suppressed for a whole leg keeps its one return. It covers `to_pickup` **only** — see the arrival stages below.
- **The two arrival stages are states, not announcements, and they hold.** `at_pickup` and `at_dropoff` are the driver standing at a place they were sent to: there is no ground to cover, so there is no "acted on" the retire/recall pair could ever detect, while the remaining distance that would have to stay still to keep the bar up is recomputed under a parked car and drops for reasons that have nothing to do with driving. The reducer short-circuits them before any movement logic runs, the recall budget is never touched, and the same state object comes back every heartbeat so nothing repaints. Both are exempt from the sheet suppression too: the sheet is forced to its `trip` palier for the whole wait (`resolveDriverHomeSnapLevel` returns `trip` once `driver_arrived_at` is set), so a suppression rule that covered `at_pickup` withheld the sentence on **every frame** of the stage, and the sheet does not say it — it shows a status tag (« En attente »), an elapsed timer and a swipe. Report: "arriving at the pickup, nothing tells me to wait for the customer", and the same for dropping off.
- **`at_dropoff` is read from proximity, and nothing else can read it.** `mark_driver_arrived` covers the pickup only, and at the drop-off the driver's next action is the swipe that *ends* the ride — so the status is still `in-progress` while the vehicle sits at the pin. The stage is folded in by `resolveTripStage` from the straight-line distance to `activeRide.dropoff_lat/lon` (via `haversineMeters`), never from `NavProgress.distanceMeters`: the announcement has to survive a routing failure, which is the same reason the maneuver card falls back to the stage phrase. `DROPOFF_ARRIVAL_METERS` is **150**, and the hysteresis it looks like it needs it does not: `currentLocation` is written only once the driver has covered `GPS_STORE_MIN_METERS` (8 m), so a parked car contributes no fix and cannot jitter across the radius. The last fix of a parked car is itself within 8 m of where it stopped, which is why the floor of the number is tiny and the budget goes to what the pin does not know — a pin mid-block, a dual carriageway, a car park entered from the next street.
- **Both gates that hide a driving overlay now ask one question: `isParkedStage`.** The maneuver gate ("the card names a waypoint and a distance") and the arrival-chip gate ("5,8 km is not a distance to somewhere you are standing") each used to re-derive "the driver is parked" from `status` and `driver_arrived_at` in their own way. When `at_dropoff` appeared, one happened to reject it and the other happened to accept it, so the driver at the destination got a `0 m` chip and no sentence. A rule with two copies is the bug, not the drift between them.
- **`BottomSheet` reports the palier it actually settled on** (`onSettle`), a drag included. The dashboard cannot derive it: `snapLevel` is only what the sheet is asked for, and a drag settles wherever the driver lets go.
- **The bar and the arrival chip move on the same clock** (`GUIDANCE_EMERGE_MS` / `GUIDANCE_RETRACT_MS`), because the chip is lifted by the bar and would otherwise be left floating over an empty slot. The chip itself never leaves: the instruction is news, the ETA is not.
- **The bar carries the instruction and nothing else.** A second line held the pickup or drop-off address, on the reasoning that the title named a place the driver could not find; that was wrong twice. The map already pins the place the sentence names, and the row the address occupied was the row the sentence needed — on the longest locale it was cut mid-word. Naming the address is the sheet's job and the pin's job. The title wraps to **two lines** instead, which is exactly the row the address freed, so `TRIP_GUIDANCE_BAR_HEIGHT` did not have to grow and nothing in the lane above moved. `says the instruction, alone, and never cuts it` pins the single `<Text>`, the two-line cap, and the absence of the address from the props.

Whole thing is JS: it travels in OTA. `tripGuidancePeek.test.ts` pins the rule and the wiring, including two mutations — re-arming the recall budget on every observation, and re-announcing a stage on every route tick — plus the heartbeat's dependency list, which is the one regression here that fails silently on a device.

### Guidance helpers are literal text, never `toString()`

The map document is a string, so its JavaScript helpers have to be written into it as text. Injecting them with `Function.prototype.toString()` looks equivalent and is not: the app ships **Hermes bytecode**, in the embedded release *and* in every OTA, and Hermes does not keep the source. `fn.toString()` then returns `function foo() { [bytecode] }` — a syntactically valid definition (a two-element array literal) that throws `ReferenceError: bytecode is not defined` at every call.

Measured before the fix, from `offer_pipeline_events`: **1514** `nav_tick_error` and **127** `nav_message_error`, one single message, and **zero** `nav_off_route` rows in the whole history. `latchOffRoute` is reached from inside `guideTickPlanned`, which called `snapToNavLine` first, so the off-route guard never ran — the driver was never rerouted, and the camera commands below it were skipped on every tick, which is what "the map sticks then jumps" was.

Node keeps the source, so a Jest test that imports a helper and compares two `.toString()` results is comparing a function to itself and cannot see anything. The helpers therefore live as a literal in `src/map/navGuidanceSource.ts`, wrapped in `/* VE_NAV_HELPERS_START */` … `/* VE_NAV_HELPERS_END */`, and `navGuidanceSource.test.ts` extracts that exact fragment from the built HTML and evaluates it in a scope containing nothing else.

Three rules follow, and each one exists because the failure is silent:

- **Never inject a function with `toString()` into the map document.** `navGuidanceSource.test.ts` fails if `mapHtmlTemplate.ts` contains `${…toString()}` at all.
- **A guard must not depend on what it guards.** `latchOffRoute` measures with `distanceToNavLine`, a helper that only returns a number, and runs *before* anything that can throw. The off-route latch is also force-cleared and re-measured on `rerouteCheck`, because the fixes that accumulate while the screen is off may never arrive as ticks.
- **The document probes itself at boot.** `navInjectionProbe()` runs inside the WebView on map load and posts `nav_inject_hollow` if the helpers are hollow — the only observer that runs where the bug lives.

A failed leg is retried with a bounded backoff (`ROUTE_RETRY_BACKOFF_MS`) rather than left as a chord: `navLineIsRoad()` refuses a two-point line, so abandoning a leg used to disarm rerouting until the leg changed.

### Nothing the driver is waiting for sits behind a page-level fade

`AnimatedPage` skips its entry movement when `instant` is true, and on the driver home `instant` is `isNotificationArrival(offerArrivalAt)`. That value is **false on the first render** — the store starts at `null` — and flips as soon as the tap lands, which on a notification wake is the first effect, the response being read synchronously on mount. React runs the previous effect's cleanup before the new body, so the pending entry timer is cleared; the `if (instant) return undefined;` that used to follow left the page on the shared values it started with, **opacity 0**, with nothing left to assign them. Because the boot placeholder, the card and the map were all inside that one component, the whole wake was transparent: the app came to the foreground and stayed black. It is not a race — the flip lands in the first frames by construction.

Two rules follow:

- **`instant` assigns the resting position; it never returns.** It is not a mount-time property. A page left at opacity 0 because a prop meant to *skip* movement arrived after the mount is a black screen, not a missing animation. `offerArrival.test.ts` fails on `if (instant) return undefined;` and requires the branch to assign both values.
- **The boot surface is painted by the wrapper around the fade, never inside it.** The boot placeholder and the card a notification built are the two things the driver must see first; they precede `<AnimatedPage` in the tree, and `offerArrival.test.ts` pins that order. The carousel still has exactly one parent in both branches, so resolving the boot rebuilds nothing.

### A palier is a content boundary, and the sheet measures it

Each palier of the home sheet is the bottom edge of the last section it shows, so its height is a **property of the content** and not of the sheet. It used to be a constant per palier (`ONLINE_BODY_H` …, `RIDES_BODY_H = 256`, `STATS_BODY_H = 110`), and those constants described components that were free to change without them. Ordered them: a deferred ride card gained a bonus line, the day-stats cards gained a second line of type, and the `rides` and `stats` paliers ended *inside* the content they exist to reveal. Report: "with a ride card the second palier cuts the bottom of the ride card, and the Journée and Courses cards under it are cut too". Nothing in a screenshot separates an off-by-30 constant from a layout bug — the same failure mode the offer-notice glass had, one panel over.

- **`SheetSection` is the measurement, and the bottom edge is what it reports.** One wrapper per body palier (`online`, `notices`, `trip`, `rides`, `stats`), whose `onLayout` publishes `y + height`. `y` is relative to the scroll content container, which is the same space the snap offsets are built from — so the content's own padding and the margins above a section are already counted, and nobody has to add heights up. `trip` and `rides` are the two bodies of one slot (an active trip, or the offers standing in for it) and each measures itself, because only one is ever mounted.
- **`resolveSheetSectionBottoms` resolves measured against guessed, and the guess is chained.** A section that has not reported yet (first frame of a mount, or one just unmounted) falls back to the constant, added to the *resolved* palier above it rather than to the constant that palier used to have — so a measured `notices` moves the guessed `trip` and `rides` under it and the boundaries stay ordered. A value below its floor, or not a finite number, is refused rather than believed: a section cannot end before the one above it. Equality is allowed and is a real answer — an empty dossier banner stack is mounted, has no height, and ends exactly where the online row ends. `sheetPaliers.test.ts` walks every mix of measured and guessed as a property.
- **The measurement lives in the dashboard, not in the sheet.** The sheet is told the boundaries (`bodies`), and the guidance bar and the offer notice are placed from the same resolved set (`sheetVisibleHeight(level, bodies)`) — they sit on the sheet's top edge, and two sources for it is how an overlay ends up drawn over the panel it is supposed to clear.
- **A measurement that lands after the palier was chosen must move the sheet.** The sections report one frame after they are laid out, so this is the normal case and not an edge: the snap effect compares the old and new target for the palier the sheet is on and re-springs if it moved. Without it the corrected offset would sit unused until the driver touched the sheet.
- **The callback the sections report through has to be stable** (`useCallback` with an empty dependency list, and `SheetSection` holds it in a ref on top of that). `SheetSection` clears its palier when it unmounts — a section that leaves must stop speaking for a palier it no longer occupies — and it cannot tell a real unmount from a re-render that replaced the callback. An inline arrow would therefore erase every measurement on every render, and no `onLayout` would fire to restore it.
- **What is still a judgement:** `TOP_MAP_REVEAL` caps the expanded palier on a scene shorter than its content, and that is the only case where this sheet cannot show all of its own content. Scrolling opens on the fully expanded palier and nowhere else, because between two paliers the revealing gesture is the drag and a scrollable body would swallow it.

### The sheet outranks the map, and the chips are anchors

Layer order here is **document order**, and that is a decision rather than an accident: the sheet is rendered after the map group and after the offer stack, and its `zIndex: 40` / `elevation: 40` beat the stack's `30`. The map's own children cannot compete — the host view is a stacking context (`zIndex: -1`), so every chip inside it (maneuver card `50`, arrival chip `15`) is sealed in it whatever number it carries, and a sheet the driver raised covers the whole group. That seal is why the sheet is a **sibling** of the host and not a child of it, and it is what broke once: hoisting the offer card out of the host left the sheet inside, and the sheet was then painted under the card. `offerArrival.test.ts` compares both numbers and the render order.

The arrival chip deliberately **does not follow the sheet**. It is anchored to `NAV_SHEET_VISIBLE_H` — the palier a leg rests on — so a drag moves only the sheet: the chip, its frost rect and its hairline stay put, and a raised sheet simply covers it. Anchoring it to the *live* sheet height made one gesture re-measure three layers and made the sheet unable to cover a chip it was drawn under. The instruction bar keeps following the sheet, for the opposite reason: it is the sentence being read, and it must never be lost under a panel the driver raised.

Its two figures are captioned (`restant` / `arrivée`). `5,8 km · 14h25` read as two labels for one thing — the report was exactly that, that the numbers explained nothing. A caption is copy, so it is kept beside the other driver-facing map lines and asserted there.

### A dead offer is map news, so the notice is drawn on the map

When a `ride_offer` tap resolves to a ride that cannot be offered (expired, taken, declined, dossier inactive…), the driver gets `OfferNoticeOverlay` — not a row in the sheet. It used to be a child of `BottomSheet`, and its mere existence counted as a notice: `noticeCount` grew, `hasNotices` turned true, and the sheet opened itself onto the `notices` palier for a message the driver had not asked for — the message arriving *inside* the panel that was moving under it in the same commit.

- **`noticeCount` counts dossier banners only.** The offer notice is deliberately absent from it (`app/(tabs)/index.tsx` says so in a comment), so a notice never moves the sheet. Why a ride could not be shown is map news, the same lane as the instruction bar and the arrival chip.
- **It is a sibling between the offer stack and the sheet, at `zIndex` / `elevation` 34.** Not a child of the map group: that group is a sealed stacking context (`zIndex: -1`), so an overlay inside it could not be lifted above the offer stack it replaces (offer stack `30`). Strictly below the sheet (`40` / drag zone `41`) — a sheet the driver raised must still win.
- **The anchor is lane arithmetic**, `sheetVisibleHeight(overlaySheetLevel, noticesHeight) + LANE_BASE_OFFSET` from `overlayLane.ts`, like the other controls in that lane. `pointerEvents="box-none"` on the anchor and `auto` on the card, because unlike the trip HUDs (read, never pressed) this one carries a dismiss control and a call to action: the map stays pannable around it while the card takes touches.
- **It fades in on its own clock** (220 ms). The offer card leaves instantly, so without an entry the two surfaces would swap within one frame and read as a glitch.
- The `already_on_ride` CTA points at **`home`**, never `rides`: the active trip is driven from the map tab, and the Courses tab is now the completed-ride history (`offerNoticeOverlay.test.ts` fails if any `cta.target` is `rides`).

### The Courses tab is the completed-ride history, read from the server

`app/(tabs)/rides.tsx` used to mirror the trip — `ActiveTripSheet` plus an empty state pointing at the map — which restated what Home already showed and answered nothing about what the driver had done. It now lists the rides carried out, from `rideService.fetchCompletedRides(range, page)`.

- **`select … eq('status', 'completed')`, `updated_at` within the filter range (default **current calendar week**, Mon–Sun), ordered by `updated_at` desc, **10 rows per page** with `count: exact`.** Tenancy is the **RLS policy** `rides_assigned_to_driver`, not a filter: no `driver_id` is passed, and resolving one here would add a second place where "whose rides are these" could be answered differently.
- **`updated_at` is the completion timestamp, as a measured proxy.** `update_ride_progress` writes `SET status = p_status, updated_at = now()`, no other trigger on `rides` touches the column, and 111 of 111 completed rides on the cloud carry `updated_at >= driver_arrived_at`. `ride_status_history` cannot serve here: its trigger is one of the two left disabled on purpose and the table is empty. A later write on a completed ride would lift it back to the top of the list — a dedicated `rides.completed_at` is the durable fix if that ever happens.
- **Today's totals are derived from the rows, never from the store.** `driverStore`'s `todayRides` / `todayEarnings` persist between launches and are never reset at midnight, so "today" was wrong for any driver who had not restarted the app (`summarizeHistoryToday`).
- **Reload on focus, not on mount**, plus a `RefreshControl`: ending a ride happens on the map and the tab stays mounted between visits, so a mount-only read would show the ride before last.
- The row's date is `updated_at`, the column the list is ordered by. Showing `pickup_time` would order the list by one date and describe it with another.

### The map's copy is translated, and `navProgress` holds no locale

Everything the driver reads on the map is **i18n keys**, never sentences built in a pure module. `navProgress.ts` returns a `NavCopy` — a key plus its interpolation values — and the component renders it through its own `t` (`navCopyText(t, copy)` from `src/i18n/navCopy.ts`). `tripGuidance` has drawn the same line for the guidance bar's titles since the bar existed; `navProgress` was the last holdout, and it mattered: the maneuver card and the arrival chip were hard-coded French while the app ships `fr`/`en`/`es` and picks the language from the device, so an English or Spanish phone read its turn instructions in French. Rendering through the component's `t` rather than a module-level `i18n.t` is also what makes the card re-render when the language changes — a module-level call renders the right sentence once and then never updates.

Two things are worth keeping from the conversion:

- **The distance rule reads the key, not the copy.** The banner used to hide the distance for an arrival by comparing the action against the French words for "you have arrived" — so rewording or translating that sentence would have quietly brought back "in 12 m" beside an arrival. It compares `action.key` against `ARRIVAL_ACTION_KEY` now.
- **A roundabout exit is an ordinal, and the suffix belongs to i18next.** The action goes out as `{ count: exit, ordinal: true }`, which makes i18next pick the plural category from `Intl.PluralRules(locale, { type: 'ordinal' })` — "1re", "1st / 2nd / 3rd", "1ª", and correctly "21e" / "21st". A suffix table in `navProgress` got English wrong from 21 onwards, and the app cannot see a phone's language from a pure module anyway. `_one` / `_two` / `_few` / `_other` are the **v4** plural suffixes, so `compatibilityJSON: 'v4'` in `src/i18n/index.ts` is what makes them resolve; under the v3 format i18next looks for `_1` / `_2` and silently renders the base key, which for a roundabout drops the exit number. `navCopy.test.ts` pins that option against the app's own initialisation.

`navCopy.test.ts` is the guard: it renders **every** sentence the dashboard can produce in all three locales and fails if any of them comes back as its own key — which is exactly what i18next returns for a missing translation, `nav.maneuver.roundaboutExit` across the windscreen. The key set is *derived* by walking `maneuverActionPhrase` over every branch, with a non-vacuity check, rather than listed, so a new branch cannot be added without a key.

### The instruction card is sized for a windscreen

Report: "the guidance overlay at the top, is it not written too small to be read?" It was — 16 pt type and a 22 pt arrow, in the card whose entire job is to be understood without being read. It is now 18/24 with a 30 pt glyph (52 pt for the roundabout, which scales from its 40 pt design box instead of carrying a second set of numbers), and the retired figures are pinned as gone.

It also carries colour, and the colour means something: a strip down the leading edge takes the stage's marker colour — blue for the customer, green for the drop-off, amber while waiting — the action stays in the panel's ink, and the distance takes the deeper `ink`, so the eye lands on the one figure that changes while driving. The stage arrives as a loose `string | null`, so `isTripStage` narrows it rather than casting it; an unknown stage falls back to the material's own accent instead of indexing the palette with a key that is not there.

The instruction is split into two pieces of type by `maneuverBannerParts` / `tripStageBannerParts` rather than by the component. The action and the distance cannot drift apart, and each half is one string for a translator.

### The overlay glass is built, because there is no blur to be had

`expo-blur` is not merely expensive over this screen, it is inert: on Android `BlurView` defaults to `BlurMethod.NONE` and `setColor` paints a flat tint rather than blurring (`ExpoBlurView.kt`). The overlays above the map would pay for a backdrop capture and receive an opaque rectangle — and the backdrop is a map that never holds still, so the capture would be recomputed on every frame the driver moves. The glass is *constructed* instead, from static layers. Being built is also why it can afford to be convincing: painted once, it costs nothing per frame.

The face is neutral grey with a barely visible vertical wash (`fillTop` / `fillBottom`). The **contour** is an exterior band (`rimHighlight` / `rimShade` / `rimMid`, `rimWidthPx`), drawn *outside* the card and masked so its centre is punched out — never a stroke on the card, which would sit on the face — with corner glares in the top-left and bottom-right only, and a falloff that dies before the middle of a long edge. `keeps the face flat and lights only an exterior rim` and `frost the face with a neutral white veil, not a grey bossed plate` pin the split. Android `elevation` stays at 0. Cards use `OVERLAY_CARD_RADIUS` (20); each card owns its type scale — 18/24 on the maneuver card, 16/22 on the instruction bar, and 16/22 over a 15/20 body on the offer notice, which stands in for that bar.

**The rect the map frosts is published by the card, and a card outside the map group cannot be measured the same way.** `GlassPanel` measures itself against the map scene — the frame the map document shares — with `measureLayout`, which only answers for an **ancestor**: Fabric returns `EmptyLayoutMetrics` (0×0) when the two nodes are unrelated, so the panel's `width <= 0` guard publishes nothing and the card is drawn **clear** over the raw map, with no face and no rim under its type. That is exactly the dead-offer notice, a sibling of the map group on purpose (inside that sealed stacking context it could never outrank the offer stack it replaces). `reportFromWindow` is the second route: both frames in window space, one subtracted from the other, which cancels the status bar and the scene's own origin — the difference is the only thing that is meaningful, window coordinates on their own are the wrong space. The frost stays painted in the map document either way, so the map is what is under the glass.

**The type is dark, because the face is pale.** `spends its type on dark greys, because the face inverted` pins it.

**A highlight band was shipped and removed, and the reason is worth keeping.** It landed across the instruction as a lighter rectangle behind the words. `has no highlight band, because a band over a short bar lands on the type` pins the absence.

`text`, `textDim`, `accent`, `accentStrong` and `chipTintAlpha` live in the material too, and no overlay above the map is allowed to name a colour of its own. The type is two dark greys (`#111827` / `#4b5563`), never white; the accent is the same `blue-500` the map draws the route in (`MAP_PALETTE.departure`), asserted equal so the two apps cannot drift apart on it; and a glyph drawn straight on the face takes the deeper `accentStrong` (`blue-700`) rather than the accent itself, which sits under 3:1 on this face.

**Two materials shipped for exactly one commit, to be compared on a device**, with a temporary « Style des overlays » row in the profile. A reflection over a live map is not something a screenshot settles, which is why the comparison had to happen on a phone — and why the row and the loser both went, together, once the driver had looked. A second entry here is a comparison, never a setting.

**Every control in the lane above the sheet clears the instruction bar by one shared figure.** `overlayLane.ts` holds the bar's height, the two base offsets, the control footprint and `LIFT_OVER_INSTRUCTION`, and both the arrival chip and the recenter control read the lift from it rather than carrying their own. It used to be two unconnected local constants, and none at all in the recenter control — so that control, the one of the three that takes touches, was drawn straight across the sentence the driver was reading. The test does the arithmetic: at rest the control overlaps the bar, lifted it clears it.

The accept / decline swipe controls stay off this material on purpose: the gestures are muscle memory, and the test fails if `GlassPanel` ever appears in `NeonSwipeButton`.

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
- **OTA preview** : [`.github/workflows/eas-update-preview.yml`](.github/workflows/eas-update-preview.yml) — after CI on `main`, runs [`scripts/eas-update-preview.sh`](scripts/eas-update-preview.sh) : copie `google-services.json` à la racine du dépôt (comme `build-local-apk.sh`) puis `eas update` sur le canal `preview`, pour que l'empreinte Android cible les APK **preview-local** et pas seulement les builds cloud.
- **The OTA job installs its own `eas-cli`, from a lockfile, and never from a dist-tag.** [`tools/eas-cli/`](tools/eas-cli) holds a two-line manifest pinning `eas-cli` to an exact version and the lockfile that goes with it; the job copies both into `$RUNNER_TEMP/eas-cli`, runs `npm ci` there, and puts that `node_modules/.bin` on `$GITHUB_PATH`. It used to come from `expo/expo-github-action`, which installs the CLI into a fresh, **lockfile-less** temp directory with yarn: every transitive dependency was resolved from scratch at run time, and `browserslist` → `electron-to-chromium`, republished every day or two, took whatever the registry advertised at that instant. The action's own remote cache did **not** shield this — it answered `400` on every run checked, green ones included — so on 2026-09-30, when npm served `dist-tags.latest` = `1.5.443` while its tarball was still `404 Not Found`, the job died in 20 s, before `npm ci`, on a package that is not ours. Three attempts with escalating waits (2 min, then 7 min) papered over the npm-side window; they are gone with the cause, because `npm ci` never consults a dist-tag — every version and integrity hash is written down, so a version the registry advertises but cannot serve is never selected. The action is gone too: once the install left, all it still did was export the token, and `EXPO_TOKEN` in the publishing step's environment is the documented non-interactive auth. The tool lives **outside** the project tree on purpose — 160 MB under the root would join every Metro file map, locally as well as in a job whose only output is a bundle. Bumping it is a deliberate PR: edit the exact version in `tools/eas-cli/package.json`, run `npm install --package-lock-only` in that directory, commit both, and CI runs on the change (`tools/**` is in `ci.yml`'s paths because [`otaPipeline.test.ts`](src/lib/__tests__/otaPipeline.test.ts) reads it). This deliberately does **not** cover the `eas update` step itself: a transient failure there would re-publish the same commit as a second update group, which is worse than failing and re-running by hand.
- **Secrets** : `EXPO_TOKEN` ; **`GOOGLE_SERVICES_JSON`** (paste du `google-services.json` local, identique au fichier EAS preview) pour que l'OTA CI cible l'empreinte des APK `build-local-apk.sh`. Sans ce secret, le job retombe sur `eas update --environment preview` (runtime cloud seulement).
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
