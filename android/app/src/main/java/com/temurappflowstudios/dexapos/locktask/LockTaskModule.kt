package com.temurappflowstudios.dexapos.locktask

import android.app.ActivityManager
import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class LockTaskModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "LockTaskModule"

    @ReactMethod
    fun enterLockTask(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No current activity is available")
            return
        }

        activity.runOnUiThread {
            try {
                activity.startLockTask()
                promise.resolve(true)
            } catch (error: Exception) {
                promise.reject("LOCK_TASK_ENTER_FAILED", error.message, error)
            }
        }
    }

    @ReactMethod
    fun exitLockTask(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No current activity is available")
            return
        }

        activity.runOnUiThread {
            try {
                activity.stopLockTask()
                promise.resolve(true)
            } catch (error: Exception) {
                promise.reject("LOCK_TASK_EXIT_FAILED", error.message, error)
            }
        }
    }

    @ReactMethod
    fun isLockTaskActive(promise: Promise) {
        val activityManager =
            reactContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val mode = activityManager.lockTaskModeState
        promise.resolve(mode != ActivityManager.LOCK_TASK_MODE_NONE)
    }
}
