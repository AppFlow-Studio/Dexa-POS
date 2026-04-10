package com.temurappflowstudios.dexapos.printer

import android.util.Log
import com.facebook.react.bridge.*
import com.sdksuite.omnidriver.OmniConnection
import com.sdksuite.omnidriver.OmniDriver
import com.sdksuite.omnidriver.aidl.printer.ASCScale
import com.sdksuite.omnidriver.aidl.printer.ASCSize
import com.sdksuite.omnidriver.aidl.printer.Align
import com.sdksuite.omnidriver.aidl.printer.ECLevel
import com.sdksuite.omnidriver.aidl.printer.InitOption
import com.sdksuite.omnidriver.aidl.printer.TextFormat
import com.sdksuite.omnidriver.api.CashBox
import com.sdksuite.omnidriver.api.KeyConst
import com.sdksuite.omnidriver.api.OnPrintListener
import com.sdksuite.omnidriver.api.Printer
import com.sdksuite.omnidriver.api.VectorPrinter
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
        // VectorPrinter font size — 28px baseline for 203dpi thermal.
        const val VP_FONT_SIZE = 28
    }

    override fun getName(): String = NAME

    private var isInitialized = false
    // Simple Printer — kept for getStatus() and cash drawer.
    private var printer: Printer? = null
    // VectorPrinter — primary rendering engine with native bold support.
    private var vectorPrinter: VectorPrinter? = null
    private var cashBox: CashBox? = null

    // Last-applied TextFormat — suppress redundant setFormat() calls.
    private var lastBold: Boolean? = null
    private var lastScaleX: Float? = null
    private var lastScaleY: Float? = null

    // Legacy simple-printer format tracker (fallback path only).
    private var lastAppliedSize: Int = -1
    private var lastAppliedScale: Int = -1

    // Whether the built-in thermal printer has a physical cutter.
    private var supportsCutter: Boolean = true

    // Print density (gray level) 1..8.
    private var printDensity: Int = DEFAULT_PRINT_DENSITY

    // ==================== INITIALIZATION ====================

    @ReactMethod
    fun initPrinter(promise: Promise) {
        try {
            val driver = OmniDriver.me(reactContext)
            driver.init(object : OmniConnection {
                override fun onConnected() {
                    try {
                        // Close previous handles if exists (e.g. re-init after error)
                        try { printer?.closeDevice() } catch (_: Exception) {}
                        try { vectorPrinter?.closeDevice() } catch (_: Exception) {}

                        printer = driver.getPrinter(Bundle())
                        printer!!.openDevice(0)
                        applyDensity(printer!!)

                        // Acquire VectorPrinter for rich text formatting (native bold).
                        try {
                            vectorPrinter = driver.getVectorPrinter(Bundle())
                            Log.d(TAG, "VectorPrinter acquired — native bold available")
                        } catch (e: Exception) {
                            Log.w(TAG, "VectorPrinter unavailable, using simple Printer fallback: ${e.message}")
                            vectorPrinter = null
                        }

                        try {
                            cashBox = driver.getCashBox(Bundle())
                            Log.d(TAG, "CashBox acquired: ${cashBox != null}")
                        } catch (e: Exception) {
                            Log.w(TAG, "getCashBox() failed (non-fatal, cash drawer unavailable): ${e.javaClass.simpleName}: ${e.message}")
                            cashBox = null
                        }
                        isInitialized = true
                        lastAppliedSize = -1
                        lastAppliedScale = -1
                        resetVectorFormatCache()
                        Log.d(TAG, "OmniDriver initialized — density=$printDensity, vector=${vectorPrinter != null}")
                        promise.resolve(true)
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to acquire peripherals: ${e.message}")
                        promise.reject("INIT_FAILED", "Connected but failed to get peripherals: ${e.message}", e)
                    }
                }

                override fun onDisconnected(errorCode: Int) {
                    try { printer?.closeDevice() } catch (_: Exception) {}
                    try { vectorPrinter?.closeDevice() } catch (_: Exception) {}
                    isInitialized = false
                    printer = null
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
            val p = requirePrinter(promise) ?: return

            val status = p.getStatus()
            val result = Arguments.createMap().apply {
                putBoolean("isOnline", status == STATUS_OK)
                putBoolean("hasPaper", status != 1)
                putBoolean("coverOpen", false)
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
            val doc = JSONObject(documentJson)
            val nodes = doc.getJSONArray("nodes")

            val vp = vectorPrinter
            if (vp != null) {
                printWithVector(vp, p, nodes, promise)
            } else {
                printWithSimple(p, nodes, promise)
            }
        } catch (e: Exception) {
            Log.e(TAG, "printDocument failed (${e.javaClass.simpleName}): ${e.message}")
            promise.reject("PRINT_FAILED", "Failed to print document: ${e.message}", e)
        }
    }

    // ==================== VECTOR PRINTER PATH (primary) ====================

    private fun printWithVector(vp: VectorPrinter, simplePrinter: Printer, nodes: org.json.JSONArray, promise: Promise) {
        try {
            // Fresh device cycle
            try { vp.closeDevice() } catch (_: Exception) {}
            vp.openDevice(0)

            // Init with tight line spacing and print density
            vp.init(InitOption().apply {
                lineSpace = 0
                printGray = printDensity
            })

            // addTextColumns/addDividingLine produce invisible output on C20Pro.
            // two_column uses dual-addText (LEFT + RIGHT) — no char-width guessing.
            // dividers still need a char count; query pixelWidth for that.
            val pixelWidth = try { vp.getValidWidth() } catch (_: Exception) { 0 }
            Log.d(TAG, "VectorPrinter: pixelWidth=${pixelWidth}px")

            // Set default format
            resetVectorFormatCache()
            setVectorFormat(vp, false, 1.0f, 1.0f)

            // Track whether a cut node was encountered — must fire AFTER startPrint completes.
            var needsCut = false

            Log.d(TAG, "VectorPrinter: ${nodes.length()} nodes, rendering...")
            for (i in 0 until nodes.length()) {
                val node = nodes.getJSONObject(i)
                if (node.optString("type") == "cut") {
                    needsCut = true
                } else {
                    renderNodeVector(vp, simplePrinter, node, pixelWidth)
                }
            }

            Log.d(TAG, "VectorPrinter: calling startPrint() (needsCut=$needsCut)")
            vp.startPrint(object : OnPrintListener {
                override fun onSuccess() {
                    Log.d(TAG, "VectorPrinter: print completed successfully")
                    try { vp.closeDevice() } catch (_: Exception) {}

                    try {
                        try { simplePrinter.closeDevice() } catch (_: Exception) {}
                        simplePrinter.openDevice(0)

                        if (needsCut && supportsCutter) {
                            try {
                                simplePrinter.cutPaper()
                                Log.d(TAG, "VectorPrinter: paper cut after print")
                            } catch (cutEx: Exception) {
                                Log.w(TAG, "cutPaper() failed — disabling: ${cutEx.message}")
                                supportsCutter = false
                            }
                        }
                        simplePrinter.closeDevice()
                    } catch (e: Exception) {
                        Log.w(TAG, "Post-print feed/cut failed: ${e.message}")
                    }
                    promise.resolve(true)
                }

                override fun onFail(errorCode: Int) {
                    Log.e(TAG, "VectorPrinter: print failed (0x${errorCode.toString(16)})")
                    try {
                        vp.closeDevice()
                        vp.openDevice(0)
                        resetVectorFormatCache()
                    } catch (e: Exception) {
                        Log.w(TAG, "VectorPrinter reset failed: ${e.message}")
                    }
                    promise.reject("PRINT_FAILED", "Print failed (error: 0x${errorCode.toString(16)})")
                }
            })
        } catch (e: Exception) {
            Log.w(TAG, "VectorPrinter path failed, falling back to simple Printer: ${e.message}")
            // Fallback to simple Printer
            printWithSimple(simplePrinter, nodes, promise)
        }
    }

    private fun renderNodeVector(vp: VectorPrinter, simplePrinter: Printer, node: JSONObject, pixelWidth: Int) {
        val nodeType = node.optString("type", "unknown")
        try {
            when (nodeType) {
                "text" -> {
                    applyVectorFormat(vp, node.optJSONObject("format"))
                    val align = parseAlign(node.optString("align", "left"))
                    vp.addText(sanitizeForLandi(node.getString("content")), align, 0)
                }

                "text_line" -> {
                    applyVectorFormat(vp, node.optJSONObject("format"))
                    val align = parseAlign(node.optString("align", "left"))
                    vp.addText(sanitizeForLandi(node.getString("content")) + "\n", align, 0)
                }

                "two_column" -> {
                    val rawLeft = sanitizeForLandi(node.getString("left"))
                    val right = sanitizeForLandi(node.getString("right"))
                    applyVectorFormat(vp, node.optJSONObject("format"))
                    // Template cl() pre-pads centered labels with 3+ leading spaces.
                    // Detect this and use native Align.CENTER instead of space-padding.
                    val trimmed = rawLeft.trimStart()
                    val wasCentered = rawLeft.length - trimmed.length >= 3
                    val leftAlign = if (wasCentered) Align.CENTER else Align.LEFT
                    // Dual-addText: left text on current line (no \n), right text RIGHT-aligned (\n to advance).
                    vp.addText(trimmed, leftAlign, 0)
                    vp.addText(right + "\n", Align.RIGHT, 0)
                }

                "divider" -> {
                    setVectorFormat(vp, false, 1.0f, 1.0f)
                    val style = node.getString("style")
                    if (pixelWidth > 0) {
                        // Use addDividingLine pixel-based — renders a thin graphical line
                        // across the full printable width, no char-count guessing needed.
                        val lineSpace = if (style == "double") 3 else 1
                        try {
                            vp.addDividingLine(lineSpace, 0)
                        } catch (e: Exception) {
                            // Fallback to char-based if addDividingLine crashes
                            Log.w(TAG, "addDividingLine failed, using char fallback: ${e.message}")
                            val lineWidth = node.getInt("lineWidth")
                            val ch = if (style == "double") "=" else "-"
                            vp.addText(ch.repeat(lineWidth) + "\n", Align.LEFT, 0)
                        }
                    } else {
                        val lineWidth = node.getInt("lineWidth")
                        val separator = when (style) {
                            "solid" -> "-".repeat(lineWidth)
                            "dotted" -> "- ".repeat(lineWidth / 2).take(lineWidth)
                            "double" -> "=".repeat(lineWidth)
                            else -> "-".repeat(lineWidth)
                        }
                        vp.addText(separator + "\n", Align.LEFT, 0)
                    }
                }

                "empty_line" -> {
                    vp.addText("\n", Align.LEFT, 0)
                }

                "feed" -> {
                    val lines = node.getInt("lines")
                    // addText newlines give text-height spacing (VP_FONT_SIZE px each)
                    // vs feedLine which may feed dot-lines (~1px each)
                    vp.addText("\n".repeat(lines), Align.LEFT, 0)
                }

                "qr_code" -> {
                    setVectorFormat(vp, false, 1.0f, 1.0f)
                    val data = node.getString("data")
                    val size = node.optInt("size", 8)
                    // VectorPrinter addQrCode has extra byte[] param (pass null for default encoding)
                    vp.addQrCode(size, ECLevel.M, data, ByteArray(0), Align.CENTER, 0)
                    vp.feedLine(1)
                }

                "cut" -> {
                    // Handled after startPrint() — should not reach here.
                    Log.w(TAG, "cut node reached renderNodeVector — ignored (deferred to post-print)")
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
            Log.w(TAG, "renderNodeVector($nodeType) failed (${e.javaClass.simpleName}): ${e.message}")
        }
    }

    private fun applyVectorFormat(vp: VectorPrinter, formatObj: JSONObject?) {
        if (formatObj == null) {
            setVectorFormat(vp, false, 1.0f, 1.0f)
            return
        }

        val bold = formatObj.optBoolean("bold", false)
        val doubleH = formatObj.optBoolean("doubleHeight", false)
        val doubleW = formatObj.optBoolean("doubleWidth", false)

        val scaleX = if (doubleW) 2.0f else 1.0f
        val scaleY = if (doubleH) 2.0f else 1.0f

        setVectorFormat(vp, bold, scaleX, scaleY)
    }

    /**
     * Build a standalone TextFormat for per-column use in addTextColumns().
     * Does NOT call setFormat() — the SDK applies the format per-column.
     */
    private fun buildTextFormat(formatObj: JSONObject?): TextFormat {
        return TextFormat().apply {
            fontSize = VP_FONT_SIZE
            if (formatObj != null) {
                isBold = formatObj.optBoolean("bold", false)
                if (formatObj.optBoolean("doubleWidth", false)) scaleX = 2.0f
                if (formatObj.optBoolean("doubleHeight", false)) scaleY = 2.0f
            }
        }
    }

    /**
     * Only call vp.setFormat() when the requested format differs from the last call.
     * TextFormat includes native bold — no need for size/scale hacks.
     */
    private fun setVectorFormat(vp: VectorPrinter, bold: Boolean, scaleX: Float, scaleY: Float) {
        if (bold == lastBold && scaleX == lastScaleX && scaleY == lastScaleY) return
        vp.setFormat(TextFormat().apply {
            fontSize = VP_FONT_SIZE
            this.scaleX = scaleX
            this.scaleY = scaleY
            isBold = bold
        })
        lastBold = bold
        lastScaleX = scaleX
        lastScaleY = scaleY
    }

    private fun resetVectorFormatCache() {
        lastBold = null
        lastScaleX = null
        lastScaleY = null
    }

    // ==================== SIMPLE PRINTER PATH (fallback) ====================

    private fun printWithSimple(p: Printer, nodes: org.json.JSONArray, promise: Promise) {
        // Fresh device cycle
        try { p.closeDevice() } catch (_: Exception) {}
        p.openDevice(0)
        applyDensity(p)

        lastAppliedSize = -1
        lastAppliedScale = -1
        setFormatIfChanged(p, ASCSize.DOT24x12, ASCScale.SC1x1)

        Log.d(TAG, "SimplePrinter: ${nodes.length()} nodes, rendering...")
        for (i in 0 until nodes.length()) {
            renderNodeSimple(p, nodes.getJSONObject(i))
        }

        Log.d(TAG, "SimplePrinter: calling startPrint()")
        p.startPrint(object : OnPrintListener {
            override fun onSuccess() {
                Log.d(TAG, "SimplePrinter: print completed successfully")
                promise.resolve(true)
            }

            override fun onFail(errorCode: Int) {
                Log.e(TAG, "SimplePrinter: print failed (0x${errorCode.toString(16)})")
                try {
                    printer?.closeDevice()
                    printer?.openDevice(0)
                    lastAppliedSize = -1
                    lastAppliedScale = -1
                } catch (e: Exception) {
                    Log.w(TAG, "Printer reset failed, marking uninitialized: ${e.message}")
                    isInitialized = false
                    printer = null
                }
                promise.reject("PRINT_FAILED", "Print failed (error: 0x${errorCode.toString(16)})")
            }
        })
    }

    private fun renderNodeSimple(p: Printer, node: JSONObject) {
        val nodeType = node.optString("type", "unknown")
        try {
            when (nodeType) {
                "text" -> {
                    applySimpleFormat(p, node.optJSONObject("format"))
                    val align = parseAlign(node.optString("align", "left"))
                    p.addText(sanitizeForLandi(node.getString("content")), align, 0)
                }

                "text_line" -> {
                    applySimpleFormat(p, node.optJSONObject("format"))
                    val align = parseAlign(node.optString("align", "left"))
                    p.addText(sanitizeForLandi(node.getString("content")) + "\n", align, 0)
                }

                "two_column" -> {
                    applySimpleFormat(p, node.optJSONObject("format"))
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
                            Log.w(TAG, "cutPaper() failed — disabling cutter, using feed: ${cutEx.message}")
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
            Log.w(TAG, "renderNodeSimple($nodeType) failed (${e.javaClass.simpleName}): ${e.message}")
        }
    }

    /**
     * Simple Printer fallback: bold uses DOT32x12 (33% taller chars, visually heavier)
     * since the simple API has no native bold weight support.
     */
    private fun applySimpleFormat(p: Printer, formatObj: JSONObject?) {
        if (formatObj == null) {
            setFormatIfChanged(p, ASCSize.DOT24x12, ASCScale.SC1x1)
            return
        }

        val doubleH = formatObj.optBoolean("doubleHeight", false)
        val doubleW = formatObj.optBoolean("doubleWidth", false)
        val bold = formatObj.optBoolean("bold", false)

        val scale = when {
            doubleH && doubleW -> ASCScale.SC2x2
            doubleH -> ASCScale.SC1x2
            doubleW -> ASCScale.SC2x1
            else -> ASCScale.SC1x1
        }

        // bold alone: use DOT32x12 for visually heavier text (33% taller, not 100%)
        val size = if (bold && !doubleH && !doubleW) ASCSize.DOT32x12 else ASCSize.DOT24x12

        setFormatIfChanged(p, size, scale)
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
            if (!isInitialized) {
                Log.w(TAG, "openCashDrawer called but not initialized — attempting init first")
                promise.reject("DRAWER_FAILED", "Printer not initialized. Call initPrinter() first.")
                return
            }

            // Attempt 1: Use existing CashBox reference
            if (cashBox != null) {
                try {
                    cashBox!!.openBox()
                    Log.d(TAG, "Cash drawer opened via CashBox")
                    promise.resolve(true)
                    return
                } catch (e: Exception) {
                    Log.w(TAG, "CashBox.openBox() failed (stale reference?): ${e.javaClass.simpleName}: ${e.message}")
                    cashBox = null // Clear stale reference
                }
            }

            // Attempt 2: Re-acquire CashBox from OmniDriver and retry
            Log.d(TAG, "Re-acquiring CashBox from OmniDriver...")
            try {
                val driver = OmniDriver.me(reactContext)
                cashBox = driver.getCashBox(Bundle())
                if (cashBox != null) {
                    cashBox!!.openBox()
                    Log.d(TAG, "Cash drawer opened via re-acquired CashBox")
                    promise.resolve(true)
                    return
                } else {
                    Log.w(TAG, "getCashBox() returned null on re-acquire")
                }
            } catch (e: Exception) {
                Log.w(TAG, "CashBox re-acquire/openBox failed: ${e.javaClass.simpleName}: ${e.message}")
                cashBox = null
            }

            // Attempt 3: Reflection fallback on Printer (unlikely to exist, but last resort)
            val p = printer
            if (p != null) {
                try {
                    val method = p.javaClass.getMethod("openCashDrawer")
                    method.invoke(p)
                    Log.d(TAG, "Cash drawer opened via Printer.openCashDrawer() reflection")
                    promise.resolve(true)
                    return
                } catch (e: NoSuchMethodException) {
                    Log.w(TAG, "Printer.openCashDrawer() not available in this SDK build")
                } catch (e: Exception) {
                    Log.w(TAG, "Printer.openCashDrawer() reflection failed: ${e.message}")
                }
            }

            promise.reject("DRAWER_FAILED", "All cash drawer paths failed (cashBox re-acquired=false, printer=${printer != null})")
        } catch (e: Exception) {
            Log.e(TAG, "Cash drawer unexpected error: ${e.javaClass.simpleName}: ${e.message}")
            promise.reject("DRAWER_FAILED", "Failed to open cash drawer: ${e.message}", e)
        }
    }

    // ==================== SHARED UTILITIES ====================

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
                '\u00A0', '\u2009', '\u200A', '\u202F', '\u205F', '\u3000' -> ' '
                '\u200B', '\u200C', '\u200D', '\uFEFF' -> '\u0000'
                '\u2018', '\u2019', '\u201A', '\u2032' -> '\''
                '\u201C', '\u201D', '\u201E', '\u2033' -> '"'
                '\u2013', '\u2014', '\u2015', '\u2212' -> '-'
                '\u2026' -> {
                    sb.append("...")
                    continue
                }
                '\u2022', '\u2023', '\u25E6' -> '*'
                else -> ch
            }
            if (mapped != '\u0000') sb.append(mapped)
        }
        return sb.toString()
    }

    /**
     * Only emit setFormat() when the requested size/scale differs from the
     * last call. Avoids buffer flush gaps on the thermal head.
     */
    private fun setFormatIfChanged(p: Printer, size: Int, scale: Int) {
        if (size == lastAppliedSize && scale == lastAppliedScale) return
        p.setFormat(Bundle().apply {
            putInt(KeyConst.PRINTER_ASC_SIZE, size)
            putInt(KeyConst.PRINTER_ASC_SCALE, scale)
            putInt(KeyConst.PRINTER_YSPACE, 0)
        })
        lastAppliedSize = size
        lastAppliedScale = scale
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
            try { vectorPrinter?.closeDevice() } catch (_: Exception) {}
            isInitialized = false
            printer = null
            vectorPrinter = null
            lastAppliedSize = -1
            lastAppliedScale = -1
            resetVectorFormatCache()
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
