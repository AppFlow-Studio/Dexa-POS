import { getMenuItemCategory, getMenuItemCostOfGoods } from "@/lib/chartUtils";
import { useAnalyticsStore } from "@/stores/useAnalyticsStore";
import { useDineInStore } from "@/stores/useDineInStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { Printer, ShoppingBag } from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";

// export interface SaleEvent {
//   date: string; // ISO string
//   menuItemId: string;
//   itemName: string;
//   quantitySold: number;
//   salePrice: number; // Price per item
//   costOfGoods: number; // Cost per item
//   category?: string;
//   employeeId?: string;
//   paymentMethod?: string;
// }

const ReceiptRow = ({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) => (
  <View className="flex-row justify-between items-center py-2 border-b border-dashed border-gray-700">
    <Text className="text-lg text-gray-400">{label}</Text>
    <Text className="text-lg font-semibold text-white">{value}</Text>
  </View>
);

const PaymentSuccessView = () => {
  const { close, paymentMethod, activeTableId } = usePaymentStore();
  const { updateTableStatus } = useFloorPlanStore();
  const { clearSelectedTable } = useDineInStore();
  const { decrementStockFromSale } = useInventoryStore();

  const {
    activeOrderId,
    orders,
    activeOrderSubtotal,
    activeOrderTax,
    activeOrderTotal,
    activeOrderDiscount,
    activeOrderOutstandingTotal,
    addPaymentToOrder,
  } = useOrderStore();
  const { categories, menuItems } = useMenuStore();

  const { addSaleEvent, forceRefresh } = useAnalyticsStore();

  const appliedRef = useRef(false);
  useEffect(() => {
    if (appliedRef.current) return;
    if (activeOrderId && activeOrderOutstandingTotal > 0) {
      addPaymentToOrder(
        activeOrderId,
        activeOrderOutstandingTotal,
        (paymentMethod || "Card") as any
      );
    }
    appliedRef.current = true;
  }, []);

  const activeOrder = orders.find((o) => o.id === activeOrderId);
  const items = activeOrder?.items || [];

  const handleDone = () => {
    const {
      activeOrderId,
      updateOrderStatus,
      markOrderAsPaid,
      startNewOrder,
      setActiveOrder,
      archiveOrder,
    } = useOrderStore.getState();
    // decrementStockFromSale(items);

    // Create sale events for analytics tracking
    const saleEvents = items.map((item) => {
      const saleEvent = {
        date: new Date().toISOString(),
        itemName: item.name,
        menuItemId: item.menuItemId, // Use the actual menu item ID
        quantitySold: item.quantity,
        salePrice: item.price,
        costOfGoods: getMenuItemCostOfGoods(item.menuItemId, menuItems),
        category: getMenuItemCategory(item.menuItemId, menuItems),
        employeeId: activeOrder?.server_name || "Unknown", // Use actual server name
        paymentMethod: paymentMethod || "Card",
        orderId: activeOrderId || undefined, // Add order ID for better tracking
      };

      // Debug logging
      console.log("🍟 Creating sale event:", {
        item: item.name,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity,
        category: saleEvent.category,
        date: saleEvent.date,
      });

      return saleEvent;
    });

    console.log("📊 Adding sale events to analytics:", saleEvents);
    addSaleEvent(saleEvents);
    // Nudge refresh after write to ensure dashboard updates
    setTimeout(() => {
      try {
        forceRefresh();
      } catch {}
    }, 150);

    if (activeOrderId) {
      markOrderAsPaid(activeOrderId);
    }

    if (activeOrder?.order_type === "Dine In" && activeTableId) {
      updateTableStatus(activeTableId, "In Use");
    } else {
      setTimeout(() => {
        const newOrder = startNewOrder();
        setActiveOrder(newOrder.id);
      }, 100);
    }

    if (activeOrderId) {
      updateOrderStatus(activeOrderId, "Preparing");
    }

    if (
      activeOrder?.order_type === "Takeaway" &&
      activeOrder.order_status === "Ready"
    ) {
      // A small delay can improve UX, ensuring the user sees the status change before it disappears.
      setTimeout(() => {
        archiveOrder(activeOrder?.id);
      }, 500); // 0.5 second delay
    }
    close();
  };

  const handlePrint = () => {
    toast.success("Receipt sent to printer", {
      duration: 3000,
      position: ToastPosition.BOTTOM,
    });
  };

  // Create a simplified summary for the receipt using the correct `items`
  // Don't group items by name - preserve each unique item with its modifiers
  const receiptSummary = items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    totalPrice: item.price * item.quantity,
    // Include modifier info in the name for clarity
    displayName:
      (item.customizations.modifiers &&
        item.customizations.modifiers.length > 0) ||
      item.customizations.notes
        ? `${item.name}${
            item.customizations.notes ? ` (${item.customizations.notes})` : ""
          }${
            item.customizations.modifiers &&
            item.customizations.modifiers.length > 0
              ? ` [${item.customizations.modifiers
                  .map((m) => m.categoryName)
                  .join(", ")}]`
              : ""
          }`
        : item.name,
  }));

  const totalItemsCount = items.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <View className="rounded-2xl overflow-hidden bg-[#2BAE74] w-[550px]">
      <View className="p-4 items-center">
        <View className="w-20 h-20 bg-white/20 rounded-full items-center justify-center">
          <View className="w-16 h-16 bg-white rounded-full items-center justify-center">
            <ShoppingBag color="#22c55e" size={36} />
          </View>
        </View>
        <Text className="text-3xl font-bold text-white mt-3">
          Payment Successful
        </Text>
      </View>

      <View className="p-4 bg-[#303030] rounded-b-2xl">
        <ScrollView
          className="max-h-[350px]"
          showsVerticalScrollIndicator={false}
        >
          <ReceiptRow
            label="Transaction No."
            value={activeOrder?.id.slice(-10).toUpperCase() || "N/A"}
          />
          <ReceiptRow
            label="Table"
            value={activeOrder?.service_location_id || "N/A"}
          />
          <ReceiptRow label="Payment Method" value={paymentMethod || "N/A"} />

          <View className="mt-3">
            <ReceiptRow
              label="Total Items"
              value={`${totalItemsCount} Items`}
            />
            {receiptSummary.map((item, index) => (
              <ReceiptRow
                key={`${item.name}_${index}`}
                label={`${item.name} (${item.quantity}) X`}
                value={`${item.totalPrice.toFixed(2)}`}
              />
            ))}
          </View>

          <View className="mt-3">
            <ReceiptRow
              label="Subtotal"
              value={`$${activeOrderSubtotal.toFixed(2)}`}
            />
            {activeOrderDiscount > 0 && (
              <ReceiptRow
                label="Discount"
                value={`-$${activeOrderDiscount.toFixed(2)}`}
              />
            )}
            <ReceiptRow label="Tax" value={`$${activeOrderTax.toFixed(2)}`} />
          </View>

          <View className="flex-row justify-between items-center pt-3 border-t border-dashed border-gray-600 mt-3">
            <Text className="text-2xl font-bold text-white">Total</Text>
            <Text className="text-2xl font-bold text-white">
              ${activeOrderTotal.toFixed(2)}
            </Text>
          </View>
        </ScrollView>

        <View className="border-t border-gray-700 pt-4 mt-4">
          <View className="flex-row gap-4 mb-2">
            <TouchableOpacity
              onPress={handlePrint}
              className="flex-1 flex-row justify-center items-center gap-2 py-3 border border-gray-600 rounded-xl bg-[#212121]"
            >
              <Printer color="#9CA3AF" size={20} />
              <Text className="text-lg font-bold text-gray-300">
                Print Receipt
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={handleDone}
            className="w-full py-3 bg-blue-600 rounded-xl items-center"
          >
            <Text className="font-bold text-white text-lg">Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default PaymentSuccessView;
