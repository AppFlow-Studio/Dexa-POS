import { AddOn, Discount, ItemSize, MenuItemType } from "@/lib/types";
import { create } from "zustand";

// This is the shape of an item once it's in the cart
export interface CartItem {
  id: string;
  name: string;
  originalPrice: number;
  price: number; // This will be the price after item-specific discounts
  quantity: number;
  image?: string;
  customizations: {
    size?: ItemSize;
    addOns?: AddOn[];
    notes?: string;
  };
  availableDiscount?: Discount; // The discount this item is eligible for
  appliedDiscount?: Discount | null; // The discount currently applied to this item
}

interface CartState {
  items: CartItem[];
  checkDiscount: Discount | null; // The currently applied discount
  discountAmount: number; // The calculated monetary value of the discount
  addItem: (itemData: {
    menuItem: MenuItemType;
    quantity: number;
    size: ItemSize;
    addOns: AddOn[];
    notes: string;
    finalPrice: number;
  }) => void;
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

    addItem: ({ menuItem, quantity, size, addOns, notes, finalPrice }) => {
      set((state) => {
        const newItem: CartItem = {
          id: `${menuItem.id}_${Date.now()}`, // Create a unique ID for this specific cart entry,
          name: menuItem.name,
          quantity,
          originalPrice: menuItem.price, // Store the original price of the menu item
          price: finalPrice, // Store the calculated final price for this specific cart item
          image: menuItem.image,
          customizations: { size, addOns, notes },
          availableDiscount: menuItem.availableDiscount,
          appliedDiscount: null,
        };
        return { items: [...state.items, newItem] };
      });
      recalculateTotals(); // Ensure this function is updated to use finalPrice
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
