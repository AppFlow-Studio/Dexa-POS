import { CartItem } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Send } from "lucide-react-native";
import React, { useRef, useState } from "react";
<<<<<<< HEAD
import { Text, TouchableOpacity, View } from "react-native";
=======
import { Image, Text, TouchableOpacity, View } from "react-native";
>>>>>>> b5fd238b2b1e88bb3a9705539f07eda18ebd8652
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
<<<<<<< HEAD
  const { activeOrderId, orders,
    activeOrderTotal,
    startNewOrder,
    fireActiveOrderToKitchen,
  } = useOrderStore();
=======
  const { activeOrderId, orders, activeOrderTotal, startNewOrder } =
    useOrderStore();
>>>>>>> b5fd238b2b1e88bb3a9705539f07eda18ebd8652

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

  if (!activeOrderId) return (
    <View className="w-1/3 items-center justify-center bg-[#212121] p-8 ">
      <Text className="text-lg font-semibold text-white mb-4">
        No Active Order
      </Text>
      <TouchableOpacity
        className="px-6 py-3 bg-blue-600 rounded-full shadow-md active:opacity-80"
        onPress={() => {
          // Start a new order using the store
          startNewOrder();
        }}
      >
        <Text className="text-white text-base font-bold tracking-wide">
          Start New Order
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (

    <View
      className="w-1/3 bg-[#303030]"
    >
      {/* <Image source={images.topBar} className="w-full h-12" resizeMode="cover" /> */}
      {/* Paid / Status badges */}
      {/* {activeOrder && (
          <View className="px-4 py-2 flex-row gap-2 items-center">
            <View
              className={`px-2 py-1 rounded-full ${activeOrder.paid_status === "Paid"
                ? "bg-green-100"
                : activeOrder.paid_status === "Pending"
                  ? "bg-yellow-100"
                  : "bg-red-100"
                }`}
            >
              <Text
                className={`text-xs font-semibold ${activeOrder.paid_status === "Paid"
                  ? "text-green-800"
                  : activeOrder.paid_status === "Pending"
                    ? "text-yellow-800"
                    : "text-red-800"
                  }`}
              >
                {activeOrder.paid_status}
              </Text>
            </View>

            <View className="px-2 py-1 rounded-full bg-blue-100">
              <Text className="text-xs font-semibold text-blue-800">
                {activeOrder.order_status}
              </Text>
            </View>
          </View>
        )} */}
      {showOrderDetails && <OrderDetails />}
      <BillSectionContent cart={cart} />
      <View className="flex flex-row justify-between items-center bg-[#212121] pb-2">
        <DiscountSection onOpenDiscounts={handleOpenDiscounts} />
        {activeOrder && (
          <TouchableOpacity
            className={`flex-row items-center gap-2 px-4 py-2 bg-[#212121] border border-gray-600 rounded-lg ${(!activeOrder || activeOrder.items.length === 0 || activeOrder.order_status !== "Building") ? "opacity-50" : ""}`}
            style={{ elevation: 2 }}
            disabled={!activeOrder || activeOrder.items.length === 0 || activeOrder.order_status !== "Building"}
            onPress={() => {
              fireActiveOrderToKitchen();
            }}
            activeOpacity={0.85}
          >
            <Text className="text-white font-bold text-base">Send to Kitchen ({activeOrder?.items.length})</Text>
            {/* Paper plane icon (Lucide) */}
            <Send color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>
      <View className="h-[1px] w-[90%] self-center bg-gray-600 " />
      {/* More and Pay Buttons */}
      {showPlaymentActions && (
        <View className="p-4 bg-[#212121]">
          <View className="flex-row gap-3">
            {/* More Button */}
            <TouchableOpacity
              onPress={handleOpenMoreOptions}
              className="flex-1 py-3 bg-[#303030] rounded-xl border border-gray-600"
            >
              <Text className="text-center font-bold text-white">More</Text>
            </TouchableOpacity>

            {/* Pay Button */}
            <TouchableOpacity
              onPress={handlePayClick}
              disabled={!activeOrder || activeOrder.items.length === 0}
<<<<<<< HEAD
              className={`flex-1 py-3 rounded-xl ${!activeOrder || activeOrder.items.length === 0
                ? "bg-gray-600"
                : "bg-blue-600"
                }`}
            >
              <Text className={`text-center font-bold ${!activeOrder || activeOrder.items.length === 0
                ? "text-gray-400"
                : "text-white "
                }`}>
=======
              className={`flex-1 py-3 rounded-xl ${
                !activeOrder || activeOrder.items.length === 0
                  ? "bg-gray-300"
                  : "bg-primary-400"
              }`}
            >
              <Text
                className={`text-center font-bold ${
                  !activeOrder || activeOrder.items.length === 0
                    ? "text-gray-500"
                    : "text-white "
                }`}
              >
>>>>>>> b5fd238b2b1e88bb3a9705539f07eda18ebd8652
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
<<<<<<< HEAD

=======
>>>>>>> b5fd238b2b1e88bb3a9705539f07eda18ebd8652
  );
};

export default BillSection;
