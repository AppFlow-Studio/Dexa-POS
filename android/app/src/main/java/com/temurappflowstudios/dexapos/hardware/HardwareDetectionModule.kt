package com.temurappflowstudios.dexapos.hardware

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.display.DisplayManager
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.DisplayMetrics
import android.util.Log
import android.view.Display
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File

class HardwareDetectionModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val TAG = "HardwareDetection"
        const val NAME = "HardwareDetectionModule"

        // Known POS printer vendor IDs (many don't report USB_CLASS_PRINTER)
        val PRINTER_VENDOR_IDS = listOf(
            0x0519, // Star Micronics
            0x04b8, // Epson
            0x154f, // Bixolon
            0x0fe6, // IMin
            0x28e9  // GoDEX
        )

        // Known barcode scanner vendor IDs
        val SCANNER_VENDOR_IDS = listOf(
            0x0C2E, // Honeywell
            0x05E0, // Zebra/Symbol
            0x05F9  // Datalogic
        )
    }

    override fun getName(): String = NAME

    // ==================== DATA CLASSES ====================

    private data class DisplayInfo(val width: Int, val height: Int, val displayId: Int)

    // ==================== USB HOTPLUG EVENTS ====================

    private val usbReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            Log.d(TAG, "USB event: ${intent.action}")
            try {
                val result = detectHardwareSync()
                sendEvent("onHardwareChanged", result)
            } catch (e: Exception) {
                Log.e(TAG, "Error handling USB event: ${e.message}")
            }
        }
    }

    private var isReceiverRegistered = false

    init {
        registerUsbReceiver()
    }

    private fun registerUsbReceiver() {
        try {
            val filter = IntentFilter().apply {
                addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
                addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
            }
            reactContext.registerReceiver(usbReceiver, filter)
            isReceiverRegistered = true
            Log.d(TAG, "USB receiver registered")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register USB receiver: ${e.message}")
        }
    }

    override fun invalidate() {
        super.invalidate()
        if (isReceiverRegistered) {
            try {
                reactContext.unregisterReceiver(usbReceiver)
                isReceiverRegistered = false
                Log.d(TAG, "USB receiver unregistered")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to unregister USB receiver: ${e.message}")
            }
        }
    }

    // ==================== MAIN DETECTION ====================

    @ReactMethod
    fun detectHardware(promise: Promise) {
        try {
            val result = detectHardwareSync()
            promise.resolve(result)
        } catch (e: SecurityException) {
            Log.e(TAG, "Permission denied: ${e.message}")
            promise.reject("PERMISSION_DENIED", "Hardware detection requires permission", e)
        } catch (e: Exception) {
            Log.e(TAG, "Detection failed: ${e.message}")
            promise.reject("DETECTION_FAILED", e.message, e)
        }
    }

    private fun detectHardwareSync(): WritableMap {
        val result = Arguments.createMap()
        val usbManager = reactContext.getSystemService(Context.USB_SERVICE) as? UsbManager
        val displayManager = reactContext.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager

        // Secondary display detection
        try {
            val displayInfo = if (displayManager != null) detectSecondaryDisplay(displayManager) else null
            result.putBoolean("hasSecondaryDisplay", displayInfo != null)
            result.putInt("secondaryDisplayWidth", displayInfo?.width ?: 0)
            result.putInt("secondaryDisplayHeight", displayInfo?.height ?: 0)
        } catch (e: Exception) {
            Log.e(TAG, "Display detection error: ${e.message}")
            result.putBoolean("hasSecondaryDisplay", false)
            result.putInt("secondaryDisplayWidth", 0)
            result.putInt("secondaryDisplayHeight", 0)
        }

        // NFC detection
        try {
            val hasNfc = reactContext.packageManager
                .hasSystemFeature(android.content.pm.PackageManager.FEATURE_NFC)
            result.putBoolean("hasNfc", hasNfc)
        } catch (e: Exception) {
            Log.e(TAG, "NFC detection error: ${e.message}")
            result.putBoolean("hasNfc", false)
        }

        // USB host detection
        try {
            val hasUsbHost = reactContext.packageManager
                .hasSystemFeature(android.content.pm.PackageManager.FEATURE_USB_HOST)
            result.putBoolean("hasUsbHost", hasUsbHost)
        } catch (e: Exception) {
            Log.e(TAG, "USB host detection error: ${e.message}")
            result.putBoolean("hasUsbHost", false)
        }

        // Printer detection
        val hasPrinter = try {
            if (usbManager != null) detectPrinter(usbManager) else false
        } catch (e: Exception) {
            Log.e(TAG, "Printer detection error: ${e.message}")
            false
        }
        result.putBoolean("hasPrinter", hasPrinter)

        // Barcode scanner detection
        try {
            val hasBarcodeScanner = if (usbManager != null) detectBarcodeScanner(usbManager) else false
            result.putBoolean("hasBarcodeScanner", hasBarcodeScanner)
        } catch (e: Exception) {
            Log.e(TAG, "Scanner detection error: ${e.message}")
            result.putBoolean("hasBarcodeScanner", false)
        }

        // Cash drawer detection
        try {
            val hasCashDrawer = if (usbManager != null) detectCashDrawer(usbManager, hasPrinter) else false
            result.putBoolean("hasCashDrawer", hasCashDrawer)
        } catch (e: Exception) {
            Log.e(TAG, "Cash drawer detection error: ${e.message}")
            result.putBoolean("hasCashDrawer", false)
        }

        // Connected USB devices
        try {
            val usbDevices = Arguments.createArray()
            usbManager?.deviceList?.values?.forEach { device ->
                val deviceMap = Arguments.createMap().apply {
                    putInt("vendorId", device.vendorId)
                    putInt("productId", device.productId)
                    putString("deviceName", device.deviceName)
                    putInt("deviceClass", device.deviceClass)
                }
                usbDevices.pushMap(deviceMap)
            }
            result.putArray("connectedUsbDevices", usbDevices)
        } catch (e: Exception) {
            Log.e(TAG, "USB device enumeration error: ${e.message}")
            result.putArray("connectedUsbDevices", Arguments.createArray())
        }

        // Build info
        result.putString("manufacturer", Build.MANUFACTURER)
        result.putString("model", Build.MODEL)
        result.putString("board", Build.BOARD)

        Log.d(TAG, "Detection complete: printer=$hasPrinter, cfd=${result.getBoolean("hasSecondaryDisplay")}, nfc=${result.getBoolean("hasNfc")}")

        return result
    }

    // ==================== PRINTER DETECTION ====================

    private fun detectPrinter(usbManager: UsbManager): Boolean {
        // 1. USB printer class (USB class 7)
        val hasPrinterClass = usbManager.deviceList.values.any { device ->
            device.interfaceCount > 0 &&
            (0 until device.interfaceCount).any { i ->
                device.getInterface(i).interfaceClass == UsbConstants.USB_CLASS_PRINTER
            }
        }

        // 2. Known POS printer vendor IDs
        val hasKnownPrinter = usbManager.deviceList.values.any { device ->
            PRINTER_VENDOR_IDS.contains(device.vendorId)
        }

        // 3. Serial port paths (SELinux-safe)
        val hasSerialPrinter = try {
            listOf("/dev/ttyS0", "/dev/ttyS1", "/dev/ttyS2")
                .any { File(it).exists() && File(it).canRead() }
        } catch (e: SecurityException) {
            false
        }

        return hasPrinterClass || hasKnownPrinter || hasSerialPrinter
    }

    // ==================== SECONDARY DISPLAY DETECTION ====================

    private fun detectSecondaryDisplay(displayManager: DisplayManager): DisplayInfo? {
        val displays = displayManager.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION)
        return displays.firstOrNull { display ->
            display.displayId != Display.DEFAULT_DISPLAY &&
            display.flags and Display.FLAG_PRESENTATION != 0 &&
            display.flags and Display.FLAG_SECURE == 0 &&
            display.state == Display.STATE_ON
        }?.let { display ->
            val metrics = DisplayMetrics()
            @Suppress("DEPRECATION")
            display.getRealMetrics(metrics)
            DisplayInfo(metrics.widthPixels, metrics.heightPixels, display.displayId)
        }
    }

    // ==================== BARCODE SCANNER DETECTION ====================

    private fun detectBarcodeScanner(usbManager: UsbManager): Boolean {
        // USB HID devices (class 3, subclass 1 = keyboard/scanner)
        val hasHidScanner = usbManager.deviceList.values.any { device ->
            device.interfaceCount > 0 &&
            (0 until device.interfaceCount).any { i ->
                val iface = device.getInterface(i)
                iface.interfaceClass == UsbConstants.USB_CLASS_HID && iface.interfaceSubclass == 1
            }
        }

        // Known scanner vendor IDs
        val hasKnownScanner = usbManager.deviceList.values.any { device ->
            SCANNER_VENDOR_IDS.contains(device.vendorId)
        }

        return hasHidScanner || hasKnownScanner
    }

    // ==================== CASH DRAWER DETECTION ====================

    private fun detectCashDrawer(usbManager: UsbManager, hasPrinter: Boolean): Boolean {
        // Serial port for cash drawer (e.g., Landi C20 ttyS3)
        val hasSerialPort = try {
            File("/dev/ttyS3").exists()
        } catch (e: SecurityException) {
            false
        }

        // Standalone USB cash drawer controllers
        val hasUsbDrawer = usbManager.deviceList.values.any { device ->
            device.vendorId == 0x0DD4 // APG cash drawer controller
        }

        // If printer detected, assume potential drawer support (kick-out port)
        return hasSerialPort || hasUsbDrawer || hasPrinter
    }

    // ==================== EVENT HELPERS ====================

    private fun sendEvent(eventName: String, params: WritableMap) {
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send event $eventName: ${e.message}")
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
