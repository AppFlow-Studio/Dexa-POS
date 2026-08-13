package com.temurappflowstudios.dexapos.printer

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.*
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Generic ESC/POS USB printer transport (bulk-transfer). Bytes are rendered on
 * the JS side (EscPosRenderer/EscPosBuilder) and shipped here base64-encoded;
 * this module just moves them to the printer's bulk OUT endpoint.
 *
 * Covers USB printer-class (class 7) and vendor-class devices that expose a bulk
 * OUT endpoint (Epson/Star/Bixolon/Citizen/most 80mm "POS-80" units). USB-serial
 * printers (CH340/Prolific/FTDI) are NOT handled here — that's a separate path.
 *
 * Permission mirrors CastlesUsbModule: PendingIntent + ACTION_USB_PERMISSION
 * receiver, FLAG_MUTABLE on API 31+, RECEIVER_NOT_EXPORTED on API 33+. Known
 * printer vendors listed in res/xml/device_filter.xml get a persistent grant on
 * attach, so requestPermission is usually a no-op there.
 */
class UsbPrinterModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val TAG = "UsbPrinter"
        const val NAME = "UsbPrinterModule"
        const val ACTION_USB_PERMISSION = "com.temurappflowstudios.dexapos.USB_PRINTER_PERMISSION"
        const val CHUNK_SIZE = 16384
        const val WRITE_TIMEOUT_MS = 5000
    }

    override fun getName(): String = NAME

    // bulkTransfer blocks — keep all USB IO off the RN bridge queue.
    private val ioExecutor: ExecutorService =
        Executors.newSingleThreadExecutor { r -> Thread(r, "UsbPrinter-IO").apply { isDaemon = true } }

    private val usbManager: UsbManager
        get() = reactContext.getSystemService(Context.USB_SERVICE) as UsbManager

    @Volatile private var permissionPromise: Promise? = null
    private var receiverRegistered = false

    private val permissionReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            if (intent.action == ACTION_USB_PERMISSION) {
                val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                val p = permissionPromise
                permissionPromise = null
                p?.resolve(granted)
            }
        }
    }

    init {
        registerPermissionReceiver()
    }

    private fun registerPermissionReceiver() {
        if (receiverRegistered) return
        try {
            val filter = IntentFilter(ACTION_USB_PERMISSION)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                reactContext.registerReceiver(permissionReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                reactContext.registerReceiver(permissionReceiver, filter)
            }
            receiverRegistered = true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register permission receiver: ${e.message}")
        }
    }

    override fun invalidate() {
        super.invalidate()
        if (receiverRegistered) {
            try { reactContext.unregisterReceiver(permissionReceiver) } catch (_: Exception) {}
            receiverRegistered = false
        }
    }

    private fun findDevice(vendorId: Int, productId: Int): UsbDevice? {
        return usbManager.deviceList.values.firstOrNull {
            it.vendorId == vendorId && it.productId == productId
        }
    }

    /** First bulk-OUT endpoint, preferring a printer-class (7) interface. */
    private fun findBulkOut(device: UsbDevice): Pair<UsbInterface, UsbEndpoint>? {
        var fallback: Pair<UsbInterface, UsbEndpoint>? = null
        for (i in 0 until device.interfaceCount) {
            val iface = device.getInterface(i)
            for (e in 0 until iface.endpointCount) {
                val ep = iface.getEndpoint(e)
                if (ep.direction == UsbConstants.USB_DIR_OUT &&
                    ep.type == UsbConstants.USB_ENDPOINT_XFER_BULK
                ) {
                    if (iface.interfaceClass == UsbConstants.USB_CLASS_PRINTER) return Pair(iface, ep)
                    if (fallback == null) fallback = Pair(iface, ep)
                }
            }
        }
        return fallback
    }

    @ReactMethod
    fun hasPermission(vendorId: Int, productId: Int, promise: Promise) {
        try {
            val device = findDevice(vendorId, productId)
            promise.resolve(device != null && usbManager.hasPermission(device))
        } catch (e: Exception) {
            promise.reject("ERR", e.message, e)
        }
    }

    @ReactMethod
    fun requestPermission(vendorId: Int, productId: Int, promise: Promise) {
        try {
            val device = findDevice(vendorId, productId)
            if (device == null) {
                promise.reject("ERR_DEVICE_NOT_FOUND", "No USB device $vendorId:$productId", null)
                return
            }
            if (usbManager.hasPermission(device)) {
                promise.resolve(true)
                return
            }
            if (permissionPromise != null) {
                promise.reject("ERR_BUSY", "A permission request is already pending", null)
                return
            }
            registerPermissionReceiver()
            permissionPromise = promise
            // Explicit (packaged) intent so the NOT_EXPORTED receiver is reached on API 34+.
            val intent = Intent(ACTION_USB_PERMISSION).setPackage(reactContext.packageName)
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            } else {
                PendingIntent.FLAG_UPDATE_CURRENT
            }
            val pending = PendingIntent.getBroadcast(reactContext, 0, intent, flags)
            usbManager.requestPermission(device, pending)
        } catch (e: Exception) {
            permissionPromise = null
            promise.reject("ERR", e.message, e)
        }
    }

    @ReactMethod
    fun printBytes(vendorId: Int, productId: Int, base64: String, promise: Promise) {
        ioExecutor.submit {
            var connection: UsbDeviceConnection? = null
            var claimed: UsbInterface? = null
            try {
                val device = findDevice(vendorId, productId)
                    ?: throw Exception("Printer not connected ($vendorId:$productId)")
                if (!usbManager.hasPermission(device)) throw Exception("NO_PERMISSION")

                val target = findBulkOut(device) ?: throw Exception("No bulk OUT endpoint on printer")
                val iface = target.first
                val endpoint = target.second

                connection = usbManager.openDevice(device)
                    ?: throw Exception("openDevice failed (permission revoked?)")
                if (!connection.claimInterface(iface, true)) throw Exception("claimInterface failed")
                claimed = iface

                val data = Base64.decode(base64, Base64.DEFAULT)
                var offset = 0
                while (offset < data.size) {
                    val len = minOf(CHUNK_SIZE, data.size - offset)
                    val chunk = if (offset == 0 && len == data.size) data
                        else data.copyOfRange(offset, offset + len)
                    val sent = connection.bulkTransfer(endpoint, chunk, len, WRITE_TIMEOUT_MS)
                    if (sent < 0) throw Exception("bulkTransfer failed at offset $offset")
                    offset += if (sent > 0) sent else len
                }
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "printBytes failed: ${e.message}")
                val code = if (e.message == "NO_PERMISSION") "NO_PERMISSION" else "ERR_PRINT"
                promise.reject(code, e.message, e)
            } finally {
                try { if (claimed != null) connection?.releaseInterface(claimed) } catch (_: Exception) {}
                try { connection?.close() } catch (_: Exception) {}
            }
        }
    }

    @ReactMethod
    fun getStatus(vendorId: Int, productId: Int, promise: Promise) {
        ioExecutor.submit {
            try {
                val map = Arguments.createMap()
                val device = findDevice(vendorId, productId)
                when {
                    device == null -> {
                        map.putBoolean("isOnline", false)
                        map.putBoolean("hasPaper", false)
                        map.putBoolean("coverOpen", false)
                        map.putString("errorMessage", "Printer not connected")
                    }
                    !usbManager.hasPermission(device) -> {
                        map.putBoolean("isOnline", false)
                        map.putBoolean("hasPaper", false)
                        map.putBoolean("coverOpen", false)
                        map.putString("errorMessage", "USB permission not granted")
                    }
                    else -> {
                        // v1: presence + permission ⇒ online. Paper/cover not probed.
                        map.putBoolean("isOnline", true)
                        map.putBoolean("hasPaper", true)
                        map.putBoolean("coverOpen", false)
                        map.putString("errorMessage", null)
                    }
                }
                promise.resolve(map)
            } catch (e: Exception) {
                promise.reject("ERR", e.message, e)
            }
        }
    }
}
