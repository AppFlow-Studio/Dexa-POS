import { useToast } from "@/contexts/ToastContext";
import { CartItem, ModifierCategory } from "@/lib/types";
import { useCoursingStore } from "@/stores/useCoursingStore";
import { useMenuStore } from "@/stores/useMenuStore";
import {
  useModifierSidebarStore,
  selectIsOpen,
  selectMode,
  selectMenuItem,
  selectCartItem,
  selectMenuId,
  selectClose,
  selectPrecomputedModifiers,
  selectInitialSelections,
  selectItemPrice,
  selectItemCashPrice,
  selectActiveModifierCategory,
  selectPrecomputedForItemId,
} from "@/stores/useModifierSidebarStore";
import { useOrderStore } from "@/stores/useOrderStore";
import debounce from "lodash/debounce";
import { ArrowLeft, Check, Minus, Plus, X } from "lucide-react-native";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
} from "react";
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
import ModifierScreenSkeleton from "./ModifierScreenSkeleton";
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
    onPress: () => void;
  }) => (
    <TouchableOpacity
      onPressIn={onPress}
      className={`p-3 rounded-xl border-2 min-w-[140px] ${isActive
        ? "bg-blue-600 border-blue-400"
        : hasSelection
          ? "bg-green-600 border-green-400"
          : "bg-[#303030] border-gray-600"
        }`}
    >
      <View className="flex-row items-center justify-between mb-1.5">
        <Text className="font-semibold text-lg text-white">
          {category.name}
        </Text>
        {hasSelection && (
          <Check color={isActive ? "#FFFFFF" : "#10B981"} size={20} />
        )}
      </View>
      <Text
        className={`text-base ${category.type === "required" ? "text-red-400" : "text-gray-400"
          }`}
      >
        {category.type}
      </Text>
    </TouchableOpacity>
  )
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
      className={`p-4 rounded-xl border-2 min-w-[120px] ${isSelected
        ? "bg-blue-600 border-blue-400"
        : isUnavailable
          ? "bg-[#1a1a1a] border-gray-700"
          : "bg-[#303030] border-gray-600"
        }`}
    >
      <Text
        className={`text-xl font-medium text-center ${isSelected
          ? "text-white"
          : isUnavailable
            ? "text-gray-500"
            : "text-white"
          }`}
      >
        {option.name}
        {isUnavailable && " (86'd)"}
      </Text>
      {option.price > 0 && (
        <Text
          className={`text-lg text-center mt-1 ${isSelected ? "text-blue-200" : "text-blue-400"
            }`}
        >
          +${option.price.toFixed(2)}
        </Text>
      )}
    </TouchableOpacity>
  )
);

// ============================================================================
// REDUCER FOR BATCHED STATE UPDATES (Better than multiple useState)
// ============================================================================

type State = {
  quantity: number;
  modifierSelections: ModifierSelection;
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

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "SET_QUANTITY":
      return { ...state, quantity: action.payload };
    case "SET_MODIFIER_SELECTIONS":
      return { ...state, modifierSelections: action.payload };
    case "SET_NOTES":
      return { ...state, notes: action.payload };
    case "SET_ACTIVE_CATEGORY":
      return { ...state, activeCategory: action.payload };
    case "OPEN_QUANTITY_MODAL":
      return {
        ...state,
        isQuantityModalOpen: true,
        quantityInput: action.payload,
      };
    case "CLOSE_QUANTITY_MODAL":
      return {
        ...state,
        isQuantityModalOpen: false,
        quantityInput: "",
      };
    case "SET_QUANTITY_INPUT":
      return { ...state, quantityInput: action.payload };
    case "INITIALIZE":
      return { ...state, ...action.payload };
    case "TOGGLE_MODIFIER": {
      const { categoryId, optionId, category } = action.payload;
      const newSelections = { ...state.modifierSelections };

      if (!newSelections[categoryId]) {
        newSelections[categoryId] = {};
      }

      if (category.selectionType === "single") {
        Object.keys(newSelections[categoryId]).forEach((key) => {
          newSelections[categoryId][key] = false;
        });
        newSelections[categoryId][optionId] =
          !newSelections[categoryId][optionId];
      } else {
        const currentSelected = Object.values(newSelections[categoryId]).filter(
          Boolean
        ).length;
        const isCurrentlySelected = newSelections[categoryId][optionId];

        if (
          !isCurrentlySelected &&
          category.maxSelections &&
          currentSelected >= category.maxSelections
        ) {
          return state;
        }

        newSelections[categoryId][optionId] = !isCurrentlySelected;
      }

      return { ...state, modifierSelections: newSelections };
    }
    default:
      return state;
  }
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ModifierScreen = () => {
  // ============================================================================
  // OPTIMIZED: Use granular selectors instead of full store subscription
  // Each selector creates a separate subscription - React only re-renders when
  // THAT specific value changes, not when ANY store value changes
  // ============================================================================
  const isOpen = useModifierSidebarStore(selectIsOpen);
  const mode = useModifierSidebarStore(selectMode);
  const menuItem = useModifierSidebarStore(selectMenuItem);
  const cartItem = useModifierSidebarStore(selectCartItem);
  const categoryId = useModifierSidebarStore((s) => s.categoryId);
  const menuId = useModifierSidebarStore(selectMenuId);
  const close = useModifierSidebarStore(selectClose);
  const precomputedModifiers = useModifierSidebarStore(selectPrecomputedModifiers);
  const storeInitialSelections = useModifierSidebarStore(selectInitialSelections);
  const precomputedItemPrice = useModifierSidebarStore(selectItemPrice);
  const precomputedCashPrice = useModifierSidebarStore(selectItemCashPrice);
  const precomputedActiveCategory = useModifierSidebarStore(selectActiveModifierCategory);
  const precomputedForItemId = useModifierSidebarStore(selectPrecomputedForItemId);

  // ============================================================================
  // TWO-STAGE HYDRATION - Skeleton first, then rich content
  // Shows skeleton UI instantly (<16ms) while heavy content hydrates
  // ============================================================================
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    if (isOpen && !isHydrated) {
      // Defer hydration to next frame for instant skeleton display
      requestAnimationFrame(() => setIsHydrated(true));
    }
    if (!isOpen && isHydrated) {
      setIsHydrated(false);
    }
  }, [isOpen, isHydrated]);

  // ============================================================================
  // OPTIMIZED: Use getState() directly instead of subscriptions
  // This eliminates subscription overhead - actions are stable and state reads
  // use getState() at call time for fresh data without re-render triggers
  // ============================================================================

  // Stable action accessors - use getState() to get fresh store reference
  const addItemToActiveOrder = useCallback(
    (item: any) => useOrderStore.getState().addItemToActiveOrder(item),
    []
  );
  const updateItemInActiveOrder = useCallback(
    (item: any) => useOrderStore.getState().updateItemInActiveOrder(item),
    []
  );
  const removeItemFromActiveOrder = useCallback(
    (itemId: string, voidReason?: string) => useOrderStore.getState().removeItemFromActiveOrder(itemId, voidReason),
    []
  );
  const generateCartItemId = useCallback(
    (menuItemId: string, customizations: any, isDraft?: boolean) =>
      useOrderStore.getState().generateCartItemId(menuItemId, customizations, isDraft),
    []
  );
  const getMenuItemById = useCallback(
    (id: string) => useMenuStore.getState().getMenuItemById(id),
    []
  );
  
  // Only subscribe to modifierGroups since it's used in memoized computation
  const allModifierGroups = useMenuStore((s) => s.modifierGroups);

  const { show } = useToast();

  // OPTIMIZED: Use reducer with lazy initializer - no useEffect delay
  // This eliminates an extra render cycle by initializing state immediately
  const [state, dispatch] = useReducer(
    reducer,
    { storeInitialSelections, precomputedActiveCategory, cartItem },
    (init) => ({
      quantity: init.cartItem?.quantity ?? 1,
      notes: init.cartItem?.customizations?.notes ?? "",
      modifierSelections: init.storeInitialSelections ?? {},
      activeCategory: init.precomputedActiveCategory ?? null,
      isQuantityModalOpen: false,
      quantityInput: "",
    })
  );

  const lastDraftMenuItemIdRef = useRef<string | null>(null);
  const actionHandledRef = useRef(false);
  const draftItemIdRef = useRef<string | null>(null);
  const isInitializedRef = useRef(false);
  const [, startTransition] = useTransition();

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
    [precomputedItemPrice]
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
    [getMenuItemById, precomputedCashPrice, precomputedForItemId]
  );

  const baseMenuItem = useMemo(
    () => menuItem || (cartItem ? getMenuItemById(cartItem.menuItemId) : null),
    [menuItem, cartItem, getMenuItemById]
  );

  const menuItemForModifiers = useMemo(() => {
    if (!baseMenuItem) return null;
    if (precomputedModifiers) {
      return { ...baseMenuItem, modifiers: precomputedModifiers };
    }
    if (!baseMenuItem.modifierGroupIds) return null;
    const modifiers = baseMenuItem.modifierGroupIds
      .map((id) => allModifierGroups.find((mg) => mg.id === id))
      .filter((mg): mg is ModifierCategory => !!mg);
    return { ...baseMenuItem, modifiers };
  }, [baseMenuItem, precomputedModifiers, allModifierGroups]);

  const { modifierCategoriesById, optionsById } = useMemo(() => {
    const categoriesMap = new Map<string, ModifierCategory>();
    const optionsMap = new Map<
      string,
      { option: any; categoryId: string; categoryName: string }
    >();

    menuItemForModifiers?.modifiers?.forEach((category) => {
      categoriesMap.set(category.id, category);
      category.options.forEach((option) => {
        optionsMap.set(option.id, {
          option,
          categoryId: category.id,
          categoryName: category.name,
        });
      });
    });

    return { modifierCategoriesById: categoriesMap, optionsById: optionsMap };
  }, [menuItemForModifiers?.modifiers]);

  const total = useMemo(() => {
    if (!currentItem) return 0;
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
    state.quantity,
    state.modifierSelections,
    currentItem,
    optionsById,
    getCurrentItemPrice,
  ]);

  // ============================================================================
  // DEBOUNCED DRAFT UPDATE (Stabilized with useRef - no recreation on render)
  // ============================================================================

  const updateDraftItemRef = useRef<ReturnType<typeof debounce> | null>(null);

  // Create stable debounce function once on mount
  useEffect(() => {
    updateDraftItemRef.current = debounce(
      (
        quantity: number,
        modifierSelections: ModifierSelection,
        notes: string,
        item: any,
        modifiers: ModifierCategory[] | undefined,
        categoriesMap: Map<string, ModifierCategory>,
        optionsMap: Map<
          string,
          { option: any; categoryId: string; categoryName: string }
        >,
        getPrice: (item: any) => number
      ) => {
        const { activeOrderId, ordersById, updateItemInActiveOrder } =
          useOrderStore.getState();
        const activeOrder = activeOrderId ? ordersById[activeOrderId] : null;
        const draftItem = activeOrder?.items.find(
          (i) => i.id === draftItemIdRef.current
        );

        if (!draftItem || !item) return;

        const selectedModifiers = modifiers
          ? Object.entries(modifierSelections).map(([catId, selections]) => {
            const category = categoriesMap.get(catId);
            const selectedOptions = Object.entries(selections)
              .filter(([_, isSelected]) => isSelected)
              .map(([optionId]) => {
                const optionData = optionsMap.get(optionId);
                return {
                  id: optionId,
                  name: optionData?.option.name || "",
                  price: optionData?.option.price || 0,
                };
              });

            return {
              categoryId: catId,
              categoryName: category?.name || "",
              options: selectedOptions,
            };
          })
          : [];

        let baseTotal = getPrice(item);
        selectedModifiers.forEach((modifier) => {
          modifier.options.forEach((option) => {
            baseTotal += option.price;
          });
        });

        const updatedDraftItem = {
          ...draftItem,
          quantity,
          price: baseTotal,
          customizations: {
            modifiers: selectedModifiers,
            notes,
          },
        };
        updateItemInActiveOrder(updatedDraftItem);
      },
      50
    );

    return () => {
      updateDraftItemRef.current?.cancel();
    };
  }, []); // Empty deps - stable reference

  // Trigger debounced update when values change
  useEffect(() => {
    if (!isOpen || !currentItem || mode === "edit" || cartItem) return;

    updateDraftItemRef.current?.(
      state.quantity,
      state.modifierSelections,
      state.notes,
      currentItem,
      menuItemForModifiers?.modifiers,
      modifierCategoriesById,
      optionsById,
      getCurrentItemPrice
    );
  }, [
    state.quantity,
    state.modifierSelections,
    state.notes,
    currentItem,
    isOpen,
    mode,
    cartItem,
    menuItemForModifiers?.modifiers,
    modifierCategoriesById,
    optionsById,
    getCurrentItemPrice,
  ]);

  // ============================================================================
  // INITIALIZATION (OPTIMIZED - State initialized inline via reducer initializer)
  // This effect only resets action tracking refs - no state dispatch needed
  // ============================================================================

  useEffect(() => {
    if (!isOpen || !currentItem) return;
    // Reset action tracking on each open
    actionHandledRef.current = false;
    isInitializedRef.current = true;

    return () => {
      isInitializedRef.current = false;
    };
  }, [isOpen, currentItem?.id]);

  // Reset state when a NEW item is opened (not edit mode)
  // This ensures modifier selections don't persist between different menu items
  const prevMenuItemIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen || !menuItem || mode === "edit") return;

    // Only reset if this is a DIFFERENT menu item
    if (prevMenuItemIdRef.current !== null && prevMenuItemIdRef.current !== menuItem.id) {
      // Reset to fresh defaults from store
      dispatch({
        type: "INITIALIZE",
        payload: {
          quantity: 1,
          notes: "",
          modifierSelections: storeInitialSelections ?? {},
          activeCategory: precomputedActiveCategory ?? null,
        },
      });
    }
    prevMenuItemIdRef.current = menuItem.id;
  }, [isOpen, menuItem?.id, mode, storeInitialSelections, precomputedActiveCategory]);

  // ============================================================================
  // DRAFT ITEM CREATION (Deferred via microtask for non-blocking UI)
  // ============================================================================
  
  // Store current values in ref for stable microtask access
  const draftCreationRef = useRef({
    currentItem,
    categoryId,
    menuId,
    getCurrentItemPrice,
    getCurrentItemCashPrice,
    addItemToActiveOrder,
  });
  
  // Keep ref updated
  useEffect(() => {
    draftCreationRef.current = {
      currentItem,
      categoryId,
      menuId,
      getCurrentItemPrice,
      getCurrentItemCashPrice,
      addItemToActiveOrder,
    };
  });

  useEffect(() => {
    if (!isOpen || !currentItem || mode === "edit" || cartItem) return;

    // Use queueMicrotask for truly non-blocking draft creation
    // Microtasks execute after current task but before next render
    let cancelled = false;
    
    queueMicrotask(() => {
      if (cancelled) return;

      const {
        currentItem: item,
        categoryId: catId,
        menuId: mId,
        getCurrentItemPrice: getPrice,
        getCurrentItemCashPrice: getCashPrice,
        addItemToActiveOrder: addItem,
      } = draftCreationRef.current;

      if (!item) return;

      // Staleness guard: Verify store still has data for THIS item
      const currentStoreItemId = useModifierSidebarStore.getState().precomputedForItemId;
      if (currentStoreItemId !== item.id) {
        console.warn('[ModifierScreen] Stale draft creation detected, item changed from', item.id, 'to', currentStoreItemId);
        return;
      }

      const { activeOrderId, ordersById } = useOrderStore.getState();
      const activeOrder = activeOrderId ? ordersById[activeOrderId] : null;
      const stableDraftId = `draft_${item.id}`;

      // Check if draft already exists
      const existingStableDraft = activeOrder?.items.find(
        (i) => i.id === stableDraftId
      );
      if (existingStableDraft) {
        draftItemIdRef.current = existingStableDraft.id;
        lastDraftMenuItemIdRef.current = item.id;
        return;
      }

      // Check for existing identical item
      const existingItem = activeOrder?.items.find((i) => {
        if (i.menuItemId !== item.id) return false;
        const hasModifiers =
          i.customizations.modifiers &&
          i.customizations.modifiers.length > 0;
        const hasNotes =
          i.customizations.notes && i.customizations.notes.trim() !== "";
        const hasSent = i.kitchen_status === "sent";
        return !hasModifiers && !hasNotes && !hasSent;
      });

      if (!existingItem) {
        const itemPrice = getPrice(item);
        const cashPrice = getCashPrice(item);
        const draftItem = {
          id: stableDraftId,
          menuItemId: item.id,
          name: item.name,
          quantity: 1,
          originalPrice: cashPrice || itemPrice,
          price: itemPrice,
          unitPrice: currentItem.price,
          cashPrice: cashPrice || itemPrice,
          image: item.image,
          isDraft: true,
          customizations: { modifiers: [], notes: "" },
          availableDiscount: item.availableDiscount,
          appliedDiscount: null,
          paidQuantity: 0,
          addedFromCategoryId: catId || null,
          addedFromMenuId: mId || null,
        };

        addItem(draftItem);
        draftItemIdRef.current = draftItem.id;
        lastDraftMenuItemIdRef.current = item.id;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, currentItem?.id, mode, cartItem]); // Minimal dependencies

  // ============================================================================
  // CLEANUP
  // ============================================================================

  useEffect(() => {
    return () => {
      if (!actionHandledRef.current && draftItemIdRef.current) {
        removeItemFromActiveOrder(draftItemIdRef.current);
        draftItemIdRef.current = null;
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
      const { activeOrderId, ordersById, removeItemFromActiveOrder } =
        useOrderStore.getState();
      const activeOrder = activeOrderId ? ordersById[activeOrderId] : null;
      const draftItems = activeOrder?.items.filter(
        (item) => item.isDraft && item.menuItemId === previousDraftMenuItemId
      );
      if (draftItems && draftItems.length > 0) {
        draftItems.forEach((draftItem) => {
          removeItemFromActiveOrder(draftItem.id);
        });
      }
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
  
  // Keep ref updated (no deps array = runs every render, but is cheap)
  useEffect(() => {
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
  });

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
    [] // Empty deps = never recreates
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
    if (!baseItem) return;

    // Staleness guard: Get safe cash price directly if precomputed data is stale
    const storeState = useModifierSidebarStore.getState();
    // For MenuItemType, use .id; for CartItem, use .menuItemId
    const baseItemId = baseItem.id || ('menuItemId' in (item || {}) ? (item as CartItem)?.menuItemId : undefined);
    let safeCashPrice: number | null = null;

    if (storeState.precomputedForItemId !== baseItemId) {
      console.warn('[handleSave] Stale precomputed data detected, fetching fresh prices');
      // Get fresh cashPrice directly from menu item
      const freshMenuItem = baseItem.id ? useMenuStore.getState().getMenuItemById(baseItem.id) : null;
      safeCashPrice = freshMenuItem?.cashPrice ?? baseItem.cashPrice ?? baseItem.price;
    }

    if (modifiersItem?.modifiers && modifiersItem.modifiers.length > 0) {
      const hasRequiredSelections = modifiersItem.modifiers.every(
        (category) => {
          if (category.type === "required") {
            return Object.values(
              currentState.modifierSelections[category.id] || {}
            ).some(Boolean);
          }
          return true;
        }
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

    if (currentMode === "edit" || (currentMode === "fullscreen" && currentCartItem)) {
      if (!currentCartItem) return;
      const updatedItem = {
        ...currentCartItem,
        quantity: currentState.quantity,
        price: currentTotal / Math.max(1, currentState.quantity),
        customizations: finalCustomizations,
        isDraft: false,
      };

      updateItemInActiveOrder(updatedItem);
      showToast({
        title: "Item Updated",
        message: `Your changes to ${item?.name} have been saved.`,
        type: "success",
      });
    } else {
      const { activeOrderId, ordersById } = useOrderStore.getState();
      const activeOrder = activeOrderId ? ordersById[activeOrderId] : null;

      const coursingState = useCoursingStore.getState();
      const currentCourse =
        coursingState.getForOrder(activeOrderId ?? "")?.workingCourse ?? 1;

      const existingItem = activeOrder?.items.find((i) => {
        if (i.menuItemId !== baseItem.id) return false;

        const existingItemCourse =
          coursingState.getForOrder(activeOrderId ?? "")?.itemCourseMap?.[
          i.id
          ] ?? 1;
        if (existingItemCourse !== currentCourse) return false;

        const itemCustomizations = i.customizations;
        const itemModifiers = itemCustomizations.modifiers || [];
        const currentModifiers = finalCustomizations.modifiers || [];

        if (itemModifiers.length !== currentModifiers.length) return false;

        for (let j = 0; j < itemModifiers.length; j++) {
          const itemMod = itemModifiers[j];
          const currentMod = currentModifiers[j];

          if (itemMod.categoryId !== currentMod.categoryId) return false;
          if (itemMod.options.length !== currentMod.options.length) return false;

          for (let k = 0; k < itemMod.options.length; k++) {
            if (itemMod.options[k].id !== currentMod.options[k].id) return false;
          }
        }

        const itemNotes = (itemCustomizations.notes || "").trim();
        const currentNotes = (finalCustomizations.notes || "").trim();
        if (itemNotes !== currentNotes) return false;

        return true;
      });

      if (existingItem) {
        const draftItems = activeOrder?.items.filter(
          (i) => i.isDraft && i.menuItemId === baseItem.id
        );

        if (draftItems && draftItems.length > 0) {
          draftItems.forEach((draftItem) => {
            removeItemFromActiveOrder(draftItem.id);
          });
        }

        // Use safeCashPrice if precomputed data was stale, otherwise use getCurrentItemCashPrice
        const itemCashPrice = safeCashPrice ?? getCurrentItemCashPrice(baseItem);

        const confirmedItem: Omit<CartItem, 'subtotal' | 'cashSubtotal' | 'taxRate' | 'taxAmount' | 'cashTaxAmount'> = {
          id: generateCartItemId(baseItem.id, finalCustomizations),
          menuItemId: baseItem.id,
          name: baseItem.name,
          quantity: currentState.quantity,
          originalPrice: itemCashPrice,
          unitPrice: baseItem.price ?? itemCashPrice,
          price: currentTotal / Math.max(1, currentState.quantity),
          cashPrice: itemCashPrice,
          image: baseItem.image,
          customizations: finalCustomizations,
          availableDiscount: baseItem.availableDiscount,
          appliedDiscount: null,
          paidQuantity: 0,
          isDraft: false,
          addedFromCategoryId: catId || null,
          addedFromMenuId: mId || null,
        };
        console.log('[confirmedItem] confirmedItem', confirmedItem);
        addItemToActiveOrder(confirmedItem);
        // showToast({
        //   title: "Item Added",
        //   message: `${baseItem.name} has been successfully added to your order.`,
        //   type: "success",
        // });
      } else {
        // Use safeCashPrice if precomputed data was stale, otherwise use getCurrentItemCashPrice
        const itemCashPrice = safeCashPrice ?? getCurrentItemCashPrice(baseItem);

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
        };
        console.log('[newItem] newItem', newItem);
        addItemToActiveOrder(newItem);
        // showToast({
        //   title: "Item Added",
        //   message: `${baseItem.name} has been successfully added to your order.`,
        //   type: "success",
        // });
      }
    }

    closeModal();
  }, []); // Empty deps = never recreates

  // Stable handleCancel - reads from refs
  const handleCancel = useCallback(() => {
    actionHandledRef.current = true;
    const { mode: currentMode, cartItem: cart, currentItem: item, close: closeModal } = latestStateRef.current;
    
    if (
      currentMode !== "edit" &&
      !(currentMode === "fullscreen" && cart) &&
      !cart &&
      item
    ) {
      const { activeOrderId, ordersById } = useOrderStore.getState();
      const activeOrder = activeOrderId ? ordersById[activeOrderId] : null;

      const draftItems = activeOrder?.items.filter(
        (i) => i.isDraft && i.menuItemId === item.id
      );

      if (draftItems && draftItems.length > 0) {
        draftItems.forEach((draftItem) => {
          removeItemFromActiveOrder(draftItem.id);
        });
      }
      lastDraftMenuItemIdRef.current = null;
    }
    closeModal();
  }, []); // Empty deps = never recreates

  // ============================================================================
  // RENDER
  // ============================================================================

  if (cartItem?.kitchen_status === "sent") {
    return (
      <View className="flex-1 bg-[#212121]">
        <View className="flex-row items-center justify-between p-4 border-b border-gray-700 bg-[#212121]">
          <TouchableOpacity onPressIn={close} className="flex-row items-center">
            <ArrowLeft color="#9CA3AF" size={20} />
            <Text className="text-xl font-medium text-white ml-1.5">
              Back to Bill
            </Text>
          </TouchableOpacity>
        </View>
        <View className="flex-1 items-center justify-center p-6 w-full">
          <View className="items-center w-full">
            <Text className="text-2xl font-bold text-white text-center mb-3">
              Item Already Sent
            </Text>
            <Text className="text-lg text-gray-400 text-center mb-4 leading-relaxed">
              This item has been sent to the kitchen and cannot be modified.
            </Text>
            <View className="bg-[#303030] flex flex-col items-center justify-center rounded-xl p-4 w-full border border-gray-600">
              <View className="flex-row items-center justify-center w-full gap-3 mb-3">
                <Image
                  source={require("@/assets/images/classic_burger.png")}
                  className="w-14 h-14 rounded-lg"
                />
                <View className="flex-1">
                  <Text className="text-xl font-semibold text-white">
                    {cartItem.name}
                  </Text>
                  <Text className="text-base text-gray-400">
                    Quantity: {cartItem.quantity}
                  </Text>
                </View>
              </View>
            </View>
            <TouchableOpacity
              onPressIn={close}
              className="mt-6 bg-blue-600 px-6 py-3 rounded-xl"
            >
              <Text className="text-lg font-semibold text-white">
                Back to Bill
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (!isOpen || !currentItem) return null;

  // PERFORMANCE: Show skeleton immediately while content hydrates
  // This ensures <16ms visual response to user tap
  if (!isHydrated) {
    return <ModifierScreenSkeleton />;
  }

  const currentCategory = menuItemForModifiers?.modifiers?.find(
    (cat) => cat.id === state.activeCategory
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-[#212121]"
    >
      <View className="flex-row items-center justify-between p-4 border-b border-gray-700 bg-[#212121]">
        <TouchableOpacity
          onPressIn={handleCancel}
          className="flex-row items-center bg-[#504f4f] p-2 px-4 rounded-xl"
        >
          <ArrowLeft color="#9CA3AF" size={20} />
          <Text className="text-xl font-medium text-white ml-1.5">
            {mode === "edit" || (mode === "fullscreen" && cartItem)
              ? "Back to Bill"
              : "Back to Menu"}
          </Text>
        </TouchableOpacity>
        <View className="flex-row items-center gap-x-3">
          <TouchableOpacity
            onPressIn={handleCancel}
            className="p-2 px-4 rounded-lg bg-red-600"
          >
            <X color="white" size={23} />
          </TouchableOpacity>
          <TouchableOpacity
            onPressIn={handleSave}
            className="p-2 px-4 rounded-lg gap-x-1.5 flex-row items-center justify-center bg-green-500"
          >
            <Text className="text-white text-xl font-semibold">Done</Text>
            <Check color="#FFFFFF" size={20} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="p-4 border-b border-gray-700">
          <View className="flex-row items-center gap-3">
            <Image
              source={require("@/assets/images/classic_burger.png")}
              className="w-20 h-20 rounded-lg"
            />
            <View className="flex-1">
              <Text className="text-2xl font-bold text-white">
                {currentItem.name}
              </Text>
              <Text className="text-lg text-gray-400 mt-0.5">
                {menuItemForModifiers?.description}
              </Text>
              <Text className="text-xl font-semibold text-blue-400 mt-1">
                Base ${getCurrentItemPrice(currentItem).toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        {menuItemForModifiers?.modifiers &&
          menuItemForModifiers.modifiers.length > 0 && (
            <View className="p-4">
              <Text className="text-2xl font-bold text-white mb-3">
                Options
              </Text>
              <View className="flex-row flex-wrap gap-3 mb-4">
                {menuItemForModifiers.modifiers.map((category) => {
                  const hasSelection = Object.values(
                    state.modifierSelections[category.id] || {}
                  ).some(Boolean);
                  const isActive = state.activeCategory === category.id;
                  return (
                    <CategoryTab
                      key={category.id}
                      category={category}
                      isActive={isActive}
                      hasSelection={hasSelection}
                      onPress={() =>
                        dispatch({
                          type: "SET_ACTIVE_CATEGORY",
                          payload: category.id,
                        })
                      }
                    />
                  );
                })}
              </View>

              {currentCategory && (
                <View className="mb-4">
                  <View className="flex-row items-center justify-between mb-3">
                    <Text className="text-xl font-semibold text-white">
                      {currentCategory.name}
                    </Text>
                    <View className="flex-row items-center gap-2">
                      <Text className="text-lg text-red-400">
                        {currentCategory.type === "required"
                          ? "Required"
                          : "Optional"}
                      </Text>
                      <Text className="text-lg text-gray-400">
                        {currentCategory.selectionType}
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

        <View className="p-4 border-y border-gray-700">
          <Text className="text-xl font-semibold text-white mb-3">
            Quantity
          </Text>
          <View className="flex-row items-center justify-center">
            <TouchableOpacity
              disabled={isReadOnly}
              onPressIn={() =>
                dispatch({
                  type: "SET_QUANTITY",
                  payload: Math.max(1, state.quantity - 1),
                })
              }
              className="p-3 border border-gray-600 rounded-full bg-[#303030]"
            >
              <Minus color="#9CA3AF" size={20} />
            </TouchableOpacity>
            <TouchableOpacity
              disabled={isReadOnly}
              onPressIn={handleQuantityPress}
              className="mx-12 w-14"
            >
              <Text className="text-3xl border rounded-lg p-1 border-gray-600 font-bold text-white text-center">
                {state.quantity}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={isReadOnly}
              onPressIn={() =>
                dispatch({ type: "SET_QUANTITY", payload: state.quantity + 1 })
              }
              className="p-3 bg-blue-500 rounded-full"
            >
              <Plus color="#FFFFFF" size={20} />
            </TouchableOpacity>
          </View>
        </View>

        <View className="p-4 border-b border-gray-700">
          <Text className="text-xl font-semibold text-white mb-3">Notes</Text>
          <TextInput
            editable={!isReadOnly}
            value={state.notes}
            onChangeText={(text) =>
              dispatch({ type: "SET_NOTES", payload: text })
            }
            placeholder="No onions..."
            multiline
            maxLength={80}
            className="px-4 py-3 border border-gray-600 rounded-lg bg-[#303030] min-h-[80px] text-xl text-white"
            placeholderTextColor={"#6B7280"}
          />
          <Text className="text-base text-gray-400 mt-1.5 text-right">
            {state.notes.length}/80
          </Text>
        </View>

        {menuItemForModifiers?.allergens &&
          menuItemForModifiers.allergens.length > 0 && (
            <View className="p-4 border-b border-gray-700">
              <Text className="text-xl font-semibold text-white mb-3">
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
          <View className="flex-row justify-between items-center bg-[#303030] p-4 rounded-lg">
            <Text className="text-2xl font-semibold text-white">Total</Text>
            <Text className="text-3xl font-bold text-white">
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
          <View className="bg-[#303030] rounded-xl p-4 w-72 border border-gray-600">
            <Text className="text-xl font-semibold text-white mb-3 text-center">
              Enter Quantity
            </Text>
            <TextInput
              value={state.quantityInput}
              onChangeText={(text) =>
                dispatch({ type: "SET_QUANTITY_INPUT", payload: text })
              }
              keyboardType="numeric"
              autoFocus
              className="p-3 border border-gray-600 rounded-lg bg-[#212121] text-xl text-white text-center mb-4 h-16"
            />
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPressIn={handleQuantityCancel}
                className="flex-1 py-3 px-4 bg-gray-600 rounded-lg"
              >
                <Text className="text-lg font-semibold text-white text-center">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPressIn={handleQuantitySubmit}
                className="flex-1 py-3 px-4 bg-blue-500 rounded-lg"
              >
                <Text className="text-lg font-semibold text-white text-center">
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

export default ModifierScreen;
