package com.temurappflowstudios.dexapos.nsd

import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class NsdDiscoveryModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "NsdDiscovery"
        private const val SERVICE_TYPE = "_dexapos-cfd._tcp."
    }

    override fun getName(): String = "NsdDiscovery"

    private var nsdManager: NsdManager? = null
    private var discoveryListener: NsdManager.DiscoveryListener? = null
    private var isDiscovering = false
    private var listenerCount = 0

    @ReactMethod
    fun addListener(eventName: String) {
        listenerCount++
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        listenerCount -= count
    }

    private fun sendEvent(eventName: String, params: com.facebook.react.bridge.WritableMap) {
        if (listenerCount > 0) {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }

    @ReactMethod
    fun startDiscovery(promise: Promise) {
        try {
            if (isDiscovering) {
                promise.resolve(true)
                return
            }

            nsdManager = reactApplicationContext.getSystemService(
                android.content.Context.NSD_SERVICE
            ) as NsdManager

            discoveryListener = object : NsdManager.DiscoveryListener {
                override fun onDiscoveryStarted(serviceType: String) {
                    Log.d(TAG, "Discovery started")
                    isDiscovering = true
                }

                override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                    Log.d(TAG, "Service found: ${serviceInfo.serviceName}")
                    // Resolve to get full details (IP, port, TXT records)
                    nsdManager?.resolveService(serviceInfo, object : NsdManager.ResolveListener {
                        override fun onResolveFailed(info: NsdServiceInfo, errorCode: Int) {
                            Log.e(TAG, "Resolve failed: $errorCode")
                        }

                        override fun onServiceResolved(info: NsdServiceInfo) {
                            Log.d(TAG, "Service resolved: ${info.host?.hostAddress}:${info.port}")
                            val params = Arguments.createMap().apply {
                                putString("serviceName", info.serviceName)
                                putString("ip", info.host?.hostAddress ?: "")
                                putInt("port", info.port)

                                // Extract TXT records
                                val attrs = info.attributes
                                putString("stationId", String(attrs["stationId"] ?: ByteArray(0)))
                                putString("stationName", String(attrs["stationName"] ?: ByteArray(0)))
                                putString("locationId", String(attrs["locationId"] ?: ByteArray(0)))
                                putString("locationName", String(attrs["locationName"] ?: ByteArray(0)))
                            }
                            sendEvent("onServiceFound", params)
                        }
                    })
                }

                override fun onServiceLost(serviceInfo: NsdServiceInfo) {
                    Log.d(TAG, "Service lost: ${serviceInfo.serviceName}")
                    val params = Arguments.createMap().apply {
                        putString("serviceName", serviceInfo.serviceName)
                    }
                    sendEvent("onServiceLost", params)
                }

                override fun onDiscoveryStopped(serviceType: String) {
                    Log.d(TAG, "Discovery stopped")
                    isDiscovering = false
                }

                override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                    Log.e(TAG, "Start discovery failed: $errorCode")
                    isDiscovering = false
                }

                override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
                    Log.e(TAG, "Stop discovery failed: $errorCode")
                }
            }

            nsdManager?.discoverServices(
                SERVICE_TYPE,
                NsdManager.PROTOCOL_DNS_SD,
                discoveryListener
            )

            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error starting discovery", e)
            promise.reject("NSD_ERROR", e.message)
        }
    }

    @ReactMethod
    fun stopDiscovery(promise: Promise) {
        try {
            stopDiscoveryInternal()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("NSD_ERROR", e.message)
        }
    }

    private fun stopDiscoveryInternal() {
        if (isDiscovering && discoveryListener != null) {
            try {
                nsdManager?.stopServiceDiscovery(discoveryListener)
            } catch (e: Exception) {
                Log.e(TAG, "Error stopping discovery", e)
            }
            isDiscovering = false
        }
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        stopDiscoveryInternal()
    }
}
