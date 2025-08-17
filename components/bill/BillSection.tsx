import { images } from "@/lib/image";
import { CartItem } from "@/lib/types";
import { useCartStore } from "@/stores/useCartStore";
import { useTableStore } from "@/stores/useTableStore";
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

  return (
    <>
      <ScrollView
        className="max-w-96 bg-background-100 border-gray-200"
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <Image source={images.topBar} className="w-full" resizeMode="cover" />
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
    </>
  );
};

export default BillSection;
