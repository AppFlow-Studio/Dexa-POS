package com.temurappflowstudios.dexapos.secondarydisplay

import android.content.Context
import android.hardware.display.DisplayManager
import android.util.Log
import android.view.Display
import com.facebook.react.bridge.*
import com.facebook.react.bridge.UiThreadUtil

/**
 * Native module for managing the secondary display Presentation.
 *
 * Only handles lifecycle (show/dismiss). All display data flows through
 * shared Zustand stores in the same JS runtime — no native bridge needed.
 */
class SecondaryDisplayModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val TAG = "SecondaryDisplay"
        const val NAME = "SecondaryDisplayModule"
    }

    override fun getName(): String = NAME

    private var presentation: SecondaryDisplayPresentation? = null
    private var currentDisplayId: Int = -1

    @ReactMethod
    fun show() {
        UiThreadUtil.runOnUiThread {
            try {
                val secondaryDisplay = findSecondaryDisplay()
                if (secondaryDisplay == null) {
                    Log.d(TAG, "No secondary display found")
                    return@runOnUiThread
                }

                if (presentation == null || currentDisplayId != secondaryDisplay.displayId) {
                    presentation?.dismiss()
                    val activity = currentActivity
                    if (activity == null) {
                        Log.w(TAG, "No current activity, cannot create Presentation")
                        return@runOnUiThread
                    }
                    presentation = SecondaryDisplayPresentation(activity, secondaryDisplay)
                    presentation?.show()
                    currentDisplayId = secondaryDisplay.displayId
                    Log.d(TAG, "Created RN presentation on display ${secondaryDisplay.displayId}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error showing display: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun dismiss() {
        UiThreadUtil.runOnUiThread {
            try {
                presentation?.dismiss()
                presentation = null
                currentDisplayId = -1
                Log.d(TAG, "Presentation dismissed")
            } catch (e: Exception) {
                Log.e(TAG, "Error dismissing presentation: ${e.message}", e)
            }
        }
    }

    override fun invalidate() {
        super.invalidate()
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
