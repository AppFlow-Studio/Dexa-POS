"use no memo";

import { useToast } from "@/contexts/ToastContext";
import { colors } from "@/lib/theme";
import { PrinterService } from "@/services/printing/PrinterService";
import { useNoPrinterModalStore } from "@/stores/useNoPrinterModalStore";
import { useActiveOrder } from "@/stores/selectors/orderSelectors";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { Check, Mail, Printer } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { iosOnly } from "@/lib/safeAnimations";

const PaymentSuccessView = () => {
  const close = usePaymentStore((s) => s.close);
  const paymentMethod = usePaymentStore((s) => s.paymentMethod);
  const completedPaymentInfo = usePaymentStore((s) => s.completedPaymentInfo);
  const activeTableId = usePaymentStore((s) => s.activeTableId);
  const updateSessionStatus = useFloorPlanStore((s) => s.updateSessionStatus);
  const { show } = useToast();

  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const autoPrintReceipt = useLocationConfigStore((s) => s.config.printing.autoPrintReceipt);

  const activeOrderId = useOrderStore((s) => s.activeOrderId);

  const [isPrinting, setIsPrinting] = useState(false);
  // const { addSaleEvent, forceRefresh } = useAnalyticsStore();
  // NOTE: Payment was already processed by handlePaymentCompletion
  // before navigating to this view. No need to call addPaymentToOrder again.

  // Ensure isDirty is false when this view mounts, as payment is complete
  useEffect(() => {
    usePaymentStore.getState().setPaymentClean();
  }, []);

  // Auto-print receipt on mount when setting enabled
  useEffect(() => {
    if (autoPrintReceipt && activeOrderId) {
      const order = useOrderStore.getState().ordersById[activeOrderId];
      if (order && selectedStore) {
        PrinterService.printReceipt(order, selectedStore)
          .catch((e) => console.warn("[PaymentSuccessView] Auto-print receipt failed:", e));
      }
    }
  }, []); // Run once on mount — payment just completed

  const activeOrder = useActiveOrder();
  const items = activeOrder?.items || [];
  // console.log("[PaymentSuccessView] items", items);
  // console.log("[PaymentSuccessView] activeOrder", activeOrder);
  const handleDone = () => {
    const {
      activeOrderId,
      setOpenedAt,
      updateOrderStatus,
      markOrderAsPaid,
      startNewOrder,
      setActiveOrder,
      archiveOrder,
      sendNewItemsToKitchenForOrder,
    } = useOrderStore.getState();

    // Analytics...
    // const saleEvents = items.map((item) => ({
    //   date: new Date().toISOString(),
    //   itemName: item.name,
    //   menuItemId: item.menuItemId,
    //   quantitySold: item.quantity,
    //   salePrice: item.price,
    //   costOfGoods: getMenuItemCostOfGoods(item.menuItemId, menuItems),
    //   category: getMenuItemCategory(item.menuItemId, menuItems),
    //   employeeId: activeOrder?.server_name || "Unknown",
    //   paymentMethod: paymentMethod || "Card",
    //   orderId: activeOrderId || undefined,
    // }));
    // addSaleEvent(saleEvents);
    // setTimeout(() => {
    //   try {
    //     forceRefresh();
    //   } catch {}
    // }, 150);

    // For dine-in orders on a table, we just want to close the sheet
    // The payment is already processed and status is set optimistically
    if (activeOrder?.order_type === "dine_in" && activeTableId) {
      close();
      return;
    }

    // For quick service / takeout, start a new order immediately
    setTimeout(() => {
      const newOrder = startNewOrder();
      setActiveOrder(newOrder.id);
    }, 100);

    // Only update these for non-completed orders (which shouldn't happen here anyway)
    // but kept for safety if flow changes
    if (activeOrderId && activeOrder?.check_status !== "Closed") {
      setOpenedAt(activeOrderId, new Date().toISOString());

      const currentOrder = activeOrderId
        ? useOrderStore.getState().ordersById[activeOrderId]
        : undefined;

      if (currentOrder?.order_status === "draft") {
        sendNewItemsToKitchenForOrder(activeOrderId);
      }
    }

    if (
      activeOrder?.order_type === "takeout" &&
      activeOrder.order_status === "ready"
    ) {
      setTimeout(() => archiveOrder(activeOrder?.id), 500);
    }
    close();
  };

  const handlePrint = async () => {
    if (!activeOrder || !selectedStore) {
      show({ title: "Print Error", message: "No order or store available.", type: "error" });
      return;
    }
    setIsPrinting(true);
    try {
      const success = await PrinterService.printReceipt(activeOrder, selectedStore);
      if (success) {
        show({ title: "Printing Receipt", message: "Sent to printer.", type: "success" });
      } else {
        useNoPrinterModalStore.getState().show("receipt");
      }
    } catch (e) {
      console.warn("[PaymentSuccessView] Print failed:", e);
      show({ title: "Print Error", message: "Failed to send to printer.", type: "error" });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleEmail = () => {
    show({
      title: "Email Sent",
      message: "Receipt emailed to customer.",
      type: "success",
    });
  };

  return (
    <View className="flex-1 justify-between" style={{ backgroundColor: colors.screen }}>
      {/* Main Content - Centered vertically if possible */}
      <View className="flex-1 justify-center items-center px-6" style={{ paddingTop: 28, paddingBottom: 28 }}>
        {/* Success Icon */}
        <Animated.View
          entering={iosOnly(FadeIn.delay(100))}
          className="items-center mb-6"
          style={{ marginTop: 8 }}
        >
          <View style={{ width: 80, height: 80, backgroundColor: colors.success + "15", borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 20, borderWidth: 2, borderColor: colors.success + "40" }}>
            <Check color={colors.success} size={44} strokeWidth={3.5} />
          </View>
          <Text style={{ fontSize: 28, fontWeight: "800", color: colors.heading, marginBottom: 8 }}>
            Payment Successful
          </Text>
          <Text style={{ fontSize: 14, color: colors.label, fontWeight: "600" }}>
            {(completedPaymentInfo?.paymentMethod || paymentMethod || "Card")} Payment
          </Text>
        </Animated.View>

        {/* Compact Receipt Card */}
        <Animated.View
          entering={iosOnly(FadeInUp.delay(200))}
          style={{ width: "100%", maxWidth: 400, backgroundColor: colors.panel, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 22, alignItems: "center" }}
        >
          {/* Use captured payment info from store to prevent real-time sync overwrites */}
          {(() => {
            // Read from completedPaymentInfo snapshot instead of live payments
            // Fall back to calculating from payments if completedPaymentInfo is not set
            // (shouldn't happen, but provides safety)
            let totalPaid = completedPaymentInfo?.totalPaid ?? 0;
            let totalTips = completedPaymentInfo?.totalTips ?? 0;
            console.log('completedPaymentInfo', completedPaymentInfo);
            if (!completedPaymentInfo) {
              // Fallback: calculate from live payments (original behavior)
              // Calculate effective total paid (subtract refunded amounts)
              const payments = activeOrder?.payments || [];
              totalPaid = payments.reduce(
                (sum, p) => sum + (p.amount || 0) - (p.refundedAmount || 0),
                0
              );
              totalTips = payments.reduce((sum, p) => {
                const tip = (p as any)?.tipAmount || p?.tip_amount || 0;
                return sum + tip;
              }, 0);
              console.warn(
                "[PaymentSuccessView] completedPaymentInfo not set, using fallback calculation"
              );
            }

            console.log(
              "[PaymentSuccessView] totalPaid:",
              totalPaid,
              "from completedPaymentInfo:",
              !!completedPaymentInfo
            );

            const grandTotal = totalPaid + totalTips;

            return (
              <>
                {totalTips > 0 ? (
                  <>
                    <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 }}>
                      Bill Total
                    </Text>
                    <Text style={{ fontSize: 26, fontWeight: "700", color: colors.heading, marginBottom: 10 }}>
                      ${totalPaid.toFixed(2)}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                      <Text style={{ color: colors.muted, fontSize: 12, marginRight: 8 }}>Tip:</Text>
                      <Text style={{ color: colors.success, fontSize: 17, fontWeight: "700" }}>
                        +${totalTips.toFixed(2)}
                      </Text>
                    </View>
                    <View style={{ width: "100%", height: 1, backgroundColor: colors.border, marginBottom: 12 }} />
                    <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 }}>
                      Grand Total
                    </Text>
                    <Text style={{ fontSize: 38, fontWeight: "800", color: colors.teal, marginBottom: 14 }}>
                      ${grandTotal.toFixed(2)}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 }}>
                      Total Paid
                    </Text>
                    <Text style={{ fontSize: 42, fontWeight: "800", color: colors.teal, marginBottom: 24 }}>
                      ${totalPaid.toFixed(2)}
                    </Text>
                  </>
                )}
              </>
            );
          })()}

          <View style={{ width: "100%", height: 1, backgroundColor: colors.border, marginBottom: 18 }} />

          <View style={{ flexDirection: "row", justifyContent: "space-between", width: "100%", marginBottom: 12 }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>Transaction ID</Text>
            <Text style={{ color: colors.heading, fontWeight: "600", fontSize: 13 }}>
              #{activeOrder?.id.slice(-6).toUpperCase()}
            </Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", width: "100%" }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>Date</Text>
            <Text style={{ color: colors.heading, fontWeight: "600", fontSize: 13 }}>
              {new Date().toLocaleDateString()}
            </Text>
          </View>
        </Animated.View>
      </View>

      {/* Footer Actions - Fixed at Bottom */}
      <View style={{ width: "100%", backgroundColor: colors.panel, paddingTop: 12, paddingBottom: 16, borderTopWidth: 1, borderTopColor: colors.border }}>
        <View style={{ paddingHorizontal: 20, gap: 10 }}>
          {/* Secondary Actions Row */}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={handlePrint}
              disabled={isPrinting}
              style={{ flex: 1, paddingVertical: 8, backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, opacity: isPrinting ? 0.6 : 1 }}
            >
              {isPrinting ? (
                <ActivityIndicator size="small" color={colors.label} />
              ) : (
                <Printer size={13} color={colors.label} />
              )}
              <Text style={{ color: colors.heading, fontWeight: "600", fontSize: 11 }}>
                {isPrinting ? "Printing..." : "Print"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleEmail}
              style={{ flex: 1, paddingVertical: 8, backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}
            >
              <Mail size={13} color={colors.label} />
              <Text style={{ color: colors.heading, fontWeight: "600", fontSize: 11 }}>Email</Text>
            </TouchableOpacity>
          </View>

          {/* Primary Action */}
          <TouchableOpacity
            onPress={handleDone}
            style={{ width: "100%", paddingVertical: 10, backgroundColor: colors.teal, borderRadius: 8, alignItems: "center", shadowColor: colors.teal, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 }}
          >
            <Text style={{ color: colors.onSolid, fontWeight: "700", fontSize: 13 }}>
              {activeOrder?.order_type === "dine_in" || activeOrder?.order_type == 'Dine In'
                ? "Finalize Payment"
                : "Start New Order"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default PaymentSuccessView;
