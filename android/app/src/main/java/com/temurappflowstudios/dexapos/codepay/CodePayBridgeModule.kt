package com.temurappflowstudios.dexapos.codepay

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap

/**
 * Native bridge for the on-terminal CodePay Register app.
 *
 * When Dexa-POS runs ON a CodePay terminal, payments are driven app-to-app: we
 * fire an Intent (action `com.codepay.transaction.call`) via
 * startActivityForResult, CodePay Register runs the card, and the result comes
 * back through onActivityResult. This module owns that round trip and hands the
 * result to JS as a single resolved object.
 *
 * We implement ActivityEventListener and register with the ReactContext so the
 * result is delivered WITHOUT touching MainActivity — ReactActivityDelegate
 * forwards onActivityResult to all registered listeners in both the old and new
 * architecture.
 *
 * Concurrency: only ONE transaction may be in flight at a time (the JS service
 * also serializes with a mutex). A second transact() while one is pending is
 * rejected with BUSY. The promise is resolved exactly once — by onActivityResult
 * OR by the watchdog timeout, whichever fires first.
 */
class CodePayBridgeModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    companion object {
        const val TAG = "CodePayBridge"
        const val NAME = "CodePayBridgeModule"

        /** 16-bit request code (startActivityForResult caps at 0xFFFF on Activity). */
        const val REQUEST_CODE = 0xC0DE // 49374

        const val ACTION = "com.codepay.transaction.call"
        const val EXTRA_VERSION = "version"
        const val EXTRA_APP_ID = "app_id"
        const val EXTRA_TOPIC = "topic"
        const val EXTRA_BIZ_DATA = "biz_data"
        const val EXTRA_RESPONSE_CODE = "response_code"
        const val EXTRA_RESPONSE_MSG = "response_msg"
    }

    private val lock = Object()
    private var pendingPromise: Promise? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private var timeoutRunnable: Runnable? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = NAME

    override fun invalidate() {
        super.invalidate()
        reactContext.removeActivityEventListener(this)
    }

    /**
     * Launch a CodePay Register transaction and resolve with its result.
     *
     * Resolves { resultCode, responseCode, responseMsg, bizData, timedOut,
     * canceled } — never rejects for a transaction outcome. Rejects only for
     * programmer/environment errors: NO_ACTIVITY, BUSY, NO_CODEPAY_REGISTER.
     *
     * A watchdog rejects the wait after `timeoutMs` by resolving with
     * timedOut=true (the caller treats that as INDETERMINATE, not a decline —
     * the card may have been charged).
     */
    @ReactMethod
    fun transact(
        topic: String,
        appId: String,
        bizDataJson: String,
        timeoutMs: Int,
        promise: Promise,
    ) {
        val activity: Activity? = currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No foreground activity to launch CodePay Register")
            return
        }

        synchronized(lock) {
            if (pendingPromise != null) {
                promise.reject("BUSY", "A CodePay transaction is already in progress")
                return
            }

            val intent = Intent(ACTION).apply {
                putExtra(EXTRA_VERSION, "2.0")
                putExtra(EXTRA_APP_ID, appId)
                putExtra(EXTRA_TOPIC, topic)
                putExtra(EXTRA_BIZ_DATA, bizDataJson)
            }

            // Fail fast if CodePay Register isn't installed / doesn't handle the
            // action, rather than crashing on startActivityForResult.
            if (intent.resolveActivity(activity.packageManager) == null) {
                promise.reject(
                    "NO_CODEPAY_REGISTER",
                    "No app handles $ACTION — is CodePay Register installed on this terminal?",
                )
                return
            }

            pendingPromise = promise
            scheduleTimeout(timeoutMs)

            try {
                activity.startActivityForResult(intent, REQUEST_CODE)
            } catch (e: ActivityNotFoundException) {
                clearTimeout()
                pendingPromise = null
                promise.reject("NO_CODEPAY_REGISTER", "CodePay Register not found: ${e.message}")
            } catch (e: Exception) {
                clearTimeout()
                pendingPromise = null
                promise.reject("LAUNCH_FAILED", e.message ?: "Failed to launch CodePay Register", e)
            }
        }
    }

    /**
     * Non-intrusive health check: does an installed app handle the CodePay
     * transaction action? Resolves true/false WITHOUT launching anything, so it
     * is safe to call from the background health-check tick (no foregrounding of
     * CodePay Register, no card screen). Never rejects.
     */
    @ReactMethod
    fun isRegisterAvailable(promise: Promise) {
        try {
            val intent = Intent(ACTION)
            val resolved = intent.resolveActivity(reactContext.packageManager) != null
            promise.resolve(resolved)
        } catch (e: Exception) {
            Log.w(TAG, "isRegisterAvailable failed: ${e.message}")
            promise.resolve(false)
        }
    }

    /**
     * Best-effort read of the terminal's hardware serial, for a stable per-device
     * identity when auto-provisioning a payment_terminals row. Uses
     * Build.getSerial() (API 26+, needs a privileged/OEM permission) with a
     * Build.SERIAL fallback on older platforms.
     *
     * Resolves null — NEVER rejects — when the serial is unavailable or the app
     * lacks the privilege (a non-system app on most ROMs throws SecurityException).
     * The JS side then falls back to a non-privileged device id (ANDROID_ID), so
     * provisioning still works. Safe to call from any thread; touches no I/O.
     */
    @ReactMethod
    fun getDeviceSerial(promise: Promise) {
        try {
            val serial = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Build.getSerial()
            } else {
                @Suppress("DEPRECATION")
                Build.SERIAL
            }
            if (serial.isNullOrBlank() || serial == Build.UNKNOWN) {
                promise.resolve(null)
            } else {
                promise.resolve(serial)
            }
        } catch (e: SecurityException) {
            Log.w(TAG, "getDeviceSerial denied (no privileged serial permission): ${e.message}")
            promise.resolve(null)
        } catch (e: Exception) {
            Log.w(TAG, "getDeviceSerial failed: ${e.message}")
            promise.resolve(null)
        }
    }

    // ── ActivityEventListener ──

    override fun onActivityResult(
        activity: Activity?,
        requestCode: Int,
        resultCode: Int,
        data: Intent?,
    ) {
        if (requestCode != REQUEST_CODE) return

        val promise: Promise
        synchronized(lock) {
            clearTimeout()
            val p = pendingPromise ?: return
            pendingPromise = null
            promise = p
        }

        val responseCode = data?.getStringExtra(EXTRA_RESPONSE_CODE)
        val responseMsg = data?.getStringExtra(EXTRA_RESPONSE_MSG)
        val bizData = data?.getStringExtra(EXTRA_BIZ_DATA)
        val canceled = resultCode == Activity.RESULT_CANCELED

        Log.d(
            TAG,
            "onActivityResult resultCode=$resultCode responseCode=$responseCode canceled=$canceled",
        )

        val result = buildResult(
            resultCode = resultCode,
            responseCode = responseCode,
            responseMsg = responseMsg,
            bizData = bizData,
            timedOut = false,
            canceled = canceled,
        )
        promise.resolve(result)
    }

    override fun onNewIntent(intent: Intent?) {
        // Not used — CodePay returns results via onActivityResult.
    }

    // ── Watchdog ──

    private fun scheduleTimeout(timeoutMs: Int) {
        val runnable = Runnable {
            val promise: Promise
            synchronized(lock) {
                val p = pendingPromise ?: return@Runnable
                pendingPromise = null
                promise = p
                timeoutRunnable = null
            }
            Log.w(TAG, "CodePay transaction timed out after ${timeoutMs}ms")
            promise.resolve(
                buildResult(
                    resultCode = 0,
                    responseCode = null,
                    responseMsg = "timeout",
                    bizData = null,
                    timedOut = true,
                    canceled = false,
                ),
            )
        }
        timeoutRunnable = runnable
        mainHandler.postDelayed(runnable, timeoutMs.toLong())
    }

    private fun clearTimeout() {
        timeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        timeoutRunnable = null
    }

    private fun buildResult(
        resultCode: Int,
        responseCode: String?,
        responseMsg: String?,
        bizData: String?,
        timedOut: Boolean,
        canceled: Boolean,
    ): WritableMap = Arguments.createMap().apply {
        putInt("resultCode", resultCode)
        if (responseCode != null) putString("responseCode", responseCode) else putNull("responseCode")
        if (responseMsg != null) putString("responseMsg", responseMsg) else putNull("responseMsg")
        if (bizData != null) putString("bizData", bizData) else putNull("bizData")
        putBoolean("timedOut", timedOut)
        putBoolean("canceled", canceled)
    }
}
