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
 */
class SecondaryDisplayModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

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
    private val mainHandler = Handler(Looper.getMainLooper())

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

    // ==================== PUBLIC API ====================

    @ReactMethod
    fun show() {
        isShowRequested = true
        registerDisplayListener()
        UiThreadUtil.runOnUiThread { tryShowPresentation() }
    }

    @ReactMethod
    fun dismiss() {
        isShowRequested = false
        UiThreadUtil.runOnUiThread { dismissPresentation() }
        unregisterDisplayListener()
    }

    override fun invalidate() {
        super.invalidate()
        isShowRequested = false
        unregisterDisplayListener()
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
                val activity = currentActivity
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
