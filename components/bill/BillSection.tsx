import { CartItem } from "@/lib/types";
import { useCartStore } from "@/stores/useCartStore";
import { useTableStore } from "@/stores/useTableStore";
import React, { useState } from "react";
import { ScrollView } from "react-native";
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

const BillSection = ({ tableId }: { tableId?: string }) => {
  const clearTableCart = useTableStore((state) => state.clearTableCart);
  const globalCart = useCartStore((state) => state.items); // Get the global cart
  const table = useTableStore((state) => state.getTableById(tableId || "")); // Get the table-specific cart

  const [isDiscountOverlayVisible, setDiscountOverlayVisible] = useState(false);

  const handleOpenDiscounts = () => {
    setDiscountOverlayVisible(true);
  };

  const handleCloseDiscounts = () => {
    setDiscountOverlayVisible(false);
  };
  const handlePaymentSuccess = () => {
    if (tableId) {
      // When payment is successful, clear this table's cart
      // The store logic will automatically mark it as 'Needs Cleaning'
      clearTableCart(tableId);
      // You would also close the payment modal here
    }
  };

  return (
    <ScrollView
      className="max-w-96 bg-background-100 border-gray-200"
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <OrderDetails />
      {tableId && table ? (
        <BillSectionContent cart={table.cart} />
      ) : (
        <BillSectionContent cart={globalCart} />
      )}
      <DiscountSection onOpenDiscounts={handleOpenDiscounts} />
      <PaymentActions tableId={tableId} />
      <DiscountOverlay
        isVisible={isDiscountOverlayVisible}
        onClose={handleCloseDiscounts}
      />
    </ScrollView>
  );
};

export default BillSection;
