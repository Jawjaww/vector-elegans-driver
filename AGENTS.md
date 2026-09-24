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
- Rebuild obligatoire si : nouvelle dep native, plugin `app.config.js`, icône/splash, permissions, **ou toute ligne de Kotlin dans `modules/`** (la sonnerie et son sélecteur en font partie — voir § « Ce qui part en OTA, et ce qui exige un APK »).

Dashboard updates : https://expo.dev/accounts/jawjaww/projects/vector-elegans-driver/updates

## Pastille overlay Android (`modules/ve-overlay`)

But : amener l'app au premier plan avec la course **sans passer par la notification**, quand le chauffeur est en ligne. Android bloque les lancements d'Activity depuis l'arrière-plan (BAL, API 29+) ; détenir `SYSTEM_ALERT_WINDOW` **et** afficher une fenêtre overlay visible est une des exemptions documentées. La pastille *est* cette fenêtre — sans elle, le lancement est refusé.

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

### La notification est le recours, pas le point d'entrée

Objectif produit : sur le chemin où le réveil réussit, **aucune notification ne doit apparaître**. Une bannière qui double une course déjà à l'écran ne fait pas qu'être inutile, elle détourne l'attention au pire moment — et elle est le premier signe visible d'un réveil qui ne marche pas.

Le service décide donc en trois temps :

1. `onRideOfferPush` renvoie `true` **seulement** s'il y a un lancement à tenter : chauffeur en ligne **et** app hors premier plan. Sinon `false`, et `super` est appelé immédiatement — la notification est alors le seul porteur de l'offre et elle ne doit pas attendre.
2. Si `true`, le service ne présente rien : il confie le `RemoteMessage` à `holdOfferPresentation`, qui arme un `Runnable` de 2 s (`OFFER_PRESENTATION_FALLBACK_MS`).
3. Sur `ON_START` / `ON_RESUME`, `onAppForegrounded` annule ce `Runnable`. Si l'app n'est jamais revenue, le `Runnable` **rejoue le message par le délégué d'Expo** — `FirebaseMessagingDelegate(context).onMessageReceived(remoteMessage)` — donc le même payload, le même canal, la même action de tiroir que le chemin d'origine.

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

**Et une OTA ne se publie jamais à la main.** Le canal `preview` s'installe sur les téléphones des chauffeurs, et `eas-update-preview.yml` ne le publie qu'à une seule condition : un `workflow_run` de `CI (Expo)` terminé sur `main` en `event == 'push'` — donc après un merge, jamais depuis une branche. Un `eas update` lancé du poste de travail contourne la revue *et* la CI, et installe du code que personne n'a relu. Constaté le 2026-09-24 : les douze dernières entrées du canal portaient un message écrit à la main, aucune `OTA from <sha>` — le pipeline n'avait rien publié, faute d'un merge sur `main`, et c'est le `eas update` manuel qui avait mis les bundles sur les appareils. Le message du workflow est ce qui distingue les deux : `eas update:list --branch preview` affiche `OTA from <sha>` pour le pipeline et le texte de l'auteur pour une publication manuelle.

**Une PR dont la base n'est pas `main` ne passe aucune CI.** Les deux déclencheurs de `ci.yml` filtrent sur `branches: [main]`, `pull_request` compris. Une PR empilée sur une branche intermédiaire n'affiche donc **aucun check** — `gh pr checks <n>` répond « no checks reported » — et rien ne l'a vérifiée. Découper un travail en PR empilées reste légitime, mais il ne faut pas en attendre une vérification : la CI n'arrive qu'au moment où la base atteint `main`, et c'est le merge sur `main` qui arme l'OTA, pas la PR.

### The guidance bar is an announcement, and the sheet is the reference

The instruction was a panel pinned over the map for the whole leg, and that failed in both directions at once: it stood over a sheet that already carried the stage, the addresses and the action button, and it was still there while the driver was driving — when the only thing worth reading is the road. `src/lib/utils/tripGuidancePeek.ts` (pure, tested) holds the life of the announcement and `TripGuidanceBar` only draws it. It follows the driver rather than a clock, which makes it a hysteresis and not a timer:

- **announced on a stage change** (`to_pickup` → `at_pickup` → `to_dropoff`);
- **withdrawn once the driver has covered `GUIDANCE_DEPART_METERS` (8 m)**, which is the smallest displacement a fix can *prove*: the navigation watch filters on `distanceInterval: 8`, so a smaller threshold would be measuring the drift of a parked car;
- **recalled if the driver then stands still for `GUIDANCE_RECALL_MS` (2 min)** — long enough that it cannot fire at a red light, a jam or a junction, short enough for the stop it is meant for;
- **once per stage, and never more.** The recall covers one lapse of attention, it is not a reminder on a schedule; a stage change re-arms it, budget included.

**A stop can only be observed as the absence of new progress, so there is a heartbeat.** Once the bar has withdrawn and the driver parks, `distanceInterval: 8` stops the fixes: no route progress arrives at all, and no message anywhere says "no change". `GUIDANCE_TICK_MS` (5 s) re-runs the same observation so a silence can eventually be read as a stop. It is mounted only while a ride is in progress — and it must **not** take the distance as a dependency. Every route push would then tear the interval down and rebuild it, and a timer rebuilt more often than its own period never fires: the recall would silently never happen, with nothing in a log to say why.

- **The movement signal is route progress (`NavProgress.distanceMeters`), never `currentLocation.speed`.** `currentLocation` is written through a distance throttle (`GPS_STORE_MIN_METERS`): once the driver parks, no fix moves 8 m, so the last *moving* fix stays in the store — speed included — indefinitely. Read as "the vehicle is moving", that stale number would retire the announcement of the next trip before the driver had moved at all, which is the very sentence the bar exists to show.
- **The advance is a running maximum**, so a route recomputed mid-leg (the remaining distance going *up*) neither reads as the driver going backwards nor forgets an advance already made — and, just as importantly, does not push the recall further away.
- **The sheet's `trip` palier takes over from the bar**, because the trip body already holds the stage, both addresses and the button. That suppression is a filter applied at render and not a flag written into the state: the palier the sheet is *heading for* is known in the same commit as the stage, the *settled* one only a commit later, and a latched flag would be set by a stale value and swallow the next announcement for good. A filter also cannot spend a recall: being covered by the sheet is not the driver having read the instruction, so a stage suppressed for a whole leg keeps its one return.
- **`BottomSheet` reports the palier it actually settled on** (`onSettle`), a drag included. The dashboard cannot derive it: `snapLevel` is only what the sheet is asked for, and a drag settles wherever the driver lets go.
- **The bar and the arrival chip move on the same clock** (`GUIDANCE_EMERGE_MS` / `GUIDANCE_RETRACT_MS`), because the chip is lifted by the bar and would otherwise be left floating over an empty slot. The chip itself never leaves: the instruction is news, the ETA is not.
- **The bar carries the instruction and nothing else.** A second line held the pickup or drop-off address, on the reasoning that the title named a place the driver could not find; that was wrong twice. The map already pins the place the sentence names, and the row the address occupied was the row the sentence needed — on the longest locale it was cut mid-word. Naming the address is the sheet's job and the pin's job. The title wraps to **two lines** instead, which is exactly the row the address freed, so `TRIP_GUIDANCE_BAR_HEIGHT` did not have to grow and nothing in the lane above moved. `says the instruction, alone, and never cuts it` pins the single `<Text>`, the two-line cap, and the absence of the address from the props.

Whole thing is JS: it travels in OTA. `tripGuidancePeek.test.ts` pins the rule and the wiring, including two mutations — re-arming the recall budget on every observation, and re-announcing a stage on every route tick — plus the heartbeat's dependency list, which is the one regression here that fails silently on a device.

### The overlay glass is built, because there is no blur to be had

`expo-blur` is not merely expensive over this screen, it is inert: on Android `BlurView` defaults to `BlurMethod.NONE` and `setColor` paints a flat tint rather than blurring (`ExpoBlurView.kt`). The overlays above the map would pay for a backdrop capture and receive an opaque rectangle — and the backdrop is a map that never holds still, so the capture would be recomputed on every frame the driver moves. The glass is *constructed* instead, from static layers. Being built is also why it can afford to be convincing: painted once, it costs nothing per frame.

`GLASS_MATERIAL` in `src/lib/theme.ts` describes the material layer by layer, and `GlassPanel` paints the layers in order — the test `lays out the material in the documented layer order` fails if one is moved:

1. a **diagonal body gradient** at three stops, translucent so the map crosses it. It is the only fill: the pane's top is the *range* between its own stops, because a highlight painted as its own band over a bar this short lands across a line of type;
2. two **directional edge glows** — a hairline along the top edge and another down the left, each fading to nothing by `edgeFade` (0.42);
3. a uniform **rim**, one point wide, occupying the band the body leaves free.

**The face is a light neutral frost — not charcoal, and not tinted.** Two rejections led here: the near-black face read as a hole cut out of the map, and the slate blue that replaced it read as a colour that had been *chosen* rather than a pane that was frosted. `is a light frost, and the map is allowed to cross it` re-reads the stops *composited over the map tile* — light at both ends, with an internal range so the pane keeps a top and a bottom — and `stays neutral, with no tint chosen for it` fails if the face drifts back towards a colour of its own.

**The type and the outline are dark, because the face inverted.** On the dark pane a glyph had to come *up* in value to be seen and the outline was a glow; on a pale one both have to come *down*, and the `#e2e8f0`-era light greys would be the same mistake in the opposite direction. `spends its type on dark greys, because the face inverted` and `bounds a pale pane with a dark hairline` pin it — a dark rim being the one thing that gives a pale panel an edge over pale tiles.

**A highlight band was shipped and removed, and the reason is worth keeping.** It was drawn as its own layer peaking just under the top edge, which reads as a curve catching the light on paper — but the bar it sits on is 58 points tall, so the peak fell across the instruction, and the driver reported a lighter rectangle drawn behind the words: delimited, translucent, with square ends. `has no highlight band, because a band over a short bar lands on the type` pins the absence from both sides — the field in the material and the layer in the panel.

**Every fill is rounded twice, and that is deliberate.** The body gradient carries `borderRadius: bodyRadius` in addition to being clipped by the wrapper's `overflow: hidden`, because the rounded clip does not reliably reach a native gradient view on Android: an uncut body paints its own square corners over the map, which is the other half of the same report. `fits every layer to the radius it was handed` fails if a layer starts trusting the clip alone.

**Layer 2 is the whole border treatment, and it is deliberately not four lit corners.** Bright arcs on two opposite corners are a graphic flourish, and on a panel this small they read as a bevelled box from an older toolkit — which is what they were, and what got rejected. Two thin bars leaving one origin say the same thing (the light comes from up and to the left) and say it quietly. The Next.js client portal reached the same conclusion in `globals.css`: `.card-elegant::after` draws *"top (horizontal) and left (vertical) ultra-fine, ultra-subtle glows"* with the comment *"corner highlights handled by ::after (no filled corner blobs)"*. The retired corner treatment is pinned by absence so it cannot return unnoticed.

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
