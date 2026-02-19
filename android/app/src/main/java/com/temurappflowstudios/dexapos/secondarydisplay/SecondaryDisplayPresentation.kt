package com.temurappflowstudios.dexapos.secondarydisplay

import android.app.Presentation
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.util.TypedValue
import android.view.Display
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView

class SecondaryDisplayPresentation(context: Context, display: Display) :
    Presentation(context, display) {

    companion object {
        const val TAG = "SecondaryDisplay"

        // Colors
        const val COLOR_BG = 0xFF1A1A2E.toInt()
        const val COLOR_CARD_BG = 0xFF16213E.toInt()
        const val COLOR_DIVIDER = 0xFF2A2A4A.toInt()
        const val COLOR_WHITE = 0xFFFFFFFF.toInt()
        const val COLOR_LIGHT_GRAY = 0xFFB0B0C0.toInt()
        const val COLOR_GREEN = 0xFF10B981.toInt()
        const val COLOR_RED = 0xFFEF4444.toInt()
        const val COLOR_YELLOW = 0xFFF59E0B.toInt()
        const val COLOR_TOTAL_BG = 0xFF0F3460.toInt()
    }

    // Main layout areas
    private lateinit var rootLayout: FrameLayout
    private lateinit var orderLayout: LinearLayout
    private lateinit var headerText: TextView
    private lateinit var orderInfoBar: LinearLayout
    private lateinit var orderNumberText: TextView
    private lateinit var orderTypeText: TextView
    private lateinit var guestCountText: TextView
    private lateinit var itemsContainer: LinearLayout
    private lateinit var totalsContainer: LinearLayout
    private lateinit var grandTotalCard: LinearLayout

    // Status overlay
    private lateinit var statusOverlay: FrameLayout
    private lateinit var statusIcon: TextView
    private lateinit var statusText: TextView
    private lateinit var statusSpinner: ProgressBar

    // Idle overlay
    private lateinit var idleOverlay: LinearLayout
    private lateinit var idleTitle: TextView
    private lateinit var idleSubtitle: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildLayout()
        showIdleState("Welcome!")
        Log.d(TAG, "Presentation created on display ${display.displayId}")
    }

    // ==================== LAYOUT BUILDING ====================

    private fun buildLayout() {
        rootLayout = FrameLayout(context).apply {
            setBackgroundColor(COLOR_BG)
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        // Main order content (scrollable)
        orderLayout = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setPadding(dpToPx(16), dpToPx(16), dpToPx(16), dpToPx(16))
        }

        buildHeader()
        buildOrderInfoBar()
        buildItemsSection()
        buildTotalsSection()
        buildGrandTotalCard()

        rootLayout.addView(orderLayout)

        // Status overlay (for payment/processing/approved/declined)
        buildStatusOverlay()
        rootLayout.addView(statusOverlay)

        // Idle overlay
        buildIdleOverlay()
        rootLayout.addView(idleOverlay)

        setContentView(rootLayout)
    }

    private fun buildHeader() {
        headerText = TextView(context).apply {
            setTextColor(COLOR_WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 28f)
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setPadding(0, dpToPx(12), 0, dpToPx(12))
        }
        orderLayout.addView(headerText)

        // Header divider
        orderLayout.addView(createDivider())
    }

    private fun buildOrderInfoBar() {
        orderInfoBar = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dpToPx(8), 0, dpToPx(8))
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }

        orderNumberText = TextView(context).apply {
            setTextColor(COLOR_WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            typeface = Typeface.DEFAULT_BOLD
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }

        orderTypeText = TextView(context).apply {
            setTextColor(COLOR_LIGHT_GRAY)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }

        guestCountText = TextView(context).apply {
            setTextColor(COLOR_LIGHT_GRAY)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            gravity = Gravity.END
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }

        orderInfoBar.addView(orderNumberText)
        orderInfoBar.addView(orderTypeText)
        orderInfoBar.addView(guestCountText)

        orderLayout.addView(orderInfoBar)
        orderLayout.addView(createDivider())
    }

    private fun buildItemsSection() {
        val scrollView = ScrollView(context).apply {
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f // Takes remaining space
            )
            isVerticalScrollBarEnabled = false
        }

        itemsContainer = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }

        scrollView.addView(itemsContainer)
        orderLayout.addView(scrollView)
    }

    private fun buildTotalsSection() {
        orderLayout.addView(createDivider())

        totalsContainer = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dpToPx(8), 0, dpToPx(8))
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }
        orderLayout.addView(totalsContainer)
    }

    private fun buildGrandTotalCard() {
        orderLayout.addView(createDivider())

        grandTotalCard = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(COLOR_TOTAL_BG)
            setPadding(dpToPx(16), dpToPx(12), dpToPx(16), dpToPx(12))
            val lp = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
            lp.topMargin = dpToPx(8)
            lp.bottomMargin = dpToPx(8)
            layoutParams = lp
        }
        orderLayout.addView(grandTotalCard)
    }

    private fun buildStatusOverlay() {
        statusOverlay = FrameLayout(context).apply {
            setBackgroundColor(COLOR_BG)
            visibility = View.GONE
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        val innerLayout = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        statusIcon = TextView(context).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 72f)
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dpToPx(24))
        }

        statusSpinner = ProgressBar(context).apply {
            isIndeterminate = true
            visibility = View.GONE
            val lp = LinearLayout.LayoutParams(dpToPx(64), dpToPx(64))
            lp.gravity = Gravity.CENTER
            lp.bottomMargin = dpToPx(24)
            layoutParams = lp
        }

        statusText = TextView(context).apply {
            setTextColor(COLOR_WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 32f)
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        }

        innerLayout.addView(statusIcon)
        innerLayout.addView(statusSpinner)
        innerLayout.addView(statusText)
        statusOverlay.addView(innerLayout)
    }

    private fun buildIdleOverlay() {
        idleOverlay = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(COLOR_BG)
            visibility = View.GONE
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        idleTitle = TextView(context).apply {
            setTextColor(COLOR_WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 36f)
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dpToPx(16))
        }

        idleSubtitle = TextView(context).apply {
            setTextColor(COLOR_GREEN)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 24f)
            gravity = Gravity.CENTER
        }

        idleOverlay.addView(idleTitle)
        idleOverlay.addView(idleSubtitle)
    }

    // ==================== PUBLIC UPDATE METHODS ====================

    fun updateOrder(data: Bundle) {
        post {
            try {
                orderLayout.visibility = View.VISIBLE
                statusOverlay.visibility = View.GONE
                idleOverlay.visibility = View.GONE

                // Header
                val restaurantName = data.getString("restaurantName", "")
                headerText.text = restaurantName

                // Order info
                val orderNumber = data.getString("orderNumber", "")
                val orderType = data.getString("orderType", "")
                val guestCount = data.getInt("guestCount", 0)
                orderNumberText.text = if (orderNumber.isNotEmpty()) "#$orderNumber" else ""
                orderTypeText.text = orderType
                guestCountText.text = if (guestCount > 0) "$guestCount Guest${if (guestCount != 1) "s" else ""}" else ""

                // Items
                updateItems(data)

                // Totals
                updateTotals(data)

                // Grand total
                updateGrandTotal(data)
            } catch (e: Exception) {
                Log.e(TAG, "Error updating order display: ${e.message}", e)
            }
        }
    }

    fun showIdle(restaurantName: String) {
        post {
            orderLayout.visibility = View.GONE
            statusOverlay.visibility = View.GONE
            idleOverlay.visibility = View.VISIBLE
            idleTitle.text = restaurantName
            idleSubtitle.text = "Welcome!"
        }
    }

    fun showPayment(total: String) {
        post {
            orderLayout.visibility = View.GONE
            idleOverlay.visibility = View.GONE
            statusOverlay.visibility = View.VISIBLE
            statusIcon.visibility = View.VISIBLE
            statusIcon.text = "\uD83D\uDCB3" // Credit card emoji
            statusIcon.setTextColor(COLOR_WHITE)
            statusSpinner.visibility = View.GONE
            statusText.text = "Please Present Card\n$total"
            statusText.setTextColor(COLOR_WHITE)
        }
    }

    fun showProcessing() {
        post {
            orderLayout.visibility = View.GONE
            idleOverlay.visibility = View.GONE
            statusOverlay.visibility = View.VISIBLE
            statusIcon.visibility = View.GONE
            statusSpinner.visibility = View.VISIBLE
            statusText.text = "Processing..."
            statusText.setTextColor(COLOR_WHITE)
        }
    }

    fun showApproved() {
        post {
            orderLayout.visibility = View.GONE
            idleOverlay.visibility = View.GONE
            statusOverlay.visibility = View.VISIBLE
            statusIcon.visibility = View.VISIBLE
            statusIcon.text = "\u2714" // Checkmark
            statusIcon.setTextColor(COLOR_GREEN)
            statusSpinner.visibility = View.GONE
            statusText.text = "Approved \u2014 Thank You!"
            statusText.setTextColor(COLOR_GREEN)
        }
    }

    fun showDeclined() {
        post {
            orderLayout.visibility = View.GONE
            idleOverlay.visibility = View.GONE
            statusOverlay.visibility = View.VISIBLE
            statusIcon.visibility = View.VISIBLE
            statusIcon.text = "\u2718" // X mark
            statusIcon.setTextColor(COLOR_RED)
            statusSpinner.visibility = View.GONE
            statusText.text = "Payment Declined"
            statusText.setTextColor(COLOR_RED)
        }
    }

    // ==================== PRIVATE UPDATE HELPERS ====================

    private fun updateItems(data: Bundle) {
        itemsContainer.removeAllViews()

        @Suppress("DEPRECATION")
        val items = data.getParcelableArrayList<Bundle>("items") ?: return

        for (item in items) {
            val name = item.getString("name", "")
            val quantity = item.getInt("quantity", 1)
            val cardLineTotal = item.getInt("cardLineTotal", 0)
            val cashLineTotal = item.getInt("cashLineTotal", 0)
            val cardPrice = item.getInt("cardPrice", 0)
            val cashPrice = item.getInt("cashPrice", 0)
            val modifiers = item.getStringArrayList("modifiers")
            val notes = item.getString("notes")

            // Item row: "2x Item Name" on left, "$XX.XX" on right
            val itemRow = LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, dpToPx(8), 0, dpToPx(2))
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                )
            }

            val nameView = TextView(context).apply {
                text = "${quantity}\u00D7 $name"
                setTextColor(COLOR_WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            }

            val priceView = TextView(context).apply {
                text = formatCents(cardLineTotal)
                setTextColor(COLOR_WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
                gravity = Gravity.END
            }

            itemRow.addView(nameView)
            itemRow.addView(priceView)
            itemsContainer.addView(itemRow)

            // Cash price line (only if different from card price)
            if (cashPrice != cardPrice && cashLineTotal != cardLineTotal) {
                val cashRow = TextView(context).apply {
                    text = "   Cash Price: ${formatCents(cashLineTotal)}"
                    setTextColor(COLOR_GREEN)
                    setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
                    setPadding(dpToPx(16), 0, 0, 0)
                }
                itemsContainer.addView(cashRow)
            }

            // Modifiers
            modifiers?.forEach { mod ->
                val modView = TextView(context).apply {
                    text = "   $mod"
                    setTextColor(COLOR_LIGHT_GRAY)
                    setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
                    setPadding(dpToPx(16), 0, 0, 0)
                }
                itemsContainer.addView(modView)
            }

            // Notes
            if (!notes.isNullOrEmpty()) {
                val notesView = TextView(context).apply {
                    text = "   Note: $notes"
                    setTextColor(COLOR_YELLOW)
                    setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
                    setPadding(dpToPx(16), 0, 0, dpToPx(2))
                }
                itemsContainer.addView(notesView)
            }
        }
    }

    private fun updateTotals(data: Bundle) {
        totalsContainer.removeAllViews()

        val cardSubtotal = data.getInt("cardSubtotal", 0)
        val cashSubtotal = data.getInt("cashSubtotal", 0)
        val discountAmount = data.getInt("discountAmount", 0)
        val cardTax = data.getInt("cardTax", 0)

        addTotalRow("Subtotal", formatCents(cardSubtotal), COLOR_WHITE)

        if (discountAmount > 0) {
            addTotalRow("Discount", "-${formatCents(discountAmount)}", COLOR_GREEN)
        }

        addTotalRow("Tax", formatCents(cardTax), COLOR_WHITE)
    }

    private fun updateGrandTotal(data: Bundle) {
        grandTotalCard.removeAllViews()

        val cardTotal = data.getInt("cardTotal", 0)
        val cashTotal = data.getInt("cashTotal", 0)
        val savings = cardTotal - cashTotal

        // Card total (primary, larger)
        val cardRow = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }

        val cardLabel = TextView(context).apply {
            text = "CARD TOTAL"
            setTextColor(COLOR_WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
            typeface = Typeface.DEFAULT_BOLD
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }

        val cardValue = TextView(context).apply {
            text = formatCents(cardTotal)
            setTextColor(COLOR_WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.END
        }

        cardRow.addView(cardLabel)
        cardRow.addView(cardValue)
        grandTotalCard.addView(cardRow)

        // Cash total
        if (savings > 0) {
            val cashRow = LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                val lp = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                )
                lp.topMargin = dpToPx(4)
                layoutParams = lp
            }

            val cashLabel = TextView(context).apply {
                text = "CASH TOTAL"
                setTextColor(COLOR_GREEN)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            }

            val cashValue = TextView(context).apply {
                text = formatCents(cashTotal)
                setTextColor(COLOR_GREEN)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
                gravity = Gravity.END
            }

            cashRow.addView(cashLabel)
            cashRow.addView(cashValue)
            grandTotalCard.addView(cashRow)

            // Savings callout
            val savingsView = TextView(context).apply {
                text = "You Save ${formatCents(savings)} with Cash!"
                setTextColor(COLOR_GREEN)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
                typeface = Typeface.DEFAULT_BOLD
                gravity = Gravity.CENTER
                val lp = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                )
                lp.topMargin = dpToPx(8)
                layoutParams = lp
            }
            grandTotalCard.addView(savingsView)
        }
    }

    private fun addTotalRow(label: String, value: String, color: Int) {
        val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dpToPx(4), 0, dpToPx(4))
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }

        val labelView = TextView(context).apply {
            text = label
            setTextColor(COLOR_LIGHT_GRAY)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }

        val valueView = TextView(context).apply {
            text = value
            setTextColor(color)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            gravity = Gravity.END
        }

        row.addView(labelView)
        row.addView(valueView)
        totalsContainer.addView(row)
    }

    private fun showIdleState(message: String) {
        orderLayout.visibility = View.GONE
        statusOverlay.visibility = View.GONE
        idleOverlay.visibility = View.VISIBLE
        idleTitle.text = ""
        idleSubtitle.text = message
    }

    // ==================== UTILITY ====================

    private fun post(action: () -> Unit) {
        rootLayout.post(action)
    }

    private fun createDivider(): View {
        return View(context).apply {
            setBackgroundColor(COLOR_DIVIDER)
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dpToPx(1)
            )
        }
    }

    private fun dpToPx(dp: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            dp.toFloat(),
            context.resources.displayMetrics
        ).toInt()
    }

    private fun formatCents(cents: Int): String {
        val dollars = cents / 100
        val remainder = cents % 100
        return "$${dollars}.${String.format("%02d", remainder)}"
    }
}
