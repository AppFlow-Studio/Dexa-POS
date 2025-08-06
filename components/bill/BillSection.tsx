import React, { useState } from "react";
import { ScrollView } from "react-native";
import BillSummary from "./BillSummary";
import DiscountOverlay from "./DiscountOverlay";
import DiscountSection from "./DiscountSection";
import OrderDetails from "./OrderDetails";
import PaymentActions from "./PaymentActions";
import Totals from "./Totals";

const BillSection = () => {
  const [isDiscountOverlayVisible, setDiscountOverlayVisible] = useState(false);

  const handleOpenDiscounts = () => {
    setDiscountOverlayVisible(true);
  };

  const handleCloseDiscounts = () => {
    setDiscountOverlayVisible(false);
  };

  return (
    <ScrollView
      className="max-w-96 bg-background-100 border-gray-200"
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <OrderDetails />
      <BillSummary />
      <Totals />
      <DiscountSection onOpenDiscounts={handleOpenDiscounts} />
      <PaymentActions />
      <DiscountOverlay
        isVisible={isDiscountOverlayVisible}
        onClose={handleCloseDiscounts}
      />
    </ScrollView>
  );
};

export default BillSection;
