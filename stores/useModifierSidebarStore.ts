import { CartItem, MenuItemType, ModifierCategory } from "@/lib/types";
import { create } from "zustand";
import { useMenuStore } from "./useMenuStore";

// ============================================================================
// SYNCHRONOUS TOUCH BLOCKING - For same-frame menu blocking
// ============================================================================
// Module-level ref for instant, same-frame touch blocking
// This blocks touches BEFORE React render cycle completes
let menuBlockedSyncRef = false;

/** Set menu blocked state synchronously (same frame) */
export const setMenuBlockedSync = (blocked: boolean) => {
  menuBlockedSyncRef = blocked;
};

/** Check if menu is blocked synchronously (O(1), no React) */
export const isMenuBlockedSync = () => menuBlockedSyncRef;

// Pre-computed modifier selections for instant UI
interface ModifierSelection {
  [categoryId: string]: {
    [optionId: string]: boolean;
  };
}

// Position data for attached modifier panel
interface ItemPosition {
  y: number;
  height: number;
  absoluteY?: number; // Absolute Y position on screen
}

interface ModifierSidebarState {
  isOpen: boolean;
  mode: "add" | "edit" | "view" | "fullscreen";
  menuItem: MenuItemType | null;
  cartItem: CartItem | null;
  categoryId: string | null;
  menuId: string | null; // Menu context for price lookup

  // ============================================================
  // MENU BLOCKING & POSITION - For inline overlay pattern
  // ============================================================
  isMenuBlocked: boolean; // Block menu input during modifier editing
  selectedItemPosition: ItemPosition | null; // Position of selected item in bill

  // ============================================================
  // PRE-COMPUTED DATA - For instant ModifierScreen render
  // ============================================================
  precomputedModifiers: ModifierCategory[] | null;
  initialSelections: ModifierSelection | null;
  itemPrice: number;
  itemCashPrice: number; // Cash price for the item in current context
  activeModifierCategory: string | null;
  precomputedForItemId: string | null; // Track which item precomputed values are for (prevents race conditions)

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
  setSelectedItemPosition: (position: ItemPosition | null) => void;
}

/**
 * Pre-compute modifier data for instant UI rendering
 * This moves the heavy computation OUT of the render cycle
 *
 * OPTIMIZED:
 * - Uses item.price immediately (no O(n) menu search blocking)
 * - Menu-context price lookup deferred via queueMicrotask
 * - Lazy modifier selections (only true values set, component uses ?? false)
 */
function precomputeModifierData(
  item: MenuItemType,
  categoryId: string | undefined,
  menuId: string | undefined,
  cartItem: CartItem | null = null,
  setFn?: (partial: Partial<ModifierSidebarState>) => void
): {
  modifiers: ModifierCategory[];
  initialSelections: ModifierSelection;
  itemPrice: number;
  itemCashPrice: number;
  activeCategory: string | null;
  forItemId: string;
} {
  const { getModifierGroupsByIds, menusById } = useMenuStore.getState();

  // O(1) lookup for modifier groups instead of O(n) .find() calls
  const modifiers = item.modifierGroupIds
    ? getModifierGroupsByIds(item.modifierGroupIds)
    : [];

  // OPTIMIZED: Use item price immediately (no blocking menu search)
  let itemPrice = item.price;
  let itemCashPrice = item.cashPrice ?? item.price;

  // OPTIMIZED: Defer menu-context price lookup to background
  // This prevents blocking the UI while still getting accurate prices
  if (menuId && setFn) {
    queueMicrotask(() => {
      const menu = menusById[menuId];
      if (menu?.categories) {
        for (const cat of menu.categories) {
          const menuItem = cat.items?.find((mi) => mi.id === item.id);
          if (menuItem) {
            // Only update if price differs from item default
            if (menuItem.price !== item.price) {
              setFn({
                itemPrice: menuItem.price,
                itemCashPrice: menuItem.cashPrice ?? menuItem.price,
              });
            }
            break;
          }
        }
      }
    });
  }

  // OPTIMIZED: Lazy modifier selections - only set true values
  // Components use (selection ?? false) pattern for unset options
  const initialSelections: ModifierSelection = {};
  modifiers.forEach((category) => {
    initialSelections[category.id] = {};

    if (cartItem) {
      // For edit mode, only restore existing TRUE selections from cart item
      const existingModifier = cartItem.customizations.modifiers?.find(
        (mod) => mod.categoryId === category.id
      );

      if (existingModifier) {
        existingModifier.options.forEach((selectedOption) => {
          initialSelections[category.id][selectedOption.id] = true;
        });
      }
      // OPTIMIZATION: Skip setting false values - component uses ?? false
    } else {
      // For add mode, auto-select defaults for required categories
      if (category.type === "required") {
        // Priority 1: Find options with isDefault: true
        const defaultOptions = category.options.filter(
          (option) => option.isDefault === true && option.isAvailable !== false
        );

        if (defaultOptions.length > 0) {
          // For single-select, use the first default; for multiple, use all defaults
          if (category.selectionType === "single") {
            initialSelections[category.id][defaultOptions[0].id] = true;
          } else {
            // Multiple selection - select all defaults
            defaultOptions.forEach((option) => {
              initialSelections[category.id][option.id] = true;
            });
          }
        } else {
          // Priority 2: No defaults set - select first available option with price $0
          const freeOption = category.options.find(
            (option) => option.isAvailable !== false && option.price === 0
          );

          if (freeOption) {
            initialSelections[category.id][freeOption.id] = true;
          } else {
            // Priority 3: No free option - select first available option
            const firstAvailableOption = category.options.find(
              (option) => option.isAvailable !== false
            );
            if (firstAvailableOption) {
              initialSelections[category.id][firstAvailableOption.id] = true;
            }
          }
        }
      }
      // OPTIMIZATION: Skip setting false values - component uses ?? false
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
    forItemId: item.id,
  };
}

export const useModifierSidebarStore = create<ModifierSidebarState>((set) => ({
  isOpen: false,
  mode: "add",
  menuItem: null,
  cartItem: null,
  categoryId: null,
  menuId: null,

  // Menu blocking & position
  isMenuBlocked: false,
  selectedItemPosition: null,

  // Pre-computed data starts empty
  precomputedModifiers: null,
  initialSelections: null,
  itemPrice: 0,
  itemCashPrice: 0,
  activeModifierCategory: null,
  precomputedForItemId: null,

  openToAdd: (
    item: MenuItemType,
    orderId: string | null,
    categoryId?: string,
    menuId?: string
  ) => {
    // CRITICAL: Block touches synchronously FIRST (same frame, before React)
    setMenuBlockedSync(true);

    // Pre-compute BEFORE setting isOpen for instant render
    // Pass set function for deferred price updates
    const precomputed = precomputeModifierData(item, categoryId, menuId, null, set);

    set({
      isOpen: true,
      isMenuBlocked: true, // Block menu immediately
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
      precomputedForItemId: precomputed.forItemId,
    });
  },

  openToEdit: (item: CartItem, orderId: string | null) => {
    // CRITICAL: Block touches synchronously FIRST (same frame, before React)
    setMenuBlockedSync(true);

    // Get the menu item for pre-computation
    const { getMenuItemById } = useMenuStore.getState();
    const menuItem = getMenuItemById(item.menuItemId);

    if (menuItem) {
      // Use the cart item's stored menu context for price lookup
      // Pass set function for deferred price updates
      const precomputed = precomputeModifierData(menuItem, item.addedFromCategoryId || undefined, item.addedFromMenuId || undefined, item, set);
      set({
        isOpen: true,
        isMenuBlocked: true,
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
        precomputedForItemId: precomputed.forItemId,
      });
    } else {
      set({
        isOpen: true,
        isMenuBlocked: true,
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
        precomputedForItemId: item.menuItemId,
      });
    }
  },

  openToView: (item: CartItem, orderId: string | null) => {
    // CRITICAL: Block touches synchronously FIRST (same frame, before React)
    setMenuBlockedSync(true);

    // Get the menu item for pre-computation
    const { getMenuItemById } = useMenuStore.getState();
    const menuItem = getMenuItemById(item.menuItemId);

    if (menuItem) {
      // Use the cart item's stored menu context for price lookup
      // Pass set function for deferred price updates
      const precomputed = precomputeModifierData(menuItem, item.addedFromCategoryId || undefined, item.addedFromMenuId || undefined, item, set);
      set({
        isOpen: true,
        isMenuBlocked: true, // Block menu for consistent behavior
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
        precomputedForItemId: precomputed.forItemId,
      });
    } else {
      set({
        isOpen: true,
        isMenuBlocked: true, // Block menu for consistent behavior
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
        precomputedForItemId: item.menuItemId,
      });
    }
  },

  openFullscreen: (
    item: MenuItemType,
    orderId: string | null,
    categoryId?: string,
    menuId?: string
  ) => {
    // CRITICAL: Block touches synchronously FIRST (same frame, before React)
    setMenuBlockedSync(true);

    // Pre-compute BEFORE setting isOpen for instant render
    // Pass set function for deferred price updates
    const precomputed = precomputeModifierData(item, categoryId, menuId, null, set);

    set({
      isOpen: true,
      isMenuBlocked: true, // Block menu during fullscreen modifier editing
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
      precomputedForItemId: precomputed.forItemId,
    });
  },

  openFullscreenEdit: (item: CartItem, orderId: string | null) => {
    // CRITICAL: Block touches synchronously FIRST (same frame, before React)
    setMenuBlockedSync(true);

    // Use O(1) lookup instead of .find()
    const { getMenuItemById } = useMenuStore.getState();
    const menuItem = getMenuItemById(item.menuItemId);

    if (menuItem) {
      // Use the cart item's stored menu context for price lookup
      // Pass set function for deferred price updates
      const precomputed = precomputeModifierData(menuItem, item.addedFromCategoryId || undefined, item.addedFromMenuId || undefined, item, set);
      set({
        isOpen: true,
        isMenuBlocked: true, // Block menu during fullscreen edit
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
        precomputedForItemId: precomputed.forItemId,
      });
    } else {
      set({
        isOpen: true,
        isMenuBlocked: true, // Block menu during fullscreen edit
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
        precomputedForItemId: item.menuItemId,
      });
    }
  },

  close: () => {
    // CRITICAL: Unblock touches synchronously FIRST (same frame)
    setMenuBlockedSync(false);

    set({
      isOpen: false,
      isMenuBlocked: false, // Unblock menu on close
      selectedItemPosition: null, // Clear position tracking
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
      precomputedForItemId: null,
    });
  },

  setSelectedItemPosition: (position: ItemPosition | null) => {
    set({ selectedItemPosition: position });
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

/** Selector for precomputed item ID - use to verify data freshness */
export const selectPrecomputedForItemId = (state: ModifierSidebarState) =>
  state.precomputedForItemId;

/** Selector for close action - stable reference, no re-renders */
export const selectClose = (state: ModifierSidebarState) => state.close;

/** Combined selector for fullscreen mode check */
export const selectIsFullscreen = (state: ModifierSidebarState) =>
  state.isOpen && state.mode === "fullscreen";

// ============================================================================
// MENU BLOCKING SELECTORS - For inline overlay pattern
// ============================================================================

/** Selector for menu blocked state - use in MenuSection for blocking overlay */
export const selectIsMenuBlocked = (state: ModifierSidebarState) =>
  state.isMenuBlocked;

/** Selector for selected item position - use for attached modifier panel positioning */
export const selectSelectedItemPosition = (state: ModifierSidebarState) =>
  state.selectedItemPosition;

/** Selector for setSelectedItemPosition action - stable reference */
export const selectSetSelectedItemPosition = (state: ModifierSidebarState) =>
  state.setSelectedItemPosition;
