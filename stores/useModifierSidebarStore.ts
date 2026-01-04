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
  menuId: string | null; // Menu context for price lookup

  // ============================================================
  // PRE-COMPUTED DATA - For instant ModifierScreen render
  // ============================================================
  precomputedModifiers: ModifierCategory[] | null;
  initialSelections: ModifierSelection | null;
  itemPrice: number;
  itemCashPrice: number; // Cash price for the item in current context
  activeModifierCategory: string | null;

  openToAdd: (
    item: MenuItemType,
    orderId: string | null,
    categoryId?: string,
    menuId?: string
  ) => void;
  openToEdit: (item: CartItem, orderId: string | null) => void;
  openToView: (item: CartItem, orderId: string | null) => void;
  openFullscreen: (
    item: MenuItemType,
    orderId: string | null,
    categoryId?: string,
    menuId?: string
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
  menuId: string | undefined,
  cartItem: CartItem | null = null
): {
  modifiers: ModifierCategory[];
  initialSelections: ModifierSelection;
  itemPrice: number;
  itemCashPrice: number;
  activeCategory: string | null;
} {
  const { getModifierGroupsByIds, menus } = useMenuStore.getState();

  // O(1) lookup for modifier groups instead of O(n) .find() calls
  const modifiers = item.modifierGroupIds
    ? getModifierGroupsByIds(item.modifierGroupIds)
    : [];

  // Look up context-specific price from the menu structure if menuId is provided
  let itemPrice = item.price;
  let itemCashPrice = item.cashPrice ?? item.price;

  if (menuId) {
    const menu = menus.find((m) => m.id === menuId);
    if (menu) {
      // Search for the item in the menu's nested structure
      for (const cat of menu.categories) {
        const menuItem = cat.items?.find((mi) => mi.id === item.id);
        if (menuItem) {
          // Use the context-specific price from the menu structure
          itemPrice = menuItem.price;
          itemCashPrice = menuItem.cashPrice ?? menuItem.price;
          break;
        }
      }
    }
  }

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
    itemCashPrice,
    activeCategory,
  };
}

export const useModifierSidebarStore = create<ModifierSidebarState>((set) => ({
  isOpen: false,
  mode: "add",
  menuItem: null,
  cartItem: null,
  categoryId: null,
  menuId: null,

  // Pre-computed data starts empty
  precomputedModifiers: null,
  initialSelections: null,
  itemPrice: 0,
  itemCashPrice: 0,
  activeModifierCategory: null,

  openToAdd: (
    item: MenuItemType,
    orderId: string | null,
    categoryId?: string,
    menuId?: string
  ) => {
    // Pre-compute BEFORE setting isOpen for instant render
    const precomputed = precomputeModifierData(item, categoryId, menuId);

    set({
      isOpen: true,
      mode: "add",
      menuItem: item,
      cartItem: null,
      categoryId: categoryId || null,
      menuId: menuId || null,
      precomputedModifiers: precomputed.modifiers,
      initialSelections: precomputed.initialSelections,
      itemPrice: precomputed.itemPrice,
      itemCashPrice: precomputed.itemCashPrice,
      activeModifierCategory: precomputed.activeCategory,
    });
  },

  openToEdit: (item: CartItem, orderId: string | null) => {
    // Get the menu item for pre-computation
    const { getMenuItemById } = useMenuStore.getState();
    const menuItem = getMenuItemById(item.menuItemId);

    if (menuItem) {
      // Use the cart item's stored menu context for price lookup
      const precomputed = precomputeModifierData(menuItem, item.addedFromCategoryId || undefined, item.addedFromMenuId || undefined, item);
      set({
        isOpen: true,
        mode: "edit",
        menuItem: null,
        cartItem: item,
        categoryId: item.addedFromCategoryId || null,
        menuId: item.addedFromMenuId || null,
        precomputedModifiers: precomputed.modifiers,
        initialSelections: precomputed.initialSelections,
        itemPrice: precomputed.itemPrice,
        itemCashPrice: precomputed.itemCashPrice,
        activeModifierCategory: precomputed.activeCategory,
      });
    } else {
      set({
        isOpen: true,
        mode: "edit",
        menuItem: null,
        cartItem: item,
        categoryId: item.addedFromCategoryId || null,
        menuId: item.addedFromMenuId || null,
        precomputedModifiers: null,
        initialSelections: null,
        itemPrice: item.price,
        itemCashPrice: item.cashPrice ?? item.price,
        activeModifierCategory: null,
      });
    }
  },

  openToView: (item: CartItem, orderId: string | null) => {
    // Get the menu item for pre-computation
    const { getMenuItemById } = useMenuStore.getState();
    const menuItem = getMenuItemById(item.menuItemId);

    if (menuItem) {
      // Use the cart item's stored menu context for price lookup
      const precomputed = precomputeModifierData(menuItem, item.addedFromCategoryId || undefined, item.addedFromMenuId || undefined, item);
      set({
        isOpen: true,
        mode: "view",
        menuItem: null,
        cartItem: item,
        categoryId: item.addedFromCategoryId || null,
        menuId: item.addedFromMenuId || null,
        precomputedModifiers: precomputed.modifiers,
        initialSelections: precomputed.initialSelections,
        itemPrice: precomputed.itemPrice,
        itemCashPrice: precomputed.itemCashPrice,
        activeModifierCategory: precomputed.activeCategory,
      });
    } else {
      set({
        isOpen: true,
        mode: "view",
        menuItem: null,
        cartItem: item,
        categoryId: item.addedFromCategoryId || null,
        menuId: item.addedFromMenuId || null,
        precomputedModifiers: null,
        initialSelections: null,
        itemPrice: item.price,
        itemCashPrice: item.cashPrice ?? item.price,
        activeModifierCategory: null,
      });
    }
  },

  openFullscreen: (
    item: MenuItemType,
    orderId: string | null,
    categoryId?: string,
    menuId?: string
  ) => {
    // Pre-compute BEFORE setting isOpen for instant render
    const precomputed = precomputeModifierData(item, categoryId, menuId);

    set({
      isOpen: true,
      mode: "fullscreen",
      menuItem: item,
      cartItem: null,
      categoryId: categoryId || null,
      menuId: menuId || null,
      precomputedModifiers: precomputed.modifiers,
      initialSelections: precomputed.initialSelections,
      itemPrice: precomputed.itemPrice,
      itemCashPrice: precomputed.itemCashPrice,
      activeModifierCategory: precomputed.activeCategory,
    });
  },

  openFullscreenEdit: (item: CartItem, orderId: string | null) => {
    // Use O(1) lookup instead of .find()
    const { getMenuItemById } = useMenuStore.getState();
    const menuItem = getMenuItemById(item.menuItemId);

    if (menuItem) {
      // Use the cart item's stored menu context for price lookup
      const precomputed = precomputeModifierData(menuItem, item.addedFromCategoryId || undefined, item.addedFromMenuId || undefined, item);
      set({
        isOpen: true,
        mode: "fullscreen",
        menuItem: menuItem,
        cartItem: item,
        categoryId: item.addedFromCategoryId || null,
        menuId: item.addedFromMenuId || null,
        precomputedModifiers: precomputed.modifiers,
        initialSelections: precomputed.initialSelections,
        itemPrice: precomputed.itemPrice,
        itemCashPrice: precomputed.itemCashPrice,
        activeModifierCategory: precomputed.activeCategory,
      });
    } else {
      set({
        isOpen: true,
        mode: "fullscreen",
        menuItem: null,
        cartItem: item,
        categoryId: item.addedFromCategoryId || null,
        menuId: item.addedFromMenuId || null,
        precomputedModifiers: null,
        initialSelections: null,
        itemPrice: item.price,
        itemCashPrice: item.cashPrice ?? item.price,
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
      categoryId: null,
      menuId: null,
      // Clear pre-computed data
      precomputedModifiers: null,
      initialSelections: null,
      itemPrice: 0,
      itemCashPrice: 0,
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

/** Selector for precomputed item cash price - use for cash pricing display */
export const selectItemCashPrice = (state: ModifierSidebarState) => state.itemCashPrice;

/** Selector for menu ID - use to track which menu the item was added from */
export const selectMenuId = (state: ModifierSidebarState) => state.menuId;

/** Selector for active modifier category - use for tab highlighting */
export const selectActiveModifierCategory = (state: ModifierSidebarState) =>
  state.activeModifierCategory;

/** Selector for close action - stable reference, no re-renders */
export const selectClose = (state: ModifierSidebarState) => state.close;

/** Combined selector for fullscreen mode check */
export const selectIsFullscreen = (state: ModifierSidebarState) =>
  state.isOpen && state.mode === "fullscreen";
