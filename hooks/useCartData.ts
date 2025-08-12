import { useCartStore } from "@/stores/useCartStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useTableStore } from "@/stores/useTableStore";
import { useMemo } from "react";

// This hook determines which cart's data to use based on the payment store's state
export const useCartData = () => {
  const { activeTableId } = usePaymentStore();

  // Get data and actions from ALL relevant stores
  const {
    items: globalCartItems,
    subtotal: globalSubtotal,
    tax: globalTax,
    total: globalTotal,
    totalDiscountAmount: globalDiscount,
  } = useCartStore();

  const { getTableById } = useTableStore();

  // useMemo will recalculate only when the activeTableId or the carts change
  const cartData = useMemo(() => {
    if (activeTableId) {
      const table = getTableById(activeTableId);
      if (table) {
        const tableCart = table.cart;
        // Recalculate totals for the specific table cart
        const sub = tableCart.reduce(
          (acc, item) => acc + item.originalPrice * item.quantity,
          0
        );
        // Simplified discount and tax for example; you can enhance this
        const discount = tableCart.reduce((acc, item) => {
          if (item.appliedDiscount)
            return (
              acc +
              item.originalPrice * item.appliedDiscount.value * item.quantity
            );
          return acc;
        }, 0);
        const subAfterDiscount = sub - discount;
        const tx = subAfterDiscount * 0.05; // 5% tax
        const tot = subAfterDiscount + tx;

        return {
          items: tableCart,
          subtotal: sub,
          tax: tx,
          total: tot,
          totalDiscountAmount: discount,
        };
      }
    }

    // If no tableId, fall back to the global cart's derived data
    return {
      items: globalCartItems,
      subtotal: globalSubtotal,
      tax: globalTax,
      total: globalTotal,
      totalDiscountAmount: globalDiscount,
    };
  }, [
    activeTableId,
    globalCartItems,
    getTableById,
    globalSubtotal,
    globalTax,
    globalTotal,
    globalDiscount,
  ]);

  return cartData;
};
