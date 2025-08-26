import { images } from "@/lib/image";
import { CartItem } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import React, { useState } from "react";
import { Image, ScrollView, View } from "react-native";
import BillSummary from "./BillSummary";
import DiscountOverlay from "./DiscountOverlay";
import DiscountSection from "./DiscountSection";
import OrderDetails from "./OrderDetails";
import PaymentActions from "./PaymentActions";
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
  const { activeOrderId, orders } = useOrderStore();
  const activeOrder = orders.find((o) => o.id === activeOrderId);
  const cart = activeOrder?.items || [];

  const [isDiscountOverlayVisible, setDiscountOverlayVisible] = useState(false);

  const handleOpenDiscounts = () => {
    setDiscountOverlayVisible(true);
  };

  const handleCloseDiscounts = () => {
    setDiscountOverlayVisible(false);
  };

  return (
    <>
      <View
        className="max-w-96 bg-background-100 border-gray-200 flex-1"
      >
        <Image source={images.topBar} className="w-full h-12" resizeMode="cover" />
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
        <DiscountSection onOpenDiscounts={handleOpenDiscounts} />
        {showPlaymentActions && <PaymentActions />}
        <DiscountOverlay
          isVisible={isDiscountOverlayVisible}
          onClose={handleCloseDiscounts}
        />
      </View>
    </>
  );
};

export default BillSection;
