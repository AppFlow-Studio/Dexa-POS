import { useToast } from "@/contexts/ToastContext";
import { CartItem } from "@/lib/types";
import { useDineInStore } from "@/stores/useDineInStore";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Send, Tag } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import BillSummary from "./BillSummary";
import DiscountOverlay from "./DiscountOverlay";
import OrderDetails from "./OrderDetails";
import Totals from "./Totals";

const BillSectionContent = ({ cart }: { cart: CartItem[] }) => {
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const handleToggleExpand = (itemId: string) => {
    setExpandedItemId(expandedItemId === itemId ? null : itemId);
  };

  return (
    <>
      <BillSummary
        cart={cart}
        expandedItemId={expandedItemId}
        onToggleExpand={handleToggleExpand}
      />
      <Totals cart={cart} />
    </>
  );
};

const BillSection = ({
  showOrderDetails = true,
  showPlaymentActions = true,
  moreOptionsSheetRef,
}: {
  showOrderDetails?: boolean;
  showPlaymentActions?: boolean;
  moreOptionsSheetRef?: React.RefObject<BottomSheetMethods>;
}) => {
  const {
    activeOrderId,
    orders,
    activeOrderTotal,
    startNewOrder,
    sendNewItemsToKitchen,
    assignOrderToTable,
    setActiveOrder,
  } = useOrderStore();
  const { selectedTable, clearSelectedTable } = useDineInStore();
  const { activeEmployeeId } = useEmployeeStore();
  const { checkEmployeeInShift, showClockInWall } = useTimeclockStore();
  // Note: updateTableStatus removed - table session management handled via session-based APIs
  const { show } = useToast();
  const activeOrder = orders.find((o) => o.id === activeOrderId);
  const cart = activeOrder?.items || [];
  const hasDraftItems = cart.some((item) => item.isDraft);

  // Count new items that haven't been sent to kitchen yet
  const newItemsCount = cart.filter(
    (item) => item.kitchen_status === "new" || !item.kitchen_status
  ).length;

  const [isDiscountOverlayVisible, setDiscountOverlayVisible] = useState(false);

  const handleOpenMoreOptions = () => {
    moreOptionsSheetRef?.current?.expand();
  };

  const handlePayClick = () => {
    if (!checkEmployeeInShift(activeEmployeeId!)) {
      showClockInWall();
      return;
    }
    if (hasDraftItems) {
      show({
        title: "Unconfirmed Items",
        message:
          "Please confirm or remove any customized items before proceeding to payment.",
        type: "error",
      });
      return;
    }
    // Directly open the payment bottom sheet to the method selection
    usePaymentStore.getState().open("Card", null, "payment-method-selection");
  };

  const handleSendToKitchen = () => {
    if (!checkEmployeeInShift(activeEmployeeId!)) {
      showClockInWall();
      return;
    }
    if (hasDraftItems) {
      show({
        title: "Unconfirmed Items",
        message:
          "Please confirm or remove any customized items before sending the order to the kitchen.",
        type: "error",
      });
      return;
    }

    if (activeOrder?.order_type === "dine_in" && selectedTable) {
      assignOrderToTable(activeOrderId!, selectedTable.id);
      // Table session status updates are now handled through session-based APIs
      clearSelectedTable();
    }
    sendNewItemsToKitchen();
    const newOrder = startNewOrder();
    setActiveOrder(newOrder.id);
  };

  const handleOpenDiscounts = () => {
    setDiscountOverlayVisible(true);
  };

  const handleCloseDiscounts = () => {
    setDiscountOverlayVisible(false);
  };

  if (!activeOrderId)
    return (
      <View className="w-1/3 items-center justify-center bg-[#212121] p-8 ">
        <Text className="text-xl font-semibold text-white mb-4">
          No Active Order
        </Text>
        <TouchableOpacity
          className="px-6 py-3 bg-blue-600 rounded-lg shadow-md active:opacity-80"
          onPress={() => {
            startNewOrder();
          }}
        >
          <Text className="text-white text-xl font-bold tracking-wide">
            Start New Order
          </Text>
        </TouchableOpacity>
      </View>
    );
  return (
    <View className="w-1/3 bg-[#303030]">
      {showOrderDetails && <OrderDetails />}
      <BillSectionContent cart={cart} />

      <View className="py-3 px-4 bg-[#212121]">
        <View className="flex-row gap-4">
          {/* Discount Button - matching More button style */}
          <TouchableOpacity
            onPress={handleOpenDiscounts}
            className="flex-1 py-2 flex-row items-center justify-center gap-2 bg-[#303030] rounded-xl border border-gray-600"
          >
            <Tag color="#a855f7" size={20} />
            <Text className="text-center text-xl font-bold text-white">
              Discounts
            </Text>
          </TouchableOpacity>

          {/* Send to Kitchen Button - matching previous colors but with new layout */}
          <TouchableOpacity
            className={`flex-1 py-2 px-2 flex-row items-center justify-center gap-2 rounded-xl bg-[#212121] border border-gray-600 ${
              newItemsCount === 0 || hasDraftItems ? "opacity-50" : ""
            }`}
            disabled={newItemsCount === 0 || hasDraftItems}
            onPress={handleSendToKitchen}
            activeOpacity={0.85}
          >
            <Text className="text-center text-xl font-bold text-white">
              Send to Kitchen ({newItemsCount})
            </Text>
            <Send size={18} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      </View>

      <View className="bg-[#212121]">
        <View className="h-[0.5px] w-[90%] self-center bg-gray-600" />
      </View>

      {showPlaymentActions && (
        <View className="py-3 px-4 bg-[#212121]">
          <View className="flex-row gap-4">
            <TouchableOpacity
              onPress={handleOpenMoreOptions}
              className="flex-1 py-2 bg-[#303030] rounded-xl border border-gray-600"
            >
              <Text className="text-center text-xl font-bold text-white">
                More
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handlePayClick}
              disabled={
                !activeOrder ||
                activeOrder.items.length === 0 ||
                activeOrder.items.some((item) => item.isDraft)
              }
              className={`flex-1 py-2 rounded-xl ${
                !activeOrder ||
                activeOrder.items.length === 0 ||
                activeOrder.items.some((item) => item.isDraft)
                  ? "bg-gray-500"
                  : "bg-blue-600"
              }`}
            >
              <Text
                className={`text-center text-xl font-bold ${
                  !activeOrder ||
                  activeOrder.items.length === 0 ||
                  activeOrder.items.some((item) => item.isDraft)
                    ? "text-gray-400"
                    : "text-white"
                }`}
              >
                Pay ${activeOrderTotal.toFixed(2)}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <DiscountOverlay
        isVisible={isDiscountOverlayVisible}
        onClose={handleCloseDiscounts}
      />
    </View>
  );
};

export default BillSection;
