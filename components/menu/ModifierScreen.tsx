import { ModifierCategory } from "@/lib/types";
import { useMenuStore } from "@/stores/useMenuStore";
import { useModifierSidebarStore } from "@/stores/useModifierSidebarStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { ArrowLeft, Check, Minus, Plus, X } from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Image,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface ModifierSelection {
  [categoryId: string]: {
    [optionId: string]: boolean;
  };
}

const ModifierScreen = () => {
  const { isOpen, mode, menuItem, cartItem, categoryId, close } =
    useModifierSidebarStore();
  const {
    addItemToActiveOrder,
    updateItemInActiveOrder,
    removeItemFromActiveOrder,
    confirmDraftItem,
    generateCartItemId,
  } = useOrderStore();
  const {
    getItemPriceForCategory,
    menuItems,
    modifierGroups: allModifierGroups,
  } = useMenuStore();
  // Note: do not early-return before hooks; render read-only view after hooks below if needed
  // Internal state for the form
  const [quantity, setQuantity] = useState(1);
  const [modifierSelections, setModifierSelections] =
    useState<ModifierSelection>({});
  const [notes, setNotes] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [isQuantityModalOpen, setIsQuantityModalOpen] = useState(false);
  const [quantityInput, setQuantityInput] = useState("");
  const lastDraftMenuItemIdRef = useRef<string | null>(null);

  const isReadOnly = mode === "view";

  const handleQuantityPress = () => {
    if (isReadOnly) return;
    setQuantityInput(quantity.toString());
    setIsQuantityModalOpen(true);
  };

  const handleQuantitySubmit = () => {
    const newQuantity = parseInt(quantityInput, 10);
    if (newQuantity && newQuantity > 0) {
      setQuantity(newQuantity);
    }
    setIsQuantityModalOpen(false);
  };

  const handleQuantityCancel = () => {
    setIsQuantityModalOpen(false);
    setQuantityInput("");
  };

  const currentItem =
    mode === "edit" || (mode === "fullscreen" && cartItem)
      ? cartItem
      : menuItem;

  // Get the correct price for the current item based on category

  const getCurrentItemPrice = useCallback(
    (item: any) => {
      if (!item) return 0;

      // If we have a categoryId and the item has custom pricing, use it
      if (categoryId && getItemPriceForCategory) {
        return getItemPriceForCategory(
          item?.id.split("_")[0] || "",
          categoryId
        );
      }
      // Otherwise use the default price
      return item.price || 0;
    },
    [getItemPriceForCategory, categoryId]
  );

  // Get the menu item for modifier access (either directly or from cart item)
  const baseMenuItem =
    menuItem || menuItems.find((mi) => mi.id === cartItem?.menuItemId);

  // Use the IDs from the baseMenuItem to look up the full modifier group objects
  const menuItemForModifiers = useMemo(() => {
    if (!baseMenuItem || !baseMenuItem.modifierGroupIds) return null;
    const modifiers = baseMenuItem.modifierGroupIds
      .map((id) => allModifierGroups.find((mg) => mg.id === id))
      .filter((mg): mg is ModifierCategory => !!mg);
    return { ...baseMenuItem, modifiers };
  }, [baseMenuItem, allModifierGroups]);

  // Initialize form when screen opens
  useEffect(() => {
    if (isOpen && currentItem) {
      setQuantity(
        mode === "edit" || (mode === "fullscreen" && cartItem)
          ? cartItem!.quantity
          : 1
      );
      setNotes(
        mode === "edit" || (mode === "fullscreen" && cartItem)
          ? cartItem!.customizations.notes || ""
          : ""
      );

      // Initialize modifier selections
      const initialSelections: ModifierSelection = {};
      if (menuItemForModifiers?.modifiers) {
        menuItemForModifiers.modifiers.forEach((category) => {
          initialSelections[category.id] = {};

          if (
            (mode === "edit" || (mode === "fullscreen" && cartItem)) &&
            cartItem
          ) {
            // For edit mode (both sidebar and fullscreen), restore the existing selections from the cart item
            const existingModifier = cartItem.customizations.modifiers?.find(
              (mod) => mod.categoryId === category.id
            );

            if (existingModifier) {
              // Mark the existing selections as true
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
            // For add mode, set default selections for required categories
            if (
              category.type === "required" &&
              category.selectionType === "single"
            ) {
              // For required single selection, select the first available option
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

        // Set first category as active if available
        if (menuItemForModifiers.modifiers.length > 0) {
          setActiveCategory(menuItemForModifiers.modifiers[0].id);
        }
      }
      setModifierSelections(initialSelections);

      // Add draft item to cart when opening for new items (not edit mode)
      if (mode !== "edit" && !cartItem) {
        // Check if there's already an existing item with the same menuItemId and empty customizations
        const { activeOrderId, orders } = useOrderStore.getState();
        const activeOrder = orders.find((o) => o.id === activeOrderId);

        const existingItem = activeOrder?.items.find((item) => {
          if (item.menuItemId !== currentItem.id) return false;
          if (item.isDraft) return false; // Don't match other draft items

          // Check if customizations are empty (no modifiers, no notes)
          const hasModifiers =
            item.customizations.modifiers &&
            item.customizations.modifiers.length > 0;
          const hasNotes =
            item.customizations.notes &&
            item.customizations.notes.trim() !== "";
          const hasSent = item.kitchen_status === "sent";

          return !hasModifiers && !hasNotes && !hasSent;
        });

        // Only create draft item if no existing item with same customizations
        if (!existingItem) {
          const itemPrice = getCurrentItemPrice(currentItem);
          const draftItem = {
            id: generateCartItemId(
              currentItem.id,
              { modifiers: [], notes: "" },
              true
            ),
            menuItemId: currentItem.id,
            name: currentItem.name,
            quantity: 1,
            originalPrice: itemPrice,
            price: itemPrice,
            image: currentItem.image,
            isDraft: true,
            customizations: {
              modifiers: [],
              notes: "",
            },
            availableDiscount: currentItem.availableDiscount,
            appliedDiscount: null,
            paidQuantity: 0,
          };
          addItemToActiveOrder(draftItem);
          // Track last created draft's menu item for cleanup if user switches context
          lastDraftMenuItemIdRef.current = currentItem.id;
        }
      }
    }
  }, [isOpen, currentItem, mode, cartItem]);

  // Update draft item in real-time as user makes changes
  useEffect(() => {
    if (isOpen && currentItem && mode !== "edit" && !cartItem) {
      // Find the draft item we created
      const { activeOrderId, orders, updateItemInActiveOrder } =
        useOrderStore.getState();
      const activeOrder = orders.find((o) => o.id === activeOrderId);
      const draftItem = activeOrder?.items.find((item) =>
        item.id.startsWith(`draft_${currentItem.id}_`)
      );

      if (draftItem) {
        // Convert modifier selections to the format expected by the order system
        const selectedModifiers = menuItemForModifiers?.modifiers
          ? Object.entries(modifierSelections).map(
              ([categoryId, selections]) => {
                const category = menuItemForModifiers.modifiers?.find(
                  (cat) => cat.id === categoryId
                );
                const selectedOptions = Object.entries(selections)
                  .filter(([_, isSelected]) => isSelected)
                  .map(([optionId, _]) => {
                    const option = category?.options.find(
                      (opt) => opt.id === optionId
                    );
                    return {
                      id: optionId,
                      name: option?.name || "",
                      price: option?.price || 0,
                    };
                  });

                return {
                  categoryId,
                  categoryName: category?.name || "",
                  options: selectedOptions,
                };
              }
            )
          : [];

        // Calculate total price
        let baseTotal = getCurrentItemPrice(currentItem);
        selectedModifiers.forEach((modifier) => {
          modifier.options.forEach((option) => {
            baseTotal += option.price;
          });
        });

        // Update the draft item; price is per-unit. baseTotal already reflects per-unit cost
        const updatedDraftItem = {
          ...draftItem,
          quantity,
          price: baseTotal,
          customizations: {
            modifiers: selectedModifiers,
            notes,
          },
        };
        console.log("i am creating the problemm in useffect");

        updateItemInActiveOrder(updatedDraftItem);
      }
    }
  }, [
    quantity,
    modifierSelections,
    notes,
    isOpen,
    currentItem,
    mode,
    cartItem,
  ]);

  // Remove any previously created draft if user navigates away to another item or enters edit mode
  useEffect(() => {
    const previousDraftMenuItemId = lastDraftMenuItemIdRef.current;
    if (!previousDraftMenuItemId) return;

    // If switched to edit mode for an existing cart item, or switched to a different menu item, clean up the old draft
    const switchedToEditExisting = mode === "edit" && !!cartItem;
    const switchedToDifferentMenuItem =
      !!menuItem && menuItem.id !== previousDraftMenuItemId;

    if (switchedToEditExisting || switchedToDifferentMenuItem) {
      const { activeOrderId, orders, removeItemFromActiveOrder } =
        useOrderStore.getState();
      const activeOrder = orders.find((o) => o.id === activeOrderId);
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

  // Calculate total price
  const total = useMemo(() => {
    if (!currentItem) return 0;

    let baseTotal = getCurrentItemPrice(currentItem);

    // Add modifier costs
    Object.values(modifierSelections).forEach((categorySelections) => {
      Object.entries(categorySelections).forEach(([optionId, isSelected]) => {
        if (isSelected) {
          // Find the option and add its price
          menuItemForModifiers?.modifiers?.forEach((category) => {
            const option = category.options.find((opt) => opt.id === optionId);
            if (option) {
              baseTotal += option.price;
            }
          });
        }
      });
    });

    return baseTotal * quantity;
  }, [quantity, modifierSelections, currentItem]);

  const handleModifierToggle = useCallback(
    (categoryId: string, optionId: string) => {
      if (isReadOnly) return;

      setModifierSelections((prev) => {
        const category = menuItemForModifiers?.modifiers?.find(
          (cat) => cat.id === categoryId
        );
        if (!category) return prev;

        const newSelections = { ...prev };
        if (!newSelections[categoryId]) {
          newSelections[categoryId] = {};
        }

        if (category.selectionType === "single") {
          // For single selection, clear all others in this category
          Object.keys(newSelections[categoryId]).forEach((key) => {
            newSelections[categoryId][key] = false;
          });
          newSelections[categoryId][optionId] =
            !newSelections[categoryId][optionId];
        } else {
          // For multiple selection, check limits
          const currentSelected = Object.values(
            newSelections[categoryId]
          ).filter(Boolean).length;
          const isCurrentlySelected = newSelections[categoryId][optionId];

          if (
            !isCurrentlySelected &&
            category.maxSelections &&
            currentSelected >= category.maxSelections
          ) {
            // Don't allow selection if max reached
            return prev;
          }

          newSelections[categoryId][optionId] = !isCurrentlySelected;
        }

        return newSelections;
      });
    },
    [isReadOnly, currentItem]
  );

  const handleSave = useCallback(() => {
    // Use the base menu item for consistent checks
    const baseItem = menuItem || menuItemForModifiers;
    if (!baseItem) return;

    // Validate required selections
    if (
      menuItemForModifiers?.modifiers &&
      menuItemForModifiers.modifiers.length > 0
    ) {
      const hasRequiredSelections = menuItemForModifiers.modifiers.every(
        (category) => {
          if (category.type === "required") {
            return Object.values(modifierSelections[category.id] || {}).some(
              Boolean
            );
          }
          return true;
        }
      );

      if (!hasRequiredSelections) {
        toast.error("Please select all required options", {
          duration: 4000,
          position: ToastPosition.BOTTOM,
        });
        return;
      }
    }

    // Convert modifier selections to the format expected by the order system
    const selectedModifiers = menuItemForModifiers?.modifiers
      ? Object.entries(modifierSelections).map(([categoryId, selections]) => {
          const category = menuItemForModifiers.modifiers?.find(
            (cat) => cat.id === categoryId
          );
          const selectedOptions = Object.entries(selections)
            .filter(([_, isSelected]) => isSelected)
            .map(([optionId, _]) => {
              const option = category?.options.find(
                (opt) => opt.id === optionId
              );
              return {
                id: optionId,
                name: option?.name || "",
                price: option?.price || 0,
              };
            });

          return {
            categoryId,
            categoryName: category?.name || "",
            options: selectedOptions,
          };
        })
      : [];

    const finalCustomizations = {
      // size: selectedSize, // If you have size selection
      modifiers: selectedModifiers,
      notes,
    };

    if (mode === "edit" || (mode === "fullscreen" && cartItem)) {
      // --- UPDATE EXISTING CART ITEM ---
      if (!cartItem) return;
      const updatedItem = {
        ...cartItem,
        quantity,
        price: total / Math.max(1, quantity),
        customizations: finalCustomizations,
        isDraft: false, // Ensure it's not a draft anymore
      };
      console.log("i am crete teh problem in handle save");

      updateItemInActiveOrder(updatedItem);
      toast.success(`Updated ${currentItem?.name}`, {
        position: ToastPosition.BOTTOM,
      });
    } else {
      // --- ADD NEW ITEM TO CART ---
      const { activeOrderId, orders } = useOrderStore.getState();
      const activeOrder = orders.find((o) => o.id === activeOrderId);

      // Get current course from coursing store
      const coursingState =
        require("@/stores/useCoursingStore").useCoursingStore.getState();
      const currentCourse =
        coursingState.getForOrder(activeOrderId)?.currentCourse ?? 1;

      // Look for existing item (draft or confirmed) with same menuItemId, customizations, AND course
      const existingItem = activeOrder?.items.find((item) => {
        if (item.menuItemId !== baseItem.id) return false;

        // Check if they're in the same course
        const existingItemCourse =
          coursingState.getForOrder(activeOrderId)?.itemCourseMap?.[item.id] ??
          1;
        if (existingItemCourse !== currentCourse) return false;

        // Check if customizations match
        const itemCustomizations = item.customizations;
        const currentCustomizations = finalCustomizations;

        // Compare modifiers
        const itemModifiers = itemCustomizations.modifiers || [];
        const currentModifiers = currentCustomizations.modifiers || [];

        if (itemModifiers.length !== currentModifiers.length) return false;

        // Check each modifier category
        for (let i = 0; i < itemModifiers.length; i++) {
          const itemMod = itemModifiers[i];
          const currentMod = currentModifiers[i];

          if (itemMod.categoryId !== currentMod.categoryId) return false;
          if (itemMod.options.length !== currentMod.options.length)
            return false;

          // Check each option
          for (let j = 0; j < itemMod.options.length; j++) {
            if (itemMod.options[j].id !== currentMod.options[j].id)
              return false;
          }
        }

        // Compare notes
        const itemNotes = (itemCustomizations.notes || "").trim();
        const currentNotes = (currentCustomizations.notes || "").trim();
        if (itemNotes !== currentNotes) return false;

        return true;
      });

      if (existingItem) {
        // First, remove any draft items for this menu item to prevent orphaned drafts
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
          quantity,
          originalPrice: baseItem.price,
          price: total / Math.max(1, quantity),
          image: baseItem.image,
          customizations: finalCustomizations,
          availableDiscount: baseItem.availableDiscount,
          appliedDiscount: null,
          paidQuantity: 0,
          isDraft: false,
        };

        addItemToActiveOrder(confirmedItem);
        toast.success(`Added ${baseItem.name}`, {
          position: ToastPosition.BOTTOM,
        });
      } else {
        // Or add a completely new item if no draft was found
        const newItem = {
          id: generateCartItemId(baseItem.id, finalCustomizations),
          menuItemId: baseItem.id,
          name: baseItem.name,
          quantity,
          originalPrice: baseItem.price,
          price: total / Math.max(1, quantity),
          image: baseItem.image,
          customizations: finalCustomizations,
          availableDiscount: baseItem.availableDiscount,
          appliedDiscount: null,
          paidQuantity: 0,
          isDraft: false,
        };
        addItemToActiveOrder(newItem);
        toast.success(`Added ${baseItem.name}`, {
          position: ToastPosition.BOTTOM,
        });
      }
    }

    close();
  }, [
    currentItem,
    cartItem,
    menuItem,
    menuItemForModifiers,
    modifierSelections,
    quantity,
    notes,
    total,
    mode,
    close,
    addItemToActiveOrder,
    updateItemInActiveOrder,
    generateCartItemId,
  ]);

  const handleCancel = useCallback(() => {
    // Remove draft item if we're in add mode (not edit mode)
    if (
      mode !== "edit" &&
      !(mode === "fullscreen" && cartItem) &&
      !cartItem &&
      currentItem
    ) {
      const { activeOrderId, orders, removeItemFromActiveOrder } =
        useOrderStore.getState();
      const activeOrder = orders.find((o) => o.id === activeOrderId);

      // Find any draft items for this menu item
      const draftItems = activeOrder?.items.filter(
        (item) => item.isDraft && item.menuItemId === currentItem.id
      );

      // Remove all draft items for this menu item
      if (draftItems && draftItems.length > 0) {
        draftItems.forEach((draftItem) => {
          removeItemFromActiveOrder(draftItem.id);
        });
      }
      // Reset tracker
      lastDraftMenuItemIdRef.current = null;
    }
    close();
  }, [close, mode, cartItem, currentItem]);

  if (cartItem?.kitchen_status === "sent") {
    return (
      <View className="flex-1 bg-[#212121]">
        {/* Header */}
        <View className="flex-row items-center justify-between p-4 border-b border-gray-700 bg-[#212121]">
          <TouchableOpacity onPress={close} className="flex-row items-center">
            <ArrowLeft color="#9CA3AF" size={20} />
            <Text className="text-xl font-medium text-white ml-1.5">
              Back to Bill
            </Text>
          </TouchableOpacity>
        </View>
        {/* Content */}
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
              onPress={close}
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

  const currentCategory = menuItemForModifiers?.modifiers?.find(
    (cat) => cat.id === activeCategory
  );

  return (
    <View className="flex-1 bg-[#212121]">
      {/* Header */}
      <View className="flex-row items-center justify-between p-4 border-b border-gray-700 bg-[#212121]">
        <TouchableOpacity
          onPress={handleCancel}
          className="flex-row items-center"
        >
          <ArrowLeft color="#9CA3AF" size={20} />
          <Text className="text-xl font-medium text-white ml-1.5">
            {mode === "edit" || (mode === "fullscreen" && cartItem)
              ? "Back to Bill"
              : "Back to Menu"}
          </Text>
        </TouchableOpacity>
        <View className="flex-row items-center gap-3">
          <TouchableOpacity
            onPress={handleCancel}
            className="p-2 rounded-full bg-red-600"
          >
            <X color="white" size={20} />
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
        {/* Item Header */}
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

        {/* Modifier Groups */}
        {menuItemForModifiers?.modifiers &&
          menuItemForModifiers.modifiers.length > 0 && (
            <View className="p-4">
              <Text className="text-2xl font-bold text-white mb-3">
                Options
              </Text>
              <View className="flex-row flex-wrap gap-3 mb-4">
                {menuItemForModifiers.modifiers.map((category) => {
                  const hasSelection = Object.values(
                    modifierSelections[category.id] || {}
                  ).some(Boolean);
                  const isActive = activeCategory === category.id;
                  return (
                    <TouchableOpacity
                      key={category.id}
                      onPress={() => setActiveCategory(category.id)}
                      className={`p-3 rounded-xl border-2 min-w-[140px] ${
                        isActive
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
                          <Check
                            color={isActive ? "#FFFFFF" : "#10B981"}
                            size={20}
                          />
                        )}
                      </View>
                      <Text
                        className={`text-base ${
                          category.type === "required"
                            ? "text-red-400"
                            : "text-gray-400"
                        }`}
                      >
                        {category.type}
                      </Text>
                    </TouchableOpacity>
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
                        modifierSelections[currentCategory.id]?.[option.id] ||
                        false;
                      const isUnavailable = option.isAvailable === false;
                      return (
                        <TouchableOpacity
                          key={option.id}
                          disabled={isReadOnly || isUnavailable}
                          onPress={() =>
                            handleModifierToggle(currentCategory.id, option.id)
                          }
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
              onPress={() => setQuantity((q) => Math.max(1, q - 1))}
              className="p-3 border border-gray-600 rounded-full bg-[#303030]"
            >
              <Minus color="#9CA3AF" size={20} />
            </TouchableOpacity>
            <TouchableOpacity
              disabled={isReadOnly}
              onPress={handleQuantityPress}
              className="mx-12 w-14"
            >
              <Text className="text-3xl border rounded-lg p-1 border-gray-600 font-bold text-white text-center">
                {quantity}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={isReadOnly}
              onPress={() => setQuantity((q) => q + 1)}
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
            value={notes}
            onChangeText={setNotes}
            placeholder="No onions..."
            multiline
            maxLength={80}
            className="px-4 py-3 border border-gray-600 rounded-lg bg-[#303030] min-h-[80px] text-xl text-white"
            placeholderTextColor={"#6B7280"}
          />
          <Text className="text-base text-gray-400 mt-1.5 text-right">
            {notes.length}/80
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
        visible={isQuantityModalOpen}
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
              value={quantityInput}
              onChangeText={setQuantityInput}
              keyboardType="numeric"
              autoFocus
              className="p-3 border border-gray-600 rounded-lg bg-[#212121] text-xl text-white text-center mb-4 h-16"
            />
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={handleQuantityCancel}
                className="flex-1 py-3 px-4 bg-gray-600 rounded-lg"
              >
                <Text className="text-lg font-semibold text-white text-center">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleQuantitySubmit}
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
    </View>
  );
};

export default ModifierScreen;
