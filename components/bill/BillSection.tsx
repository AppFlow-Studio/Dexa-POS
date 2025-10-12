import { CartItem } from "@/lib/types";
import { useDineInStore } from "@/stores/useDineInStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
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

const TAX_RATE = 0.05; // Assuming this is your app-wide tax rate

const BillSectionContent = ({ cart }: { cart: CartItem[] }) => {
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const handleToggleExpand = (itemId: string) => {
    setExpandedItemId(expandedItemId === itemId ? null : itemId);
  };

  const { subtotal, discount, tax, total } = React.useMemo(() => {
    const activeOrder = useOrderStore
      .getState()
      .orders.find((o) => o.id === useOrderStore.getState().activeOrderId);

    const sub = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

    const itemDiscountsTotal = cart.reduce((acc, item) => {
      if (item.appliedDiscount) {
        return (
          acc + item.originalPrice * item.appliedDiscount.value * item.quantity
        );
      }
      return acc;
    }, 0);

    const subtotalAfterItemDiscounts = sub - itemDiscountsTotal;

    let checkDiscountAmount = 0;
    if (activeOrder?.checkDiscount) {
      checkDiscountAmount =
        subtotalAfterItemDiscounts * activeOrder.checkDiscount.value;
    }

    const totalDiscountAmount = itemDiscountsTotal + checkDiscountAmount;
    const finalSubtotal = sub - totalDiscountAmount;
    const taxAmount = finalSubtotal * TAX_RATE;
    const totalAmount = finalSubtotal + taxAmount;

    return {
      subtotal: sub,
      discount: totalDiscountAmount,
      tax: taxAmount,
      total: totalAmount,
    };
  }, [cart]);

  return (
    <>
      <BillSummary
        cart={cart}
        expandedItemId={expandedItemId}
        onToggleExpand={handleToggleExpand}
      />
      <Totals subtotal={subtotal} tax={tax} discount={discount} total={total} />
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
    sendNewItemsToKitchen,
    assignOrderToTable,
    setActiveOrder,
  } = useOrderStore();
  const { selectedTable, clearSelectedTable } = useDineInStore();
  const { updateTableStatus } = useFloorPlanStore();

  const activeOrder = orders.find((o) => o.id === activeOrderId);
  const cart = activeOrder?.items || [];
  const hasDraftItems = cart.some((item) => item.isDraft);

  // Count new items that haven't been sent to kitchen yet
  const newItemsCount = cart.filter(
    (item) => item.kitchen_status === "new" || !item.kitchen_status
  ).length;

  const [isPaymentDialogVisible, setPaymentDialogVisible] = useState(false);
  const [isDiscountOverlayVisible, setDiscountOverlayVisible] = useState(false);
  const moreOptionsSheetRef = useRef<BottomSheetMethods>(null);

  const handleOpenMoreOptions = () => {
    moreOptionsSheetRef.current?.expand();
  };

  const handlePayClick = () => {
    if (hasDraftItems) {
      toast.error("Please confirm the item being customized before paying.", {
        position: ToastPosition.BOTTOM,
        duration: 4000,
      });
      return;
    }
    setPaymentDialogVisible(true);
  };

  const handleSendToKitchen = () => {
    if (hasDraftItems) {
      toast.error("Please confirm the item being customized before sending.", {
        position: ToastPosition.BOTTOM,
        duration: 4000,
      });
      return;
    }

    if (activeOrder?.order_type === "Dine In" && selectedTable) {
      assignOrderToTable(activeOrderId!, selectedTable.id);
      updateTableStatus(selectedTable.id, "In Use");
      clearSelectedTable();
    }
    sendNewItemsToKitchen();
    const newOrder = startNewOrder();
    setActiveOrder(newOrder.id);
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

      <View className="flex flex-row bg-[#212121] px-6 pb-2 justify-between">
        <DiscountSection onOpenDiscounts={handleOpenDiscounts} />
        {activeOrder && (
          <TouchableOpacity
            className={`flex-row items-center gap-2 px-3   bg-[#212121] border border-gray-600 rounded-lg ${
              newItemsCount === 0 || hasDraftItems ? "opacity-50" : ""
            }`}
            style={{ elevation: 2 }} // Set fixed height to match discount button
            disabled={newItemsCount === 0 || hasDraftItems}
            onPress={handleSendToKitchen}
            activeOpacity={0.85}
          >
            <Text className="text-white font-bold text-base">
              Send to Kitchen ({activeOrder?.items.length})
            </Text>
            <Send size={18} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {showPlaymentActions && (
        <View className=" px-4 bg-[#212121]">
          <View className="h-[0.5px] w-full self-center bg-gray-600 " />
          <View className="flex-row gap-4 py-3">
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

      <MoreOptionsBottomSheet ref={moreOptionsSheetRef} />
      <PaymentMethodDialog
        isVisible={isPaymentDialogVisible}
        onClose={handleClosePaymentDialog}
      />
      <DiscountOverlay
        isVisible={isDiscountOverlayVisible}
        onClose={handleCloseDiscounts}
      />
    </View>
  );
};

export default BillSection;
