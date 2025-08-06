import { MenuItemType } from "@/lib/types";
import { create } from "zustand";

// This is the shape of an item once it's in the cart
export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

export interface Discount {
  id: string;
  label: string;
  subLabel?: string;
  value: number; // e.g., 0.10 for 10%
  type: "percentage";
}

interface CartState {
  items: CartItem[];
  appliedDiscount: Discount | null; // The currently applied discount
  discountAmount: number; // The calculated monetary value of the discount
  addItem: (itemToAdd: MenuItemType) => void;
  removeItem: (itemId: string) => void;
  increaseQuantity: (itemId: string) => void;
  decreaseQuantity: (itemId: string) => void;
  clearCart: () => void;
  applyDiscount: (discount: Discount) => void;
  removeDiscount: () => void;
  // --- Derived State (Getters) ---
  subtotal: number;
  tax: number;
  total: number;
}

// Define a constant for the tax rate
const TAX_RATE = 0.05; // 5%

export const useCartStore = create<CartState>((set, get) => {
  const recalculateTotals = () => {
    const { items, appliedDiscount } = get();
    const subtotal = items.reduce(
      (acc, item) => acc + item.price * item.quantity,
      0
    );
    let discountAmount = 0;
    // Calculate discount amount if one is applied
    if (appliedDiscount) {
      if (appliedDiscount.type === "percentage") {
        discountAmount = subtotal * appliedDiscount.value;
      }
    }
    const subtotalAfterDiscount = subtotal - discountAmount;
    const tax = subtotalAfterDiscount * TAX_RATE;
    const total = subtotalAfterDiscount + tax;

    set({ subtotal, tax, discountAmount, total });
  };

  // --- RETURN THE PUBLIC STATE AND ACTIONS ---
  return {
    items: [],
    subtotal: 0,
    tax: 0,
    total: 0,
    appliedDiscount: null,
    discountAmount: 0,

    // --- ACTIONS ---
    addItem: (itemToAdd) => {
      const { items } = get();
      const existingItem = items.find((item) => item.id === itemToAdd.id);

      let updatedItems: CartItem[];

      if (existingItem) {
        // If item exists, increase quantity
        updatedItems = items.map((item) =>
          item.id === itemToAdd.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      } else {
        // If item is new, add it to the cart with quantity 1
        const newItem: CartItem = {
          id: itemToAdd.id,
          name: itemToAdd.name,
          price: itemToAdd.price,
          image: itemToAdd.image,
          quantity: 1,
        };
        updatedItems = [...items, newItem];
      }
      set({ items: updatedItems });
      // After updating items, call the private helper
      recalculateTotals();
    },

    applyDiscount: (discount) => {
      set({ appliedDiscount: discount });
      recalculateTotals();
    },

    removeDiscount: () => {
      set({ appliedDiscount: null });
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
