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
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.abs

/**
 * Android overlay window used as the driver's "online" affordance.
 *
 * Why this exists: Android blocks background activity launches (BAL) since
 * Android 10, so the app cannot bring itself to the foreground when an offer
 * arrives. Holding SYSTEM_ALERT_WINDOW *and* currently displaying a visible
 * overlay window is one of the documented exemptions — this pill is that
 * visible window. Its real job is to unlock the offer's return to foreground;
 * tapping it is a convenience.
 *
 * Keep one visible whenever the driver is online, or the exemption is void.
 */
class VeOverlayModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())

  @Volatile
  private var bubbleView: View? = null
  private var bubbleWindowManager: WindowManager? = null

  /**
   * `createWindowContext` is documented as expensive and is capped by the
   * system, so the window context is created once and reused for the app's
   * lifetime. Creating one per show/hide eventually throws
   * "Too many unused window contexts".
   */
  private var cachedWindowContext: Context? = null

  /** Last dragged position, remembered across hide/show. Null until first show. */
  private var bubbleX: Int? = null
  private var bubbleY: Int? = null

  private val reactContext: Context?
    get() = appContext.reactContext

  override fun definition() = ModuleDefinition {
    Name("VeOverlay")

    Function("hasPermission") { hasOverlayPermission() }

    // Reports the permission too: when the user revokes it from Settings the
    // system tears the window down without telling us, so the stale view
    // reference must not read as "visible". This is what lets the JS
    // reconciliation heal itself on the next pass.
    Function("isBubbleVisible") { hasOverlayPermission() && bubbleView != null }

    Function("requestPermission") {
      mainHandler.post { openOverlaySettings() }
      Unit
    }

    Function("showBubble") {
      mainHandler.post { showBubble() }
      Unit
    }

    Function("hideBubble") {
      mainHandler.post { hideBubble() }
      Unit
    }

    /** Returns true when the activity launch was handed to the system. */
    Function("bringToForeground") { bringToForeground() }

    OnDestroy {
      mainHandler.post { hideBubble() }
    }
  }

  // --- Permission -----------------------------------------------------------------

  private fun hasOverlayPermission(): Boolean {
    val context = reactContext ?: return false
    return Settings.canDrawOverlays(context)
  }

  private fun openOverlaySettings() {
    val context = reactContext ?: return
    val intent = Intent(
      Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
      Uri.parse("package:${context.packageName}")
    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      context.startActivity(intent)
    } catch (_: Exception) {
      // No settings activity on this OEM build — the caller keeps its fallback.
    }
  }

  // --- Bubble ---------------------------------------------------------------------

  private fun showBubble() {
    if (bubbleView != null) return
    if (!hasOverlayPermission()) return

    val context = obtainWindowContext() ?: return
    val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return

    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      overlayWindowType(),
      // Not focusable so the bubble never steals the keyboard; it must still be
      // touchable, so FLAG_NOT_TOUCHABLE is deliberately absent.
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      val metrics = context.resources.displayMetrics
      x = bubbleX ?: (metrics.widthPixels - dp(metrics.density, BUBBLE_WIDTH_DP + 16f))
      y = bubbleY ?: (metrics.heightPixels / 3)
      setTitle("Vector Elegans")
    }
    bubbleX = params.x
    bubbleY = params.y

    val view = BubbleView(context)
    attachTouchHandler(view, params, windowManager)

    try {
      windowManager.addView(view, params)
      bubbleView = view
      bubbleWindowManager = windowManager
    } catch (_: Exception) {
      // addView throws when the permission was revoked between the check and
      // the call, or when the window token is refused. Stay hidden.
      bubbleView = null
      bubbleWindowManager = null
    }
  }

  private fun hideBubble() {
    val view = bubbleView ?: return
    bubbleView = null
    val windowManager = bubbleWindowManager
    bubbleWindowManager = null
    try {
      windowManager?.removeView(view)
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
          if (!dragging) bringToForeground()
          true
        }

        else -> false
      }
    }
  }

  // --- Foreground -----------------------------------------------------------------

  private fun bringToForeground(): Boolean {
    val context = reactContext ?: return false
    val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: return false
    launchIntent.addFlags(
      Intent.FLAG_ACTIVITY_NEW_TASK or
        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
        Intent.FLAG_ACTIVITY_SINGLE_TOP
    )
    return try {
      context.startActivity(launchIntent)
      true
    } catch (_: Exception) {
      // Blocked by the BAL rules (typically: the overlay was not visible, or the
      // permission was revoked). The caller keeps its notification fallback.
      false
    }
  }

  // --- Helpers --------------------------------------------------------------------

  private fun obtainWindowContext(): Context? {
    val base = reactContext ?: return null
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return base
    cachedWindowContext?.let { return it }
    return try {
      base.createWindowContext(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, null)
        .also { cachedWindowContext = it }
    } catch (_: Exception) {
      base
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
   * Purely visual — touch is handled by the module so the drag maths can reach
   * the window params. Drawn in code to avoid shipping drawables for a pill.
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

      // Navigation arrow, same glyph family as the in-app GPS puck.
      val cx = w * 0.40f
      val cy = h / 2f
      val halfWidth = 6.5f * density
      val top = cy - 7f * density
      val bottom = cy + 6.5f * density
      val notch = cy + 2.5f * density
      arrow.reset()
      arrow.moveTo(cx, top)
      arrow.lineTo(cx + halfWidth, bottom)
      arrow.lineTo(cx, notch)
      arrow.lineTo(cx - halfWidth, bottom)
      arrow.close()
      canvas.drawPath(arrow, arrowPaint)

      // Online dot.
      canvas.drawCircle(w * 0.72f, cy, 3.5f * density, dotPaint)
    }
  }

  private companion object {
    const val BUBBLE_WIDTH_DP = 52f
    const val BUBBLE_HEIGHT_DP = 32f
  }
}
