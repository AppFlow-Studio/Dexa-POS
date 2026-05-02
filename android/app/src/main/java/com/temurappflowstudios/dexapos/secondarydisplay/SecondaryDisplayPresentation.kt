package com.temurappflowstudios.dexapos.secondarydisplay

import android.app.Presentation
import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Display
import com.facebook.react.ReactRootView
import com.temurappflowstudios.dexapos.MainApplication

class SecondaryDisplayPresentation(context: Context, display: Display) :
    Presentation(context, display) {

    companion object {
        const val TAG = "SecondaryDisplay"
        const val RN_COMPONENT_NAME = "CFDSecondaryDisplay"
    }

    private var reactRootView: ReactRootView? = null
    private var isDismissed = false
    private val mainHandler = Handler(Looper.getMainLooper())

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

        val app = context.applicationContext as? MainApplication
        if (app == null) {
            Log.e(TAG, "Could not get MainApplication")
            return
        }

        try {
            val rootView = ReactRootView(this.context)
            rootView.setBackgroundColor(android.graphics.Color.parseColor("#0a0a0a"))
            reactRootView = rootView

            setContentView(rootView)
            Log.d(TAG, "ReactRootView attached on display ${display.displayId}")

            rootView.startReactApplication(
                app.reactNativeHost.reactInstanceManager,
                RN_COMPONENT_NAME,
                Bundle()
            )
            Log.d(TAG, "startReactApplication($RN_COMPONENT_NAME) called on display ${display.displayId}")

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
            reactRootView?.unmountReactApplication()
            reactRootView = null
        } catch (e: Exception) {
            Log.e(TAG, "Error unmounting ReactRootView: ${e.message}", e)
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
