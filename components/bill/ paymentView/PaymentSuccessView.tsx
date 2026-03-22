import { useToast } from "@/contexts/ToastContext";
import { colors } from "@/lib/theme";
import { PrinterService } from "@/services/printing/PrinterService";
import { useNoPrinterModalStore } from "@/stores/useNoPrinterModalStore";
import { useActiveOrder } from "@/stores/selectors/orderSelectors";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { Check, Mail, Printer } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";

const PaymentSuccessView = () => {
  const close = usePaymentStore((s) => s.close);
  const paymentMethod = usePaymentStore((s) => s.paymentMethod);
  const activeTableId = usePaymentStore((s) => s.activeTableId);
  const updateSessionStatus = useFloorPlanStore((s) => s.updateSessionStatus);
  const { show } = useToast();

  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const autoPrintReceipt = useStoreSettingsStore((s) => s.autoPrintReceipt);

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
    <View className="flex-1 bg-panel justify-between">
      {/* Main Content - Centered vertically if possible */}
      <View className="flex-1 justify-center items-center px-6">
        {/* Success Icon */}
        <Animated.View
          entering={FadeIn.delay(100)}
          className="items-center mb-6"
        >
          <View className="w-24 h-24 bg-green-500 rounded-full items-center justify-center mb-4 shadow-lg shadow-green-900/20 border-4 border-panel">
            <Check color="white" size={48} strokeWidth={4} />
          </View>
          <Text className="text-3xl font-bold text-white mb-1">
            Payment Successful
          </Text>
          <Text className="text-gray-400 text-lg">
            {paymentMethod || "Card"}
          </Text>
        </Animated.View>

        {/* Compact Receipt Card */}
        <Animated.View
          entering={FadeInUp.delay(200)}
          className="w-full max-w-sm bg-surface rounded-2xl border border-border p-6 items-center"
        >
          {/* Use captured payment info from store to prevent real-time sync overwrites */}
          {(() => {
            // Read from completedPaymentInfo snapshot instead of live payments
            const { completedPaymentInfo } = usePaymentStore.getState();

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
                    <Text className="text-gray-400 text-sm uppercase tracking-widest mb-1">
                      Bill Total
                    </Text>
                    <Text className="text-3xl font-bold text-white mb-2">
                      ${totalPaid.toFixed(2)}
                    </Text>
                    <View className="flex-row items-center mb-2">
                      <Text className="text-gray-400 text-sm mr-2">Tip:</Text>
                      <Text className="text-green-400 text-lg font-bold">
                        +${totalTips.toFixed(2)}
                      </Text>
                    </View>
                    <View className="w-full h-[1px] bg-border mb-2" />
                    <Text className="text-gray-400 text-sm uppercase tracking-widest mb-1">
                      Grand Total
                    </Text>
                    <Text className="text-5xl font-bold text-white mb-4">
                      ${grandTotal.toFixed(2)}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text className="text-gray-400 text-sm uppercase tracking-widest mb-1">
                      Total Paid
                    </Text>
                    <Text className="text-5xl font-bold text-white mb-4">
                      ${totalPaid.toFixed(2)}
                    </Text>
                  </>
                )}
              </>
            );
          })()}

          <View className="w-full h-[1px] bg-border mb-4" />

          <View className="flex-row justify-between w-full mb-2">
            <Text className="text-gray-400">Transaction ID</Text>
            <Text className="text-gray-200 font-medium">
              #{activeOrder?.id.slice(-6).toUpperCase()}
            </Text>
          </View>
          <View className="flex-row justify-between w-full">
            <Text className="text-gray-400">Date</Text>
            <Text className="text-gray-200 font-medium">
              {new Date().toLocaleDateString()}
            </Text>
          </View>
        </Animated.View>
      </View>

      {/* Footer Actions - Fixed at Bottom */}
      <View className="w-full bg-panel pt-2 pb-4 border-t border-border">
        <View className="px-4 gap-y-3">
          {/* Secondary Actions Row */}
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={handlePrint}
              disabled={isPrinting}
              className={`flex-1 py-3 bg-surface rounded-xl border border-border flex-row items-center justify-center active:bg-surface gap-2 ${isPrinting ? "opacity-60" : ""}`}
            >
              {isPrinting ? (
                <ActivityIndicator size="small" color={colors.label} />
              ) : (
                <Printer size={18} color={colors.label} className="mr-2" />
              )}
              <Text className="text-gray-300 font-semibold">
                {isPrinting ? "Printing..." : "Print Receipt"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleEmail}
              className="flex-1 py-3 bg-surface rounded-xl border border-border flex-row items-center justify-center active:bg-surface gap-2"
            >
              <Mail size={18} color={colors.label} className="mr-2" />
              <Text className="text-gray-300 font-semibold">Email Receipt</Text>
            </TouchableOpacity>
          </View>

          {/* Primary Action */}
          <TouchableOpacity
            onPress={handleDone}
            className="w-full py-4 bg-teal rounded-xl items-center shadow-lg shadow-teal/20 active:bg-teal/80"
          >
            <Text className="text-white font-bold text-xl">
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
