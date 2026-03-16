import { useToast } from "@/contexts/ToastContext";
import { colors } from "@/lib/theme";
import { CartItem, ModifierCategory } from "@/lib/types";
import { useCoursingStore } from "@/stores/useCoursingStore";
import { useMenuStore } from "@/stores/useMenuStore";
import {
  selectClose,
  useModifierSidebarStore,
} from "@/stores/useModifierSidebarStore";
import { useOrderStore } from "@/stores/useOrderStore";

import { ArrowLeft, Check, CheckCircle2, Minus, Plus, X } from "lucide-react-native";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useImmerReducer } from "use-immer";
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useShallow } from "zustand/react/shallow";
interface ModifierSelection {
  [categoryId: string]: {
    [optionId: string]: boolean;
  };
}

// ============================================================================
// MEMOIZED SUB-COMPONENTS (Prevents unnecessary re-renders)
// ============================================================================

const CategoryTab = memo(
  ({
    category,
    isActive,
    hasSelection,
    onPress,
  }: {
    category: ModifierCategory;
    isActive: boolean;
    hasSelection: boolean;
    onPress: (categoryId: string) => void;
  }) => (
    <TouchableOpacity
      onPressIn={() => onPress(category.id)}
      className={`p-3 rounded-xl border-2 min-w-[140px] ${
        isActive
          ? "bg-surface border-border"
          : hasSelection
            ? "bg-surface border-border"
            : "bg-surface border-border"
      }`}
      style={
        isActive
          ? { backgroundColor: colors.teal + "33", borderColor: colors.teal }
          : hasSelection
            ? { backgroundColor: colors.teal + "1A", borderColor: colors.teal }
            : undefined
      }
    >
      <View className="flex-row items-center justify-between mb-1.5">
        <Text className="font-semibold text-lg" style={{ color: colors.heading }}>
          {category.name}
        </Text>
        {hasSelection && (
          <Check color={colors.teal} size={20} />
        )}
      </View>
      {category.type === "required" ? (
        <View
          className="self-start px-2 py-0.5 rounded-full"
          style={{ backgroundColor: colors.danger + "33" }}
        >
          <Text className="text-sm font-bold uppercase" style={{ color: colors.danger }}>
            REQUIRED
          </Text>
        </View>
      ) : (
        <Text className="text-base" style={{ color: colors.label }}>
          {category.type}
        </Text>
      )}
    </TouchableOpacity>
  ),
);

const ModifierOption = memo(
  ({
    option,
    categoryId,
    isSelected,
    isUnavailable,
    isReadOnly,
    onToggle,
  }: {
    option: any;
    categoryId: string;
    isSelected: boolean;
    isUnavailable: boolean;
    isReadOnly: boolean;
    onToggle: (categoryId: string, optionId: string) => void;
  }) => (
    <TouchableOpacity
      disabled={isReadOnly || isUnavailable}
      onPressIn={() => onToggle(categoryId, option.id)}
      className="p-4 rounded-xl border-2 min-w-[140px] max-w-[220px] flex-1 items-center"
      style={
        isSelected
          ? { backgroundColor: colors.teal + "26", borderColor: colors.teal }
          : isUnavailable
            ? { backgroundColor: colors.panel, borderColor: colors.border, opacity: 0.5 }
            : { backgroundColor: colors.card, borderColor: colors.border }
      }
    >
      {isSelected && (
        <View className="absolute top-2 right-2">
          <CheckCircle2 color={colors.teal} size={20} />
        </View>
      )}
      <Text
        className={`text-lg font-medium text-center ${isUnavailable ? "line-through" : ""}`}
        style={{ color: isUnavailable ? colors.muted : colors.heading }}
      >
        {option.name}
        {isUnavailable && " (86'd)"}
      </Text>
      {option.price > 0 && (
        <Text className="text-base text-center mt-1" style={{ color: colors.warning }}>
          +${option.price.toFixed(2)}
        </Text>
      )}
    </TouchableOpacity>
  ),
);

// ============================================================================
// REDUCER FOR BATCHED STATE UPDATES (Better than multiple useState)
// ============================================================================

type State = {
  quantity: number;
  modifierSelections: ModifierSelection;
  selectionCounts: Record<string, number>;
  notes: string;
  activeCategory: string | null;
  isQuantityModalOpen: boolean;
  quantityInput: string;
};

type Action =
  | { type: "SET_QUANTITY"; payload: number }
  | { type: "SET_MODIFIER_SELECTIONS"; payload: ModifierSelection }
  | { type: "SET_NOTES"; payload: string }
  | { type: "SET_ACTIVE_CATEGORY"; payload: string | null }
  | { type: "OPEN_QUANTITY_MODAL"; payload: string }
  | { type: "CLOSE_QUANTITY_MODAL" }
  | { type: "SET_QUANTITY_INPUT"; payload: string }
  | { type: "INITIALIZE"; payload: Partial<State> }
  | {
      type: "TOGGLE_MODIFIER";
      payload: {
        categoryId: string;
        optionId: string;
        category: ModifierCategory;
      };
    };

// Helper: compute selection counts from a ModifierSelection object
const computeSelectionCounts = (selections: ModifierSelection): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const catId in selections) {
    let count = 0;
    const catSelections = selections[catId];
    for (const key in catSelections) {
      if (catSelections[key]) count++;
    }
    counts[catId] = count;
  }
  return counts;
};

// OPTIMIZED: Immer-based reducer — mutative draft syntax eliminates O(keys) spreads
const immerReducer = (state: State, action: Action): void => {
  switch (action.type) {
    case "SET_QUANTITY":
      state.quantity = action.payload;
      return;
    case "SET_MODIFIER_SELECTIONS":
      state.modifierSelections = action.payload;
      state.selectionCounts = computeSelectionCounts(action.payload);
      return;
    case "SET_NOTES":
      state.notes = action.payload;
      return;
    case "SET_ACTIVE_CATEGORY":
      state.activeCategory = action.payload;
      return;
    case "OPEN_QUANTITY_MODAL":
      state.isQuantityModalOpen = true;
      state.quantityInput = action.payload;
      return;
    case "CLOSE_QUANTITY_MODAL":
      state.isQuantityModalOpen = false;
      state.quantityInput = "";
      return;
    case "SET_QUANTITY_INPUT":
      state.quantityInput = action.payload;
      return;
    case "INITIALIZE":
      Object.assign(state, action.payload);
      if (action.payload.modifierSelections) {
        state.selectionCounts = computeSelectionCounts(action.payload.modifierSelections);
      }
      return;
    case "TOGGLE_MODIFIER": {
      const { categoryId, optionId, category } = action.payload;
      if (!state.modifierSelections[categoryId]) {
        state.modifierSelections[categoryId] = {};
      }
      const currentCount = state.selectionCounts[categoryId] ?? 0;
      if (category.selectionType === "single") {
        // Read before clearing
        const wasSelected = !!state.modifierSelections[categoryId][optionId];
        // Clear all, then toggle
        Object.keys(state.modifierSelections[categoryId]).forEach((key) => {
          state.modifierSelections[categoryId][key] = false;
        });
        state.modifierSelections[categoryId][optionId] = !wasSelected;
        state.selectionCounts[categoryId] = wasSelected ? 0 : 1;
      } else {
        const isCurrentlySelected = state.modifierSelections[categoryId][optionId];
        if (
          !isCurrentlySelected &&
          category.maxSelections &&
          currentCount >= category.maxSelections
        ) {
          return; // No change — Immer returns unchanged draft
        }
        state.modifierSelections[categoryId][optionId] = !isCurrentlySelected;
        state.selectionCounts[categoryId] = isCurrentlySelected
          ? currentCount - 1
          : currentCount + 1;
      }
      return;
    }
  }
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ModifierScreen = () => {
  // ============================================================================
  // OPTIMIZED: Grouped selectors via useShallow — 4 subscriptions instead of 13
  // useShallow does a shallow comparison of the returned object, so the component
  // only re-renders when one of the selected values actually changes.
  // ============================================================================

  // Group 1: Render control
  const { isOpen, mode } = useModifierSidebarStore(
    useShallow((s) => ({ isOpen: s.isOpen, mode: s.mode }))
  );

  // Group 2: Item data
  const { menuItem, cartItem, categoryId, menuId, precomputedForItemId } =
    useModifierSidebarStore(
      useShallow((s) => ({
        menuItem: s.menuItem,
        cartItem: s.cartItem,
        categoryId: s.categoryId,
        menuId: s.menuId,
        precomputedForItemId: s.precomputedForItemId,
      }))
    );

  // Group 3: Precomputed data (includes pre-built Maps from store — no per-render work)
  const {
    precomputedModifiers,
    precomputedCategoriesById,
    precomputedOptionsById,
    storeInitialSelections,
    precomputedItemPrice,
    precomputedCashPrice,
    precomputedActiveCategory,
  } = useModifierSidebarStore(
    useShallow((s) => ({
      precomputedModifiers: s.precomputedModifiers,
      precomputedCategoriesById: s.precomputedCategoriesById,
      precomputedOptionsById: s.precomputedOptionsById,
      storeInitialSelections: s.initialSelections,
      precomputedItemPrice: s.itemPrice,
      precomputedCashPrice: s.itemCashPrice,
      precomputedActiveCategory: s.activeModifierCategory,
    }))
  );

  // Group 4: Stable action ref (single selector is fine)
  const close = useModifierSidebarStore(selectClose);

  // ============================================================================
  // OPTIMIZED: Use getState() directly instead of subscriptions
  // This eliminates subscription overhead - actions are stable and state reads
  // use getState() at call time for fresh data without re-render triggers
  // ============================================================================

  // Stable action accessors - use getState() to get fresh store reference
  const addItemToActiveOrder = useCallback(
    (item: any) => useOrderStore.getState().addItemToActiveOrder(item),
    [],
  );
  const updateItemInActiveOrder = useCallback(
    (item: any) => useOrderStore.getState().updateItemInActiveOrder(item),
    [],
  );
  const removeItemFromActiveOrder = useCallback(
    (itemId: string, voidReason?: string) =>
      useOrderStore.getState().removeItemFromActiveOrder(itemId, voidReason),
    [],
  );
  const removeDraftItem = useCallback(
    (draftItemId: string) =>
      useOrderStore.getState().removeDraftItem(draftItemId),
    [],
  );
  const removeDraftItems = useCallback(
    (menuItemId: string) =>
      useOrderStore.getState().removeDraftItems(menuItemId),
    [],
  );
  const generateCartItemId = useCallback(
    (menuItemId: string, customizations: any, isDraft?: boolean) =>
      useOrderStore
        .getState()
        .generateCartItemId(menuItemId, customizations, isDraft),
    [],
  );
  const getMenuItemById = useCallback(
    (id: string) => useMenuStore.getState().getMenuItemById(id),
    [],
  );

  // OPTIMIZED: Removed allModifierGroups subscription - read via getState() in rare fallback path only
  const { show } = useToast();

  // OPTIMIZED: Lazy initializer — computed only once on mount, not every render
  const [state, dispatch] = useImmerReducer<State, Action, void>(
    immerReducer,
    undefined as void,
    (): State => {
      const selections = storeInitialSelections ?? {};
      return {
        quantity: cartItem?.quantity ?? 1,
        notes: cartItem?.customizations?.notes ?? "",
        modifierSelections: selections,
        selectionCounts: computeSelectionCounts(selections),
        activeCategory: precomputedActiveCategory ?? null,
        isQuantityModalOpen: false,
        quantityInput: "",
      };
    },
  );

  const lastDraftMenuItemIdRef = useRef<string | null>(null);
  const actionHandledRef = useRef(false);
  const draftItemIdRef = useRef<string | null>(null);

  const isReadOnly = mode === "view";
  const currentItem =
    mode === "edit" || (mode === "fullscreen" && cartItem)
      ? cartItem
      : menuItem;

  // ============================================================================
  // MEMOIZED COMPUTATIONS (Only recalculate when necessary)
  // ============================================================================

  const getCurrentItemPrice = useCallback(
    (item: any) => {
      if (!item) return 0;
      if (precomputedItemPrice > 0) return precomputedItemPrice;
      return item.price || 0;
    },
    [precomputedItemPrice],
  );

  const getCurrentItemCashPrice = useCallback(
    (item: any) => {
      if (!item) return 0;

      // Get the item ID to verify precomputed values belong to THIS item
      const itemId = item.id || item.menuItemId;

      // Only use precomputed cash price if it's for THIS item (prevents race condition)
      if (precomputedCashPrice > 0 && precomputedForItemId === itemId) {
        return precomputedCashPrice;
      }

      // Direct item cashPrice (cart items, menu items)
      if (item.cashPrice !== undefined && item.cashPrice !== null) {
        return item.cashPrice;
      }

      // For cart items, check originalPrice
      if (item.originalPrice !== undefined && item.originalPrice !== null) {
        return item.originalPrice;
      }

      // Look up from menu store (O(1) lookup)
      if (item.menuItemId && getMenuItemById) {
        const baseItem = getMenuItemById(item.menuItemId);
        if (baseItem?.cashPrice !== undefined && baseItem.cashPrice !== null) {
          return baseItem.cashPrice;
        }
      }

      // Fallback to card price (items should always have cashPrice, this is safety)
      return item.price || 0;
    },
    [getMenuItemById, precomputedCashPrice, precomputedForItemId],
  );
  // WE SHOULD BE PASSING THIS TO ANY CALCULATIONS THAT NEED THE BASE ITEM PRICE
  const baseMenuItem = useMemo(
    () => menuItem || (cartItem ? getMenuItemById(cartItem.menuItemId) : null),
    [menuItem, cartItem, getMenuItemById],
  );

  // OPTIMIZED: Ref cache to stabilize object identity when inputs haven't changed
  type MenuItemWithModifiers = typeof baseMenuItem & { modifiers: ModifierCategory[] };
  const menuItemForModifiersRef = useRef<{ item: any; mods: any; result: MenuItemWithModifiers } | null>(null);

  const menuItemForModifiers = useMemo((): MenuItemWithModifiers | null => {
    if (!isOpen) return null;
    if (!baseMenuItem) return null;
    if (precomputedModifiers) {
      // Return cached object if inputs haven't changed (prevents downstream Map rebuilds)
      const cached = menuItemForModifiersRef.current;
      if (cached && cached.item === baseMenuItem && cached.mods === precomputedModifiers) {
        return cached.result;
      }
      const result = { ...baseMenuItem, modifiers: precomputedModifiers } as MenuItemWithModifiers;
      menuItemForModifiersRef.current = { item: baseMenuItem, mods: precomputedModifiers, result };
      return result;
    }
    // Fallback: read from store at compute time (rare path — no subscription)
    if (!baseMenuItem.modifierGroupIds) return null;
    const allGroups = useMenuStore.getState().modifierGroups;
    const modifiers = baseMenuItem.modifierGroupIds
      .map((id: string) => allGroups.find((mg: ModifierCategory) => mg.id === id))
      .filter((mg): mg is ModifierCategory => !!mg);
    return { ...baseMenuItem, modifiers } as MenuItemWithModifiers;
  }, [isOpen, baseMenuItem, precomputedModifiers]);

  // Use pre-built Maps from store when available; fallback only for edit/view with cart item (no precompute)
  const { modifierCategoriesById, optionsById } = useMemo(() => {
    const emptyCategories = new Map<string, ModifierCategory>();
    const emptyOptions = new Map<string, { option: any; categoryId: string; categoryName: string }>();
    if (!isOpen) return { modifierCategoriesById: emptyCategories, optionsById: emptyOptions };
    if (precomputedCategoriesById && precomputedOptionsById) {
      return { modifierCategoriesById: precomputedCategoriesById, optionsById: precomputedOptionsById };
    }
    // Fallback: build from menuItemForModifiers (edit mode, cart item without menu context)
    menuItemForModifiers?.modifiers?.forEach((category) => {
      emptyCategories.set(category.id, category);
      category.options.forEach((option) => {
        emptyOptions.set(option.id, {
          option,
          categoryId: category.id,
          categoryName: category.name,
        });
      });
    });
    return { modifierCategoriesById: emptyCategories, optionsById: emptyOptions };
  }, [isOpen, precomputedCategoriesById, precomputedOptionsById, menuItemForModifiers?.modifiers]);

  const total = useMemo(() => {
    if (!isOpen || !currentItem) return 0;
    let baseTotal = getCurrentItemPrice(currentItem);

    Object.values(state.modifierSelections).forEach((categorySelections) => {
      Object.entries(categorySelections).forEach(([optionId, isSelected]) => {
        if (isSelected) {
          const optionData = optionsById.get(optionId);
          if (optionData) {
            baseTotal += optionData.option.price;
          }
        }
      });
    });

    return baseTotal * state.quantity;
  }, [
    isOpen,
    state.quantity,
    state.modifierSelections,
    currentItem,
    optionsById,
    getCurrentItemPrice,
  ]);

  // INITIALIZATION: Keyed remount in ModifierScreenOverlay ensures reducer lazy init
  // gets correct store data on first render — no INITIALIZE effect needed.

  // ============================================================================
  // DRAFT ITEM CREATION (Instant via store's open() → _createDraftInOpen)
  // ============================================================================

  useEffect(() => {
    if (!isOpen || !currentItem || mode === "edit" || cartItem) return;

    const stableDraftId = `draft_${currentItem.id}`;

    // Happy path: draft was already created by store's open() action
    const storeDraftId = useModifierSidebarStore.getState().draftCreatedId;
    if (storeDraftId) {
      draftItemIdRef.current = storeDraftId;
      lastDraftMenuItemIdRef.current = currentItem.id;
      return;
    }

    // Fallback: check if draft exists in order (e.g. re-mount scenario)
    const { activeOrderId, ordersById } = useOrderStore.getState();
    const activeOrder = activeOrderId ? ordersById[activeOrderId] : null;
    const existingDraft = activeOrder?.items.find(
      (i) => i.id === stableDraftId,
    );
    if (existingDraft) {
      draftItemIdRef.current = existingDraft.id;
      lastDraftMenuItemIdRef.current = currentItem.id;
      return;
    }

    // Last resort: create draft synchronously (edge case where open() couldn't create it)
    const existingItem = activeOrder?.items.find((i) => {
      if (i.menuItemId !== currentItem.id) return false;
      const hasModifiers =
        i.customizations.modifiers && i.customizations.modifiers.length > 0;
      const hasNotes =
        i.customizations.notes && i.customizations.notes.trim() !== "";
      const hasSent = i.kitchen_status === "sent";
      return !hasModifiers && !hasNotes && !hasSent;
    });

    if (!existingItem) {
      const itemPrice = getCurrentItemPrice(currentItem);
      const cashPrice = getCurrentItemCashPrice(currentItem);
      const draftItem = {
        id: stableDraftId,
        menuItemId: currentItem.id,
        name: currentItem.name,
        quantity: 1,
        originalPrice: cashPrice || itemPrice,
        price: itemPrice,
        unitPrice: currentItem.price,
        cashPrice: cashPrice || itemPrice,
        image: currentItem.image,
        isDraft: true,
        customizations: { modifiers: [], notes: "" },
        availableDiscount: currentItem.availableDiscount,
        appliedDiscount: null,
        paidQuantity: 0,
        addedFromCategoryId: categoryId || null,
        addedFromMenuId: menuId || null,
      };

      addItemToActiveOrder(draftItem);
      draftItemIdRef.current = draftItem.id;
      lastDraftMenuItemIdRef.current = currentItem.id;
    }
  }, [isOpen, currentItem?.id, mode, cartItem]); // Minimal dependencies

  // ============================================================================
  // CLEANUP
  // ============================================================================
  // Track our session identity — matches ModifierScreenOverlay's sessionKey
  const sessionKeyRef = useRef<string>("closed");
  sessionKeyRef.current = !isOpen
    ? "closed"
    : `${cartItem?.id ?? ""}_${menuItem?.id ?? ""}_${mode}`;

  useEffect(() => {
    return () => {
      if (!actionHandledRef.current && draftItemIdRef.current) {
        removeDraftItem(draftItemIdRef.current);
        draftItemIdRef.current = null;
      }
      const store = useModifierSidebarStore.getState();
      const currentSessionKey = !store.isOpen
        ? "closed"
        : `${store.cartItem?.id ?? ""}_${store.menuItem?.id ?? ""}_${store.mode}`;
      // Only close if WE were the active modifier screen unmounting (e.g. navigation away),
      // not when the "closed" placeholder unmounts during open (key change triggers remount)
      if (
        sessionKeyRef.current !== "closed" &&
        sessionKeyRef.current === currentSessionKey
      ) {
        store.close();
      }
    };
  }, []);

  useEffect(() => {
    const previousDraftMenuItemId = lastDraftMenuItemIdRef.current;
    if (!previousDraftMenuItemId) return;

    const switchedToEditExisting = mode === "edit" && !!cartItem;
    const switchedToDifferentMenuItem =
      !!menuItem && menuItem.id !== previousDraftMenuItemId;

    if (switchedToEditExisting || switchedToDifferentMenuItem) {
      removeDraftItems(previousDraftMenuItemId);
      lastDraftMenuItemIdRef.current = null;
    }
  }, [mode, cartItem, menuItem]);

  // ============================================================================
  // HANDLERS (Stabilized with refs for instant response)
  // ============================================================================

  // Store latest values in ref for stable callback access
  const latestStateRef = useRef({
    state,
    total,
    menuItem,
    cartItem,
    menuItemForModifiers,
    modifierCategoriesById,
    optionsById,
    mode,
    categoryId,
    menuId,
    isReadOnly,
    currentItem,
    close,
    show,
  });

  // Direct assignment — ref is only read inside callbacks, safe per React docs
  latestStateRef.current = {
    state,
    total,
    menuItem,
    cartItem,
    menuItemForModifiers,
    modifierCategoriesById,
    optionsById,
    mode,
    categoryId,
    menuId,
    isReadOnly,
    currentItem,
    close,
    show,
  };

  // Stable handler - never recreates, reads from ref
  const handleModifierToggle = useCallback(
    (catId: string, optionId: string) => {
      const { isReadOnly, modifierCategoriesById } = latestStateRef.current;
      if (isReadOnly) return;
      const category = modifierCategoriesById.get(catId);
      if (!category) return;
      // Direct dispatch for immediate feedback (no startTransition)
      dispatch({
        type: "TOGGLE_MODIFIER",
        payload: { categoryId: catId, optionId, category },
      });
    },
    [], // Empty deps = never recreates
  );

  // Stable handler
  const handleQuantityPress = useCallback(() => {
    const { isReadOnly, state } = latestStateRef.current;
    if (isReadOnly) return;
    dispatch({
      type: "OPEN_QUANTITY_MODAL",
      payload: state.quantity.toString(),
    });
  }, []);

  // Stable handler
  const handleQuantitySubmit = useCallback(() => {
    const { state } = latestStateRef.current;
    const newQuantity = parseInt(state.quantityInput, 10);
    if (newQuantity && newQuantity > 0) {
      dispatch({ type: "SET_QUANTITY", payload: newQuantity });
    }
    dispatch({ type: "CLOSE_QUANTITY_MODAL" });
  }, []);

  // Stable handler
  const handleQuantityCancel = useCallback(() => {
    dispatch({ type: "CLOSE_QUANTITY_MODAL" });
  }, []);

  // OPTIMIZED: Stable handler for CategoryTab onPress (accepts categoryId, stable ref for memo)
  const handleCategoryTabPress = useCallback((categoryId: string) => {
    dispatch({ type: "SET_ACTIVE_CATEGORY", payload: categoryId });
  }, []);

  // OPTIMIZED: Stable quantity +/- handlers (read current state from ref)
  const handleQuantityDecrement = useCallback(() => {
    const { state: currentState } = latestStateRef.current;
    dispatch({ type: "SET_QUANTITY", payload: Math.max(1, currentState.quantity - 1) });
  }, []);

  const handleQuantityIncrement = useCallback(() => {
    const { state: currentState } = latestStateRef.current;
    dispatch({ type: "SET_QUANTITY", payload: currentState.quantity + 1 });
  }, []);

  // Stable handleSave - reads all values from refs, never recreates
  const handleSave = useCallback(() => {
    actionHandledRef.current = true;

    // Read all values from refs for instant access
    const {
      state: currentState,
      total: currentTotal,
      menuItem: currentMenuItem,
      cartItem: currentCartItem,
      menuItemForModifiers: modifiersItem,
      modifierCategoriesById: categoriesMap,
      optionsById: optsMap,
      mode: currentMode,
      categoryId: catId,
      menuId: mId,
      currentItem: item,
      close: closeModal,
      show: showToast,
    } = latestStateRef.current;

    const baseItem = currentMenuItem || modifiersItem;

    // Check if this is an open item (no base menu item, but has cart item with is_open_item flag)
    const isOpenItem =
      currentCartItem?.is_open_item === true ||
      currentCartItem?.menuItemId?.startsWith("open_item_") ||
      currentCartItem?.customizations?.notes === "Open Item";

    // For open items in edit mode, we can proceed without baseItem
    // For regular items, we need baseItem
    if (!baseItem && !isOpenItem) return;

    // Handle open item updates directly (they don't need modifier validation)
    // We check for both "edit" and "fullscreen" because openToEdit sets mode to "fullscreen"
    if (
      isOpenItem &&
      (currentMode === "edit" || currentMode === "fullscreen") &&
      currentCartItem
    ) {
      const updatedOpenItem = {
        ...currentCartItem,
        quantity: currentState.quantity,
        // For open items, price should stay the same (per unit), total is calculated
        unitPrice:
          currentCartItem.unitPrice ||
          currentCartItem.price ||
          currentTotal / currentState.quantity,
        baseCardPrice:
          currentCartItem.baseCardPrice ||
          currentCartItem.price ||
          currentTotal / currentState.quantity,
        customizations: {
          ...currentCartItem.customizations,
          notes: currentState.notes || "Open Item",
        },
        isDraft: false,
      };

      updateItemInActiveOrder(updatedOpenItem);
      showToast({
        title: "Item Updated",
        message: `${currentCartItem.name} quantity updated to ${currentState.quantity}.`,
        type: "success",
      });
      closeModal();
      return;
    }

    // Staleness guard: Get safe cash price directly if precomputed data is stale
    // At this point, baseItem must be defined (we returned early if it wasn't and this isn't an open item)
    if (!baseItem) return; // TypeScript safety guard
    const storeState = useModifierSidebarStore.getState();
    // For MenuItemType, use .id; for CartItem, use .menuItemId
    const baseItemId =
      baseItem.id ||
      ("menuItemId" in (item || {})
        ? (item as CartItem)?.menuItemId
        : undefined);
    let safeCashPrice: number | null = null;

    if (storeState.precomputedForItemId !== baseItemId) {
      console.warn(
        "[handleSave] Stale precomputed data detected, fetching fresh prices",
      );
      // Get fresh cashPrice directly from menu item
      const freshMenuItem = baseItem.id
        ? useMenuStore.getState().getMenuItemById(baseItem.id)
        : null;
      safeCashPrice =
        freshMenuItem?.cashPrice ?? baseItem.cashPrice ?? baseItem.price;
    }

    if (modifiersItem?.modifiers && modifiersItem.modifiers.length > 0) {
      const hasRequiredSelections = modifiersItem.modifiers.every(
        (category) => {
          if (category.type === "required") {
            return (currentState.selectionCounts[category.id] ?? 0) > 0;
          }
          return true;
        },
      );

      if (!hasRequiredSelections) {
        showToast({
          title: "Missing Selections",
          message: "Please select all required options before proceeding.",
          type: "error",
        });
        return;
      }
    }

    // OPTIMIZED: Capture cash price before close (store gets cleared by closeModal)
    const resolvedCashPrice = safeCashPrice ?? getCurrentItemCashPrice(baseItem);

    // OPTIMIZED: Close modal immediately after validation passes.
    // Native-driver animation starts on UI thread while save logic runs on JS thread.
    // Safe because all needed state is already captured in latestStateRef/locals above.
    closeModal();

    // Run save work concurrently with the native-driver close animation.
    // All needed state is captured in locals above — no stale closures.
    queueMicrotask(() => {
      const selectedModifiers = modifiersItem?.modifiers
        ? Object.entries(currentState.modifierSelections)
            .map(([cId, selections]) => {
              const category = categoriesMap.get(cId);
              const selectedOptions = Object.entries(selections)
                .filter(([_, isSelected]) => isSelected)
                .map(([optionId]) => {
                  const optionData = optsMap.get(optionId);
                  return {
                    id: optionId,
                    name: optionData?.option.name || "",
                    price: optionData?.option.price || 0,
                  };
                });

              return {
                categoryId: cId,
                categoryName: category?.name || "",
                options: selectedOptions,
              };
            })
            .filter((mod) => mod.options.length > 0)
        : [];

      const finalCustomizations = {
        modifiers: selectedModifiers,
        notes: currentState.notes,
      };

      if (
        currentMode === "edit" ||
        (currentMode === "fullscreen" && currentCartItem)
      ) {
        if (!currentCartItem) return;
        const updatedItem = {
          ...currentCartItem,
          quantity: currentState.quantity,
          price: currentTotal / Math.max(1, currentState.quantity),
          customizations: finalCustomizations,
          isDraft: false,
          // Clear calculated fields - will be recalculated by calculateOrderTotals
          // These values become stale when quantity/modifiers change
          subtotal: undefined,
          cashSubtotal: undefined,
          taxAmount: undefined,
          cashTaxAmount: undefined,
        };

        updateItemInActiveOrder(updatedItem);
        showToast({
          title: "Item Updated",
          message: `Your changes to ${item?.name} have been saved.`,
          type: "success",
        });
      } else {
        const itemCashPrice = resolvedCashPrice;

        // Resolve category and menu names from IDs
        const categoryName = catId
          ? useMenuStore.getState().getCategoryById(catId)?.name
          : undefined;

        // Single item object — addItemToActiveOrder already handles
        // draft removal and merge detection via generateItemCompositeKey
        const newItem = {
          id: generateCartItemId(baseItem.id, finalCustomizations),
          menuItemId: baseItem.id,
          name: baseItem.name,
          quantity: currentState.quantity,
          originalPrice: itemCashPrice,
          unitPrice: baseItem.price,
          price: currentTotal / Math.max(1, currentState.quantity),
          image: baseItem.image,
          cashPrice: itemCashPrice,
          customizations: finalCustomizations,
          availableDiscount: baseItem.availableDiscount,
          appliedDiscount: null,
          paidQuantity: 0,
          isDraft: false,
          addedFromCategoryId: catId || null,
          addedFromMenuId: mId || null,
          category_name: categoryName || undefined,
          baseCardPrice: baseItem.price,
          baseCashPrice: baseItem.cashPrice ?? baseItem.price,
        };
        addItemToActiveOrder(newItem);
      }
    });
  }, []); // Empty deps = never recreates

  // Stable handleCancel - reads from refs
  const handleCancel = useCallback(() => {
    actionHandledRef.current = true;
    const {
      mode: currentMode,
      cartItem: cart,
      currentItem: item,
      close: closeModal,
    } = latestStateRef.current;

    if (
      currentMode !== "edit" &&
      !(currentMode === "fullscreen" && cart) &&
      !cart &&
      item
    ) {
      removeDraftItems(item.id);
      lastDraftMenuItemIdRef.current = null;
    }
    closeModal();
  }, []); // Empty deps = never recreates

  // ============================================================================
  // RENDER
  // ============================================================================

  if (cartItem?.kitchen_status === "sent" || cartItem?.kitchen_status === "ready" || cartItem?.kitchen_status === "served") {
    return (
      <View className="flex-1 bg-panel">
        <View className="flex-row items-center justify-between p-4 border-b bg-panel" style={{ borderColor: colors.border }}>
          <TouchableOpacity onPressIn={close} className="flex-row items-center">
            <ArrowLeft color={colors.label} size={20} />
            <Text className="text-xl font-medium ml-1.5" style={{ color: colors.heading }}>
              Back to Bill
            </Text>
          </TouchableOpacity>
        </View>
        <View className="flex-1 items-center justify-center p-6 w-full">
          <View className="items-center w-full">
            <Text className="text-2xl font-bold text-center mb-3" style={{ color: colors.heading }}>
              Item Already Sent
            </Text>
            <Text className="text-lg text-center mb-4 leading-relaxed" style={{ color: colors.label }}>
              This item has been sent to the kitchen and cannot be modified.
            </Text>
            <View className="bg-surface flex flex-col items-center justify-center rounded-xl p-4 w-full border" style={{ borderColor: colors.border }}>
              <View className="flex-row items-center justify-center w-full gap-3 mb-3">
                <Image
                  source={require("@/assets/images/classic_burger.png")}
                  className="w-14 h-14 rounded-lg"
                />
                <View className="flex-1">
                  <Text className="text-xl font-semibold" style={{ color: colors.heading }}>
                    {cartItem.name}
                  </Text>
                  <Text className="text-base" style={{ color: colors.label }}>
                    Quantity: {cartItem.quantity}
                  </Text>
                </View>
              </View>
            </View>
            <TouchableOpacity
              onPressIn={close}
              className="mt-6 px-6 py-3 rounded-xl"
              style={{ backgroundColor: colors.teal }}
            >
              <Text className="text-lg font-semibold" style={{ color: colors.onSolid }}>
                Back to Bill
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (!isOpen || !currentItem) return null;

  const currentCategory = menuItemForModifiers?.modifiers?.find(
    (cat) => cat.id === state.activeCategory,
  );
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-panel"
    >
      <View className="flex-row items-center justify-between p-4 border-b bg-panel" style={{ borderColor: colors.border }}>
        <TouchableOpacity
          onPressIn={handleCancel}
          className="flex-row items-center gap-1.5"
        >
          <ArrowLeft color={colors.label} size={20} />
          <Text className="text-xl font-medium ml-1.5" style={{ color: colors.heading }}>
            {mode === "edit" || (mode === "fullscreen" && cartItem)
              ? "Back to Bill"
              : "Back to Menu"}
          </Text>
        </TouchableOpacity>
        <View className="flex-row items-center gap-x-3">
          <TouchableOpacity
            onPressIn={handleCancel}
            className="p-2"
          >
            <X color={colors.muted} size={23} />
          </TouchableOpacity>
          <TouchableOpacity
            onPressIn={handleSave}
            className="py-2.5 px-6 rounded-full gap-x-1.5 flex-row items-center justify-center"
            style={{
              backgroundColor: colors.success,
              shadowColor: colors.success,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.5,
              shadowRadius: 12,
              elevation: 8,
            }}
          >
            <Text className="text-xl font-semibold" style={{ color: colors.onSolid }}>Done</Text>
            <Check color={colors.onSolid} size={20} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="p-4 border-b" style={{ borderColor: colors.border }}>
          <View className="flex-row items-center gap-3">
            <Image
              source={require("@/assets/images/classic_burger.png")}
              className="w-20 h-20 rounded-lg"
            />
            <View className="flex-1">
              <Text className="text-2xl font-bold" style={{ color: colors.heading }}>
                {currentItem.name}
              </Text>
              <Text className="text-lg mt-0.5" style={{ color: colors.label }}>
                {menuItemForModifiers?.description}
              </Text>
            </View>
            <Text className="text-xl font-semibold" style={{ color: colors.warning }}>
              ${getCurrentItemPrice(currentItem).toFixed(2)}
            </Text>
          </View>
        </View>

        {menuItemForModifiers?.modifiers &&
          menuItemForModifiers.modifiers.length > 0 && (
            <View className="p-4">
              <Text className="text-2xl font-bold mb-3" style={{ color: colors.heading }}>
                Options
              </Text>
              <View className="flex-row flex-wrap gap-3 mb-4">
                {menuItemForModifiers.modifiers.map((category) => {
                  const hasSelection = (state.selectionCounts[category.id] ?? 0) > 0;
                  const isActive = state.activeCategory === category.id;
                  return (
                    <CategoryTab
                      key={category.id}
                      category={category}
                      isActive={isActive}
                      hasSelection={hasSelection}
                      onPress={handleCategoryTabPress}
                    />
                  );
                })}
              </View>

              {currentCategory && (
                <View className="mb-4">
                  <View className="flex-row items-center justify-between mb-3">
                    <Text className="text-xl font-semibold" style={{ color: colors.heading }}>
                      {currentCategory.name}
                    </Text>
                    <View className="flex-row items-center">
                      <Text
                        className="text-base font-semibold"
                        style={{
                          color: currentCategory.type === "required" ? colors.warning : colors.label,
                          textDecorationLine: currentCategory.type === "required" ? "underline" : "none",
                        }}
                      >
                        {currentCategory.type === "required" ? "Required" : "Optional"}
                      </Text>
                      <Text className="text-base mx-1.5" style={{ color: colors.muted }}>·</Text>
                      <Text className="text-base" style={{ color: colors.muted }}>
                        {currentCategory.selectionType === "single"
                          ? "Single Select"
                          : currentCategory.maxSelections
                            ? `Select up to ${currentCategory.maxSelections}`
                            : "Multiple Select"}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row flex-wrap gap-3">
                    {currentCategory.options.map((option) => {
                      const isSelected =
                        state.modifierSelections[currentCategory.id]?.[
                          option.id
                        ] || false;
                      const isUnavailable = option.isAvailable === false;
                      return (
                        <ModifierOption
                          key={option.id}
                          option={option}
                          categoryId={currentCategory.id}
                          isSelected={isSelected}
                          isUnavailable={isUnavailable}
                          isReadOnly={isReadOnly}
                          onToggle={handleModifierToggle}
                        />
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          )}

        <View className="p-4 border-y" style={{ borderColor: colors.border }}>
          <View className="flex-row items-center justify-between">
            <Text className="text-xl font-semibold" style={{ color: colors.heading }}>
              Quantity
            </Text>
            <View className="flex-row items-center">
              <TouchableOpacity
                disabled={isReadOnly}
                onPressIn={handleQuantityDecrement}
                className="p-3 border rounded-full bg-surface"
                style={{ borderColor: colors.border }}
              >
                <Minus color={colors.label} size={20} />
              </TouchableOpacity>
              <TouchableOpacity
                disabled={isReadOnly}
                onPressIn={handleQuantityPress}
                className="mx-4 w-14"
              >
                <Text className="text-3xl border rounded-lg p-1 font-bold text-center" style={{ borderColor: colors.border, color: colors.heading }}>
                  {state.quantity}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={isReadOnly}
                onPressIn={handleQuantityIncrement}
                className="p-3 rounded-full"
                style={{ backgroundColor: colors.teal }}
              >
                <Plus color={colors.onSolid} size={20} />
              </TouchableOpacity>
            </View>
          </View>
          <View className="flex-row items-center gap-2 mt-3">
            {[3, 4, 5, 6, 7, 8].map((n) => (
              <TouchableOpacity
                key={n}
                disabled={isReadOnly}
                onPress={() => dispatch({ type: "SET_QUANTITY", payload: n })}
                className="flex-1 py-2 rounded-lg items-center border"
                style={{
                  backgroundColor: state.quantity === n ? colors.teal : colors.panel,
                  borderColor: state.quantity === n ? colors.teal : colors.border,
                }}
              >
                <Text
                  className="text-base font-bold"
                  style={{ color: state.quantity === n ? colors.onSolid : colors.label }}
                >
                  {n}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View className="p-4 border-b" style={{ borderColor: colors.border }}>
          <View className="flex-row items-center gap-2 mb-3">
            <Text className="text-xl font-semibold" style={{ color: colors.heading }}>
              Special Instructions
            </Text>
            <Text className="text-base" style={{ color: colors.label }}>
              Optional
            </Text>
          </View>
          <TextInput
            editable={!isReadOnly}
            value={state.notes}
            onChangeText={(text) =>
              dispatch({ type: "SET_NOTES", payload: text })
            }
            placeholder="No onions..."
            multiline
            maxLength={80}
            className="px-4 py-3 border rounded-lg bg-surface min-h-[80px] text-xl"
            style={{ borderColor: colors.border, color: colors.heading }}
            placeholderTextColor={colors.muted}
          />
          <Text className="text-base mt-1.5 text-right" style={{ color: colors.label }}>
            {state.notes.length}/80
          </Text>
        </View>

        {menuItemForModifiers?.allergens &&
          menuItemForModifiers.allergens.length > 0 && (
            <View className="p-4 border-b" style={{ borderColor: colors.border }}>
              <Text className="text-xl font-semibold mb-3" style={{ color: colors.heading }}>
                Allergens
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {menuItemForModifiers.allergens.map((allergen) => (
                  <View
                    key={allergen}
                    className="px-3 py-2 bg-red-900 rounded-full"
                  >
                    <Text className="text-lg text-red-300">{allergen}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

        <View className="p-4">
          <View className="flex-row justify-between items-center bg-surface p-4 rounded-lg">
            <Text className="text-2xl font-semibold" style={{ color: colors.heading }}>Total</Text>
            <Text className="text-3xl font-bold" style={{ color: colors.heading }}>
              ${total.toFixed(2)}
            </Text>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={state.isQuantityModalOpen}
        transparent
        animationType="fade"
        onRequestClose={handleQuantityCancel}
      >
        <View className="flex-1 bg-black/50 justify-center items-center">
          <View className="bg-surface rounded-xl p-4 w-72 border" style={{ borderColor: colors.border }}>
            <Text className="text-xl font-semibold mb-3 text-center" style={{ color: colors.heading }}>
              Enter Quantity
            </Text>
            <TextInput
              value={state.quantityInput}
              onChangeText={(text) =>
                dispatch({ type: "SET_QUANTITY_INPUT", payload: text })
              }
              keyboardType="numeric"
              autoFocus
              className="p-3 border rounded-lg bg-panel text-xl text-center mb-4 h-16"
              style={{ borderColor: colors.border, color: colors.heading }}
            />
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPressIn={handleQuantityCancel}
                className="flex-1 py-3 px-4 bg-panel border rounded-lg"
                style={{ borderColor: colors.border }}
              >
                <Text className="text-lg font-semibold text-center" style={{ color: colors.heading }}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPressIn={handleQuantitySubmit}
                className="flex-1 py-3 px-4 rounded-lg"
                style={{ backgroundColor: colors.teal }}
              >
                <Text className="text-lg font-semibold text-center" style={{ color: colors.onSolid }}>
                  Set
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

export default memo(ModifierScreen);
