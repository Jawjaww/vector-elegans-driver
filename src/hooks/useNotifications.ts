import { useEffect, useRef, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import * as Updates from 'expo-updates';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { readNotificationData } from '../lib/notifications/notificationPayload';
import {
  registerAndUpsertPushToken,
  requestRideNotificationPermission,
  notificationResponseEventKey,
  offerActionFromIdentifier,
  queueOfferOpen,
  rideIdFromPushData,
  RIDES_PUSH_CHANNEL_ID,
  shouldOpenHomeFromPushData,
} from '../lib/notifications/pushRegistration';
import { presentationForIncomingPush, SUPPRESS_INCOMING_PUSH } from '../lib/notifications/pushPresentation';
import { logOfferStage } from '../lib/notifications/offerPipelineDiag';
import { acknowledgeOfferPush } from '../lib/notifications/offerPushAck';
import { previewFromPushData } from '../lib/notifications/offerPreview';
import {
  consumeNativeOfferPush,
  drainOverlayDiagnostics,
  getOverlayState,
} from '../lib/overlay/overlayService';
import type { OfferNotificationAction } from '../lib/stores/driverStore';
import type { OfferOpenStageName } from '../lib/notifications/offerRing';
import {
  buildRideOfferPushContent,
  isRideOfferPush,
  RIDE_OFFER_BRAND_COLOR,
  rideOfferNotificationId,
} from '../lib/notifications/rideOfferPushContent';

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = readNotificationData(notification);
    const appState = AppState.currentState;

    // A ride offer is handled natively when the app is away: the Android FCM
    // service asks for a background activity launch and withdraws the
    // notification once the app is back, so a tray entry here would be a
    // duplicate of the offer card it just surfaced.
    //
    // This handler only runs while the app is in the foreground (see
    // ExpoHandlingDelegate), so it never drives that path — it only restyles
    // the offer into the branded local notification.
    if (isRideOfferPush(data) && appState === 'active') {
      const content = buildRideOfferPushContent(
        data,
        notification.request.content,
        { includeSubtitle: Platform.OS === 'ios' },
      );
      await Notifications.scheduleNotificationAsync({
        identifier: rideOfferNotificationId(data),
        content: {
          ...content,
          data,
          ...(Platform.OS === 'android' && {
            channelId: RIDES_PUSH_CHANNEL_ID,
            color: RIDE_OFFER_BRAND_COLOR,
            priority: Notifications.AndroidNotificationPriority.MAX,
          }),
        },
        trigger: null,
      });
      return SUPPRESS_INCOMING_PUSH;
    }

    return presentationForIncomingPush(appState, data);
  },
});

/**
 * The two ways an offer can reach the driver without them choosing it in-app, and what tells
 * them apart in the timeline: a tap is already inside JS, whereas a silent wake also crossed
 * the process start and the Activity launch.
 *
 * Reused from the ring gate rather than redeclared here: the ring's whole decision rests on
 * this distinction, so the two must not be able to disagree about what a wake is.
 */
type OfferOpenStage = OfferOpenStageName;

/**
 * How long a ride counts as already queued.
 *
 * The native controller keeps a copy of every offer payload it was woken by, and on the tray
 * path the response carries the same ride *plus* the tray action. Without this window the
 * actionless native copy could queue the ride a second time and overwrite an Accept with a
 * plain open. Bounded rather than permanent so a genuine re-offer of the same ride, minutes
 * later, is still surfaced.
 */
const DOUBLE_QUEUE_WINDOW_MS = 10_000;

/**
 * Whether the mount-time native read already ran in this JS runtime.
 *
 * Module scope on purpose, not a `useRef`: the flood this pins was twenty-one `no_payload`
 * rows in five seconds, which means the read ran per mount rather than once, and a ref is
 * reset by the very remount that caused it. The underlying remount is not identified here.
 *
 * Running it only once cannot miss anything, because the first read *consumes* the native
 * payload: every later read in the same runtime is guaranteed to answer "no payload" and can
 * only bury the one row that matters. A payload landing later is still picked up — that is the
 * AppState listener on the return to the foreground, which is untouched.
 */
let initialNativeReadDone = false;

/**
 * The JS bundle this runtime is executing, for the pipeline log.
 *
 * The APK identity arrives separately, through the native `process_start` entry. Read
 * defensively: this is observability, and it must never be the thing that breaks a cold
 * start. `expo-updates` answers nulls rather than throwing when updates are disabled.
 */
function readBuildIdentity(): Record<string, unknown> {
  try {
    return {
      updateId: Updates.updateId,
      runtimeVersion: Updates.runtimeVersion,
      channel: Updates.channel,
      embedded: Updates.isEmbeddedLaunch,
    };
  } catch {
    return { updateId: null, unavailable: true };
  }
}

export function useNotifications() {
  const router = useRouter();
  const notificationListener = useRef<Notifications.EventSubscription | null>(
    null,
  );
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const lastHandledEventKey = useRef<string | null>(null);
  const lastNotificationResponse = Notifications.useLastNotificationResponse();

  /**
   * Ride ids queued in this session, with the instant, so one push cannot be queued twice.
   * See `DOUBLE_QUEUE_WINDOW_MS`.
   */
  const queuedRideIds = useRef(new Map<string, number>());

  const handleNotificationOpen = useCallback(
    (
      data: Record<string, unknown>,
      action: OfferNotificationAction | null,
      stage: OfferOpenStage,
    ) => {
      if (!shouldOpenHomeFromPushData(data)) return;
      // Remember the opened ride (and the tray action) so the dashboard can
      // surface it in the overlay even when it already sits in the deferred
      // bottomsheet.
      const rideId = rideIdFromPushData(data);
      if (rideId) {
        queuedRideIds.current.set(rideId, Date.now());
      }
      // Start of the chronology, and the one timestamp that must be taken here: this is the
      // instant the arrival is observed. Everything downstream sits behind the dashboard boot,
      // so measuring from `boot_ready` would hide the very latency being investigated.
      logOfferStage(
        stage,
        { action: action ?? 'open', app_state: AppState.currentState },
        rideId,
      );
      if (rideId) {
        // The stage is carried into the queue, not merely logged: the ring gate reads it to
        // know whether anything has already made a sound for this offer.
        queueOfferOpen(rideId, action, previewFromPushData(data, rideId), stage);
      }
      // The one place both paths converge — a tray tap and a silent wake — which is exactly
      // what makes it the right place to report receipt: beyond this point the server could no
      // longer tell "woken" from "never started".
      acknowledgeOfferPush(data);
      router.push('/(tabs)/');
    },
    [router],
  );

  const openFromResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      // Keyed by event, not by identifier: the identifier is stable per ride, so
      // identifier-only dedup swallowed the same ride re-offered 30 min later.
      const eventKey = notificationResponseEventKey(response);
      if (lastHandledEventKey.current === eventKey) return;
      lastHandledEventKey.current = eventKey;
      const data = readNotificationData(response.notification);
      console.log('[Notifications] Opened from push:', data);
      handleNotificationOpen(
        data,
        offerActionFromIdentifier(response.actionIdentifier),
        'tap_received',
      );
      Notifications.clearLastNotificationResponse();
    },
    [handleNotificationOpen],
  );

  /**
   * Take the payload the native side kept when it brought the app forward on its own.
   *
   * A silent wake resumes the launcher activity, so it produces no `NotificationResponse` at
   * all: this is the only thing that carries the ride, and without it the offer would have to
   * be rediscovered by the dashboard boot. Null is the normal answer on every other path —
   * but it is no longer a silent one, see below.
   */
  const consumeSilentWake = useCallback(() => {
    const payload = consumeNativeOfferPush();
    if (!payload) {
      // Recorded rather than swallowed. "There was never a payload" and "the payload was
      // skipped as already queued" used to produce the exact same observation — no
      // `silent_wake` row at all — which made a never-started FCM service look identical to
      // a working wake. One row per check is the price of telling those apart.
      logOfferStage('silent_wake', { outcome: 'no_payload' });
      return;
    }
    const rideId = rideIdFromPushData(payload);
    if (rideId) {
      const queuedAt = queuedRideIds.current.get(rideId);
      if (
        queuedAt !== undefined &&
        Date.now() - queuedAt < DOUBLE_QUEUE_WINDOW_MS
      ) {
        logOfferStage('silent_wake', { outcome: 'already_queued' }, rideId);
        return;
      }
      if (queuedRideIds.current.size > 50) queuedRideIds.current.clear();
    }
    // No tap and no notification, so there is no tray action to carry.
    handleNotificationOpen(payload, null, 'silent_wake');
  }, [handleNotificationOpen]);

  /**
   * Replay the native decision log into the offer pipeline, then clear it.
   *
   * This is the only window onto the part of the delay that happens before JS exists — whether
   * the push woke the service at all, whether a launch was requested, and whether Android
   * granted it. The stored `native_at` is the device clock at the moment it happened, which
   * `t_ms` (measured from module evaluation) cannot express.
   */
  const reportNativeDiagnostics = useCallback(() => {
    const raw = drainOverlayDiagnostics();
    if (!raw) return;
    const state = getOverlayState();
    for (const line of raw.split('\n')) {
      const [at, event, ...rest] = line.split('|');
      if (!event) continue;
      // Rejoined rather than taken as a single element: a detail containing a separator would
      // otherwise be silently truncated.
      const detail = rest.join('|');
      logOfferStage('native_diag', {
        event,
        ...(detail ? { detail } : {}),
        // Spreading `null` is a no-op, so no `?? {}` fallback is needed here.
        ...state,
        native_at: Number(at),
      });
    }
  }, []);

  useEffect(() => {
    if (!lastNotificationResponse) return;
    openFromResponse(lastNotificationResponse);
  }, [lastNotificationResponse, openFromResponse]);

  useEffect(() => {
    // Once per JS runtime: see `initialNativeReadDone`. A remount must not re-ask the native
    // side a question whose answer it has already consumed.
    if (initialNativeReadDone) return;
    initialNativeReadDone = true;
    logOfferStage('app_build', readBuildIdentity());
    // Native read next: on a cold start from a silent wake it is the only source of the ride,
    // and everything it triggers is a synchronous store write.
    reportNativeDiagnostics();
    consumeSilentWake();
    // The read behind `useLastNotificationResponse` happens at the hook's first render and comes
    // back empty when the native modules were not up yet, and nothing re-reads it afterwards.
    // Read the same pending response again here, from the effect, where the modules are loaded;
    // the event key keeps it idempotent when the hook already handled it.
    //
    // Wrapped on purpose. This replaces the deprecated async form, which was a bare promise
    // wrapper around this very call and turned an unavailable native module into a rejection
    // that `void` dropped. The synchronous call throws instead, and the read sits on the cold
    // start path: a breadcrumb must not be able to break it.
    try {
      const response = Notifications.getLastNotificationResponse();
      if (response) openFromResponse(response);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Notifications] last response unavailable:', error);
      }
    }
  }, [consumeSilentWake, openFromResponse, reportNativeDiagnostics]);

  useEffect(() => {
    void registerAndUpsertPushToken();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        void registerAndUpsertPushToken();
      }
    });

    const appStateSub = AppState.addEventListener('change', (next) => {
      const wasBackground = appState.current.match(/inactive|background/);
      appState.current = next;
      if (wasBackground && next === 'active') {
        // Coming back is exactly when a silent wake has just landed: the native side stored
        // the payload before asking for the launch.
        reportNativeDiagnostics();
        consumeSilentWake();
        void registerAndUpsertPushToken();
      }
    });

    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        const data = readNotificationData(notification);
        console.log('[Notifications] Foreground data:', data);
      });

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        openFromResponse(response);
      });

    return () => {
      subscription.unsubscribe();
      appStateSub.remove();
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [consumeSilentWake, openFromResponse, reportNativeDiagnostics]);

  return {
    requestPermissions: requestRideNotificationPermission,
    registerForPushNotifications: registerAndUpsertPushToken,
  };
}
