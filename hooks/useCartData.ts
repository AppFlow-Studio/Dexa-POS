import { CartItem } from "@/lib/types"; // Import the CartItem type for clarity
import { useCartStore } from "@/stores/useCartStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useTableStore } from "@/stores/useTableStore";
import { useMemo } from "react";

const TAX_RATE = 0.05;

export const useCartData = () => {
  const { activeTableId } = usePaymentStore();

  const { items: globalCartItems, checkDiscount: globalCheckDiscount } =
    useCartStore();

  const { getTableById } = useTableStore();

  const cartData = useMemo(() => {
    // --- THIS IS THE FIX ---
    let cart: CartItem[] = []; // 1. Initialize cart as an empty array

    if (activeTableId) {
      const table = getTableById(activeTableId);
      // 2. If a table is found, use its cart. Otherwise, it remains an empty array.
      if (table) {
        cart = table.cart;
      }
    } else {
      // If no table is active, use the global cart
      cart = globalCartItems;
    }

    // The rest of the logic can now safely assume `cart` is always an array.
    const checkDiscount = globalCheckDiscount;

    const subtotal = cart.reduce(
      (acc, item) => acc + item.price * item.quantity,
      0
    );

    const itemDiscounts = cart.reduce((acc, item) => {
      if (item.appliedDiscount) {
        return acc + item.price * item.appliedDiscount.value * item.quantity;
      }
      return acc;
    }, 0);

    const subtotalAfterItemDiscounts = subtotal - itemDiscounts;

    let checkDiscountAmount = 0;
    if (checkDiscount) {
      checkDiscountAmount = subtotalAfterItemDiscounts * checkDiscount.value;
    }

    const totalDiscountAmount = itemDiscounts + checkDiscountAmount;
    const finalSubtotal = subtotal - totalDiscountAmount;
    const tax = finalSubtotal * TAX_RATE;
    const total = finalSubtotal + tax;

    return {
      items: cart, // The `items` property will also be a guaranteed array
      subtotal,
      tax,
      total,
      totalDiscountAmount,
    };
  }, [activeTableId, globalCartItems, getTableById, globalCheckDiscount]);

  return cartData;
};
