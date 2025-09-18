import { CartItem } from "@/lib/types";
import { useDineInStore } from "@/stores/useDineInStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Send } from "lucide-react-native";
import React, { useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import BillSummary from "./BillSummary";
import DiscountOverlay from "./DiscountOverlay";
import DiscountSection from "./DiscountSection";
import MoreOptionsBottomSheet from "./MoreOptionsBottomSheet";
import OrderDetails from "./OrderDetails";
import PaymentMethodDialog from "./PaymentMethodDialog";
import Totals from "./Totals";

const BillSectionContent = ({ cart }: { cart: CartItem[] }) => {
  // State for managing expanded item
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
}: {
  showOrderDetails?: boolean;
  showPlaymentActions?: boolean;
}) => {
  const {
    activeOrderId,
    orders,
    activeOrderTotal,
    startNewOrder,
    fireActiveOrderToKitchen,
    assignOrderToTable,
    setActiveOrder,
  } = useOrderStore();
  const { selectedTable, clearSelectedTable } = useDineInStore();
  const { updateTableStatus } = useFloorPlanStore();

  const activeOrder = orders.find((o) => o.id === activeOrderId);
  const cart = activeOrder?.items || [];

  const [isPaymentDialogVisible, setPaymentDialogVisible] = useState(false);
  const [isDiscountOverlayVisible, setDiscountOverlayVisible] = useState(false);
  const moreOptionsSheetRef = useRef<BottomSheetMethods>(null);

  const handleOpenMoreOptions = () => {
    moreOptionsSheetRef.current?.snapToIndex(0);
  };

  const handlePayClick = () => {
    setPaymentDialogVisible(true);
  };

  const handleClosePaymentDialog = () => {
    setPaymentDialogVisible(false);
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
        <Text className="text-2xl font-semibold text-white mb-4">
          No Active Order
        </Text>
        <TouchableOpacity
          className="px-6 py-3 bg-blue-600 rounded-full shadow-md active:opacity-80"
          onPress={() => {
            // Start a new order using the store
            startNewOrder();
          }}
        >
          <Text className="text-white text-2xl font-bold tracking-wide">
            Start New Order
          </Text>
        </TouchableOpacity>
      </View>
    );

  return (
    <View className="w-1/3 bg-[#303030]">
      {showOrderDetails && <OrderDetails />}
      <BillSectionContent cart={cart} />
      <View className="flex flex-row justify-between items-center bg-[#212121] p-4">
        <DiscountSection onOpenDiscounts={handleOpenDiscounts} />
        {activeOrder && (
          <TouchableOpacity
            className={`flex-row items-center gap-2 px-6 py-3 bg-[#212121] border border-gray-600 rounded-lg ${!activeOrder || activeOrder.items.length === 0 || activeOrder.order_status !== "Building" ? "opacity-50" : ""}`}
            style={{ elevation: 2 }}
            disabled={
              !activeOrder ||
              activeOrder.items.length === 0 ||
              activeOrder.order_status !== "Building"
            }
            onPress={() => {
              // If this is a dine-in order with a selected table, assign it first
              if (activeOrder?.order_type === "Dine In" && selectedTable) {
                assignOrderToTable(activeOrderId, selectedTable.id);
                updateTableStatus(selectedTable.id, "In Use");
                clearSelectedTable(); // Clear the selected table after assignment
              }
              fireActiveOrderToKitchen();
              const newOrder = startNewOrder();
              setActiveOrder(newOrder.id);
            }}
            activeOpacity={0.85}
          >
            <Text className="text-white font-bold text-xl">
              Send to Kitchen ({activeOrder?.items.length})
            </Text>
            {/* Paper plane icon (Lucide) */}
            <Send size={24} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>
      <View className="h-[1px] w-[90%] self-center bg-gray-600 " />
      {/* More and Pay Buttons */}
      {showPlaymentActions && (
        <View className="p-6 bg-[#212121]">
          <View className="flex-row gap-4">
            {/* More Button */}
            <TouchableOpacity
              onPress={handleOpenMoreOptions}
              className="flex-1 py-4 bg-[#303030] rounded-xl border border-gray-600"
            >
              <Text className="text-center text-2xl font-bold text-white">
                More
              </Text>
            </TouchableOpacity>

            {/* Pay Button */}
            <TouchableOpacity
              onPress={handlePayClick}
              disabled={!activeOrder || activeOrder.items.length === 0}
              className={`flex-1 py-4 rounded-xl ${!activeOrder || activeOrder.items.length === 0
                  ? "bg-gray-600"
                  : "bg-blue-600"
                }`}
            >
              <Text
                className={`text-center text-2xl font-bold ${!activeOrder || activeOrder.items.length === 0
                    ? "text-gray-400"
                    : "text-white "
                  }`}
              >
                Pay ${activeOrderTotal.toFixed(2)}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* More Options Bottom Sheet */}
      <MoreOptionsBottomSheet ref={moreOptionsSheetRef} />

      {/* Payment Method Dialog */}
      <PaymentMethodDialog
        isVisible={isPaymentDialogVisible}
        onClose={handleClosePaymentDialog}
      />

      {/* Discount Overlay */}
      <DiscountOverlay
        isVisible={isDiscountOverlayVisible}
        onClose={handleCloseDiscounts}
      />
    </View>
  );
};

export default BillSection;
