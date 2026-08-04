import { useToast } from "@/contexts/ToastContext";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { colors } from "@/lib/theme";
import { CartItem, ModifierCategory } from "@/lib/types";
import { useUiScale } from "@/lib/uiScale";
import { OrderService } from "@/services/orderService";
import { useMenuStore } from "@/stores/useMenuStore";
import {
  getLastModifierOpenStartedAt,
  useModifierSidebarStore,
} from "@/stores/useModifierSidebarStore";
import {
  getModifierSelectionCounts,
  getModifierSelections,
  useModifierSelectionStore,
} from "@/stores/useModifierSelectionStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useSeatingStore } from "@/stores/useSeatingStore";

import OptimizedListImage from "@/components/ui/OptimizedListImage";
import { resolveMenuItemImageSource } from "@/lib/menuItemImageSource";
import { orderStoreDiagnosticLog } from "@/lib/performanceDiagnostics";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { FlashList } from "@shopify/flash-list";
import { ArrowLeft, Check, Minus, Plus, X } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Switch,
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

/** Stable empty array so the options FlashList keeps a constant data identity
 *  when no category is active (avoids a full re-layout on every render). */
const EMPTY_OPTIONS: ModifierCategory["options"] = [];

/** Columns in the modifier-option grid. */
const OPTION_COLUMNS = 5;

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
          // Sized by the FlashList column container (numColumns={5}); fill it
          // rather than flex-basing off the parent row width.
          flex: 1,
          marginHorizontal: 4,
          marginBottom: 8,
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
 * Option cell that subscribes to its OWN selection value in
 * useModifierSelectionStore. A tap flips state in that store; only the cells
 * whose value changed re-render (plus the Done total). The main screen tree
 * is not involved at all.
 */
const SessionModifierOption = memo(
  ({
    option,
    categoryId,
    isUnavailable,
    isReadOnly,
    onToggle,
    onLongPress,
  }: {
    option: any;
    categoryId: string;
    isUnavailable: boolean;
    isReadOnly: boolean;
    onToggle: (categoryId: string, optionId: string) => void;
    onLongPress: (categoryId: string, optionId: string) => void;
  }) => {
    const selVal = useModifierSelectionStore(
      (s) => s.selections[categoryId]?.[option.id],
    );
    return (
      <ModifierOption
        option={option}
        categoryId={categoryId}
        isSelected={selVal === true || selVal === "no"}
        isNo={selVal === "no"}
        isUnavailable={isUnavailable}
        isReadOnly={isReadOnly}
        onToggle={onToggle}
        onLongPress={onLongPress}
      />
    );
  },
);

/**
 * Category tab that subscribes to its own has-selection flag. Selecting an
 * option updates the dot on the affected tab only.
 */
const SessionCategoryTab = memo(
  ({
    category,
    isActive,
    onPress,
  }: {
    category: ModifierCategory;
    isActive: boolean;
    onPress: (categoryId: string) => void;
  }) => {
    const hasSelection = useModifierSelectionStore(
      (s) => (s.selectionCounts[category.id] ?? 0) > 0,
    );
    return (
      <CategoryTab
        category={category}
        isActive={isActive}
        hasSelection={hasSelection}
        onPress={onPress}
      />
    );
  },
);

/**
 * Live "Done · $total" label. Subscribes to the selection store and recomputes
 * the session total per selection change — one tiny Text re-render instead of
 * the whole screen. Base price, quantity and custom modifiers arrive as props
 * (they change rarely and re-render the parent anyway when they do).
 */
const SessionDoneTotal = memo(
  ({
    basePrice,
    quantity,
    customModifiersTotal,
    optionsById,
  }: {
    basePrice: number;
    quantity: number;
    customModifiersTotal: number;
    optionsById: Map<
      string,
      { option: any; categoryId: string; categoryName: string }
    >;
  }) => {
    const total = useModifierSelectionStore((s) => {
      let baseTotal = basePrice + customModifiersTotal;
      for (const categorySelections of Object.values(s.selections)) {
        for (const [optionId, isSelected] of Object.entries(
          categorySelections,
        )) {
          if (isSelected && isSelected !== "no") {
            const optionData = optionsById.get(optionId);
            if (optionData) baseTotal += optionData.option.price;
          }
        }
      }
      return baseTotal * quantity;
    });
    return <>Done · ${total.toFixed(2)}</>;
  },
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
    onFocus,
  }: {
    initialValue: string;
    isReadOnly: boolean;
    onChange: (text: string) => void;
    onFocus?: () => void;
  }) => {
    const [localValue, setLocalValue] = useState(initialValue);
    const latestValueRef = useRef(initialValue);
    const hasUserTypedRef = useRef(false);

    // Sync if initialValue changes from outside, but ONLY if the user hasn't
    // typed yet (e.g. opening a different item). Once the user has started
    // typing, the parent re-render that updated state.notes via the debounce
    // MUST NOT clobber localValue — that's what causes the "eating characters"
    // bug when the 220ms debounce fires while the user is mid-typing.
    useEffect(() => {
      if (hasUserTypedRef.current) return;
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
              hasUserTypedRef.current = true;
              latestValueRef.current = text;
              setLocalValue(text);
            }}
            onBlur={() => onChange(latestValueRef.current)}
            onFocus={onFocus}
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

// NOTE: modifier SELECTIONS are deliberately NOT in this reducer. They live
// in useModifierSelectionStore so an option tap re-renders only the tapped
// cells + the Done total — not this entire screen. See that store's header.
type State = {
  quantity: number;
  notes: string;
  isToGo: boolean;
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
  | { type: "SET_NOTES"; payload: string }
  | { type: "SET_TOGO"; payload: boolean }
  | { type: "SET_ACTIVE_CATEGORY"; payload: string | null }
  | { type: "OPEN_QUANTITY_MODAL"; payload: string }
  | { type: "CLOSE_QUANTITY_MODAL" }
  | { type: "SET_QUANTITY_INPUT"; payload: string }
  | { type: "INITIALIZE"; payload: Partial<State> }
  | { type: "TOGGLE_SEAT_PICKER" }
  | { type: "OPEN_CUSTOM_MODIFIER_MODAL" }
  | { type: "CLOSE_CUSTOM_MODIFIER_MODAL" }
  | { type: "SET_CUSTOM_MODIFIER_NAME"; payload: string }
  | { type: "SET_CUSTOM_MODIFIER_PRICE"; payload: string }
  | {
      type: "ADD_CUSTOM_MODIFIER";
      payload: { name: string; price: number };
    }
  | { type: "REMOVE_CUSTOM_MODIFIER"; payload: string };

const immerReducer = (state: State, action: Action): void => {
  switch (action.type) {
    case "SET_QUANTITY":
      state.quantity = action.payload;
      return;
    case "SET_NOTES":
      state.notes = action.payload;
      return;
    case "SET_TOGO":
      state.isToGo = action.payload;
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
      return;
    case "TOGGLE_SEAT_PICKER":
      state.isSeatPickerOpen = !state.isSeatPickerOpen;
      return;
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
// SEAT PILL — Wave 4.5
// ============================================================================
// Memoized so flipping `seatOverride` only re-renders the two affected pills
// (old selected + new selected) instead of the entire Array.from(...).map(...)
// block on every tap. Inline styles are computed inside the memo'd child, so
// React.memo's shallow compare on (seat, isSelected) is the only comparison
// needed.

const SEAT_PILL_BASE = {
  paddingHorizontal: 14,
  paddingVertical: 6,
  borderRadius: 16,
  borderWidth: 1,
} as const;

const SeatPill = memo(function SeatPill({
  seat,
  label,
  isSelected,
  onSelect,
}: {
  seat: number | null;
  label: string;
  isSelected: boolean;
  onSelect: (seat: number | null) => void;
}) {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const handlePress = useCallback(() => onSelect(seat), [seat, onSelect]);
  return (
    <TouchableOpacity
      onPressIn={handlePress}
      style={{
        ...SEAT_PILL_BASE,
        backgroundColor: isSelected ? colors.teal + "20" : "transparent",
        borderColor: isSelected ? colors.teal : colors.border,
      }}
    >
      <Text
        style={{
          fontSize: s(12),
          fontWeight: "600",
          color: isSelected ? colors.teal : colors.label,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
});

// Persist a per-item TO GO change to the backend when it actually changed and
// the item has a synced backend row. Fire-and-forget: the caller has already
// set the local flag; OrderService.toggleToGoOnItems marks the toggle pending
// so an in-flight broadcast re-fetch won't clobber the optimistic value, and a
// later re-fetch reconciles the server state. If the item has no db id yet, the
// add-time reconcile in useOrderStore.addItemToBackend fires the toggle once the
// id lands, so the change is never lost. Shared by the normal-item AND open-item
// save branches so they can't drift — that drift is exactly how open items ended
// up showing [TO GO] locally while is_to_go stayed false on the server.
const persistToGoIfChanged = (
  client: Parameters<typeof OrderService.toggleToGoOnItems>[0] | null,
  dbItemId: string | undefined | null,
  prevIsToGo: boolean | undefined,
  nextIsToGo: boolean,
) => {
  if (Boolean(prevIsToGo) === Boolean(nextIsToGo)) return;
  if (!dbItemId || !client) return;
  OrderService.toggleToGoOnItems(client, [dbItemId], nextIsToGo).catch(() => {
    // Fire-and-forget: local flag is persisted; a later broadcast re-fetch
    // reconciles the server state.
  });
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ModifierScreenContent = () => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const store = useModifierSidebarStore(
    // NOTE: `isOpen` is deliberately NOT selected here.
    //
    // This screen does not need to know it is closing — ModifierScreenOverlay
    // owns hiding it (a Reanimated transform on the UI thread). Subscribing to
    // `isOpen` meant every DONE/Cancel press synchronously re-rendered this
    // entire tree — tabs, option grid, quantity, notes, both Modals — on the
    // exact frame that also runs the close animation and the cart mutation.
    // That was the stall you feel on DONE.
    //
    // With `isOpen` out of the selector, close() produces an identical
    // selector result, useShallow bails out, and pressing DONE costs this
    // screen zero renders. It re-renders only when a new item is opened
    // (openSeq changes). This is only safe because the screen is now
    // permanently mounted.
    useShallow((s) => ({
      openSeq: s.openSeq,
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
    openSeq,
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
  const supabase = useSupabaseClient();
  // Latest-ref so the []-dep handleSave callback can reach the current client
  // without capturing it in its closure.
  const supabaseRef = useRef(supabase);
  supabaseRef.current = supabase;

  const [state, dispatch] = useImmerReducer<State, Action, void>(
    immerReducer,
    undefined as void,
    (): State => {
      // Selections are seeded into useModifierSelectionStore by the session
      // effect below; only non-selection UI state lives in this reducer.
      useModifierSelectionStore.getState().init(storeInitialSelections ?? {});
      return {
        quantity: cartItem?.quantity ?? 1,
        notes: cartItem?.customizations?.notes ?? "",
        isToGo: cartItem?.is_to_go ?? false,
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
  // Tracks whether the user has touched the modifier-screen qty stepper this
  // session. When false, external cart-side qty changes (e.g. swipe-right
  // increments on the cart row while modifier is open) sync into state.quantity
  // so a subsequent save doesn't clobber the cart's latest qty with the
  // modifier screen's stale opened-at value. When true, the modifier's qty
  // wins. Reset on session change (new item or new cart entry).
  const userTouchedQtyRef = useRef(false);

  // When the store opens a new item session, reinitialize local reducer state
  // without unmounting the component.
  //
  // Keyed off the store's monotonic `openSeq`, NOT a derived
  // `itemId_cartItemId_mode` string. That string is identical when the same
  // item is opened twice in a row, so the re-init below was skipped and the
  // second open inherited the first session's quantity, notes and selections.
  const sessionId = openSeq;
  const prevSessionRef = useRef<number | null>(null);
  const shouldShowSeatPicker =
    showSeatPicker &&
    (state.isSeatPickerOpen || sessionId !== prevSessionRef.current);

  useEffect(() => {
    if (sessionId === null) {
      prevSessionRef.current = null;
      return;
    }
    if (sessionId === prevSessionRef.current) return;
    prevSessionRef.current = sessionId;
    if (__DEV__) {
      const openStartedAt = getLastModifierOpenStartedAt();
      if (openStartedAt > 0) {
        orderStoreDiagnosticLog(
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
    userTouchedQtyRef.current = false;
    // Seed the selection store for this session (option cells subscribe to it
    // directly; nothing in this component re-renders from selection taps).
    useModifierSelectionStore.getState().init(storeInitialSelections ?? {});
    dispatch({
      type: "INITIALIZE",
      payload: {
        quantity: cartItem?.quantity ?? 1,
        notes: cartItem?.customizations?.notes ?? "",
        isToGo: cartItem?.is_to_go ?? false,
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

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Sync external qty mutations into the modifier screen state. Without this,
  // swiping the cart row to increment qty while the modifier screen is open
  // leaves state.quantity stale at the modifier-open value; saving would then
  // overwrite the cart's latest qty with the stale modifier value. Skipped
  // when the user has actively touched the modifier qty stepper this session
  // — in that case the modifier's intent wins. Reset by the session-init
  // effect above when the user opens a different item.
  useEffect(() => {
    if (!sessionId) return;
    if (userTouchedQtyRef.current) return;
    const externalQty = cartItem?.quantity;
    if (externalQty == null) return;
    const { state: currentState } = latestStateRef.current;
    if (currentState.quantity === externalQty) return;
    dispatch({ type: "SET_QUANTITY", payload: externalQty });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, cartItem?.quantity]);

  // NOTE: the old progressive-reveal effect for the image/allergens block
  // lived here. It ran through InteractionManager.runAfterInteractions, which
  // is starved while the user keeps tapping — so during a rapid ordering burst
  // these reveals were postponed and then all flushed at once when the user
  // finally paused, which is what read as "it gets laggy when I go fast".
  // With the screen permanently mounted there is nothing to defer: the header
  // image is already prefetched by the store's preWarm and the allergens block
  // is a handful of pills. Both now render on the first frame.

  // Notes now lives in the pinned bottom section (not a scrolling body), so
  // there's nothing to scroll into view on focus — KeyboardAvoidingView +
  // Android's adjustResize lift it above the keyboard.
  const handleNotesFocus = useCallback(() => {}, []);

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
      showMenuImages
        ? resolveMenuItemImageSource(currentItem?.image)
        : undefined,
    [showMenuImages, currentItem?.image],
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
  }, [baseMenuItem, precomputedModifiers]);

  const { modifierCategoriesById, optionsById } = useMemo(() => {
    const emptyCategories = new Map<string, ModifierCategory>();
    const emptyOptions = new Map<
      string,
      { option: any; categoryId: string; categoryName: string }
    >();
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
    precomputedCategoriesById,
    precomputedOptionsById,
    menuItemForModifiers?.modifiers,
  ]);

  // Session total is computed on demand from the selection store (see
  // computeSessionTotal). It is NOT derived in this component so option taps
  // don't re-render the tree; the Done button subscribes to selections itself
  // and shows the live figure.
  const basePrice = currentItem ? getCurrentItemPrice(currentItem) : 0;
  const customModifiersTotal = useMemo(() => {
    let sum = 0;
    for (const m of state.customModifiers) sum += m.price;
    return sum;
  }, [state.customModifiers]);
  const computeSessionTotal = useCallback(() => {
    const { state: st, optionsById: opts } = latestStateRef.current;
    const selections = getModifierSelections();
    let baseTotal = latestStateRef.current.currentItem
      ? latestStateRef.current.basePrice
      : 0;
    for (const categorySelections of Object.values(selections)) {
      for (const [optionId, isSelected] of Object.entries(
        categorySelections,
      )) {
        if (isSelected && isSelected !== "no") {
          const optionData = opts.get(optionId);
          if (optionData) baseTotal += optionData.option.price;
        }
      }
    }
    for (const m of st.customModifiers) {
      baseTotal += m.price;
    }
    return baseTotal * st.quantity;
  }, []);

  // NOTE: the deferred draft-item effect lived here (220ms timer → write a
  // placeholder CartItem into the active order). It has been removed. The
  // modifier screen is fullscreen, so the cart is never visible while a draft
  // would be alive — the write and its matching removal on close produced only
  // cart re-renders, landing inside the open/close animation. handleSave's
  // real add performs the whole mutation in one step.

  // NOTE: the unmount-cleanup effect that lived here (close the store session
  // and drop a dangling draft if this component unmounted mid-session) is gone
  // along with the unmount itself — the screen is now permanently mounted, so
  // the cleanup could only ever run on a full screen teardown, at which point
  // the store is being reset anyway.

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
    basePrice,
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
    basePrice,
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
      useModifierSelectionStore.getState().toggle(catId, optionId, category);
    },
    [],
  );

  const handleNoModifierToggle = useCallback(
    (catId: string, optionId: string) => {
      const { isReadOnly, modifierCategoriesById } = latestStateRef.current;
      if (isReadOnly) return;
      const category = modifierCategoriesById.get(catId);
      if (!category) return;
      useModifierSelectionStore.getState().toggleNo(catId, optionId, category);
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
    if (newQuantity && newQuantity > 0) {
      userTouchedQtyRef.current = true;
      dispatch({ type: "SET_QUANTITY", payload: newQuantity });
    }
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
    userTouchedQtyRef.current = true;
    dispatch({
      type: "SET_QUANTITY",
      payload: Math.max(1, currentState.quantity - 1),
    });
  }, []);

  const handleQuantityIncrement = useCallback(() => {
    const { state: currentState } = latestStateRef.current;
    userTouchedQtyRef.current = true;
    dispatch({ type: "SET_QUANTITY", payload: currentState.quantity + 1 });
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

    // Snapshot the session selections + total NOW — the store is reused by
    // the next open() and must not be read after closeModal().
    const sessionSelections = getModifierSelections();
    const sessionSelectionCounts = getModifierSelectionCounts();
    const currentTotal = computeSessionTotal();

    const baseItem = currentMenuItem || modifiersItem;
    const isOpenItem =
      currentCartItem?.is_open_item === true ||
      currentCartItem?.menuItemId?.startsWith("open_item_") ||
      currentCartItem?.customizations?.notes === "Open Item";

    if (!baseItem && !isOpenItem) return;

    // Validate required selections BEFORE closing — a failed validation must
    // keep the modal open so the user can fix it.
    if (modifiersItem?.modifiers && modifiersItem.modifiers.length > 0) {
      const hasRequiredSelections = modifiersItem.modifiers.every(
        (category) => {
          if (category.type === "required")
            return (sessionSelectionCounts[category.id] ?? 0) > 0;
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

    // Close the modal immediately so the slide-out animation isn't blocked by
    // the (potentially expensive) cart mutation below. setTimeout(0) (not
    // runAfterInteractions) so this doesn't get batched with unrelated
    // pending interaction handles from this screen's reveal/grow effects —
    // that batching was delaying the cart write past the next item's open().
    closeModal();

    setTimeout(() => {
      if (
        isOpenItem &&
        (currentMode === "edit" || currentMode === "fullscreen") &&
        currentCartItem
      ) {
        // Re-read the LIVE store item so we resolve a fresh db_order_item_id —
        // the sheet snapshot can predate the backend sync (same reason as the
        // regular-item branch below) — and so we don't write a stale null id back.
        const liveStoreItem = useOrderStore
          .getState()
          .ordersById[
            useOrderStore.getState().activeOrderId ?? ""
          ]?.items.find((i) => i.id === currentCartItem.id);
        const resolvedDbItemId =
          liveStoreItem?.db_order_item_id ?? currentCartItem.db_order_item_id;

        const updatedOpenItem = {
          ...currentCartItem,
          db_order_item_id: resolvedDbItemId,
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
          is_to_go: currentState.isToGo,
        };
        updateItemInActiveOrder(updatedOpenItem);

        // Persist the per-item TO GO flag (mirrors the regular-item branch). If
        // the item has no db id yet, addItemToBackend's reconcile fires the toggle
        // when the id lands, so the change is never lost.
        persistToGoIfChanged(
          supabaseRef.current,
          resolvedDbItemId,
          currentCartItem.is_to_go,
          currentState.isToGo,
        );

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

        // Backend sync is already handled above: updateItemInActiveOrder syncs
        // quantity + instructions (each deadline-wrapped via
        // updateOrderItemQuantity / updateOrderItem with toUpdateItemKey, and
        // queued on failure — useOrderStore.ts ~8243-8367), and setItemSeat syncs
        // the seat. The previous raw OrderService.updateOpenItem call here was a
        // REDUNDANT second sync of the same edit (keyless update_order_item_v2,
        // no deadline, fire-and-forget) — it double-wrote on good WiFi and hung
        // 30s+ on bad WiFi with no recovery. Removed: the path above is the
        // single, deadline-wrapped, offline-queue-backed writer.

        showToast({
          title: "Item Updated",
          message: `${currentCartItem.name} quantity updated to ${currentState.quantity}.`,
          type: "success",
        });
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

      const resolvedCashPrice =
        safeCashPrice ?? getCurrentItemCashPrice(baseItem);

      const selectedModifiers = modifiersItem?.modifiers
        ? Object.entries(sessionSelections)
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
          return;
        }
        // The modifier's cartItem is a snapshot captured when the sheet opened;
        // for a freshly-added item it can predate the backend sync and therefore
        // lack db_order_item_id even though the item has since synced. Re-read the
        // LIVE order-store item so we (a) don't wipe the linked db_order_item_id by
        // writing the stale snapshot back, and (b) can actually persist the TO GO
        // change instead of silently dropping it (the bug where an item shows
        // [TO GO] locally but is_to_go stays false on the server).
        const liveStoreItem = useOrderStore
          .getState()
          .ordersById[
            useOrderStore.getState().activeOrderId ?? ""
          ]?.items.find((i) => i.id === currentCartItem.id);
        const resolvedDbItemId =
          liveStoreItem?.db_order_item_id ?? currentCartItem.db_order_item_id;

        const updatedItem = {
          ...currentCartItem,
          db_order_item_id: resolvedDbItemId,
          quantity: currentState.quantity,
          price: currentTotal / Math.max(1, currentState.quantity),
          customizations: finalCustomizations,
          isDraft: false,
          is_to_go: currentState.isToGo,
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

        // Persist the per-item TO GO flag whenever it changed and the item has a
        // backend row (resolved fresh above). If it still has no db id (truly not
        // synced yet), addItemToBackend's reconcile fires the toggle when the id
        // lands, so the change is never lost.
        persistToGoIfChanged(
          supabaseRef.current,
          resolvedDbItemId,
          currentCartItem.is_to_go,
          currentState.isToGo,
        );

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
          is_to_go: currentState.isToGo,
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
    }, 0);
  }, []);

  const handleCancel = useCallback(() => {
    actionHandledRef.current = true;
    const {
      mode: currentMode,
      cartItem: cart,
      currentItem: item,
      close: closeModal,
    } = latestStateRef.current;
    closeModal();
    if (
      currentMode !== "edit" &&
      !(currentMode === "fullscreen" && cart) &&
      !cart &&
      item
    ) {
      const draftItemId = item.id;
      lastDraftMenuItemIdRef.current = null;
      // setTimeout(0), not runAfterInteractions — same reasoning as
      // handleSave: avoids batching with this screen's pending reveal/grow
      // handles which could delay cleanup past the next item's open().
      setTimeout(() => {
        removeDraftItems(draftItemId);
      }, 0);
    }
  }, []);

  // ============================================================================
  // RENDER
  // ============================================================================

  // IMPORTANT: These must be ABOVE early returns so hook count stays stable.
  const currentCategory = state.activeCategory
    ? (modifierCategoriesById.get(state.activeCategory) ?? null)
    : null;

  const optionsForCategory = currentCategory?.options ?? EMPTY_OPTIONS;

  // NOTE: the progressive option-reveal staircase (visibleOptionCount growing
  // 8 → 20 → 32 → … via InteractionManager + a 24ms timer) lived here and has
  // been removed. It restarted on EVERY open — including re-opening an item
  // that was just closed — and, like the secondary-sections reveal, its
  // runAfterInteractions callbacks were starved while the user kept tapping.
  // The FlashList below windows and recycles cells natively, so switching
  // items is a prop update over already-realized views instead of a mount.

  const activeCategoryId = currentCategory?.id ?? null;

  // Each cell subscribes to ITS OWN selection value in the selection store
  // (see SessionModifierOption) — a tap re-renders only the affected cells,
  // never this tree and never the whole list. renderOption therefore has no
  // selection dependency and stays referentially stable across taps.
  const renderOption = useCallback(
    ({ item: option }: { item: ModifierCategory["options"][number] }) => {
      if (!activeCategoryId) return null;
      return (
        <SessionModifierOption
          option={option}
          categoryId={activeCategoryId}
          isUnavailable={option.isAvailable === false}
          isReadOnly={isReadOnly}
          onToggle={handleModifierToggle}
          onLongPress={handleNoModifierToggle}
        />
      );
    },
    [
      activeCategoryId,
      isReadOnly,
      handleModifierToggle,
      handleNoModifierToggle,
    ],
  );

  const optionKeyExtractor = useCallback(
    (option: ModifierCategory["options"][number]) => option.id,
    [],
  );

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
            <ArrowLeft color={colors.label} size={s(16)} />
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
            This item is in the kitchen. Prep is locked, but you can still mark
            it to-go.
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

          {/* TO GO — still editable after the item has been sent. Persists via
              toggle_to_go_order_items, which bumps the order so the KDS re-fetches
              and shows/hides the TO GO pill. */}
          <View
            className="rounded-xl p-3 mt-3 w-full border flex-row items-center justify-between"
            style={{
              backgroundColor: colors.panel,
              borderColor: colors.border,
            }}
          >
            <View className="flex-1 pr-3">
              <Text
                className="text-sm font-semibold"
                style={{ color: colors.heading }}
              >
                TO GO
              </Text>
              <Text className="text-xs mt-0.5" style={{ color: colors.muted }}>
                Package this item to-go
              </Text>
            </View>
            <Switch
              // Drive the Switch from fast local reducer state, NOT the frozen
              // useModifierSidebarStore snapshot — `cartItem` is captured when
              // the sheet opens and never updates, so binding `value` to it made
              // the thumb animate forward then snap back (the "jolt") because the
              // controlled value re-read the stale snapshot. state.isToGo flips
              // instantly on dispatch. Mirrors the not-yet-sent toggle below.
              value={state.isToGo}
              onValueChange={(v) => {
                dispatch({ type: "SET_TOGO", payload: v });
                updateItemInActiveOrder({ ...cartItem, is_to_go: v });
                if (cartItem.db_order_item_id && supabaseRef.current) {
                  OrderService.toggleToGoOnItems(
                    supabaseRef.current,
                    [cartItem.db_order_item_id],
                    v,
                  ).catch(() => {
                    // Fire-and-forget: local flag is set; a later broadcast
                    // re-fetch reconciles the server state.
                  });
                }
              }}
              trackColor={{ false: colors.border, true: colors.teal }}
              thumbColor={colors.onSolid}
            />
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
          <ArrowLeft color={colors.label} size={s(16)} />
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
                paddingHorizontal: s(10),
                paddingVertical: s(4),
                borderRadius: s(12),
                backgroundColor: colors.teal + "20",
                borderWidth: 1,
                borderColor: colors.teal + "50",
              }}
            >
              <Text
                style={{
                  fontSize: s(11),
                  fontWeight: "600",
                  color: colors.teal,
                }}
              >
                {seatOverride === null ? "Shared" : `Seat ${seatOverride}`}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPressIn={handleCancel} className="p-1.5">
            <X color={colors.label} size={s(16)} />
          </TouchableOpacity>
          <TouchableOpacity
            onPressIn={handleSave}
            className="flex-row items-center gap-1.5 px-4 py-2 rounded-full"
            style={{ backgroundColor: colors.teal }}
          >
            <Check color={colors.onSolid} size={s(13)} strokeWidth={2.5} />
            <Text
              className="text-sm font-semibold"
              style={{ color: colors.onSolid }}
            >
              <SessionDoneTotal
                basePrice={basePrice}
                quantity={state.quantity}
                customModifiersTotal={customModifiersTotal}
                optionsById={optionsById}
              />
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Body is a flex column (not a ScrollView): the item header, seat
          picker and category tabs stay fixed at the top, the options grid
          flexes to fill whatever space is left (scrolling internally), and
          quantity / to-go / notes are pinned to the bottom — so they're always
          visible without scrolling on any screen size or ui-scale (this was the
          Landi C20Pro complaint). */}
      <View className="flex-1">
        {/* ── Item Header ─────────────────────────────────────────────────── */}
        <View
          className="flex-row items-center gap-3 px-4 py-3 border-b"
          style={{ borderColor: colors.border }}
        >
          {showMenuImages ? (
            <View
              style={{
                width: s(48),
                height: s(48),
                borderRadius: s(8),
                overflow: "hidden",
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              {resolvedImageSource ? (
                <OptimizedListImage
                  source={resolvedImageSource}
                  style={{ width: s(48), height: s(48) }}
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
        {shouldShowSeatPicker && (
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
              contentContainerStyle={{ gap: s(6) }}
            >
              <SeatPill
                seat={null}
                label="Shared"
                isSelected={seatOverride === null}
                onSelect={setSeatOverride}
              />
              {Array.from({ length: seatCount }, (_, i) => i + 1).map(
                (seat) => (
                  <SeatPill
                    key={seat}
                    seat={seat}
                    label={`Seat ${seat}`}
                    isSelected={seatOverride === seat}
                    onSelect={setSeatOverride}
                  />
                ),
              )}
            </ScrollView>
          </View>
        )}

        {/* ── Category Pill Tabs + options ────────────────────────────────── */}
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: s(16),
              paddingVertical: s(10),
              gap: s(6),
            }}
            style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
          >
            {hasModifiers &&
              menuItemForModifiers!.modifiers.map((category) => (
                <SessionCategoryTab
                  key={category.id}
                  category={category}
                  isActive={state.activeCategory === category.id}
                  onPress={handleCategoryTabPress}
                />
              ))}
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
                <Plus color={colors.teal} size={s(11)} strokeWidth={3} />
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

              {/* Options grid — FlashList recycles cells, so switching items
                  reuses the realized option views instead of mounting a new
                  set. No extraData: each cell subscribes to its own
                  selection in useModifierSelectionStore, so taps never
                  re-run the list.

                  Bounded height (NOT flex): the option cells use flex:1 for
                  their column WIDTH (5 per row), so a flex-filled grid on a
                  tall screen stretched them vertically into big ovals. A fixed
                  height keeps cells their natural size and scrolls internally;
                  the flex spacer below pins quantity/notes to the bottom. */}
              <View style={{ height: 320 }}>
                <FlashList
                  data={optionsForCategory}
                  numColumns={OPTION_COLUMNS}
                  renderItem={renderOption}
                  keyExtractor={optionKeyExtractor}
                  estimatedItemSize={60}
                  showsVerticalScrollIndicator={
                    optionsForCategory.length > OPTION_COLUMNS * 2
                  }
                  nestedScrollEnabled
                  contentContainerStyle={{ paddingBottom: s(2) }}
                />
              </View>
            </View>
          )}
        </View>

        {/* Spacer: absorbs leftover vertical space so quantity/notes stay
            pinned to the bottom (always visible without scrolling), no matter
            how tall the screen is — while the options grid keeps its natural,
            un-stretched size above. */}
        <View className="flex-1" />

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
                      <X color={colors.onSolid} size={s(10)} strokeWidth={3} />
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
                <Minus color={colors.heading} size={s(14)} />
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
                <Plus color={colors.onSolid} size={s(14)} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── TO GO ────────────────────────────────────────────────────────── */}
        <View
          className="px-4 py-3 border-t flex-row items-center justify-between"
          style={{ borderColor: colors.border }}
        >
          <View className="flex-1 pr-3">
            <Text
              className="text-sm font-semibold"
              style={{ color: colors.heading }}
            >
              TO GO
            </Text>
            <Text className="text-xs mt-0.5" style={{ color: colors.muted }}>
              Package this item to-go
            </Text>
          </View>
          <Switch
            value={state.isToGo}
            disabled={isReadOnly}
            onValueChange={(v) => dispatch({ type: "SET_TOGO", payload: v })}
            trackColor={{ false: colors.border, true: colors.teal }}
            thumbColor={colors.onSolid}
          />
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
            onFocus={handleNotesFocus}
          />
        </View>

        {/* ── Allergens ──────────────────────────────────────────────────── */}
        {menuItemForModifiers?.allergens &&
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
      </View>

      {/* ── Quantity Modal ──────────────────────────────────────────────── */}
      <Modal
        visible={state.isQuantityModalOpen}
        transparent
        animationType="none"
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
        animationType="none"
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
                <X color={colors.label} size={s(14)} />
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

const ModifierScreen = () => {
  return <ModifierScreenContent />;
};

export default memo(ModifierScreen);
