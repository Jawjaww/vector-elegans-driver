package expo.modules.veoverlay

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.RectF
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ProcessLifecycleOwner
import expo.modules.notifications.service.NotificationsService
import kotlin.math.abs

private const val BUBBLE_WIDTH_DP = 52f
private const val BUBBLE_HEIGHT_DP = 32f

/**
 * Owns the online pill and the return to the foreground.
 *
 * Pure Android, deliberately not a React module: the decision has to run when an
 * FCM push arrives in the background, and at that moment JS is never consulted.
 * `ExpoHandlingDelegate.handleNotification` only forwards to JS when the app is
 * already in the foreground; otherwise expo-notifications presents the
 * notification from Kotlin. A JS-side handler therefore cannot bring the app
 * forward, which is exactly why the offer used to stay a notification.
 *
 * The visible overlay window is what unlocks the background activity launch
 * (BAL exemption): the driver stays online, the pill stays on screen while the
 * app is away, and the pill is removed as soon as the app is back.
 */
object VeOverlayController {
  private const val TAG = "VeOverlay"
  private const val PREFS = "ve_overlay_prefs"
  private const val KEY_DRIVER_ONLINE = "driver_online"

  /**
   * Expo presents asynchronously (`NotificationsService.receive` posts to a
   * service), so a single dismissal can race the tray entry. The second attempt
   * covers that ordering without ever removing a notification twice.
   */
  private const val DISMISS_DELAY_MS = 500L
  private const val DISMISS_RETRY_MS = 1800L

  /**
   * Bounded native decision log, one `timestamp|event|detail` line per entry.
   *
   * A refused background launch throws nothing and leaves no trace anywhere else: the app
   * simply never appears, and from JS the symptom is indistinguishable from a slow boot. The
   * log is what makes the difference readable, including on a device with no adb cable —
   * JS drains it and forwards it to `offer_pipeline_events`.
   */
  private const val KEY_DIAGNOSTICS = "diag_events"
  private const val MAX_DIAGNOSTIC_EVENTS = 40

  /**
   * How long to wait before concluding a requested launch was refused. Android
   * does not report a blocked background launch: `startActivity` returns
   * normally and the window simply never appears, so the absence of a resume is
   * the only observable signal.
   */
  private const val LAUNCH_VERIFY_MS = 3000L

  /**
   * Who asked for the return to the foreground.
   *
   * Both the FCM push and a tap on the pill reach `attemptForeground`, and while the
   * log did not say which, a `launch_confirmed` read like proof that the push had
   * arrived — when it could equally have been a pill tap. That ambiguity is what
   * hid a service that was never started, so every record now carries its origin.
   */
  private const val LAUNCH_ORIGIN_PUSH = "push"
  private const val LAUNCH_ORIGIN_PILL = "pill"

  private val mainHandler = Handler(Looper.getMainLooper())

  private var appContext: Context? = null
  private var started = false

  private var bubbleView: View? = null
  private var bubbleWindowManager: WindowManager? = null

  /**
   * `createWindowContext` is documented as expensive and is capped by the
   * system, so the window context is created once and reused. Creating one per
   * show/hide eventually throws "Too many unused window contexts".
   */
  private var cachedWindowContext: Context? = null

  /** Last dragged position, remembered across hide/show. Null until first show. */
  private var bubbleX: Int? = null
  private var bubbleY: Int? = null

  /** FCM identifier of the offer notification awaiting removal, if any. */
  @Volatile
  private var pendingOfferNotificationId: String? = null

  /**
   * Payload of the last offer push that asked for a silent wake, waiting to be read by JS.
   *
   * Resuming the launcher activity carries no extras and produces no `NotificationResponse`,
   * so without this the JS side would have to rediscover the ride through its boot and the
   * Realtime channel — precisely the latency the wake exists to remove. The FCM service runs
   * in the app process, so a field on this singleton is already visible to the Activity that
   * starts next.
   */
  @Volatile
  private var pendingOfferPush: Map<String, String>? = null

  /**
   * The pill must appear when the app is away and disappear when it is back.
   * `ProcessLifecycleOwner` is the same signal expo-notifications uses for
   * `isAppInForeground()`, so the two agree by construction.
   */
  private val lifecycleObserver = LifecycleEventObserver { _, event ->
    when (event) {
      Lifecycle.Event.ON_START, Lifecycle.Event.ON_RESUME -> onAppForegrounded()
      Lifecycle.Event.ON_STOP -> onAppBackgrounded()
      else -> Unit
    }
  }

  fun start(context: Context) {
    val application = context.applicationContext
    appContext = application
    if (started) return
    started = true
    // `Lifecycle.addObserver` is main-thread only, while JS calls this from its
    // own thread. Registering inline threw IllegalStateException, which surfaced
    // as a rejected module call and made expo-updates' ErrorRecovery kill the app
    // on every launch. Everything touching the lifecycle or a window is posted.
    mainHandler.post { ProcessLifecycleOwner.get().lifecycle.addObserver(lifecycleObserver) }
    Log.i(TAG, "controller started")
  }

  // --- Driver state ---------------------------------------------------------------

  /**
   * Persisted because the process can be restarted by an FCM push with no JS
   * ever running: the pill and the launch decision must survive that.
   */
  fun setDriverOnline(context: Context, online: Boolean) {
    start(context)
    context.applicationContext
      .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(KEY_DRIVER_ONLINE, online)
      .apply()
    recordDiagnostic("driver_online", online.toString())
    mainHandler.post { sync() }
  }

  private fun isDriverOnline(): Boolean {
    val context = appContext ?: return false
    return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .getBoolean(KEY_DRIVER_ONLINE, false)
  }

  // --- Permission -----------------------------------------------------------------

  fun hasPermission(context: Context): Boolean =
    Settings.canDrawOverlays(context.applicationContext)

  /** Opens the system Special app access screen. Always preceded by an in-app
   *  rationale — Google Play requires the explanation before the redirect. */
  fun requestPermission(context: Context) {
    val application = context.applicationContext
    val intent = Intent(
      Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
      Uri.parse("package:${application.packageName}")
    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    // startActivity needs the main thread, and this is reached from JS.
    mainHandler.post {
      try {
        application.startActivity(intent)
      } catch (_: Exception) {
        // No settings activity on this OEM build — the caller keeps its fallback.
      }
    }
  }

  // --- Ride offer push ------------------------------------------------------------

  /**
   * Called from the FCM service before `super`, so the launch and the
   * notification presentation are both in flight when the app resumes.
   *
   * @param data the resolved custom payload (the parsed `body` of an Expo push,
   *   or the flat data of a direct FCM send), whose `tag` key expo-notifications
   *   uses as the notification identifier when present.
   * @param fallbackIdentifier `RemoteMessage.messageId`, used when no tag is sent
   *   (the current server payload sends none, so this is the normal path).
   */
  fun onRideOfferPush(
    context: Context,
    data: Map<String, String>,
    fallbackIdentifier: String?
  ) {
    start(context)
    val application = context.applicationContext

    // Handed to JS whatever the launch decides: the ride is known here and would otherwise
    // have to be rediscovered by the boot.
    pendingOfferPush = data

    // Same identifier rule as FirebaseMessagingDelegate.getNotificationIdentifier.
    val identifier = data["tag"] ?: fallbackIdentifier
    if (identifier != null) {
      pendingOfferNotificationId = identifier
    }

    recordDiagnostic("push_received", "ride_id=${data["ride_id"]}")

    if (!isDriverOnline()) {
      recordDiagnostic("no_launch", "driver_offline")
      return
    }

    // The permission is recorded, not used as a veto. Refusing to even try is what made this
    // path invisible: it produced no launch, no log and no evidence, and on a ROM that honours
    // another exemption (an autostart grant, a running foreground service) it would have
    // worked. Attempting it costs one `startActivity` that Android silently drops when it
    // refuses, and it is what turns "never attempted" into a readable verdict.
    mainHandler.post {
      // The visible overlay window is what makes the launch legal, so it must
      // exist *before* startActivity. Deferring it to a later sync() would leave
      // the launch without its exemption — and in a push-started process no
      // later sync() is coming, JS never ran.
      sync()
      attemptForeground(application, LAUNCH_ORIGIN_PUSH)
    }
  }

  /**
   * The boolean result is deliberately ignored: Android does not report a
   * blocked background launch, `startActivity` returns normally and the window
   * simply never appears. Success is proven by the lifecycle reaching RESUMED,
   * which is what triggers the notification dismissal.
   */
  private fun attemptForeground(context: Context, origin: String) {
    val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
    if (launchIntent == null) {
      recordDiagnostic("launch_impossible", "origin=$origin no_launcher_intent")
      return
    }
    // Recorded here rather than at the call site, so no path can request a launch
    // without saying who asked for it.
    recordDiagnostic(
      "launch_requested",
      "origin=$origin exemption=${if (hasPermission(context)) "pill" else "none"}"
    )
    launchIntent.addFlags(
      Intent.FLAG_ACTIVITY_NEW_TASK or
        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
        Intent.FLAG_ACTIVITY_SINGLE_TOP
    )
    try {
      context.startActivity(launchIntent)
      Log.i(TAG, "foreground launch requested by $origin")
    } catch (e: Exception) {
      recordDiagnostic("launch_threw", "origin=$origin ${e.message ?: "unknown"}")
    }

    // The only observable outcome. A refused launch throws nothing, so the
    // absence of a resume after a grace period is the signal to log — and the
    // notification is deliberately left in place, keeping the offer reachable.
    mainHandler.postDelayed({
      if (isAppForeground()) {
        recordDiagnostic("launch_confirmed", "origin=$origin")
      } else {
        // The single most important line when the app never comes up: it means the request
        // was made and Android dropped it, which no JS-side measure can fix.
        recordDiagnostic(
          "launch_refused",
          "origin=$origin background_launch_blocked_or_oem_autostart_restriction"
        )
      }
    }, LAUNCH_VERIFY_MS)
  }

  // --- Lifecycle transitions ------------------------------------------------------

  private fun onAppForegrounded() {
    recordDiagnostic("app_foregrounded")
    mainHandler.post { sync() }
    scheduleOfferNotificationDismissal()
  }

  private fun onAppBackgrounded() {
    recordDiagnostic("app_backgrounded")
    mainHandler.post { sync() }
  }

  private fun scheduleOfferNotificationDismissal() {
    val identifier = pendingOfferNotificationId ?: return
    pendingOfferNotificationId = null
    Log.i(TAG, "offered notification $identifier will be withdrawn")
    mainHandler.postDelayed({ dismissOfferNotification(identifier) }, DISMISS_DELAY_MS)
    mainHandler.postDelayed({ dismissOfferNotification(identifier) }, DISMISS_RETRY_MS)
  }

  private fun dismissOfferNotification(identifier: String) {
    val context = appContext ?: return
    try {
      NotificationsService.dismiss(context, arrayOf(identifier))
      Log.i(TAG, "withdrew notification $identifier")
    } catch (e: Exception) {
      Log.w(TAG, "could not withdraw notification $identifier", e)
    }
  }

  // --- Bubble ---------------------------------------------------------------------

  /**
   * Read live, never cached. A process started by an FCM push has not been
   * through ON_STOP — the app was killed, not backgrounded — so a cached flag
   * initialised to "visible" would conclude the app is on screen, skip the pill,
   * and lose the overlay window that unlocks the launch. That is precisely the
   * case where the pill matters most: the driver never opened the app.
   */
  private fun isAppForeground(): Boolean =
    ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)

  /** Online, away from the app, and allowed to draw over it. */
  private fun sync() {
    val context = appContext ?: return
    val shouldShow = isDriverOnline() && !isAppForeground() && hasPermission(context)
    val isVisible = bubbleView != null
    if (shouldShow && !isVisible) {
      showBubble(context)
    } else if (!shouldShow && isVisible) {
      hideBubble()
    }
  }

  private fun showBubble(context: Context) {
    if (bubbleView != null) return

    val windowContext = obtainWindowContext(context) ?: return
    val windowManager =
      windowContext.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return

    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      overlayWindowType(),
      // Not focusable so the bubble never steals the keyboard; it must stay
      // touchable, so FLAG_NOT_TOUCHABLE is deliberately absent.
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      val metrics = windowContext.resources.displayMetrics
      x = bubbleX ?: (metrics.widthPixels - dp(metrics.density, BUBBLE_WIDTH_DP + 16f))
      y = bubbleY ?: (metrics.heightPixels / 3)
      setTitle("Vector Elegans")
    }
    bubbleX = params.x
    bubbleY = params.y

    val view = BubbleView(windowContext)
    attachTouchHandler(view, params, windowManager)

    try {
      windowManager.addView(view, params)
      bubbleView = view
      bubbleWindowManager = windowManager
      recordDiagnostic("pill_shown")
    } catch (e: Exception) {
      // addView throws when the permission was revoked between the check and the
      // call, or when the window token is refused. Stay hidden.
      bubbleView = null
      bubbleWindowManager = null
      recordDiagnostic("pill_failed", e.message ?: "unknown")
    }
  }

  private fun hideBubble() {
    val view = bubbleView ?: return
    bubbleView = null
    val windowManager = bubbleWindowManager
    bubbleWindowManager = null
    try {
      windowManager?.removeView(view)
      Log.i(TAG, "pill hidden")
    } catch (_: Exception) {
      // Already detached by the system.
    }
  }

  @SuppressLint("ClickableViewAccessibility")
  private fun attachTouchHandler(
    view: View,
    params: WindowManager.LayoutParams,
    windowManager: WindowManager
  ) {
    val touchSlop = ViewConfiguration.get(view.context).scaledTouchSlop
    var downRawX = 0f
    var downRawY = 0f
    var originX = 0
    var originY = 0
    var dragging = false

    view.setOnTouchListener { _, event ->
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          downRawX = event.rawX
          downRawY = event.rawY
          originX = params.x
          originY = params.y
          dragging = false
          true
        }

        MotionEvent.ACTION_MOVE -> {
          val dx = event.rawX - downRawX
          val dy = event.rawY - downRawY
          if (!dragging && (abs(dx) > touchSlop || abs(dy) > touchSlop)) {
            dragging = true
          }
          if (dragging) {
            params.x = originX + dx.toInt()
            params.y = originY + dy.toInt()
            bubbleX = params.x
            bubbleY = params.y
            try {
              windowManager.updateViewLayout(view, params)
            } catch (_: Exception) {
              // Window already gone; the next show recreates it.
            }
          }
          true
        }

        MotionEvent.ACTION_UP -> {
          if (!dragging) {
            appContext?.let { attemptForeground(it, LAUNCH_ORIGIN_PILL) }
          }
          true
        }

        else -> false
      }
    }
  }

  // --- Hand-off to JS and diagnostics ---------------------------------------------

  /**
   * Payload of the offer push that woke the app, read once.
   *
   * Null on the tray path: a tapped notification carries its own response object, and a second
   * copy here would only risk surfacing the same offer twice.
   */
  fun consumePendingOfferPush(): Map<String, String>? {
    val payload = pendingOfferPush ?: return null
    pendingOfferPush = null
    return payload
  }

  /**
   * Live native state, so the dashboard can explain a wake that did not happen.
   *
   * `hasPermission` is reported but no longer gates the launch: it says whether the pill could
   * be shown, which is the exemption the launch depends on, not a decision taken here.
   */
  fun describeState(): Map<String, Boolean> {
    val context = appContext
    return mapOf(
      "hasPermission" to (context != null && hasPermission(context)),
      "driverOnline" to isDriverOnline(),
      "appForeground" to isAppForeground(),
      "pillVisible" to (bubbleView != null)
    )
  }

  /**
   * Append one decision to the bounded log, and mirror it to logcat.
   *
   * Never throws: a diagnostic must not be able to break the launch it describes.
   */
  fun recordDiagnostic(event: String, detail: String? = null) {
    Log.i(TAG, if (detail == null) "diag: $event" else "diag: $event ($detail)")
    val context = appContext ?: return
    val line = "${System.currentTimeMillis()}|$event" +
      (detail?.let { "|$it" } ?: "")
    try {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val previous = prefs.getString(KEY_DIAGNOSTICS, null)
        ?.split('\n')
        ?.filter { it.isNotBlank() }
        ?: emptyList()
      val kept = previous.takeLast(MAX_DIAGNOSTIC_EVENTS - 1) + line
      prefs.edit().putString(KEY_DIAGNOSTICS, kept.joinToString("\n")).apply()
    } catch (e: Exception) {
      Log.w(TAG, "could not record diagnostic", e)
    }
  }

  /** Read the log and clear it, oldest event first. Empty when nothing was recorded. */
  fun drainDiagnostics(): String {
    val context = appContext ?: return ""
    val content = try {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .getString(KEY_DIAGNOSTICS, null)
    } catch (e: Exception) {
      Log.w(TAG, "could not drain diagnostics", e)
      null
    } ?: return ""
    try {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .remove(KEY_DIAGNOSTICS)
        .apply()
    } catch (e: Exception) {
      Log.w(TAG, "could not clear diagnostics", e)
    }
    return content
  }

  // --- Helpers --------------------------------------------------------------------

  private fun obtainWindowContext(context: Context): Context? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return context
    cachedWindowContext?.let { return it }
    return try {
      context.createWindowContext(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, null)
        .also { cachedWindowContext = it }
    } catch (e: Exception) {
      Log.w(TAG, "window context unavailable, falling back", e)
      context
    }
  }

  private fun overlayWindowType(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }

  private fun dp(density: Float, value: Float): Int = (value * density).toInt()

  /**
   * Purely visual — touch is handled by the controller so the drag maths can
   * reach the window params. Drawn in code to avoid shipping drawables.
   */
  private class BubbleView(context: Context) : View(context) {
    private val density = resources.displayMetrics.density
    private val widthPx = (BUBBLE_WIDTH_DP * density).toInt()
    private val heightPx = (BUBBLE_HEIGHT_DP * density).toInt()
    private val corner = heightPx / 2f

    private val pillBounds = RectF()
    private val borderBounds = RectF()
    private val arrow = Path()

    private val pillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.parseColor("#171717")
      style = Paint.Style.FILL
    }
    private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.parseColor("#33FFFFFF")
      style = Paint.Style.STROKE
      strokeWidth = density
    }
    private val arrowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.parseColor("#3B82F6")
      style = Paint.Style.FILL
    }
    private val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.parseColor("#10B981")
      style = Paint.Style.FILL
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
      setMeasuredDimension(widthPx, heightPx)
    }

    override fun onDraw(canvas: Canvas) {
      super.onDraw(canvas)
      val w = width.toFloat()
      val h = height.toFloat()
      val halfStroke = borderPaint.strokeWidth / 2f

      pillBounds.set(0f, 0f, w, h)
      canvas.drawRoundRect(pillBounds, corner, corner, pillPaint)

      borderBounds.set(halfStroke, halfStroke, w - halfStroke, h - halfStroke)
      canvas.drawRoundRect(borderBounds, corner, corner, borderPaint)

      // Downward chevron: the wings sit at the top and the point at the bottom,
      // so the glyph reads as a V.
      val cx = w * 0.40f
      val cy = h / 2f
      val halfWidth = 6.5f * density
      val top = cy - 7f * density
      val bottom = cy + 6.5f * density
      val notch = cy + 2.5f * density
      arrow.reset()
      arrow.moveTo(cx, bottom)
      arrow.lineTo(cx + halfWidth, top)
      arrow.lineTo(cx, notch)
      arrow.lineTo(cx - halfWidth, top)
      arrow.close()
      canvas.drawPath(arrow, arrowPaint)

      // Online dot.
      canvas.drawCircle(w * 0.72f, cy, 3.5f * density, dotPaint)
    }
  }
}
