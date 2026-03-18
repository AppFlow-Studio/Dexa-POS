package com.temurappflowstudios.dexapos.secondarydisplay

import android.app.Presentation
import android.content.Context
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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val app = context.applicationContext as? MainApplication
        if (app == null) {
            Log.e(TAG, "Could not get MainApplication")
            return
        }

        try {
            val surface = app.reactHost.createSurface(context, RN_COMPONENT_NAME, null)
            reactSurface = surface

            val surfaceView = surface.view
            if (surfaceView != null) {
                setContentView(surfaceView)
                surface.start()
                Log.d(TAG, "ReactSurface created on display ${display.displayId}")
            } else {
                Log.e(TAG, "ReactSurface.view is null")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create ReactSurface: ${e.message}", e)
        }
    }

    override fun dismiss() {
        try {
            reactSurface?.stop()
            reactSurface?.clear()
            reactSurface = null
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping ReactSurface: ${e.message}", e)
        }
        super.dismiss()
    }
}
