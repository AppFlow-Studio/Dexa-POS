import { CartItem, MenuItemType, ModifierCategory } from "@/lib/types";
import { create } from "zustand";
import { useMenuStore } from "./useMenuStore";

// Pre-computed modifier selections for instant UI
interface ModifierSelection {
  [categoryId: string]: {
    [optionId: string]: boolean;
  };
}

interface ModifierSidebarState {
  isOpen: boolean;
  mode: "add" | "edit" | "view" | "fullscreen";
  menuItem: MenuItemType | null;
  cartItem: CartItem | null;
  categoryId: string | null;

  // ============================================================
  // PRE-COMPUTED DATA - For instant ModifierScreen render
  // ============================================================
  precomputedModifiers: ModifierCategory[] | null;
  initialSelections: ModifierSelection | null;
  itemPrice: number;
  activeModifierCategory: string | null;

  openToAdd: (
    item: MenuItemType,
    orderId: string | null,
    categoryId?: string
  ) => void;
  openToEdit: (item: CartItem, orderId: string | null) => void;
  openToView: (item: CartItem, orderId: string | null) => void;
  openFullscreen: (
    item: MenuItemType,
    orderId: string | null,
    categoryId?: string
  ) => void;
  openFullscreenEdit: (item: CartItem, orderId: string | null) => void;
  close: () => void;
}

/**
 * Pre-compute modifier data for instant UI rendering
 * This moves the heavy computation OUT of the render cycle
 */
function precomputeModifierData(
  item: MenuItemType,
  categoryId: string | undefined,
  cartItem: CartItem | null = null
): {
  modifiers: ModifierCategory[];
  initialSelections: ModifierSelection;
  itemPrice: number;
  activeCategory: string | null;
} {
  const { getModifierGroupsByIds } = useMenuStore.getState();

  // O(1) lookup for modifier groups instead of O(n) .find() calls
  const modifiers = item.modifierGroupIds
    ? getModifierGroupsByIds(item.modifierGroupIds)
    : [];

  const itemPrice = item.price;

  // Pre-compute initial selections
  const initialSelections: ModifierSelection = {};
  modifiers.forEach((category) => {
    initialSelections[category.id] = {};

    if (cartItem) {
      // For edit mode, restore existing selections from cart item
      const existingModifier = cartItem.customizations.modifiers?.find(
        (mod) => mod.categoryId === category.id
      );

      if (existingModifier) {
        existingModifier.options.forEach((selectedOption) => {
          initialSelections[category.id][selectedOption.id] = true;
        });
      }

      // Initialize all other options as unselected
      category.options.forEach((option) => {
        if (!initialSelections[category.id][option.id]) {
          initialSelections[category.id][option.id] = false;
        }
      });
    } else {
      // For add mode, set default selections for required single-select categories
      if (category.type === "required" && category.selectionType === "single") {
        const firstAvailableOption = category.options.find(
          (option) => option.isAvailable !== false
        );
        if (firstAvailableOption) {
          initialSelections[category.id][firstAvailableOption.id] = true;
        }
      }

      // Initialize all other options as unselected
      category.options.forEach((option) => {
        if (!initialSelections[category.id][option.id]) {
          initialSelections[category.id][option.id] = false;
        }
      });
    }
  });

  // Set first category as active
  const activeCategory = modifiers.length > 0 ? modifiers[0].id : null;

  return {
    modifiers,
    initialSelections,
    itemPrice,
    activeCategory,
  };
}

export const useModifierSidebarStore = create<ModifierSidebarState>((set) => ({
  isOpen: false,
  mode: "add",
  menuItem: null,
  cartItem: null,
  categoryId: null,

  // Pre-computed data starts empty
  precomputedModifiers: null,
  initialSelections: null,
  itemPrice: 0,
  activeModifierCategory: null,

  openToAdd: (
    item: MenuItemType,
    orderId: string | null,
    categoryId?: string
  ) => {
    // Pre-compute BEFORE setting isOpen for instant render
    const precomputed = precomputeModifierData(item, categoryId);

    set({
      isOpen: true,
      mode: "add",
      menuItem: item,
      cartItem: null,
      categoryId: categoryId || null,
      precomputedModifiers: precomputed.modifiers,
      initialSelections: precomputed.initialSelections,
      itemPrice: precomputed.itemPrice,
      activeModifierCategory: precomputed.activeCategory,
    });
  },

  openToEdit: (item: CartItem, orderId: string | null) => {
    // Get the menu item for pre-computation
    const { getMenuItemById } = useMenuStore.getState();
    const menuItem = getMenuItemById(item.menuItemId);

    if (menuItem) {
      const precomputed = precomputeModifierData(menuItem, undefined, item);
      set({
        isOpen: true,
        mode: "edit",
        menuItem: null,
        cartItem: item,
        precomputedModifiers: precomputed.modifiers,
        initialSelections: precomputed.initialSelections,
        itemPrice: precomputed.itemPrice,
        activeModifierCategory: precomputed.activeCategory,
      });
    } else {
      set({
        isOpen: true,
        mode: "edit",
        menuItem: null,
        cartItem: item,
        precomputedModifiers: null,
        initialSelections: null,
        itemPrice: item.price,
        activeModifierCategory: null,
      });
    }
  },

  openToView: (item: CartItem, orderId: string | null) => {
    // Get the menu item for pre-computation
    const { getMenuItemById } = useMenuStore.getState();
    const menuItem = getMenuItemById(item.menuItemId);

    if (menuItem) {
      const precomputed = precomputeModifierData(menuItem, undefined, item);
      set({
        isOpen: true,
        mode: "view",
        menuItem: null,
        cartItem: item,
        precomputedModifiers: precomputed.modifiers,
        initialSelections: precomputed.initialSelections,
        itemPrice: precomputed.itemPrice,
        activeModifierCategory: precomputed.activeCategory,
      });
    } else {
      set({
        isOpen: true,
        mode: "view",
        menuItem: null,
        cartItem: item,
        precomputedModifiers: null,
        initialSelections: null,
        itemPrice: item.price,
        activeModifierCategory: null,
      });
    }
  },

  openFullscreen: (
    item: MenuItemType,
    orderId: string | null,
    categoryId?: string
  ) => {
    // Pre-compute BEFORE setting isOpen for instant render
    const precomputed = precomputeModifierData(item, categoryId);

    set({
      isOpen: true,
      mode: "fullscreen",
      menuItem: item,
      cartItem: null,
      categoryId: categoryId || null,
      precomputedModifiers: precomputed.modifiers,
      initialSelections: precomputed.initialSelections,
      itemPrice: precomputed.itemPrice,
      activeModifierCategory: precomputed.activeCategory,
    });
  },

  openFullscreenEdit: (item: CartItem, orderId: string | null) => {
    // Use O(1) lookup instead of .find()
    const { getMenuItemById } = useMenuStore.getState();
    const menuItem = getMenuItemById(item.menuItemId);

    if (menuItem) {
      const precomputed = precomputeModifierData(menuItem, undefined, item);
      set({
        isOpen: true,
        mode: "fullscreen",
        menuItem: menuItem,
        cartItem: item,
        precomputedModifiers: precomputed.modifiers,
        initialSelections: precomputed.initialSelections,
        itemPrice: precomputed.itemPrice,
        activeModifierCategory: precomputed.activeCategory,
      });
    } else {
      set({
        isOpen: true,
        mode: "fullscreen",
        menuItem: null,
        cartItem: item,
        precomputedModifiers: null,
        initialSelections: null,
        itemPrice: item.price,
        activeModifierCategory: null,
      });
    }
  },

  close: () => {
    set({
      isOpen: false,
      mode: "add",
      menuItem: null,
      cartItem: null,
      // Clear pre-computed data
      precomputedModifiers: null,
      initialSelections: null,
      itemPrice: 0,
      activeModifierCategory: null,
    });
  },
}));

// ============================================================================
// GRANULAR SELECTORS - For optimized component subscriptions
// Components should use these to avoid re-renders from unrelated state changes
// ============================================================================

/** Selector for isOpen state - use in overlay/wrapper components */
export const selectIsOpen = (state: ModifierSidebarState) => state.isOpen;

/** Selector for mode - use when you only need to check the current mode */
export const selectMode = (state: ModifierSidebarState) => state.mode;

/** Selector for menu item - use when you need the base menu item data */
export const selectMenuItem = (state: ModifierSidebarState) => state.menuItem;

/** Selector for cart item - use when editing existing cart items */
export const selectCartItem = (state: ModifierSidebarState) => state.cartItem;

/** Selector for precomputed modifiers - use for instant modifier rendering */
export const selectPrecomputedModifiers = (state: ModifierSidebarState) =>
  state.precomputedModifiers;

/** Selector for initial selections - use for instant form initialization */
export const selectInitialSelections = (state: ModifierSidebarState) =>
  state.initialSelections;

/** Selector for precomputed item price - use for instant price display */
export const selectItemPrice = (state: ModifierSidebarState) => state.itemPrice;

/** Selector for active modifier category - use for tab highlighting */
export const selectActiveModifierCategory = (state: ModifierSidebarState) =>
  state.activeModifierCategory;

/** Selector for close action - stable reference, no re-renders */
export const selectClose = (state: ModifierSidebarState) => state.close;

/** Combined selector for fullscreen mode check */
export const selectIsFullscreen = (state: ModifierSidebarState) =>
  state.isOpen && state.mode === "fullscreen";
