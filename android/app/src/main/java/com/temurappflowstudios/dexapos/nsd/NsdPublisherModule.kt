package com.temurappflowstudios.dexapos.nsd

import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class NsdPublisherModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "NsdPublisher"
        private const val SERVICE_TYPE = "_dexapos-cfd._tcp."
    }

    override fun getName(): String = "NsdPublisher"

    private var nsdManager: NsdManager? = null
    private var registrationListener: NsdManager.RegistrationListener? = null
    private var isRegistered = false

    @ReactMethod
    fun register(port: Int, metadata: ReadableMap, promise: Promise) {
        try {
            // Unregister first if already registered
            if (isRegistered) {
                unregisterInternal()
            }

            val serviceInfo = NsdServiceInfo().apply {
                serviceName = metadata.getString("stationName") ?: "Dexa POS"
                serviceType = SERVICE_TYPE
                setPort(port)

                // Add TXT records
                if (metadata.hasKey("stationId")) {
                    setAttribute("stationId", metadata.getString("stationId"))
                }
                if (metadata.hasKey("stationName")) {
                    setAttribute("stationName", metadata.getString("stationName"))
                }
                if (metadata.hasKey("locationId")) {
                    setAttribute("locationId", metadata.getString("locationId"))
                }
                if (metadata.hasKey("locationName")) {
                    setAttribute("locationName", metadata.getString("locationName"))
                }
                setAttribute("port", port.toString())
            }

            nsdManager = reactApplicationContext.getSystemService(
                android.content.Context.NSD_SERVICE
            ) as NsdManager

            registrationListener = object : NsdManager.RegistrationListener {
                override fun onServiceRegistered(info: NsdServiceInfo) {
                    Log.d(TAG, "Service registered: ${info.serviceName}")
                    isRegistered = true
                    promise.resolve(true)
                }

                override fun onRegistrationFailed(info: NsdServiceInfo, errorCode: Int) {
                    Log.e(TAG, "Registration failed: $errorCode")
                    isRegistered = false
                    promise.reject("NSD_REGISTER_FAILED", "Registration failed with error: $errorCode")
                }

                override fun onServiceUnregistered(info: NsdServiceInfo) {
                    Log.d(TAG, "Service unregistered: ${info.serviceName}")
                    isRegistered = false
                }

                override fun onUnregistrationFailed(info: NsdServiceInfo, errorCode: Int) {
                    Log.e(TAG, "Unregistration failed: $errorCode")
                }
            }

            nsdManager?.registerService(
                serviceInfo,
                NsdManager.PROTOCOL_DNS_SD,
                registrationListener
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error registering service", e)
            promise.reject("NSD_ERROR", e.message)
        }
    }

    @ReactMethod
    fun unregister(promise: Promise) {
        try {
            unregisterInternal()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("NSD_ERROR", e.message)
        }
    }

    private fun unregisterInternal() {
        if (isRegistered && registrationListener != null) {
            try {
                nsdManager?.unregisterService(registrationListener)
            } catch (e: Exception) {
                Log.e(TAG, "Error unregistering service", e)
            }
            isRegistered = false
        }
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        unregisterInternal()
    }
}
