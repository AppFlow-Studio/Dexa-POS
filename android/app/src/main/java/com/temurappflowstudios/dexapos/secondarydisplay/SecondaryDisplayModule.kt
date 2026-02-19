package com.temurappflowstudios.dexapos.secondarydisplay

import android.content.Context
import android.hardware.display.DisplayManager
import android.os.Bundle
import android.util.Log
import android.view.Display
import com.facebook.react.bridge.*

class SecondaryDisplayModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val TAG = "SecondaryDisplay"
        const val NAME = "SecondaryDisplayModule"
    }

    override fun getName(): String = NAME

    private var presentation: SecondaryDisplayPresentation? = null
    private var currentDisplayId: Int = -1

    @ReactMethod
    fun updateDisplay(data: ReadableMap) {
        try {
            val screenState = data.getString("screenState") ?: "idle"
            val restaurantName = data.getString("restaurantName") ?: ""

            val secondaryDisplay = findSecondaryDisplay()
            if (secondaryDisplay == null) {
                Log.d(TAG, "No secondary display found, skipping update")
                return
            }

            // Create or recreate presentation if needed
            if (presentation == null || currentDisplayId != secondaryDisplay.displayId) {
                presentation?.dismiss()
                val activity = currentActivity
                if (activity == null) {
                    Log.w(TAG, "No current activity, cannot create Presentation")
                    return
                }
                presentation = SecondaryDisplayPresentation(activity, secondaryDisplay)
                presentation?.show()
                currentDisplayId = secondaryDisplay.displayId
                Log.d(TAG, "Created presentation on display ${secondaryDisplay.displayId}")
            }

            val pres = presentation ?: return

            // Route based on screen state
            when (screenState) {
                "idle" -> pres.showIdle(restaurantName)
                "payment" -> {
                    val cardTotal = if (data.hasKey("cardTotal")) data.getInt("cardTotal") else 0
                    pres.showPayment(formatCents(cardTotal))
                }
                "processing" -> pres.showProcessing()
                "approved" -> pres.showApproved()
                "declined" -> pres.showDeclined()
                "ordering", "tip_selection" -> {
                    val bundle = readableMapToBundle(data)
                    pres.updateOrder(bundle)
                }
                else -> {
                    val bundle = readableMapToBundle(data)
                    pres.updateOrder(bundle)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error updating display: ${e.message}", e)
        }
    }

    @ReactMethod
    fun dismiss() {
        try {
            presentation?.dismiss()
            presentation = null
            currentDisplayId = -1
            Log.d(TAG, "Presentation dismissed")
        } catch (e: Exception) {
            Log.e(TAG, "Error dismissing presentation: ${e.message}", e)
        }
    }

    override fun invalidate() {
        super.invalidate()
        try {
            presentation?.dismiss()
            presentation = null
            currentDisplayId = -1
        } catch (e: Exception) {
            Log.e(TAG, "Error during invalidate: ${e.message}", e)
        }
    }

    // ==================== HELPERS ====================

    private fun findSecondaryDisplay(): Display? {
        val displayManager = reactContext.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
            ?: return null

        // Tier 1: Presentation category displays
        val presentationDisplays = displayManager.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION)
        val tier1 = presentationDisplays.firstOrNull { display ->
            display.displayId != Display.DEFAULT_DISPLAY &&
                display.state != Display.STATE_OFF
        }
        if (tier1 != null) return tier1

        // Tier 2: Any non-default display with state != OFF
        val allDisplays = displayManager.displays
        val tier2 = allDisplays.firstOrNull { display ->
            display.displayId != Display.DEFAULT_DISPLAY &&
                display.state != Display.STATE_OFF
        }
        if (tier2 != null) return tier2

        // Tier 2 relaxed: Any non-default display regardless of state
        return allDisplays.firstOrNull { display ->
            display.displayId != Display.DEFAULT_DISPLAY
        }
    }

    private fun readableMapToBundle(map: ReadableMap): Bundle {
        val bundle = Bundle()

        bundle.putString("restaurantName", map.getString("restaurantName") ?: "")
        bundle.putString("orderNumber", map.getString("orderNumber") ?: "")
        bundle.putString("orderType", map.getString("orderType") ?: "")
        bundle.putInt("guestCount", if (map.hasKey("guestCount") && !map.isNull("guestCount")) map.getInt("guestCount") else 0)
        bundle.putInt("cardSubtotal", if (map.hasKey("cardSubtotal")) map.getInt("cardSubtotal") else 0)
        bundle.putInt("cashSubtotal", if (map.hasKey("cashSubtotal")) map.getInt("cashSubtotal") else 0)
        bundle.putInt("discountAmount", if (map.hasKey("discountAmount")) map.getInt("discountAmount") else 0)
        bundle.putInt("cardTax", if (map.hasKey("cardTax")) map.getInt("cardTax") else 0)
        bundle.putInt("cashTax", if (map.hasKey("cashTax")) map.getInt("cashTax") else 0)
        bundle.putInt("cardTotal", if (map.hasKey("cardTotal")) map.getInt("cardTotal") else 0)
        bundle.putInt("cashTotal", if (map.hasKey("cashTotal")) map.getInt("cashTotal") else 0)
        bundle.putInt("amountPaid", if (map.hasKey("amountPaid")) map.getInt("amountPaid") else 0)

        // Convert items array
        if (map.hasKey("items") && !map.isNull("items")) {
            val itemsArray = map.getArray("items")
            val itemBundles = ArrayList<Bundle>()

            if (itemsArray != null) {
                for (i in 0 until itemsArray.size()) {
                    val itemMap = itemsArray.getMap(i) ?: continue
                    val itemBundle = Bundle().apply {
                        putString("name", itemMap.getString("name") ?: "")
                        putInt("quantity", if (itemMap.hasKey("quantity")) itemMap.getInt("quantity") else 1)
                        putInt("cardPrice", if (itemMap.hasKey("cardPrice")) itemMap.getInt("cardPrice") else 0)
                        putInt("cashPrice", if (itemMap.hasKey("cashPrice")) itemMap.getInt("cashPrice") else 0)
                        putInt("cardLineTotal", if (itemMap.hasKey("cardLineTotal")) itemMap.getInt("cardLineTotal") else 0)
                        putInt("cashLineTotal", if (itemMap.hasKey("cashLineTotal")) itemMap.getInt("cashLineTotal") else 0)
                        putString("notes", if (itemMap.hasKey("notes") && !itemMap.isNull("notes")) itemMap.getString("notes") else null)

                        // Convert modifiers array to string list
                        val modStrings = ArrayList<String>()
                        if (itemMap.hasKey("modifiers") && !itemMap.isNull("modifiers")) {
                            val modsArray = itemMap.getArray("modifiers")
                            if (modsArray != null) {
                                for (j in 0 until modsArray.size()) {
                                    modStrings.add(modsArray.getString(j) ?: "")
                                }
                            }
                        }
                        putStringArrayList("modifiers", modStrings)
                    }
                    itemBundles.add(itemBundle)
                }
            }

            bundle.putParcelableArrayList("items", itemBundles)
        }

        return bundle
    }

    private fun formatCents(cents: Int): String {
        val dollars = cents / 100
        val remainder = cents % 100
        return "$${dollars}.${String.format("%02d", remainder)}"
    }
}
