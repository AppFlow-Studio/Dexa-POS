import { useToast } from "@/contexts/ToastContext";
import { getMenuItemCategory, getMenuItemCostOfGoods } from "@/lib/chartUtils";
import { useAnalyticsStore } from "@/stores/useAnalyticsStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { Check, Mail, Printer } from "lucide-react-native";
import React, { useEffect } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";

const PaymentSuccessView = () => {
  const { close, paymentMethod, activeTableId } = usePaymentStore();
  const { updateSessionStatus } = useFloorPlanStore();
  const { show } = useToast();

  const {
    activeOrderId,
    orders,
    activeOrderTotal,
    activeOrderOutstandingTotal,
  } = useOrderStore();
  const { menuItems } = useMenuStore();
  const { addSaleEvent, forceRefresh } = useAnalyticsStore();

  // NOTE: Payment was already processed by handlePaymentCompletion
  // before navigating to this view. No need to call addPaymentToOrder again.

  // Ensure isDirty is false when this view mounts, as payment is complete
  useEffect(() => {
    usePaymentStore.getState().setPaymentClean();
  }, []);

  const activeOrder = orders.find((o) => o.id === activeOrderId);
  const items = activeOrder?.items || [];

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
    const saleEvents = items.map((item) => ({
      date: new Date().toISOString(),
      itemName: item.name,
      menuItemId: item.menuItemId,
      quantitySold: item.quantity,
      salePrice: item.price,
      costOfGoods: getMenuItemCostOfGoods(item.menuItemId, menuItems),
      category: getMenuItemCategory(item.menuItemId, menuItems),
      employeeId: activeOrder?.server_name || "Unknown",
      paymentMethod: paymentMethod || "Card",
      orderId: activeOrderId || undefined,
    }));
    addSaleEvent(saleEvents);
    setTimeout(() => {
      try {
        forceRefresh();
      } catch {}
    }, 150);

    // For dine-in orders on a table, we just want to close the sheet
    // The payment is already processed and status is set optimistically
    if (activeOrder?.order_type === "Dine In" && activeTableId) {
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

      const currentOrder = useOrderStore
        .getState()
        .orders.find((o) => o.id === activeOrderId);

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

  const handlePrint = () => {
    show({
      title: "Printing Receipt",
      message: "Sent to printer.",
      type: "success",
    });
  };

  const handleEmail = () => {
    show({
      title: "Email Sent",
      message: "Receipt emailed to customer.",
      type: "success",
    });
  };

  return (
    <View className="flex-1 bg-[#212121] justify-between">
      {/* Main Content - Centered vertically if possible */}
      <View className="flex-1 justify-center items-center px-6">
        {/* Success Icon */}
        <Animated.View
          entering={FadeIn.delay(100)}
          className="items-center mb-6"
        >
          <View className="w-24 h-24 bg-green-500 rounded-full items-center justify-center mb-4 shadow-lg shadow-green-900/20 border-4 border-[#212121]">
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
          className="w-full max-w-sm bg-[#2A2A2A] rounded-2xl border border-[#333] p-6 items-center"
        >
          {/* Calculate totals from ALL payments (for split payments) */}
          {(() => {
            const payments = activeOrder?.payments || [];

            // Sum all payments and tips
            const totalPaid = payments.reduce(
              (sum, p) => sum + (p.amount || 0),
              0
            );
            const totalTips = payments.reduce((sum, p) => {
              const tip = (p as any)?.tipAmount || p?.tip_amount || 0;
              return sum + tip;
            }, 0);
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
                      <Text className="text-gray-400 text-sm mr-2">
                        {payments.length > 1 ? "Total Tips:" : "Tip:"}
                      </Text>
                      <Text className="text-green-400 text-lg font-bold">
                        +${totalTips.toFixed(2)}
                      </Text>
                    </View>
                    <View className="w-full h-[1px] bg-[#404040] mb-2" />
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

          <View className="w-full h-[1px] bg-[#404040] mb-4" />

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
      <View className="w-full bg-[#212121] pt-2 pb-4 border-t border-[#333]">
        <View className="px-4 gap-y-3">
          {/* Secondary Actions Row */}
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={handlePrint}
              className="flex-1 py-3 bg-[#2A2A2A] rounded-xl border border-[#404040] flex-row items-center justify-center active:bg-[#333] gap-2"
            >
              <Printer size={18} color="#9CA3AF" className="mr-2" />
              <Text className="text-gray-300 font-semibold">Print Receipt</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleEmail}
              className="flex-1 py-3 bg-[#2A2A2A] rounded-xl border border-[#404040] flex-row items-center justify-center active:bg-[#333] gap-2"
            >
              <Mail size={18} color="#9CA3AF" className="mr-2" />
              <Text className="text-gray-300 font-semibold">Email Receipt</Text>
            </TouchableOpacity>
          </View>

          {/* Primary Action */}
          <TouchableOpacity
            onPress={handleDone}
            className="w-full py-4 bg-blue-600 rounded-xl items-center shadow-lg shadow-blue-900/20 active:bg-blue-700"
          >
            <Text className="text-white font-bold text-xl">
              {activeOrder?.order_type === "Dine In"
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
