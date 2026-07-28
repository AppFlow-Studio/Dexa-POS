package com.temurappflowstudios.dexapos.secondarydisplay

import android.content.Context
import android.hardware.display.DisplayManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Display
import android.view.WindowManager
import com.facebook.react.bridge.*
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.common.JavascriptException

/**
 * Native module for managing the secondary display Presentation.
 *
 * Only handles lifecycle (show/dismiss). All display data flows through
 * shared Zustand stores in the same JS runtime — no native bridge needed.
 *
 * Monitors display lifecycle via DisplayListener so the Presentation is
 * automatically dismissed when the display goes away and re-created when
 * it comes back. This prevents WindowManager.BadTokenException crashes
 * that show a brief Android system dialog on Landi devices.
 *
 * Installs a Thread.UncaughtExceptionHandler while a Presentation is active
 * to intercept JavascriptException and dismiss the Presentation silently
 * instead of letting Android show the system crash dialog. Sentry captures
 * the error on the JS side before it reaches native, so no reporting is lost.
 */
class SecondaryDisplayModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

    companion object {
        const val TAG = "SecondaryDisplay"
        const val NAME = "SecondaryDisplayModule"
        const val RECOVERY_DELAY_MS = 500L
    }

    override fun getName(): String = NAME

    private var presentation: SecondaryDisplayPresentation? = null
    private var currentDisplayId: Int = -1
    private var isShowRequested: Boolean = false
    private var isListenerRegistered: Boolean = false
    private var isLifecycleRegistered: Boolean = false
    private val mainHandler = Handler(Looper.getMainLooper())

    // ==================== UNCAUGHT EXCEPTION GUARD ====================

    private var previousUncaughtHandler: Thread.UncaughtExceptionHandler? = null
    private var isExceptionGuardInstalled: Boolean = false

    /**
     * Install a Thread.UncaughtExceptionHandler that intercepts JavascriptException
     * while a Presentation is active. This is the primary defense against the native
     * Android crash dialog appearing on the CFD secondary display.
     *
     * The guard only swallows JavascriptException when presentation != null.
     * All other exceptions pass through to the previous handler (Sentry, etc.).
     */
    private fun installExceptionGuard() {
        if (isExceptionGuardInstalled) return

        val currentHandler = Thread.getDefaultUncaughtExceptionHandler()
        previousUncaughtHandler = currentHandler

        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            // Diagnostic: surfaces the actual exception class so we can tell
            // RenderProcessGoneException apart from JavascriptException in logs.
            Log.w(TAG, "Uncaught: cls=${throwable.javaClass.simpleName} msg=${throwable.message} presentationActive=${presentation != null}")

            if (presentation != null && isJavascriptException(throwable)) {
                Log.w(TAG, "Caught JavascriptException with active Presentation — dismissing CFD silently", throwable)
                try {
                    mainHandler.post { dismissPresentation() }
                } catch (_: Exception) {}
                // Don't propagate — Sentry has already captured the error on the JS side.
                // Propagating would show the crash dialog on the Presentation window.
                return@setDefaultUncaughtExceptionHandler
            }
            // Not a CFD-related JS exception — pass to previous handler
            currentHandler?.uncaughtException(thread, throwable)
        }

        isExceptionGuardInstalled = true
        Log.d(TAG, "Exception guard installed")
    }

    private fun removeExceptionGuard() {
        if (!isExceptionGuardInstalled) return

        if (previousUncaughtHandler != null) {
            Thread.setDefaultUncaughtExceptionHandler(previousUncaughtHandler)
            previousUncaughtHandler = null
        }

        isExceptionGuardInstalled = false
        Log.d(TAG, "Exception guard removed")
    }

    private fun isJavascriptException(throwable: Throwable): Boolean {
        var current: Throwable? = throwable
        while (current != null) {
            if (current is JavascriptException) return true
            current = current.cause
        }
        return false
    }

    // ==================== DISPLAY LIFECYCLE LISTENER ====================

    private val displayListener = object : DisplayManager.DisplayListener {
        override fun onDisplayAdded(displayId: Int) {
            if (displayId == Display.DEFAULT_DISPLAY) return
            Log.d(TAG, "Display added: id=$displayId")
            if (isShowRequested && presentation == null) {
                mainHandler.postDelayed({ tryShowPresentation() }, RECOVERY_DELAY_MS)
            }
        }

        override fun onDisplayRemoved(displayId: Int) {
            if (displayId != currentDisplayId) return
            Log.d(TAG, "Display removed: id=$displayId — dismissing presentation")
            dismissPresentation()
        }

        override fun onDisplayChanged(displayId: Int) {
            if (displayId != currentDisplayId && presentation != null) return
            val displayManager = reactContext.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
                ?: return
            val display = displayManager.displays.firstOrNull { it.displayId == displayId }

            if (display == null || display.state == Display.STATE_OFF) {
                if (presentation != null) {
                    Log.d(TAG, "Display $displayId went OFF — dismissing presentation")
                    dismissPresentation()
                }
            } else if (display.state == Display.STATE_ON && isShowRequested && presentation == null) {
                Log.d(TAG, "Display $displayId came back ON — recovering presentation")
                mainHandler.postDelayed({ tryShowPresentation() }, RECOVERY_DELAY_MS)
            }
        }
    }

    private fun registerDisplayListener() {
        if (isListenerRegistered) return
        try {
            val displayManager = reactContext.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
            displayManager?.registerDisplayListener(displayListener, mainHandler)
            isListenerRegistered = true
            Log.d(TAG, "Display listener registered")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register display listener: ${e.message}")
        }
    }

    private fun unregisterDisplayListener() {
        if (!isListenerRegistered) return
        try {
            val displayManager = reactContext.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
            displayManager?.unregisterDisplayListener(displayListener)
            isListenerRegistered = false
            Log.d(TAG, "Display listener unregistered")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to unregister display listener: ${e.message}")
        }
    }

    // ==================== LIFECYCLE EVENT LISTENER ====================

    override fun onHostResume() {}
    override fun onHostPause() {}

    override fun onHostDestroy() {
        // React context is being destroyed — dismiss the Presentation proactively
        // before the React instance teardown can leave a dead surface showing.
        Log.d(TAG, "onHostDestroy — dismissing presentation proactively")
        dismissPresentation()
    }

    private fun registerLifecycleListener() {
        if (isLifecycleRegistered) return
        reactContext.addLifecycleEventListener(this)
        isLifecycleRegistered = true
    }

    private fun unregisterLifecycleListener() {
        if (!isLifecycleRegistered) return
        reactContext.removeLifecycleEventListener(this)
        isLifecycleRegistered = false
    }

    // ==================== PUBLIC API ====================

    @ReactMethod
    fun show() {
        isShowRequested = true
        registerDisplayListener()
        registerLifecycleListener()
        installExceptionGuard()
        UiThreadUtil.runOnUiThread { tryShowPresentation() }
    }

    @ReactMethod
    fun dismiss() {
        isShowRequested = false
        UiThreadUtil.runOnUiThread { dismissPresentation() }
        unregisterDisplayListener()
        unregisterLifecycleListener()
        removeExceptionGuard()
    }

    override fun invalidate() {
        super.invalidate()
        isShowRequested = false
        unregisterDisplayListener()
        unregisterLifecycleListener()
        removeExceptionGuard()
        UiThreadUtil.runOnUiThread {
            try {
                presentation?.dismiss()
                presentation = null
                currentDisplayId = -1
            } catch (e: Exception) {
                Log.e(TAG, "Error during invalidate: ${e.message}", e)
            }
        }
    }

    // ==================== INTERNAL ====================

    private fun tryShowPresentation() {
        try {
            val secondaryDisplay = findSecondaryDisplay()
            if (secondaryDisplay == null) {
                Log.d(TAG, "No secondary display found")
                return
            }

            if (presentation == null || currentDisplayId != secondaryDisplay.displayId) {
                dismissPresentation()
                val activity = reactContext.currentActivity
                if (activity == null) {
                    Log.w(TAG, "No current activity, cannot create Presentation")
                    return
                }
                val p = SecondaryDisplayPresentation(activity, secondaryDisplay)
                try {
                    p.show()
                } catch (e: WindowManager.BadTokenException) {
                    Log.w(TAG, "BadTokenException on show — display token stale, will retry on next display event")
                    try { p.dismiss() } catch (_: Exception) {}
                    return
                }
                presentation = p
                currentDisplayId = secondaryDisplay.displayId
                Log.d(TAG, "Created RN presentation on display ${secondaryDisplay.displayId}")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error showing display: ${e.message}", e)
        }
    }

    private fun dismissPresentation() {
        try {
            presentation?.dismiss()
        } catch (e: Exception) {
            Log.e(TAG, "Error dismissing presentation: ${e.message}", e)
        }
        presentation = null
        currentDisplayId = -1
    }

    // ==================== HELPERS ====================

    private fun findSecondaryDisplay(): Display? {
        val displayManager = reactContext.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
            ?: return null

        // Tier 1: Presentation category displays
        val presentationDisplays = displayManager.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION)
        val tier1 = presentationDisplays.firstOrNull { display ->
            display.displayId != Display.DEFAULT_DISPLAY &&
                display.state != Display.STATE_OFF
        }
        if (tier1 != null) return tier1

        // Tier 2: Any non-default display with state != OFF
        val allDisplays = displayManager.displays
        val tier2 = allDisplays.firstOrNull { display ->
            display.displayId != Display.DEFAULT_DISPLAY &&
                display.state != Display.STATE_OFF
        }
        if (tier2 != null) return tier2

        // Tier 2 relaxed: Any non-default display regardless of state
        return allDisplays.firstOrNull { display ->
            display.displayId != Display.DEFAULT_DISPLAY
        }
    }
}
