import { images } from "@/lib/image";
import { CartItem } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import React, { useState } from "react";
import { Image, ScrollView } from "react-native";
import BillSummary from "./BillSummary";
import DiscountOverlay from "./DiscountOverlay";
import DiscountSection from "./DiscountSection";
import OrderDetails from "./OrderDetails";
import PaymentActions from "./PaymentActions";
import Totals from "./Totals";

const BillSectionContent = ({ cart }: { cart: CartItem[] }) => {
  return (
    <>
      <BillSummary cart={cart} />
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
      <ScrollView
        className="max-w-96 bg-background-100 border-gray-200"
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <Image source={images.topBar} className="w-full" resizeMode="cover" />
        {showOrderDetails && <OrderDetails />}
        <BillSectionContent cart={cart} />
        <DiscountSection onOpenDiscounts={handleOpenDiscounts} />
        {showPlaymentActions && <PaymentActions />}
        <DiscountOverlay
          isVisible={isDiscountOverlayVisible}
          onClose={handleCloseDiscounts}
        />
      </ScrollView>
    </>
  );
};

export default BillSection;
