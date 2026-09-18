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
import com.sdksuite.omnidriver.aidl.printer.StrokeStyle
import com.sdksuite.omnidriver.aidl.printer.TextFormat
import com.sdksuite.omnidriver.api.CashBox
import com.sdksuite.omnidriver.api.KeyConst
import com.sdksuite.omnidriver.api.OnPrintListener
import com.sdksuite.omnidriver.api.Printer
import com.sdksuite.omnidriver.api.VectorPrinter
import org.json.JSONObject
import android.os.Bundle
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

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

        // ── SIMPLE PRINTER FALLBACK CPL (NOT used by VectorPrinter path) ──────
        // These only apply if VectorPrinter fails to init and we fall back to
        // the legacy Printer API. The VectorPrinter path uses addTextColumns()
        // with pixel-based column weights and does NOT read these values.
        // ──────────────────────────────────────────────────────────────────────
        const val NORMAL_CPL     = 46
        const val BOLD_CPL       = 46
        const val DIVIDER_CPL    = 46
        const val DOUBLE_DIV_CPL = 32

        // ── VECTOR PRINTER COLUMN WEIGHTS ─────────────────────────────────────
        // addTextColumns takes proportional weights (like CSS flexbox). These
        // divide the printable width into columns. Same weights across rows =
        // pixel-perfect vertical alignment.
        //
        // Two-column (items / metadata / totals):  [LABEL 70% | PRICE 30%]
        // Three-column (subtotal / tax):           [SPACER 30% | LABEL 40% | PRICE 30%]
        // ──────────────────────────────────────────────────────────────────────
        val TWO_COL_WEIGHTS   = intArrayOf(7, 3)
        val META_COL_WEIGHTS = intArrayOf(4, 6)
        val THREE_COL_WEIGHTS = intArrayOf(3, 4, 3)

        // Vertical margin in pixels above/below a dividing line.
        const val DIVIDER_MARGIN_PX = 32
    }

    override fun getName(): String = NAME

    // ── BACKGROUND EXECUTORS ──────────────────────────────────────────────
    // The default React NativeModulesQueue is shared across @ReactMethod
    // calls on this module, so a long synchronous print setup (the
    // addText/addTextColumns AIDL loop in printWithVector) blocks every
    // other call — including openCashDrawer — for seconds. We split into
    // two single-threaded executors so prints and drawer kicks run on
    // independent worker threads.
    //   - printExecutor: serializes print jobs (FIFO, can't reorder receipts)
    //   - drawerExecutor: serializes drawer + status calls (FIFO, brief work)
    // Promise resolution from a background thread is RN-safe.
    // ──────────────────────────────────────────────────────────────────────
    private val printExecutor: ExecutorService =
        Executors.newSingleThreadExecutor { r -> Thread(r, "Landi-Print").apply { isDaemon = true } }
    private val drawerExecutor: ExecutorService =
        Executors.newSingleThreadExecutor { r -> Thread(r, "Landi-Drawer").apply { isDaemon = true } }

    // Peripheral handles are read from both executors (drawerExecutor reads
    // `cashBox`/`printer`; printExecutor writes them via warmCashBox/init).
    // @Volatile makes cross-thread writes visible without locking.
    @Volatile private var isInitialized = false
    // Simple Printer — kept for getStatus() and cash drawer.
    @Volatile private var printer: Printer? = null
    // VectorPrinter — primary rendering engine with native bold support.
    @Volatile private var vectorPrinter: VectorPrinter? = null
    @Volatile private var cashBox: CashBox? = null

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
        // Offload OmniDriver bind + peripheral acquisition to the print worker
        // thread. Under the New Architecture a @ReactMethod may be dispatched on
        // a UI-critical thread; serializing init on printExecutor keeps the heavy
        // OmniDriver setup off it and orders it ahead of the first print job.
        printExecutor.execute { performInit(promise) }
    }

    private fun performInit(promise: Promise) {
        try {
            // Idempotent: if a prior init already established the OmniDriver
            // connection, skip the costly re-init. vectorPrinter and cashBox
            // may legitimately be null (older SDK / no drawer hardware) — the
            // simple-printer fallback and cashBox re-acquire paths handle that.
            if (isInitialized && printer != null) {
                Log.d(TAG, "initPrinter: already initialized — skipping OmniDriver.init")
                promise.resolve(true)
                return
            }

            val driver = OmniDriver.me(reactContext)
            driver.init(object : OmniConnection {
                override fun onConnected() {
                    try {
                        try { printer?.closeDevice() } catch (_: Exception) {}
                        try { vectorPrinter?.closeDevice() } catch (_: Exception) {}

                        printer = driver.getPrinter(Bundle())
                        printer!!.openDevice(0)
                        applyDensity(printer!!)

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
                            Log.w(TAG, "getCashBox() failed (non-fatal): ${e.javaClass.simpleName}: ${e.message}")
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
        drawerExecutor.execute {
            try {
                val p = requirePrinter(promise) ?: return@execute
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
    }

    // ==================== PRINT DOCUMENT ====================

    @ReactMethod
    fun printDocument(documentJson: String, promise: Promise) {
        printExecutor.execute {
            try {
                Log.d(TAG, "printDocument: running on thread=${Thread.currentThread().name}")
                val p = requirePrinter(promise) ?: return@execute
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
    }

    // ==================== VECTOR PRINTER PATH (primary) ====================

    private fun printWithVector(vp: VectorPrinter, simplePrinter: Printer, nodes: org.json.JSONArray, promise: Promise) {
        try {
            try { vp.closeDevice() } catch (_: Exception) {}
            vp.openDevice(0)

            vp.init(InitOption().apply {
                lineSpace = 0
                printGray = printDensity
            })

            val pixelWidth = try { vp.getValidWidth() } catch (_: Exception) { 0 }
            Log.d(TAG, "VectorPrinter: pixelWidth=$pixelWidth, using addTextColumns for alignment")

            resetVectorFormatCache()
            setVectorFormat(vp, false, 1.0f, 1.0f)

            var needsCut = false

            Log.d(TAG, "VectorPrinter: ${nodes.length()} nodes, rendering...")
            for (i in 0 until nodes.length()) {
                val node = nodes.getJSONObject(i)
                if (node.optString("type") == "cut") {
                    needsCut = true
                } else {
                    renderNodeVector(vp, simplePrinter, node)
                }
            }

            Log.d(TAG, "VectorPrinter: calling startPrint() (needsCut=$needsCut)")
            vp.startPrint(object : OnPrintListener {
                override fun onSuccess() {
                    // The SDK delivers this callback on the MAIN/UI thread
                    // (confirmed via logcat: "onSuccess on thread=main"). The
                    // post-print cut/close chain hits the OmniDriver over AIDL and
                    // blocks for seconds — cutLatch.await is bounded at 3s, plus the
                    // close/open + warmCashBox IPC — which froze ALL touch input
                    // until it finished (the reported P1). Hand the teardown to
                    // printExecutor so the UI thread is released the instant
                    // printing ends. printExecutor is idle here (the print task
                    // returned right after startPrint), so this runs immediately
                    // and cannot deadlock.
                    Log.d(TAG, "VectorPrinter onSuccess on thread=${Thread.currentThread().name} — offloading teardown")
                    printExecutor.execute { finishVectorPrint(vp, simplePrinter, needsCut, promise) }
                }

                override fun onFail(errorCode: Int) {
                    Log.e(TAG, "VectorPrinter onFail on thread=${Thread.currentThread().name} — offloading teardown")
                    printExecutor.execute { failVectorPrint(vp, errorCode, promise) }
                }
            })
        } catch (e: Exception) {
            Log.w(TAG, "VectorPrinter path failed, falling back to simple Printer: ${e.message}")
            printWithSimple(simplePrinter, nodes, promise)
        }
    }

    /**
     * Post-print teardown for the VectorPrinter path: paper cut, device close,
     * cash-box warm-up, and promise resolution. Invoked on printExecutor (NOT the
     * SDK's main-thread OnPrintListener callback) so the bounded cut wait and the
     * AIDL close/warm IPC never block the UI thread. See onSuccess above.
     */
    private fun finishVectorPrint(
        vp: VectorPrinter,
        simplePrinter: Printer,
        needsCut: Boolean,
        promise: Promise
    ) {
        Log.d(TAG, "finishVectorPrint on thread=${Thread.currentThread().name} — print completed")
        try { vp.closeDevice() } catch (_: Exception) {}

        try {
            try { simplePrinter.closeDevice() } catch (_: Exception) {}
            simplePrinter.openDevice(0)

            if (needsCut && supportsCutter) {
                try {
                    simplePrinter.cutPaper()
                    // cutPaper() only BUFFERS the cut command on the simple
                    // Printer. Without a startPrint() the buffer is dropped
                    // when closeDevice() runs — which is why receipts never
                    // physically cut on the C20Pro. Fire startPrint() and
                    // wait for the listener before continuing so the cut
                    // actually executes on hardware.
                    val cutLatch = java.util.concurrent.CountDownLatch(1)
                    simplePrinter.startPrint(object : OnPrintListener {
                        override fun onSuccess() {
                            Log.d(TAG, "VectorPrinter: paper cut after print")
                            cutLatch.countDown()
                        }
                        override fun onFail(errorCode: Int) {
                            Log.w(
                                TAG,
                                "Cut startPrint failed (0x${errorCode.toString(16)}) — disabling cutter"
                            )
                            supportsCutter = false
                            cutLatch.countDown()
                        }
                    })
                    // Bounded wait so a stuck cutter can't hang the print
                    // queue forever — 3s is plenty for a paper-cut motor.
                    // Now runs on printExecutor, so this wait no longer freezes UI.
                    cutLatch.await(3, java.util.concurrent.TimeUnit.SECONDS)
                } catch (cutEx: Exception) {
                    Log.w(TAG, "cutPaper() failed — disabling: ${cutEx.message}")
                    supportsCutter = false
                }
            }
            simplePrinter.closeDevice()
        } catch (e: Exception) {
            Log.w(TAG, "Post-print feed/cut failed: ${e.message}")
        }
        warmCashBox()
        promise.resolve(true)
    }

    /**
     * Failure teardown for the VectorPrinter path — device reset + promise
     * rejection. Invoked on printExecutor for the same reason as
     * finishVectorPrint (the OnPrintListener fires on the main thread).
     */
    private fun failVectorPrint(vp: VectorPrinter, errorCode: Int, promise: Promise) {
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

    private fun renderNodeVector(vp: VectorPrinter, simplePrinter: Printer, node: JSONObject) {
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
                    val left = sanitizeForLandi(node.getString("left")).trimStart()
                    val right = sanitizeForLandi(node.getString("right"))
                    val fmt = node.optJSONObject("format")
                    val isBold = fmt?.optBoolean("bold", false) == true
                    val isDH = fmt?.optBoolean("doubleHeight", false) == true
                    val isDW = fmt?.optBoolean("doubleWidth", false) == true
                    val labelAlign = node.optString("labelAlign", "left")

                    val scaleX = if (isDW) 2.0f else 1.0f
                    val scaleY = if (isDH) 2.0f else 1.0f

                    // Apply row format ONCE before the column call — the 3-arg overload
                    // of addTextColumns uses the currently-set format for all columns.
                    setVectorFormat(vp, isBold, scaleX, scaleY)

                    Log.d(TAG, "two_col: align=$labelAlign bold=$isBold left='$left' right='$right'")

                    if (labelAlign == "mid") {
                        // [spacer 30% | label LEFT 40% | price RIGHT 30%]
                        vp.addTextColumns(
                            arrayOf(" ", left, right),
                            THREE_COL_WEIGHTS,
                            intArrayOf(Align.LEFT, Align.LEFT, Align.RIGHT)
                        )
                    } else if (labelAlign == "meta") {
                        // [label LEFT 40% | value RIGHT 60%] — wide value column for long dates
                        vp.addTextColumns(
                            arrayOf(left, right),
                            META_COL_WEIGHTS,
                            intArrayOf(Align.LEFT, Align.RIGHT)
                        )
                    } else {
                        // [label LEFT 70% | price RIGHT 30%]
                        vp.addTextColumns(
                            arrayOf(left, right),
                            TWO_COL_WEIGHTS,
                            intArrayOf(Align.LEFT, Align.RIGHT)
                        )
                    }
                }

                "divider" -> {
                    setVectorFormat(vp, false, 1.0f, 1.0f)
                    val style = node.getString("style")
                    val weight = node.optString("weight", "normal")
                    val strokeStyle = when (style) {
                        "dotted" -> StrokeStyle.DOT
                        "dashed" -> StrokeStyle.DASH
                        else     -> StrokeStyle.LINE
                    }
                    if (weight == "bold") {
                        // Two lines close together = visually thick section separator
                        vp.addDividingLine(StrokeStyle.LINE, 6)
                        vp.addDividingLine(StrokeStyle.LINE, 6)
                    } else {
                        vp.addDividingLine(strokeStyle, DIVIDER_MARGIN_PX)
                    }
                }

                "empty_line" -> {
                    vp.addText("\n", Align.LEFT, 0)
                }

                "feed" -> {
                    val lines = node.getInt("lines")
                    vp.addText("\n".repeat(lines), Align.LEFT, 0)
                }

                "qr_code" -> {
                    setVectorFormat(vp, false, 1.0f, 1.0f)
                    val data = node.getString("data")
                    val size = node.optInt("size", 8)
                    vp.addQrCode(size, ECLevel.M, data, ByteArray(0), Align.CENTER, 0)
                    vp.feedLine(1)
                }

                "cut" -> {
                    Log.w(TAG, "cut node reached renderNodeVector — ignored (deferred to post-print)")
                }

                "barcode" -> {
                    Log.d(TAG, "Skipping barcode node — not supported on built-in thermal printer")
                }

                "image" -> {
                    // TODO(landi-logo): VectorPrinter currently has no bitmap API exposed
                    // in com.sdksuite.omnidriver. To enable logo printing on the C20Pro,
                    // check the SDK AAR for a printBitmap/addImage call on either
                    // VectorPrinter or the simple Printer, and wire it up here. Until
                    // then, the JS side filters image nodes in LandiDriver.ts; the
                    // showLogo toggle in receipt-templates settings notes this gap.
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
                // OnPrintListener fires on the main thread — offload the drawer
                // warm-up IPC + resolve so the UI thread isn't held. See the
                // VectorPrinter path (finishVectorPrint) for the full rationale.
                Log.d(TAG, "SimplePrinter onSuccess on thread=${Thread.currentThread().name} — offloading teardown")
                printExecutor.execute {
                    warmCashBox()
                    promise.resolve(true)
                }
            }

            override fun onFail(errorCode: Int) {
                Log.e(TAG, "SimplePrinter onFail on thread=${Thread.currentThread().name} — offloading teardown")
                printExecutor.execute {
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
                    val left = sanitizeForLandi(node.getString("left")).trimStart()
                    val right = sanitizeForLandi(node.getString("right"))
                    val fmt = node.optJSONObject("format")
                    val isBold = fmt?.optBoolean("bold", false) == true
                    applySimpleFormat(p, fmt)
                    val lineWidth = if (isBold) BOLD_CPL else NORMAL_CPL
                    val pad = lineWidth - left.length - right.length
                    val line = if (pad > 0) left + " ".repeat(pad) + right else "$left $right"
                    Log.d(TAG, "two_col(simple): bold=$isBold lw=$lineWidth left='$left' right='$right' pad=$pad")
                    p.addText(line + "\n", Align.LEFT, 0)
                }

                "divider" -> {
                    val lineWidth = node.optInt("lineWidth", DIVIDER_CPL)
                    val style = node.getString("style")
                    val weight = node.optString("weight", "normal")
                    val separator = when {
                        weight == "bold" -> "=".repeat(lineWidth)
                        style == "dotted" -> "- ".repeat(lineWidth / 2).take(lineWidth)
                        style == "double" -> "=".repeat(DOUBLE_DIV_CPL)
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

        val size = if (bold && !doubleH && !doubleW) ASCSize.DOT32x12 else ASCSize.DOT24x12

        setFormatIfChanged(p, size, scale)
    }

    // ==================== DENSITY ====================

    @ReactMethod
    fun setPrintDensity(level: Int, promise: Promise) {
        drawerExecutor.execute {
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
        drawerExecutor.execute {
            try {
                if (!isInitialized) {
                    Log.w(TAG, "openCashDrawer called but not initialized — attempting init first")
                    promise.reject("DRAWER_FAILED", "Printer not initialized. Call initPrinter() first.")
                    return@execute
                }

                val cb = cashBox
                if (cb != null) {
                    try {
                        cb.openBox()
                        Log.d(TAG, "Cash drawer opened via CashBox")
                        promise.resolve(true)
                        return@execute
                    } catch (e: Exception) {
                        Log.w(TAG, "CashBox.openBox() failed (stale reference?): ${e.javaClass.simpleName}: ${e.message}")
                        cashBox = null
                    }
                }

                Log.d(TAG, "Re-acquiring CashBox from OmniDriver...")
                try {
                    val driver = OmniDriver.me(reactContext)
                    val freshBox = driver.getCashBox(Bundle())
                    cashBox = freshBox
                    if (freshBox != null) {
                        freshBox.openBox()
                        Log.d(TAG, "Cash drawer opened via re-acquired CashBox")
                        promise.resolve(true)
                        return@execute
                    } else {
                        Log.w(TAG, "getCashBox() returned null on re-acquire")
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "CashBox re-acquire/openBox failed: ${e.javaClass.simpleName}: ${e.message}")
                    cashBox = null
                }

                val p = printer
                if (p != null) {
                    try {
                        val method = p.javaClass.getMethod("openCashDrawer")
                        method.invoke(p)
                        Log.d(TAG, "Cash drawer opened via Printer.openCashDrawer() reflection")
                        promise.resolve(true)
                        return@execute
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
    }

    // ==================== CASH BOX WARM-UP ====================

    /**
     * Pre-acquire the CashBox reference so it's ready when the drawer kick
     * is requested. Called after each successful print to prevent stale-reference
     * latency (100-500ms re-acquisition on real hardware).
     */
    private fun warmCashBox() {
        try {
            val driver = OmniDriver.me(reactContext)
            cashBox = driver.getCashBox(Bundle())
            Log.d(TAG, "CashBox reference warmed after print")
        } catch (e: Exception) {
            Log.w(TAG, "warmCashBox (non-fatal): ${e.message}")
        }
    }

    // ==================== SHARED UTILITIES ====================

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
        drawerExecutor.execute {
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
    }

    // ==================== LIFECYCLE ====================

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}