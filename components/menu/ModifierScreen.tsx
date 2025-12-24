import { useToast } from "@/contexts/ToastContext";
import { ModifierCategory } from "@/lib/types";
import { useMenuStore } from "@/stores/useMenuStore";
import { useModifierSidebarStore } from "@/stores/useModifierSidebarStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { ArrowLeft, Check, Minus, Plus, X } from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
  useReducer,
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
import { debounce } from "lodash"; // Add lodash if not already installed

interface ModifierSelection {
  [categoryId: string]: {
    [optionId: string]: boolean;
  };
}

// ============================================================================
// MEMOIZED SUB-COMPONENTS (Prevents unnecessary re-renders)
// ============================================================================

const CategoryTab = memo(({ 
  category, 
  isActive, 
  hasSelection, 
  onPress 
}: { 
  category: ModifierCategory; 
  isActive: boolean; 
  hasSelection: boolean; 
  onPress: () => void;
}) => (
  <TouchableOpacity
    onPress={onPress}
    className={`p-3 rounded-xl border-2 min-w-[140px] ${
      isActive
        ? "bg-blue-600 border-blue-400"
        : hasSelection
        ? "bg-green-600 border-green-400"
        : "bg-[#303030] border-gray-600"
    }`}
  >
    <View className="flex-row items-center justify-between mb-1.5">
      <Text className="font-semibold text-lg text-white">{category.name}</Text>
      {hasSelection && (
        <Check color={isActive ? "#FFFFFF" : "#10B981"} size={20} />
      )}
    </View>
    <Text
      className={`text-base ${
        category.type === "required" ? "text-red-400" : "text-gray-400"
      }`}
    >
      {category.type}
    </Text>
  </TouchableOpacity>
));

const ModifierOption = memo(({ 
  option, 
  categoryId,
  isSelected, 
  isUnavailable,
  isReadOnly,
  onToggle 
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
    onPress={() => onToggle(categoryId, option.id)}
    className={`p-4 rounded-xl border-2 min-w-[120px] ${
      isSelected
        ? "bg-blue-600 border-blue-400"
        : isUnavailable
        ? "bg-[#1a1a1a] border-gray-700"
        : "bg-[#303030] border-gray-600"
    }`}
  >
    <Text
      className={`text-xl font-medium text-center ${
        isSelected
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
        className={`text-lg text-center mt-1 ${
          isSelected ? "text-blue-200" : "text-blue-400"
        }`}
      >
        +${option.price.toFixed(2)}
      </Text>
    )}
  </TouchableOpacity>
));

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
  | { type: "INITIALIZE"; payload: Partial<State> }
  | { type: "TOGGLE_MODIFIER"; payload: { categoryId: string; optionId: string; category: ModifierCategory } };

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
        quantityInput: action.payload 
      };
    case "CLOSE_QUANTITY_MODAL":
      return { 
        ...state, 
        isQuantityModalOpen: false, 
        quantityInput: "" 
      };
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
        newSelections[categoryId][optionId] = !newSelections[categoryId][optionId];
      } else {
        const currentSelected = Object.values(newSelections[categoryId]).filter(Boolean).length;
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
  const {
    isOpen,
    mode,
    menuItem,
    cartItem,
    categoryId,
    close,
    precomputedModifiers,
    initialSelections: storeInitialSelections,
    itemPrice: precomputedItemPrice,
    activeModifierCategory: precomputedActiveCategory,
  } = useModifierSidebarStore();

  const {
    addItemToActiveOrder,
    updateItemInActiveOrder,
    removeItemFromActiveOrder,
    generateCartItemId,
  } = useOrderStore();

  const {
    getItemPriceForCategory,
    getMenuItemById,
    modifierGroups: allModifierGroups,
  } = useMenuStore();

  const { show } = useToast();

  // Use reducer for batched state updates
  const [state, dispatch] = useReducer(reducer, {
    quantity: 1,
    modifierSelections: {},
    notes: "",
    activeCategory: null,
    isQuantityModalOpen: false,
    quantityInput: "",
  });

  const lastDraftMenuItemIdRef = useRef<string | null>(null);
  const actionHandledRef = useRef(false);
  const draftItemIdRef = useRef<string | null>(null);
  const isInitializedRef = useRef(false);

  const isReadOnly = mode === "view";
  const currentItem = mode === "edit" || (mode === "fullscreen" && cartItem) ? cartItem : menuItem;

  // ============================================================================
  // MEMOIZED COMPUTATIONS (Only recalculate when necessary)
  // ============================================================================

  const getCurrentItemPrice = useCallback(
    (item: any) => {
      if (!item) return 0;
      if (precomputedItemPrice > 0) return precomputedItemPrice;
      if (categoryId && getItemPriceForCategory) {
        return getItemPriceForCategory(item?.id.split("_")[0] || "", categoryId);
      }
      return item.price || 0;
    },
    [precomputedItemPrice, getItemPriceForCategory, categoryId]
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
    const optionsMap = new Map<string, { option: any; categoryId: string; categoryName: string }>();

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
  }, [state.quantity, state.modifierSelections, currentItem, optionsById, getCurrentItemPrice]);

  // ============================================================================
  // DEBOUNCED DRAFT UPDATE (Critical optimization!)
  // ============================================================================

  const updateDraftItemDebounced = useMemo(
    () =>
      debounce((quantity, modifierSelections, notes, currentItem) => {
        if (!isOpen || !currentItem || mode === "edit" || cartItem) return;

        const { activeOrderId, ordersById, updateItemInActiveOrder } = useOrderStore.getState();
        const activeOrder = activeOrderId ? ordersById[activeOrderId] : null;
        const draftItem = activeOrder?.items.find((item) => item.id === draftItemIdRef.current);

        if (!draftItem) return;

        const selectedModifiers = menuItemForModifiers?.modifiers
          ? Object.entries(modifierSelections).map(([categoryId, selections]) => {
              const category = modifierCategoriesById.get(categoryId);
              const selectedOptions = Object.entries(selections)
                .filter(([_, isSelected]) => isSelected)
                .map(([optionId]) => {
                  const optionData = optionsById.get(optionId);
                  return {
                    id: optionId,
                    name: optionData?.option.name || "",
                    price: optionData?.option.price || 0,
                  };
                });

              return {
                categoryId,
                categoryName: category?.name || "",
                options: selectedOptions,
              };
            })
          : [];

        let baseTotal = getCurrentItemPrice(currentItem);
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
      }, 200), // Update after 300ms of no changes
    [isOpen, mode, cartItem, menuItemForModifiers, modifierCategoriesById, optionsById, getCurrentItemPrice]
  );

  // Trigger debounced update
  useEffect(() => {
    updateDraftItemDebounced(state.quantity, state.modifierSelections, state.notes, currentItem);
  }, [state.quantity, state.modifierSelections, state.notes, currentItem, updateDraftItemDebounced]);

  // ============================================================================
  // INITIALIZATION (Optimized to run only once)
  // ============================================================================

  useEffect(() => {
    if (!isOpen || !currentItem || isInitializedRef.current) return;

    actionHandledRef.current = false;
    isInitializedRef.current = true;

    const initialState: Partial<State> = {
      quantity: mode === "edit" || (mode === "fullscreen" && cartItem) ? cartItem!.quantity : 1,
      notes: mode === "edit" || (mode === "fullscreen" && cartItem) ? cartItem!.customizations.notes || "" : "",
    };

    // Use pre-computed selections if available
    if (storeInitialSelections) {
      initialState.modifierSelections = storeInitialSelections;
      if (precomputedActiveCategory) {
        initialState.activeCategory = precomputedActiveCategory;
      }
    } else {
      // Fallback: compute selections
      const initialSelections: ModifierSelection = {};
      if (menuItemForModifiers?.modifiers) {
        menuItemForModifiers.modifiers.forEach((category) => {
          initialSelections[category.id] = {};

          if ((mode === "edit" || (mode === "fullscreen" && cartItem)) && cartItem) {
            const existingModifier = cartItem.customizations.modifiers?.find(
              (mod) => mod.categoryId === category.id
            );

            if (existingModifier) {
              existingModifier.options.forEach((selectedOption) => {
                initialSelections[category.id][selectedOption.id] = true;
              });
            }

            category.options.forEach((option) => {
              if (!initialSelections[category.id][option.id]) {
                initialSelections[category.id][option.id] = false;
              }
            });
          } else {
            if (category.type === "required" && category.selectionType === "single") {
              const firstAvailableOption = category.options.find((option) => option.isAvailable !== false);
              if (firstAvailableOption) {
                initialSelections[category.id][firstAvailableOption.id] = true;
              }
            }

            category.options.forEach((option) => {
              if (!initialSelections[category.id][option.id]) {
                initialSelections[category.id][option.id] = false;
              }
            });
          }
        });

        if (menuItemForModifiers.modifiers.length > 0) {
          initialState.activeCategory = menuItemForModifiers.modifiers[0].id;
        }
      }
      initialState.modifierSelections = initialSelections;
    }

    dispatch({ type: "INITIALIZE", payload: initialState });

    // Create draft item if needed
    if (mode !== "edit" && !cartItem) {
      const { activeOrderId, ordersById } = useOrderStore.getState();
      const activeOrder = activeOrderId ? ordersById[activeOrderId] : null;
      const stableDraftId = `draft_${currentItem.id}`;

      const existingStableDraft = activeOrder?.items.find((item) => item.id === stableDraftId);
      if (existingStableDraft) {
        draftItemIdRef.current = existingStableDraft.id;
        lastDraftMenuItemIdRef.current = currentItem.id;
        return;
      }

      const existingItem = activeOrder?.items.find((item) => {
        if (item.menuItemId !== currentItem.id) return false;
        const hasModifiers = item.customizations.modifiers && item.customizations.modifiers.length > 0;
        const hasNotes = item.customizations.notes && item.customizations.notes.trim() !== "";
        const hasSent = item.kitchen_status === "sent";
        return !hasModifiers && !hasNotes && !hasSent;
      });

      if (!existingItem) {
        const itemPrice = getCurrentItemPrice(currentItem);
        const draftItem = {
          id: stableDraftId,
          menuItemId: currentItem.id,
          name: currentItem.name,
          quantity: 1,
          originalPrice: itemPrice,
          price: itemPrice,
          image: currentItem.image,
          isDraft: true,
          customizations: { modifiers: [], notes: "" },
          availableDiscount: currentItem.availableDiscount,
          appliedDiscount: null,
          paidQuantity: 0,
        };

        addItemToActiveOrder(draftItem);
        draftItemIdRef.current = draftItem.id;
        lastDraftMenuItemIdRef.current = currentItem.id;
      }
    }

    return () => {
      isInitializedRef.current = false;
    };
  }, [isOpen, currentItem, mode, cartItem]);

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
    const switchedToDifferentMenuItem = !!menuItem && menuItem.id !== previousDraftMenuItemId;

    if (switchedToEditExisting || switchedToDifferentMenuItem) {
      const { activeOrderId, ordersById, removeItemFromActiveOrder } = useOrderStore.getState();
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
  // HANDLERS
  // ============================================================================

  const handleModifierToggle = useCallback(
    (categoryId: string, optionId: string) => {
      if (isReadOnly) return;
      const category = modifierCategoriesById.get(categoryId);
      if (!category) return;
      dispatch({ type: "TOGGLE_MODIFIER", payload: { categoryId, optionId, category } });
    },
    [isReadOnly, modifierCategoriesById]
  );

  const handleQuantityPress = useCallback(() => {
    if (isReadOnly) return;
    dispatch({ type: "OPEN_QUANTITY_MODAL", payload: state.quantity.toString() });
  }, [isReadOnly, state.quantity]);

  const handleQuantitySubmit = useCallback(() => {
    const newQuantity = parseInt(state.quantityInput, 10);
    if (newQuantity && newQuantity > 0) {
      dispatch({ type: "SET_QUANTITY", payload: newQuantity });
    }
    dispatch({ type: "CLOSE_QUANTITY_MODAL" });
  }, [state.quantityInput]);

  const handleQuantityCancel = useCallback(() => {
    dispatch({ type: "CLOSE_QUANTITY_MODAL" });
  }, []);

  const handleSave = useCallback(() => {
    actionHandledRef.current = true;
    const baseItem = menuItem || menuItemForModifiers;
    if (!baseItem) return;

    if (menuItemForModifiers?.modifiers && menuItemForModifiers.modifiers.length > 0) {
      const hasRequiredSelections = menuItemForModifiers.modifiers.every((category) => {
        if (category.type === "required") {
          return Object.values(state.modifierSelections[category.id] || {}).some(Boolean);
        }
        return true;
      });

      if (!hasRequiredSelections) {
        show({
          title: "Missing Selections",
          message: "Please select all required options before proceeding.",
          type: "error",
        });
        return;
      }
    }

    const selectedModifiers = menuItemForModifiers?.modifiers
      ? Object.entries(state.modifierSelections)
          .map(([categoryId, selections]) => {
            const category = modifierCategoriesById.get(categoryId);
            const selectedOptions = Object.entries(selections)
              .filter(([_, isSelected]) => isSelected)
              .map(([optionId]) => {
                const optionData = optionsById.get(optionId);
                return {
                  id: optionId,
                  name: optionData?.option.name || "",
                  price: optionData?.option.price || 0,
                };
              });

            return {
              categoryId,
              categoryName: category?.name || "",
              options: selectedOptions,
            };
          })
          .filter((mod) => mod.options.length > 0)
      : [];

    const finalCustomizations = {
      modifiers: selectedModifiers,
      notes: state.notes,
    };

    if (mode === "edit" || (mode === "fullscreen" && cartItem)) {
      if (!cartItem) return;
      const updatedItem = {
        ...cartItem,
        quantity: state.quantity,
        price: total / Math.max(1, state.quantity),
        customizations: finalCustomizations,
        isDraft: false,
      };

      updateItemInActiveOrder(updatedItem);
      show({
        title: "Item Updated",
        message: `Your changes to ${currentItem?.name} have been saved.`,
        type: "success",
      });
    } else {
      const { activeOrderId, ordersById } = useOrderStore.getState();
      const activeOrder = activeOrderId ? ordersById[activeOrderId] : null;

      const coursingState = require("@/stores/useCoursingStore").useCoursingStore.getState();
      const currentCourse = coursingState.getForOrder(activeOrderId)?.currentCourse ?? 1;

      const existingItem = activeOrder?.items.find((item) => {
        if (item.menuItemId !== baseItem.id) return false;

        const existingItemCourse =
          coursingState.getForOrder(activeOrderId)?.itemCourseMap?.[item.id] ?? 1;
        if (existingItemCourse !== currentCourse) return false;

        const itemCustomizations = item.customizations;
        const currentCustomizations = finalCustomizations;

        const itemModifiers = itemCustomizations.modifiers || [];
        const currentModifiers = currentCustomizations.modifiers || [];

        if (itemModifiers.length !== currentModifiers.length) return false;

        for (let i = 0; i < itemModifiers.length; i++) {
          const itemMod = itemModifiers[i];
          const currentMod = currentModifiers[i];

          if (itemMod.categoryId !== currentMod.categoryId) return false;
          if (itemMod.options.length !== currentMod.options.length) return false;

          for (let j = 0; j < itemMod.options.length; j++) {
            if (itemMod.options[j].id !== currentMod.options[j].id) return false;
          }
        }

        const itemNotes = (itemCustomizations.notes || "").trim();
        const currentNotes = (currentCustomizations.notes || "").trim();
        if (itemNotes !== currentNotes) return false;

        return true;
      });

      if (existingItem) {
        const draftItems = activeOrder?.items.filter(
          (item) => item.isDraft && item.menuItemId === baseItem.id
        );

        if (draftItems && draftItems.length > 0) {
          draftItems.forEach((draftItem) => {
            removeItemFromActiveOrder(draftItem.id);
          });
        }

        const confirmedItem = {
          id: generateCartItemId(baseItem.id, finalCustomizations),
          menuItemId: baseItem.id,
          name: baseItem.name,
          quantity: state.quantity,
          originalPrice: baseItem.price,
          price: total / Math.max(1, state.quantity),
          image: baseItem.image,
          customizations: finalCustomizations,
          availableDiscount: baseItem.availableDiscount,
          appliedDiscount: null,
          paidQuantity: 0,
          isDraft: false,
        };
        addItemToActiveOrder(confirmedItem);
        show({
          title: "Item Added",
          message: `${baseItem.name} has been successfully added to your order.`,
          type: "success",
        });
      } else {
        const newItem = {
          id: generateCartItemId(baseItem.id, finalCustomizations),
          menuItemId: baseItem.id,
          name: baseItem.name,
          quantity: state.quantity,
          originalPrice: baseItem.price,
          price: total / Math.max(1, state.quantity),
          image: baseItem.image,
          customizations: finalCustomizations,
          availableDiscount: baseItem.availableDiscount,
          appliedDiscount: null,
          paidQuantity: 0,
          isDraft: false,
        };
        addItemToActiveOrder(newItem);
        show({
          title: "Item Added",
          message: `${baseItem.name} has been successfully added to your order.`,
          type: "success",
        });
      }
    }

    close();
  }, [
    currentItem,
    cartItem,
    menuItem,
    menuItemForModifiers,
    state.modifierSelections,
    state.quantity,
    state.notes,
    total,
    mode,
    close,
    addItemToActiveOrder,
    updateItemInActiveOrder,
    generateCartItemId,
    show,
    modifierCategoriesById,
    optionsById,
  ]);

  const handleCancel = useCallback(() => {
    actionHandledRef.current = true;
    if (mode !== "edit" && !(mode === "fullscreen" && cartItem) && !cartItem && currentItem) {
      const { activeOrderId, orders, removeItemFromActiveOrder } = useOrderStore.getState();
      const activeOrder = orders.find((o) => o.id === activeOrderId);

      const draftItems = activeOrder?.items.filter(
        (item) => item.isDraft && item.menuItemId === currentItem.id
      );

      if (draftItems && draftItems.length > 0) {
        draftItems.forEach((draftItem) => {
          removeItemFromActiveOrder(draftItem.id);
        });
      }
      lastDraftMenuItemIdRef.current = null;
    }
    close();
  }, [close, mode, cartItem, currentItem]);

  // ============================================================================
  // RENDER
  // ============================================================================

  if (cartItem?.kitchen_status === "sent") {
    return (
      <View className="flex-1 bg-[#212121]">
        <View className="flex-row items-center justify-between p-4 border-b border-gray-700 bg-[#212121]">
          <TouchableOpacity onPress={close} className="flex-row items-center">
            <ArrowLeft color="#9CA3AF" size={20} />
            <Text className="text-xl font-medium text-white ml-1.5">Back to Bill</Text>
          </TouchableOpacity>
        </View>
        <View className="flex-1 items-center justify-center p-6 w-full">
          <View className="items-center w-full">
            <Text className="text-2xl font-bold text-white text-center mb-3">Item Already Sent</Text>
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
                  <Text className="text-xl font-semibold text-white">{cartItem.name}</Text>
                  <Text className="text-base text-gray-400">Quantity: {cartItem.quantity}</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity onPress={close} className="mt-6 bg-blue-600 px-6 py-3 rounded-xl">
              <Text className="text-lg font-semibold text-white">Back to Bill</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (!isOpen || !currentItem) return null;

  const currentCategory = menuItemForModifiers?.modifiers?.find((cat) => cat.id === state.activeCategory);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-[#212121]"
    >
      <View className="flex-row items-center justify-between p-4 border-b border-gray-700 bg-[#212121]">
        <TouchableOpacity onPress={handleCancel} className="flex-row items-center">
          <ArrowLeft color="#9CA3AF" size={20} />
          <Text className="text-xl font-medium text-white ml-1.5">
            {mode === "edit" || (mode === "fullscreen" && cartItem) ? "Back to Bill" : "Back to Menu"}
          </Text>
        </TouchableOpacity>
        <View className="flex-row items-center gap-x-3">
          <TouchableOpacity onPress={handleCancel} className="p-2 px-4 rounded-lg bg-red-600">
            <X color="white" size={23} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
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
            <Image source={require("@/assets/images/classic_burger.png")} className="w-20 h-20 rounded-lg" />
            <View className="flex-1">
              <Text className="text-2xl font-bold text-white">{currentItem.name}</Text>
              <Text className="text-lg text-gray-400 mt-0.5">{menuItemForModifiers?.description}</Text>
              <Text className="text-xl font-semibold text-blue-400 mt-1">
                Base ${getCurrentItemPrice(currentItem).toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        {menuItemForModifiers?.modifiers && menuItemForModifiers.modifiers.length > 0 && (
          <View className="p-4">
            <Text className="text-2xl font-bold text-white mb-3">Options</Text>
            <View className="flex-row flex-wrap gap-3 mb-4">
              {menuItemForModifiers.modifiers.map((category) => {
                const hasSelection = Object.values(state.modifierSelections[category.id] || {}).some(Boolean);
                const isActive = state.activeCategory === category.id;
                return (
                  <CategoryTab
                    key={category.id}
                    category={category}
                    isActive={isActive}
                    hasSelection={hasSelection}
                    onPress={() => dispatch({ type: "SET_ACTIVE_CATEGORY", payload: category.id })}
                  />
                );
              })}
            </View>

            {currentCategory && (
              <View className="mb-4">
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-xl font-semibold text-white">{currentCategory.name}</Text>
                  <View className="flex-row items-center gap-2">
                    <Text className="text-lg text-red-400">
                      {currentCategory.type === "required" ? "Required" : "Optional"}
                    </Text>
                    <Text className="text-lg text-gray-400">{currentCategory.selectionType}</Text>
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-3">
                  {currentCategory.options.map((option) => {
                    const isSelected = state.modifierSelections[currentCategory.id]?.[option.id] || false;
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
          <Text className="text-xl font-semibold text-white mb-3">Quantity</Text>
          <View className="flex-row items-center justify-center">
            <TouchableOpacity
              disabled={isReadOnly}
              onPress={() => dispatch({ type: "SET_QUANTITY", payload: Math.max(1, state.quantity - 1) })}
              className="p-3 border border-gray-600 rounded-full bg-[#303030]"
            >
              <Minus color="#9CA3AF" size={20} />
            </TouchableOpacity>
            <TouchableOpacity disabled={isReadOnly} onPress={handleQuantityPress} className="mx-12 w-14">
              <Text className="text-3xl border rounded-lg p-1 border-gray-600 font-bold text-white text-center">
                {state.quantity}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={isReadOnly}
              onPress={() => dispatch({ type: "SET_QUANTITY", payload: state.quantity + 1 })}
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
            onChangeText={(text) => dispatch({ type: "SET_NOTES", payload: text })}
            placeholder="No onions..."
            multiline
            maxLength={80}
            className="px-4 py-3 border border-gray-600 rounded-lg bg-[#303030] min-h-[80px] text-xl text-white"
            placeholderTextColor={"#6B7280"}
          />
          <Text className="text-base text-gray-400 mt-1.5 text-right">{state.notes.length}/80</Text>
        </View>

        {menuItemForModifiers?.allergens && menuItemForModifiers.allergens.length > 0 && (
          <View className="p-4 border-b border-gray-700">
            <Text className="text-xl font-semibold text-white mb-3">Allergens</Text>
            <View className="flex-row flex-wrap gap-2">
              {menuItemForModifiers.allergens.map((allergen) => (
                <View key={allergen} className="px-3 py-2 bg-red-900 rounded-full">
                  <Text className="text-lg text-red-300">{allergen}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View className="p-4">
          <View className="flex-row justify-between items-center bg-[#303030] p-4 rounded-lg">
            <Text className="text-2xl font-semibold text-white">Total</Text>
            <Text className="text-3xl font-bold text-white">${total.toFixed(2)}</Text>
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
            <Text className="text-xl font-semibold text-white mb-3 text-center">Enter Quantity</Text>
            <TextInput
              value={state.quantityInput}
              onChangeText={(text) => dispatch({ type: "SET_NOTES", payload: text })}
              keyboardType="numeric"
              autoFocus
              className="p-3 border border-gray-600 rounded-lg bg-[#212121] text-xl text-white text-center mb-4 h-16"
            />
            <View className="flex-row gap-3">
              <TouchableOpacity onPress={handleQuantityCancel} className="flex-1 py-3 px-4 bg-gray-600 rounded-lg">
                <Text className="text-lg font-semibold text-white text-center">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleQuantitySubmit} className="flex-1 py-3 px-4 bg-blue-500 rounded-lg">
                <Text className="text-lg font-semibold text-white text-center">Set</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

export default ModifierScreen;