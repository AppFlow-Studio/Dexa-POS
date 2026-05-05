import { useToast } from "@/contexts/ToastContext";
import { colors } from "@/lib/theme";
import { CartItem, ModifierCategory } from "@/lib/types";
import { OrderService } from "@/services/orderService";
import { useMenuStore } from "@/stores/useMenuStore";
import {
    getLastModifierOpenStartedAt,
    useModifierSidebarStore,
} from "@/stores/useModifierSidebarStore";
import {
    getOrderStoreSupabaseClient,
    useOrderStore,
} from "@/stores/useOrderStore";
import { useSeatingStore } from "@/stores/useSeatingStore";

import OptimizedListImage from "@/components/ui/OptimizedListImage";
import { resolveMenuItemImageSource } from "@/lib/menuItemImageSource";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { ArrowLeft, Check, Minus, Plus, X } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    InteractionManager,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useImmerReducer } from "use-immer";
import { useShallow } from "zustand/react/shallow";

interface ModifierSelection {
  [categoryId: string]: {
    [optionId: string]: boolean | "no";
  };
}

interface CustomModifier {
  id: string;
  name: string;
  price: number;
}

const CUSTOM_MODIFIER_CATEGORY_ID = "custom-modifiers";
const CUSTOM_MODIFIER_CATEGORY_NAME = "Custom";

const generateCustomModifierId = () =>
  `custom_mod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const MODIFIER_PRICE_DELTA_COLOR = "#15803D";

const nowMs = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

// ============================================================================
// MEMOIZED SUB-COMPONENTS
// ============================================================================

/**
 * Pill-shaped category tab — matches the new design's horizontal tab strip.
 * Active tab gets teal background + border; tabs with a selection get a teal
 * dot indicator; unselected tabs are muted/outlined.
 */
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
      className="flex-row items-center gap-x-1 px-3 py-1.5 rounded-full border"
      style={
        isActive
          ? { backgroundColor: colors.teal, borderColor: colors.teal }
          : hasSelection
            ? { backgroundColor: colors.teal + "22", borderColor: colors.teal }
            : { backgroundColor: "transparent", borderColor: colors.border }
      }
    >
      <Text
        className="text-xs font-semibold"
        style={{
          color: isActive
            ? colors.onSolid
            : hasSelection
              ? colors.teal
              : colors.label,
        }}
      >
        {category.name}
      </Text>
      {hasSelection && (
        <View
          className="w-4 h-4 rounded-full items-center justify-center"
          style={{
            backgroundColor: isActive ? "rgba(255,255,255,0.25)" : colors.teal,
          }}
        >
          <Check
            color={isActive ? colors.onSolid : colors.onSolid}
            size={9}
            strokeWidth={3}
          />
        </View>
      )}
    </TouchableOpacity>
  ),
);

/**
 * Modifier option card — clean rectangular card in a responsive grid.
 * Selected state uses a teal tint + teal border + top-right checkmark badge.
 */
const ModifierOption = memo(
  ({
    option,
    categoryId,
    isSelected,
    isNo,
    isUnavailable,
    isReadOnly,
    onToggle,
    onLongPress,
  }: {
    option: any;
    categoryId: string;
    isSelected: boolean;
    isNo: boolean;
    isUnavailable: boolean;
    isReadOnly: boolean;
    onToggle: (categoryId: string, optionId: string) => void;
    onLongPress: (categoryId: string, optionId: string) => void;
  }) => (
    <TouchableOpacity
      disabled={isReadOnly || isUnavailable}
      onPressIn={() => onToggle(categoryId, option.id)}
      onLongPress={() => onLongPress(categoryId, option.id)}
      delayLongPress={400}
      className="rounded-lg border py-2 px-2 items-center justify-center"
      style={[
        {
          flexBasis: "18%",
          flexGrow: 0,
          flexShrink: 0,
          minHeight: 52,
        },
        isNo
          ? {
              backgroundColor: colors.danger + "20",
              borderColor: colors.danger,
            }
          : isSelected
            ? { backgroundColor: colors.teal + "20", borderColor: colors.teal }
            : isUnavailable
              ? {
                  backgroundColor: colors.panel,
                  borderColor: colors.border,
                  opacity: 0.45,
                }
              : { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      {isNo && (
        <View
          className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full items-center justify-center"
          style={{ backgroundColor: colors.danger }}
        >
          <X color={colors.onSolid} size={9} strokeWidth={3} />
        </View>
      )}
      {isSelected && !isNo && (
        <View
          className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full items-center justify-center"
          style={{ backgroundColor: colors.teal }}
        >
          <Check color={colors.onSolid} size={9} strokeWidth={3} />
        </View>
      )}
      <Text
        className={`text-xs font-semibold text-center ${
          isUnavailable ? "line-through" : ""
        } ${isNo ? "line-through" : ""}`}
        style={{
          color: isUnavailable
            ? colors.muted
            : isNo
              ? colors.danger
              : isSelected
                ? colors.teal
                : colors.heading,
        }}
      >
        {isNo ? `NO ${option.name}` : option.name}
        {isUnavailable && " (86'd)"}
      </Text>
      {!isNo && option.price > 0 && (
        <Text
          className="text-base text-center mt-0.5"
          style={{ color: MODIFIER_PRICE_DELTA_COLOR }}
        >
          +${option.price.toFixed(2)}
        </Text>
      )}
    </TouchableOpacity>
  ),
);

/**
 * Isolated Notes Input to prevent the main ModifierScreen from re-rendering
 * on every keystroke. It syncs with the main state on blur or after a delay.
 */
const NotesInput = memo(
  ({
    initialValue,
    isReadOnly,
    onChange,
  }: {
    initialValue: string;
    isReadOnly: boolean;
    onChange: (text: string) => void;
  }) => {
    const [localValue, setLocalValue] = useState(initialValue);
    const latestValueRef = useRef(initialValue);

    // Sync if initialValue changes from outside
    useEffect(() => {
      setLocalValue(initialValue);
      latestValueRef.current = initialValue;
    }, [initialValue]);

    useEffect(() => {
      const timeoutId = setTimeout(() => {
        onChange(latestValueRef.current);
      }, 220);
      return () => clearTimeout(timeoutId);
    }, [localValue, onChange]);

    return (
      <View>
        <View className="flex-row items-center justify-between pt-3 mb-2">
          <Text
            className="text-sm font-semibold"
            style={{ color: colors.heading }}
          >
            Special Instructions
          </Text>
          <Text className="text-xs" style={{ color: colors.label }}>
            {localValue.length}/80
          </Text>
        </View>
        <View
          className="rounded-lg overflow-hidden border"
          style={{
            borderColor: colors.border,
            backgroundColor: colors.inset,
          }}
        >
          <TextInput
            editable={!isReadOnly}
            value={localValue}
            onChangeText={(text) => {
              latestValueRef.current = text;
              setLocalValue(text);
            }}
            onBlur={() => onChange(latestValueRef.current)}
            placeholder="No onions, extra sauce..."
            numberOfLines={1}
            maxLength={80}
            className="px-3 py-2 text-sm min-h-[52px]"
            style={{ color: colors.heading }}
            placeholderTextColor={colors.muted}
          />
        </View>
      </View>
    );
  },
);

// ============================================================================
// REDUCER
// ============================================================================

type State = {
  quantity: number;
  modifierSelections: ModifierSelection;
  selectionCounts: Record<string, number>;
  notes: string;
  activeCategory: string | null;
  isQuantityModalOpen: boolean;
  quantityInput: string;
  isSeatPickerOpen: boolean;
  customModifiers: CustomModifier[];
  isCustomModifierModalOpen: boolean;
  customModifierNameInput: string;
  customModifierPriceInput: string;
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
  | { type: "TOGGLE_SEAT_PICKER" }
  | {
      type: "TOGGLE_MODIFIER";
      payload: {
        categoryId: string;
        optionId: string;
        category: ModifierCategory;
      };
    }
  | {
      type: "TOGGLE_NO_MODIFIER";
      payload: {
        categoryId: string;
        optionId: string;
        category: ModifierCategory;
      };
    }
  | { type: "OPEN_CUSTOM_MODIFIER_MODAL" }
  | { type: "CLOSE_CUSTOM_MODIFIER_MODAL" }
  | { type: "SET_CUSTOM_MODIFIER_NAME"; payload: string }
  | { type: "SET_CUSTOM_MODIFIER_PRICE"; payload: string }
  | {
      type: "ADD_CUSTOM_MODIFIER";
      payload: { name: string; price: number };
    }
  | { type: "REMOVE_CUSTOM_MODIFIER"; payload: string };

const computeSelectionCounts = (
  selections: ModifierSelection,
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const catId in selections) {
    let count = 0;
    const catSelections = selections[catId];
    for (const key in catSelections) {
      if (catSelections[key] === true || catSelections[key] === "no") count++;
    }
    counts[catId] = count;
  }
  return counts;
};

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
        state.selectionCounts = computeSelectionCounts(
          action.payload.modifierSelections,
        );
      }
      return;
    case "TOGGLE_SEAT_PICKER":
      state.isSeatPickerOpen = !state.isSeatPickerOpen;
      return;
    case "TOGGLE_MODIFIER": {
      const { categoryId, optionId, category } = action.payload;
      if (!state.modifierSelections[categoryId]) {
        state.modifierSelections[categoryId] = {};
      }
      const currentCount = state.selectionCounts[categoryId] ?? 0;
      const currentVal = state.modifierSelections[categoryId][optionId];
      // Tapping a "NO" modifier deselects it entirely
      if (currentVal === "no") {
        state.modifierSelections[categoryId][optionId] = false;
        state.selectionCounts[categoryId] = currentCount - 1;
        return;
      }
      if (category.selectionType === "single") {
        const wasSelected = !!currentVal;
        Object.keys(state.modifierSelections[categoryId]).forEach((key) => {
          state.modifierSelections[categoryId][key] = false;
        });
        state.modifierSelections[categoryId][optionId] = !wasSelected;
        state.selectionCounts[categoryId] = wasSelected ? 0 : 1;
      } else {
        const isCurrentlySelected = currentVal;
        if (
          !isCurrentlySelected &&
          category.maxSelections &&
          currentCount >= category.maxSelections
        ) {
          return;
        }
        state.modifierSelections[categoryId][optionId] = !isCurrentlySelected;
        state.selectionCounts[categoryId] = isCurrentlySelected
          ? currentCount - 1
          : currentCount + 1;
      }
      return;
    }
    case "TOGGLE_NO_MODIFIER": {
      const { categoryId, optionId, category } = action.payload;
      if (!state.modifierSelections[categoryId]) {
        state.modifierSelections[categoryId] = {};
      }
      const currentCount = state.selectionCounts[categoryId] ?? 0;
      const currentVal = state.modifierSelections[categoryId][optionId];
      if (currentVal === "no") {
        // Already NO → deselect
        state.modifierSelections[categoryId][optionId] = false;
        state.selectionCounts[categoryId] = currentCount - 1;
      } else {
        // Unselected or true → set to NO
        if (category.selectionType === "single") {
          // Clear other selections first
          Object.keys(state.modifierSelections[categoryId]).forEach((key) => {
            state.modifierSelections[categoryId][key] = false;
          });
          state.modifierSelections[categoryId][optionId] = "no";
          state.selectionCounts[categoryId] = 1;
        } else {
          const wasSelected = currentVal === true;
          if (
            !wasSelected &&
            category.maxSelections &&
            currentCount >= category.maxSelections
          ) {
            return;
          }
          state.modifierSelections[categoryId][optionId] = "no";
          state.selectionCounts[categoryId] = wasSelected
            ? currentCount
            : currentCount + 1;
        }
      }
      return;
    }
    case "OPEN_CUSTOM_MODIFIER_MODAL":
      state.isCustomModifierModalOpen = true;
      state.customModifierNameInput = "";
      state.customModifierPriceInput = "";
      return;
    case "CLOSE_CUSTOM_MODIFIER_MODAL":
      state.isCustomModifierModalOpen = false;
      state.customModifierNameInput = "";
      state.customModifierPriceInput = "";
      return;
    case "SET_CUSTOM_MODIFIER_NAME":
      state.customModifierNameInput = action.payload;
      return;
    case "SET_CUSTOM_MODIFIER_PRICE":
      state.customModifierPriceInput = action.payload;
      return;
    case "ADD_CUSTOM_MODIFIER":
      state.customModifiers.push({
        id: generateCustomModifierId(),
        name: action.payload.name,
        price: action.payload.price,
      });
      return;
    case "REMOVE_CUSTOM_MODIFIER":
      state.customModifiers = state.customModifiers.filter(
        (m) => m.id !== action.payload,
      );
      return;
  }
};

const extractCustomModifiers = (
  cartItem: CartItem | null | undefined,
): CustomModifier[] => {
  // Match either the canonical sentinel (locally-saved item) or the fallback
  // shape produced by orderTransformers.ts when realtime broadcasts arrive
  // with NULL modifier_group_id / modifier_item_id — there the categoryId
  // collapses to the group name ("Custom").
  const group = cartItem?.customizations?.modifiers?.find(
    (m) =>
      m.categoryId === CUSTOM_MODIFIER_CATEGORY_ID ||
      m.categoryName === CUSTOM_MODIFIER_CATEGORY_NAME,
  );
  if (!group) return [];
  return group.options.map((opt) => ({
    id: opt.id,
    name: opt.name,
    price: opt.price ?? 0,
  }));
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface ModifierScreenContentProps {
  keepMountedDuringClose?: boolean;
}

const ModifierScreenContent = ({
  keepMountedDuringClose = false,
}: ModifierScreenContentProps) => {
  const store = useModifierSidebarStore(
    useShallow((s) => ({
      isOpen: s.isOpen,
      mode: s.mode,
      menuItem: s.menuItem,
      cartItem: s.cartItem,
      categoryId: s.categoryId,
      menuId: s.menuId,
      precomputedForItemId: s.precomputedForItemId,
      precomputedModifiers: s.precomputedModifiers,
      precomputedCategoriesById: s.precomputedCategoriesById,
      precomputedOptionsById: s.precomputedOptionsById,
      storeInitialSelections: s.initialSelections,
      precomputedItemPrice: s.itemPrice,
      precomputedCashPrice: s.itemCashPrice,
      precomputedActiveCategory: s.activeModifierCategory,
      close: s.close,
      seatOverride: s.seatOverride,
      setSeatOverride: s.setSeatOverride,
      seatCount: s.seatCount,
      showSeatPicker: s.showSeatPicker,
    })),
  );

  const {
    isOpen,
    mode,
    menuItem,
    cartItem,
    categoryId,
    menuId,
    precomputedForItemId,
    precomputedModifiers,
    precomputedCategoriesById,
    precomputedOptionsById,
    storeInitialSelections,
    precomputedItemPrice,
    precomputedCashPrice,
    precomputedActiveCategory,
    close,
    seatOverride,
    setSeatOverride,
    seatCount,
    showSeatPicker,
  } = store;
  const shouldPaintScreen = isOpen || keepMountedDuringClose;

  const showMenuImages = useSettingsStore((s) => s.showMenuImages);

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

  const { show } = useToast();

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
        // Auto-open seat picker for dine-in (table) orders so the server can
        // tap a seat without first expanding the header pill.
        isSeatPickerOpen: showSeatPicker,
        customModifiers: extractCustomModifiers(cartItem),
        isCustomModifierModalOpen: false,
        customModifierNameInput: "",
        customModifierPriceInput: "",
      };
    },
  );

  const lastDraftMenuItemIdRef = useRef<string | null>(null);
  const actionHandledRef = useRef(false);
  const draftItemIdRef = useRef<string | null>(null);
  const [visibleOptionCount, setVisibleOptionCount] = useState(8);
  const [showSecondarySections, setShowSecondarySections] = useState(false);
  const [hasInteractedSinceOpen, setHasInteractedSinceOpen] = useState(false);
  const deferSecondarySectionsAggressively = Platform.OS === "android";

  // When the store opens a new item session (different item or cart entry),
  // reinitialize local reducer state without unmounting the component.
  const sessionId = isOpen
    ? `${precomputedForItemId ?? ""}_${cartItem?.id ?? ""}_${mode}`
    : null;
  const prevSessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      prevSessionRef.current = null;
      return;
    }
    if (sessionId === prevSessionRef.current) return;
    prevSessionRef.current = sessionId;
    if (__DEV__) {
      const openStartedAt = getLastModifierOpenStartedAt();
      if (openStartedAt > 0) {
        console.log(
          `[perf][modifier] session ready in ${Math.round(
            nowMs() - openStartedAt,
          )}ms`,
          { sessionId },
        );
      }
    }
    actionHandledRef.current = false;
    draftItemIdRef.current = null;
    lastDraftMenuItemIdRef.current = null;
    const selections = storeInitialSelections ?? {};
    dispatch({
      type: "INITIALIZE",
      payload: {
        quantity: cartItem?.quantity ?? 1,
        notes: cartItem?.customizations?.notes ?? "",
        modifierSelections: selections,
        activeCategory: precomputedActiveCategory ?? null,
        isQuantityModalOpen: false,
        quantityInput: "",
        // Auto-open seat picker for dine-in (table) orders so the server can
        // tap a seat without first expanding the header pill.
        isSeatPickerOpen: showSeatPicker,
        customModifiers: extractCustomModifiers(cartItem),
        isCustomModifierModalOpen: false,
        customModifierNameInput: "",
        customModifierPriceInput: "",
      },
    });

    // Render the first batch immediately. React 19 auto-batches these
    // sync setStates with the dispatch above into a single render.
    // showModifierOptions stays `true` across session changes so the new
    // item's options paint on the first frame instead of after a defer.
    setVisibleOptionCount(8);
    setHasInteractedSinceOpen(false);
    setShowSecondarySections(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (!isOpen || showSecondarySections) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let revealHandle: { cancel: () => void } | null = null;

    const scheduleReveal = () => {
      revealHandle = InteractionManager.runAfterInteractions(() => {
        if (cancelled) return;
        setShowSecondarySections(true);
      });
    };

    if (!deferSecondarySectionsAggressively || hasInteractedSinceOpen) {
      scheduleReveal();
    } else {
      // Brief Android-only defer so image/allergens don't compete with the
      // open animation. Was 900ms; lowered now that preWarm + faster slide
      // cover the cost. Keep the "show on first interaction" path above.
      timeoutId = setTimeout(scheduleReveal, 80);
    }

    return () => {
      cancelled = true;
      revealHandle?.cancel();
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [
    deferSecondarySectionsAggressively,
    hasInteractedSinceOpen,
    isOpen,
    showSecondarySections,
  ]);

  const isReadOnly = mode === "view";
  const currentItem =
    mode === "edit" || (mode === "fullscreen" && cartItem)
      ? cartItem
      : menuItem;

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
      const itemId = item.id || item.menuItemId;
      if (precomputedCashPrice > 0 && precomputedForItemId === itemId)
        return precomputedCashPrice;
      if (item.cashPrice !== undefined && item.cashPrice !== null)
        return item.cashPrice;
      if (item.originalPrice !== undefined && item.originalPrice !== null)
        return item.originalPrice;
      if (item.menuItemId && getMenuItemById) {
        const baseItem = getMenuItemById(item.menuItemId);
        if (baseItem?.cashPrice !== undefined && baseItem.cashPrice !== null)
          return baseItem.cashPrice;
      }
      return item.price || 0;
    },
    [getMenuItemById, precomputedCashPrice, precomputedForItemId],
  );

  const baseMenuItem = useMemo(
    () => menuItem || (cartItem ? getMenuItemById(cartItem.menuItemId) : null),
    [menuItem, cartItem, getMenuItemById],
  );

  const resolvedImageSource = useMemo(
    () =>
      showMenuImages && shouldPaintScreen
        ? resolveMenuItemImageSource(currentItem?.image)
        : undefined,
    [showMenuImages, shouldPaintScreen, currentItem?.image],
  );

  type MenuItemWithModifiers = typeof baseMenuItem & {
    modifiers: ModifierCategory[];
  };
  const menuItemForModifiersRef = useRef<{
    item: any;
    mods: any;
    result: MenuItemWithModifiers;
  } | null>(null);

  const menuItemForModifiers = useMemo((): MenuItemWithModifiers | null => {
    if (!shouldPaintScreen) return null;
    if (!baseMenuItem) return null;
    if (precomputedModifiers) {
      const cached = menuItemForModifiersRef.current;
      if (
        cached &&
        cached.item === baseMenuItem &&
        cached.mods === precomputedModifiers
      )
        return cached.result;
      const result = {
        ...baseMenuItem,
        modifiers: precomputedModifiers,
      } as MenuItemWithModifiers;
      menuItemForModifiersRef.current = {
        item: baseMenuItem,
        mods: precomputedModifiers,
        result,
      };
      return result;
    }
    if (!baseMenuItem.modifierGroupIds) return null;
    const modifiers = useMenuStore
      .getState()
      .getModifierGroupsByIds(baseMenuItem.modifierGroupIds);
    return { ...baseMenuItem, modifiers } as MenuItemWithModifiers;
  }, [shouldPaintScreen, baseMenuItem, precomputedModifiers]);

  const { modifierCategoriesById, optionsById } = useMemo(() => {
    const emptyCategories = new Map<string, ModifierCategory>();
    const emptyOptions = new Map<
      string,
      { option: any; categoryId: string; categoryName: string }
    >();
    if (!shouldPaintScreen)
      return {
        modifierCategoriesById: emptyCategories,
        optionsById: emptyOptions,
      };
    if (precomputedCategoriesById && precomputedOptionsById) {
      return {
        modifierCategoriesById: precomputedCategoriesById,
        optionsById: precomputedOptionsById,
      };
    }
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
    return {
      modifierCategoriesById: emptyCategories,
      optionsById: emptyOptions,
    };
  }, [
    shouldPaintScreen,
    precomputedCategoriesById,
    precomputedOptionsById,
    menuItemForModifiers?.modifiers,
  ]);

  const total = useMemo(() => {
    if (!shouldPaintScreen || !currentItem) return 0;
    let baseTotal = getCurrentItemPrice(currentItem);
    Object.values(state.modifierSelections).forEach((categorySelections) => {
      Object.entries(categorySelections).forEach(([optionId, isSelected]) => {
        if (isSelected && isSelected !== "no") {
          const optionData = optionsById.get(optionId);
          if (optionData) baseTotal += optionData.option.price;
        }
      });
    });
    for (const m of state.customModifiers) {
      baseTotal += m.price;
    }
    return baseTotal * state.quantity;
  }, [
    shouldPaintScreen,
    state.quantity,
    state.modifierSelections,
    state.customModifiers,
    currentItem,
    optionsById,
    getCurrentItemPrice,
  ]);

  useEffect(() => {
    if (!isOpen || !currentItem || mode === "edit" || cartItem) return;
    const stableDraftId = `draft_${currentItem.id}`;
    const storeDraftId = useModifierSidebarStore.getState().draftCreatedId;
    if (storeDraftId) {
      draftItemIdRef.current = storeDraftId;
      lastDraftMenuItemIdRef.current = currentItem.id;
      return;
    }
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
    const existingItem = activeOrder?.items.find((i) => {
      if (i.menuItemId !== currentItem.id) return false;
      const hasModifiers =
        i.customizations.modifiers && i.customizations.modifiers.length > 0;
      const hasNotes =
        i.customizations.notes && i.customizations.notes.trim() !== "";
      const hasSent = i.kitchen_status === "sent";
      return !hasModifiers && !hasNotes && !hasSent;
    });
    if (existingItem) return;

    // Defer the draft cart-write past the rapid-DONE window. If the user
    // confirms or cancels within ~220ms, the timer is cleared and we never
    // pay for a placeholder cart write that would just trigger re-renders.
    // Mirrors the store-side deferral in useModifierSidebarStore.open().
    const expectedItemId = currentItem.id;
    const timer = setTimeout(() => {
      const store = useModifierSidebarStore.getState();
      if (
        !store.isOpen ||
        store.cartItem ||
        store.menuItem?.id !== expectedItemId
      ) {
        return;
      }
      // Re-fetch latest active-order snapshot — another flow may have added
      // an identical unsent item while we were waiting.
      const latest = useOrderStore.getState();
      const latestOrder = latest.activeOrderId
        ? latest.ordersById[latest.activeOrderId]
        : null;
      const dupe = latestOrder?.items.find(
        (i) => i.id === stableDraftId || i.menuItemId === expectedItemId,
      );
      if (dupe) {
        if (dupe.isDraft) draftItemIdRef.current = dupe.id;
        return;
      }
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
        seatNumber: seatOverride ?? undefined,
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
    }, 220);

    return () => clearTimeout(timer);
  }, [isOpen, currentItem?.id, mode, cartItem, seatOverride]);

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
        : `${store.cartItem?.id ?? ""}_${store.menuItem?.id ?? ""}_${
            store.mode
          }`;
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
    showSeatPicker,
    seatOverride,
  });

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
    showSeatPicker,
    seatOverride,
  };

  const handleModifierToggle = useCallback(
    (catId: string, optionId: string) => {
      const { isReadOnly, modifierCategoriesById } = latestStateRef.current;
      if (isReadOnly) return;
      const category = modifierCategoriesById.get(catId);
      if (!category) return;
      dispatch({
        type: "TOGGLE_MODIFIER",
        payload: { categoryId: catId, optionId, category },
      });
    },
    [],
  );

  const handleNoModifierToggle = useCallback(
    (catId: string, optionId: string) => {
      const { isReadOnly, modifierCategoriesById } = latestStateRef.current;
      if (isReadOnly) return;
      const category = modifierCategoriesById.get(catId);
      if (!category) return;
      dispatch({
        type: "TOGGLE_NO_MODIFIER",
        payload: { categoryId: catId, optionId, category },
      });
    },
    [],
  );

  const handleQuantityPress = useCallback(() => {
    const { isReadOnly, state } = latestStateRef.current;
    if (isReadOnly) return;
    dispatch({
      type: "OPEN_QUANTITY_MODAL",
      payload: state.quantity.toString(),
    });
  }, []);

  const handleQuantitySubmit = useCallback(() => {
    const { state } = latestStateRef.current;
    const newQuantity = parseInt(state.quantityInput, 10);
    if (newQuantity && newQuantity > 0)
      dispatch({ type: "SET_QUANTITY", payload: newQuantity });
    dispatch({ type: "CLOSE_QUANTITY_MODAL" });
  }, []);

  const handleQuantityCancel = useCallback(() => {
    dispatch({ type: "CLOSE_QUANTITY_MODAL" });
  }, []);

  const handleCategoryTabPress = useCallback((categoryId: string) => {
    dispatch({ type: "SET_ACTIVE_CATEGORY", payload: categoryId });
  }, []);

  const handleNotesChange = useCallback((text: string) => {
    dispatch({ type: "SET_NOTES", payload: text });
  }, []);

  const handleQuantityDecrement = useCallback(() => {
    const { state: currentState } = latestStateRef.current;
    dispatch({
      type: "SET_QUANTITY",
      payload: Math.max(1, currentState.quantity - 1),
    });
  }, []);

  const handleQuantityIncrement = useCallback(() => {
    const { state: currentState } = latestStateRef.current;
    dispatch({ type: "SET_QUANTITY", payload: currentState.quantity + 1 });
  }, []);

  const handleInitialInteraction = useCallback(() => {
    setHasInteractedSinceOpen((prev) => (prev ? prev : true));
  }, []);

  const handleOpenCustomModifierModal = useCallback(() => {
    const { isReadOnly } = latestStateRef.current;
    if (isReadOnly) return;
    dispatch({ type: "OPEN_CUSTOM_MODIFIER_MODAL" });
  }, []);

  const handleCloseCustomModifierModal = useCallback(() => {
    dispatch({ type: "CLOSE_CUSTOM_MODIFIER_MODAL" });
  }, []);

  const handleConfirmCustomModifier = useCallback(() => {
    const { state: currentState } = latestStateRef.current;
    const name = currentState.customModifierNameInput.trim();
    if (!name) return;
    const parsed = parseFloat(currentState.customModifierPriceInput);
    const price =
      Number.isFinite(parsed) && parsed > 0
        ? Math.round(parsed * 100) / 100
        : 0;
    dispatch({ type: "ADD_CUSTOM_MODIFIER", payload: { name, price } });
    dispatch({ type: "CLOSE_CUSTOM_MODIFIER_MODAL" });
  }, []);

  const handleRemoveCustomModifier = useCallback((id: string) => {
    const { isReadOnly } = latestStateRef.current;
    if (isReadOnly) return;
    dispatch({ type: "REMOVE_CUSTOM_MODIFIER", payload: id });
  }, []);

  const handleSave = useCallback(() => {
    actionHandledRef.current = true;
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
      showSeatPicker: shouldApplySeat,
      seatOverride: seatVal,
    } = latestStateRef.current;

    const baseItem = currentMenuItem || modifiersItem;
    const isOpenItem =
      currentCartItem?.is_open_item === true ||
      currentCartItem?.menuItemId?.startsWith("open_item_") ||
      currentCartItem?.customizations?.notes === "Open Item";

    if (!baseItem && !isOpenItem) return;

    if (
      isOpenItem &&
      (currentMode === "edit" || currentMode === "fullscreen") &&
      currentCartItem
    ) {
      const updatedOpenItem = {
        ...currentCartItem,
        quantity: currentState.quantity,
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

      // Apply seat override for open items
      if (shouldApplySeat && currentCartItem) {
        const ordId = useOrderStore.getState().activeOrderId;
        if (ordId) {
          useSeatingStore
            .getState()
            .setItemSeat(
              ordId,
              currentCartItem.id,
              seatVal,
              currentCartItem.db_order_item_id,
              true,
            );
        }
      }

      // Sync open item changes to backend
      if (currentCartItem.db_order_item_id) {
        const client = getOrderStoreSupabaseClient();
        if (client) {
          const params: Record<string, any> = {
            p_order_item_id: currentCartItem.db_order_item_id,
          };
          if (currentState.quantity !== currentCartItem.quantity) {
            params.p_quantity = currentState.quantity;
          }
          if (
            currentState.notes &&
            currentState.notes !== currentCartItem.customizations?.notes
          ) {
            params.p_special_instructions = currentState.notes;
          }
          if (shouldApplySeat && seatVal !== undefined) {
            params.p_seat_number = seatVal;
          }
          if (Object.keys(params).length > 1) {
            OrderService.updateOpenItem(client, params as any).catch((err) => {
              console.error(
                "[ModifierScreen] Failed to sync open item update:",
                err,
              );
            });
          }
        }
      }

      showToast({
        title: "Item Updated",
        message: `${currentCartItem.name} quantity updated to ${currentState.quantity}.`,
        type: "success",
      });
      closeModal();
      return;
    }

    if (!baseItem) return;
    const storeState = useModifierSidebarStore.getState();
    const baseItemId =
      baseItem.id ||
      ("menuItemId" in (item || {})
        ? (item as CartItem)?.menuItemId
        : undefined);
    let safeCashPrice: number | null = null;

    if (storeState.precomputedForItemId !== baseItemId) {
      const freshMenuItem = baseItem.id
        ? useMenuStore.getState().getMenuItemById(baseItem.id)
        : null;
      safeCashPrice =
        freshMenuItem?.cashPrice ?? baseItem.cashPrice ?? baseItem.price;
    }

    if (modifiersItem?.modifiers && modifiersItem.modifiers.length > 0) {
      const hasRequiredSelections = modifiersItem.modifiers.every(
        (category) => {
          if (category.type === "required")
            return (currentState.selectionCounts[category.id] ?? 0) > 0;
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

    const resolvedCashPrice =
      safeCashPrice ?? getCurrentItemCashPrice(baseItem);

    // Build the cart item synchronously and apply it BEFORE closing. Doing
    // the cart mutation first lets React commit the items update on the
    // still-mounted modifier screen, so the close slide animation runs on a
    // settled JS thread instead of competing with the addItem re-render.
    const selectedModifiers = modifiersItem?.modifiers
      ? Object.entries(currentState.modifierSelections)
          .map(([cId, selections]) => {
            const category = categoriesMap.get(cId);
            const selectedOptions = Object.entries(selections)
              .filter(([_, val]) => val === true || val === "no")
              .map(([optionId, val]) => {
                const optionData = optsMap.get(optionId);
                return {
                  id: optionId,
                  name: optionData?.option.name || "",
                  price: val === "no" ? 0 : optionData?.option.price || 0,
                  isNo: val === "no" ? true : undefined,
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

    if (currentState.customModifiers.length > 0) {
      selectedModifiers.push({
        categoryId: CUSTOM_MODIFIER_CATEGORY_ID,
        categoryName: CUSTOM_MODIFIER_CATEGORY_NAME,
        options: currentState.customModifiers.map((m) => ({
          id: m.id,
          name: m.name,
          price: m.price,
          isNo: undefined,
        })),
      });
    }

    const finalCustomizations = {
      modifiers: selectedModifiers,
      notes: currentState.notes,
    };

    if (
      currentMode === "edit" ||
      (currentMode === "fullscreen" && currentCartItem)
    ) {
      if (!currentCartItem) {
        closeModal();
        return;
      }
      const updatedItem = {
        ...currentCartItem,
        quantity: currentState.quantity,
        price: currentTotal / Math.max(1, currentState.quantity),
        customizations: finalCustomizations,
        isDraft: false,
        seatNumber:
          shouldApplySeat && seatVal !== undefined
            ? seatVal
            : currentCartItem.seatNumber,
        subtotal: undefined,
        cashSubtotal: undefined,
        taxAmount: undefined,
        cashTaxAmount: undefined,
      };
      updateItemInActiveOrder(updatedItem);

      // Ensure manual sync matches the updated seat
      if (shouldApplySeat) {
        const ordId = useOrderStore.getState().activeOrderId;
        if (ordId) {
          useSeatingStore
            .getState()
            .setItemSeat(
              ordId,
              currentCartItem.id,
              seatVal,
              currentCartItem.db_order_item_id,
              true,
            );

          // Sync back to global active seat so subsequent items pick it up
          useSeatingStore.getState().setActiveSeat(ordId, seatVal);
        }
      }
      showToast({
        title: "Item Updated",
        message: `Your changes to ${item?.name} have been saved.`,
        type: "success",
      });
    } else {
      const itemCashPrice = resolvedCashPrice;
      const categoryName = catId
        ? useMenuStore.getState().getCategoryById(catId)?.name
        : undefined;
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
        seatNumber:
          shouldApplySeat && seatVal !== undefined ? seatVal : undefined,
        addedFromCategoryId: catId || null,
        addedFromMenuId: mId || null,
        category_name: categoryName || undefined,
        baseCardPrice: baseItem.price,
        baseCashPrice: baseItem.cashPrice ?? baseItem.price,
      };
      addItemToActiveOrder(newItem);
      // Apply seat override synchronously so useTableSeating's effect skips this item
      if (shouldApplySeat) {
        const ordId = useOrderStore.getState().activeOrderId;
        if (ordId) {
          useSeatingStore
            .getState()
            .setItemSeat(ordId, newItem.id, seatVal, undefined, true);

          // Sync back to global active seat so subsequent items pick it up
          useSeatingStore.getState().setActiveSeat(ordId, seatVal);
        }
      }
    }

    closeModal();
  }, []);

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
  }, []);

  // ============================================================================
  // RENDER
  // ============================================================================

  // IMPORTANT: These must be ABOVE early returns so hook count stays stable.
  const currentCategory = state.activeCategory
    ? (modifierCategoriesById.get(state.activeCategory) ?? null)
    : null;

  const visibleOptions = useMemo(() => {
    if (!currentCategory) return [] as ModifierCategory["options"];
    return currentCategory.options.slice(0, visibleOptionCount);
  }, [currentCategory, visibleOptionCount]);

  const visibleOptionRows = useMemo(() => {
    const rows: ModifierCategory["options"][] = [];
    for (let index = 0; index < visibleOptions.length; index += 5) {
      rows.push(visibleOptions.slice(index, index + 5));
    }
    return rows;
  }, [visibleOptions]);

  // Progressively reveal options in chunks instead of mounting all options in one frame.
  useEffect(() => {
    if (!isOpen || !currentCategory) return;
    const totalOptions = currentCategory.options.length;
    if (visibleOptionCount >= totalOptions) return;
    const chunkSize = Math.max(12, Math.ceil(totalOptions / 4));

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const growHandle = InteractionManager.runAfterInteractions(() => {
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        setVisibleOptionCount((prev) =>
          Math.min(totalOptions, prev + chunkSize),
        );
      }, 24);
    });

    return () => {
      cancelled = true;
      growHandle.cancel();
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [
    isOpen,
    currentCategory?.id,
    currentCategory?.options.length,
    visibleOptionCount,
  ]);

  const hasModifiers = !!(
    menuItemForModifiers?.modifiers && menuItemForModifiers.modifiers.length > 0
  );

  if (
    cartItem?.kitchen_status === "sent" ||
    cartItem?.kitchen_status === "preparing" ||
    cartItem?.kitchen_status === "ready" ||
    cartItem?.kitchen_status === "served"
  ) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.screen }}>
        {/* Header */}
        <View
          className="flex-row items-center px-4 py-3 border-b"
          style={{ borderColor: colors.border }}
        >
          <TouchableOpacity
            onPressIn={close}
            className="flex-row items-center gap-1.5"
          >
            <ArrowLeft color={colors.label} size={16} />
            <Text
              className="text-sm font-medium"
              style={{ color: colors.label }}
            >
              Back to Bill
            </Text>
          </TouchableOpacity>
        </View>
        <View className="flex-1 items-center justify-center p-5">
          <Text
            className="text-lg font-bold text-center mb-1.5"
            style={{ color: colors.heading }}
          >
            Item Already Sent
          </Text>
          <Text
            className="text-sm text-center mb-4"
            style={{ color: colors.label }}
          >
            This item has been sent to the kitchen and cannot be modified.
          </Text>
          <View
            className="rounded-xl p-3 w-full border flex-row items-center gap-3"
            style={{
              backgroundColor: colors.panel,
              borderColor: colors.border,
            }}
          >
            <View className="flex-1">
              <Text
                className="text-sm font-semibold"
                style={{ color: colors.heading }}
              >
                {cartItem.name}
              </Text>
              <Text className="text-xs mt-0.5" style={{ color: colors.label }}>
                Qty: {cartItem.quantity}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPressIn={close}
            className="mt-4 px-6 py-2.5 rounded-full"
            style={{ backgroundColor: colors.teal }}
          >
            <Text
              className="text-sm font-semibold"
              style={{ color: colors.onSolid }}
            >
              Back to Bill
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!shouldPaintScreen) return null;

  if (!currentItem) {
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: colors.screen }}
      >
        <Text style={{ color: colors.label }}>Loading item...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
      style={{ backgroundColor: colors.screen }}
      onTouchStart={handleInitialInteraction}
    >
      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <View
        className="flex-row items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: colors.border }}
      >
        <TouchableOpacity
          onPressIn={handleCancel}
          className="flex-row items-center gap-1.5"
        >
          <ArrowLeft color={colors.label} size={16} />
          <Text className="text-sm font-medium" style={{ color: colors.label }}>
            {mode === "edit" || (mode === "fullscreen" && cartItem)
              ? "Bill"
              : "Menu"}
          </Text>
        </TouchableOpacity>

        <View className="flex-row items-center gap-2">
          {showSeatPicker && (
            <TouchableOpacity
              onPressIn={() => dispatch({ type: "TOGGLE_SEAT_PICKER" })}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 12,
                backgroundColor: colors.teal + "20",
                borderWidth: 1,
                borderColor: colors.teal + "50",
              }}
            >
              <Text
                style={{ fontSize: 11, fontWeight: "600", color: colors.teal }}
              >
                {seatOverride === null ? "Shared" : `Seat ${seatOverride}`}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPressIn={handleCancel} className="p-1.5">
            <X color={colors.label} size={16} />
          </TouchableOpacity>
          <TouchableOpacity
            onPressIn={handleSave}
            className="flex-row items-center gap-1.5 px-4 py-2 rounded-full"
            style={{ backgroundColor: colors.teal }}
          >
            <Check color={colors.onSolid} size={13} strokeWidth={2.5} />
            <Text
              className="text-sm font-semibold"
              style={{ color: colors.onSolid }}
            >
              Done · ${total.toFixed(2)}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* ── Item Header ─────────────────────────────────────────────────── */}
        <View
          className="flex-row items-center gap-3 px-4 py-3 border-b"
          style={{ borderColor: colors.border }}
        >
          {showMenuImages ? (
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 8,
                overflow: "hidden",
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              {showSecondarySections && resolvedImageSource ? (
                <OptimizedListImage
                  source={resolvedImageSource}
                  style={{ width: 48, height: 48 }}
                  contentFit="cover"
                />
              ) : null}
            </View>
          ) : null}
          <View className="flex-1">
            <Text
              className="text-base font-bold"
              style={{ color: colors.heading }}
              numberOfLines={1}
            >
              {currentItem.name}
            </Text>
            {menuItemForModifiers?.description ? (
              <Text
                className="text-xs mt-0.5"
                style={{ color: colors.label }}
                numberOfLines={1}
              >
                {menuItemForModifiers.description}
              </Text>
            ) : null}
          </View>
          <Text
            className="text-base font-bold"
            style={{ color: colors.heading }}
          >
            ${getCurrentItemPrice(currentItem).toFixed(2)}
          </Text>
        </View>

        {/* ── Seat Picker ──────────────────────────────────────────────────── */}
        {showSecondarySections && state.isSeatPickerOpen && showSeatPicker && (
          <View
            className="px-4 py-3 border-t"
            style={{ borderColor: colors.border }}
          >
            <Text
              className="text-sm font-semibold mb-2"
              style={{ color: colors.heading }}
            >
              Assign to Seat
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6 }}
            >
              <TouchableOpacity
                onPressIn={() => setSeatOverride(null)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                  borderRadius: 16,
                  borderWidth: 1,
                  backgroundColor:
                    seatOverride === null ? colors.teal + "20" : "transparent",
                  borderColor:
                    seatOverride === null ? colors.teal : colors.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: seatOverride === null ? colors.teal : colors.label,
                  }}
                >
                  Shared
                </Text>
              </TouchableOpacity>
              {Array.from({ length: seatCount }, (_, i) => i + 1).map(
                (seat) => (
                  <TouchableOpacity
                    key={seat}
                    onPressIn={() => setSeatOverride(seat)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 6,
                      borderRadius: 16,
                      borderWidth: 1,
                      backgroundColor:
                        seatOverride === seat
                          ? colors.teal + "20"
                          : "transparent",
                      borderColor:
                        seatOverride === seat ? colors.teal : colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color:
                          seatOverride === seat ? colors.teal : colors.label,
                      }}
                    >
                      Seat {seat}
                    </Text>
                  </TouchableOpacity>
                ),
              )}
            </ScrollView>
          </View>
        )}

        {/* ── Category Pill Tabs ──────────────────────────────────────────── */}
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingVertical: 10,
              gap: 6,
            }}
            style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
          >
            {hasModifiers &&
              menuItemForModifiers!.modifiers.map((category) => {
                const hasSelection =
                  (state.selectionCounts[category.id] ?? 0) > 0;
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
            {!isReadOnly && (
              <TouchableOpacity
                onPressIn={handleOpenCustomModifierModal}
                className="flex-row items-center gap-x-1 px-3 py-1.5 rounded-full border"
                style={{
                  backgroundColor: "transparent",
                  borderColor: colors.teal,
                  borderStyle: "dashed",
                }}
              >
                <Plus color={colors.teal} size={11} strokeWidth={3} />
                <Text
                  className="text-xs font-semibold"
                  style={{ color: colors.teal }}
                >
                  Custom Modifier
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          {/* ── Active Category Options ──────────────────────────────── */}
          {currentCategory && (
            <View className="px-4 pt-3 pb-2">
              {/* Sub-header row */}
              <View className="flex-row items-center justify-between mb-3">
                <Text
                  className="text-sm font-bold"
                  style={{ color: colors.heading }}
                >
                  {currentCategory.name}
                </Text>
                <View className="flex-row items-center gap-1.5">
                  <Text
                    className="text-xs font-semibold"
                    style={{
                      color:
                        currentCategory.type === "required"
                          ? colors.warning
                          : colors.label,
                    }}
                  >
                    {currentCategory.type === "required"
                      ? "Required"
                      : "Optional"}
                  </Text>
                  <Text className="text-xs" style={{ color: colors.muted }}>
                    ·
                  </Text>
                  <Text className="text-xs" style={{ color: colors.label }}>
                    {currentCategory.selectionType === "single"
                      ? "Single Select"
                      : currentCategory.maxSelections
                        ? `Up to ${currentCategory.maxSelections}`
                        : "Multi Select"}
                  </Text>
                </View>
              </View>

              {/* Options grid */}
              <View style={{ maxHeight: 320 }}>
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={visibleOptions.length > 9}
                  contentContainerStyle={{
                    paddingBottom: 2,
                  }}
                >
                  {visibleOptionRows.map((row, rowIndex) => (
                    <View
                      key={`modifier-row-${rowIndex}`}
                      style={{
                        flexDirection: "row",
                        gap: 8,
                        justifyContent: "flex-start",
                        marginBottom: 8,
                      }}
                    >
                      {row.map((option) => {
                        const selVal =
                          state.modifierSelections[currentCategory.id]?.[
                            option.id
                          ];
                        const isSelected = selVal === true || selVal === "no";
                        const isNo = selVal === "no";
                        const isUnavailable = option.isAvailable === false;

                        return (
                          <ModifierOption
                            key={option.id}
                            option={option}
                            categoryId={currentCategory.id}
                            isSelected={isSelected}
                            isNo={isNo}
                            isUnavailable={isUnavailable}
                            isReadOnly={isReadOnly}
                            onToggle={handleModifierToggle}
                            onLongPress={handleNoModifierToggle}
                          />
                        );
                      })}
                    </View>
                  ))}
                </ScrollView>
              </View>
            </View>
          )}
        </View>

        {/* ── Custom Modifiers ─────────────────────────────────────────────── */}
        {state.customModifiers.length > 0 && (
          <View
            className="px-4 py-3 border-t"
            style={{ borderColor: colors.border }}
          >
            <Text
              className="text-sm font-semibold mb-2"
              style={{ color: colors.heading }}
            >
              Custom Modifiers
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {state.customModifiers.map((mod) => (
                <View
                  key={mod.id}
                  className="flex-row items-center gap-x-1.5 pl-3 pr-1.5 py-1 rounded-full border"
                  style={{
                    backgroundColor: colors.teal + "20",
                    borderColor: colors.teal,
                  }}
                >
                  <View className="flex-row items-center gap-x-1.5">
                    <Text
                      className="text-xs font-semibold"
                      style={{ color: colors.teal }}
                    >
                      {mod.name}
                    </Text>
                    {mod.price > 0 ? (
                      <Text
                        className="text-base font-semibold"
                        style={{ color: MODIFIER_PRICE_DELTA_COLOR }}
                      >
                        +${mod.price.toFixed(2)}
                      </Text>
                    ) : null}
                  </View>
                  {!isReadOnly && (
                    <TouchableOpacity
                      onPressIn={() => handleRemoveCustomModifier(mod.id)}
                      className="w-5 h-5 rounded-full items-center justify-center"
                      style={{ backgroundColor: colors.teal }}
                    >
                      <X color={colors.onSolid} size={10} strokeWidth={3} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Quantity ─────────────────────────────────────────────────────── */}
        <View
          className="px-4 py-3 border-t flex-col items-center justify-between"
          style={{ borderColor: colors.border }}
        >
          <View className="flex-row justify-between items-center w-[100%]">
            <Text
              className="text-sm font-semibold"
              style={{ color: colors.heading }}
            >
              Quantity
            </Text>
            <View className="flex-row items-center gap-3">
              <TouchableOpacity
                disabled={isReadOnly}
                onPressIn={handleQuantityDecrement}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{
                  backgroundColor: colors.panel,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Minus color={colors.heading} size={14} />
              </TouchableOpacity>
              <TouchableOpacity
                disabled={isReadOnly}
                onPressIn={handleQuantityPress}
              >
                <Text
                  className="text-xl font-bold w-8 text-center"
                  style={{ color: colors.heading }}
                >
                  {state.quantity}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={isReadOnly}
                onPressIn={handleQuantityIncrement}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.teal }}
              >
                <Plus color={colors.onSolid} size={14} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── Special Instructions ─────────────────────────────────────────── */}
        <View
          className="px-4 pb-3 border-t"
          style={{ borderColor: colors.border }}
        >
          <NotesInput
            initialValue={state.notes}
            isReadOnly={isReadOnly}
            onChange={handleNotesChange}
          />
        </View>

        {/* ── Allergens ──────────────────────────────────────────────────── */}
        {showSecondarySections &&
          menuItemForModifiers?.allergens &&
          menuItemForModifiers.allergens.length > 0 && (
            <View
              className="px-4 pb-3 border-t"
              style={{ borderColor: colors.border }}
            >
              <Text
                className="text-sm font-semibold mt-3 mb-2"
                style={{ color: colors.heading }}
              >
                Allergens
              </Text>
              <View className="flex-row flex-wrap gap-1.5">
                {menuItemForModifiers.allergens.map((allergen) => (
                  <View
                    key={allergen}
                    className="px-2.5 py-1 rounded-full"
                    style={{
                      backgroundColor: colors.danger + "20",
                      borderWidth: 1,
                      borderColor: colors.danger + "30",
                    }}
                  >
                    <Text className="text-xs" style={{ color: colors.danger }}>
                      {allergen}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
      </ScrollView>

      {/* ── Quantity Modal ──────────────────────────────────────────────── */}
      <Modal
        visible={state.isQuantityModalOpen}
        transparent
        animationType="fade"
        onRequestClose={handleQuantityCancel}
      >
        <View
          className="flex-1 justify-center items-center"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <View
            className="rounded-2xl p-5 w-72 border"
            style={{
              backgroundColor: colors.panel,
              borderColor: colors.border,
            }}
          >
            <Text
              className="text-lg font-semibold mb-4 text-center"
              style={{ color: colors.heading }}
            >
              Enter Quantity
            </Text>
            <TextInput
              value={state.quantityInput}
              onChangeText={(text) =>
                dispatch({ type: "SET_QUANTITY_INPUT", payload: text })
              }
              keyboardType="numeric"
              autoFocus
              className="rounded-xl text-2xl font-bold text-center h-14 mb-5 border"
              style={{
                color: colors.heading,
                backgroundColor: colors.inset,
                borderColor: colors.border,
              }}
            />
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPressIn={handleQuantityCancel}
                className="flex-1 py-3 rounded-xl items-center border"
                style={{ borderColor: colors.border }}
              >
                <Text
                  className="text-base font-semibold"
                  style={{ color: colors.label }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPressIn={handleQuantitySubmit}
                className="flex-1 py-3 rounded-xl items-center"
                style={{ backgroundColor: colors.teal }}
              >
                <Text
                  className="text-base font-semibold"
                  style={{ color: colors.onSolid }}
                >
                  Set
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Custom Modifier Modal ───────────────────────────────────────── */}
      <Modal
        visible={state.isCustomModifierModalOpen}
        transparent
        animationType="fade"
        onRequestClose={handleCloseCustomModifierModal}
      >
        <View
          className="flex-1 justify-center items-center px-6"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <View
            className="rounded-2xl p-5 w-96 max-w-full border"
            style={{
              backgroundColor: colors.panel,
              borderColor: colors.border,
            }}
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text
                className="text-lg font-semibold"
                style={{ color: colors.heading }}
              >
                Add Custom Modifier
              </Text>
              <TouchableOpacity
                onPressIn={handleCloseCustomModifierModal}
                className="w-7 h-7 rounded-full items-center justify-center"
                style={{
                  backgroundColor: colors.panel,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <X color={colors.label} size={14} />
              </TouchableOpacity>
            </View>

            <Text
              className="text-xs font-semibold mb-1.5"
              style={{ color: colors.label }}
            >
              Name
            </Text>
            <TextInput
              value={state.customModifierNameInput}
              onChangeText={(text) =>
                dispatch({
                  type: "SET_CUSTOM_MODIFIER_NAME",
                  payload: text,
                })
              }
              autoFocus
              maxLength={40}
              placeholder="e.g. Extra Avocado"
              placeholderTextColor={colors.muted}
              className="rounded-xl text-base text-left h-12 px-3 mb-3 border"
              style={{
                color: colors.heading,
                backgroundColor: colors.inset,
                borderColor: colors.border,
              }}
            />

            <Text
              className="text-xs font-semibold mb-1.5"
              style={{ color: colors.label }}
            >
              Price (optional)
            </Text>
            <TextInput
              value={state.customModifierPriceInput}
              onChangeText={(text) =>
                dispatch({
                  type: "SET_CUSTOM_MODIFIER_PRICE",
                  payload: text,
                })
              }
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.muted}
              className="rounded-xl text-base text-left h-12 px-3 mb-5 border"
              style={{
                color: colors.heading,
                backgroundColor: colors.inset,
                borderColor: colors.border,
              }}
            />

            <View className="flex-row gap-3">
              <TouchableOpacity
                onPressIn={handleCloseCustomModifierModal}
                className="flex-1 py-3 rounded-xl items-center border"
                style={{ borderColor: colors.border }}
              >
                <Text
                  className="text-base font-semibold"
                  style={{ color: colors.label }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPressIn={handleConfirmCustomModifier}
                disabled={state.customModifierNameInput.trim().length === 0}
                className="flex-1 py-3 rounded-xl items-center"
                style={{
                  backgroundColor:
                    state.customModifierNameInput.trim().length === 0
                      ? colors.teal + "60"
                      : colors.teal,
                }}
              >
                <Text
                  className="text-base font-semibold"
                  style={{ color: colors.onSolid }}
                >
                  Add
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

interface ModifierScreenProps {
  keepMountedDuringClose?: boolean;
}

const ModifierScreen = ({
  keepMountedDuringClose = false,
}: ModifierScreenProps) => {
  return (
    <ModifierScreenContent keepMountedDuringClose={keepMountedDuringClose} />
  );
};

export default memo(ModifierScreen);
