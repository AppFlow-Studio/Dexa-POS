import type { KioskProfile } from "@/hooks/kiosk/useKioskProfile";

export type KioskScreen =
  | "attract"
  | "orderType"
  | "menu"
  | "itemDetail"
  | "cart"
  | "loyalty"
  | "tip"
  | "payment"
  | "confirmation";

export type KioskOrderType = "dine_in" | "take_out";

export interface KioskModifierOption {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
}

export interface KioskModifierGroup {
  id: string;
  name: string;
  minRequired: number;
  maxAllowed: number;
  options: KioskModifierOption[];
}

export interface KioskMenuItem {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  price: number;
  cashPrice: number | null;
  isAvailable: boolean;
  categoryIds: string[];
  modifierGroups: KioskModifierGroup[];
}

export interface KioskCategory {
  id: string;
  name: string;
  image: string | null;
  itemIds: string[];
}

export interface KioskMenuData {
  categories: KioskCategory[];
  items: KioskMenuItem[];
}

export interface KioskCartModifier {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  price: number;
}

export interface KioskCartItem {
  id: string;
  menuItemId: string;
  name: string;
  image: string | null;
  basePrice: number;
  quantity: number;
  modifiers: KioskCartModifier[];
}

export interface KioskCartTotals {
  subtotal: number;
  tip: number;
  total: number;
}

export interface KioskFlowContextValue {
  screen: KioskScreen;
  orderType: KioskOrderType | null;
  selectedCategoryId: string | null;
  selectedItem: KioskMenuItem | null;
  cartItems: KioskCartItem[];
  totals: KioskCartTotals;
  tipPercent: number;
  phone: string;
  email: string;
  templateId: KioskProfile["template_id"];
  setScreen: (screen: KioskScreen) => void;
  setOrderType: (orderType: KioskOrderType) => void;
  setSelectedCategoryId: (categoryId: string | null) => void;
  openItem: (item: KioskMenuItem) => void;
  closeItem: () => void;
  addCartItem: (item: KioskMenuItem, quantity: number, modifiers: KioskCartModifier[]) => void;
  removeCartItem: (cartItemId: string) => void;
  updateCartItemQuantity: (cartItemId: string, quantity: number) => void;
  clearCart: () => void;
  setTipPercent: (tipPercent: number) => void;
  setPhone: (phone: string) => void;
  setEmail: (email: string) => void;
  resetFlow: () => void;
  cycleTemplate: () => void;
}
