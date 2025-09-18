import { MOCK_MENU_ITEMS } from "@/lib/mockData";
import { useMenuStore } from "@/stores/useMenuStore";
import { useModifierSidebarStore } from "@/stores/useModifierSidebarStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { ArrowLeft, Check, Minus, Plus, X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
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
  const { addItemToActiveOrder, updateItemInActiveOrder, confirmDraftItem } =
    useOrderStore();
  const { getItemPriceForCategory, menuItems } = useMenuStore();
  // Internal state for the form
  const [quantity, setQuantity] = useState(1);
  const [modifierSelections, setModifierSelections] =
    useState<ModifierSelection>({});
  const [notes, setNotes] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const isReadOnly = mode === "view";

  const currentItem =
    mode === "edit" || (mode === "fullscreen" && cartItem)
      ? cartItem
      : menuItem;
  const isFullscreen = mode === "fullscreen";
  // Get the correct price for the current item based on category
  const getCurrentItemPrice = useCallback(
    (item: any) => {
      if (!item) return 0;

      // If we have a categoryId and the item has custom pricing, use it
      if (categoryId && getItemPriceForCategory) {
        return getItemPriceForCategory(item?.id.split('_')[0] || '', categoryId);
      }

      // Otherwise use the default price
      return item.price || 0;
    },
    [getItemPriceForCategory, categoryId]
  );

  // Get the menu item for modifier access (either directly or from cart item)
  const menuItemForModifiers =
    (mode === "edit" || (mode === "fullscreen" && cartItem)) && cartItem
      ? menuItems?.find((item) => item.id === cartItem.menuItemId)
      : menuItem;

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
        const itemPrice = getCurrentItemPrice(currentItem);
        const draftItem = {
          id: `draft_${currentItem.id}_${Date.now()}`,
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
    if (!currentItem) return;

    // Validate required selections (only if modifiers exist)
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

    if ((mode === "edit" || (mode === "fullscreen" && cartItem)) && cartItem) {
      // Update existing item (both sidebar edit and fullscreen edit)
      const updatedItem = {
        ...cartItem,
        quantity,
        // price is per-unit
        price: total / Math.max(1, quantity),
        customizations: {
          ...cartItem.customizations,
          modifiers: selectedModifiers,
          notes,
        },
      };
      updateItemInActiveOrder(updatedItem);
    } else if (cartItem && cartItem.isDraft) {
      // Update draft item and confirm it
      const updatedItem = {
        ...cartItem,
        quantity,
        // price is per-unit
        price: total / Math.max(1, quantity),
        isDraft: false, // Confirm the item
        customizations: {
          ...cartItem.customizations,
          modifiers: selectedModifiers,
          notes,
        },
      };
      updateItemInActiveOrder(updatedItem);
    } else {
      // Update the existing draft item to confirmed
      const {
        activeOrderId,
        orders,
        addItemToActiveOrder,
        removeItemFromActiveOrder,
      } = useOrderStore.getState();
      const activeOrder = orders.find((o) => o.id === activeOrderId);
      const draftItem = activeOrder?.items.find((item) =>
        item.id.startsWith(`draft_${currentItem.id}_`)
      );
      

      if (draftItem) {
        // Remove the draft item first
        removeItemFromActiveOrder(draftItem.id);

        // Add the confirmed item with a new ID
        const confirmedItem = {
          ...draftItem,
          id: `${currentItem.id}_${Date.now()}`, // New ID for confirmed item
          quantity,
          // price is per-unit
          price: total / Math.max(1, quantity),
          isDraft: false, // Confirm the item
          customizations: {
            modifiers: selectedModifiers,
            notes,
          },
        };
        addItemToActiveOrder(confirmedItem);
      }
    }

    const message =
      mode === "edit" || (mode === "fullscreen" && cartItem)
        ? "Updated"
        : cartItem && cartItem.isDraft
          ? "Confirmed"
          : "Added";

    toast.success(`${message} ${currentItem.name} ${total.toFixed(2)}`, {
      duration: 4000,
      position: ToastPosition.BOTTOM,
    });

    close();
  }, [
    currentItem,
    modifierSelections,
    quantity,
    notes,
    total,
    mode,
    cartItem,
    close,
    addItemToActiveOrder,
    updateItemInActiveOrder,
    menuItemForModifiers,
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
      const draftItem = activeOrder?.items.find((item) =>
        item.id.startsWith(`draft_${currentItem.id}_`)
      );

      if (draftItem) {
        removeItemFromActiveOrder(draftItem.id);
      }
    }
    close();
  }, [close, mode, cartItem, currentItem]);

  if (!isOpen || !currentItem) return null;

  const currentCategory = menuItemForModifiers?.modifiers?.find(
    (cat) => cat.id === activeCategory
  );

  return (
    <View className="flex-1 bg-[#212121]">
      {/* Header */}
      <View className="flex-row items-center justify-between p-6 border-b border-gray-700 bg-[#212121]">
        <TouchableOpacity
          onPress={handleCancel}
          className="flex-row items-center"
        >
          <ArrowLeft color="#9CA3AF" size={24} />
          <Text className="text-2xl font-medium text-white ml-2">
            {mode === "edit" || (mode === "fullscreen" && cartItem)
              ? "Back to Bill"
              : "Back to Menu"}
          </Text>
        </TouchableOpacity>

        <View className="flex-row items-center gap-4">
          <TouchableOpacity
            onPress={handleCancel}
            className="p-3 rounded-full bg-red-600"
          >
            <X color="white" size={24} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            className="p-3 rounded-full gap-x-2 flex-row items-center justify-center bg-green-500"
          >
            <Text className="text-white text-xl font-semibold">Done</Text>
            <Check color="#FFFFFF" size={24} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Item Header */}
        <View className="p-6 border-b border-gray-700">
          <View className="flex-row items-center gap-4">
            <Image
              source={require("@/assets/images/classic_burger.png")}
              className="w-24 h-24 rounded-lg"
            />
            <View className="flex-1">
              <Text className="text-3xl font-bold text-white">
                {currentItem.name}
              </Text>
              <Text className="text-xl text-gray-400 mt-1">
                {menuItemForModifiers?.description}
              </Text>
              <Text className="text-2xl font-semibold text-blue-400 mt-2">
                Base ${getCurrentItemPrice(currentItem).toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        {/* Modifier Groups */}
        {menuItemForModifiers?.modifiers &&
          menuItemForModifiers.modifiers.length > 0 && (
            <View className="p-6">
              <Text className="text-3xl font-bold text-white mb-4">
                Modifier Options
              </Text>

              {/* Modifier Category Cards */}
              <View className="flex-row flex-wrap gap-4 mb-6">
                {menuItemForModifiers.modifiers.map((category) => {
                  const hasSelection = Object.values(
                    modifierSelections[category.id] || {}
                  ).some(Boolean);
                  const isActive = activeCategory === category.id;

                  return (
                    <TouchableOpacity
                      key={category.id}
                      onPress={() => setActiveCategory(category.id)}
                      className={`p-4 rounded-xl border-2 min-w-[160px] ${isActive
                        ? "bg-blue-600 border-blue-400"
                        : hasSelection
                          ? "bg-green-600 border-green-400"
                          : "bg-[#303030] border-gray-600"
                        }`}
                    >
                      <View className="flex-row items-center justify-between mb-2">
                        <Text
                          className={`font-semibold text-xl ${isActive ? "text-white" : "text-white"
                            }`}
                        >
                          {category.name}
                        </Text>
                        {hasSelection && (
                          <Check
                            color={isActive ? "#FFFFFF" : "#10B981"}
                            size={24}
                          />
                        )}
                      </View>
                      <Text
                        className={`text-lg ${category.type === "required"
                          ? "text-red-400"
                          : "text-gray-400"
                          }`}
                      >
                        {category.type === "required" ? "Required" : "Optional"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Active Category Options */}
              {currentCategory && (
                <View className="mb-6">
                  <View className="flex-row items-center justify-between mb-4">
                    <Text className="text-2xl font-semibold text-white">
                      {currentCategory.name}
                    </Text>
                    <View className="flex-row items-center gap-3">
                      <Text className="text-xl text-red-400">
                        {currentCategory.type === "required"
                          ? "Required"
                          : "Optional"}
                      </Text>
                      <Text className="text-xl text-gray-400">
                        {currentCategory.selectionType === "single"
                          ? "Single select"
                          : "Multiple select"}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row flex-wrap gap-4">
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
                          className={`p-6 rounded-xl border-2 min-w-[140px] ${isSelected
                            ? "bg-blue-600 border-blue-400"
                            : isUnavailable
                              ? "bg-[#1a1a1a] border-gray-700"
                              : "bg-[#303030] border-gray-600"
                            }`}
                        >
                          <Text
                            className={`text-2xl font-medium text-center ${isSelected
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
                              className={`text-xl text-center mt-1 ${isSelected ? "text-blue-200" : "text-blue-400"
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

        {/* Quantity */}
        <View className="p-6 border-b border-gray-700">
          <Text className="text-2xl font-semibold text-white mb-4">
            Quantity
          </Text>
          <View className="flex-row items-center justify-center">
            <TouchableOpacity
              disabled={isReadOnly}
              onPress={() => setQuantity((q) => Math.max(1, q - 1))}
              className="p-4 border border-gray-600 rounded-full bg-[#303030]"
            >
              <Minus color="#9CA3AF" size={24} />
            </TouchableOpacity>
            <Text className="text-4xl font-bold text-white mx-16 w-16 text-center">
              {quantity}
            </Text>
            <TouchableOpacity
              disabled={isReadOnly}
              onPress={() => setQuantity((q) => q + 1)}
              className="p-4 bg-blue-500 rounded-full"
            >
              <Plus color="#FFFFFF" size={24} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Notes */}
        <View className="p-6 border-b border-gray-700">
          <Text className="text-2xl font-semibold text-white mb-4">
            Notes (optional)
          </Text>
          <TextInput
            editable={!isReadOnly}
            value={notes}
            onChangeText={setNotes}
            placeholder="No onions, cut in half..."
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={80}
            className="p-6 border border-gray-600 rounded-lg bg-[#303030] min-h-[100px] text-2xl text-white"
          />
          <Text className="text-lg text-gray-400 mt-2 text-right">
            {notes.length}/80
          </Text>
        </View>

        {/* Allergens */}
        {menuItemForModifiers?.allergens &&
          menuItemForModifiers.allergens.length > 0 && (
            <View className="p-6 border-b border-gray-700">
              <Text className="text-2xl font-semibold text-white mb-4">
                Allergens
              </Text>
              <View className="flex-row flex-wrap gap-3">
                {menuItemForModifiers.allergens.map((allergen) => (
                  <View
                    key={allergen}
                    className="px-4 py-3 bg-red-900 rounded-full"
                  >
                    <Text className="text-xl text-red-300">{allergen}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

        {/* Total */}
        <View className="p-6">
          <View className="flex-row justify-between items-center bg-[#303030] p-6 rounded-lg">
            <Text className="text-3xl font-semibold text-white">Total</Text>
            <Text className="text-4xl font-bold text-white">
              ${total.toFixed(2)}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

export default ModifierScreen;
