import { CartItem, Discount } from "@/lib/types";
import { create } from "zustand";

// This is the shape of an item once it's in the cart

interface CartState {
  items: CartItem[];
  checkDiscount: Discount | null; // The currently applied discount
  discountAmount: number; // The calculated monetary value of the discount
  addItem: (newItem: CartItem) => void;
  updateItem: (updatedItem: CartItem) => void;
  removeItem: (itemId: string) => void;
  increaseQuantity: (itemId: string) => void;
  decreaseQuantity: (itemId: string) => void;
  clearCart: () => void;
  applyDiscountToCheck: (discount: Discount) => void;
  removeCheckDiscount: () => void;
  applyDiscountToItem: (itemId: string) => void;
  removeDiscountFromItem: (itemId: string) => void;
  // --- Derived State (Getters) ---
  subtotal: number;
  tax: number;
  total: number;
  totalDiscountAmount: number;
}

// Define a constant for the tax rate
const TAX_RATE = 0.05; // 5%

export const useCartStore = create<CartState>((set) => {
  const recalculateTotals = () => {
    set((state) => {
      const subtotal = state.items.reduce(
        (acc, item) => acc + item.originalPrice * item.quantity,
        0
      );

      const itemDiscountsTotal = state.items.reduce((acc, item) => {
        if (item.appliedDiscount) {
          return (
            acc +
            item.originalPrice * item.appliedDiscount.value * item.quantity
          );
        }
        return acc;
      }, 0);

      const subtotalAfterItemDiscounts = subtotal - itemDiscountsTotal;

      let checkDiscountAmount = 0;
      if (state.checkDiscount) {
        checkDiscountAmount =
          subtotalAfterItemDiscounts * state.checkDiscount.value;
      }

      const totalDiscountAmount = itemDiscountsTotal + checkDiscountAmount;
      const finalSubtotal = subtotal - totalDiscountAmount;
      const tax = finalSubtotal * TAX_RATE;
      const total = finalSubtotal + tax;

      return { subtotal, totalDiscountAmount, tax, total };
    });
  };

  return {
    items: [],
    checkDiscount: null,
    discountAmount: 0,
    subtotal: 0,
    totalDiscountAmount: 0,
    tax: 0,
    total: 0,

    addItem: (newItem) => {
      // The logic is now much simpler. We just add the pre-constructed item.
      set((state) => ({
        items: [...state.items, newItem],
      }));
      recalculateTotals();
    },

    updateItem: (updatedItem) => {
      set((state) => ({
        items: state.items.map((item) =>
          item.id === updatedItem.id ? updatedItem : item
        ),
      }));
      recalculateTotals();
    },

    applyDiscountToCheck: (discount) => {
      set({ checkDiscount: discount });
      recalculateTotals();
    },

    removeCheckDiscount: () => {
      set({ checkDiscount: null });
      recalculateTotals();
    },

    applyDiscountToItem: (itemId) => {
      set((state) => ({
        items: state.items.map((item) => {
          if (item.id === itemId && item.availableDiscount) {
            return { ...item, appliedDiscount: item.availableDiscount };
          }
          return item;
        }),
      }));
      recalculateTotals();
    },

    removeDiscountFromItem: (itemId) => {
      set((state) => ({
        items: state.items.map((item) =>
          item.id === itemId ? { ...item, appliedDiscount: null } : item
        ),
      }));
      recalculateTotals();
    },
    increaseQuantity: (itemId) => {
      set((state) => ({
        items: state.items.map((item) =>
          item.id === itemId ? { ...item, quantity: item.quantity + 1 } : item
        ),
      }));
      recalculateTotals();
    },

    decreaseQuantity: (itemId) => {
      set((state) => ({
        items: state.items
          .map((item) =>
            item.id === itemId ? { ...item, quantity: item.quantity - 1 } : item
          )
          .filter((item) => item.quantity > 0), // Remove item if quantity is 0
      }));
      recalculateTotals();
    },

    removeItem: (itemId) => {
      set((state) => ({
        items: state.items.filter((item) => item.id !== itemId),
      }));
      recalculateTotals();
    },

    clearCart: () => {
      set({ items: [], subtotal: 0, tax: 0, total: 0 });
    },
  };
});
