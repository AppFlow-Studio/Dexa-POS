package com.temurappflowstudios.dexapos.secondarydisplay

import android.app.Presentation
import android.content.Context
import android.content.res.Configuration
import android.os.Bundle
import android.util.Log
import android.view.Display
import com.facebook.react.interfaces.fabric.ReactSurface
import com.temurappflowstudios.dexapos.MainApplication

class SecondaryDisplayPresentation(context: Context, display: Display) :
    Presentation(context, display) {

    companion object {
        const val TAG = "SecondaryDisplay"
        const val RN_COMPONENT_NAME = "CFDSecondaryDisplay"
    }

    private var reactSurface: ReactSurface? = null
    private var isDismissed = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Install a Window.Callback wrapper that catches RuntimeException
        // (including JavascriptException) during event dispatch on this
        // Presentation window. Without this, an uncaught JS error that
        // propagates through the event dispatch loop surfaces as a native
        // Android system crash dialog on the secondary display.
        window?.let { w ->
            val originalCallback = w.callback
            if (originalCallback != null) {
                w.callback = SafePresentationWindowCallback(originalCallback, this)
            }
        }

        val displayContext = context.createDisplayContext(display)
        val displayConfig = Configuration(displayContext.resources.configuration).apply {
            // Keep the CFD presentation independent from the POS tablet's
            // accessibility font scale. On some secondary displays Android
            // measures text with one scaled density and draws it with another,
            // clipping every Text node horizontally.
            fontScale = 1.0f
        }
        val reactContext = displayContext.createConfigurationContext(displayConfig)

        val app = reactContext.applicationContext as? MainApplication
        if (app == null) {
            Log.e(TAG, "Could not get MainApplication")
            return
        }

        try {
            val surface = app.reactHost.createSurface(reactContext, RN_COMPONENT_NAME, null)
            reactSurface = surface

            val surfaceView = surface.view
            if (surfaceView != null) {
                surfaceView.setBackgroundColor(android.graphics.Color.parseColor("#0a0a0a"))
                setContentView(surfaceView)
                surface.start()
                Log.d(TAG, "ReactSurface created on display ${display.displayId}")
            } else {
                Log.e(TAG, "ReactSurface.view is null")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create ReactSurface: ${e.message}", e)
            // Silently dismiss instead of leaving a dead Presentation window
            try { dismiss() } catch (_: Exception) {}
        }
    }

    override fun dismiss() {
        if (isDismissed) return
        isDismissed = true
        try {
            reactSurface?.stop()
            reactSurface?.clear()
            reactSurface = null
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping ReactSurface: ${e.message}", e)
        }
        try {
            super.dismiss()
        } catch (e: Exception) {
            // Catches IllegalArgumentException from WindowManager if the
            // Presentation's window token is already invalid.
            Log.e(TAG, "Error dismissing Presentation: ${e.message}", e)
        }
    }
}
