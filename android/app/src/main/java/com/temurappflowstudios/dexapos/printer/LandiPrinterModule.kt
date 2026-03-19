package com.temurappflowstudios.dexapos.printer

import android.util.Log
import com.facebook.react.bridge.*
import com.sdksuite.omnidriver.OmniConnection
import com.sdksuite.omnidriver.OmniDriver
import com.sdksuite.omnidriver.aidl.printer.ASCScale
import com.sdksuite.omnidriver.aidl.printer.ASCSize
import com.sdksuite.omnidriver.aidl.printer.Align
import com.sdksuite.omnidriver.aidl.printer.ECLevel
import com.sdksuite.omnidriver.api.CashBox
import com.sdksuite.omnidriver.api.OnPrintListener
import com.sdksuite.omnidriver.api.Printer
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
    private var printer: Printer? = null
    private var cashBox: CashBox? = null

    // ==================== INITIALIZATION ====================

    @ReactMethod
    fun initPrinter(promise: Promise) {
        try {
            val driver = OmniDriver.me(reactContext)
            driver.init(object : OmniConnection {
                override fun onConnected() {
                    try {
                        printer = driver.getPrinter(Bundle())
                        printer!!.openDevice(0)
                        cashBox = driver.getCashBox(Bundle())
                        isInitialized = true
                        Log.d(TAG, "OmniDriver initialized — Printer opened and CashBox acquired")
                        promise.resolve(true)
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to acquire peripherals: ${e.message}")
                        promise.reject("INIT_FAILED", "Connected but failed to get peripherals: ${e.message}", e)
                    }
                }

                override fun onDisconnected(errorCode: Int) {
                    try { printer?.closeDevice() } catch (_: Exception) {}
                    isInitialized = false
                    printer = null
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
            val p = requirePrinter(promise) ?: return

            val status = p.getStatus()
            val result = Arguments.createMap().apply {
                putBoolean("isOnline", status == STATUS_OK)
                putBoolean("hasPaper", status != 1) // 1 = out of paper (common convention)
                putBoolean("coverOpen", false) // Printer doesn't expose cover status
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
            val p = requirePrinter(promise) ?: return

            val status = p.getStatus()
            if (status != STATUS_OK) {
                promise.reject("PRINTER_ERROR", "Printer not ready (status: $status)")
                return
            }

            val doc = JSONObject(documentJson)
            val nodes = doc.getJSONArray("nodes")

            // Render each node
            for (i in 0 until nodes.length()) {
                renderNode(p, nodes.getJSONObject(i))
            }

            // Feed and cut before starting print
            p.feedLine(3)
            p.cutPaper()

            // Start printing
            p.startPrint(object : OnPrintListener {
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

    private fun renderNode(p: Printer, node: JSONObject) {
        when (node.getString("type")) {
            "text" -> {
                applyFormat(p, node.optJSONObject("format"))
                val align = parseAlign(node.optString("align", "left"))
                p.addText(node.getString("content"), align, 0)
            }

            "text_line" -> {
                applyFormat(p, node.optJSONObject("format"))
                val align = parseAlign(node.optString("align", "left"))
                p.addText(node.getString("content"), align, 0)
                p.feedLine(1)
            }

            "two_column" -> {
                applyFormat(p, node.optJSONObject("format"))
                val left = node.getString("left")
                val right = node.getString("right")
                val lineWidth = node.optInt("lineWidth", 32)
                val padding = lineWidth - left.length - right.length
                val line = if (padding > 0) {
                    left + " ".repeat(padding) + right
                } else {
                    left + " " + right
                }
                p.addText(line, Align.LEFT, 0)
                p.feedLine(1)
            }

            "divider" -> {
                resetFormat(p)
                val lineWidth = node.getInt("lineWidth")
                val style = node.getString("style")
                val separator = when (style) {
                    "solid" -> "-".repeat(lineWidth)
                    "dotted" -> "- ".repeat(lineWidth / 2).take(lineWidth)
                    "double" -> "=".repeat(lineWidth)
                    else -> "-".repeat(lineWidth)
                }
                p.addText(separator, Align.LEFT, 0)
                p.feedLine(1)
            }

            "empty_line" -> {
                p.feedLine(1)
            }

            "feed" -> {
                p.feedLine(node.getInt("lines"))
            }

            "qr_code" -> {
                val data = node.getString("data")
                val size = node.optInt("size", 8)
                p.addQrCode(size, ECLevel.M, data, Align.CENTER, 0)
                p.feedLine(1)
            }

            "cut" -> {
                p.cutPaper()
            }
        }
    }

    private fun applyFormat(p: Printer, formatObj: JSONObject?) {
        if (formatObj == null) {
            resetFormat(p)
            return
        }

        val doubleH = formatObj.optBoolean("doubleHeight", false)
        val doubleW = formatObj.optBoolean("doubleWidth", false)
        val bold = formatObj.optBoolean("bold", false)

        val scale = when {
            (doubleH && doubleW) || (bold && doubleH) -> ASCScale.SC2x2
            doubleH -> ASCScale.SC1x2
            doubleW || bold -> ASCScale.SC2x1
            else -> ASCScale.SC1x1
        }

        p.setFormat(ASCSize.DOT24x12, scale)
    }

    private fun resetFormat(p: Printer) {
        p.setFormat(ASCSize.DOT24x12, ASCScale.SC1x1)
    }

    private fun parseAlign(align: String): Int {
        return when (align) {
            "center" -> Align.CENTER
            "right" -> Align.RIGHT
            else -> Align.LEFT
        }
    }

    private fun requirePrinter(promise: Promise): Printer? {
        if (!isInitialized || printer == null) {
            promise.reject("NOT_INITIALIZED", "Printer service not initialized. Call initPrinter() first.")
            return null
        }
        return printer
    }

    // ==================== LIFECYCLE ====================

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
