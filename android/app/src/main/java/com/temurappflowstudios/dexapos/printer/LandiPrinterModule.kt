package com.temurappflowstudios.dexapos.printer

import android.util.Log
import com.facebook.react.bridge.*
import com.sdksuite.omnidriver.OmniConnection
import com.sdksuite.omnidriver.OmniDriver
import com.sdksuite.omnidriver.aidl.printer.Align
import com.sdksuite.omnidriver.aidl.printer.ECLevel
import com.sdksuite.omnidriver.aidl.printer.InitOption
import com.sdksuite.omnidriver.aidl.printer.TextFormat
import com.sdksuite.omnidriver.api.CashBox
import com.sdksuite.omnidriver.api.OnPrintListener
import com.sdksuite.omnidriver.api.VectorPrinter
import org.json.JSONArray
import org.json.JSONObject
import android.os.Bundle

class LandiPrinterModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val TAG = "LandiPrinter"
        const val NAME = "LandiPrinterModule"
        const val STATUS_OK = 0
    }

    override fun getName(): String = NAME

    private var isInitialized = false
    private var vectorPrinter: VectorPrinter? = null
    private var cashBox: CashBox? = null

    // ==================== INITIALIZATION ====================

    @ReactMethod
    fun initPrinter(promise: Promise) {
        try {
            val driver = OmniDriver.me(reactContext)
            driver.init(object : OmniConnection {
                override fun onConnected() {
                    try {
                        vectorPrinter = driver.getVectorPrinter(Bundle())
                        vectorPrinter!!.openDevice(0)
                        cashBox = driver.getCashBox(Bundle())
                        isInitialized = true
                        Log.d(TAG, "OmniDriver initialized — VectorPrinter opened and CashBox acquired")
                        promise.resolve(true)
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to acquire peripherals: ${e.message}")
                        promise.reject("INIT_FAILED", "Connected but failed to get peripherals: ${e.message}", e)
                    }
                }

                override fun onDisconnected(errorCode: Int) {
                    try { vectorPrinter?.closeDevice() } catch (_: Exception) {}
                    isInitialized = false
                    vectorPrinter = null
                    cashBox = null
                    Log.e(TAG, "OmniDriver disconnected with error code: $errorCode")
                    promise.reject("INIT_FAILED", "OmniDriver disconnected (error: $errorCode)")
                }
            })
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize OmniDriver: ${e.message}")
            promise.reject("INIT_FAILED", "Failed to initialize OmniDriver: ${e.message}", e)
        }
    }

    // ==================== PRINTER STATUS ====================

    @ReactMethod
    fun getPrinterStatus(promise: Promise) {
        try {
            val vp = requirePrinter(promise) ?: return

            val status = vp.getStatus()
            val result = Arguments.createMap().apply {
                putBoolean("isOnline", status == STATUS_OK)
                putBoolean("hasPaper", status != 1) // 1 = out of paper (common convention)
                putBoolean("coverOpen", false) // VectorPrinter doesn't expose cover status
                putString("statusCode", status.toString())
                if (status != STATUS_OK) {
                    putString("errorMessage", "Printer error (status: $status)")
                }
            }

            promise.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get printer status: ${e.message}")
            promise.reject("STATUS_FAILED", "Failed to get printer status: ${e.message}", e)
        }
    }

    // ==================== PRINT DOCUMENT ====================

    @ReactMethod
    fun printDocument(documentJson: String, promise: Promise) {
        try {
            val vp = requirePrinter(promise) ?: return

            val status = vp.getStatus()
            if (status != STATUS_OK) {
                promise.reject("PRINTER_ERROR", "Printer not ready (status: $status)")
                return
            }

            val doc = JSONObject(documentJson)
            val nodes = doc.getJSONArray("nodes")

            // Initialize with auto-cut enabled
            val initOption = InitOption().apply {
                autoCutPaper = true
                autoWrapText = true
                lineSpace = 2
            }
            vp.init(initOption)

            // Render each node
            for (i in 0 until nodes.length()) {
                renderNode(vp, nodes.getJSONObject(i))
            }

            // Start printing
            vp.startPrint(object : OnPrintListener {
                override fun onSuccess() {
                    Log.d(TAG, "Print completed successfully")
                    promise.resolve(true)
                }

                override fun onFail(errorCode: Int) {
                    Log.e(TAG, "Print failed with error code: $errorCode")
                    promise.reject("PRINT_FAILED", "Print failed (error: $errorCode)")
                }
            })
        } catch (e: Exception) {
            Log.e(TAG, "Failed to print document: ${e.message}")
            promise.reject("PRINT_FAILED", "Failed to print document: ${e.message}", e)
        }
    }

    // ==================== CASH DRAWER ====================

    @ReactMethod
    fun openCashDrawer(promise: Promise) {
        try {
            if (!isInitialized || cashBox == null) {
                promise.reject("NOT_INITIALIZED", "Printer service not initialized. Call initPrinter() first.")
                return
            }

            cashBox!!.openBox()
            Log.d(TAG, "Cash drawer opened")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open cash drawer: ${e.message}")
            promise.reject("DRAWER_FAILED", "Failed to open cash drawer: ${e.message}", e)
        }
    }

    // ==================== RENDERING ====================

    private fun renderNode(vp: VectorPrinter, node: JSONObject) {
        when (node.getString("type")) {
            "text" -> {
                applyFormat(vp, node.optJSONObject("format"))
                val align = parseAlign(node.optString("align", "left"))
                vp.addText(node.getString("content"), align, 0)
            }

            "text_line" -> {
                applyFormat(vp, node.optJSONObject("format"))
                val align = parseAlign(node.optString("align", "left"))
                vp.addText(node.getString("content"), align, 0)
                vp.feedLine(1)
            }

            "two_column" -> {
                applyFormat(vp, node.optJSONObject("format"))
                val left = node.getString("left")
                val right = node.getString("right")
                vp.addTextColumns(
                    arrayOf(left, right),
                    intArrayOf(70, 30),
                    intArrayOf(Align.LEFT, Align.RIGHT)
                )
            }

            "divider" -> {
                resetFormat(vp)
                val lineWidth = node.getInt("lineWidth")
                val style = node.getString("style")
                val separator = when (style) {
                    "solid" -> "-".repeat(lineWidth)
                    "dotted" -> "- ".repeat(lineWidth / 2).take(lineWidth)
                    "double" -> "=".repeat(lineWidth)
                    else -> "-".repeat(lineWidth)
                }
                vp.addText(separator, Align.LEFT, 0)
                vp.feedLine(1)
            }

            "empty_line" -> {
                vp.feedLine(1)
            }

            "feed" -> {
                vp.feedLine(node.getInt("lines"))
            }

            "qr_code" -> {
                val data = node.getString("data")
                val size = node.optInt("size", 8)
                vp.addQrCode(0, 0, data, ByteArray(0), size, ECLevel.M)
                vp.feedLine(1)
            }

            "cut" -> {
                // Handled by InitOption.autoCutPaper = true
                // Feed extra lines for spacing before auto-cut
                vp.feedLine(3)
            }

            // barcode, image, cash_drawer: not handled via VectorPrinter
        }
    }

    private fun applyFormat(vp: VectorPrinter, formatObj: JSONObject?) {
        val tf = TextFormat()
        if (formatObj != null) {
            tf.isBold = formatObj.optBoolean("bold", false)
            tf.isUnderline = formatObj.optBoolean("underline", false)
            tf.isItalic = formatObj.optBoolean("italic", false)
            tf.isAntiColor = formatObj.optBoolean("inverted", false)

            val doubleH = formatObj.optBoolean("doubleHeight", false)
            val doubleW = formatObj.optBoolean("doubleWidth", false)
            if (doubleH || doubleW) {
                tf.scaleX = if (doubleW) 2.0f else 1.0f
                tf.scaleY = if (doubleH) 2.0f else 1.0f
            }

            val fontSize = formatObj.optInt("fontSize", 0)
            if (fontSize > 0) {
                tf.fontSize = fontSize
            }
        }
        vp.setFormat(tf)
    }

    private fun resetFormat(vp: VectorPrinter) {
        vp.setFormat(TextFormat())
    }

    private fun parseAlign(align: String): Int {
        return when (align) {
            "center" -> Align.CENTER
            "right" -> Align.RIGHT
            else -> Align.LEFT
        }
    }

    private fun requirePrinter(promise: Promise): VectorPrinter? {
        if (!isInitialized || vectorPrinter == null) {
            promise.reject("NOT_INITIALIZED", "Printer service not initialized. Call initPrinter() first.")
            return null
        }
        return vectorPrinter
    }

    // ==================== LIFECYCLE ====================

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
