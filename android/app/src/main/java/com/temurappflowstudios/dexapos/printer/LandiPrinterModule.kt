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
import com.sdksuite.omnidriver.api.KeyConst
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
        const val DEFAULT_PRINT_DENSITY = 3
        const val MIN_DENSITY = 1
        const val MAX_DENSITY = 8
    }

    override fun getName(): String = NAME

    private var isInitialized = false
    private var printer: Printer? = null
    private var cashBox: CashBox? = null

    // Last-applied text format — used to suppress redundant setFormat() calls
    // that cause the LANDI head to flush its buffer and produce vertical streaks.
    // -1 sentinel => "unknown, force next setFormat".
    private var lastAppliedSize: Int = -1
    private var lastAppliedScale: Int = -1

    // Whether the built-in thermal printer has a physical cutter.
    // Starts true; set to false on first cutPaper() failure.
    private var supportsCutter: Boolean = true

    // Print density (gray level) passed to OmniDriver's setGray(int).
    // LANDI heads typically accept 1..8. The out-of-box default is too aggressive
    // for long prints and causes ghosting/streaks on dense columns. Start lower.
    private var printDensity: Int = DEFAULT_PRINT_DENSITY

    // ==================== INITIALIZATION ====================

    @ReactMethod
    fun initPrinter(promise: Promise) {
        try {
            val driver = OmniDriver.me(reactContext)
            driver.init(object : OmniConnection {
                override fun onConnected() {
                    try {
                        // Close previous handle if exists (e.g. re-init after error)
                        try { printer?.closeDevice() } catch (_: Exception) {}
                        printer = driver.getPrinter(Bundle())
                        printer!!.openDevice(0)
                        cashBox = driver.getCashBox(Bundle())
                        isInitialized = true
                        // Reset format tracker — fresh device needs explicit first setFormat
                        lastAppliedSize = -1
                        lastAppliedScale = -1
                        // Apply density to reduce thermal bleed / streaks on LANDI head
                        applyDensity(printer!!)
                        Log.d(TAG, "OmniDriver initialized — Printer opened, density=$printDensity, CashBox acquired")
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

            // Fresh device cycle — guarantees clean state regardless of prior errors
            try { p.closeDevice() } catch (_: Exception) {}
            p.openDevice(0)
            applyDensity(p)

            val doc = JSONObject(documentJson)
            val nodes = doc.getJSONArray("nodes")

            // Reset tracked format and emit one explicit setFormat before rendering
            lastAppliedSize = -1
            lastAppliedScale = -1
            setFormatIfChanged(p, ASCSize.DOT24x12, ASCScale.SC1x1)

            Log.e(TAG, "Print job: ${nodes.length()} nodes, rendering...")
            for (i in 0 until nodes.length()) {
                renderNode(p, nodes.getJSONObject(i))
            }

            Log.e(TAG, "Calling startPrint()")
            p.startPrint(object : OnPrintListener {
                override fun onSuccess() {
                    Log.e(TAG, "Print completed successfully")
                    promise.resolve(true)
                }

                override fun onFail(errorCode: Int) {
                    Log.e(TAG, "Print failed with error code: $errorCode (0x${errorCode.toString(16)})")
                    // Reset the device so the next print job isn't blocked by this error state.
                    try {
                        printer?.closeDevice()
                        printer?.openDevice(0)
                        lastAppliedSize = -1
                        lastAppliedScale = -1
                        Log.e(TAG, "Printer device reset after failure")
                    } catch (e: Exception) {
                        Log.w(TAG, "Printer reset failed, marking uninitialized: ${e.message}")
                        isInitialized = false
                        printer = null  // Force full re-init on next print
                    }
                    promise.reject("PRINT_FAILED", "Print failed (error: 0x${errorCode.toString(16)})")
                }
            })
        } catch (e: Exception) {
            Log.e(TAG, "printDocument failed (${e.javaClass.simpleName}): ${e.message}")
            promise.reject("PRINT_FAILED", "Failed to print document: ${e.message}", e)
        }
    }

    // ==================== DENSITY ====================

    @ReactMethod
    fun setPrintDensity(level: Int, promise: Promise) {
        try {
            val clamped = level.coerceIn(MIN_DENSITY, MAX_DENSITY)
            printDensity = clamped
            val p = printer
            if (p != null) {
                applyDensity(p)
            }
            Log.d(TAG, "Print density set to $clamped (requested=$level)")
            promise.resolve(clamped)
        } catch (e: Exception) {
            Log.e(TAG, "setPrintDensity failed: ${e.message}")
            promise.reject("DENSITY_FAILED", "Failed to set print density: ${e.message}", e)
        }
    }

    private fun applyDensity(p: Printer) {
        try {
            p.setGray(printDensity)
        } catch (e: Exception) {
            Log.w(TAG, "setGray($printDensity) failed: ${e.message}")
        }
    }

    // ==================== CASH DRAWER ====================

    @ReactMethod
    fun openCashDrawer(promise: Promise) {
        try {
            var opened = false

            // Path 1: OMNI SDK CashBox API (Landi device DK port)
            if (cashBox != null) {
                try {
                    cashBox!!.openBox()
                    Log.d(TAG, "Cash drawer opened via CashBox")
                    opened = true
                } catch (e: Exception) {
                    Log.w(TAG, "CashBox.openBox() failed: ${e.message}")
                }
            }

            // Path 2: Printer-based kick (via AIDL openCashDrawer if available)
            if (!opened) {
                val p = printer
                if (p != null) {
                    try {
                        val method = p.javaClass.getMethod("openCashDrawer")
                        method.invoke(p)
                        Log.d(TAG, "Cash drawer opened via Printer.openCashDrawer()")
                        opened = true
                    } catch (e: NoSuchMethodException) {
                        Log.w(TAG, "Printer.openCashDrawer() not available in this SDK build")
                    } catch (e: Exception) {
                        Log.w(TAG, "Printer.openCashDrawer() failed: ${e.message}")
                    }
                }
            }

            if (opened) {
                promise.resolve(true)
            } else {
                promise.reject("DRAWER_FAILED", "No cash drawer path available (cashBox=${cashBox != null}, printer=${printer != null})")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Cash drawer failed: ${e.message}")
            promise.reject("DRAWER_FAILED", "Failed to open cash drawer: ${e.message}", e)
        }
    }

    // ==================== RENDERING ====================

    private fun renderNode(p: Printer, node: JSONObject) {
        val nodeType = node.optString("type", "unknown")
        try {
            when (nodeType) {
                "text" -> {
                    applyFormat(p, node.optJSONObject("format"))
                    val align = parseAlign(node.optString("align", "left"))
                    p.addText(sanitizeForLandi(node.getString("content")), align, 0)
                }

                "text_line" -> {
                    applyFormat(p, node.optJSONObject("format"))
                    val align = parseAlign(node.optString("align", "left"))
                    // Use hardware newline instead of feedLine(1) for more compact vertical spacing
                    p.addText(sanitizeForLandi(node.getString("content")) + "\n", align, 0)
                }

                "two_column" -> {
                    applyFormat(p, node.optJSONObject("format"))
                    val left = sanitizeForLandi(node.getString("left"))
                    val right = sanitizeForLandi(node.getString("right"))
                    val lineWidth = node.optInt("lineWidth", 32)
                    val padding = lineWidth - left.length - right.length
                    val line = if (padding > 0) {
                        left + " ".repeat(padding) + right
                    } else {
                        left + " " + right
                    }
                    p.addText(line + "\n", Align.LEFT, 0)
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
                    p.addText(separator + "\n", Align.LEFT, 0)
                }

                "empty_line" -> {
                    p.addText("\n", Align.LEFT, 0)
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
                    if (supportsCutter) {
                        try {
                            p.cutPaper()
                        } catch (cutEx: Exception) {
                            Log.w(TAG, "cutPaper() failed (${cutEx.javaClass.simpleName}: ${cutEx.message}) — disabling cutter, using feed fallback")
                            supportsCutter = false
                            p.feedLine(4)
                        }
                    } else {
                        p.feedLine(4)
                    }
                }

                "barcode" -> {
                    Log.d(TAG, "Skipping barcode node — not supported on built-in thermal printer")
                }

                "image" -> {
                    Log.d(TAG, "Skipping image node — not supported on built-in thermal printer")
                }

                else -> {
                    Log.w(TAG, "Skipping unhandled node type: $nodeType")
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "renderNode($nodeType) failed (${e.javaClass.simpleName}): ${e.message}")
        }
    }

    /**
     * Replace characters that the LANDI thermal head renders incorrectly
     * (boxes, garbage bytes, or streaks). Narrow no-break space and other
     * Unicode space variants are known offenders. Typographic quotes and
     * em-dashes also map to single-byte ASCII equivalents to avoid
     * multi-byte encoding corruption.
     */
    private fun sanitizeForLandi(s: String): String {
        if (s.isEmpty()) return s
        val sb = StringBuilder(s.length)
        for (ch in s) {
            val mapped: Char = when (ch) {
                // Unicode space variants → regular space
                '\u00A0', '\u2009', '\u200A', '\u202F', '\u205F', '\u3000' -> ' '
                // Zero-width characters → strip
                '\u200B', '\u200C', '\u200D', '\uFEFF' -> '\u0000'
                // Curly/smart quotes → ASCII quotes
                '\u2018', '\u2019', '\u201A', '\u2032' -> '\''
                '\u201C', '\u201D', '\u201E', '\u2033' -> '"'
                // Dashes → ASCII hyphen
                '\u2013', '\u2014', '\u2015', '\u2212' -> '-'
                // Ellipsis → three periods (multi-char replacement handled below)
                '\u2026' -> {
                    sb.append("...")
                    continue
                }
                // Bullet → asterisk
                '\u2022', '\u2023', '\u25E6' -> '*'
                else -> ch
            }
            if (mapped != '\u0000') sb.append(mapped)
        }
        return sb.toString()
    }

    /**
     * Only emit setFormat() when the requested size/scale differs from the
     * last call. LANDI's head performs a buffer flush + mode switch on every
     * setFormat call, and rapid repeats cause vertical streaks mid-receipt.
     */
    private fun setFormatIfChanged(p: Printer, size: Int, scale: Int) {
        if (size == lastAppliedSize && scale == lastAppliedScale) return
        p.setFormat(Bundle().apply {
            putInt(KeyConst.PRINTER_ASC_SIZE, size)
            putInt(KeyConst.PRINTER_ASC_SCALE, scale)
        })
        lastAppliedSize = size
        lastAppliedScale = scale
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
            doubleH && doubleW -> ASCScale.SC2x2  // explicit both → 2D scale
            doubleH -> ASCScale.SC1x2             // tall text (bold or not)
            doubleW -> ASCScale.SC2x1             // wide text (explicit only)
            else -> ASCScale.SC1x1                // bold alone = normal size
        }

        setFormatIfChanged(p, ASCSize.DOT24x12, scale)
    }

    private fun resetFormat(p: Printer) {
        setFormatIfChanged(p, ASCSize.DOT24x12, ASCScale.SC1x1)
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

    // ==================== CLOSE / CLEANUP ====================

    @ReactMethod
    fun closePrinter(promise: Promise) {
        try {
            printer?.closeDevice()
            isInitialized = false
            printer = null
            lastAppliedSize = -1
            lastAppliedScale = -1
            supportsCutter = true
            Log.d(TAG, "Printer closed and state reset")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.w(TAG, "closePrinter failed: ${e.message}")
            promise.resolve(false)
        }
    }

    // ==================== LIFECYCLE ====================

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
