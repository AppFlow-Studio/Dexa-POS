package com.temurappflowstudios.dexapos.atom

import android.content.Intent
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.URI
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSession
import javax.net.ssl.X509TrustManager

/**
 * Native HTTP bridge for the on-device LandiGlobal ATOM payment app.
 *
 * The ATOM app serves its REST API over HTTPS on loopback (https://127.0.0.1:8443)
 * with a SELF-SIGNED cert (CN=localhost, no SubjectAltName). React Native's default
 * OkHttp client rejects it on both trust AND hostname verification. Rather than
 * weaken the app-wide network security config, ALL ATOM traffic goes through this
 * module's dedicated OkHttpClient that:
 *   - trusts any cert, and
 *   - skips hostname verification,
 * but ONLY for loopback hosts (127.0.0.1 / ::1 / localhost). Any non-loopback URL
 * is rejected outright, so this insecure client can never touch a remote host.
 *
 * Also exposes bringToForeground(): after a transaction the ATOM app relinquishes
 * the foreground WITHOUT relaunching the POS (per the ATOM integration spec), so
 * the POS must re-foreground itself.
 */
class AtomBridgeModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val TAG = "AtomBridge"
        const val NAME = "AtomBridgeModule"

        private val LOOPBACK_HOSTS = setOf("127.0.0.1", "::1", "0:0:0:0:0:0:0:1", "localhost")

        /** Trust-all X509 manager. Scoped to loopback-only use by the host gate below. */
        private val TRUST_ALL: X509TrustManager = object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
            override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
            override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
        }

        /** Verifier that accepts loopback hostnames only (the client is loopback-gated anyway). */
        private val LOOPBACK_VERIFIER = HostnameVerifier { hostname, _: SSLSession ->
            LOOPBACK_HOSTS.contains(hostname)
        }
    }

    override fun getName(): String = NAME

    private fun isLoopback(host: String?): Boolean =
        host != null && LOOPBACK_HOSTS.contains(host)

    /** Build a loopback-only insecure OkHttpClient with per-request timeouts. */
    private fun buildClient(timeoutMs: Int): OkHttpClient {
        val sslContext = SSLContext.getInstance("TLS")
        sslContext.init(null, arrayOf(TRUST_ALL), SecureRandom())
        return OkHttpClient.Builder()
            .sslSocketFactory(sslContext.socketFactory, TRUST_ALL)
            .hostnameVerifier(LOOPBACK_VERIFIER)
            .connectTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
            .readTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
            .writeTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
            .retryOnConnectionFailure(false)
            .build()
    }

    /**
     * Perform a loopback HTTPS request.
     *
     * Resolves { status: Int, body: String, networkError: Boolean }.
     *   - status is the HTTP status (200/400/500…).
     *   - status 0 + networkError=true means the request never got a response
     *     (connection refused, timeout, abort) — the caller treats this as
     *     INDETERMINATE, not a clean decline.
     * Rejects only for programmer errors (non-loopback host / bad method).
     */
    @ReactMethod
    fun request(method: String, url: String, body: String?, timeoutMs: Int, promise: Promise) {
        val host = try {
            URI(url).host
        } catch (e: Exception) {
            promise.reject("BAD_URL", "Invalid URL: ${e.message}")
            return
        }
        if (!isLoopback(host)) {
            promise.reject("NON_LOOPBACK", "AtomBridge only permits loopback hosts, got: $host")
            return
        }

        try {
            val client = buildClient(timeoutMs)
            val builder = Request.Builder().url(url)
            when (method.uppercase()) {
                "GET" -> builder.get()
                "POST" -> {
                    val mediaType = "application/json; charset=utf-8".toMediaTypeOrNull()
                    builder.post((body ?: "").toRequestBody(mediaType))
                }
                else -> {
                    promise.reject("BAD_METHOD", "Unsupported method: $method")
                    return
                }
            }

            client.newCall(builder.build()).execute().use { response ->
                val respBody = response.body?.string() ?: ""
                val result = Arguments.createMap().apply {
                    putInt("status", response.code)
                    putString("body", respBody)
                    putBoolean("networkError", false)
                }
                promise.resolve(result)
            }
        } catch (e: Exception) {
            // Network/TLS/timeout/abort — no HTTP response was obtained.
            Log.w(TAG, "ATOM request failed ($method $url): ${e.message}")
            val result = Arguments.createMap().apply {
                putInt("status", 0)
                putString("body", "")
                putBoolean("networkError", true)
                putString("error", e.message ?: "network error")
            }
            promise.resolve(result)
        }
    }

    /**
     * Bring the POS main activity back to the foreground. Called after an ATOM
     * transaction completes, because ATOM foregrounds itself for the card read
     * and does NOT relaunch the POS afterward.
     */
    @ReactMethod
    fun bringToForeground(promise: Promise) {
        try {
            val launch = reactContext.packageManager
                .getLaunchIntentForPackage(reactContext.packageName)
            if (launch == null) {
                promise.reject("NO_LAUNCH_INTENT", "No launch intent for ${reactContext.packageName}")
                return
            }
            launch.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            )
            val activity = reactContext.currentActivity
            if (activity != null) {
                activity.startActivity(launch)
            } else {
                reactContext.startActivity(launch)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "bringToForeground failed: ${e.message}")
            promise.reject("FOREGROUND_FAILED", e.message, e)
        }
    }
}
